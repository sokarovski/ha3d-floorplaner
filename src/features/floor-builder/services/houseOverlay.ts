// Whole-house overview outlines in the house frame (Phase 16.4; owner feedback 16.13). The hover and the selection
// draw a floor as its bounding box (SketchUp's group box): an axis-aligned box around the slab outline, from the
// slab underside to the tallest wall top. A running floor move draws the moving floors' slab outlines instead, at
// the finished floor and the slab underside, because the move snaps those outlines' corners and edges.
import { floorPlacementOf, floorSlabOf, tallestWallMm } from "@shared/domain/house/floorPlacement";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { HouseDocument } from "@shared/domain/schemas/house";
import { floorOutlineInHouse } from "@shared/geometry/floorMove";
import type { OverlayPrimitive, OverlayTone, PlanPoint3 } from "../../../renderer/runtimeTypes";

/** Lifts the top outline off the room floors so it is not hidden by them (mm). */
const liftMm = 4;

/** A moving floor's slab outline at its finished floor and, dashed, at its slab underside. */
export const floorOutlineOverlay = (
  floor: BuildingFloorValue,
  tone: OverlayTone,
  offset: PlanPoint3 = { x: 0, y: 0, h: 0 },
): OverlayPrimitive[] => {
  const top = floorPlacementOf(floor).elevationMm + offset.h;
  const bottom = top - floorSlabOf(floor).thicknessMm;
  return floorOutlineInHouse(floor, offset).flatMap((ring): OverlayPrimitive[] => {
    const lines: OverlayPrimitive[] = [
      {
        kind: "polyline",
        points: ring.map((point) => ({ ...point, h: top + liftMm })),
        closed: true,
        tone,
      },
    ];
    if (bottom !== top)
      lines.push({
        kind: "polyline",
        points: ring.map((point) => ({ ...point, h: bottom - 1 })),
        closed: true,
        tone,
        dashed: true,
      });
    return lines;
  });
};

/**
 * A floor's bounding box (twelve thin edges): the slab outline's plan bounds, from the slab underside to the
 * finished floor plus the tallest wall (the roof ignored). Empty for a floor without an outline (no areas).
 */
export const floorBoxOverlay = (
  floor: BuildingFloorValue,
  house: Pick<HouseDocument, "defaultWallHeightMm">,
  tone: OverlayTone,
): OverlayPrimitive[] => {
  const points = floorOutlineInHouse(floor).flat();
  if (points.length === 0) return [];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const floorH = floorPlacementOf(floor).elevationMm;
  const bottom = floorH - floorSlabOf(floor).thicknessMm;
  const top = floorH + tallestWallMm(floor, house);
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  return corners.flatMap((corner, index): OverlayPrimitive[] => {
    const next = corners[(index + 1) % corners.length] ?? corner;
    return [
      { kind: "segment", from: { ...corner, h: bottom }, to: { ...next, h: bottom }, tone },
      { kind: "segment", from: { ...corner, h: top }, to: { ...next, h: top }, tone },
      { kind: "segment", from: { ...corner, h: bottom }, to: { ...corner, h: top }, tone },
    ];
  });
};

/** The selected floors' bounding boxes in the overview (SketchUp shows a selected group's box). */
export const selectedFloorsOverlay = (
  house: HouseDocument,
  selection: readonly string[],
): OverlayPrimitive[] =>
  house.floors
    .filter((floor) => selection.includes(floor.id))
    .flatMap((floor) => floorBoxOverlay(floor, house, "accent"));
