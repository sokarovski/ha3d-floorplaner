// Where bubbles go (Phase 8.5, spec/home-assistant/viewer-mvp.md#bubbles). Pure: a room's frame in plan (its
// centre above the room and its longest side's direction) and the screen row the room's shown bubbles form along
// that side's projection. Checked by `npm run viewer:focus`.
import type { Region, Ring } from "@shared/geometry/region";
import { ringSignedArea } from "@shared/geometry/region";

export type PlanPoint = Readonly<{ x: number; y: number; h: number }>;
export type ScreenPoint = Readonly<{ x: number; y: number }>;

/** A room's bubble frame: the row's centre (plan mm) and the unit direction of the room's longest side. */
export type RoomFrame = Readonly<{ center: PlanPoint; axis: Readonly<{ x: number; y: number }> }>;

/** Room bubbles float this far above the room's highest wall top (implementation convention, mm). */
export const roomBubbleLiftMm = 250;

/** The centroid of a ring (its vertex mean when it has no area). */
const ringCentroid = (ring: Ring): Readonly<{ x: number; y: number }> => {
  const area = ringSignedArea(ring);
  if (Math.abs(area) < 1e-6) {
    const n = Math.max(ring.length, 1);
    return {
      x: ring.reduce((sum, point) => sum + point.x, 0) / n,
      y: ring.reduce((sum, point) => sum + point.y, 0) / n,
    };
  }
  let cx = 0;
  let cy = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    if (a === undefined || b === undefined) continue;
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
};

/**
 * The frame of a room's bubbles: centred on the largest floor polygon (its centroid), `roomBubbleLiftMm` above
 * `topMm` (the highest wall top), along that polygon's longest edge (pointing +x, or +y when it runs along y).
 */
export const roomFrame = (region: Region, topMm: number): RoomFrame | null => {
  const largest = [...region.polygons].sort(
    (a, b) => Math.abs(ringSignedArea(b.outer)) - Math.abs(ringSignedArea(a.outer)),
  )[0];
  if (largest === undefined || largest.outer.length < 2) return null;
  const ring = largest.outer;
  let axis = { x: 1, y: 0 };
  let longest = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    if (a === undefined || b === undefined) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length <= longest + 1e-6) continue;
    longest = length;
    const x = (b.x - a.x) / length;
    const y = (b.y - a.y) / length;
    axis = x < -1e-9 || (Math.abs(x) <= 1e-9 && y < 0) ? { x: -x, y: -y } : { x, y };
  }
  const centroid = ringCentroid(ring);
  return { center: { x: centroid.x, y: centroid.y, h: topMm + roomBubbleLiftMm }, axis };
};

/** Gap between neighbouring room bubbles on screen (px). */
export const rowGapPx = 8;

/**
 * Centres of a row of bubbles on screen: laid along `direction` (the projected longest side; horizontal when it
 * is degenerate, and always read left to right), centred on `center`. `sizes` are the bubbles' widths and
 * heights; each takes its extent along the direction.
 */
export const rowCenters = (
  center: ScreenPoint,
  direction: ScreenPoint,
  sizes: readonly Readonly<{ width: number; height: number }>[],
  gap = rowGapPx,
): ScreenPoint[] => {
  const length = Math.hypot(direction.x, direction.y);
  let dx = length < 1e-6 ? 1 : direction.x / length;
  let dy = length < 1e-6 ? 0 : direction.y / length;
  if (dx < 0 || (Math.abs(dx) < 1e-9 && dy < 0)) {
    dx = -dx;
    dy = -dy;
  }
  const extents = sizes.map((size) => Math.abs(dx) * size.width + Math.abs(dy) * size.height);
  const total = extents.reduce((sum, extent) => sum + extent, 0) + gap * Math.max(sizes.length - 1, 0);
  let along = -total / 2;
  return extents.map((extent) => {
    const middle = along + extent / 2;
    along += extent + gap;
    return { x: center.x + dx * middle, y: center.y + dy * middle };
  });
};
