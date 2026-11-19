// Shared helpers for the built-in template build (scripts/build-templates.ts, one module per family under
// scripts/templates/): millimetre geometry builders, template descriptions, the GLB writer, thumbnails, and
// the checks every template passes (Khronos glTF Validator with zero errors, Homeplan metadata validation
// including node-rule formulas, and a resize-engine round trip at its default parameters).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { KHRLightsPunctual, KHRMaterialsEmissiveStrength } from "@gltf-transform/extensions";
import { validateBytes } from "gltf-validator";
import { format, resolveConfig } from "prettier";
import { BuiltinTemplateManifest } from "@shared/contracts/templates";
import type { BuiltinTemplateManifestValue } from "@shared/contracts/templates";
import {
  axes,
  axisSizeParameter,
  homeplanExtras,
  parseNodeRule,
  templateParameterSchema,
  templatePickerFields,
  validateTemplateMetadata,
} from "@shared/domain/templates/metadata";
import type { NodeRule, TemplateMetadata } from "@shared/domain/templates/metadata";
import { compileValidator } from "@shared/domain/validation/ajv";
import { templateResize } from "@shared/geometry/templateResize";
import type { ResizedMesh, TemplateNodeInput } from "@shared/geometry/templateResize";

export const outputRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../server/builtin-templates",
);
const validateManifest = compileValidator(BuiltinTemplateManifest);

// ---------------------------------------------------------------------------------------------
// Geometry helpers (millimetres; UVs in meters so 1 UV unit = 1 m).

export type V3 = readonly [number, number, number];
export type AxisName = "x" | "y" | "z";
export const axisOf: Readonly<Record<AxisName, 0 | 1 | 2>> = { x: 0, y: 1, z: 2 };

export type Geo = { positions: number[]; normals: number[]; uvs: number[]; indices: number[] };
export const newGeo = (): Geo => ({ positions: [], normals: [], uvs: [], indices: [] });

export const normalize = (v: V3): V3 => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

export const vertex = (g: Geo, p: V3, n: V3, u: number, v: number): number => {
  g.positions.push(p[0], p[1], p[2]);
  const unit = normalize(n);
  g.normals.push(unit[0], unit[1], unit[2]);
  g.uvs.push(u / 1000, v / 1000);
  return g.positions.length / 3 - 1;
};

/** Orients every triangle counterclockwise as seen from its vertex normals. */
export const orient = (g: Geo): void => {
  const at = (array: readonly number[], index: number, axis: number): number => array[index * 3 + axis] ?? 0;
  for (let t = 0; t + 2 < g.indices.length; t += 3) {
    const a = g.indices[t] ?? 0;
    const b = g.indices[t + 1] ?? 0;
    const c = g.indices[t + 2] ?? 0;
    const e1 = [
      at(g.positions, b, 0) - at(g.positions, a, 0),
      at(g.positions, b, 1) - at(g.positions, a, 1),
      at(g.positions, b, 2) - at(g.positions, a, 2),
    ];
    const e2 = [
      at(g.positions, c, 0) - at(g.positions, a, 0),
      at(g.positions, c, 1) - at(g.positions, a, 1),
      at(g.positions, c, 2) - at(g.positions, a, 2),
    ];
    const cross = [
      (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
      (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
      (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
    ];
    let dot = 0;
    for (const axis of [0, 1, 2])
      dot += (cross[axis] ?? 0) * (at(g.normals, a, axis) + at(g.normals, b, axis) + at(g.normals, c, axis));
    if (dot < 0) {
      g.indices[t + 1] = c;
      g.indices[t + 2] = b;
    }
  }
};

export const facePlanes: Readonly<Record<AxisName, readonly [AxisName, AxisName]>> = {
  x: ["z", "y"],
  y: ["x", "z"],
  z: ["x", "y"],
};

/** A vector from (axis, value) pairs; unnamed axes are 0. */
export const compose = (pairs: readonly (readonly [AxisName, number])[]): V3 => {
  const result: [number, number, number] = [0, 0, 0];
  for (const [axis, value] of pairs) result[axisOf[axis]] = value;
  return result;
};

/** Axis-aligned box from min to max corner. */
export const box = (g: Geo, min: V3, max: V3): void => {
  for (const axis of ["x", "y", "z"] as const) {
    const [ua, va] = facePlanes[axis];
    for (const side of [0, 1] as const) {
      const fixed = side === 0 ? min[axisOf[axis]] : max[axisOf[axis]];
      const normal = compose([[axis, side === 0 ? -1 : 1]]);
      const corners: [number, number][] = [
        [min[axisOf[ua]], min[axisOf[va]]],
        [max[axisOf[ua]], min[axisOf[va]]],
        [max[axisOf[ua]], max[axisOf[va]]],
        [min[axisOf[ua]], max[axisOf[va]]],
      ];
      const ids = corners.map(([u, v]) =>
        vertex(
          g,
          compose([
            [axis, fixed],
            [ua, u],
            [va, v],
          ]),
          normal,
          u,
          v,
        ),
      );
      const [a, b, c, d] = ids;
      if (a === undefined || b === undefined || c === undefined || d === undefined) continue;
      g.indices.push(a, b, c, a, c, d);
    }
  }
};

/** Convex polygon (in the `a`/`b` plane) extruded along `e` from e0 to e1. */
export const prism = (
  g: Geo,
  polygon: readonly (readonly [number, number])[],
  a: AxisName,
  b: AxisName,
  e: AxisName,
  e0: number,
  e1: number,
): void => {
  const at3 = (pa: number, pb: number, pe: number): V3 =>
    compose([
      [a, pa],
      [b, pb],
      [e, pe],
    ]);
  for (const [pe, sign] of [
    [e0, -1],
    [e1, 1],
  ] as const) {
    const normal = compose([[e, sign]]);
    const ids = polygon.map(([pa, pb]) => vertex(g, at3(pa, pb, pe), normal, pa, pb));
    const first = ids[0];
    if (first === undefined) continue;
    for (let i = 1; i + 1 < ids.length; i += 1) g.indices.push(first, ids[i] ?? first, ids[i + 1] ?? first);
  }
  const ca = polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length;
  const cb = polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length;
  for (let i = 0; i < polygon.length; i += 1) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    if (p === undefined || q === undefined) continue;
    let na = q[1] - p[1];
    let nb = -(q[0] - p[0]);
    if (na * ((p[0] + q[0]) / 2 - ca) + nb * ((p[1] + q[1]) / 2 - cb) < 0) {
      na = -na;
      nb = -nb;
    }
    const normal = compose([
      [a, na],
      [b, nb],
    ]);
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const ids = [
      vertex(g, at3(p[0], p[1], e0), normal, 0, e0),
      vertex(g, at3(q[0], q[1], e0), normal, length, e0),
      vertex(g, at3(q[0], q[1], e1), normal, length, e1),
      vertex(g, at3(p[0], p[1], e1), normal, 0, e1),
    ];
    const [i0, i1, i2, i3] = ids;
    if (i0 === undefined || i1 === undefined || i2 === undefined || i3 === undefined) continue;
    g.indices.push(i0, i1, i2, i0, i2, i3);
  }
};

export type FrustumOptions = {
  axis?: "y" | "z";
  segments?: number;
  capStart?: boolean;
  capEnd?: boolean;
  inward?: boolean;
};

/** Frustum (or cylinder) around an axis through `center` (the other two coordinates), from h0 to h1. */
export const frustum = (
  g: Geo,
  center: readonly [number, number],
  h0: number,
  h1: number,
  r0: number,
  r1: number,
  options: FrustumOptions = {},
): void => {
  const axis = options.axis ?? "y";
  const segments = options.segments ?? 24;
  const sign = options.inward === true ? -1 : 1;
  // Radial plane axes: for a y axis, center = (x, z); for a z axis, center = (x, y).
  const [ua, wa]: readonly [AxisName, AxisName] = axis === "y" ? ["x", "z"] : ["x", "y"];
  const at3 = (u: number, w: number, h: number): V3 =>
    compose([
      [ua, center[0] + u],
      [wa, center[1] + w],
      [axis, h],
    ]);
  const dir3 = (u: number, w: number, h: number): V3 =>
    compose([
      [ua, u],
      [wa, w],
      [axis, h],
    ]);
  const dh = h1 - h0;
  const dr = r1 - r0;
  const ring: number[][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const normal = dir3(sign * dh * cos, sign * dh * sin, -sign * dr);
    const arc = angle * Math.max(r0, r1);
    ring.push([
      vertex(g, at3(r0 * cos, r0 * sin, h0), normal, arc, h0),
      vertex(g, at3(r1 * cos, r1 * sin, h1), normal, arc, h1),
    ]);
  }
  for (let i = 0; i < segments; i += 1) {
    const [a0, a1] = ring[i] ?? [];
    const [b0, b1] = ring[i + 1] ?? [];
    if (a0 === undefined || a1 === undefined || b0 === undefined || b1 === undefined) continue;
    g.indices.push(a0, b0, b1, a0, b1, a1);
  }
  for (const [enabled, h, r, s] of [
    [options.capStart === true, h0, r0, -1],
    [options.capEnd === true, h1, r1, 1],
  ] as const) {
    if (!enabled || r <= 0) continue;
    const normal = dir3(0, 0, s);
    const middle = vertex(g, at3(0, 0, h), normal, center[0], center[1]);
    const ids: number[] = [];
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const u = r * Math.cos(angle);
      const w = r * Math.sin(angle);
      ids.push(vertex(g, at3(u, w, h), normal, center[0] + u, center[1] + w));
    }
    for (let i = 0; i < segments; i += 1) g.indices.push(middle, ids[i] ?? middle, ids[i + 1] ?? middle);
  }
};

export const cylinder = (
  g: Geo,
  center: readonly [number, number],
  h0: number,
  h1: number,
  r: number,
  axis: "y" | "z" = "y",
): void => frustum(g, center, h0, h1, r, r, { axis, capStart: true, capEnd: true });

export const sphere = (g: Geo, c: V3, r: number, segments = 18, rings = 12): void => {
  const grid: number[][] = [];
  for (let j = 0; j <= rings; j += 1) {
    const phi = (j / rings) * Math.PI;
    const row: number[] = [];
    for (let i = 0; i <= segments; i += 1) {
      const theta = (i / segments) * Math.PI * 2;
      const n: V3 = [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
      row.push(vertex(g, [c[0] + r * n[0], c[1] + r * n[1], c[2] + r * n[2]], n, theta * r, phi * r));
    }
    grid.push(row);
  }
  for (let j = 0; j < rings; j += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = grid[j]?.[i];
      const b = grid[j]?.[i + 1];
      const c2 = grid[j + 1]?.[i + 1];
      const d = grid[j + 1]?.[i];
      if (a === undefined || b === undefined || c2 === undefined || d === undefined) continue;
      if (j > 0) g.indices.push(a, b, c2);
      if (j < rings - 1) g.indices.push(a, c2, d);
    }
  }
};

// ---------------------------------------------------------------------------------------------
// Template descriptions.

export type MaterialSpec = Readonly<{
  /** Linear base color. */
  color: V3;
  alpha?: number;
  roughness: number;
  metallic?: number;
  emissive?: V3;
  emissiveStrength?: number;
  doubleSided?: boolean;
}>;

export type PartSpec = Readonly<{
  name: string;
  material?: string;
  build?: (g: Geo) => void;
  rule?: NodeRule;
  /** Mesh-less node origin (mm), for punctual lights and anchors. */
  origin?: V3;
  /** Point light in lumens and Kelvin (KHR_lights_punctual, candela = lm / 4π). */
  light?: Readonly<{ lumens: number; kelvin: number }>;
}>;

export type ThumbnailView = "front" | "side" | "plan";

export type TemplateSpec = Readonly<{
  id: string;
  metadata: TemplateMetadata;
  materials: Readonly<Record<string, MaterialSpec>>;
  parts: readonly PartSpec[];
  view: ThumbnailView;
  /** Host depth used for the default round trip of a Wallable. */
  hostDepthMm?: number;
}>;

export const white: MaterialSpec = { color: [0.85, 0.85, 0.83], roughness: 0.6 };
export const glass: MaterialSpec = {
  color: [0.75, 0.86, 0.9],
  alpha: 0.22,
  roughness: 0.05,
  doubleSided: true,
};
export const metal: MaterialSpec = { color: [0.62, 0.62, 0.64], roughness: 0.3, metallic: 1 };
export const oak: MaterialSpec = { color: [0.52, 0.34, 0.18], roughness: 0.55 };
export const darkWood: MaterialSpec = { color: [0.16, 0.09, 0.05], roughness: 0.5 };

export const boxes =
  (...list: readonly (readonly [V3, V3])[]) =>
  (g: Geo): void => {
    for (const [min, max] of list) box(g, min, max);
  };

/** Four boxes around a rectangle: outer x/y extent, band widths, depth z0..z1. */
export const rectFrame = (
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  side: number,
  bottom: number,
  top: number,
  z0: number,
  z1: number,
) =>
  boxes(
    [
      [x0, y0, z0],
      [x0 + side, y1, z1],
    ],
    [
      [x1 - side, y0, z0],
      [x1, y1, z1],
    ],
    [
      [x0 + side, y0, z0],
      [x1 - side, y0 + bottom, z1],
    ],
    [
      [x0 + side, y1 - top, z0],
      [x1 - side, y1, z1],
    ],
  );

export type MetadataBase = Pick<TemplateMetadata, "schemaVersion" | "contract" | "opening">;

export const wallableBase: MetadataBase & Pick<TemplateMetadata, "attachment"> = {
  schemaVersion: 1,
  contract: "Wallable",
  attachment: { hosts: ["wall"], contact: "back", defaultHostSide: "interior" },
  opening: { shape: "bounds", clearanceMm: 0 },
};

export const floorAreable: MetadataBase & Pick<TemplateMetadata, "attachment" | "flip"> = {
  schemaVersion: 1,
  contract: "Areable",
  attachment: { hosts: ["floor"], contact: "bottom" },
  opening: null,
  flip: { x: false, z: false },
};

export const wallAreable: MetadataBase & Pick<TemplateMetadata, "flip"> = {
  schemaVersion: 1,
  contract: "Areable",
  opening: null,
  flip: { x: false, z: false },
};

/** Four boxes around a plan rectangle (x/z extent), thickness t, height y0..y1. */
export function rectFrameXZ(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  t: number,
  y0: number,
  y1: number,
): (g: Geo) => void {
  return boxes(
    [
      [x0, y0, z0],
      [x1, y1, z0 + t],
    ],
    [
      [x0, y0, z1 - t],
      [x1, y1, z1],
    ],
    [
      [x0, y0, z0 + t],
      [x0 + t, y1, z1 - t],
    ],
    [
      [x1 - t, y0, z0 + t],
      [x1, y1, z1 - t],
    ],
  );
}

export function prismBuilder(
  polygon: readonly (readonly [number, number])[],
  a: AxisName,
  b: AxisName,
  e: AxisName,
  e0: number,
  e1: number,
): (g: Geo) => void {
  return (g) => prism(g, polygon, a, b, e, e0, e1);
}

// ---------------------------------------------------------------------------------------------
// Building.

/** Approximate linear-sRGB color of a black body (Tanner Helland's fit), for the punctual light. */
const kelvinToLinear = (kelvin: number): [number, number, number] => {
  const t = kelvin / 100;
  const red = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const green =
    t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const toLinear = (value: number): number => {
    const c = Math.min(255, Math.max(0, value)) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [toLinear(red), toLinear(green), toLinear(blue)];
};

type BuiltPart = Readonly<{ spec: PartSpec; geo: Geo | null }>;

export const buildParts = (spec: TemplateSpec): BuiltPart[] =>
  spec.parts.map((part) => {
    if (part.build === undefined) return { spec: part, geo: null };
    const geo = newGeo();
    part.build(geo);
    orient(geo);
    return { spec: part, geo };
  });

const meters = (values: readonly number[]): Float32Array<ArrayBuffer> =>
  Float32Array.from(values, (value) => value / 1000);

export const engineInput = (parts: readonly BuiltPart[]): TemplateNodeInput[] =>
  parts.map(({ spec, geo }) => ({
    name: spec.name,
    ...(spec.origin === undefined
      ? {}
      : { origin: [spec.origin[0] / 1000, spec.origin[1] / 1000, spec.origin[2] / 1000] as const }),
    ...(spec.rule === undefined ? {} : { rule: spec.rule }),
    meshes:
      geo === null
        ? []
        : [
            {
              positions: meters(geo.positions),
              normals: Float32Array.from(geo.normals),
              uvs: Float32Array.from(geo.uvs),
              indices: Uint32Array.from(geo.indices),
              materialName: spec.material ?? null,
            },
          ],
  }));

const writeGlb = async (spec: TemplateSpec, parts: readonly BuiltPart[]): Promise<Uint8Array> => {
  const doc = new Document();
  doc.getRoot().getAsset().generator = "Homeplan scripts/build-templates.ts (glTF Transform)";
  const buffer = doc.createBuffer();
  // Extensions are registered only when the asset uses them (an unused extension is a validator warning).
  const emissiveExtension = Object.values(spec.materials).some(
    (material) => (material.emissiveStrength ?? 0) > 1,
  )
    ? doc.createExtension(KHRMaterialsEmissiveStrength)
    : null;
  const lightsExtension = spec.parts.some((part) => part.light !== undefined)
    ? doc.createExtension(KHRLightsPunctual)
    : null;
  const materials = new Map(
    Object.entries(spec.materials).map(([name, material]) => {
      const value = doc
        .createMaterial(name)
        .setBaseColorFactor([material.color[0], material.color[1], material.color[2], material.alpha ?? 1])
        .setRoughnessFactor(material.roughness)
        .setMetallicFactor(material.metallic ?? 0)
        .setDoubleSided(material.doubleSided === true);
      if (material.alpha !== undefined && material.alpha < 1) value.setAlphaMode("BLEND");
      if (material.emissive !== undefined) {
        value.setEmissiveFactor([material.emissive[0], material.emissive[1], material.emissive[2]]);
        if (
          emissiveExtension !== null &&
          material.emissiveStrength !== undefined &&
          material.emissiveStrength > 1
        ) {
          value.setExtension(
            "KHR_materials_emissive_strength",
            emissiveExtension.createEmissiveStrength().setEmissiveStrength(material.emissiveStrength),
          );
        }
      }
      return [name, value] as const;
    }),
  );
  const scene = doc.createScene(spec.metadata.label).setExtras({ homeplan: spec.metadata });
  doc.getRoot().setDefaultScene(scene);
  for (const { spec: part, geo } of parts) {
    const node = doc.createNode(part.name);
    if (part.rule !== undefined) node.setExtras({ homeplan: part.rule });
    if (part.origin !== undefined)
      node.setTranslation([part.origin[0] / 1000, part.origin[1] / 1000, part.origin[2] / 1000]);
    if (geo !== null) {
      const vertexCount = geo.positions.length / 3;
      const primitive = doc
        .createPrimitive()
        .setAttribute(
          "POSITION",
          doc.createAccessor().setType("VEC3").setArray(meters(geo.positions)).setBuffer(buffer),
        )
        .setAttribute(
          "NORMAL",
          doc.createAccessor().setType("VEC3").setArray(Float32Array.from(geo.normals)).setBuffer(buffer),
        )
        .setAttribute(
          "TEXCOORD_0",
          doc.createAccessor().setType("VEC2").setArray(Float32Array.from(geo.uvs)).setBuffer(buffer),
        )
        .setIndices(
          doc
            .createAccessor()
            .setType("SCALAR")
            .setArray(vertexCount < 65536 ? Uint16Array.from(geo.indices) : Uint32Array.from(geo.indices))
            .setBuffer(buffer),
        );
      const material = part.material === undefined ? undefined : materials.get(part.material);
      if (material === undefined) throw new Error(`${spec.id}: part ${part.name} has no material`);
      primitive.setMaterial(material);
      node.setMesh(doc.createMesh(part.name).addPrimitive(primitive));
    }
    if (part.light !== undefined && lightsExtension !== null) {
      const light = lightsExtension
        .createLight(part.name)
        .setType("point")
        .setIntensity(part.light.lumens / (4 * Math.PI))
        .setColor(kelvinToLinear(part.light.kelvin));
      node.setExtension("KHR_lights_punctual", light);
    }
    scene.addChild(node);
  }
  const io = new NodeIO().registerExtensions([KHRLightsPunctual, KHRMaterialsEmissiveStrength]);
  return io.writeBinary(doc);
};

// ---------------------------------------------------------------------------------------------
// Thumbnails: shaded orthographic projection of the default-size geometry, neutral grays.

const views: Readonly<Record<ThumbnailView, { project: (p: V3) => V3; toViewer: V3 }>> = {
  front: { project: (p) => [p[0], p[1], p[2]], toViewer: [0, 0, 1] },
  side: { project: (p) => [p[2], p[1], -p[0]], toViewer: [-1, 0, 0] },
  plan: { project: (p) => [p[0], -p[2], p[1]], toViewer: [0, 1, 0] },
};

const thumbnailSvg = (meshes: readonly ResizedMesh[], spec: TemplateSpec): string => {
  const view = views[spec.view];
  const lightDirection = normalize([-0.35, 0.6, 0.72]);
  type Face = { points: [number, number][]; depth: number; gray: number; opacity: number };
  const faces: Face[] = [];
  for (const mesh of meshes) {
    const material = mesh.materialName === null ? undefined : spec.materials[mesh.materialName];
    const color = material?.color ?? [0.7, 0.7, 0.7];
    const luminance = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
    const opacity = material?.alpha ?? 1;
    for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
      const corners: V3[] = [];
      for (const k of [0, 1, 2]) {
        const index = mesh.indices[t + k] ?? 0;
        corners.push([
          mesh.positions[index * 3] ?? 0,
          mesh.positions[index * 3 + 1] ?? 0,
          mesh.positions[index * 3 + 2] ?? 0,
        ]);
      }
      const [a, b, c] = corners;
      if (a === undefined || b === undefined || c === undefined) continue;
      const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const normal = normalize([
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ]);
      const facing =
        normal[0] * view.toViewer[0] + normal[1] * view.toViewer[1] + normal[2] * view.toViewer[2];
      if (facing <= 1e-4) continue;
      const lambert = Math.max(
        0,
        normal[0] * lightDirection[0] + normal[1] * lightDirection[1] + normal[2] * lightDirection[2],
      );
      const projected = corners.map((corner) => view.project(corner));
      faces.push({
        points: projected.map((p): [number, number] => [p[0], p[1]]),
        depth: projected.reduce((sum, p) => sum + p[2], 0) / 3,
        gray: Math.round(70 + 170 * (0.35 + 0.65 * lambert) * (0.45 + 0.55 * Math.sqrt(luminance))),
        opacity,
      });
    }
  }
  faces.sort((a, b) => a.depth - b.depth);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const face of faces) {
    for (const [x, y] of face.points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const size = 256;
  const padding = 20;
  const scale = (size - 2 * padding) / Math.max(maxX - minX, maxY - minY, 1e-6);
  const offsetX = (size - (maxX - minX) * scale) / 2;
  const offsetY = (size - (maxY - minY) * scale) / 2;
  const toScreen = ([x, y]: [number, number]): string =>
    `${((x - minX) * scale + offsetX).toFixed(1)},${(size - ((y - minY) * scale + offsetY)).toFixed(1)}`;
  const polygons = faces.map((face) => {
    const gray = Math.min(250, face.gray);
    const fill = `rgb(${gray},${gray},${gray})`;
    const opacity =
      face.opacity < 1 ? ` fill-opacity="${Math.max(0.25, face.opacity).toFixed(2)}" stroke-opacity="0"` : "";
    return `<polygon points="${face.points.map(toScreen).join(" ")}" fill="${fill}" stroke="${fill}"${opacity}/>`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${spec.metadata.label}">`,
    `<g stroke-width="0.6" stroke-linejoin="round">`,
    ...polygons,
    `</g>`,
    `</svg>`,
    ``,
  ].join("\n");
};

// ---------------------------------------------------------------------------------------------
// Checks and output.

export type BuildReport = {
  id: string;
  errors: string[];
  warnings: number;
  bytes: number;
  triangles: number;
  parameters: string;
};

/**
 * Builds and checks one template. A built-in is written to server/builtin-templates/<id>/; a playground
 * fixture (`fixtureFile`) is written as a single GLB at that path, with no manifest or thumbnail.
 */
export const buildTemplate = async (spec: TemplateSpec, fixtureFile?: string): Promise<BuildReport> => {
  const errors: string[] = [];
  const parts = buildParts(spec);
  const nodeRules = Object.fromEntries(
    spec.parts.flatMap((part) => (part.rule === undefined ? [] : [[part.name, part.rule] as const])),
  );
  const metadataCheck = validateTemplateMetadata(spec.metadata, {
    nodeNames: spec.parts.map((part) => part.name),
    materialNames: Object.keys(spec.materials),
    nodeRules,
  });
  for (const item of metadataCheck.issues) errors.push(`metadata ${item.pointer}: ${item.message}`);

  const bytes = await writeGlb(spec, parts);
  const report = await validateBytes(bytes, { uri: `${spec.id}/v1.glb`, format: "glb", maxIssues: 100 });
  for (const message of report.issues.messages) {
    if (message.severity === 0)
      errors.push(`glTF ${message.code} ${message.pointer ?? ""}: ${message.message}`);
  }

  // Round trip: metadata and node rules read back from the GLB.
  const io = new NodeIO().registerExtensions([KHRLightsPunctual, KHRMaterialsEmissiveStrength]);
  const readBack = await io.readBinary(bytes);
  const sceneExtras = readBack.getRoot().getDefaultScene()?.getExtras();
  if (validateTemplateMetadata(homeplanExtras(sceneExtras)).metadata === null)
    errors.push("metadata does not survive the GLB round trip");
  for (const node of readBack.getRoot().listNodes()) {
    const parsed = parseNodeRule(homeplanExtras(node.getExtras()));
    for (const item of parsed.issues) errors.push(`node ${node.getName()} ${item.pointer}: ${item.message}`);
  }

  // Resize-engine round trip at the defaults: sized axes come out at their default size.
  const result = templateResize(
    { nodes: engineInput(parts) },
    spec.metadata,
    spec.hostDepthMm === undefined ? {} : { hostDepthMm: spec.hostDepthMm },
  );
  let svg = "";
  let triangles = 0;
  if (!result.ok) errors.push(...result.issues.map((item) => `resize: ${item.message}`));
  else {
    for (const axis of axes) {
      const resize = spec.metadata.resize[axis];
      const expected = axisSizeParameter(axis, resize) === null ? undefined : resize.defaultMm;
      if (expected !== undefined && Math.abs(result.sizeMm[axis] - expected) > 0.5)
        errors.push(`axis ${axis} is ${result.sizeMm[axis]} mm at its ${expected} mm default`);
    }
    triangles = result.meshes.reduce((sum, mesh) => sum + mesh.indices.length / 3, 0);
    svg = thumbnailSvg(result.meshes, spec);
  }

  const manifest: BuiltinTemplateManifestValue = {
    id: spec.id,
    label: spec.metadata.label,
    kind: spec.metadata.kind,
    contract: spec.metadata.contract,
    versions: [1],
    thumbnail: "thumbnail.svg",
    ...templatePickerFields(spec.metadata),
  };
  if (!validateManifest(manifest)) errors.push("template.json does not match BuiltinTemplateManifest");

  if (errors.length === 0 && fixtureFile !== undefined) {
    mkdirSync(dirname(fixtureFile), { recursive: true });
    writeFileSync(fixtureFile, bytes);
  } else if (errors.length === 0) {
    const folder = join(outputRoot, spec.id);
    rmSync(folder, { recursive: true, force: true });
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "v1.glb"), bytes);
    const manifestPath = join(folder, "template.json");
    const prettierOptions = (await resolveConfig(manifestPath)) ?? {};
    writeFileSync(
      manifestPath,
      await format(JSON.stringify(manifest), { ...prettierOptions, parser: "json" }),
    );
    writeFileSync(join(folder, "thumbnail.svg"), svg);
  }
  const parameters = Object.entries(templateParameterSchema(spec.metadata).defaults)
    .map(([name, value]) => `${name}=${String(value)}`)
    .join(" ");
  return {
    id: spec.id,
    errors,
    warnings: report.issues.numWarnings,
    bytes: bytes.byteLength,
    triangles,
    parameters,
  };
};
