// Provenance recovery: polygon booleans lose edge identity, so each output boundary segment is mapped
// back to the source segments it lies on. A source covers part of a boundary segment when both segment
// ends are within the on-line tolerance of the source's infinite line, the directions agree (same side
// is "inside"), and their projections overlap. The segment is then split at every source end so each
// piece has an exact owner set (collinear overlapping sources, splits at intersections, and rotated
// inputs all reduce to this test).
import type { Bounds } from "./region";
import { boundsOverlap, ringBounds } from "./region";
import { onLineToleranceMm } from "./tolerances";
import type { Vec2 } from "./vector";
import { addVec, dotVec, normalizeVec, scaleVec, signedDistanceToLine, subVec, vecLength } from "./vector";

export type SourceSegment<T> = Readonly<{ start: Vec2; end: Vec2; payload: T }>;

/** A piece of an output boundary segment and every source segment it lies on (empty = no owner). */
export type CoveredPiece<T> = Readonly<{ start: Vec2; end: Vec2; owners: readonly SourceSegment<T>[] }>;

type PreparedSource<T> = Readonly<{ source: SourceSegment<T>; direction: Vec2; bounds: Bounds }>;

export type SourceIndex<T> = Readonly<{ sources: readonly PreparedSource<T>[] }>;

export const createSourceIndex = <T>(sources: readonly SourceSegment<T>[]): SourceIndex<T> => ({
  sources: sources
    .filter((source) => vecLength(subVec(source.end, source.start)) > 0)
    .map((source) => ({
      source,
      direction: normalizeVec(subVec(source.end, source.start)),
      bounds: ringBounds([source.start, source.end]),
    })),
});

type Match<T> = Readonly<{ source: SourceSegment<T>; fromMm: number; toMm: number }>;

const sameOwners = <T>(left: readonly SourceSegment<T>[], right: readonly SourceSegment<T>[]): boolean =>
  left.length === right.length && left.every((owner, index) => owner === right[index]);

/** Splits one output boundary segment into pieces by the sources that lie on it. */
export const coverSegment = <T>(
  start: Vec2,
  end: Vec2,
  index: SourceIndex<T>,
  toleranceMm: number = onLineToleranceMm,
): CoveredPiece<T>[] => {
  const length = vecLength(subVec(end, start));
  if (length === 0) return [];
  const direction = scaleVec(subVec(end, start), 1 / length);
  const segmentBounds = ringBounds([start, end]);
  const matches: Match<T>[] = [];
  for (const prepared of index.sources) {
    if (!boundsOverlap(segmentBounds, prepared.bounds, toleranceMm)) continue;
    if (dotVec(direction, prepared.direction) <= 0) continue;
    if (Math.abs(signedDistanceToLine(start, prepared.source.start, prepared.direction)) > toleranceMm)
      continue;
    if (Math.abs(signedDistanceToLine(end, prepared.source.start, prepared.direction)) > toleranceMm)
      continue;
    // The tolerance matches the source line, not extra length beyond the source face. Extending both
    // ends makes adjacent faces falsely share a tiny interval at every open-plan area boundary.
    const fromMm = Math.max(0, dotVec(subVec(prepared.source.start, start), direction));
    const toMm = Math.min(length, dotVec(subVec(prepared.source.end, start), direction));
    if (toMm - fromMm > 2 * toleranceMm) matches.push({ source: prepared.source, fromMm, toMm });
  }
  const breaks = [...new Set([0, length, ...matches.flatMap((match) => [match.fromMm, match.toMm])])].sort(
    (a, b) => a - b,
  );
  const pieces: { fromMm: number; toMm: number; owners: SourceSegment<T>[] }[] = [];
  for (let breakIndex = 0; breakIndex + 1 < breaks.length; breakIndex += 1) {
    const fromMm = breaks[breakIndex];
    const toMm = breaks[breakIndex + 1];
    if (fromMm === undefined || toMm === undefined || toMm - fromMm <= 1e-9) continue;
    const middle = (fromMm + toMm) / 2;
    const owners = matches
      .filter((match) => match.fromMm <= middle && middle <= match.toMm)
      .map((match) => match.source);
    const last = pieces[pieces.length - 1];
    if (last !== undefined && sameOwners(last.owners, owners)) last.toMm = toMm;
    else pieces.push({ fromMm, toMm, owners });
  }
  return pieces.map((piece) => ({
    start: addVec(start, scaleVec(direction, piece.fromMm)),
    end: addVec(start, scaleVec(direction, piece.toMm)),
    owners: piece.owners,
  }));
};

/** Parameter (mm from the source start) of a point projected onto a source segment. */
export const projectOntoSource = <T>(source: SourceSegment<T>, point: Vec2): number =>
  dotVec(subVec(point, source.start), normalizeVec(subVec(source.end, source.start)));
