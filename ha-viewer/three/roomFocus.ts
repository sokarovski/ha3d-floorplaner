// Smart room focus (Phase 8.2): choose an orbit angle that sees into a room. Pure: no three.js, so it can be
// checked from a script (scripts/check-room-focus.ts). Everything is in plan mm except angles (radians) and the
// orbit distance (metres, as the viewer's camera uses).
//
// Candidates: 8 azimuths (45° apart, starting at the current one) × 3 elevations (the current one, +15°, +30°,
// clamped to the orbit limits). Each is scored by the share of floor samples whose line of sight from the eye is
// not blocked by an occluder (wall bands and other rooms' object boxes; the room's own contents never count).
// The best share wins; any candidate within `tolerance` of it may win instead when it turns less, so the camera
// moves as little as needed.
import type { Region } from "@shared/geometry/region";
import { pointInRegion, regionBounds } from "@shared/geometry/region";
import type { Occluder, PlanVector } from "./roomVolumes";
import { insideAnyFootprint, segmentBlocked } from "./roomVolumes";

/** OrbitControls angles: azimuth about the up axis, polar from straight up (0) to the horizon (π/2). */
export type OrbitView = Readonly<{ azimuth: number; polar: number }>;

export type FocusLimits = Readonly<{ minPolar: number; maxPolar: number }>;

export type FocusChoice = Readonly<{ view: OrbitView; visible: number; turn: number }>;

/** Implementation conventions (Phase 8.2). */
export const focusConventions = {
  azimuthSteps: 8,
  elevationStepsDeg: [0, 15, 30],
  /** A candidate this much less visible than the best may still win by turning less. */
  tolerance: 0.08,
  /** A change of elevation counts this much more than the same turn in azimuth. */
  polarWeight: 1.5,
  /** Floor samples: about this many on a grid over the room, at this height above the floor. */
  sampleCount: 36,
  sampleHeightMm: 100,
} as const;

const degrees = Math.PI / 180;

export const wrapAngle = (radians: number): number =>
  ((((radians + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

/**
 * The eye's offset from the orbit target in plan mm. OrbitControls puts the camera at world
 * (d sinφ sinθ, d cosφ, d sinφ cosθ) from the target; plan (x, y, h) = world (x, −z, y) × 1000.
 */
export const eyeOffsetMm = (view: OrbitView, distanceM: number): PlanVector => ({
  x: distanceM * Math.sin(view.polar) * Math.sin(view.azimuth) * 1000,
  y: -distanceM * Math.sin(view.polar) * Math.cos(view.azimuth) * 1000,
  h: distanceM * Math.cos(view.polar) * 1000,
});

export const candidateViews = (from: OrbitView, limits: FocusLimits): OrbitView[] => {
  const views: OrbitView[] = [];
  const seen = new Set<string>();
  for (const raiseDeg of focusConventions.elevationStepsDeg) {
    const polar = Math.min(Math.max(from.polar - raiseDeg * degrees, limits.minPolar), limits.maxPolar);
    for (let step = 0; step < focusConventions.azimuthSteps; step += 1) {
      const azimuth = from.azimuth + (step * 2 * Math.PI) / focusConventions.azimuthSteps;
      const key = `${polar.toFixed(4)}|${step}`;
      if (seen.has(key)) continue;
      seen.add(key);
      views.push({ azimuth, polar });
    }
  }
  return views;
};

/** Points on a grid over the room's floor, inside its region and outside every occluder footprint (walls). */
export const floorSamples = (region: Region, occluders: readonly Occluder[], floorMm = 0): PlanVector[] => {
  if (region.polygons.length === 0) return [];
  const bounds = regionBounds(region);
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxY - bounds.minY;
  if (width <= 0 || depth <= 0) return [];
  const n = Math.sqrt(focusConventions.sampleCount);
  const step = Math.sqrt((width * depth) / (n * n));
  const columns = Math.max(Math.round(width / step), 2);
  const rows = Math.max(Math.round(depth / step), 2);
  const samples: PlanVector[] = [];
  for (let column = 0; column < columns; column += 1)
    for (let row = 0; row < rows; row += 1) {
      const x = bounds.minX + ((column + 0.5) * width) / columns;
      const y = bounds.minY + ((row + 0.5) * depth) / rows;
      if (!pointInRegion({ x, y }, region) || insideAnyFootprint(x, y, occluders)) continue;
      samples.push({ x, y, h: floorMm + focusConventions.sampleHeightMm });
    }
  return samples;
};

/** The share (0..1) of samples the eye sees past every occluder. */
export const visibleShare = (
  eye: PlanVector,
  samples: readonly PlanVector[],
  occluders: readonly Occluder[],
): number => {
  if (samples.length === 0) return 0;
  let seen = 0;
  for (const sample of samples)
    if (!occluders.some((candidate) => segmentBlocked(eye, sample, candidate))) seen += 1;
  return seen / samples.length;
};

/** How far a view is from the current one: the azimuth turn plus the weighted change of elevation. */
export const turnCost = (from: OrbitView, to: OrbitView): number =>
  Math.abs(wrapAngle(to.azimuth - from.azimuth)) +
  focusConventions.polarWeight * Math.abs(to.polar - from.polar);

export type FocusInput = Readonly<{
  /** The orbit target (plan mm). */
  target: PlanVector;
  distanceM: number;
  from: OrbitView;
  limits: FocusLimits;
  samples: readonly PlanVector[];
  occluders: readonly Occluder[];
}>;

/** The best candidate view, or null when the room has no floor samples (keep the current angle). */
export const chooseView = (input: FocusInput): FocusChoice | null => {
  if (input.samples.length === 0) return null;
  const scored = candidateViews(input.from, input.limits).map((view): FocusChoice => {
    const offset = eyeOffsetMm(view, input.distanceM);
    const eye = { x: input.target.x + offset.x, y: input.target.y + offset.y, h: input.target.h + offset.h };
    return {
      view,
      visible: visibleShare(eye, input.samples, input.occluders),
      turn: turnCost(input.from, view),
    };
  });
  const best = Math.max(...scored.map((choice) => choice.visible));
  const eligible = scored.filter((choice) => choice.visible >= best - focusConventions.tolerance);
  return eligible.reduce<FocusChoice | null>(
    (chosen, choice) =>
      chosen === null ||
      choice.turn < chosen.turn - 1e-9 ||
      (Math.abs(choice.turn - chosen.turn) <= 1e-9 && choice.visible > chosen.visible)
        ? choice
        : chosen,
    null,
  );
};
