// Linear-light facing (Phase 13.3, spec/builder/features/lighting.md#linear-lighting): the direction an LED
// strip shines, turned about its own long axis. The angle turns the straight-down direction about the strip's
// heading by the right-hand rule: 0° down (absent = 0, the look before 13.3), 90° horizontal to the left of the
// heading (seen from above, looking along the heading), 180° up, 270° to the right.
import type { LightValue } from "../schemas/light";

/** A direction in the floor frame (x, y plan; h up), unit length. */
export type FacingDirection = Readonly<{ x: number; y: number; h: number }>;

/** The light's facing in degrees, 0 when absent or not a linear light. */
export const linearFacingDeg = (light: LightValue): number =>
  light.geometry.type === "linear" ? (light.geometry.facingDeg ?? 0) : 0;

/** The shining direction of a strip whose floor-frame heading is `headingDeg`, facing `facingDeg`. */
export const facingDirection = (headingDeg: number, facingDeg: number): FacingDirection => {
  const heading = (headingDeg * Math.PI) / 180;
  const facing = (facingDeg * Math.PI) / 180;
  const sideways = Math.sin(facing);
  // left of the heading = (−sin heading, cos heading); 0° facing = (0, 0, −1).
  return { x: -Math.sin(heading) * sideways, y: Math.cos(heading) * sideways, h: -Math.cos(facing) };
};

/** The facing (0–360°, whole degrees) whose direction, projected onto the plane across the strip, is (side, h). */
export const facingFromCrossSection = (side: number, h: number): number => {
  const degrees = (Math.atan2(side, -h) * 180) / Math.PI;
  return ((Math.round(degrees) % 360) + 360) % 360;
};
