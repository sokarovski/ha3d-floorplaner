// Opening cuts for RealAllWalls (D05): each opening cuts a prism through the full merged depth at its
// location: the host band widened across every parallel band that touches or overlaps it there, so a
// neighbour's band cannot refill the aperture.
import type { AreaValue } from "@shared/domain/schemas/area";
import { intersectRegions, unionRings } from "./polygonKernel";
import type { Ring } from "./region";
import { regionArea } from "./region";
import type { FloorBand, OpeningPrism, OpeningSizeResolver, WallGeometryIssue } from "./realAllWallsTypes";
import {
  contactToleranceMm,
  heightToleranceMm,
  minFlagAreaMm2,
  minPieceLengthMm,
  parallelSineTolerance,
} from "./tolerances";
import type { Vec2 } from "./vector";
import { addVec, crossVec, dotVec, scaleVec, subVec } from "./vector";
import type { RealWall } from "./wallBands";

type Extent = { lo: number; hi: number };

const projectBand = (wall: RealWall, ring: Ring): { along: Extent; offset: Extent } => {
  const along: Extent = { lo: Infinity, hi: -Infinity };
  const offset: Extent = { lo: Infinity, hi: -Infinity };
  for (const point of ring) {
    const relative = subVec(point, wall.edge.start);
    const a = dotVec(relative, wall.edge.direction);
    const o = dotVec(relative, wall.edge.outwardNormal);
    along.lo = Math.min(along.lo, a);
    along.hi = Math.max(along.hi, a);
    offset.lo = Math.min(offset.lo, o);
    offset.hi = Math.max(offset.hi, o);
  }
  return { along, offset };
};

/** Offset range (along the host's outward normal) of the merged parallel stack at an along-range of the host edge. */
export const mergedDepthAt = (
  host: RealWall,
  alongFromMm: number,
  alongToMm: number,
  bands: readonly FloorBand[],
): Extent => {
  const depth: Extent = { lo: host.interiorOffsetMm, hi: host.exteriorOffsetMm };
  const parallel = bands
    .filter(
      (band) => Math.abs(crossVec(band.wall.edge.direction, host.edge.direction)) <= parallelSineTolerance,
    )
    .map((band) => projectBand(host, band.ring))
    .filter(
      (projection) =>
        Math.min(projection.along.hi, alongToMm) - Math.max(projection.along.lo, alongFromMm) >
        minPieceLengthMm,
    );
  let grown = true;
  while (grown) {
    grown = false;
    for (const projection of parallel) {
      const touches =
        projection.offset.lo <= depth.hi + contactToleranceMm &&
        projection.offset.hi >= depth.lo - contactToleranceMm;
      if (!touches) continue;
      if (projection.offset.lo < depth.lo || projection.offset.hi > depth.hi) {
        depth.lo = Math.min(depth.lo, projection.offset.lo);
        depth.hi = Math.max(depth.hi, projection.offset.hi);
        grown = true;
      }
    }
  }
  return depth;
};

const footprintRing = (host: RealWall, alongFromMm: number, alongToMm: number, depth: Extent): Ring => {
  const at = (along: number, offset: number): Vec2 =>
    addVec(
      host.edge.start,
      addVec(scaleVec(host.edge.direction, along), scaleVec(host.edge.outwardNormal, offset)),
    );
  const lo = depth.lo - contactToleranceMm;
  const hi = depth.hi + contactToleranceMm;
  return [at(alongFromMm, hi), at(alongToMm, hi), at(alongToMm, lo), at(alongFromMm, lo)];
};

export const resolveOpeningPrisms = (
  areas: readonly AreaValue[],
  wallsById: ReadonlyMap<string, RealWall>,
  bands: readonly FloorBand[],
  resolveSize: OpeningSizeResolver,
): { prisms: OpeningPrism[]; issues: WallGeometryIssue[] } => {
  const prisms: OpeningPrism[] = [];
  const issues: WallGeometryIssue[] = [];
  for (const area of areas) {
    for (const wall of area.walls) {
      const host = wallsById.get(wall.id);
      if (host === undefined) continue;
      for (const opening of wall.objects) {
        const size = resolveSize(opening, wall, area);
        if (size === null) {
          issues.push({ kind: "openingUnsized", openingId: opening.id, wallId: wall.id });
          continue;
        }
        const center = host.spanMm.fromMm + opening.placement.distanceAlongWallMm;
        const alongFromMm = center - size.widthMm / 2;
        const alongToMm = center + size.widthMm / 2;
        const bottomMm = opening.placement.bottomMm;
        const topMm = bottomMm + size.heightMm;
        const fitsAlong = host.pieces.some(
          (piece) =>
            piece.fromMm - heightToleranceMm <= alongFromMm && alongToMm <= piece.toMm + heightToleranceMm,
        );
        if (
          !fitsAlong ||
          bottomMm < 0 ||
          topMm > host.heightMm + heightToleranceMm ||
          size.widthMm <= 0 ||
          size.heightMm <= 0
        ) {
          issues.push({ kind: "openingDoesNotFit", openingId: opening.id, wallId: wall.id });
          continue;
        }
        const depth = mergedDepthAt(host, alongFromMm, alongToMm, bands);
        prisms.push({
          openingId: opening.id,
          wallId: wall.id,
          areaId: area.id,
          footprint: footprintRing(host, alongFromMm, alongToMm, depth),
          bottomMm,
          topMm: Math.min(topMm, host.heightMm),
          alongFromMm,
          alongToMm,
        });
      }
    }
  }
  return { prisms, issues: [...issues, ...openingConflicts(prisms)] };
};

/** Openings of different walls whose prisms overlap in plan and height are a conflict (never merged automatically). */
const openingConflicts = (prisms: readonly OpeningPrism[]): WallGeometryIssue[] => {
  const issues: WallGeometryIssue[] = [];
  prisms.forEach((a, index) => {
    for (const b of prisms.slice(index + 1)) {
      if (a.wallId === b.wallId) continue;
      if (Math.min(a.topMm, b.topMm) - Math.max(a.bottomMm, b.bottomMm) <= heightToleranceMm) continue;
      const overlap = intersectRegions(
        unionRings([a.footprint], { closeContacts: false }),
        unionRings([b.footprint], { closeContacts: false }),
      );
      if (regionArea(overlap) > minFlagAreaMm2)
        issues.push({ kind: "openingConflict", openingIds: [a.openingId, b.openingId] });
    }
  });
  return issues;
};
