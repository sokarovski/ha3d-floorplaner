// Openings in a wall an area shares (Phase 15.7, spec/home-assistant/viewer-mvp.md, Cutaway): a door or
// window stored on a neighbour's wall belongs to an area too when that wall runs along the area's boundary.
// Rule: the opening's prism footprint (the host band across the merged parallel stack, wallOpenings.ts) holds
// an edge of the area's floor outline that is parallel to the host and overlaps the opening along it; the
// footprint is the wall thickness plus the contact tolerance, and the test adds `sharedBoundaryToleranceMm`.
import type { AreaValue } from "@shared/domain/schemas/area";
import { computeAreaFloorGeometry } from "./areaGeometry";
import type { RealAllWalls, OpeningPrism } from "./realAllWallsTypes";
import type { Ring } from "./region";
import { regionRings } from "./region";
import { minPieceLengthMm, parallelSineTolerance } from "./tolerances";
import type { Vec2 } from "./vector";
import { crossVec, dotVec, subVec } from "./vector";
import type { RealWall } from "./wallBands";

/** Extra reach (mm) beyond the footprint for the boundary edge (implementation convention). */
export const sharedBoundaryToleranceMm = 1;

type Extent = { lo: number; hi: number };

const parallelTo = (direction: Vec2, host: RealWall): boolean =>
  Math.abs(crossVec(direction, host.edge.direction)) <= parallelSineTolerance;

const project = (host: RealWall, points: readonly Vec2[]): { along: Extent; offset: Extent } => {
  const along: Extent = { lo: Infinity, hi: -Infinity };
  const offset: Extent = { lo: Infinity, hi: -Infinity };
  for (const point of points) {
    const relative = subVec(point, host.edge.start);
    const a = dotVec(relative, host.edge.direction);
    const o = dotVec(relative, host.edge.outwardNormal);
    along.lo = Math.min(along.lo, a);
    along.hi = Math.max(along.hi, a);
    offset.lo = Math.min(offset.lo, o);
    offset.hi = Math.max(offset.hi, o);
  }
  return { along, offset };
};

const alongOverlap = (a: Extent, b: Extent): number => Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo);

const ringEdges = (ring: Ring): [Vec2, Vec2][] =>
  ring.flatMap((start, index): [Vec2, Vec2][] => {
    const end = ring[(index + 1) % ring.length];
    return end === undefined ? [] : [[start, end]];
  });

/** True when an edge of the area's outline runs through the opening's footprint, parallel to its host. */
const onBoundary = (prism: OpeningPrism, host: RealWall, outline: readonly Ring[]): boolean => {
  const span: Extent = { lo: prism.alongFromMm, hi: prism.alongToMm };
  const depth = project(host, prism.footprint).offset;
  return outline.some((ring) =>
    ringEdges(ring).some(([start, end]) => {
      const edge = subVec(end, start);
      const length = Math.hypot(edge.x, edge.y);
      if (length < minPieceLengthMm || !parallelTo({ x: edge.x / length, y: edge.y / length }, host))
        return false;
      const projected = project(host, [start, end]);
      return (
        projected.offset.lo >= depth.lo - sharedBoundaryToleranceMm &&
        projected.offset.hi <= depth.hi + sharedBoundaryToleranceMm &&
        alongOverlap(projected.along, span) > minPieceLengthMm
      );
    }),
  );
};

/**
 * The other areas' openings that sit in a wall `area` shares, each with the area's own wall that runs through
 * the same footprint (its near-wall fade carries the opening), or null when the area has no wall there.
 * `walls` is the RealAllWalls of the whole floor (the neighbours' walls included).
 */
export const openingsInAreaBoundary = (
  walls: RealAllWalls,
  area: AreaValue,
): ReadonlyMap<string, string | null> => {
  const outline = regionRings(computeAreaFloorGeometry(area).floorShape);
  const hosts = new Map<string, RealWall>(
    walls.bands.map((band): [string, RealWall] => [band.wallId, band.wall]),
  );
  const shared = new Map<string, string | null>();
  for (const prism of walls.openings) {
    if (prism.areaId === area.id) continue;
    const host = hosts.get(prism.wallId);
    if (host === undefined || !onBoundary(prism, host, outline)) continue;
    const span: Extent = { lo: prism.alongFromMm, hi: prism.alongToMm };
    const depth = project(host, prism.footprint).offset;
    const own = walls.bands.find((band) => {
      if (band.areaId !== area.id || !parallelTo(band.wall.edge.direction, host)) return false;
      const projected = project(host, band.ring);
      return (
        alongOverlap(projected.along, span) > minPieceLengthMm &&
        projected.offset.lo < depth.hi &&
        projected.offset.hi > depth.lo
      );
    });
    shared.set(prism.openingId, own?.wallId ?? null);
  }
  return shared;
};
