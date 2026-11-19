// Intrusion flags (D05): a wall band that enters another area's clear interior (its floor shape minus its
// own wall bands, so inside/center bands at Full clash do not count) beyond the contact tolerance.
// Flags never block an edit.
import { intersectRegions, offsetRegion, unionRings } from "./polygonKernel";
import type { Region } from "./region";
import { boundsOverlap, regionArea, regionBounds, ringBounds } from "./region";
import type { FloorBand, WallGeometryIssue } from "./realAllWallsTypes";
import { contactToleranceMm, minFlagAreaMm2 } from "./tolerances";

export type AreaFootprint = Readonly<{ areaId: string; clearInterior: Region }>;

export const findIntrusions = (
  bands: readonly FloorBand[],
  areas: readonly AreaFootprint[],
): WallGeometryIssue[] => {
  const eroded = areas
    .filter((area) => area.clearInterior.polygons.length > 0)
    .map((area) => {
      const region = offsetRegion(area.clearInterior, -contactToleranceMm);
      return {
        areaId: area.areaId,
        region,
        bounds: region.polygons.length > 0 ? regionBounds(region) : null,
      };
    });
  const totals = new Map<
    string,
    { wallId: string; areaId: string; intrudedAreaId: string; areaMm2: number }
  >();
  for (const band of bands) {
    const bandBounds = ringBounds(band.ring);
    for (const area of eroded) {
      if (area.areaId === band.areaId || area.bounds === null || !boundsOverlap(bandBounds, area.bounds, 0))
        continue;
      const overlap = regionArea(
        intersectRegions(unionRings([band.ring], { closeContacts: false }), area.region),
      );
      if (overlap <= 0) continue;
      const key = `${band.wallId}|${area.areaId}`;
      const total = totals.get(key) ?? {
        wallId: band.wallId,
        areaId: band.areaId,
        intrudedAreaId: area.areaId,
        areaMm2: 0,
      };
      total.areaMm2 += overlap;
      totals.set(key, total);
    }
  }
  return [...totals.values()]
    .filter((total) => total.areaMm2 > minFlagAreaMm2)
    .map((total) => ({ kind: "intrusion", ...total }));
};
