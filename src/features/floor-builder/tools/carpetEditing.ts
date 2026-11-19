// A carpet as one object (Phase 5.14, spec/builder/features/materials-and-objects.md#6-carpets): the carpet
// as a virtual room for the Carpet Editor, and its shape-group frame (Phase 7.2, shared/geometry/shapeGroup.ts)
// placed in the building floor. Handles, resizing, and turning about the centre are the shape group's.
import type { AreaValue } from "@shared/domain/schemas/area";
import type { CarpetValue } from "@shared/domain/schemas/carpet";
import { applyAffine, composeAffine, placementAffine } from "@shared/geometry/affine";
import type { Affine2 } from "@shared/geometry/affine";
import { areaToFloorAffine } from "@shared/geometry/placement";
import { unionRings } from "@shared/geometry/polygonKernel";
import type { Region } from "@shared/geometry/region";
import { transformRing } from "@shared/geometry/region";
import { shapeGroupFrame } from "@shared/geometry/shapeGroup";
import type { ShapeGroupFrame } from "@shared/geometry/shapeGroup";
import { shapeOutline } from "@shared/geometry/shapeOutline";

let virtualCache: { area: AreaValue; carpet: CarpetValue; virtual: AreaValue } | undefined;

/**
 * The carpet as a virtual room (Carpet Editor): its pieces are the floor shapes and its placement is the
 * room's composed with the carpet's, so shape tools and shape overlays work in carpet-local coordinates
 * unchanged. Commands still target the real room ID plus the carpet ID.
 */
export const carpetAsArea = (area: AreaValue, carpet: CarpetValue): AreaValue => {
  if (virtualCache?.area === area && virtualCache.carpet === carpet) return virtualCache.virtual;
  const virtual: AreaValue = {
    ...area,
    positionMm: applyAffine(areaToFloorAffine(area), carpet.positionMm),
    rotationDeg: area.rotationDeg + carpet.rotationDeg,
    floor: { ...area.floor, shapes: carpet.shapes, carpets: [] },
    walls: [],
  };
  virtualCache = { area, carpet, virtual };
  return virtual;
};

export const carpetToFloorAffine = (area: AreaValue, carpet: CarpetValue): Affine2 =>
  composeAffine(areaToFloorAffine(area), placementAffine(carpet.positionMm, carpet.rotationDeg));

/** The carpet's box in its own axes, placed in the building floor. */
export const carpetFrame = (area: AreaValue, carpet: CarpetValue): ShapeGroupFrame =>
  shapeGroupFrame(carpet.shapes, carpetToFloorAffine(area, carpet));

/** The carpet's outline (union of its pieces) in floor coordinates, unclipped. */
export const carpetOutlineInFloor = (area: AreaValue, carpet: CarpetValue): Region => {
  const toFloor = carpetToFloorAffine(area, carpet);
  return unionRings(
    carpet.shapes.map((shape) => transformRing(shapeOutline(shape).ring, toFloor)),
    { closeContacts: false },
  );
};
