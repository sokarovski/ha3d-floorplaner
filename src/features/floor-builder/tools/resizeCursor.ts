// Direction-aware resize cursors (Phase 5.15, H19): a handle's resize direction is projected to the screen,
// and the nearest of the four CSS resize cursors is shown, so the cursor stays right on rotated rooms and in
// 3D. Vertices move freely and keep the move cursor.
import type { AreaValue } from "@shared/domain/schemas/area";
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import { rotateVec } from "@shared/geometry/vector";
import type { Vec2 } from "@shared/geometry/vector";
import type { ViewportRuntime } from "../../../renderer/runtimeTypes";
import { toFloor } from "./planGeometry";
import type { ShapeHandle } from "./shapeEditing";
import type { ViewportCursor } from "./toolTypes";

const sideDirections: Readonly<Record<"left" | "right" | "bottom" | "top", Vec2>> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  top: { x: 0, y: 1 },
  bottom: { x: 0, y: -1 },
};

/** The resize cursor for a drag from `from` toward `to` (area-local mm), as it appears on screen. */
export const resizeCursorAlong = (
  runtime: ViewportRuntime,
  area: AreaValue,
  from: Vec2,
  to: Vec2,
): ViewportCursor => resizeCursorBetween(runtime, toFloor(area, from), toFloor(area, to));

/** The resize cursor for a drag from `from` toward `to` given in building-floor mm at floor level. */
export const resizeCursorBetween = (runtime: ViewportRuntime, from: Vec2, to: Vec2): ViewportCursor => {
  const a = runtime.screenPointOf({ ...from, h: 0 });
  const b = runtime.screenPointOf({ ...to, h: 0 });
  if (a === null || b === null || Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return "move";
  // Screen y grows downward: 45° is down-right (nwse), 135° is down-left (nesw). Opposite directions share
  // a cursor, so fold into [0°, 180°) and take the nearest 45° step.
  const degrees = ((((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) % 180) + 180) % 180;
  const step = Math.round(degrees / 45) % 4;
  return step === 0 ? "resizeEW" : step === 1 ? "resizeNWSE" : step === 2 ? "resizeNS" : "resizeNESW";
};

/** The cursor for hovering or dragging one of a selected shape's handles. */
export const shapeHandleCursor = (
  runtime: ViewportRuntime,
  area: AreaValue,
  shape: ShapeValue,
  handle: ShapeHandle,
): ViewportCursor => {
  if (handle.kind === "vertex") return "move";
  if (handle.kind === "polygonEdge") return "default";
  const center = shape.positionMm;
  const along = (direction: Vec2): ViewportCursor =>
    resizeCursorAlong(runtime, area, center, { x: center.x + direction.x, y: center.y + direction.y });
  if (handle.kind === "quadrant") return along(handle.direction);
  if (shape.type !== "rectangle") return "move";
  const radians = (shape.rotationDeg * Math.PI) / 180;
  if (handle.kind === "rectEdge") return along(rotateVec(sideDirections[handle.side], radians));
  return along(
    rotateVec({ x: (handle.sx * shape.widthMm) / 2, y: (handle.sy * shape.heightMm) / 2 }, radians),
  );
};
