// A small asset load queue (Phase 15.1, spec/architecture/renderer.md#asset-loading). Framework-free, no Three.js or
// DOM. Hosts that stage their loading (the HA viewer) hand it to the template and texture caches; a host without one
// loads on request as before (the builder).
//
// Jobs wait in lanes. Lane 0 is open from the start; the host opens later lanes when their stage begins (the HA viewer
// opens its object and texture lanes once the opening camera move has settled). Among open lanes the lowest lane runs
// first, in request order within a lane, and at most `concurrency` jobs run at once, so connections and the main
// thread are never flooded. A job's promise covers its whole preparation (fetch, decode, parse, upload), so a slot
// frees only when the asset is really ready.

export type LoadJob = Readonly<{
  /** Lane 0 runs at once; higher lanes wait until opened (`open`). */
  lane: number;
  /** What is loaded (diagnostics and progress): "template", "texture". */
  kind: string;
  /** Resolves (or rejects) when the asset is ready or has failed; the queue only counts it. */
  run: () => Promise<void>;
}>;

export type LoadProgress = Readonly<{
  /** Jobs requested since the last `reset`. */
  total: number;
  /** Jobs that finished (ready or failed). */
  settled: number;
  running: number;
  /** Jobs waiting, in open and closed lanes. */
  queued: number;
}>;

export type LoadQueue = Readonly<{
  enqueue: (job: LoadJob) => void;
  /** Opens every lane up to and including `lane`. */
  open: (lane: number) => void;
  /** The highest open lane. */
  openLane: () => number;
  progress: () => LoadProgress;
  /** True when no job of `lane` (or of any lane up to it) waits or runs. */
  laneSettled: (lane: number) => boolean;
  /** Called after every change of progress (a job queued, started, or settled). */
  subscribe: (listener: (progress: LoadProgress) => void) => () => void;
  /**
   * A new stage sequence (a different house or floor): later lanes close again and the counts restart from the jobs
   * still waiting or running. Jobs are never dropped, since a cache entry waits for its job.
   */
  reset: () => void;
  dispose: () => void;
}>;

type Waiting = Readonly<{ job: LoadJob; order: number }>;

export const createLoadQueue = (concurrency: number): LoadQueue => {
  const limit = Math.max(1, Math.floor(concurrency));
  let waiting: Waiting[] = [];
  /** Lanes of the running jobs of the current generation. */
  const runningLanes: number[] = [];
  let order = 0;
  let open = 0;
  let total = 0;
  let settled = 0;
  let disposed = false;
  const listeners = new Set<(progress: LoadProgress) => void>();

  const progress = (): LoadProgress => ({
    total,
    settled,
    running: runningLanes.length,
    queued: waiting.length,
  });

  const notify = (): void => {
    const now = progress();
    for (const listener of [...listeners]) listener(now);
  };

  const next = (): Waiting | null => {
    let best: Waiting | null = null;
    for (const candidate of waiting) {
      if (candidate.job.lane > open) continue;
      if (
        best === null ||
        candidate.job.lane < best.job.lane ||
        (candidate.job.lane === best.job.lane && candidate.order < best.order)
      )
        best = candidate;
    }
    return best;
  };

  const pump = (): void => {
    if (disposed) return;
    let started = false;
    while (runningLanes.length < limit) {
      const chosen = next();
      if (chosen === null) break;
      waiting = waiting.filter((candidate) => candidate !== chosen);
      const lane = chosen.job.lane;
      runningLanes.push(lane);
      started = true;
      const finish = (): void => {
        if (disposed) return;
        const index = runningLanes.indexOf(lane);
        if (index >= 0) runningLanes.splice(index, 1);
        settled += 1;
        notify();
        pump();
      };
      let running: Promise<void>;
      try {
        running = chosen.job.run();
      } catch (error) {
        running = Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
      running.then(finish, finish);
    }
    if (started) notify();
  };

  return {
    enqueue: (job) => {
      if (disposed) return;
      waiting.push({ job, order: order++ });
      total += 1;
      notify();
      pump();
    },
    open: (lane) => {
      if (lane <= open) return;
      open = lane;
      pump();
    },
    openLane: () => open,
    progress,
    laneSettled: (lane) =>
      !waiting.some((candidate) => candidate.job.lane <= lane) && !runningLanes.some((each) => each <= lane),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset: () => {
      open = 0;
      total = waiting.length + runningLanes.length;
      settled = 0;
      notify();
    },
    dispose: () => {
      disposed = true;
      waiting = [];
      listeners.clear();
    },
  };
};
