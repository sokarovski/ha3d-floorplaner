// 2D vector helpers in plan millimetres (x right, y up the plan; spec/builder/features/geometry-groups.md#coordinate-conventions).

export type Vec2 = Readonly<{ x: number; y: number }>;

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });

export const addVec = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

export const subVec = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

export const scaleVec = (v: Vec2, factor: number): Vec2 => ({ x: v.x * factor, y: v.y * factor });

export const dotVec = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** z component of the 3D cross product; positive when b is counterclockwise from a. */
export const crossVec = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

export const vecLength = (v: Vec2): number => Math.hypot(v.x, v.y);

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Unit vector, or the zero vector for a zero-length input. */
export const normalizeVec = (v: Vec2): Vec2 => {
  const length = vecLength(v);
  return length === 0 ? { x: 0, y: 0 } : { x: v.x / length, y: v.y / length };
};

/** The direction rotated 90° clockwise: "to the right" when walking along it. */
export const rightNormal = (direction: Vec2): Vec2 => ({ x: direction.y, y: -direction.x });

/** The direction rotated 90° counterclockwise: "to the left" when walking along it. */
export const leftNormal = (direction: Vec2): Vec2 => ({ x: -direction.y, y: direction.x });

export const lerpVec = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export const rotateVec = (v: Vec2, radians: number): Vec2 => {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
};

/** Counterclockwise angle of a direction in degrees, in (−180, 180]. */
export const directionDeg = (v: Vec2): number => (Math.atan2(v.y, v.x) * 180) / Math.PI;

/** Normalizes an angle in degrees to (−180, 180]. */
export const normalizeDeg = (degrees: number): number => {
  const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
};

/** Signed perpendicular distance of a point from the infinite line through origin along a unit direction (positive to the left). */
export const signedDistanceToLine = (point: Vec2, origin: Vec2, unitDirection: Vec2): number =>
  crossVec(unitDirection, subVec(point, origin));

/** Intersection of two infinite lines, or null when they are parallel within the given sine tolerance. */
export const intersectLines = (
  originA: Vec2,
  directionA: Vec2,
  originB: Vec2,
  directionB: Vec2,
  sineTolerance: number,
): Vec2 | null => {
  const denominator = crossVec(directionA, directionB);
  if (Math.abs(denominator) <= sineTolerance * vecLength(directionA) * vecLength(directionB)) return null;
  const t = crossVec(subVec(originB, originA), directionB) / denominator;
  return addVec(originA, scaleVec(directionA, t));
};
