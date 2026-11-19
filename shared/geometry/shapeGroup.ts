// A shape group as one object (Phase 7.2, spec/builder/screens/floor-builder.md#shape-groups): the area floor,
// a carpet, and a wall feature each hold `shapes[]` in their own 2D axes. The group's frame is the bounding box
// of its shapes in those axes plus the affine to the edit plane (the building floor, or the wall face), with
// eight resize handles; resizing scales every shape together about the opposite side/corner or the centre,
// and a group with its own placement (a carpet) turns about its box centre. Pure geometry: tools own input,
// preview, and commands.
import { rectangleAsPolygon } from "../domain/commands/shapeCommands";
import type { ShapeValue } from "../domain/schemas/shapes";
import { applyAffine, invertAffine } from "./affine";
import type { Affine2 } from "./affine";
import { shapeOutline } from "./shapeOutline";
import { rotateVec } from "./vector";
import type { Vec2 } from "./vector";

/** The smallest box side a group resize may leave (mm). */
export const minGroupSideMm = 50;

export type ShapeGroupFrame = Readonly<{
  /** Group-local → edit-plane coordinates (building floor, or the wall face's along/up). */
  toPlane: Affine2;
  fromPlane: Affine2;
  /** Bounding box of the shapes in group-local coordinates. */
  min: Vec2;
  max: Vec2;
}>;

/** The frame of `shapes` (group-local) placed on the edit plane by `toPlane`. */
export const shapeGroupFrame = (shapes: readonly ShapeValue[], toPlane: Affine2): ShapeGroupFrame => {
  const points = shapes.flatMap((shape) => shapeOutline(shape).ring);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    toPlane,
    fromPlane: invertAffine(toPlane),
    min: { x: Math.min(...xs), y: Math.min(...ys) },
    max: { x: Math.max(...xs), y: Math.max(...ys) },
  };
};

export const groupFrameCenter = (frame: ShapeGroupFrame): Vec2 => ({
  x: (frame.min.x + frame.max.x) / 2,
  y: (frame.min.y + frame.max.y) / 2,
});

/** A resize handle: sx/sy pick the box side (−1 min, 1 max, 0 neither); both non-zero is a corner. */
export type GroupHandle = Readonly<{ sx: -1 | 0 | 1; sy: -1 | 0 | 1 }>;

const handleSigns: readonly GroupHandle[] = [
  { sx: 1, sy: 1 },
  { sx: -1, sy: 1 },
  { sx: -1, sy: -1 },
  { sx: 1, sy: -1 },
  { sx: 1, sy: 0 },
  { sx: 0, sy: 1 },
  { sx: -1, sy: 0 },
  { sx: 0, sy: -1 },
];

const pick = (sign: -1 | 0 | 1, min: number, max: number): number =>
  sign > 0 ? max : sign < 0 ? min : (min + max) / 2;

export const isCornerHandle = (handle: GroupHandle): boolean => handle.sx !== 0 && handle.sy !== 0;

/** A handle's position in group-local coordinates. */
export const groupHandleLocal = (frame: ShapeGroupFrame, handle: GroupHandle): Vec2 => ({
  x: pick(handle.sx, frame.min.x, frame.max.x),
  y: pick(handle.sy, frame.min.y, frame.max.y),
});

/** The eight handles: corners first, then side midpoints, with their edit-plane positions. */
export const groupHandles = (
  frame: ShapeGroupFrame,
): readonly Readonly<{ handle: GroupHandle; local: Vec2; plane: Vec2 }>[] =>
  handleSigns.map((handle) => {
    const local = groupHandleLocal(frame, handle);
    return { handle, local, plane: applyAffine(frame.toPlane, local) };
  });

/** The handle within `radiusMm` of an edit-plane point; corners win over sides. */
export const groupHandleAt = (
  frame: ShapeGroupFrame,
  planePoint: Vec2,
  radiusMm: number,
): GroupHandle | undefined => {
  let best: { handle: GroupHandle; score: number } | undefined;
  for (const { handle, plane } of groupHandles(frame)) {
    const distance = Math.hypot(plane.x - planePoint.x, plane.y - planePoint.y);
    if (distance > radiusMm) continue;
    // Corners get priority: they are scored as if half as far.
    const score = isCornerHandle(handle) ? distance / 2 : distance;
    if (best === undefined || score < best.score) best = { handle, score };
  }
  return best?.handle;
};

/** Whether an edit-plane point lies in the frame's box grown by `marginMm`. */
export const insideGroupFrame = (frame: ShapeGroupFrame, planePoint: Vec2, marginMm: number): boolean => {
  const local = applyAffine(frame.fromPlane, planePoint);
  return (
    local.x >= frame.min.x - marginMm &&
    local.x <= frame.max.x + marginMm &&
    local.y >= frame.min.y - marginMm &&
    local.y <= frame.max.y + marginMm
  );
};

const isQuarterTurn = (degrees: number): boolean => {
  const remainder = ((degrees % 90) + 90) % 90;
  return remainder < 1e-6 || 90 - remainder < 1e-6;
};

/**
 * Scales one shape about `anchor` (group-local) by sx/sy along the group's axes. A rectangle on the group's
 * axes stays a rectangle (same edge names); a rectangle turned off them becomes the equivalent polygon
 * (`rectangleAsPolygon` corner order: corner i starts edge bottom, right, top, left), since a non-uniform
 * scale would shear it. Polygons keep their vertex IDs.
 */
export const scaleShape = (shape: ShapeValue, anchor: Vec2, sx: number, sy: number): ShapeValue => {
  const scalePoint = (point: Vec2): Vec2 => ({
    x: anchor.x + (point.x - anchor.x) * sx,
    y: anchor.y + (point.y - anchor.y) * sy,
  });
  const position = scalePoint(shape.positionMm);
  if (shape.type === "circle")
    return { ...shape, positionMm: position, radiusMm: shape.radiusMm * Math.sqrt(sx * sy) };
  if (shape.type === "rectangle" && (isQuarterTurn(shape.rotationDeg) || sx === sy)) {
    const swapped = Math.round(shape.rotationDeg / 90) % 2 !== 0;
    return {
      ...shape,
      positionMm: position,
      widthMm: shape.widthMm * (swapped ? sy : sx),
      heightMm: shape.heightMm * (swapped ? sx : sy),
    };
  }
  const polygon = shape.type === "rectangle" ? rectangleAsPolygon(shape) : shape;
  const radians = (polygon.rotationDeg * Math.PI) / 180;
  return {
    ...polygon,
    positionMm: position,
    rotationDeg: 0,
    vertices: polygon.vertices.map((vertex) => {
      const world = rotateVec(vertex, radians);
      const scaled = scalePoint({ x: polygon.positionMm.x + world.x, y: polygon.positionMm.y + world.y });
      return { ...vertex, x: scaled.x - position.x, y: scaled.y - position.y };
    }),
  };
};

/** Whole millimetres, as other placement edits store them. */
export const roundShape = (shape: ShapeValue): ShapeValue => {
  const position = { x: Math.round(shape.positionMm.x), y: Math.round(shape.positionMm.y) };
  if (shape.type === "circle")
    return { ...shape, positionMm: position, radiusMm: Math.round(shape.radiusMm) };
  if (shape.type === "rectangle")
    return {
      ...shape,
      positionMm: position,
      widthMm: Math.round(shape.widthMm),
      heightMm: Math.round(shape.heightMm),
    };
  return {
    ...shape,
    positionMm: position,
    vertices: shape.vertices.map((vertex) => ({
      ...vertex,
      x: Math.round(vertex.x + shape.positionMm.x - position.x),
      y: Math.round(vertex.y + shape.positionMm.y - position.y),
    })),
  };
};

export type GroupResize = Readonly<{ shapes: readonly ShapeValue[]; widthMm: number; depthMm: number }>;

export type GroupTypedSize = Readonly<{ widthMm?: number; depthMm?: number }>;

/**
 * The group's shapes when the grabbed handle's box side/corner moves to `target` (group-local) or, when given,
 * the box takes `typedSize` (width and/or depth). The opposite side stays, or the centre with `aboutCenter`.
 * A group with a circle scales uniformly (a circle cannot stretch on one axis). No side goes below
 * `minGroupSideMm`.
 */
export const resizeShapeGroup = (
  shapes: readonly ShapeValue[],
  frame: ShapeGroupFrame,
  handle: GroupHandle,
  target: Vec2,
  aboutCenter: boolean,
  typedSize?: GroupTypedSize,
): GroupResize => {
  const center = groupFrameCenter(frame);
  const width = frame.max.x - frame.min.x;
  const depth = frame.max.y - frame.min.y;
  const anchor = {
    x: aboutCenter || handle.sx === 0 ? center.x : handle.sx > 0 ? frame.min.x : frame.max.x,
    y: aboutCenter || handle.sy === 0 ? center.y : handle.sy > 0 ? frame.min.y : frame.max.y,
  };
  const factor = (
    sign: -1 | 0 | 1,
    typed: number | undefined,
    size: number,
    pointer: number,
    anchorAt: number,
    min: number,
    max: number,
  ): number =>
    sign === 0
      ? 1
      : typed !== undefined
        ? Math.max(typed / size, minGroupSideMm / size)
        : Math.max((pointer - anchorAt) / ((sign > 0 ? max : min) - anchorAt), minGroupSideMm / size);
  const sxRaw = factor(handle.sx, typedSize?.widthMm, width, target.x, anchor.x, frame.min.x, frame.max.x);
  const syRaw = factor(handle.sy, typedSize?.depthMm, depth, target.y, anchor.y, frame.min.y, frame.max.y);
  const uniform = shapes.some((shape) => shape.type === "circle");
  const s = handle.sx === 0 ? syRaw : handle.sy === 0 ? sxRaw : Math.max(sxRaw, syRaw);
  const sx = uniform ? s : sxRaw;
  const sy = uniform ? s : syRaw;
  return {
    shapes: shapes.map((shape) => roundShape(scaleShape(shape, anchor, sx, sy))),
    widthMm: width * sx,
    depthMm: depth * sy,
  };
};

/**
 * A group placement turned to `rotationDeg` about its box centre: the position moves so the centre stays.
 * Only for a group with its own placement (a carpet); the area floor turns with its room.
 */
export const rotateGroupAboutCenter = (
  placement: Readonly<{ positionMm: Vec2; rotationDeg: number }>,
  frame: ShapeGroupFrame,
  rotationDeg: number,
): Readonly<{ positionMm: Vec2; rotationDeg: number }> => {
  const center = groupFrameCenter(frame);
  const before = rotateVec(center, (placement.rotationDeg * Math.PI) / 180);
  const after = rotateVec(center, (rotationDeg * Math.PI) / 180);
  return {
    positionMm: {
      x: Math.round(placement.positionMm.x + before.x - after.x),
      y: Math.round(placement.positionMm.y + before.y - after.y),
    },
    rotationDeg,
  };
};
