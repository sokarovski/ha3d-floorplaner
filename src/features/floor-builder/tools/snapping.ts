// Geometry helpers for tools (plan mm) and direction/angle snapping. Point inference lives in ../inference.
// Capture distance is screen-space (D05: 8–12 px), converted with the current mm-per-pixel scale. Typed
// values are never snapped.
import type { Vec2 } from "@shared/geometry/vector";

export const snapCapturePx = 10;

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export const projectOnSegment = (point: Vec2, a: Vec2, b: Vec2): Vec2 => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return a;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return { x: a.x + t * dx, y: a.y + t * dy };
};

export const projectOnLine = (point: Vec2, origin: Vec2, direction: Vec2): Vec2 => {
  const t = (point.x - origin.x) * direction.x + (point.y - origin.y) * direction.y;
  return { x: origin.x + t * direction.x, y: origin.y + t * direction.y };
};

/** Snaps a free direction to the nearest inferred axis (plan axes plus given edge directions) within ~5°. */
export const inferAxis = (direction: Vec2, candidates: readonly Vec2[]): Vec2 => {
  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) return { x: 1, y: 0 };
  const unit = { x: direction.x / length, y: direction.y / length };
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }, ...candidates];
  let best = unit;
  let bestSine = Math.sin((5 * Math.PI) / 180);
  for (const axis of axes) {
    const axisLength = Math.hypot(axis.x, axis.y);
    if (axisLength === 0) continue;
    const a = { x: axis.x / axisLength, y: axis.y / axisLength };
    const sine = Math.abs(unit.x * a.y - unit.y * a.x);
    if (sine <= bestSine) {
      const sign = unit.x * a.x + unit.y * a.y >= 0 ? 1 : -1;
      best = { x: a.x * sign, y: a.y * sign };
      bestSine = sine;
    }
  }
  return best;
};

export const snapAngle = (
  degrees: number,
  stepDeg: number,
  extraTargets: readonly number[],
  toleranceDeg: number,
): number => {
  const stepped = Math.round(degrees / stepDeg) * stepDeg;
  let best = Math.abs(stepped - degrees) <= toleranceDeg ? stepped : degrees;
  for (const target of extraTargets) {
    const delta = ((target - degrees + 540) % 360) - 180;
    if (Math.abs(delta) <= toleranceDeg && Math.abs(delta) < Math.abs(best - degrees)) best = degrees + delta;
  }
  return best;
};
