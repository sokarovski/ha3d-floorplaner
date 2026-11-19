// Gestures on clickable things in the viewer (spec/home-assistant/viewer-mvp.md#bindings-and-edit-mode): one timing
// for lights, objects, and bubbles, close to Home Assistant's own cards. The 3D view (houseViewer.ts) and the
// bubble overlay (bubbleOverlay.ts) both use it; bubbles are HTML and take their pointer events themselves.

import { clickSlopPx } from "../src/renderer/pointerSlop";

/**
 * Gesture timing (implementation conventions): drag slop, hold time, and the double-tap window. The tap slop is the
 * builder's click slop (Phase 19.6, src/renderer/pointerSlop.ts), one value for both front ends.
 */
export const gestureTiming = { tapSlopPx: clickSlopPx, holdMs: 500, doubleTapMs: 280 } as const;

/** Something with tap / hold / double-tap actions, by its binding kind and stable ID. */
export type GestureTarget = Readonly<{ kind: "light" | "object" | "bubble"; id: string }>;

const keyOf = (target: GestureTarget | null): string =>
  target === null ? "" : `${target.kind}:${target.id}`;

/**
 * Tells a tap from a double tap on the same target. A tap waits for a possible second one only when `waits`
 * (the target has a double-tap action, or the tap hit empty space); otherwise it runs at once, and a quick
 * second tap on it counts as its double tap.
 */
export class TapSequence {
  private last: { key: string; time: number; timer: number } | null = null;

  tap(target: GestureTarget | null, waits: boolean, single: () => void, double: () => void): void {
    const now = performance.now();
    const key = keyOf(target);
    const last = this.last;
    if (last !== null && now - last.time < gestureTiming.doubleTapMs && last.key === key) {
      window.clearTimeout(last.timer);
      this.last = null;
      double();
      return;
    }
    if (last !== null) window.clearTimeout(last.timer);
    if (!waits) {
      this.last = { key, time: now, timer: 0 };
      single();
      return;
    }
    this.last = {
      key,
      time: now,
      timer: window.setTimeout(() => {
        this.last = null;
        single();
      }, gestureTiming.doubleTapMs),
    };
  }

  dispose(): void {
    if (this.last !== null) window.clearTimeout(this.last.timer);
    this.last = null;
  }
}
