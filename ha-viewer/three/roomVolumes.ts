// Room hit volumes and line-of-sight tests in plan millimetres (Phase 8.1, 8.2). Pure: no three.js, so the
// math can be checked from a script (scripts/check-room-focus.ts). A room volume is the area's floor shape
// extruded from the floor to its highest wall; it is analytic (no mesh), used only for picking.
import type { Region, Ring } from "@shared/geometry/region";
import { pointInRegion, pointInRing, regionRings, ringBounds } from "@shared/geometry/region";
import type { Bounds } from "@shared/geometry/region";

/** A point or a direction in plan mm (x, y on the floor, h up). */
export type PlanVector = Readonly<{ x: number; y: number; h: number }>;

/** A ray `origin + t · direction`, t ≥ 0 (direction need not be unit length). */
export type PlanRay = Readonly<{ origin: PlanVector; direction: PlanVector }>;

export type RoomVolume = Readonly<{ areaId: string; region: Region; bottomMm: number; topMm: number }>;

/** A vertical prism that blocks a line of sight: a wall band or an object's box. */
export type Occluder = Readonly<{ ring: Ring; bottomMm: number; topMm: number; bounds: Bounds }>;

export const occluder = (ring: Ring, bottomMm: number, topMm: number): Occluder => ({
  ring,
  bottomMm,
  topMm,
  bounds: ringBounds(ring),
});

const at = (ray: PlanRay, t: number): PlanVector => ({
  x: ray.origin.x + ray.direction.x * t,
  y: ray.origin.y + ray.direction.y * t,
  h: ray.origin.h + ray.direction.h * t,
});

/** Ray parameters where the ray's plan projection crosses the edges of `ring`. */
const ringCrossings = (ring: Ring, ray: PlanRay, out: number[]): void => {
  const d = ray.direction;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    if (a === undefined || b === undefined) continue;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denominator = d.x * ey - d.y * ex;
    if (Math.abs(denominator) < 1e-12) continue;
    const wx = a.x - ray.origin.x;
    const wy = a.y - ray.origin.y;
    const s = (wx * d.y - wy * d.x) / denominator;
    if (s < 0 || s > 1) continue;
    out.push((wx * ey - wy * ex) / denominator);
  }
};

/** Where the ray first enters the volume (its parameter t), or null when it misses it. */
export const volumeEntry = (volume: RoomVolume, ray: PlanRay): number | null => {
  const ts: number[] = [0];
  if (Math.abs(ray.direction.h) > 1e-12) {
    ts.push((volume.bottomMm - ray.origin.h) / ray.direction.h);
    ts.push((volume.topMm - ray.origin.h) / ray.direction.h);
  }
  for (const ring of regionRings(volume.region)) ringCrossings(ring, ray, ts);
  const sorted = ts.filter((t) => t >= 0 && Number.isFinite(t)).sort((a, b) => a - b);
  for (let index = 0; index < sorted.length; index += 1) {
    const from = sorted[index] ?? 0;
    const to = sorted[index + 1] ?? from + 1;
    if (to - from < 1e-9) continue;
    const middle = at(ray, (from + to) / 2);
    if (
      middle.h >= volume.bottomMm &&
      middle.h <= volume.topMm &&
      pointInRegion({ x: middle.x, y: middle.y }, volume.region)
    )
      return from;
  }
  return null;
};

/** The room whose volume the ray enters first, or null when it passes no room. */
export const nearestVolume = (
  volumes: readonly RoomVolume[],
  ray: PlanRay,
): Readonly<{ areaId: string; t: number }> | null => {
  let best: { areaId: string; t: number } | null = null;
  for (const volume of volumes) {
    const t = volumeEntry(volume, ray);
    if (t !== null && (best === null || t < best.t)) best = { areaId: volume.areaId, t };
  }
  return best;
};

/** True when the segment from `from` to `to` passes through the side of the prism (its ends excluded). */
export const segmentBlocked = (from: PlanVector, to: PlanVector, prism: Occluder): boolean => {
  const b = prism.bounds;
  if (
    Math.max(from.x, to.x) < b.minX ||
    Math.min(from.x, to.x) > b.maxX ||
    Math.max(from.y, to.y) < b.minY ||
    Math.min(from.y, to.y) > b.maxY ||
    Math.min(from.h, to.h) > prism.topMm ||
    Math.max(from.h, to.h) < prism.bottomMm
  )
    return false;
  const ray: PlanRay = {
    origin: from,
    direction: { x: to.x - from.x, y: to.y - from.y, h: to.h - from.h },
  };
  const ts: number[] = [];
  ringCrossings(prism.ring, ray, ts);
  for (const t of ts) {
    if (t <= 1e-6 || t >= 1 - 1e-6) continue;
    const h = from.h + ray.direction.h * t;
    if (h >= prism.bottomMm && h <= prism.topMm) return true;
  }
  return false;
};

/** True when the plan point lies inside any occluder's footprint (a sample under a wall is not a floor sample). */
export const insideAnyFootprint = (x: number, y: number, occluders: readonly Occluder[]): boolean =>
  occluders.some(
    (candidate) =>
      x >= candidate.bounds.minX &&
      x <= candidate.bounds.maxX &&
      y >= candidate.bounds.minY &&
      y <= candidate.bounds.maxY &&
      pointInRing({ x, y }, candidate.ring),
  );
