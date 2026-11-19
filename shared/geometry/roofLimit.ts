// The roof as the walls' height limit (Phase 19.2, spec/builder/features/roofs.md#the-roof-cuts-walls). A floor's
// roof in Cuts walls mode limits its walls by its underside: every planar piece of the roof (faces and auto-fold
// pieces, shared/geometry/roofSurface.ts) is a plane over its own plan region, not an infinite half-space, so the
// limit over a plan point is the underside of the piece under it (`eaveHeightMm + roofHeightAt`), and there is no
// limit where no roof covers the point. The pieces partition the outline and meet at shared break and fold lines,
// so the limit is continuous inside the outline. Pure, framework-free and memoized by the roof value; it reads only
// authored data (no derived walls), so the window limit and the issues use it directly.
import { DraftSafeWeakMap } from "./draftSafeWeakMap";
import type { BuildingFloorValue } from "../domain/schemas/floor";
import type { RoofValue } from "../domain/schemas/roof";
import { intersectRegions, unionRings } from "./polygonKernel";
import type { Bounds, Region, Ring } from "./region";
import { pointInRegion, regionBounds, regionRings } from "./region";
import { roofSurface } from "./roofSurface";
import { heightToleranceMm } from "./tolerances";
import type { Vec2 } from "./vector";
import { lerpVec } from "./vector";

/** Linear plan function value(P) = c + ax·x + ay·y (mm). */
export type Linear2 = Readonly<{ c: number; ax: number; ay: number }>;

export const evaluateLinear = (f: Linear2, p: Vec2): number => f.c + f.ax * p.x + f.ay * p.y;

/** One planar piece of a cutting roof: its underside plane (above the floor) over its plan region. */
export type RoofLimitPiece = Readonly<{ plane: Linear2; region: Region; bounds: Bounds }>;

/** The roof that limits a floor's walls, as pieces; `coverage` is their union (the roof's outline in plan). */
export type RoofLimit = Readonly<{
  roofId: string;
  /** Walls rise to the roof: where the underside is above a wall's top the wall extends up to it. */
  wallsRise: boolean;
  pieces: readonly RoofLimitPiece[];
  coverage: Region;
  bounds: Bounds;
}>;

/** Probe offset (mm) used to tell which piece a segment lying on a piece boundary belongs to. */
export const roofProbeMm = 0.5;

/** The floor's roof in Cuts walls mode (19.2: one roof per floor; if several cut, the first one does). */
export const cuttingRoofOf = (floor: Pick<BuildingFloorValue, "roofs">): RoofValue | undefined =>
  (floor.roofs ?? []).find((roof) => roof.cutsWalls);

const limitCache = new DraftSafeWeakMap<RoofValue, RoofLimit | null>();

/** A roof's pieces as wall limits (memoized by the roof value); null for a roof without faces. */
export const roofLimitOf = (roof: RoofValue): RoofLimit | null => {
  const cached = limitCache.get(roof);
  if (cached !== undefined) return cached;
  const surface = roofSurface(roof);
  const pieces = surface.pieces.flatMap((piece): RoofLimitPiece[] => {
    const region = unionRings(
      piece.triangles.map(([a, b, c]) => [
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
        { x: c.x, y: c.y },
      ]),
      { closeContacts: false },
    );
    if (region.polygons.length === 0) return [];
    return [
      {
        plane: { c: piece.plane.c + roof.eaveHeightMm, ax: piece.plane.ax, ay: piece.plane.ay },
        region,
        bounds: regionBounds(region),
      },
    ];
  });
  const coverage = unionRings(
    pieces.flatMap((piece) => regionRings(piece.region)),
    { closeContacts: false },
  );
  const limit: RoofLimit | null =
    pieces.length === 0 || coverage.polygons.length === 0
      ? null
      : { roofId: roof.id, wallsRise: roof.wallsRise, pieces, coverage, bounds: regionBounds(coverage) };
  limitCache.set(roof, limit);
  return limit;
};

/** The floor's wall limit, or null when no roof cuts its walls. */
export const floorRoofLimit = (floor: Pick<BuildingFloorValue, "roofs">): RoofLimit | null => {
  const roof = cuttingRoofOf(floor);
  return roof === undefined ? null : roofLimitOf(roof);
};

const inBounds = (bounds: Bounds, p: Vec2, margin = roofProbeMm): boolean =>
  p.x >= bounds.minX - margin &&
  p.x <= bounds.maxX + margin &&
  p.y >= bounds.minY - margin &&
  p.y <= bounds.maxY + margin;

/** The piece over a plan point, or undefined where the roof does not cover it. */
export const pieceAt = (limit: RoofLimit, point: Vec2): RoofLimitPiece | undefined =>
  limit.pieces.find((piece) => inBounds(piece.bounds, point) && pointInRegion(point, piece.region));

/** The underside above the floor over a plan point, or null where the roof does not cover it. */
export const roofUndersideAt = (limit: RoofLimit | null, point: Vec2): number | null => {
  if (limit === null) return null;
  const piece = pieceAt(limit, point);
  return piece === undefined ? null : evaluateLinear(piece.plane, point);
};

/** Every ring edge of a region (outer rings and holes). */
const regionEdges = (region: Region): (readonly [Vec2, Vec2])[] =>
  regionRings(region).flatMap((ring: Ring) =>
    ring.flatMap((a, index): (readonly [Vec2, Vec2])[] => {
      const b = ring[(index + 1) % ring.length];
      return b === undefined ? [] : [[a, b] as const];
    }),
  );

/** Parameters (0…1) where segment a→b meets the given edges (crossings, touching vertices, collinear ends). */
export const segmentBreaks = (a: Vec2, b: Vec2, edges: readonly (readonly [Vec2, Vec2])[]): number[] => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const breaks = new Set<number>([0, 1]);
  if (lengthSq === 0) return [0, 1];
  const length = Math.sqrt(lengthSq);
  const project = (p: Vec2): void => {
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
    const distanceToLine = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length;
    if (t > 0 && t < 1 && distanceToLine <= roofProbeMm / 4) breaks.add(t);
  };
  for (const [c, d] of edges) {
    const ex = d.x - c.x;
    const ey = d.y - c.y;
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) > 1e-9 * length * Math.hypot(ex, ey)) {
      const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / denominator;
      const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / denominator;
      if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) breaks.add(t);
    }
    project(c);
    project(d);
  }
  return [...breaks].sort((x, y) => x - y);
};

/** A stretch of a segment and the piece over it (undefined: no roof there). */
export type SegmentSpan = Readonly<{ t0: number; t1: number; piece: RoofLimitPiece | undefined }>;

/**
 * Splits segment a→b where it crosses a piece boundary and names the piece over each stretch, probed at its middle
 * shifted by `probe` (a plan offset: a wall face probes toward its solid, so a face lying on the outline counts as
 * covered).
 */
export const segmentSpans = (
  limit: RoofLimit,
  a: Vec2,
  b: Vec2,
  probe: Vec2 = { x: 0, y: 0 },
): SegmentSpan[] => {
  const segmentBounds: Bounds = {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
  const near = limit.pieces.filter(
    (piece) =>
      piece.bounds.minX <= segmentBounds.maxX + 1 &&
      segmentBounds.minX <= piece.bounds.maxX + 1 &&
      piece.bounds.minY <= segmentBounds.maxY + 1 &&
      segmentBounds.minY <= piece.bounds.maxY + 1,
  );
  if (near.length === 0) return [{ t0: 0, t1: 1, piece: undefined }];
  const breaks = segmentBreaks(
    a,
    b,
    near.flatMap((piece) => regionEdges(piece.region)),
  );
  const spans: SegmentSpan[] = [];
  for (let index = 0; index + 1 < breaks.length; index += 1) {
    const t0 = breaks[index];
    const t1 = breaks[index + 1];
    if (t0 === undefined || t1 === undefined || t1 - t0 <= 1e-12) continue;
    const middle = lerpVec(a, b, (t0 + t1) / 2);
    const at = { x: middle.x + probe.x, y: middle.y + probe.y };
    const piece = near.find((candidate) => pointInRegion(at, candidate.region));
    const last = spans[spans.length - 1];
    if (last !== undefined && last.piece === piece && last.t1 === t0)
      spans[spans.length - 1] = { ...last, t1 };
    else spans.push({ t0, t1, piece });
  }
  return spans;
};

/** The lowest underside along segment a→b where the roof covers it, or null where it covers none of it. */
export const lowestUndersideAlong = (limit: RoofLimit | null, a: Vec2, b: Vec2): number | null => {
  if (limit === null) return null;
  let lowest: number | null = null;
  for (const span of segmentSpans(limit, a, b)) {
    if (span.piece === undefined) continue;
    const plane = span.piece.plane;
    const value = Math.min(
      evaluateLinear(plane, lerpVec(a, b, span.t0)),
      evaluateLinear(plane, lerpVec(a, b, span.t1)),
    );
    lowest = lowest === null ? value : Math.min(lowest, value);
  }
  return lowest;
};

/** The highest underside over a region where the roof covers it (planes peak at a vertex), or null. */
export const highestUndersideOver = (limit: RoofLimit, region: Region): number | null => {
  let highest: number | null = null;
  const bounds = region.polygons.length === 0 ? null : regionBounds(region);
  if (bounds === null) return null;
  for (const piece of limit.pieces) {
    if (
      piece.bounds.minX > bounds.maxX ||
      bounds.minX > piece.bounds.maxX ||
      piece.bounds.minY > bounds.maxY ||
      bounds.minY > piece.bounds.maxY
    )
      continue;
    for (const ring of regionRings(intersectRegions(region, piece.region)))
      for (const point of ring) {
        const value = evaluateLinear(piece.plane, point);
        highest = highest === null ? value : Math.max(highest, value);
      }
  }
  return highest;
};

export type HeightProbe = Readonly<{ id: string; pointMm: Vec2; topMm: number }>;

/** IDs of items whose top lies above the roof's underside at their plan point (never clipped, only flagged). */
export const flagsAboveRoof = (limit: RoofLimit | null, items: readonly HeightProbe[]): string[] => {
  if (limit === null) return [];
  return items
    .filter((item) => {
      const underside = roofUndersideAt(limit, item.pointMm);
      return underside !== null && item.topMm > underside + heightToleranceMm;
    })
    .map((item) => item.id);
};
