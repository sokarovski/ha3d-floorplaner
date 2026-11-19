// Planar regions: polygons with holes. Outer rings are counterclockwise and holes clockwise, so the
// region interior is always to the left of every ring edge.
import type { Affine2 } from "./affine";
import { applyAffine, preservesOrientation } from "./affine";
import type { Vec2 } from "./vector";

/** A closed ring; the closing edge from the last point back to the first is implicit. */
export type Ring = readonly Vec2[];

export type RegionPolygon = Readonly<{ outer: Ring; holes: readonly Ring[] }>;

export type Region = Readonly<{ polygons: readonly RegionPolygon[] }>;

export type Bounds = Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;

export const emptyRegion: Region = { polygons: [] };

/** Shoelace area; positive for counterclockwise rings. */
export const ringSignedArea = (ring: Ring): number => {
  let twice = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    if (current === undefined || next === undefined) continue;
    twice += current.x * next.y - next.x * current.y;
  }
  return twice / 2;
};

export const reverseRing = (ring: Ring): Ring => [...ring].reverse();

export const counterclockwiseRing = (ring: Ring): Ring =>
  ringSignedArea(ring) < 0 ? reverseRing(ring) : ring;

export const regionArea = (region: Region): number =>
  region.polygons.reduce(
    (sum, polygon) =>
      sum +
      ringSignedArea(polygon.outer) +
      polygon.holes.reduce((holeSum, hole) => holeSum + ringSignedArea(hole), 0),
    0,
  );

/** Every ring of the region with its orientation (outer CCW, holes CW). */
export const regionRings = (region: Region): Ring[] =>
  region.polygons.flatMap((polygon) => [polygon.outer, ...polygon.holes]);

export const transformRing = (ring: Ring, m: Affine2): Ring => {
  const mapped = ring.map((point) => applyAffine(m, point));
  return preservesOrientation(m) ? mapped : mapped.reverse();
};

export const transformRegion = (region: Region, m: Affine2): Region => ({
  polygons: region.polygons.map((polygon) => ({
    outer: transformRing(polygon.outer, m),
    holes: polygon.holes.map((hole) => transformRing(hole, m)),
  })),
});

/** Ray-casting point-in-ring test (boundary points are unspecified). */
export const pointInRing = (point: Vec2, ring: Ring): boolean => {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index];
    const b = ring[previous];
    if (a === undefined || b === undefined) continue;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
};

export const pointInRegion = (point: Vec2, region: Region): boolean =>
  region.polygons.some(
    (polygon) => pointInRing(point, polygon.outer) && !polygon.holes.some((hole) => pointInRing(point, hole)),
  );

export const ringBounds = (ring: Ring): Bounds => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of ring) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
};

export const regionBounds = (region: Region): Bounds => {
  const all = region.polygons.map((polygon) => ringBounds(polygon.outer));
  return {
    minX: Math.min(...all.map((bounds) => bounds.minX)),
    minY: Math.min(...all.map((bounds) => bounds.minY)),
    maxX: Math.max(...all.map((bounds) => bounds.maxX)),
    maxY: Math.max(...all.map((bounds) => bounds.maxY)),
  };
};

export const boundsOverlap = (a: Bounds, b: Bounds, marginMm: number): boolean =>
  a.minX <= b.maxX + marginMm &&
  b.minX <= a.maxX + marginMm &&
  a.minY <= b.maxY + marginMm &&
  b.minY <= a.maxY + marginMm;
