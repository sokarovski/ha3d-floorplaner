// The analytic strip term of a linear light (Phase 12, owner decision 2026-11-18: one unified strip light;
// spec/builder/features/lighting.md#strip-light-phase-154). Framework-free rules and a CPU mirror of the shader
// in stripShading.ts, so the check script (scripts/check-strip-light.ts) measures the same maths.
//
// A strip is a one-sided thin rectangle (its length × its Width, the emitting face) shining along its facing.
// Its diffuse light is the exact Lambertian form factor of that rectangle, as Three.js evaluates a
// RectAreaLight's diffuse term (r187 `LTC_Evaluate` with an identity matrix: four edge terms with the rational
// θ/sin θ fit and the horizon-clipped sphere approximation), times the strip's radiance L = Φ / (π · A).
// Confinement, so it does not shine through walls:
// - Reach: the term fades to 0 at `reachMm` from the strip's segment (flat to half of it, smoothstep beyond).
// - Plane: one clip plane per strip, lit only on the strip's side. Facing a wall, the wall's face plus
//   `linearFillWallPassMm` (it lights the wall, never what is behind it); otherwise 0.1 m above the floor (it
//   never reaches a floor, its own or a neighbour's through a wall).
// - One-sided: nothing behind the emitting face; the receiver's horizon clips the rest (a wall's back face).

/** A point or direction in the floor frame (mm; x, y plan, z up from the floor). */
export type StripVec = Readonly<{ x: number; y: number; z: number }>;

/** What a facing ray of the strip met: the first wall face (point and normal, floor frame), or nothing. */
export type StripWallHit = Readonly<{ distanceMm: number; point: StripVec; normal: StripVec }>;

/** A clip plane: lit where dot(normal, p) < offset (normal unit length, floor frame, mm). */
export type StripPlane = Readonly<{ normal: StripVec; offsetMm: number }>;

/** How a strip's output is split and where its analytic term may shine. */
export type StripPlan = Readonly<{
  /** Share of the light's output carried by the analytic term (0–1); the shadow-casting carriers take the rest. */
  share: number;
  /** The term fades to 0 at this distance from the strip's segment (mm). */
  reachMm: number;
  plane: StripPlane | null;
}>;

/** The term reaches at most this far below a strip that does not face a wall. */
export const stripReachMaxMm = 1400;
/** And always stops this far above the floor (fading over `stripPlaneFadeMm` above it). */
export const stripFloorClearanceMm = 100;
/** Facing a wall, the term stops this far behind the wall's face: less than any wall's thickness. */
export const linearFillWallPassMm = 60;
/** The clip plane fades the term over this distance in front of it. */
export const stripPlaneFadeMm = 30;
/** A receiver this close in front of the emitting face is faded in (a fixture's own profile stays unlit). */
export const stripFrontRampMm = 5;
/** Facing a wall this close (or closer), the term takes all of the output; carriers return by `stripNearFarMm`. */
export const stripNearMm = 200;
export const stripNearFarMm = 400;
/**
 * Narrowest rectangle the shader evaluates (internal numerical floor, not a product setting): a narrower strip is
 * evaluated this wide with the same flux. The check script measures float32 error at this width.
 */
export const stripMinWidthMm = 2;
/** Half-angle of a carrier's beam (a 150° cone), used for the floor-rule reach of a tilted strip. */
const beamHalfAngle = (75 * Math.PI) / 180;

const ramp = (value: number, from: number, to: number): number =>
  Math.min(1, Math.max(0, (value - from) / (to - from)));

/**
 * The term's share where the carriers must still light the far field (8.9's fill had 75 %). The carriers' 150°
 * cones are what makes a band uneven, so they keep only what the term cannot reach: on the 2.7 m strip 0.6 m
 * over a counter, 85 % takes the band's ripple against the ideal line from 1.40 (8.9 fill row) to 1.23 at about
 * the same brightness (scripts/check-strip-light.ts).
 */
export const stripBaseShare = 0.85;

/** Phase 8.9 height rule: the share for a strip this high above the floor (along its facing for a tilted one). */
export const stripFloorShare = (heightMm: number): number =>
  stripBaseShare * ramp(heightMm, 400, 700) * (1 - ramp(heightMm, 1800, 2300));

/** Phase 13.3 wall rule, with all of the output for a strip within `stripNearMm` of the wall it faces. */
export const stripWallShare = (distanceMm: number): number =>
  (stripBaseShare + (1 - stripBaseShare) * (1 - ramp(distanceMm, stripNearMm, stripNearFarMm))) *
  (1 - ramp(distanceMm, 1800, 2300));

const dot = (a: StripVec, b: StripVec): number => a.x * b.x + a.y * b.y + a.z * b.z;

const floorPlane: StripPlane = { normal: { x: 0, y: 0, z: -1 }, offsetMm: -stripFloorClearanceMm };

/**
 * The plan of a strip `heightMm` above the floor facing `facingDeg` (0 down). walls: what each facing probe ray
 * met (null entries: no wall within the probe's range), or null for facing 0, which skips the wall rule. The
 * middle ray by distance decides, as in 13.3.
 */
export const linearStripPlan = (
  heightMm: number,
  facingDeg: number,
  facing: StripVec,
  walls: readonly (StripWallHit | null)[] | null,
): StripPlan => {
  if (walls === null) {
    const reach = Math.min(stripReachMaxMm, heightMm - stripFloorClearanceMm);
    return reach > 0
      ? { share: stripFloorShare(heightMm), reachMm: reach, plane: floorPlane }
      : { share: 0, reachMm: 1, plane: floorPlane };
  }
  const normalized = ((facingDeg % 360) + 360) % 360;
  const fromDown = ((normalized <= 180 ? normalized : 360 - normalized) * Math.PI) / 180;
  const coneEdge = Math.max(0, fromDown - beamHalfAngle);
  const floorAlong = fromDown < Math.PI / 2 - 1e-6 ? heightMm / Math.cos(fromDown) : Infinity;
  const floorReach =
    coneEdge < Math.PI / 2 - 1e-6 ? heightMm / Math.cos(coneEdge) - stripFloorClearanceMm : Infinity;
  const sorted = [...walls].sort((a, b) => (a?.distanceMm ?? Infinity) - (b?.distanceMm ?? Infinity));
  const middle = sorted[Math.floor(sorted.length / 2)] ?? null;
  if (middle !== null && middle.distanceMm < floorAlong) {
    // The wall's face, its normal turned away from the strip, moved back by the pass.
    const sign = dot(middle.normal, facing) < 0 ? -1 : 1;
    const normal = { x: middle.normal.x * sign, y: middle.normal.y * sign, z: middle.normal.z * sign };
    return {
      share: stripWallShare(middle.distanceMm),
      reachMm: Math.max(stripReachMaxMm, 2 * (middle.distanceMm + linearFillWallPassMm)),
      plane: { normal, offsetMm: dot(normal, middle.point) + linearFillWallPassMm },
    };
  }
  const reach = Math.min(stripReachMaxMm, floorReach);
  return reach > 0 && Number.isFinite(floorAlong)
    ? { share: stripFloorShare(floorAlong), reachMm: reach, plane: floorPlane }
    : { share: 0, reachMm: 1, plane: floorPlane };
};

// ---- CPU mirror of the shader term (stripShading.ts) -----------------------------------------------------

/** A strip in one consistent frame and unit (the shader's: world, view-transformed). */
export type StripShape = Readonly<{
  center: StripVec;
  /** Half the strip's length along it. */
  halfAlong: StripVec;
  /** Half the emitting width across it; cross(halfAcross, halfAlong) points where it shines. */
  halfAcross: StripVec;
  reach: number;
  plane: Readonly<{ normal: StripVec; offset: number }> | null;
  planeFade: number;
  frontRamp: number;
}>;

/** Rounding applied after every operation: identity (float64) or Math.fround (the GPU's float32). */
export type Rounding = (value: number) => number;
const exact: Rounding = (value) => value;

const sub = (a: StripVec, b: StripVec, r: Rounding): StripVec => ({
  x: r(a.x - b.x),
  y: r(a.y - b.y),
  z: r(a.z - b.z),
});
const add = (a: StripVec, b: StripVec, r: Rounding): StripVec => ({
  x: r(a.x + b.x),
  y: r(a.y + b.y),
  z: r(a.z + b.z),
});
const scale = (a: StripVec, s: number, r: Rounding): StripVec => ({
  x: r(a.x * s),
  y: r(a.y * s),
  z: r(a.z * s),
});
const dotR = (a: StripVec, b: StripVec, r: Rounding): number =>
  r(r(r(a.x * b.x) + r(a.y * b.y)) + r(a.z * b.z));
const cross = (a: StripVec, b: StripVec, r: Rounding): StripVec => ({
  x: r(r(a.y * b.z) - r(a.z * b.y)),
  y: r(r(a.z * b.x) - r(a.x * b.z)),
  z: r(r(a.x * b.y) - r(a.y * b.x)),
});
const normalize = (a: StripVec, r: Rounding): StripVec => scale(a, r(1 / r(Math.sqrt(dotR(a, a, r)))), r);
const smoothstep = (from: number, to: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** Three.js `LTC_EdgeVectorFormFactor` (r187). */
const edge = (v1: StripVec, v2: StripVec, r: Rounding): StripVec => {
  const x = dotR(v1, v2, r);
  const y = Math.abs(x);
  const a = r(0.8543985 + r(r(0.4965155 + r(0.0145206 * y)) * y));
  const b = r(3.417594 + r(r(4.1616724 + y) * y));
  const v = r(a / b);
  const thetaSinTheta = x > 0 ? v : r(r(0.5 / r(Math.sqrt(Math.max(r(1 - r(x * x)), 1e-7)))) - v);
  return scale(cross(v1, v2, r), thetaSinTheta, r);
};

/**
 * Three.js `LTC_Evaluate(N, V, P, mat3(1), corners)` (r187), written without the view-dependent basis: with an
 * identity matrix the result depends only on N, and the basis Three.js builds is left-handed, hence −dot(F, N).
 * Corners counterclockwise as RectAreaLight orders them; 0 behind the emitter's plane.
 */
export const rectFormFactor = (
  normal: StripVec,
  point: StripVec,
  corners: readonly [StripVec, StripVec, StripVec, StripVec],
  r: Rounding = exact,
): number => {
  const [c0, c1, c2, c3] = corners;
  const lightNormal = cross(sub(c1, c0, r), sub(c3, c0, r), r);
  if (dotR(lightNormal, sub(point, c0, r), r) < 0) return 0;
  const v0 = normalize(sub(c0, point, r), r);
  const v1 = normalize(sub(c1, point, r), r);
  const v2 = normalize(sub(c2, point, r), r);
  const v3 = normalize(sub(c3, point, r), r);
  const form = add(add(edge(v0, v1, r), edge(v1, v2, r), r), add(edge(v2, v3, r), edge(v3, v0, r), r), r);
  const length = r(Math.sqrt(dotR(form, form, r)));
  const z = -dotR(form, normal, r);
  return Math.max(r(r(r(length * length) + z) / r(length + 1)), 0);
};

/** The term's weight at a receiver: reach, clip plane and the front ramp (1 where it shines freely). */
export const stripWeight = (strip: StripShape, point: StripVec, r: Rounding = exact): number => {
  const to = sub(point, strip.center, r);
  const along = strip.halfAlong;
  const t = Math.min(1, Math.max(-1, dotR(to, along, r) / Math.max(dotR(along, along, r), 1e-12)));
  const off = sub(to, scale(along, t, r), r);
  const distance = Math.sqrt(dotR(off, off, r));
  if (distance >= strip.reach) return 0;
  const facing = normalize(cross(strip.halfAcross, along, r), r);
  const front = dotR(to, facing, r);
  if (front <= 0) return 0;
  let weight =
    (1 - smoothstep(0.5 * strip.reach, strip.reach, distance)) * smoothstep(0, strip.frontRamp, front);
  if (strip.plane !== null) {
    const beyond = dotR(strip.plane.normal, point, r) - strip.plane.offset;
    weight *= 1 - smoothstep(-strip.planeFade, 0, beyond);
  }
  return weight;
};

/** The strip's corners in Three.js's RectAreaLight order (centre ± half length ± half width). */
export const stripCorners = (
  strip: StripShape,
  r: Rounding = exact,
): readonly [StripVec, StripVec, StripVec, StripVec] => {
  const { center: c, halfAlong: a, halfAcross: w } = strip;
  return [sub(add(c, a, r), w, r), sub(sub(c, a, r), w, r), add(sub(c, a, r), w, r), add(add(c, a, r), w, r)];
};

/**
 * Irradiance from a strip of radiance `radiance` at a receiver (point, unit normal): π · L · form factor ·
 * weight. The shader adds L · form factor · weight × the diffuse colour, the same Lambertian result.
 */
export const stripIrradiance = (
  strip: StripShape,
  radiance: number,
  point: StripVec,
  normal: StripVec,
  r: Rounding = exact,
): number => {
  const weight = stripWeight(strip, point, r);
  if (weight <= 0) return 0;
  return Math.PI * radiance * rectFormFactor(normal, point, stripCorners(strip, r), r) * weight;
};

/** Radiance of a Lambertian rectangle emitting `lumens` from `area` (lm / (π · A)), RectAreaLight's convention. */
export const stripRadiance = (lumens: number, area: number): number =>
  lumens / (Math.PI * Math.max(area, 1e-12));
