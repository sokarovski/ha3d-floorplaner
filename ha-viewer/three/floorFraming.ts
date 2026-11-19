// The whole-floor framing (Phase 14.3; spec/home-assistant/viewer-mvp.md#houseviewer, Camera): the closest camera
// distance at which the floor's real outline (floor shapes at floor level, wall bands at their own height) fits the
// free part of the screen, with the orbit target slid within the view plane so the house is not held at the screen
// centre by its bounding box. Pure math in world metres (x east, y up, z south), so `npm run viewer:focus` checks it.

export type FramePoint = Readonly<{ x: number; y: number; z: number }>;

/**
 * The free part of the screen around the view axis, as tangents of the view angle: x from `-left` to `right`,
 * y from `-bottom` to `top` (the view offset's insets and downward shift already applied).
 */
export type FrameWindow = Readonly<{ left: number; right: number; bottom: number; top: number }>;

export type FloorFit = Readonly<{
  /** Camera distance from the orbit target (m). */
  distance: number;
  /** Where the orbit target sits relative to the framing centre, along the camera's right and up axes (m). */
  shiftRight: number;
  shiftUp: number;
}>;

/** Screen margin of the fit: the outline fills at most this share of the free window (implementation convention). */
export const frameFill = 1 / 1.04;

type Axes = Readonly<{ back: FramePoint; right: FramePoint; up: FramePoint }>;

const dot = (a: FramePoint, b: FramePoint): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** Camera axes for a camera at (azimuth, elevation) around the centre: back (toward the camera), right, up. */
export const cameraAxes = (elevation: number, azimuth: number): Axes => {
  const back = {
    x: Math.cos(elevation) * Math.sin(azimuth),
    y: Math.sin(elevation),
    z: Math.cos(elevation) * Math.cos(azimuth),
  };
  // right = worldUp × back, normalised; up = back × right.
  const length = Math.hypot(back.z, back.x);
  const right = { x: back.z / length, y: 0, z: -back.x / length };
  const up = {
    x: back.y * right.z - back.z * right.y,
    y: back.z * right.x - back.x * right.z,
    z: back.x * right.y - back.y * right.x,
  };
  return { back, right, up };
};

type Projected = Readonly<{ x: number; y: number; depth: number }>;

/**
 * The range of target shifts along one camera axis that keeps every point inside [-low, high] on screen at this
 * distance, or null when none does. A shift s moves a point's screen coordinate to (v − s) / depth, exactly.
 */
const shiftRange = (
  points: readonly Projected[],
  along: (point: Projected) => number,
  low: number,
  high: number,
): readonly [number, number] | null => {
  let min = Number.NEGATIVE_INFINITY;
  let max = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const value = along(point);
    min = Math.max(min, value - high * point.depth);
    max = Math.min(max, value + low * point.depth);
  }
  return min <= max ? [min, max] : null;
};

const clamp = (value: number, range: readonly [number, number]): number =>
  Math.min(Math.max(value, range[0]), range[1]);

/**
 * The closest fit of `points` (relative to the framing centre) seen from (elevation, azimuth) into the free window,
 * filled to `frameFill`. The target stays on the framing centre wherever that fits, and slides only as far as the
 * outline needs, so a camera seeing more of a near corner than a far one frames the house, not its box.
 */
export const fitFloor = (
  points: readonly FramePoint[],
  elevation: number,
  azimuth: number,
  free: FrameWindow,
): FloorFit => {
  if (points.length === 0) return { distance: 1, shiftRight: 0, shiftUp: 0 };
  const axes = cameraAxes(elevation, azimuth);
  const left = free.left * frameFill;
  const right = free.right * frameFill;
  const bottom = free.bottom * frameFill;
  const top = free.top * frameFill;
  const local = points.map((point) => ({
    x: dot(point, axes.right),
    y: dot(point, axes.up),
    toward: dot(point, axes.back),
  }));
  const project = (distance: number): Projected[] =>
    local.map((point) => ({ x: point.x, y: point.y, depth: distance - point.toward }));
  const ranges = (distance: number) => {
    const projected = project(distance);
    return {
      across: shiftRange(projected, (point) => point.x, left, right),
      upward: shiftRange(projected, (point) => point.y, bottom, top),
    };
  };
  const fits = (distance: number): boolean => {
    const found = ranges(distance);
    return found.across !== null && found.upward !== null;
  };
  // Every point in front of the camera, then grow until it fits and halve the interval down to 1 mm.
  let near = Math.max(...local.map((point) => point.toward)) + 0.1;
  let far = Math.max(near * 2, 1);
  while (!fits(far)) far *= 2;
  while (far - near > 0.001) {
    const middle = (near + far) / 2;
    if (fits(middle)) far = middle;
    else near = middle;
  }
  const found = ranges(far);
  return {
    distance: Math.max(far, 1),
    shiftRight: found.across === null ? 0 : clamp(0, found.across),
    shiftUp: found.upward === null ? 0 : clamp(0, found.upward),
  };
};
