// Geometry implementation conventions (D04/D05). All tolerances are physical millimetres, never zoom-dependent.
// Documented in spec/builder/features/geometry-groups.md#geometry-kernel-and-tolerances.

/** Polygon booleans run in Clipper2 integer coordinates: 1 integer unit = 0.001 mm. */
export const fixedPointUnitsPerMm = 1000;

/** Contact tolerance: gaps narrower than this are closed (faces touching within it merge); wider gaps stay visible. */
export const contactToleranceMm = 0.5;

/** A boundary segment lies on a source edge/face when both its ends are within this distance of the source line. */
export const onLineToleranceMm = 0.01;

/** Wall pieces, boundary intervals, and classified edge pieces shorter than this are treated as slivers and dropped. */
export const minPieceLengthMm = 0.5;

/** Maximum sagitta between a circle and its discretized polygon. */
export const circleChordToleranceMm = 0.5;

/** Two directions are parallel when the sine of the angle between them is at most this (≈0.06°). */
export const parallelSineTolerance = 1e-3;

/** Wall-piece ends closer than this are joined with a miter. */
export const joinToleranceMm = 0.05;

/**
 * Joins involving an arc wall: arc boundary pieces come from the discretized circle, so their ends sit up
 * to the chord tolerance (plus rounding) away from the true corner. Twice the chord tolerance.
 */
export const arcJoinToleranceMm = 2 * circleChordToleranceMm;

/** Miters longer than this multiple of the joined walls' larger thickness fall back to square ends. */
export const miterLimitFactor = 20;

/** Distinct wall/opening heights closer than this collapse into one height level. */
export const heightToleranceMm = 0.01;

/** Intersections smaller than this area are ignored for intrusion and conflict flags. */
export const minFlagAreaMm2 = 1;
