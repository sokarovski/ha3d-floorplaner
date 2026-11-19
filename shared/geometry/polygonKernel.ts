// Polygon booleans over clipper2-ts (Clipper2 port) in integer fixed point (1 unit = 0.001 mm).
// Every result is returned as a Region: outer rings CCW, holes CW, pinched rings split at their
// repeated vertex (so point contacts stay separate components), and exactly collinear points removed.
import { Clipper, EndType, FillRule, JoinType, PointInPolygonResult } from "clipper2-ts";
import type { Path64, Paths64 } from "clipper2-ts";
import type { Region, RegionPolygon, Ring } from "./region";
import { counterclockwiseRing, regionRings } from "./region";
import { contactToleranceMm, fixedPointUnitsPerMm } from "./tolerances";

const closingMiterLimit = 1000;
/** Vertices this close to the line through their neighbours are dropped after closing (far below facets and contacts). */
const closingResidueMm = 0.01;

export const toPath64 = (ring: Ring): Path64 =>
  ring.map((point) => ({
    x: Math.round(point.x * fixedPointUnitsPerMm),
    y: Math.round(point.y * fixedPointUnitsPerMm),
  }));

const fromPath64 = (path: Path64): Ring =>
  path.map((point) => ({ x: point.x / fixedPointUnitsPerMm, y: point.y / fixedPointUnitsPerMm }));

const regionToPaths = (region: Region): Paths64 => regionRings(region).map(toPath64);

/** Splits a ring at repeated vertices into simple loops. */
const splitPinchedPath = (path: Path64): Paths64 => {
  const loops: Paths64 = [];
  const stack: Path64 = [];
  const positions = new Map<string, number>();
  for (const point of path) {
    const key = `${point.x},${point.y}`;
    const seenAt = positions.get(key);
    if (seenAt === undefined) {
      positions.set(key, stack.length);
      stack.push(point);
      continue;
    }
    const loop = stack.splice(seenAt + 1);
    for (const removed of loop) positions.delete(`${removed.x},${removed.y}`);
    loop.unshift(point);
    if (loop.length >= 3) loops.push(loop);
  }
  if (stack.length >= 3) loops.push(stack);
  return loops;
};

/** Builds a Region from Clipper output paths (positive = outer, negative = hole). */
const pathsToRegion = (paths: Paths64): Region => {
  const outers: { path: Path64; area: number; holes: Ring[] }[] = [];
  const holes: Path64[] = [];
  for (const raw of paths) {
    for (const loop of splitPinchedPath(raw)) {
      const path = Clipper.trimCollinear(loop);
      if (path.length < 3) continue;
      const area = Clipper.area(path);
      if (area > 0) outers.push({ path, area, holes: [] });
      else if (area < 0) holes.push(path);
    }
  }
  outers.sort((left, right) => left.area - right.area);
  for (const hole of holes) {
    const owner = outers.find((outer) =>
      hole.some((point) => Clipper.pointInPolygon(point, outer.path) === PointInPolygonResult.IsInside),
    );
    if (owner !== undefined) owner.holes.push(fromPath64(hole));
  }
  const polygons: RegionPolygon[] = outers.map((outer) => ({
    outer: fromPath64(outer.path),
    holes: outer.holes,
  }));
  return { polygons };
};

/** Morphological closing (dilate, then erode by half the contact tolerance) with miter joins: fills gaps narrower than the tolerance. */
const closeGaps = (paths: Paths64): Paths64 => {
  const delta = (contactToleranceMm / 2) * fixedPointUnitsPerMm;
  const dilated = Clipper.inflatePaths(paths, delta, JoinType.Miter, EndType.Polygon, closingMiterLimit);
  const closed = Clipper.inflatePaths(dilated, -delta, JoinType.Miter, EndType.Polygon, closingMiterLimit);
  // Mitering the nearly straight vertices of faceted circles leaves micro-edges (~0.001 mm); drop vertices
  // within the closing residue of the line through their neighbours (the others are not moved).
  return Clipper.simplifyPaths(closed, closingResidueMm * fixedPointUnitsPerMm, true);
};

export type UnionOptions = Readonly<{
  /** Close gaps narrower than the contact tolerance so touching faces merge (default true). */
  closeContacts?: boolean;
}>;

/** Union of solid rings (any orientation; each is treated as filled). */
export const unionRings = (rings: readonly Ring[], options: UnionOptions = {}): Region => {
  const paths = rings.filter((ring) => ring.length >= 3).map((ring) => toPath64(counterclockwiseRing(ring)));
  if (paths.length === 0) return { polygons: [] };
  const united = Clipper.union(paths, FillRule.NonZero);
  return pathsToRegion(options.closeContacts === false ? united : closeGaps(united));
};

export const unionRegions = (regions: readonly Region[], options: UnionOptions = {}): Region => {
  const paths = regions.flatMap(regionToPaths);
  if (paths.length === 0) return { polygons: [] };
  const united = Clipper.union(paths, FillRule.NonZero);
  return pathsToRegion(options.closeContacts === false ? united : closeGaps(united));
};

export const differenceRegions = (subject: Region, clip: Region): Region => {
  if (clip.polygons.length === 0) return subject;
  return pathsToRegion(Clipper.difference(regionToPaths(subject), regionToPaths(clip), FillRule.NonZero));
};

export const intersectRegions = (subject: Region, clip: Region): Region =>
  pathsToRegion(Clipper.intersect(regionToPaths(subject), regionToPaths(clip), FillRule.NonZero));

/** Offsets a region outward (positive) or inward (negative) with miter joins. */
export const offsetRegion = (region: Region, deltaMm: number): Region =>
  pathsToRegion(
    Clipper.inflatePaths(
      regionToPaths(region),
      deltaMm * fixedPointUnitsPerMm,
      JoinType.Miter,
      EndType.Polygon,
      closingMiterLimit,
    ),
  );

export const regionFromRings = (rings: readonly Ring[]): Region =>
  unionRings(rings, { closeContacts: false });
