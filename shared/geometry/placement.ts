// Group composition: shape-local → area → floor → house (spec/builder/features/geometry-groups.md#coordinate-conventions).
import { floorPlacementOf } from "@shared/domain/house/floorPlacement";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import type { Affine2 } from "./affine";
import { composeAffine, placementAffine } from "./affine";
import type { Vec3 } from "./meshData";

/** Shape-local → area frame. Circles have no rotation. */
export const shapeToAreaAffine = (shape: ShapeValue): Affine2 =>
  placementAffine(shape.positionMm, shape.type === "circle" ? 0 : shape.rotationDeg);

/** Area-local → building-floor frame. */
export const areaToFloorAffine = (area: Pick<AreaValue, "positionMm" | "rotationDeg">): Affine2 =>
  placementAffine(area.positionMm, area.rotationDeg);

/** Shape-local → building-floor frame. */
export const shapeToFloorAffine = (
  area: Pick<AreaValue, "positionMm" | "rotationDeg">,
  shape: ShapeValue,
): Affine2 => composeAffine(areaToFloorAffine(area), shapeToAreaAffine(shape));

/**
 * Building-floor local → house frame (Phase 16, D03): a pure translation (no rotation) by the floor's plan offset and
 * finished-floor elevation, in plan mm (x, y, h). Inside the renderer's plan root this is the floor group's position.
 */
export const floorToHouseOffset = (floor: Pick<BuildingFloorValue, "positionMm" | "elevationMm">): Vec3 => {
  const placement = floorPlacementOf(floor);
  return { x: placement.xMm, y: placement.yMm, h: placement.elevationMm };
};

/** A floor-local point (plan mm) in the house frame. */
export const floorPointToHouse = (
  floor: Pick<BuildingFloorValue, "positionMm" | "elevationMm">,
  point: Vec3,
): Vec3 => {
  const offset = floorToHouseOffset(floor);
  return { x: point.x + offset.x, y: point.y + offset.y, h: point.h + offset.h };
};
