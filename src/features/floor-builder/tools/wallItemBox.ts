// Wall items (Phase 15.8, owner report): a door, window, or other opening, or an object hung on a wall, shows
// its own selection box with stretch handles, never its wall's highlight. The box comes from the built model;
// its handles sit on the box's middle plane parallel to the wall: corners and side midpoints where the
// template can be resized (width along the wall, height up it), and a Move cross in the centre (Move slides
// along the wall). Top view sees the wall face edge-on, so it shows only the two width handles and the cross.
import { indexEntities } from "@shared/domain/house/entityIndex";
import type { EntityRef } from "@shared/domain/house/entityIndex";
import type { HouseDocument } from "@shared/domain/schemas/house";
import { isSchemaNode, numericLimits } from "@shared/domain/schemas/schemaWalk";
import type { Vec2 } from "@shared/geometry/vector";
import type { OverlayPrimitive, PlanPoint3, ViewportRuntime } from "../../../renderer/runtimeTypes";
import { instanceSchemaFor } from "../services/instanceSchemas";
import { wallEndLines } from "./planGeometry";
import { wallItemTopLimitMm } from "@shared/geometry/roofItems";
import { floorRoofLimit } from "@shared/geometry/roofLimit";
import { heightToleranceMm } from "@shared/geometry/tolerances";

export type WallItemRef =
  | Extract<EntityRef, { kind: "opening" }>
  | (Extract<EntityRef, { kind: "object" }> & Readonly<{ wallId: string }>);

/** A size parameter the handles can change, with the template's limits. */
export type WallItemSize = Readonly<{
  key: "widthMm" | "heightMm";
  valueMm: number;
  minMm: number;
  maxMm: number;
}>;

/** Which handle: sx −1 left, +1 right along the wall; sy −1 bottom, +1 top; both 0 is the Move cross. */
export type WallItemHandle = Readonly<{ sx: -1 | 0 | 1; sy: -1 | 0 | 1 }>;

export type WallItemBox = Readonly<{
  ref: WallItemRef;
  /** Wall span start (floor plan) and unit direction along the wall; span length. */
  start: Vec2;
  direction: Vec2;
  lengthMm: number;
  wallHeightMm: number;
  /** Offset (floor plan) from the wall line to the box's middle plane. */
  offset: Vec2;
  /** The box on the wall: along the span from its start, and height. */
  leftMm: number;
  rightMm: number;
  bottomMm: number;
  topMm: number;
  width: WallItemSize | undefined;
  height: WallItemSize | undefined;
  /** The instance's own position: centre along the wall and bottom (opening) or elevation (object). */
  alongMm: number;
  baseMm: number;
  /**
   * The window limit (Phase 19.2): the lowest roof underside over the box from leftMm to rightMm (along the span) on
   * the faces the item reaches (both for an opening, its own for a hung object), or null where no roof is over it.
   */
  roofTopMm: (leftMm: number, rightMm: number) => number | null;
  /** Walls rise to the roof: the wall reaches the underside, so the item may too (else the wall's top limits it). */
  wallsRiseToRoof: boolean;
}>;

/** The selected wall item behind an ID, or undefined for anything else. */
export const wallItemRefOf = (house: HouseDocument, id: string): WallItemRef | undefined => {
  const ref = indexEntities(house).get(id);
  if (ref?.kind === "opening") return ref;
  if (
    ref?.kind === "object" &&
    ref.value.attachment.host === "wall" &&
    ref.value.attachment.wallId !== undefined
  )
    return { ...ref, wallId: ref.value.attachment.wallId };
  return undefined;
};

const sizeOf = (houseId: string, ref: WallItemRef, key: "widthMm" | "heightMm"): WallItemSize | undefined => {
  const value = ref.value.parameters[key];
  const schema = instanceSchemaFor(houseId, ref);
  if (typeof value !== "number" || schema === undefined || !isSchemaNode(schema)) return undefined;
  const properties = schema.properties;
  const parameters = isSchemaNode(properties) ? properties.parameters : undefined;
  const declared = isSchemaNode(parameters) ? parameters.properties : undefined;
  const node = isSchemaNode(declared) ? declared[key] : undefined;
  // Only a size the template declares (and so the panel shows) can be stretched.
  if (!isSchemaNode(node) || node.readOnly === true) return undefined;
  const limits = numericLimits(node);
  const minMm = Math.max(limits.minimum ?? 1, limits.exclusiveMinimum ?? 0, 1);
  const maxMm = Math.min(limits.maximum ?? Number.POSITIVE_INFINITY, limits.exclusiveMaximum ?? Infinity);
  return maxMm <= minMm ? undefined : { key, valueMm: value, minMm, maxMm };
};

const mid = (a: PlanPoint3 | undefined, b: PlanPoint3 | undefined): PlanPoint3 | undefined =>
  a === undefined || b === undefined
    ? undefined
    : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, h: (a.h + b.h) / 2 };

export const wallItemBox = (
  house: HouseDocument,
  runtime: ViewportRuntime,
  ref: WallItemRef,
): WallItemBox | undefined => {
  const floor = house.floors.find((candidate) => candidate.id === ref.floorId);
  const area = floor?.areas.find((a) => a.id === ref.areaId);
  const wall = area?.walls.find((candidate) => candidate.id === ref.wallId);
  if (floor === undefined || area === undefined || wall === undefined) return undefined;
  const lines = wallEndLines(area).filter((line) => line.wallId === ref.wallId);
  const startLine = lines.find((line) => line.end === "start");
  const endLine = lines.find((line) => line.end === "end");
  // Curved walls host no openings (D20) and get no stretch handles.
  if (startLine === undefined || endLine === undefined || startLine.arc !== null) return undefined;
  const corners = runtime.instanceBounds(ref.id);
  if (corners === null || corners.length < 8) return undefined;
  const start = startLine.point;
  const dx = endLine.point.x - start.x;
  const dy = endLine.point.y - start.y;
  const lengthMm = Math.hypot(dx, dy);
  if (lengthMm === 0) return undefined;
  const direction = { x: dx / lengthMm, y: dy / lengthMm };
  // Bottom corners 0..3 run (−x,−z), (+x,−z), (+x,+z), (−x,+z) in the model's frame: x is along the wall.
  const a = mid(corners[0], corners[3]);
  const b = mid(corners[1], corners[2]);
  if (a === undefined || b === undefined) return undefined;
  const alongOf = (point: Vec2): number =>
    (point.x - start.x) * direction.x + (point.y - start.y) * direction.y;
  const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const centreAlong = alongOf(centre);
  const heights = corners.map((corner) => corner.h);
  const along = [alongOf(a), alongOf(b)];
  return {
    ref,
    start,
    direction,
    lengthMm,
    wallHeightMm: wall.heightMm,
    offset: {
      x: centre.x - (start.x + direction.x * centreAlong),
      y: centre.y - (start.y + direction.y * centreAlong),
    },
    leftMm: Math.min(...along),
    rightMm: Math.max(...along),
    bottomMm: Math.min(...heights),
    topMm: Math.max(...heights),
    width: sizeOf(house.id, ref, "widthMm"),
    height: sizeOf(house.id, ref, "heightMm"),
    alongMm: ref.kind === "opening" ? ref.value.placement.distanceAlongWallMm : ref.value.positionMm.x,
    baseMm: ref.kind === "opening" ? ref.value.placement.bottomMm : ref.value.elevationMm,
    wallsRiseToRoof: (floorRoofLimit(floor)?.wallsRise ?? false) && wall.riseToRoof !== false,
    roofTopMm: (leftMm, rightMm) =>
      wallItemTopLimitMm(
        floor,
        ref.areaId,
        ref.wallId,
        (leftMm + rightMm) / 2,
        rightMm - leftMm,
        ref.kind === "opening" ? ["interior", "exterior"] : [ref.value.attachment.hostSide ?? "interior"],
      ),
  };
};

/** A stretched box: its new sides, its new sizes, and the instance's new position. */
export type WallItemResize = Readonly<{
  leftMm: number;
  rightMm: number;
  bottomMm: number;
  topMm: number;
  widthMm: number | undefined;
  heightMm: number | undefined;
  alongMm: number;
  baseMm: number;
}>;

/** Pointer or typed input of a stretch: where the grabbed side is, or the exact size (the panel's value). */
export type WallItemStretchInput = Readonly<{
  alongMm?: number;
  hMm?: number;
  typedWidthMm?: number;
  typedHeightMm?: number;
  aboutCentre: boolean;
}>;

/**
 * One axis of a stretch. The box may be larger than the size parameter (a door's lining), so the parameter
 * changes by as much as the box does. The size stays within the template's limits and the box within
 * [lowMm, highMm] (the wall's span, or its floor and top).
 */
const stretchAxis = (
  side: -1 | 1,
  low: number,
  high: number,
  size: WallItemSize,
  pointer: number | undefined,
  typed: number | undefined,
  aboutCentre: boolean,
  lowMm: number,
  highMm: number,
): readonly [number, number, number] => {
  const extra = high - low - size.valueMm;
  const centre = (low + high) / 2;
  const fixed = side === 1 ? low : high;
  const wanted =
    typed ??
    (pointer === undefined
      ? size.valueMm
      : (aboutCentre ? 2 * Math.abs(pointer - centre) : side * (pointer - fixed)) - extra);
  const room =
    (aboutCentre
      ? 2 * Math.min(centre - lowMm, highMm - centre)
      : side === 1
        ? highMm - fixed
        : fixed - lowMm) - extra;
  const value = Math.round(Math.max(size.minMm, Math.min(size.maxMm, wanted, Math.floor(room))));
  const box = value + extra;
  if (aboutCentre) return [centre - box / 2, centre + box / 2, value];
  return side === 1 ? [fixed, fixed + box, value] : [fixed - box, fixed, value];
};

/** Stretches the box by a handle (a side changes one size, a corner both); undefined for the Move cross. */
export const stretchWallItem = (
  box: WallItemBox,
  handle: WallItemHandle,
  input: WallItemStretchInput,
): WallItemResize | undefined => {
  if (handle.sx === 0 && handle.sy === 0) return undefined;
  let { leftMm, rightMm, bottomMm, topMm } = box;
  let widthMm: number | undefined;
  let heightMm: number | undefined;
  if (handle.sx !== 0 && box.width !== undefined)
    [leftMm, rightMm, widthMm] = stretchAxis(
      handle.sx,
      box.leftMm,
      box.rightMm,
      box.width,
      input.alongMm,
      input.typedWidthMm,
      input.aboutCentre,
      0,
      box.lengthMm,
    );
  // The window limit (Phase 19.2): under a roof the top stops at the underside over the item (snapped down).
  const roofTop = box.roofTopMm(box.leftMm, box.rightMm);
  if (handle.sy !== 0 && box.height !== undefined)
    [bottomMm, topMm, heightMm] = stretchAxis(
      handle.sy,
      box.bottomMm,
      box.topMm,
      box.height,
      input.hMm,
      input.typedHeightMm,
      input.aboutCentre,
      0,
      roofTop === null
        ? Math.max(box.wallHeightMm, box.topMm)
        : Math.max(
            box.bottomMm,
            box.wallsRiseToRoof ? roofTop : Math.min(Math.max(box.wallHeightMm, box.topMm), roofTop),
          ),
    );
  // A wider box whose top would be above the roof over its new span is refused (its width stays).
  if (widthMm !== undefined && (leftMm !== box.leftMm || rightMm !== box.rightMm)) {
    const wideTop = box.roofTopMm(leftMm, rightMm);
    if (
      wideTop !== null &&
      topMm > wideTop + heightToleranceMm &&
      topMm <= (roofTop ?? Infinity) + heightToleranceMm
    ) {
      leftMm = box.leftMm;
      rightMm = box.rightMm;
      widthMm = undefined;
    }
  }
  const centreShift = (leftMm + rightMm) / 2 - (box.leftMm + box.rightMm) / 2;
  return {
    leftMm,
    rightMm,
    bottomMm,
    topMm,
    widthMm,
    heightMm,
    alongMm: Math.round(box.alongMm + centreShift),
    baseMm: Math.max(0, Math.round(box.baseMm + bottomMm - box.bottomMm)),
  };
};

/** The property updates of a stretch, for one undo step (sizes, then the position they move). */
export const wallItemResizeUpdates = (
  box: WallItemBox,
  resize: WallItemResize,
): readonly Readonly<{ path: readonly string[]; value: unknown }>[] => {
  const { ref } = box;
  const updates: { path: readonly string[]; value: unknown }[] = [];
  if (resize.widthMm !== undefined) updates.push({ path: ["parameters", "widthMm"], value: resize.widthMm });
  if (resize.heightMm !== undefined)
    updates.push({ path: ["parameters", "heightMm"], value: resize.heightMm });
  if (ref.kind === "opening")
    updates.push(
      { path: ["placement", "distanceAlongWallMm"], value: resize.alongMm },
      { path: ["placement", "bottomMm"], value: resize.baseMm },
    );
  else
    updates.push(
      { path: ["positionMm"], value: { x: resize.alongMm, y: ref.value.positionMm.y } },
      { path: ["elevationMm"], value: resize.baseMm },
    );
  return updates;
};

/** Where a handle sits on the box. */
export const wallItemHandlePoint = (
  box: Pick<WallItemBox, "start" | "direction" | "offset" | "leftMm" | "rightMm" | "bottomMm" | "topMm">,
  handle: WallItemHandle,
): PlanPoint3 => {
  const along =
    handle.sx === -1 ? box.leftMm : handle.sx === 1 ? box.rightMm : (box.leftMm + box.rightMm) / 2;
  const h = handle.sy === -1 ? box.bottomMm : handle.sy === 1 ? box.topMm : (box.bottomMm + box.topMm) / 2;
  return {
    x: box.start.x + box.direction.x * along + box.offset.x,
    y: box.start.y + box.direction.y * along + box.offset.y,
    h,
  };
};

/** The handles the box offers: corners first, then sides, then the Move cross (hit order). */
export const wallItemHandles = (box: WallItemBox, topView: boolean): readonly WallItemHandle[] => {
  const handles: WallItemHandle[] = [];
  const both = box.width !== undefined && box.height !== undefined && !topView;
  if (both) for (const sx of [-1, 1] as const) for (const sy of [-1, 1] as const) handles.push({ sx, sy });
  if (box.width !== undefined) for (const sx of [-1, 1] as const) handles.push({ sx, sy: 0 });
  if (box.height !== undefined && !topView) for (const sy of [-1, 1] as const) handles.push({ sx: 0, sy });
  handles.push({ sx: 0, sy: 0 });
  return handles;
};

export const isCornerHandle = (handle: WallItemHandle): boolean => handle.sx !== 0 && handle.sy !== 0;

/** The handles as overlay primitives (the box itself is drawn with the other object boxes). */
export const wallItemHandlesOverlay = (box: WallItemBox, topView: boolean): OverlayPrimitive[] =>
  wallItemHandles(box, topView).map((handle): OverlayPrimitive => {
    const move = handle.sx === 0 && handle.sy === 0;
    return {
      kind: "point",
      at: wallItemHandlePoint(box, handle),
      marker: move ? "cross" : "dot",
      sizePx: move ? 12 : 8,
      tone: "accent",
    };
  });

/** The face rectangle of a box on its middle plane (the preview outline while stretching). */
export const wallItemOutline = (
  box: Pick<WallItemBox, "start" | "direction" | "offset" | "leftMm" | "rightMm" | "bottomMm" | "topMm">,
): OverlayPrimitive => ({
  kind: "polyline",
  points: [
    wallItemHandlePoint(box, { sx: -1, sy: -1 }),
    wallItemHandlePoint(box, { sx: 1, sy: -1 }),
    wallItemHandlePoint(box, { sx: 1, sy: 1 }),
    wallItemHandlePoint(box, { sx: -1, sy: 1 }),
  ],
  closed: true,
  tone: "accentStrong",
});
