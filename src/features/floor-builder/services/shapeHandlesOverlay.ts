// Handles for selected shapes in the Room Editor: polygon vertices, rectangle corners and side midpoints,
// circle quadrant points on the floor's axes (Phase 4.2), and the centre of rectangles and circles (the Nudge
// centre grab), over the shape outline. A selected shape group (Phase 7.2) shows its box with a centre cross and
// corner and side handles, drawn like a shape's: a carpet (also shaded as one object, Phase 5.14), a room, and
// a wall feature in the face view.
import { shapeOutline } from "@shared/geometry/shapeOutline";
import { indexEntities } from "@shared/domain/house/entityIndex";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { CarpetValue } from "@shared/domain/schemas/carpet";
import type { HouseDocument } from "@shared/domain/schemas/house";
import { applyAffine, identityAffine } from "@shared/geometry/affine";
import { areaToFloorAffine } from "@shared/geometry/placement";
import { groupFrameCenter, groupHandles, shapeGroupFrame } from "@shared/geometry/shapeGroup";
import type { ShapeGroupFrame } from "@shared/geometry/shapeGroup";
import type { OverlayPrimitive } from "../../../renderer/runtimeTypes";
import { toFloor } from "../tools/planGeometry";
import { featureAsArea, overlayOnFace } from "./faceSpace";
import type { WallFace } from "./wallFace";
import { carpetAsArea, carpetFrame, carpetOutlineInFloor } from "../tools/carpetEditing";
import {
  circleQuadrants,
  polygonPoints,
  rectangleCorners,
  rectangleSideMidpoints,
} from "../tools/shapeEditing";

/** A shape group's box (Phase 7.2): its outline, centre cross, and eight resize handles, in the edit plane. */
const groupBoxOverlay = (frame: ShapeGroupFrame): OverlayPrimitive[] => {
  const box = [frame.min, { x: frame.max.x, y: frame.min.y }, frame.max, { x: frame.min.x, y: frame.max.y }];
  return [
    {
      kind: "polyline",
      points: box.map((point) => applyAffine(frame.toPlane, point)),
      closed: true,
      tone: "accent",
    },
    {
      kind: "point",
      at: applyAffine(frame.toPlane, groupFrameCenter(frame)),
      marker: "cross",
      sizePx: 12,
      tone: "accent",
    },
    ...groupHandles(frame).map(({ plane }): OverlayPrimitive => ({
      kind: "point",
      at: plane,
      marker: "dot",
      sizePx: 8,
      tone: "accent",
    })),
  ];
};

const carpetOverlay = (area: AreaValue, carpet: CarpetValue): OverlayPrimitive[] => {
  const shade = carpetOutlineInFloor(area, carpet).polygons.map((polygon): OverlayPrimitive => ({
    kind: "polygon",
    points: polygon.outer,
    holes: polygon.holes,
    fillOpacity: 0.3,
    outline: true,
    tone: "accentStrong",
  }));
  return [...shade, ...groupBoxOverlay(carpetFrame(area, carpet))];
};

/** The open carpet's outline while the Carpet Editor is open: a dashed line around the union of its pieces. */
export const openCarpetOverlay = (
  house: HouseDocument,
  focusCarpetId: string | undefined,
): readonly OverlayPrimitive[] => {
  if (focusCarpetId === undefined) return [];
  const entities = indexEntities(house);
  const ref = entities.get(focusCarpetId);
  if (ref?.kind !== "carpet") return [];
  const host = entities.get(ref.areaId);
  if (host?.kind !== "area") return [];
  return carpetOutlineInFloor(host.value, ref.value).polygons.flatMap((polygon) =>
    [polygon.outer, ...polygon.holes].map((ring): OverlayPrimitive => ({
      kind: "polyline",
      points: ring,
      closed: true,
      dashed: true,
      tone: "accent",
    })),
  );
};

export const shapeHandlesOverlay = (
  house: HouseDocument,
  selection: readonly string[],
  /** The active floor: a selected room's box is drawn only for a room on it. */
  floorId: string,
  /** The open wall face: shapes of a wall feature are drawn on it (face coordinates → 3D). */
  face?: WallFace,
): readonly OverlayPrimitive[] => {
  const entities = indexEntities(house);
  const overlay: OverlayPrimitive[] = [];
  // Whole-group boxes are shown for exactly one selected group, as Select resizes only then.
  const single = selection.length === 1;
  for (const id of selection) {
    const ref = entities.get(id);
    if (ref?.kind === "carpet") {
      const host = entities.get(ref.areaId);
      if (host?.kind === "area") overlay.push(...carpetOverlay(host.value, ref.value));
      continue;
    }
    if (ref?.kind === "area") {
      if (single && face === undefined && ref.floorId === floorId && ref.value.floor.shapes.length > 0)
        overlay.push(
          ...groupBoxOverlay(shapeGroupFrame(ref.value.floor.shapes, areaToFloorAffine(ref.value))),
        );
      continue;
    }
    if (ref?.kind === "relief") {
      // The feature's shapes come from the shown (previewed) document, so the box follows a live resize.
      const onFace = face?.reliefs.some((candidate) => candidate.id === ref.value.id) ?? false;
      if (single && face !== undefined && onFace && ref.value.shapes.length > 0)
        overlay.push(
          ...overlayOnFace(face, groupBoxOverlay(shapeGroupFrame(ref.value.shapes, identityAffine))),
        );
      continue;
    }
    if (ref?.kind !== "shape") continue;
    const room = entities.get(ref.areaId);
    if (room?.kind !== "area") continue;
    // A carpet piece is drawn in its carpet's frame (Carpet Editor, Phase 5.14).
    const carpet =
      ref.carpetId === undefined
        ? undefined
        : room.value.floor.carpets.find((candidate) => candidate.id === ref.carpetId);
    const relief =
      ref.reliefId === undefined
        ? undefined
        : room.value.walls
            .flatMap((wall) => wall.reliefs ?? [])
            .find((candidate) => candidate.id === ref.reliefId);
    if (ref.reliefId !== undefined && (relief === undefined || face === undefined)) continue;
    const area = {
      value:
        relief !== undefined
          ? featureAsArea(room.value, relief)
          : carpet === undefined
            ? room.value
            : carpetAsArea(room.value, carpet),
    };
    const out: OverlayPrimitive[] = [];
    const outline = shapeOutline(ref.value).ring.map((point) => toFloor(area.value, point));
    // Selected shapes read darker than hover and drawing previews (accent at 12–20 %): a strong tint plus a
    // strong outline, so the selection stands out from neighbouring shapes and carpets (owner, Phase 5).
    out.push({ kind: "polygon", points: outline, fillOpacity: 0.3, outline: true, tone: "accentStrong" });
    const handles =
      ref.value.type === "polygon"
        ? polygonPoints(ref.value)
        : ref.value.type === "rectangle"
          ? [
              ...rectangleCorners(ref.value).map((corner) => corner.point),
              ...rectangleSideMidpoints(ref.value),
            ]
          : circleQuadrants(ref.value.positionMm, ref.value.radiusMm, area.value.rotationDeg).map(
              (quadrant) => quadrant.point,
            );
    // Rectangles and circles also show their centre: Nudge grabs and snaps from it.
    if (ref.value.type !== "polygon")
      out.push({
        kind: "point",
        at: toFloor(area.value, ref.value.positionMm),
        marker: "cross",
        sizePx: 12,
        tone: "accent",
      });
    for (const handle of handles)
      out.push({
        kind: "point",
        at: toFloor(area.value, handle),
        marker: "dot",
        sizePx: 8,
        tone: "accent",
      });
    overlay.push(...(relief !== undefined && face !== undefined ? overlayOnFace(face, out) : out));
  }
  return overlay;
};
