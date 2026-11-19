// One frame scheduler per viewport (Phase 15.3, spec/architecture/renderer.md#lifecycle-and-performance-rules).
// Framework-free and free of Three.js and the DOM: the host injects its clock and frame source (requestAnimationFrame
// in a browser, a fake clock in `npm run frames:check`). Rendering stays on demand: a frame runs when something
// invalidates the view or while at least one animation is active, and the loop stops when neither holds.
//
// Every animation has its own lifecycle (active → completed | cancelled) on a named channel. A frame steps every
// active animation with the same `now`; one that finishes, throws, or is cancelled leaves the others running, and a
// host cancels a channel (the camera, when the hand grabs the view) without touching the rest (object states,
// loading). Idle listeners fire after the frame in which their channels became idle, so a host can wait for the
// finite opening camera move without waiting for ambient or recurring work on other channels.

export type AnimationStatus = "active" | "completed" | "cancelled";

export type FrameAnimation = Readonly<{
  /** Groups animations a host may cancel or wait for together ("camera", "states", "assets"). */
  channel: string;
  /** Advances to `now` (ms, the frame's clock); false when the animation has finished. */
  step: (now: number) => boolean;
  /** Called once when the animation completes or is cancelled (also when its step throws). */
  onEnd?: (status: Exclude<AnimationStatus, "active">) => void;
}>;

export type AnimationHandle = Readonly<{
  status: () => AnimationStatus;
  /** Stops the animation now; it is not stepped again. No effect once it has ended. */
  cancel: () => void;
}>;

/** Where frames come from: a clock and a one-shot frame request (requestAnimationFrame in a browser). */
export type FrameSource = Readonly<{
  now: () => number;
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
}>;

export type FrameScheduler = Readonly<{
  /** Asks for one frame (a scene or view change). Requests before the frame runs are coalesced into it. */
  invalidate: () => void;
  /** Starts an animation; it is first stepped in the next frame. */
  start: (animation: FrameAnimation) => AnimationHandle;
  /** Cancels every active animation of a channel; the other channels go on. */
  cancelChannel: (channel: string) => void;
  /** True while an animation (of the channel, or of any channel) is active. */
  active: (channel?: string) => boolean;
  /**
   * Calls `listener` once after the frame in which none of `channels` has an active animation (at the next frame when
   * none has one now). Returns a function that drops the listener.
   */
  whenIdle: (channels: readonly string[], listener: () => void) => () => void;
  /**
   * Pauses or resumes all frames (16.11: the viewport is off screen). While paused no frame is requested and nothing
   * is stepped or drawn; active animations wait, and resuming always draws one frame with the current state.
   * Animations step with the real clock after a pause: a host's own steps cap the gap (the camera) or settle at their
   * end state (state animations).
   */
  setPaused: (paused: boolean) => void;
  /** True while paused (diagnostics and checks). */
  paused: () => boolean;
  /** True while a frame is requested (diagnostics and checks). */
  pending: () => boolean;
  /** Stops everything: animations are cancelled, the requested frame is dropped, nothing runs again. */
  dispose: () => void;
}>;

type Running = { readonly animation: FrameAnimation; status: AnimationStatus };

type IdleListener = { readonly channels: readonly string[]; readonly listener: () => void };

/**
 * `render(now)` draws one frame; it runs after the frame's animations stepped. `onError` reports a step or render
 * that threw (the loop itself survives it; the failing animation is cancelled).
 */
export const createFrameScheduler = (
  source: FrameSource,
  render: (now: number) => void,
  onError: (error: unknown) => void = (error) => {
    console.error(error);
  },
): FrameScheduler => {
  const running: Running[] = [];
  const idleListeners: IdleListener[] = [];
  let handle: number | null = null;
  let invalidated = false;
  let disposed = false;
  let paused = false;
  /** Read through a call: a step or the render may invalidate during the frame. */
  const invalidatedSince = (): boolean => invalidated;

  const end = (entry: Running, status: Exclude<AnimationStatus, "active">): void => {
    if (entry.status !== "active") return;
    entry.status = status;
    try {
      entry.animation.onEnd?.(status);
    } catch (error) {
      onError(error);
    }
  };

  const anyActive = (channel?: string): boolean =>
    running.some(
      (entry) => entry.status === "active" && (channel === undefined || entry.animation.channel === channel),
    );

  const request = (): void => {
    if (disposed || handle !== null) return;
    // Paused: nothing is requested; resuming always draws one frame with the current state.
    if (paused) return;
    handle = source.request(frame);
  };

  function frame(): void {
    handle = null;
    if (disposed) return;
    if (paused) return;
    invalidated = false;
    const now = source.now();
    // A snapshot: animations started during this frame are stepped from the next one.
    for (const entry of [...running]) {
      if (entry.status !== "active") continue;
      try {
        if (!entry.animation.step(now)) end(entry, "completed");
      } catch (error) {
        onError(error);
        end(entry, "cancelled");
      }
    }
    for (let index = running.length - 1; index >= 0; index -= 1)
      if (running[index]?.status !== "active") running.splice(index, 1);
    try {
      render(now);
    } catch (error) {
      onError(error);
    }
    // Idle listeners after the frame that settled their channels (the settled pose is on screen).
    for (const entry of [...idleListeners]) {
      if (entry.channels.some((channel) => anyActive(channel))) continue;
      const index = idleListeners.indexOf(entry);
      if (index >= 0) idleListeners.splice(index, 1);
      try {
        entry.listener();
      } catch (error) {
        onError(error);
      }
    }
    if (anyActive() || invalidatedSince()) request();
  }

  return {
    invalidate: () => {
      invalidated = true;
      request();
    },
    start: (animation) => {
      const entry: Running = { animation, status: disposed ? "cancelled" : "active" };
      if (!disposed) {
        running.push(entry);
        request();
      }
      return {
        status: () => entry.status,
        cancel: () => {
          end(entry, "cancelled");
        },
      };
    },
    cancelChannel: (channel) => {
      for (const entry of running) if (entry.animation.channel === channel) end(entry, "cancelled");
    },
    active: (channel) => anyActive(channel),
    whenIdle: (channels, listener) => {
      const entry: IdleListener = { channels, listener };
      idleListeners.push(entry);
      request();
      return () => {
        const index = idleListeners.indexOf(entry);
        if (index >= 0) idleListeners.splice(index, 1);
      };
    },
    setPaused: (next) => {
      if (disposed || next === paused) return;
      paused = next;
      if (paused) {
        if (handle !== null) {
          source.cancel(handle);
          handle = null;
        }
        return;
      }
      // Back on screen: always one frame, so the view shows the current state.
      invalidated = true;
      request();
    },
    paused: () => paused,
    pending: () => handle !== null,
    dispose: () => {
      if (disposed) return;
      for (const entry of running) end(entry, "cancelled");
      disposed = true;
      running.length = 0;
      idleListeners.length = 0;
      if (handle !== null) source.cancel(handle);
      handle = null;
    },
  };
};
