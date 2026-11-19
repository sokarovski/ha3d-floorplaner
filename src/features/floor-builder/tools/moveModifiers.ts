// Nudge's explicit movement modes use the active floor's red/green axes, even inside rotated rooms.
import type { Vec2 } from "@shared/geometry/vector";
import type { InferenceCue } from "../inference/inferenceTypes";

export type MoveModifiers = Readonly<{ shiftKey: boolean; ctrlKey: boolean }>;

export const moveAxis = (offset: Vec2): Vec2 =>
  Math.abs(offset.x) >= Math.abs(offset.y) ? { x: 1, y: 0 } : { x: 0, y: 1 };

/** Ctrl takes precedence over Shift; Shift re-evaluates the dominant plan axis on every update. */
export const constrainMove = (offset: Vec2, modifiers: MoveModifiers): Vec2 => {
  if (modifiers.ctrlKey || !modifiers.shiftKey) return offset;
  const axis = moveAxis(offset);
  return { x: offset.x * axis.x, y: offset.y * axis.y };
};

export const moveAxisCue = (origin: Vec2, offset: Vec2, heightMm = 0): InferenceCue => {
  const color = offset.y === 0 ? "axisX" : "axisY";
  const marker = { x: origin.x + offset.x, y: origin.y + offset.y, h: heightMm };
  return {
    lines: [{ from: { ...origin, h: heightMm }, to: marker, color }],
    marker,
    label: color === "axisX" ? "Red axis (Shift)" : "Green axis (Shift)",
  };
};
