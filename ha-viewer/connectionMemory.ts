// Session memory of the last successful builder connection (Phase 15.12): House settings shows the remembered
// result at once and refreshes it in the background. Held in this module only (nothing is stored in HA), per key
// object (the integration client). Pure apart from the injected clock, so the rules can be checked.

/** How long a result counts as connected without a successful refresh (implementation convention, 15.12). */
export const memoryLifetimeMs = 15 * 60 * 1000;

/** connected: refreshed within the lifetime; notRefreshed: the last refresh failed; expired: older than the lifetime. */
export type MemoryState = "connected" | "notRefreshed" | "expired";

export type MemoryView<T> = Readonly<{ value: T; state: MemoryState; at: number }>;

type Entry<T> = { value: T; at: number; refreshFailed: boolean; auto: boolean };

export type ConnectionMemory<K extends object, T> = Readonly<{
  /** Replaces the remembered result after a successful connect or refresh. */
  remember: (key: K, value: T) => void;
  /** A background refresh failed: the data stays, marked not refreshed. */
  markFailed: (key: K) => void;
  forget: (key: K) => void;
  /**
   * Whether opening House settings may fetch on its own: only after a fetch has succeeded, and off from the first
   * failure (background or manual) until a manual Connect succeeds again (owner, 15.12).
   */
  autoRefresh: (key: K) => boolean;
  view: (key: K) => MemoryView<T> | undefined;
}>;

export const createConnectionMemory = <K extends object, T>(
  clock: () => number,
  lifetimeMs: number = memoryLifetimeMs,
): ConnectionMemory<K, T> => {
  const entries = new WeakMap<K, Entry<T>>();
  return {
    remember: (key, value) => {
      entries.set(key, { value, at: clock(), refreshFailed: false, auto: true });
    },
    markFailed: (key) => {
      const entry = entries.get(key);
      if (entry !== undefined) {
        entry.refreshFailed = true;
        entry.auto = false;
      }
    },
    forget: (key) => {
      entries.delete(key);
    },
    autoRefresh: (key) => entries.get(key)?.auto ?? false,
    view: (key) => {
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      const state: MemoryState =
        clock() - entry.at >= lifetimeMs ? "expired" : entry.refreshFailed ? "notRefreshed" : "connected";
      return { value: entry.value, state, at: entry.at };
    },
  };
};
