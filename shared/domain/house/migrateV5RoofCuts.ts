// Migration v5 → v6 (Phase 19.2, spec/builder/features/roofs.md#migration-of-roof-cuts): the roof-cut tool is
// replaced by roofs. Every floor loses `roofCuts`; every roof gains its mode (`cutsWalls` and `wallsRise`, both on).
// - A floor that already has a roof drops its cuts (the demo attic carried both, its roof's underside on the cuts'
//   planes).
// - A floor with active, valid cuts and no roof gets one roof that reproduces the cuts: its outline is the floor's
//   bounding box (rooms with their walls, as Add roof) grown by Add roof's 400 mm when that keeps every point at or
//   above the eave (else the bounding box itself), divided by break lines into the cells of the cuts' lower envelope
//   (each cell is where one cut is the lowest, a convex polygon); every point's height is the envelope there. The
//   envelope is the same function over any outline that contains the walls, so the walls keep exactly the heights
//   the cuts gave them; Walls rise to the roof is off for this roof (the cuts only removed). Closed, Add roof's
//   materials. The eave is the envelope's lowest point (at least 0).
// - Inactive cuts and cuts with a vertical profile had no effect and are dropped.
// IDs: the roof is `rf_` + the floor ID's suffix; its points and lines number from there, so repeated loads give the
// same document.
import { roofDefaults } from "./roofs";
import { builtInPresets } from "./defaults";
import { slabCoverage } from "../../geometry/floorSlab";
import type { Bounds } from "../../geometry/region";
import { regionBounds, ringSignedArea } from "../../geometry/region";
import { clipConvex, minusLinear } from "../../geometry/roofClip";
import type { Linear2 } from "../../geometry/roofLimit";
import { evaluateLinear } from "../../geometry/roofLimit";
import type { Vec2 } from "../../geometry/vector";
import { BuildingFloor } from "../schemas/floor";
import type { BuildingFloorValue } from "../schemas/floor";
import { maxRoofEaveHeightMm, maxRoofPointHeightMm } from "../schemas/roof";
import type { RoofLineValue, RoofPointValue, RoofValue } from "../schemas/roof";
import type { SurfaceMaterialValue } from "../schemas/values";
import { compileValidator } from "../validation/ajv";

type JsonObject = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Add roof's overhang (shared/domain/house/roofs.ts addRoofMarginMm). */
const marginMm = 400;
/** Points closer than this (mm) are one point. */
const mergeMm = 0.5;
/** A run shorter than this (mm) is a vertical profile (shared/geometry/tolerances.ts minPieceLengthMm). */
const minRunMm = 1;

/** The height plane of a v5 roof cut (its side profile extended across the floor), or null when it has none. */
export const roofCutPlane = (cut: unknown): Linear2 | null => {
  if (!isObject(cut) || cut.active === false) return null;
  const origin = isObject(cut.originMm) ? cut.originMm : {};
  const low = isObject(cut.low) ? cut.low : {};
  const high = isObject(cut.high) ? cut.high : {};
  const ox = num(origin.x);
  const oy = num(origin.y);
  const direction = num(cut.sectionDirectionDeg);
  const lowRun = num(low.runMm);
  const lowHeight = num(low.heightMm);
  const highRun = num(high.runMm);
  const highHeight = num(high.heightMm);
  if (
    ox === null ||
    oy === null ||
    direction === null ||
    lowRun === null ||
    lowHeight === null ||
    highRun === null ||
    highHeight === null
  )
    return null;
  const runDelta = highRun - lowRun;
  if (Math.abs(runDelta) < minRunMm) return null;
  const slope = (highHeight - lowHeight) / runDelta;
  const radians = (direction * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const originRun = ox * dx + oy * dy;
  return { c: lowHeight + slope * (-lowRun - originRun), ax: slope * dx, ay: slope * dy };
};

/** The lower envelope of planes at a point. */
export const envelopeAt = (planes: readonly Linear2[], point: Vec2): number =>
  Math.min(...planes.map((plane) => evaluateLinear(plane, point)));

const rectRing = (bounds: Bounds): Vec2[] => [
  { x: bounds.minX, y: bounds.minY },
  { x: bounds.maxX, y: bounds.minY },
  { x: bounds.maxX, y: bounds.maxY },
  { x: bounds.minX, y: bounds.maxY },
];

/** The cells of the lower envelope over a rectangle: per plane, the convex part where it is the lowest. */
const envelopeCells = (planes: readonly Linear2[], bounds: Bounds): Vec2[][] =>
  planes.flatMap((plane, index) => {
    let polygon: Vec2[] = rectRing(bounds);
    planes.forEach((other, otherIndex) => {
      if (otherIndex === index || polygon.length < 3) return;
      // Ties go to the earlier plane, so identical cuts give one cell.
      const tie = otherIndex < index ? 1e-6 : 0;
      const difference = minusLinear(other, plane);
      polygon = clipConvex(polygon, { ...difference, c: difference.c - tie });
    });
    return polygon.length >= 3 && Math.abs(ringSignedArea(polygon)) > 1 ? [polygon] : [];
  });

type SheetPoint = { id: string; x: number; y: number; h: number };

/** Perimeter parameter of a point on the rectangle's boundary, counterclockwise from (minX, minY); null inside. */
const perimeterAt = (bounds: Bounds, p: Vec2): number | null => {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  if (Math.abs(p.y - bounds.minY) <= mergeMm) return p.x - bounds.minX;
  if (Math.abs(p.x - bounds.maxX) <= mergeMm) return w + (p.y - bounds.minY);
  if (Math.abs(p.y - bounds.maxY) <= mergeMm) return w + h + (bounds.maxX - p.x);
  if (Math.abs(p.x - bounds.minX) <= mergeMm) return 2 * w + h + (bounds.maxY - p.y);
  return null;
};

const onSameSide = (bounds: Bounds, a: Vec2, b: Vec2): boolean =>
  (Math.abs(a.y - bounds.minY) <= mergeMm && Math.abs(b.y - bounds.minY) <= mergeMm) ||
  (Math.abs(a.y - bounds.maxY) <= mergeMm && Math.abs(b.y - bounds.maxY) <= mergeMm) ||
  (Math.abs(a.x - bounds.minX) <= mergeMm && Math.abs(b.x - bounds.minX) <= mergeMm) ||
  (Math.abs(a.x - bounds.maxX) <= mergeMm && Math.abs(b.x - bounds.maxX) <= mergeMm);

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * A roof sheet whose underside is the lower envelope of the planes over the rectangle: outline the rectangle (plus
 * the cell corners on it), break lines between the cells. Heights are relative to the returned eave (the lowest
 * point, at least 0); null when the envelope reaches no higher than 0 anywhere or has too many points.
 */
export const envelopeSheet = (
  planes: readonly Linear2[],
  bounds: Bounds,
  idOf: (prefix: "rp" | "rl", index: number) => string,
): Readonly<{
  eaveHeightMm: number;
  points: RoofPointValue[];
  outline: string[];
  lines: RoofLineValue[];
}> | null => {
  const cells = envelopeCells(planes, bounds);
  const points: SheetPoint[] = [];
  const pointOf = (p: Vec2): SheetPoint => {
    const existing = points.find((point) => Math.hypot(point.x - p.x, point.y - p.y) <= mergeMm);
    if (existing !== undefined) return existing;
    const created = {
      id: idOf("rp", points.length + 1),
      x: round(p.x),
      y: round(p.y),
      h: envelopeAt(planes, p),
    };
    points.push(created);
    return created;
  };
  const cellPoints = cells.map((cell) => {
    const ids: SheetPoint[] = [];
    for (const vertex of cell) {
      const point = pointOf(vertex);
      if (ids[ids.length - 1] !== point) ids.push(point);
    }
    if (ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop();
    return ids;
  });
  for (const corner of rectRing(bounds)) pointOf(corner);
  const lines: RoofLineValue[] = [];
  const seen = new Set<string>();
  for (const cell of cellPoints)
    cell.forEach((a, index) => {
      const b = cell[(index + 1) % cell.length];
      if (b === undefined || a === b) return;
      // The cell's edge split at every point lying on it (a neighbour's corner), in order.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy;
      if (lengthSq === 0) return;
      const length = Math.sqrt(lengthSq);
      const chain = [
        a,
        ...points
          .filter((p) => p !== a && p !== b)
          .map((p) => ({ p, t: ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq }))
          .filter(
            ({ p, t }) => t > 0 && t < 1 && Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length <= mergeMm,
          )
          .sort((u, v) => u.t - v.t)
          .map(({ p }) => p),
        b,
      ];
      for (let k = 0; k + 1 < chain.length; k += 1) {
        const from = chain[k];
        const to = chain[k + 1];
        if (from === undefined || to === undefined || onSameSide(bounds, from, to)) continue;
        const key = from.id < to.id ? `${from.id}|${to.id}` : `${to.id}|${from.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push({ id: idOf("rl", lines.length + 1), a: from.id, b: to.id });
      }
    });
  const outline = points
    .map((point) => ({ point, at: perimeterAt(bounds, point) }))
    .flatMap(({ point, at }) => (at === null ? [] : [{ point, at }]))
    .sort((u, v) => u.at - v.at)
    .map(({ point }) => point.id);
  const lowest = Math.min(...points.map((point) => point.h));
  if (Math.max(...points.map((point) => point.h)) <= 0 || points.length > 400) return null;
  const eaveHeightMm = round(Math.min(maxRoofEaveHeightMm, Math.max(0, lowest)));
  return {
    eaveHeightMm,
    points: points.map((point) => ({
      id: point.id,
      x: point.x,
      y: point.y,
      heightMm: round(Math.min(maxRoofPointHeightMm, Math.max(0, point.h - eaveHeightMm))),
    })),
    outline,
    lines,
  };
};

const presetMaterial = (id: string): SurfaceMaterialValue => {
  const preset = builtInPresets.find((candidate) => candidate.id === id);
  if (preset === undefined) throw new Error(`Unknown built-in preset ${id}`);
  return structuredClone(preset.material);
};

const isFloor = compileValidator(BuildingFloor);

/** The floor without its `roofCuts` field. */
const withoutCuts = (floor: JsonObject): JsonObject =>
  Object.fromEntries(Object.entries(floor).filter(([key]) => key !== "roofCuts"));

/** The roof reproducing a floor's cuts, or null when the floor has no rooms or the cuts give no roof. */
const roofFromCuts = (floor: JsonObject, planes: readonly Linear2[]): RoofValue | null => {
  const candidate: unknown = { ...withoutCuts(floor), roofs: [] };
  if (!isFloor(candidate)) return null;
  const typed: BuildingFloorValue = candidate;
  const coverage = slabCoverage(typed);
  if (coverage.polygons.length === 0) return null;
  const box = regionBounds(coverage);
  const grown: Bounds = {
    minX: box.minX - marginMm,
    minY: box.minY - marginMm,
    maxX: box.maxX + marginMm,
    maxY: box.maxY + marginMm,
  };
  const suffix = typed.id.slice(typed.id.indexOf("_") + 1);
  const idOf = (prefix: "rp" | "rl", index: number): string =>
    `${prefix}_${suffix}${String(index).padStart(3, "0")}`;
  // The overhang when the envelope stays at or above 0 over it (no point clamped), else the bounding box itself.
  const lowestOver = (bounds: Bounds): number =>
    Math.min(...envelopeCells(planes, bounds).flatMap((cell) => cell.map((p) => envelopeAt(planes, p))));
  const bounds = lowestOver(grown) >= 0 ? grown : box;
  const sheet = envelopeSheet(planes, bounds, idOf);
  if (sheet === null) return null;
  return {
    id: `rf_${suffix}`,
    name: "Roof",
    design: "closed",
    cutsWalls: true,
    wallsRise: false,
    eaveHeightMm: sheet.eaveHeightMm,
    thicknessMm: roofDefaults.thicknessMm,
    topMaterial: presetMaterial("builtin_terracotta"),
    bottomMaterial: presetMaterial("builtin_ashplanks"),
    sideMaterial: presetMaterial("builtin_capwhite"),
    ribHeightMm: roofDefaults.ribHeightMm,
    ribWidthMm: roofDefaults.ribWidthMm,
    ribSpacingMm: roofDefaults.ribSpacingMm,
    ribMaterial: "wood",
    points: sheet.points,
    outline: sheet.outline,
    lines: sheet.lines,
  };
};

/** A v5 roof with its mode (both on unless set). */
const withMode = (roof: unknown): unknown =>
  isObject(roof)
    ? {
        ...roof,
        cutsWalls: typeof roof.cutsWalls === "boolean" ? roof.cutsWalls : true,
        wallsRise: typeof roof.wallsRise === "boolean" ? roof.wallsRise : true,
      }
    : roof;

const migrateFloor = (floor: unknown): unknown => {
  if (!isObject(floor)) return floor;
  const roofCuts = floor.roofCuts;
  const rest = withoutCuts(floor);
  const roofs = Array.isArray(rest.roofs) ? rest.roofs.map(withMode) : undefined;
  const planes = list(roofCuts).flatMap((cut) => {
    const plane = roofCutPlane(cut);
    return plane === null ? [] : [plane];
  });
  if ((roofs !== undefined && roofs.length > 0) || planes.length === 0)
    return roofs === undefined ? rest : { ...rest, roofs };
  const roof = roofFromCuts(floor, planes);
  return roof === null ? (roofs === undefined ? rest : { ...rest, roofs }) : { ...rest, roofs: [roof] };
};

export const migrateRoofCutsV5 = (document: JsonObject): JsonObject => ({
  ...document,
  floors: list(document.floors).map(migrateFloor),
});
