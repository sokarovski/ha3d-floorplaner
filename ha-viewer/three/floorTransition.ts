// The floor switch's move (Phase 16.3; 16.13, owner 2026-11-18: like a camera sliding up or down to the next floor;
// spec/home-assistant/viewer-mvp.md#floor-switch-transition). Framework-free and free of the DOM and Three.js, so
// `npm run frames:check` runs it on a fake clock: one animation on the viewport's frame scheduler (channel "floor"),
// timed from its first frame, eased, and always settled exactly once, whether it completes, is finished early (a
// new switch, a resize), cancelled (disposal), or its step throws. Settling puts the end state in place, so every
// way out leaves one consistent active view. `slidePose` is the camera along the move.
import type { AnimationHandle, FrameScheduler } from "../../src/renderer/frameScheduler";

/** The move's length (ms, implementation convention: the owner's "about 0.6 s"). */
export const floorSlideMs = 600;
/** The scheduler channel of the slide; the opening watch (15.1) waits for it as for the camera. */
export const floorSlideChannel = "floor";

/** Ease in and out (cubic): the floors start and stop softly. */
export const slideEase = (t: number): number => {
  const x = Math.min(Math.max(t, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

/** How a slide ended: ran to its end, was finished early (snapped to the end state), or was cancelled. */
export type SlideEnd = "completed" | "finished" | "cancelled";

export type FloorSlide = Readonly<{
  /** True until the slide has settled. */
  active: () => boolean;
  /** Snaps to the end state now (a new switch, a resize): `apply(1)`, then settles. */
  finish: () => void;
  /** Stops without drawing the end (disposal); still settles. */
  cancel: () => void;
}>;

export type SlideOptions = Readonly<{
  frames: FrameScheduler;
  /** Draws the slide at an eased progress 0..1 (opacity, offsets); called every frame and once at 1 at the end. */
  apply: (eased: number) => void;
  /** Called exactly once when the slide is over, however it ended. */
  settle: (end: SlideEnd) => void;
  durationMs?: number;
}>;

export const startFloorSlide = (options: SlideOptions): FloorSlide => {
  const duration = options.durationMs ?? floorSlideMs;
  let startedAt: number | null = null;
  let settled = false;
  const settle = (end: SlideEnd): void => {
    if (settled) return;
    settled = true;
    options.settle(end);
  };
  options.apply(0);
  const handle: AnimationHandle = options.frames.start({
    channel: floorSlideChannel,
    step: (now) => {
      startedAt ??= now;
      const t = duration <= 0 ? 1 : (now - startedAt) / duration;
      options.apply(slideEase(t));
      return t < 1;
    },
    onEnd: (status) => {
      settle(status === "completed" ? "completed" : "cancelled");
    },
  });
  return {
    active: () => !settled,
    finish: () => {
      if (settled) return;
      settled = true;
      handle.cancel();
      options.apply(1);
      options.settle("finished");
    },
    cancel: () => {
      handle.cancel();
      settle("cancelled");
    },
  };
};

export type SlideVector = readonly [number, number, number];
export type SlideQuaternion = readonly [number, number, number, number];
/** A camera: world position (m), orientation, and projection matrix (16 numbers, column-major). */
export type SlidePose = Readonly<{
  position: SlideVector;
  quaternion: SlideQuaternion;
  projection: readonly number[];
}>;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Spherical interpolation of unit quaternions along the shorter arc. */
const slerp = (a: SlideQuaternion, b: SlideQuaternion, t: number): SlideQuaternion => {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    [bx, by, bz, bw] = [-bx, -by, -bz, -bw];
    cos = -cos;
  }
  let wa = 1 - t;
  let wb = t;
  if (cos < 0.9995) {
    const angle = Math.acos(cos);
    const sin = Math.sin(angle);
    wa = Math.sin((1 - t) * angle) / sin;
    wb = Math.sin(t * angle) / sin;
  }
  const q = [wa * a[0] + wb * bx, wa * a[1] + wb * by, wa * a[2] + wb * bz, wa * a[3] + wb * bw];
  const length = Math.hypot(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0, q[3] ?? 0) || 1;
  return [(q[0] ?? 0) / length, (q[1] ?? 0) / length, (q[2] ?? 0) / length, (q[3] ?? 1) / length];
};

/**
 * The camera at eased progress 0..1 of a floor switch's ride: in a straight line from the departing camera (moved
 * with the departing floor to its real place relative to the destination) to the resting camera. The viewer keeps
 * the angles, distance, and horizontal position (owner 16.13: an elevator outside the house), so this is a pure
 * vertical translation by the floors' elevation difference; orientation and projection are interpolated only in
 * case they differ (a room's insets closing).
 */
export const slidePose = (from: SlidePose, to: SlidePose, eased: number): SlidePose => {
  const t = Math.min(Math.max(eased, 0), 1);
  return {
    position: [
      lerp(from.position[0], to.position[0], t),
      lerp(from.position[1], to.position[1], t),
      lerp(from.position[2], to.position[2], t),
    ],
    quaternion: slerp(from.quaternion, to.quaternion, t),
    projection: to.projection.map((value, index) => lerp(from.projection[index] ?? value, value, t)),
  };
};
