// Animated state changes (Phase 10.2, spec/home-assistant/viewer-mvp.md#live-states). Framework-free: no React,
// stores, or Three.js. When an instance's drawn parameters change, its pose eases from what is on screen to the
// new parameters over `stateAnimationMs` (ease in and out). A pose is a blend of weighted parameter sets
// (templateResize `pose`): the template's pose rules resolve under each set and the numbers they give blend, so
// a number state parameter, and a boolean or a choice that drives an angle or an offset through a formula,
// ease the same way; a visibility switch happens at the midpoint. A change arriving mid-animation starts from
// the blend on screen (retargeting), so several changes, and several instances, can animate at once.
import type { TemplatePoseWeight } from "@shared/geometry/templateResize";
import type { TemplateParameterValue } from "@shared/domain/templates/metadata";

/** How long a state change takes (ms). */
export const stateAnimationMs = 600;

/** Sets lighter than this are dropped from a blend. */
const minWeight = 1e-3;

type ParameterSet = Readonly<Record<string, TemplateParameterValue>>;

type Animation = Readonly<{
  /** The pose on screen when the animation started. */
  start: readonly TemplatePoseWeight[];
  target: ParameterSet;
  startedAt: number;
}>;

export type StateAnimator = Readonly<{
  /**
   * The parameters each instance is drawn with now. A change to a known instance starts (or retargets) its
   * animation when `animate` is true, and jumps otherwise; an instance seen for the first time never animates,
   * and instances missing from the map are forgotten.
   */
  update: (targets: ReadonlyMap<string, ParameterSet>, now: number, animate: boolean) => void;
  /** The blend of each animating instance at `now`; instances that are done are dropped. */
  poses: (now: number) => ReadonlyMap<string, readonly TemplatePoseWeight[]>;
  /** Whether an animation is still in progress (keep requesting frames). */
  active: () => boolean;
  /** Forgets everything (a different house or floor is shown). */
  clear: () => void;
}>;

/** Ease in and out (sine), t in [0, 1]. */
export const easeInOut = (t: number): number => 0.5 - Math.cos(Math.PI * Math.min(Math.max(t, 0), 1)) / 2;

const sameParameters = (a: ParameterSet, b: ParameterSet): boolean => {
  if (a === b) return true;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.is(a[key], b[key]));
};

/** Scales `start` by (1 − eased) and adds `target` with weight `eased`, merging equal parameter sets. */
export const blendPose = (
  start: readonly TemplatePoseWeight[],
  target: ParameterSet,
  eased: number,
): TemplatePoseWeight[] => {
  const sets: { parameters: ParameterSet; weight: number }[] = [];
  const add = (parameters: ParameterSet, weight: number): void => {
    const same = sets.find((set) => sameParameters(set.parameters, parameters));
    if (same !== undefined) same.weight += weight;
    else sets.push({ parameters, weight });
  };
  for (const set of start) add(set.parameters, set.weight * (1 - eased));
  add(target, eased);
  const kept = sets.filter((set) => set.weight >= minWeight);
  const total = kept.reduce((sum, set) => sum + set.weight, 0);
  return total > 0
    ? kept.map((set) => ({ parameters: set.parameters, weight: set.weight / total }))
    : [{ parameters: target, weight: 1 }];
};

export const createStateAnimator = (durationMs = stateAnimationMs): StateAnimator => {
  const drawn = new Map<string, ParameterSet>();
  const animations = new Map<string, Animation>();

  const progress = (animation: Animation, now: number): number =>
    durationMs <= 0 ? 1 : (now - animation.startedAt) / durationMs;

  const poseAt = (id: string, now: number): readonly TemplatePoseWeight[] | null => {
    const animation = animations.get(id);
    if (animation === undefined) return null;
    const t = progress(animation, now);
    if (t >= 1) {
      animations.delete(id);
      return null;
    }
    return blendPose(animation.start, animation.target, easeInOut(t));
  };

  return {
    update: (targets, now, animate) => {
      for (const id of [...drawn.keys()])
        if (!targets.has(id)) {
          drawn.delete(id);
          animations.delete(id);
        }
      for (const [id, target] of targets) {
        const previous = drawn.get(id);
        drawn.set(id, target);
        if (previous === undefined || sameParameters(previous, target)) continue;
        if (!animate) {
          animations.delete(id);
          continue;
        }
        const current = poseAt(id, now) ?? [{ parameters: previous, weight: 1 }];
        animations.set(id, { start: current, target, startedAt: now });
      }
    },
    poses: (now) => {
      const poses = new Map<string, readonly TemplatePoseWeight[]>();
      for (const id of [...animations.keys()]) {
        const pose = poseAt(id, now);
        if (pose !== null) poses.set(id, pose);
      }
      return poses;
    },
    active: () => animations.size > 0,
    clear: () => {
      drawn.clear();
      animations.clear();
    },
  };
};
