// Seams between walls that continue each other on one source edge (after a split): collinear walls with
// equal settings render as one surface, so the boundary is drawn as a thin line in Wall Editor and whenever
// either wall is selected (spec/builder/screens/floor-builder.md#wall-handles-and-hover).
import type { HouseDocument } from "@shared/domain/schemas/house";
import { computeAreaFloorGeometry } from "@shared/geometry/areaGeometry";
import type { RealWall } from "@shared/geometry/wallBands";
import type { OverlayPrimitive } from "../../../renderer/runtimeTypes";
import { cutOverlay } from "../tools/splitWallTool";

const touchToleranceMm = 1;

export const wallSeamsOverlay = (
  house: HouseDocument,
  floorId: string,
  focusAreaId: string | undefined,
  selection: readonly string[],
): readonly OverlayPrimitive[] => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  if (floor === undefined) return [];
  const overlay: OverlayPrimitive[] = [];
  for (const area of floor.areas) {
    const everyWall = area.id === focusAreaId;
    const walls = computeAreaFloorGeometry(area).realWalls;
    const sourceOf = new Map(
      area.walls.map((wall) => [wall.id, `${wall.sourceEdge.shapeId}|${wall.sourceEdge.edge}`]),
    );
    for (const a of walls) {
      for (const b of walls) {
        if (a === b || sourceOf.get(a.wallId) !== sourceOf.get(b.wallId)) continue;
        if (Math.abs(a.spanMm.toMm - b.spanMm.fromMm) > touchToleranceMm) continue;
        if (!everyWall && !selection.includes(a.wallId) && !selection.includes(b.wallId)) continue;
        const lower: RealWall = a.heightMm <= b.heightMm ? a : b;
        overlay.push(...cutOverlay(lower, a.spanMm.toMm, "neutral"));
      }
    }
  }
  return overlay;
};
