// Opt-in timing of light switches (Phase 16.6): the time from a light state change to the end of the next rendered
// frame, and whether that frame compiled shader programs (the renderer's program count before and after, a proxy
// for the recompile a changed light topology causes). Used by the HA viewer's load timing and the builder viewport;
// on only when `localStorage["homeplan.loadTiming"]` is "1" (or the page URL has `homeplanTiming`, or the HA viewer
// runs in dev mode). Reads performance.now() only; no timer, loop, or UI. Framework-free.

/** Whether timing was asked for (a localStorage flag or a URL parameter); never throws. */
export const switchTimingRequested = (): boolean => {
  try {
    if (new URLSearchParams(window.location.search).has("homeplanTiming")) return true;
    return window.localStorage.getItem("homeplan.loadTiming") === "1";
  } catch {
    return false;
  }
};

export type SwitchTiming = Readonly<{
  /**
   * A light state change is about to be drawn; `programs` is the renderer's program count now. Returns the call to
   * make after the next rendered frame, with the program count then.
   */
  begin: (label: string, programs: number) => (programs: number) => void;
}>;

export const createSwitchTiming = (log: (message: string) => void): SwitchTiming => {
  const counts = new Map<string, number>();
  return {
    begin: (label, before) => {
      const count = (counts.get(label) ?? 0) + 1;
      counts.set(label, count);
      const started = performance.now();
      let done = false;
      return (after) => {
        if (done) return;
        done = true;
        const compiled = after - before;
        log(
          `${label} #${String(count)}${count === 1 ? " (first)" : ""}: ${(performance.now() - started).toFixed(1)} ms ` +
            `to the next frame; programs ${String(before)} → ${String(after)}` +
            (compiled > 0 ? ` (${String(compiled)} compiled)` : " (no compile)"),
        );
      };
    },
  };
};
