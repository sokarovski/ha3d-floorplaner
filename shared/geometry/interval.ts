// Closed 1D intervals in millimetres along an edge.

export type Interval = Readonly<{ fromMm: number; toMm: number }>;

/** Sorts and merges intervals that overlap or touch within the tolerance. */
export const mergeIntervals = (intervals: readonly Interval[], toleranceMm: number): Interval[] => {
  const sorted = [...intervals].sort((left, right) => left.fromMm - right.fromMm);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && interval.fromMm <= last.toMm + toleranceMm) {
      merged[merged.length - 1] = { fromMm: last.fromMm, toMm: Math.max(last.toMm, interval.toMm) };
    } else {
      merged.push(interval);
    }
  }
  return merged;
};

/** Intersection of one interval with a merged interval list; pieces shorter than minLengthMm are dropped. */
export const intersectIntervalWith = (
  interval: Interval,
  intervals: readonly Interval[],
  minLengthMm: number,
): Interval[] => {
  const pieces: Interval[] = [];
  for (const other of intervals) {
    const fromMm = Math.max(interval.fromMm, other.fromMm);
    const toMm = Math.min(interval.toMm, other.toMm);
    if (toMm - fromMm >= minLengthMm) pieces.push({ fromMm, toMm });
  }
  return pieces;
};

export const intervalLength = (interval: Interval): number => interval.toMm - interval.fromMm;
