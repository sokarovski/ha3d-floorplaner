// Presence / intrusion sweeps (Phase 8.6, K18, Q6): the pure part. Which corners of a room's outline sweep, where
// each sensor sits, where its cone points at a given moment, and which corner a tap toggles. No three.js, so the
// math is checked from a script (npm run viewer:focus); intrusionSweep.ts draws it.
//
// Frames: corners are stored in the area's own frame (mm) and drawn in the building-floor (plan) frame, mm, h up.
import type { AreaValue } from "@shared/domain/schemas/area";
import { maxSweepCorners } from "@shared/domain/schemas/homeAssistant";
import type { HaSweepCornerValue } from "@shared/domain/schemas/homeAssistant";
import { applyAffine, applyLinear } from "@shared/geometry/affine";
import { computeAreaFloorGeometry, computeAreaLocalGeometry } from "@shared/geometry/areaGeometry";
import type { Ring } from "@shared/geometry/region";
import { pointInRing } from "@shared/geometry/region";

export type PlanXY = Readonly<{ x: number; y: number }>;
export type PlanXYH = Readonly<{ x: number; y: number; h: number }>;

/** Implementation conventions (Phase 8.6). */
export const sweepConventions = {
  /** The sensor sits this far below the room's highest wall top (mm), at most at `maxSensorMm`. */
  sensorBelowTopMm: 250,
  maxSensorMm: 2600,
  /** Fallback wall height of a room without walls (mm). */
  defaultWallMm: 2500,
  /** The sensor sits this far inside the wall's interior face along the corner's bisector (mm). */
  sensorInsetMm: 120,
  /** A stored corner matches the nearest outline corner within this distance (mm); farther ones are dropped. */
  matchToleranceMm: 300,
  /** A turn smaller than this is no corner (a straight run along one edge), degrees. */
  minTurnDeg: 10,
  /** Openings whose bottom is at most this high are doors (windows sit higher), mm. */
  doorBottomMm: 50,
  /** Sweep: ±amplitude around the corner's bisector, one side to the other in half a period. */
  sweepAmplitudeDeg: 35,
  sweepPeriodMs: 8000,
  /** Pulse of the light's strength, and its low point as a share of the peak. */
  pulsePeriodMs: 1600,
  pulseLow: 0.55,
  /** Cone half-angle (degrees) and its soft edge (share of the half-angle). */
  coneHalfAngleDeg: 15,
  coneSoftShare: 0.35,
  /** The cone's axis meets the floor this share of the room's diagonal away from the sensor, within bounds (mm). */
  aimShare: 0.5,
  minAimMm: 1500,
  maxAimMm: 5000,
  /** Frames per second while a sweep runs (view-only frames; shadow maps are never redrawn for them). */
  framesPerSecond: 24,
  /** A tap toggles the corner whose marker lies within this many CSS pixels. */
  pickRadiusPx: 36,
} as const;

/** One corner of a room's outline. */
export type RoomCorner = Readonly<{
  /** In the area's frame (what is stored). */
  local: PlanXY;
  /** In the building-floor frame. */
  plan: PlanXY;
  /** Unit bisector into the room (plan frame). */
  inward: PlanXY;
}>;

/** One sweeping sensor: where it sits and its cone's resting direction. */
export type SweepSource = Readonly<{
  corner: RoomCorner;
  /** Plan mm, at sensor height. */
  position: PlanXYH;
  /** Resting yaw of the cone (radians, plan frame, 0 = +x) and its downward pitch (radians). */
  yaw: number;
  pitch: number;
}>;

/** A room's outline and walls as the sweep needs them. */
export type SweepRoom = Readonly<{
  areaId: string;
  corners: readonly RoomCorner[];
  /** The room's outline (the largest outer ring of its floor shape), plan frame, for the light's mask. */
  outline: Ring;
  /** Wall band footprints (plan frame): a sensor is pushed out of them. */
  bands: readonly Ring[];
  /** Door centres (plan frame), for the default corners. */
  doors: readonly PlanXY[];
  sensorMm: number;
  /** The outline's diagonal (mm). */
  diagonalMm: number;
}>;

const length = (v: PlanXY): number => Math.hypot(v.x, v.y);

const unit = (v: PlanXY): PlanXY => {
  const l = length(v);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
};

const distance = (a: PlanXY, b: PlanXY): number => Math.hypot(a.x - b.x, a.y - b.y);

const ringArea = (ring: Ring): number => {
  let twice = 0;
  ring.forEach((point, index) => {
    const next = ring[(index + 1) % ring.length] ?? point;
    twice += point.x * next.y - next.x * point.y;
  });
  return twice / 2;
};

/** The corners of a counterclockwise ring (interior on the left), with their inward bisectors. */
export const ringCorners = (ring: Ring): { point: PlanXY; inward: PlanXY }[] => {
  const ccw = ringArea(ring) < 0 ? [...ring].reverse() : ring;
  const minTurn = Math.sin((sweepConventions.minTurnDeg * Math.PI) / 180);
  const corners: { point: PlanXY; inward: PlanXY }[] = [];
  ccw.forEach((point, index) => {
    const previous = ccw[(index - 1 + ccw.length) % ccw.length];
    const next = ccw[(index + 1) % ccw.length];
    if (previous === undefined || next === undefined) return;
    const a = unit({ x: point.x - previous.x, y: point.y - previous.y });
    const b = unit({ x: next.x - point.x, y: next.y - point.y });
    if (Math.abs(a.x * b.y - a.y * b.x) < minTurn && a.x * b.x + a.y * b.y > 0) return;
    // The sum of both edges' left normals points into the room, at convex and reflex corners alike.
    const inward = unit({ x: -a.y - b.y, y: a.x + b.x });
    corners.push({ point, inward: length(inward) < 1e-9 ? { x: -a.y, y: a.x } : inward });
  });
  return corners;
};

/** The sweep geometry of a room: its outline corners, walls, doors, and sensor height. */
export const sweepRoom = (area: AreaValue): SweepRoom | null => {
  const local = computeAreaLocalGeometry(area);
  const floor = computeAreaFloorGeometry(area);
  const outers = local.union.region.polygons.map((polygon) => polygon.outer);
  const largest = [...outers].sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
  if (largest === undefined || largest.length < 3) return null;
  const toPlan = floor.areaToFloor;
  const corners: RoomCorner[] = outers.flatMap((ring) =>
    ringCorners(ring).map((corner) => ({
      local: corner.point,
      plan: applyAffine(toPlan, corner.point),
      inward: unit(applyLinear(toPlan, corner.inward)),
    })),
  );
  const outline = largest.map((point) => applyAffine(toPlan, point));
  const xs = outline.map((point) => point.x);
  const ys = outline.map((point) => point.y);
  const diagonalMm = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const openings = new Map(area.walls.map((wall) => [wall.id, wall.objects]));
  const doors: PlanXY[] = floor.realWalls.flatMap((wall) =>
    wall.arc !== null
      ? []
      : (openings.get(wall.wallId) ?? [])
          .filter((opening) => opening.placement.bottomMm <= sweepConventions.doorBottomMm)
          .map((opening) => {
            const along = wall.spanMm.fromMm + opening.placement.distanceAlongWallMm;
            return {
              x: wall.edge.start.x + wall.edge.direction.x * along,
              y: wall.edge.start.y + wall.edge.direction.y * along,
            };
          }),
  );
  const topMm = Math.max(0, ...area.walls.map((wall) => wall.heightMm));
  const sensorMm = Math.min(
    (topMm > 0 ? topMm : sweepConventions.defaultWallMm) - sweepConventions.sensorBelowTopMm,
    sweepConventions.maxSensorMm,
  );
  return {
    areaId: area.id,
    corners,
    outline,
    bands: floor.realWalls.flatMap((wall) => wall.pieces.map((piece) => piece.ring)),
    doors,
    sensorMm: Math.max(sensorMm, 300),
    diagonalMm,
  };
};

/**
 * The default two corners (Q6): the two farthest from the room's doors (a sensor watches the way in), or, in a
 * room without doors, the two farthest apart (opposite corners). Fewer corners than two: all of them.
 */
export const defaultCorners = (
  corners: readonly RoomCorner[],
  doors: readonly PlanXY[],
): readonly RoomCorner[] => {
  if (corners.length <= 2) return corners;
  if (doors.length > 0) {
    const nearestDoor = (corner: RoomCorner): number =>
      Math.min(...doors.map((door) => distance(door, corner.plan)));
    return [...corners].sort((a, b) => nearestDoor(b) - nearestDoor(a)).slice(0, 2);
  }
  let best: readonly RoomCorner[] = corners.slice(0, 2);
  let bestDistance = -1;
  corners.forEach((a, i) => {
    corners.slice(i + 1).forEach((b) => {
      const d = distance(a.plan, b.plan);
      if (d > bestDistance) {
        bestDistance = d;
        best = [a, b];
      }
    });
  });
  return best;
};

/** The room corner nearest a stored point (area frame) within the tolerance, or null. */
const matchCorner = (corners: readonly RoomCorner[], stored: HaSweepCornerValue): RoomCorner | null => {
  let best: RoomCorner | null = null;
  let bestDistance: number = sweepConventions.matchToleranceMm;
  for (const corner of corners) {
    const d = distance(corner.local, stored);
    if (d <= bestDistance) {
      best = corner;
      bestDistance = d;
    }
  }
  return best;
};

/**
 * The corners that sweep: the stored ones matched to the current outline (an edited outline keeps the corners
 * that still exist), or the defaults when none are stored. An empty stored list sweeps from none.
 */
export const chosenCorners = (
  room: SweepRoom,
  stored: readonly HaSweepCornerValue[] | undefined,
): readonly RoomCorner[] => {
  if (stored === undefined) return defaultCorners(room.corners, room.doors);
  const chosen: RoomCorner[] = [];
  for (const point of stored) {
    const corner = matchCorner(room.corners, point);
    if (corner !== null && !chosen.includes(corner)) chosen.push(corner);
  }
  return chosen.slice(0, maxSweepCorners);
};

/** The stored list after a tap on a corner: removed when chosen, else added (at most eight). */
export const toggleCorner = (
  chosen: readonly RoomCorner[],
  corner: RoomCorner,
): readonly HaSweepCornerValue[] => {
  const points = chosen.map((candidate) => candidate.local);
  if (chosen.includes(corner)) return points.filter((point) => point !== corner.local);
  return points.length >= maxSweepCorners ? points : [...points, corner.local];
};

/** The sensor of a corner: inside the walls along the bisector, at sensor height, aimed into the room. */
export const sweepSource = (room: SweepRoom, corner: RoomCorner): SweepSource => {
  const stepMm = 20;
  let pushed = 0;
  const at = (offset: number): PlanXY => ({
    x: corner.plan.x + corner.inward.x * offset,
    y: corner.plan.y + corner.inward.y * offset,
  });
  // Out of every wall band at the corner (inside-aligned walls lie within the outline), at most 1.2 m.
  while (pushed < 1200 && room.bands.some((band) => pointInRing(at(pushed), band))) pushed += stepMm;
  const spot = at(pushed + sweepConventions.sensorInsetMm);
  const aimMm = Math.min(
    Math.max(room.diagonalMm * sweepConventions.aimShare, sweepConventions.minAimMm),
    sweepConventions.maxAimMm,
  );
  return {
    corner,
    position: { x: spot.x, y: spot.y, h: room.sensorMm },
    yaw: Math.atan2(corner.inward.y, corner.inward.x),
    pitch: Math.atan2(room.sensorMm, aimMm),
  };
};

/**
 * The cone's axis at a moment: the resting yaw swung by ±amplitude (sinusoidal), each sensor at its own phase so
 * two sensors do not swing together. Reduced motion: the resting direction.
 */
export const sweepAxis = (source: SweepSource, index: number, timeMs: number, still: boolean): PlanXYH => {
  const amplitude = (sweepConventions.sweepAmplitudeDeg * Math.PI) / 180;
  const phase = (2 * Math.PI * timeMs) / sweepConventions.sweepPeriodMs + index * 1.9;
  const yaw = source.yaw + (still ? 0 : amplitude * Math.sin(phase));
  const flat = Math.cos(source.pitch);
  return { x: Math.cos(yaw) * flat, y: Math.sin(yaw) * flat, h: -Math.sin(source.pitch) };
};

/** The light's strength at a moment (1 at the peak); reduced motion: steady at the peak. */
export const sweepPulse = (timeMs: number, still: boolean): number => {
  if (still) return 1;
  const wave = 0.5 + 0.5 * Math.sin((2 * Math.PI * timeMs) / sweepConventions.pulsePeriodMs);
  return sweepConventions.pulseLow + (1 - sweepConventions.pulseLow) * wave;
};

/** The corner whose marker (projected to CSS pixels) lies nearest a tap, within the pick radius; else null. */
export const cornerNear = <T>(
  markers: readonly Readonly<{ item: T; screen: PlanXY | null }>[],
  tap: PlanXY,
): T | null => {
  let best: T | null = null;
  let bestDistance: number = sweepConventions.pickRadiusPx;
  for (const marker of markers) {
    if (marker.screen === null) continue;
    const d = distance(marker.screen, tap);
    if (d <= bestDistance) {
      best = marker.item;
      bestDistance = d;
    }
  }
  return best;
};
