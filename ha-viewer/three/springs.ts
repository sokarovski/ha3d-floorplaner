// The viewer's motion springs (spec/home-assistant/viewer-mvp.md#room-cards, camera moves): critically damped
// springs for the camera move, and the same spring as a CSS easing so screen elements (the room cards and the floor
// widgets, 14.4) slide in step with the camera. Framework-free.

/**
 * Spring stiffness per part (rad/s, critically damped): the pan leads, the turn follows, the zoom settles last,
 * so a move reads as one natural motion rather than five channels on one curve. About 0.8 s to settle.
 * `insets` is the share of the screen the view is framed into; the slides follow it.
 */
export const springOmega = { target: 7, azimuth: 6.5, polar: 6.5, distance: 5.5, insets: 8 } as const;

/** One critically damped spring step: the new value and velocity after `dt` seconds. */
export const springStep = (
  value: number,
  velocity: number,
  goal: number,
  omega: number,
  dt: number,
): [number, number] => {
  const acceleration = omega * omega * (goal - value) - 2 * omega * velocity;
  const nextVelocity = velocity + acceleration * dt;
  return [value + nextVelocity * dt, nextVelocity];
};

/** A critically damped spring from rest: the share of the way covered after `t` seconds. */
const springProgress = (omega: number, t: number): number => 1 - (1 + omega * t) * Math.exp(-omega * t);

/** How long a CSS slide on the inset spring runs (s): until it is within 0.3 % of its goal (ωt = 8). */
export const slideSeconds = 8 / springOmega.insets;

/**
 * The inset spring as a CSS `linear()` easing over `slideSeconds` (24 samples), so a slide started with a camera
 * move follows the same curve. Browsers without `linear()` keep the cubic fallback declared before it.
 */
export const slideEasing = (() => {
  const samples = 24;
  const points: string[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const progress =
      index === samples ? 1 : springProgress(springOmega.insets, (slideSeconds * index) / samples);
    points.push(progress.toFixed(4));
  }
  return `linear(${points.join(", ")})`;
})();

/** The fallback easing for browsers without `linear()`: a close cubic match of the spring from rest. */
export const slideEasingFallback = "cubic-bezier(0.3, 0, 0.15, 1)";
