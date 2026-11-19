// Template resize engine (spec/builder/features/object-templates.md#resizing-per-axis, D17).
// Format-neutral: the caller supplies node meshes already in template root space (glTF meters, +Y up,
// front +Z, node transforms applied) with each node's Homeplan rule. The engine
//   1. expands counted repeats in natural space: copies sit at k × offset; a repeat whose count differs
//      from the template default "grows" by (count − default) × offset, which shifts nodes that
//      `follows` it and lengthens nodes that `extendsWith` it;
//   2. maps each axis from the grown bounds to the target size: `fixed` keeps it, `scale` stretches it
//      uniformly, `slice` keeps the start/end bands (or sets them from band parameters) and stretches the
//      middle, `fitHostDepth` stretches the middle depth band to the host wall depth;
//   3. applies node rules per axis: no rule → vertices follow the slices; `stretch` → the node's extent is
//      mapped through the axis (affine); otherwise rigid → translated by its `pin` side (start, center,
//      end of the axis) or, unpinned, by where its center maps; `fill` repeats then copy the node across
//      the remaining middle band;
//   4. applies `size` (the part's extent per axis, scaled about its own centre), then copies `fill` repeats;
//      the union of every part (hidden ones included) is now the **layout**: the object's size, bounds,
//      opening, wall position, flip centres, and contact frame come from it, so states and options never
//      move the object;
//   5. applies the pose rules (D26) per part: `visible` (hidden parts are dropped), `rotate` (about a pivot
//      of the part's own bounds, each copy's own with `perCopy`, or the layout's), then `translate`; with a
//      `pose` blend (Phase 10.2, animated state changes) every pose number is the weighted mean of its value
//      under each weighted parameter set and a part is visible when the sets showing it weigh at least half;
//   6. applies allowed flips (mirror x about the center; z about the wall center for a Wallable, else the
//      object center; a `face: "interior"` part is not mirrored in z), reversing triangle winding for an odd
//      number of mirrors;
//   7. moves the result into the contact frame (see TemplateResizeSuccess).
// Formulas (rule fields given as text) read the resolved parameters, the named `formulas`, sizeX/sizeY/
// sizeZ (requested axis sizes, mm), and hostDepthMm; see templateFormulaValues.
import {
  evaluateFormula,
  orderNamedFormulas,
  resolveBoolean,
  resolveNumber,
} from "@shared/domain/templates/formula";
import type { BooleanOrFormula, FormulaValue, NumberOrFormula } from "@shared/domain/templates/formula";
import {
  axes,
  axisSizeParameter,
  defaultInstanceParameters,
  isContactFace,
  isRuledNode,
} from "@shared/domain/templates/metadata";
import type {
  Axis,
  AxisResize,
  NodeRule,
  PivotAxis,
  RepeatCount,
  TemplateMetadata,
  TemplateParameterValue,
} from "@shared/domain/templates/metadata";

/** Meters, glTF axes. */
export type TemplateVec3 = readonly [number, number, number];

export type TemplateMeshInput = Readonly<{
  /** xyz triples in meters, template root space (node transforms applied). */
  positions: Float32Array;
  normals?: Float32Array | null;
  uvs?: Float32Array | null;
  /** Triangle list; null or absent means non-indexed. */
  indices?: Uint32Array | Uint16Array | null;
  materialName: string | null;
}>;

export type TemplateNodeInput = Readonly<{
  name: string;
  /** Node origin in template root space; needed for mesh-less nodes (anchors, punctual lights). */
  origin?: TemplateVec3;
  meshes: readonly TemplateMeshInput[];
  /** The nearest Homeplan node rule (the node's own or an ancestor's). */
  rule?: NodeRule;
}>;

export type TemplateGeometryInput = Readonly<{ nodes: readonly TemplateNodeInput[] }>;

export type TemplateResizeOptions = Readonly<{
  /** Instance parameters (widthMm, heightMm, depthMm, stepCount, …); missing ones use template defaults. */
  parameters?: Readonly<Record<string, TemplateParameterValue>>;
  /** Host wall depth for `fitHostDepth` and interior/exterior `wallPosition`. */
  hostDepthMm?: number;
  flip?: Readonly<{ x: boolean; z: boolean }>;
  /**
   * Pose blend (Phase 10.2): weighted parameter sets for the pose rules only (`visible`, `rotate` angle and
   * pivot offsets, `translate`); steps 1–4 (the layout) use `parameters`. Absent or empty → `parameters`.
   * An animation from A to B at eased progress e passes [{ A, 1 − e }, { B, e }]: rotate angles and
   * translations ease between the two poses and a visibility switch happens at the midpoint, also where the
   * pose is driven by a boolean or a choice through a formula.
   */
  pose?: readonly TemplatePoseWeight[];
}>;

/** One weighted parameter set of a pose blend (missing parameters use the template defaults). */
export type TemplatePoseWeight = Readonly<{
  parameters: Readonly<Record<string, TemplateParameterValue>>;
  weight: number;
}>;

export type ResizedMesh = Readonly<{
  nodeName: string;
  /** 0 for the authored node, 1… for repeat copies. */
  copyIndex: number;
  materialName: string | null;
  positions: Float32Array;
  normals: Float32Array | null;
  uvs: Float32Array | null;
  indices: Uint32Array;
}>;

export type ResizedNodePoint = Readonly<{ nodeName: string; copyIndex: number; position: TemplateVec3 }>;

export type ResizedLinearEmitter = Readonly<{
  nodeName: string;
  copyIndex: number;
  boundsMin: TemplateVec3;
  boundsMax: TemplateVec3;
}>;

export type TemplateSizeMm = Readonly<{ x: number; y: number; z: number }>;

export type TemplateBoundsMm = Readonly<{ min: TemplateSizeMm; max: TemplateSizeMm }>;

/**
 * Output in the **contact frame** (meters): x = 0 at the horizontal center; for a Wallable y = 0 at the
 * bottom and z = 0 at the host wall's center plane with +z toward the host side (interior); otherwise the
 * contact point is the origin (`back`: bottom-center of the back face, `bottom`: bottom center, `top`: top
 * center, anchor node: that node's origin). Front stays +Z.
 */
export type TemplateResizeSuccess = Readonly<{
  ok: true;
  meshes: readonly ResizedMesh[];
  /** Origins of nodes that declared one (lights, anchors), per copy. */
  nodeOrigins: readonly ResizedNodePoint[];
  linearEmitters: readonly ResizedLinearEmitter[];
  sizeMm: TemplateSizeMm;
  boundsMm: TemplateBoundsMm;
  /** Wallable only: the opening rectangle in the contact frame's x/y plane (mm), clearance included. */
  openingMm: Readonly<{ minX: number; maxX: number; minY: number; maxY: number }> | null;
  /** Resolved parameters (defaults filled in) and counted repeat counts by node name. */
  parameters: Readonly<Record<string, TemplateParameterValue>>;
  repeatCounts: Readonly<Record<string, number>>;
}>;

export type TemplateResizeIssue = Readonly<{
  code: "parameter" | "range" | "host" | "geometry" | "flip" | "formula";
  message: string;
}>;

export type TemplateResizeResult =
  TemplateResizeSuccess | Readonly<{ ok: false; issues: readonly TemplateResizeIssue[] }>;

const epsilon = 1e-9;
const axisIndex: Readonly<Record<Axis, 0 | 1 | 2>> = { x: 0, y: 1, z: 2 };

type WorkMesh = {
  readonly source: TemplateMeshInput;
  positions: Float64Array;
  normals: Float64Array | null;
};

type Part = {
  readonly nodeName: string;
  readonly copyIndex: number;
  readonly rule: NodeRule | undefined;
  readonly meshes: WorkMesh[];
  origin: [number, number, number] | null;
};

/** Piecewise-linear map of one axis: [start band | middle | end band]. */
type AxisMap = Readonly<{
  src0: number;
  size: number;
  s0: number;
  s1: number;
  s0t: number;
  s1t: number;
  middle: number;
  middleTarget: number;
  target: number;
}>;

const mapCoordinate = (map: AxisMap, value: number): number => {
  const rel = value - map.src0;
  if (rel <= map.s0) return map.src0 + (map.s0 > epsilon ? (rel * map.s0t) / map.s0 : rel);
  if (rel >= map.size - map.s1)
    return map.src0 + map.target - (map.size - rel) * (map.s1 > epsilon ? map.s1t / map.s1 : 1);
  return map.src0 + map.s0t + (rel - map.s0) * (map.middle > epsilon ? map.middleTarget / map.middle : 1);
};

/** Slope of the map at a coordinate; band boundaries count as middle (their faces are axis-aligned there). */
const mapSlope = (map: AxisMap, value: number): number => {
  const rel = value - map.src0;
  if (rel < map.s0 - epsilon) return map.s0 > epsilon ? map.s0t / map.s0 : 1;
  if (rel > map.size - map.s1 + epsilon) return map.s1 > epsilon ? map.s1t / map.s1 : 1;
  return map.middle > epsilon ? map.middleTarget / map.middle : 1;
};

const numberParameter = (
  parameters: Readonly<Record<string, TemplateParameterValue>>,
  name: string,
): number | undefined => {
  const value = parameters[name];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

/** At most this many copies of one repeated node. */
export const maxRepeatCopies = 1000;

type Values = Readonly<Record<string, FormulaValue>>;
type Outcome<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; message: string }>;

/** A counted repeat's count (`"fill"` excluded): parameter form, whole number, or formula; floored, ≥ 0. */
const repeatCountOf = (count: Exclude<RepeatCount, "fill">, values: Values): Outcome<number> => {
  let raw: number;
  if (typeof count === "object") {
    const value = values[count.parameter];
    if (typeof value !== "number" || !Number.isFinite(value))
      return { ok: false, message: `${count.parameter} must be a number` };
    raw = value * (count.factor ?? 1) + (count.add ?? 0);
  } else {
    const result = resolveNumber(count, values);
    if (!result.ok) return result;
    raw = result.value;
  }
  const floored = Math.max(0, Math.floor(raw + 1e-6));
  return floored > maxRepeatCopies
    ? { ok: false, message: `${floored} copies is more than ${maxRepeatCopies}` }
    : { ok: true, value: floored };
};

type NumberResolver = (field: NumberOrFormula) => Outcome<number>;

/** Evaluates per-axis number-or-formula fields given in mm, returning meters (absent axes are 0). */
const vectorMeters = (
  vector: Readonly<{ x?: NumberOrFormula; y?: NumberOrFormula; z?: NumberOrFormula }> | undefined,
  values: Values | NumberResolver,
): Outcome<[number, number, number]> => {
  const result: [number, number, number] = [0, 0, 0];
  if (vector === undefined) return { ok: true, value: result };
  const resolve: NumberResolver =
    typeof values === "function" ? values : (field) => resolveNumber(field, values);
  for (const axis of axes) {
    const field = vector[axis];
    if (field === undefined) continue;
    const value = resolve(field);
    if (!value.ok) return { ok: false, message: `${axis}: ${value.message}` };
    result[axisIndex[axis]] = value.value / 1000;
  }
  return { ok: true, value: result };
};

const partRange = (part: Part, axis: 0 | 1 | 2): { lo: number; hi: number } | null => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const mesh of part.meshes) {
    for (let i = axis; i < mesh.positions.length; i += 3) {
      const value = mesh.positions[i] ?? 0;
      if (value < lo) lo = value;
      if (value > hi) hi = value;
    }
  }
  // A node origin counts only for mesh-less nodes (anchors, lights): a mesh node's origin can lie anywhere.
  if (part.origin !== null && lo > hi) {
    lo = Math.min(lo, part.origin[axis]);
    hi = Math.max(hi, part.origin[axis]);
  }
  return lo <= hi ? { lo, hi } : null;
};

/** Applies x' = a·x + b on one axis to a part (positions, origin, normals). */
const affinePart = (part: Part, axis: 0 | 1 | 2, scale: number, shift: number): void => {
  for (const mesh of part.meshes) {
    for (let i = axis; i < mesh.positions.length; i += 3)
      mesh.positions[i] = scale * (mesh.positions[i] ?? 0) + shift;
    if (mesh.normals !== null && scale !== 1) {
      for (let i = axis; i < mesh.normals.length; i += 3) mesh.normals[i] = (mesh.normals[i] ?? 0) / scale;
    }
  }
  if (part.origin !== null) part.origin[axis] = scale * part.origin[axis] + shift;
};

const clonePart = (part: Part, copyIndex: number): Part => ({
  nodeName: part.nodeName,
  copyIndex,
  rule: part.rule,
  meshes: part.meshes.map((mesh) => ({
    source: mesh.source,
    positions: new Float64Array(mesh.positions),
    normals: mesh.normals === null ? null : new Float64Array(mesh.normals),
  })),
  origin: part.origin === null ? null : [part.origin[0], part.origin[1], part.origin[2]],
});

const toVec = (values: readonly number[]): TemplateVec3 => [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];

type Bounds = { min: [number, number, number]; max: [number, number, number] };

const unionBounds = (parts: readonly Part[]): Bounds | null => {
  const bounds: Bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const part of parts) {
    for (const axis of [0, 1, 2] as const) {
      const range = partRange(part, axis);
      if (range === null) continue;
      bounds.min[axis] = Math.min(bounds.min[axis], range.lo);
      bounds.max[axis] = Math.max(bounds.max[axis], range.hi);
    }
  }
  return bounds.min[0] <= bounds.max[0] ? bounds : null;
};

type AxisPlan = Readonly<{ map: AxisMap; issues: readonly TemplateResizeIssue[] }>;

const planAxis = (
  axis: Axis,
  resize: AxisResize,
  src0: number,
  size: number,
  parameters: Readonly<Record<string, TemplateParameterValue>>,
  hostDepthMm: number | undefined,
): AxisPlan => {
  const issues: TemplateResizeIssue[] = [];
  const identity: AxisMap = {
    src0,
    size,
    s0: 0,
    s1: 0,
    s0t: 0,
    s1t: 0,
    middle: size,
    middleTarget: size,
    target: size,
  };
  const sizeParameter = axisSizeParameter(axis, resize);
  let requested: number | undefined;
  if (sizeParameter !== null) {
    const value = numberParameter(parameters, sizeParameter);
    if (value === undefined || value <= 0) {
      issues.push({ code: "parameter", message: `${sizeParameter} must be a positive number` });
      return { map: identity, issues };
    }
    if (
      (resize.minMm !== undefined && value < resize.minMm - 1e-6) ||
      (resize.maxMm !== undefined && value > resize.maxMm + 1e-6)
    )
      issues.push({
        code: "range",
        message: `${sizeParameter} ${value} mm is outside ${resize.minMm ?? 0}..${resize.maxMm ?? "∞"} mm`,
      });
    requested = value / 1000;
  }
  switch (resize.mode) {
    case "fixed":
      return { map: identity, issues };
    case "scale": {
      const target = requested ?? size;
      return { map: { ...identity, middleTarget: target, target }, issues };
    }
    case "slice":
    case "fitHostDepth": {
      const s0 = (resize.startMm ?? 0) / 1000;
      const s1 = (resize.endMm ?? 0) / 1000;
      const bandTarget = (name: string | undefined, natural: number): number => {
        if (name === undefined) return natural;
        const value = numberParameter(parameters, name);
        if (value === undefined || value < 0) {
          issues.push({ code: "parameter", message: `${name} must be a non-negative number` });
          return natural;
        }
        return value / 1000;
      };
      const s0t = bandTarget(resize.startParameter, s0);
      const s1t = bandTarget(resize.endParameter, s1);
      const middle = size - s0 - s1;
      let middleTarget: number;
      if (resize.mode === "fitHostDepth") {
        if (hostDepthMm === undefined || !(hostDepthMm > 0)) {
          issues.push({ code: "host", message: "fitHostDepth needs the host wall depth" });
          return { map: identity, issues };
        }
        middleTarget = hostDepthMm / 1000;
      } else {
        middleTarget = requested === undefined ? middle : requested - s0t - s1t;
      }
      if (middleTarget < -1e-9) {
        issues.push({
          code: "range",
          message: `Axis ${axis} is smaller than its slice bands (${Math.round((s0t + s1t) * 1000)} mm)`,
        });
        return { map: identity, issues };
      }
      if (middle <= epsilon && Math.abs(middleTarget - Math.max(middle, 0)) > 1e-7) {
        issues.push({ code: "geometry", message: `Axis ${axis} has no middle band to stretch` });
        return { map: identity, issues };
      }
      const clampedMiddle = Math.max(0, middleTarget);
      return {
        map: {
          src0,
          size,
          s0,
          s1,
          s0t,
          s1t,
          middle: Math.max(middle, 0),
          middleTarget: clampedMiddle,
          target: s0t + clampedMiddle + s1t,
        },
        issues,
      };
    }
  }
};

const ruleStretches = (rule: NodeRule | undefined, axis: Axis): boolean => rule?.stretch?.[axis] === true;

/** Maps one part through the three axis maps according to its rule. */
const mapPart = (part: Part, maps: Readonly<Record<Axis, AxisMap>>): void => {
  const ruled = isRuledNode(part.rule);
  for (const axis of axes) {
    const index = axisIndex[axis];
    const map = maps[axis];
    if (!ruled) {
      for (const mesh of part.meshes) {
        if (mesh.normals !== null) {
          for (let i = index; i < mesh.normals.length; i += 3)
            mesh.normals[i] = (mesh.normals[i] ?? 0) / mapSlope(map, mesh.positions[i] ?? 0);
        }
        for (let i = index; i < mesh.positions.length; i += 3)
          mesh.positions[i] = mapCoordinate(map, mesh.positions[i] ?? 0);
      }
      if (part.origin !== null) part.origin[index] = mapCoordinate(map, part.origin[index]);
      continue;
    }
    const range = partRange(part, index);
    if (range === null) continue;
    if (ruleStretches(part.rule, axis) && range.hi - range.lo > epsilon) {
      const lo = mapCoordinate(map, range.lo);
      const hi = mapCoordinate(map, range.hi);
      const scale = (hi - lo) / (range.hi - range.lo);
      affinePart(part, index, scale, lo - scale * range.lo);
      continue;
    }
    const pin = part.rule?.pin?.[axis];
    const center = (range.lo + range.hi) / 2;
    const delta =
      pin === "start"
        ? 0
        : pin === "end"
          ? map.target - map.size
          : pin === "center"
            ? (map.target - map.size) / 2
            : mapCoordinate(map, center) - center;
    affinePart(part, index, 1, delta);
  }
};

const fillCopies = (
  part: Part,
  maps: Readonly<Record<Axis, AxisMap>>,
  offset: readonly [number, number, number],
): Part[] => {
  let dominant: 0 | 1 | 2 = 0;
  for (const index of [1, 2] as const)
    if (Math.abs(offset[index]) > Math.abs(offset[dominant])) dominant = index;
  const step = offset[dominant];
  const range = partRange(part, dominant);
  if (range === null || Math.abs(step) <= epsilon) return [];
  const map = maps[axes[dominant] ?? "x"];
  const middleStart = map.src0 + map.s0t;
  const middleEnd = middleStart + map.middleTarget;
  const extra = Math.min(
    maxRepeatCopies,
    step > 0
      ? Math.floor((middleEnd - range.hi) / step + 1e-6)
      : Math.floor((range.lo - middleStart) / -step + 1e-6),
  );
  const copies: Part[] = [];
  for (let k = 1; k <= extra; k += 1) {
    const copy = clonePart(part, k);
    for (const index of [0, 1, 2] as const)
      if (offset[index] !== 0) affinePart(copy, index, 1, k * offset[index]);
    copies.push(copy);
  }
  return copies;
};

/** Applies p' = R·(p − pivot) + pivot + shift to a part (positions, normals, origin). */
const rigidPart = (
  part: Part,
  rotation: readonly number[],
  pivot: readonly [number, number, number],
  shift: readonly [number, number, number],
): void => {
  const [r00 = 1, r01 = 0, r02 = 0, r10 = 0, r11 = 1, r12 = 0, r20 = 0, r21 = 0, r22 = 1] = rotation;
  const apply = (array: Float64Array | [number, number, number], i: number, point: boolean): void => {
    const x = (array[i] ?? 0) - (point ? pivot[0] : 0);
    const y = (array[i + 1] ?? 0) - (point ? pivot[1] : 0);
    const z = (array[i + 2] ?? 0) - (point ? pivot[2] : 0);
    array[i] = r00 * x + r01 * y + r02 * z + (point ? pivot[0] + shift[0] : 0);
    array[i + 1] = r10 * x + r11 * y + r12 * z + (point ? pivot[1] + shift[1] : 0);
    array[i + 2] = r20 * x + r21 * y + r22 * z + (point ? pivot[2] + shift[2] : 0);
  };
  for (const mesh of part.meshes) {
    for (let i = 0; i + 2 < mesh.positions.length; i += 3) apply(mesh.positions, i, true);
    if (mesh.normals !== null)
      for (let i = 0; i + 2 < mesh.normals.length; i += 3) apply(mesh.normals, i, false);
  }
  if (part.origin !== null) apply(part.origin, 0, true);
};

/** Rotation matrix (row-major 3×3), right-hand rule about the positive axis. */
const rotationMatrix = (axis: Axis, degrees: number): number[] => {
  const radians = (degrees * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  if (axis === "x") return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === "y") return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};

const anchorOf = (lo: number, hi: number, at: "start" | "center" | "end"): number =>
  at === "start" ? lo : at === "end" ? hi : (lo + hi) / 2;

/**
 * The resolved values formulas read: the parameters, sizeX/sizeY/sizeZ (requested axis sizes in mm),
 * hostDepthMm (0 without a host), and the named `formulas` in dependency order. `naturalMm` is the authored
 * size per axis. Named formulas that fail are reported and left out.
 */
export const templateFormulaValues = (
  metadata: TemplateMetadata,
  parameters: Readonly<Record<string, TemplateParameterValue>>,
  naturalMm: readonly [number, number, number],
  hostDepthMm: number | undefined,
  issues: TemplateResizeIssue[],
): Record<string, FormulaValue> => {
  const values: Record<string, FormulaValue> = { ...parameters };
  const sizeNames = { x: "sizeX", y: "sizeY", z: "sizeZ" } as const;
  for (const axis of axes) {
    const resize = metadata.resize[axis];
    const name = axisSizeParameter(axis, resize);
    const requested = name === null ? undefined : numberParameter(parameters, name);
    let size = requested ?? naturalMm[axisIndex[axis]];
    if (resize.mode === "fitHostDepth" && hostDepthMm !== undefined && hostDepthMm > 0)
      size = hostDepthMm + (resize.startMm ?? 0) + (resize.endMm ?? 0);
    values[sizeNames[axis]] = size;
  }
  values.hostDepthMm = hostDepthMm !== undefined && hostDepthMm > 0 ? hostDepthMm : 0;
  const formulas = metadata.formulas ?? {};
  const ordering = orderNamedFormulas(formulas);
  if (!ordering.ok) {
    issues.push({ code: "formula", message: `Formulas form a cycle: ${ordering.cycle.join(" → ")}` });
    return values;
  }
  for (const name of ordering.order) {
    const result = evaluateFormula(formulas[name] ?? "", values);
    if (result.ok) values[name] = result.value;
    else issues.push({ code: "formula", message: `Formula ${name}: ${result.message}` });
  }
  return values;
};

const naturalSizeMm = (input: TemplateGeometryInput): [number, number, number] => {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const include = (axis: number, value: number): void => {
    lo[axis] = Math.min(lo[axis] ?? Infinity, value);
    hi[axis] = Math.max(hi[axis] ?? -Infinity, value);
  };
  for (const node of input.nodes) {
    for (const mesh of node.meshes)
      for (let i = 0; i + 2 < mesh.positions.length; i += 3)
        for (const axis of [0, 1, 2]) include(axis, mesh.positions[i + axis] ?? 0);
    if (node.meshes.length === 0 && node.origin !== undefined)
      for (const axis of [0, 1, 2]) include(axis, node.origin[axis] ?? 0);
  }
  const size = (axis: number): number => {
    const extent = (hi[axis] ?? 0) - (lo[axis] ?? 0);
    return Number.isFinite(extent) ? Math.round(extent * 1e6) / 1e3 : 0;
  };
  return [size(0), size(1), size(2)];
};

/** Resizes a template's geometry for one instance. Positions in, positions out: meters. */
export const templateResize = (
  input: TemplateGeometryInput,
  metadata: TemplateMetadata,
  options: TemplateResizeOptions = {},
): TemplateResizeResult => {
  const issues: TemplateResizeIssue[] = [];
  const defaults = defaultInstanceParameters(metadata);
  const parameters: Record<string, TemplateParameterValue> = { ...defaults, ...(options.parameters ?? {}) };
  const flipX = options.flip?.x === true;
  const flipZ = options.flip?.z === true;
  if ((flipX && !metadata.flip.x) || (flipZ && !metadata.flip.z))
    issues.push({ code: "flip", message: "The template does not allow this flip" });
  const natural = naturalSizeMm(input);
  const values = templateFormulaValues(metadata, parameters, natural, options.hostDepthMm, issues);
  const referenceValues = templateFormulaValues(metadata, defaults, natural, options.hostDepthMm, []);
  const ruleIssue = (name: string, what: string, message: string): void => {
    issues.push({ code: "formula", message: `${name} ${what}: ${message}` });
  };

  // 1. Counted repeats and their growth.
  const rules = new Map<string, NodeRule>();
  for (const node of input.nodes) if (node.rule !== undefined) rules.set(node.name, node.rule);
  const repeatCounts: Record<string, number> = {};
  const growth = new Map<string, [number, number, number]>();
  const offsets = new Map<string, [number, number, number]>();
  for (const [name, rule] of rules) {
    const repeat = rule.repeat;
    if (repeat === undefined) continue;
    const offset = vectorMeters(repeat.offsetMm, values);
    if (!offset.ok) {
      ruleIssue(name, "repeat offset", offset.message);
      continue;
    }
    offsets.set(name, offset.value);
    const count = repeat.count;
    if (count === "fill") continue;
    const actual = repeatCountOf(count, values);
    if (!actual.ok) {
      issues.push({ code: typeof count === "object" ? "parameter" : "formula", message: actual.message });
      continue;
    }
    const reference = repeatCountOf(count, referenceValues);
    const referenceCount = reference.ok ? reference.value : actual.value;
    const referenceOffsetResult = vectorMeters(repeat.offsetMm, referenceValues);
    const referenceOffset = referenceOffsetResult.ok ? referenceOffsetResult.value : offset.value;
    repeatCounts[name] = actual.value;
    const grow = (index: 0 | 1 | 2): number => {
      const now = offset.value[index];
      const then = referenceOffset[index];
      return now === then
        ? (actual.value - referenceCount) * now
        : actual.value * now - referenceCount * then;
    };
    growth.set(name, [grow(0), grow(1), grow(2)]);
  }
  const offsetOf = (name: string): [number, number, number] => offsets.get(name) ?? [0, 0, 0];
  const shiftOf = (name: string, depth = 0): [number, number, number] => {
    const target = rules.get(name)?.follows;
    if (target === undefined || depth > input.nodes.length) return [0, 0, 0];
    const own = growth.get(target) ?? [0, 0, 0];
    const further = shiftOf(target, depth + 1);
    return [own[0] + further[0], own[1] + further[1], own[2] + further[2]];
  };

  const parts: Part[] = [];
  for (const node of input.nodes) {
    const base: Part = {
      nodeName: node.name,
      copyIndex: 0,
      rule: node.rule,
      meshes: node.meshes.map((mesh) => ({
        source: mesh,
        positions: Float64Array.from(mesh.positions),
        normals: mesh.normals === undefined || mesh.normals === null ? null : Float64Array.from(mesh.normals),
      })),
      origin: node.origin === undefined ? null : [node.origin[0], node.origin[1], node.origin[2]],
    };
    const shift = shiftOf(node.name);
    for (const index of [0, 1, 2] as const) if (shift[index] !== 0) affinePart(base, index, 1, shift[index]);
    const extendTarget = node.rule?.extendsWith;
    if (extendTarget !== undefined) {
      const extension = growth.get(extendTarget) ?? [0, 0, 0];
      const targetOffset = offsetOf(extendTarget);
      for (const index of [0, 1, 2] as const) {
        const g = extension[index];
        const range = partRange(base, index);
        if (g === 0 || range === null || range.hi - range.lo <= epsilon) continue;
        const extent = range.hi - range.lo;
        const scale = (extent + Math.sign(targetOffset[index]) * g) / extent;
        if (scale <= epsilon) {
          issues.push({ code: "range", message: `${node.name} cannot shrink with ${extendTarget}` });
          continue;
        }
        const pivot = targetOffset[index] >= 0 ? range.lo : range.hi;
        affinePart(base, index, scale, pivot - scale * pivot);
      }
    }
    const count = repeatCounts[node.name];
    if (count === undefined) {
      parts.push(base);
      continue;
    }
    const offset = offsetOf(node.name);
    for (let k = 0; k < count; k += 1) {
      const copy = k === 0 ? base : clonePart(base, k);
      if (k > 0)
        for (const index of [0, 1, 2] as const)
          if (offset[index] !== 0) affinePart(copy, index, 1, k * offset[index]);
      parts.push(copy);
    }
  }

  // 2. Axis maps from the grown bounds.
  const grown = unionBounds(parts);
  if (grown === null)
    return { ok: false, issues: [...issues, { code: "geometry", message: "The template has no geometry" }] };
  const plans = {
    x: planAxis(
      "x",
      metadata.resize.x,
      grown.min[0],
      grown.max[0] - grown.min[0],
      parameters,
      options.hostDepthMm,
    ),
    y: planAxis(
      "y",
      metadata.resize.y,
      grown.min[1],
      grown.max[1] - grown.min[1],
      parameters,
      options.hostDepthMm,
    ),
    z: planAxis(
      "z",
      metadata.resize.z,
      grown.min[2],
      grown.max[2] - grown.min[2],
      parameters,
      options.hostDepthMm,
    ),
  };
  issues.push(...plans.x.issues, ...plans.y.issues, ...plans.z.issues);
  const maps: Record<Axis, AxisMap> = { x: plans.x.map, y: plans.y.map, z: plans.z.map };

  // 3–4. Node rules, sizes, then fill repeats.
  const sizeOf = (part: Part): readonly (number | undefined)[] | null => {
    const size = part.rule?.size;
    if (size === undefined) return null;
    const result: (number | undefined)[] = [undefined, undefined, undefined];
    for (const axis of axes) {
      const field = size[axis];
      if (field === undefined) continue;
      const value = resolveNumber(field, values);
      if (!value.ok) {
        ruleIssue(part.nodeName, `size ${axis}`, value.message);
        return null;
      }
      if (value.value < 0) {
        ruleIssue(part.nodeName, `size ${axis}`, `${value.value} mm is negative`);
        return null;
      }
      result[axisIndex[axis]] = value.value / 1000;
    }
    return result;
  };
  const mapped: Part[] = [];
  for (const part of parts) {
    mapPart(part, maps);
    const size = sizeOf(part);
    if (size !== null) {
      for (const index of [0, 1, 2] as const) {
        const target = size[index];
        const range = partRange(part, index);
        if (target === undefined || range === null) continue;
        const extent = range.hi - range.lo;
        if (extent <= epsilon) {
          if (target > epsilon) ruleIssue(part.nodeName, "size", "a flat part cannot be sized");
          continue;
        }
        const scale = target / extent;
        const center = (range.lo + range.hi) / 2;
        affinePart(part, index, scale, center - scale * center);
      }
    }
    mapped.push(part);
    if (part.rule?.repeat?.count === "fill") mapped.push(...fillCopies(part, maps, offsetOf(part.nodeName)));
  }

  const bounds = unionBounds(mapped);
  if (bounds === null)
    return { ok: false, issues: [...issues, { code: "geometry", message: "The template has no geometry" }] };

  // Wall center plane (Wallable) in mapped coordinates.
  let wallCenter = (bounds.min[2] + bounds.max[2]) / 2;
  if (metadata.contract === "Wallable") {
    const zResize = metadata.resize.z;
    if (zResize.mode === "fitHostDepth") {
      wallCenter = maps.z.src0 + maps.z.s0t + maps.z.middleTarget / 2;
    } else {
      const position = zResize.wallPosition ?? "center";
      const offset = (zResize.wallOffsetMm ?? 0) / 1000;
      const depth = options.hostDepthMm === undefined ? undefined : options.hostDepthMm / 1000;
      if (position === "center") wallCenter = (bounds.min[2] + bounds.max[2]) / 2 - offset;
      else if (depth === undefined || !(depth > 0))
        issues.push({ code: "host", message: `wallPosition ${position} needs the host wall depth` });
      else if (position === "interior") wallCenter = bounds.max[2] - depth / 2 + offset;
      else wallCenter = bounds.min[2] + depth / 2 - offset;
    }
  }

  // An anchor contact is taken from the layout, so a hidden or posed anchor still places the object.
  const contact = metadata.attachment.contact;
  let anchorPoint: [number, number, number] | null = null;
  if (metadata.contract !== "Wallable" && !isContactFace(contact)) {
    const anchor = mapped.find((part) => part.nodeName === contact && part.copyIndex === 0);
    if (anchor === undefined)
      return { ok: false, issues: [{ code: "geometry", message: `Anchor node ${contact} is missing` }] };
    const anchorBounds = unionBounds([anchor]);
    anchorPoint =
      anchor.origin !== null
        ? [anchor.origin[0], anchor.origin[1], anchor.origin[2]]
        : anchorBounds === null
          ? null
          : [
              (anchorBounds.min[0] + anchorBounds.max[0]) / 2,
              (anchorBounds.min[1] + anchorBounds.max[1]) / 2,
              (anchorBounds.min[2] + anchorBounds.max[2]) / 2,
            ];
  }

  // 5. Pose rules: visible, rotate, translate (evaluated once per node), blended over the pose sets.
  const poseSets =
    options.pose === undefined || options.pose.length === 0
      ? [{ values, weight: 1 }]
      : options.pose.map((set) => ({
          values: templateFormulaValues(
            metadata,
            { ...defaults, ...set.parameters },
            natural,
            options.hostDepthMm,
            [],
          ),
          weight: Math.max(0, set.weight),
        }));
  const poseNumber: NumberResolver = (field) => {
    let sum = 0;
    let total = 0;
    for (const set of poseSets) {
      const result = resolveNumber(field, set.values);
      if (!result.ok) return result;
      sum += result.value * set.weight;
      total += set.weight;
    }
    return { ok: true, value: total > 0 ? sum / total : 0 };
  };
  const poseBoolean = (field: BooleanOrFormula): Outcome<boolean> => {
    let shown = 0;
    let total = 0;
    for (const set of poseSets) {
      const result = resolveBoolean(field, set.values);
      if (!result.ok) return result;
      if (result.value) shown += set.weight;
      total += set.weight;
    }
    return { ok: true, value: shown * 2 >= total };
  };
  const visibility = new Map<string, boolean>();
  const posed: Part[] = [];
  for (const part of mapped) {
    const visible = part.rule?.visible;
    if (visible === undefined) {
      posed.push(part);
      continue;
    }
    let shown = visibility.get(part.nodeName);
    if (shown === undefined) {
      const result = poseBoolean(visible);
      if (!result.ok) ruleIssue(part.nodeName, "visible", result.message);
      shown = result.ok ? result.value : true;
      visibility.set(part.nodeName, shown);
    }
    if (shown) posed.push(part);
  }
  const groups = new Map<string, Part[]>();
  for (const part of posed) {
    const list = groups.get(part.nodeName);
    if (list === undefined) groups.set(part.nodeName, [part]);
    else list.push(part);
  }
  for (const [name, group] of groups) {
    const rule = group[0]?.rule;
    if (rule === undefined) continue;
    const rotate = rule.rotate;
    if (rotate !== undefined) {
      const angle = poseNumber(rotate.angleDeg);
      if (!angle.ok) ruleIssue(name, "rotate angleDeg", angle.message);
      else if (angle.value !== 0) {
        const matrix = rotationMatrix(rotate.axis, angle.value);
        const pivotFor = (own: Bounds): [number, number, number] | null => {
          const pivot: [number, number, number] = [0, 0, 0];
          for (const axis of axes) {
            const index = axisIndex[axis];
            const spec: PivotAxis = rotate.pivot?.[axis] ?? "center";
            const at = typeof spec === "string" ? spec : (spec.at ?? "center");
            const source = typeof spec === "object" && spec.of === "template" ? bounds : own;
            let value = anchorOf(source.min[index], source.max[index], at);
            if (typeof spec === "object" && spec.offsetMm !== undefined) {
              const offset = poseNumber(spec.offsetMm);
              if (!offset.ok) {
                ruleIssue(name, `rotate pivot ${axis}`, offset.message);
                return null;
              }
              value += offset.value / 1000;
            }
            pivot[index] = value;
          }
          return pivot;
        };
        const units = rotate.perCopy === true ? group.map((part) => [part]) : [group];
        for (const unit of units) {
          const own = unionBounds(unit);
          const pivot = own === null ? null : pivotFor(own);
          if (pivot === null) continue;
          for (const part of unit) rigidPart(part, matrix, pivot, [0, 0, 0]);
        }
      }
    }
    if (rule.translate !== undefined) {
      const shift = vectorMeters(rule.translate, poseNumber);
      if (!shift.ok) ruleIssue(name, "translate", shift.message);
      else if (shift.value.some((value) => value !== 0))
        for (const part of group) rigidPart(part, [1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0], shift.value);
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  // 6. Flips (about the layout's centres; the layout bounds mirror with them).
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const mirrorZ = metadata.contract === "Wallable" ? wallCenter : (bounds.min[2] + bounds.max[2]) / 2;
  const keepsFace = (part: Part): boolean => part.rule?.face === "interior";
  if (flipX) for (const part of posed) affinePart(part, 0, -1, 2 * centerX);
  if (flipZ) for (const part of posed) if (!keepsFace(part)) affinePart(part, 2, -1, 2 * mirrorZ);
  const flipped: Bounds = {
    min: [
      flipX ? 2 * centerX - bounds.max[0] : bounds.min[0],
      bounds.min[1],
      flipZ ? 2 * mirrorZ - bounds.max[2] : bounds.min[2],
    ],
    max: [
      flipX ? 2 * centerX - bounds.min[0] : bounds.max[0],
      bounds.max[1],
      flipZ ? 2 * mirrorZ - bounds.min[2] : bounds.max[2],
    ],
  };

  // 7. Contact frame.
  let translate: [number, number, number];
  if (metadata.contract === "Wallable") translate = [-centerX, -flipped.min[1], -wallCenter];
  else if (isContactFace(contact)) {
    const centerZ = (flipped.min[2] + flipped.max[2]) / 2;
    translate =
      contact === "back"
        ? [-centerX, -flipped.min[1], -flipped.min[2]]
        : contact === "bottom"
          ? [-centerX, -flipped.min[1], -centerZ]
          : [-centerX, -flipped.max[1], -centerZ];
  } else {
    const point = anchorPoint ?? [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2,
    ];
    translate = [
      -(flipX ? 2 * centerX - point[0] : point[0]),
      -point[1],
      -(flipZ ? 2 * mirrorZ - point[2] : point[2]),
    ];
  }
  for (const part of posed)
    for (const index of [0, 1, 2] as const) affinePart(part, index, 1, translate[index]);

  const meshes: ResizedMesh[] = [];
  const nodeOrigins: ResizedNodePoint[] = [];
  const linearEmitters: ResizedLinearEmitter[] = [];
  for (const part of posed) {
    const reverseWinding = flipX !== (flipZ && !keepsFace(part));
    for (const mesh of part.meshes) {
      const vertexCount = mesh.positions.length / 3;
      const source = mesh.source.indices ?? null;
      const indices =
        source === null ? Uint32Array.from({ length: vertexCount }, (_, i) => i) : Uint32Array.from(source);
      if (reverseWinding) {
        for (let i = 0; i + 2 < indices.length; i += 3) {
          const second = indices[i + 1] ?? 0;
          indices[i + 1] = indices[i + 2] ?? 0;
          indices[i + 2] = second;
        }
      }
      let normals: Float32Array | null = null;
      if (mesh.normals !== null) {
        normals = new Float32Array(mesh.normals.length);
        for (let i = 0; i + 2 < mesh.normals.length; i += 3) {
          const nx = mesh.normals[i] ?? 0;
          const ny = mesh.normals[i + 1] ?? 0;
          const nz = mesh.normals[i + 2] ?? 0;
          const length = Math.hypot(nx, ny, nz) || 1;
          normals[i] = nx / length;
          normals[i + 1] = ny / length;
          normals[i + 2] = nz / length;
        }
      }
      const uvs = mesh.source.uvs ?? null;
      meshes.push({
        nodeName: part.nodeName,
        copyIndex: part.copyIndex,
        materialName: mesh.source.materialName,
        positions: Float32Array.from(mesh.positions),
        normals,
        uvs: uvs === null ? null : new Float32Array(uvs),
        indices,
      });
    }
    if (part.origin !== null)
      nodeOrigins.push({ nodeName: part.nodeName, copyIndex: part.copyIndex, position: toVec(part.origin) });
    if (part.rule?.emitter === "linear") {
      const partBounds = unionBounds([part]);
      if (partBounds !== null)
        linearEmitters.push({
          nodeName: part.nodeName,
          copyIndex: part.copyIndex,
          boundsMin: toVec(partBounds.min),
          boundsMax: toVec(partBounds.max),
        });
    }
  }

  const finalBounds: Bounds = {
    min: [flipped.min[0] + translate[0], flipped.min[1] + translate[1], flipped.min[2] + translate[2]],
    max: [flipped.max[0] + translate[0], flipped.max[1] + translate[1], flipped.max[2] + translate[2]],
  };
  const mm = (value: number): number => Math.round(value * 1e6) / 1e3;
  const sizeMm = {
    x: mm(finalBounds.max[0] - finalBounds.min[0]),
    y: mm(finalBounds.max[1] - finalBounds.min[1]),
    z: mm(finalBounds.max[2] - finalBounds.min[2]),
  };
  const clearance = metadata.opening?.clearanceMm ?? 0;
  const openingMm =
    metadata.contract === "Wallable" && metadata.opening !== null
      ? {
          minX: -sizeMm.x / 2 - clearance,
          maxX: sizeMm.x / 2 + clearance,
          minY: mm(finalBounds.min[1]) - clearance,
          maxY: mm(finalBounds.max[1]) + clearance,
        }
      : null;
  return {
    ok: true,
    meshes,
    nodeOrigins,
    linearEmitters,
    sizeMm,
    boundsMm: {
      min: { x: mm(finalBounds.min[0]), y: mm(finalBounds.min[1]), z: mm(finalBounds.min[2]) },
      max: { x: mm(finalBounds.max[0]), y: mm(finalBounds.max[1]), z: mm(finalBounds.max[2]) },
    },
    openingMm,
    parameters,
    repeatCounts,
  };
};

export type TemplateFootprintResult =
  | Readonly<{
      ok: true;
      sizeMm: TemplateSizeMm;
      boundsMm: TemplateBoundsMm;
      openingMm: TemplateResizeSuccess["openingMm"];
    }>
  | Readonly<{ ok: false; issues: readonly TemplateResizeIssue[] }>;

/** The resized bounds in mm (contact frame) without keeping the mesh copies. */
export const templateFootprint = (
  input: TemplateGeometryInput,
  metadata: TemplateMetadata,
  options: TemplateResizeOptions = {},
): TemplateFootprintResult => {
  const result = templateResize(input, metadata, options);
  return result.ok
    ? { ok: true, sizeMm: result.sizeMm, boundsMm: result.boundsMm, openingMm: result.openingMm }
    : result;
};
