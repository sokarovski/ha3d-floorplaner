// Roof sheet editing (Phase 19.1, spec/builder/features/roofs.md#editing): pure operations on a roof's authored
// points, outline and break lines, used by the roof commands and the roof tools' previews. Each returns the new
// sheet or a message saying why the edit is refused (the guard rails), never a half-applied sheet.
//
// Rules (owner, phase-19.md "What can be pulled"):
// - Only roof points can be pulled: outline corners, break-line ends, and where break lines cross or meet the
//   outline. There are no loose points: a point that no line or the outline uses is removed.
// - A new break line snaps its ends onto existing points, outline edges and other lines; where it crosses another
//   line both are split at one shared point; an end on the outline becomes an outline point. New points take the
//   roof's current height there, so drawing a line never changes the shape.
// - No point goes below the roof's base (height 0, the eave height); the outline stays a simple counterclockwise
//   ring, and break lines stay on the roof.
import type { RoofLineValue, RoofPointValue } from "../domain/schemas/roof";
import { maxRoofPointHeightMm, maxRoofPoints } from "../domain/schemas/roof";
import { ringSignedArea, pointInRing } from "./region";
import type { Ring } from "./region";
import type { RoofSheet } from "./roofSurface";
import { roofHeightAt, roofSurfaceOf, segmentCrossing, sheetOutlineRing } from "./roofSurface";
import type { Vec2 } from "./vector";

/** A point within this distance (mm) of another point, edge or line lands on it (implementation convention). */
export const roofSnapToleranceMm = 1;

export type SheetResult = Readonly<{ ok: true; sheet: RoofSheet }> | Readonly<{ ok: false; message: string }>;

/** New IDs for the points and lines an edit creates (the caller passes createId-backed factories). */
export type SheetIds = Readonly<{ point: () => string; line: () => string }>;

const refuse = (message: string): SheetResult => ({ ok: false, message });

/** A sheet from a plan ring (any orientation): every point at height 0, no break lines. */
export const sheetFromRing = (ring: Ring, ids: SheetIds): RoofSheet => {
  const ccw = ringSignedArea(ring) < 0 ? [...ring].reverse() : ring;
  const points: RoofPointValue[] = ccw.map((point) => ({
    id: ids.point(),
    x: point.x,
    y: point.y,
    heightMm: 0,
  }));
  return { points, outline: points.map((point) => point.id), lines: [] };
};

/** The rectangle min…max as a sheet (Add roof: the floor's bounding box grown by the overhang). */
export const rectangleSheet = (min: Vec2, max: Vec2, ids: SheetIds): RoofSheet =>
  sheetFromRing(
    [
      { x: min.x, y: min.y },
      { x: max.x, y: min.y },
      { x: max.x, y: max.y },
      { x: min.x, y: max.y },
    ],
    ids,
  );

const segmentsCross = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean => segmentCrossing(a, b, c, d) !== null;

/** Whether a ring is simple (no edge crosses another, no repeated vertex) and has an area. */
export const isSimpleRing = (ring: Ring): boolean => {
  if (ring.length < 3 || Math.abs(ringSignedArea(ring)) < 1) return false;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (a === undefined || b === undefined) return false;
    if (Math.hypot(b.x - a.x, b.y - a.y) < roofSnapToleranceMm) return false;
    for (let j = i + 1; j < ring.length; j += 1) {
      const c = ring[j];
      const d = ring[(j + 1) % ring.length];
      if (c === undefined || d === undefined) continue;
      if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
      if (segmentsCross(a, b, c, d)) return false;
      if (Math.hypot(c.x - a.x, c.y - a.y) < roofSnapToleranceMm) return false;
    }
  }
  return true;
};

/** Why a sheet is invalid (the guard rails), or undefined when it is fine. */
export const sheetProblem = (sheet: RoofSheet): string | undefined => {
  const ids = new Set(sheet.points.map((point) => point.id));
  if (ids.size !== sheet.points.length) return "Two roof points share an ID.";
  if (sheet.points.length > maxRoofPoints) return `A roof has at most ${String(maxRoofPoints)} points.`;
  if (sheet.outline.length < 3 || new Set(sheet.outline).size !== sheet.outline.length)
    return "The roof outline needs at least three different points.";
  if (sheet.outline.some((id) => !ids.has(id))) return "The roof outline uses a missing point.";
  if (sheet.lines.some((line) => !ids.has(line.a) || !ids.has(line.b) || line.a === line.b))
    return "A break line uses a missing point.";
  if (sheet.points.some((point) => point.heightMm < 0))
    return "A roof point cannot go below the roof's eave height; lower the whole roof instead.";
  if (sheet.points.some((point) => point.heightMm > maxRoofPointHeightMm)) return "A roof point is too high.";
  const ring = sheetOutlineRing(sheet);
  if (!isSimpleRing(ring)) return "The roof outline would cross itself.";
  if (ringSignedArea(ring) <= 0) return "The roof outline must run counterclockwise.";
  const byId = new Map(sheet.points.map((point) => [point.id, point]));
  const outlineSet = new Set(sheet.outline);
  for (const line of sheet.lines) {
    const a = byId.get(line.a);
    const b = byId.get(line.b);
    if (a === undefined || b === undefined) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (!pointInRing(mid, ring)) return "A break line must stay on the roof.";
    for (let i = 0; i < ring.length; i += 1) {
      const c = ring[i];
      const d = ring[(i + 1) % ring.length];
      if (c !== undefined && d !== undefined && segmentsCross(a, b, c, d))
        return "A break line must stay on the roof.";
    }
  }
  for (const point of sheet.points) {
    if (outlineSet.has(point.id)) continue;
    if (!pointInRing(point, ring)) return "A roof point must stay on the roof.";
  }
  return undefined;
};

const checked = (sheet: RoofSheet): SheetResult => {
  const problem = sheetProblem(sheet);
  return problem === undefined ? { ok: true, sheet } : refuse(problem);
};

/** Removes interior points no line uses (no loose points) and duplicate or degenerate lines. */
export const tidySheet = (sheet: RoofSheet): RoofSheet => {
  const seen = new Set<string>();
  const lines = sheet.lines.filter((line) => {
    if (line.a === line.b) return false;
    const key = line.a < line.b ? `${line.a}|${line.b}` : `${line.b}|${line.a}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const used = new Set([...sheet.outline, ...lines.flatMap((line) => [line.a, line.b])]);
  return { points: sheet.points.filter((point) => used.has(point.id)), outline: sheet.outline, lines };
};

/** Height of the roof over a plan point (relative), or 0 when it is outside every face. */
const heightAt = (sheet: RoofSheet, point: Vec2): number => roofHeightAt(roofSurfaceOf(sheet), point) ?? 0;

type Mutable = { points: RoofPointValue[]; outline: string[]; lines: RoofLineValue[] };

const mutable = (sheet: RoofSheet): Mutable => ({
  points: sheet.points.map((point) => ({ ...point })),
  outline: [...sheet.outline],
  lines: sheet.lines.map((line) => ({ ...line })),
});

const pointOf = (sheet: Mutable, id: string): RoofPointValue | undefined =>
  sheet.points.find((point) => point.id === id);

const nearestPoint = (sheet: Mutable, at: Vec2, tolerance: number): RoofPointValue | undefined => {
  let best: RoofPointValue | undefined;
  let bestDistance = tolerance;
  for (const point of sheet.points) {
    const distance = Math.hypot(point.x - at.x, point.y - at.y);
    if (distance <= bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
};

/** Parameter of p along a→b and its distance from the segment (clamped). */
const onSegment = (p: Vec2, a: Vec2, b: Vec2): Readonly<{ t: number; distance: number }> => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return { t, distance: Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)) };
};

/** Inserts a point into the outline edge (index → index + 1) at parameter t; height along the edge. */
const splitOutlineEdge = (
  sheet: Mutable,
  edgeIndex: number,
  at: Vec2,
  id: string,
): RoofPointValue | undefined => {
  const aId = sheet.outline[edgeIndex];
  const bId = sheet.outline[(edgeIndex + 1) % sheet.outline.length];
  const a = aId === undefined ? undefined : pointOf(sheet, aId);
  const b = bId === undefined ? undefined : pointOf(sheet, bId);
  if (a === undefined || b === undefined) return undefined;
  const { t } = onSegment(at, a, b);
  const point = { id, x: at.x, y: at.y, heightMm: a.heightMm + (b.heightMm - a.heightMm) * t };
  sheet.points.push(point);
  sheet.outline.splice(edgeIndex + 1, 0, id);
  // A break line along the split edge is split too (rare: lines along the outline).
  return point;
};

/** Splits a line at a point on it (height along the line); returns the shared point. */
const splitLine = (
  sheet: Mutable,
  lineIndex: number,
  at: Vec2,
  ids: SheetIds,
  existing?: RoofPointValue,
): RoofPointValue | undefined => {
  const line = sheet.lines[lineIndex];
  if (line === undefined) return undefined;
  const a = pointOf(sheet, line.a);
  const b = pointOf(sheet, line.b);
  if (a === undefined || b === undefined) return undefined;
  const { t } = onSegment(at, a, b);
  const point = existing ?? {
    id: ids.point(),
    x: at.x,
    y: at.y,
    heightMm: a.heightMm + (b.heightMm - a.heightMm) * t,
  };
  if (existing === undefined) sheet.points.push(point);
  // Both halves keep the line's kind (a step line stays a step on both sides of the split, 19.3).
  sheet.lines.splice(lineIndex, 1, { ...line, b: point.id }, { ...line, id: ids.line(), a: point.id });
  return point;
};

/**
 * Resolves a plan point to a roof point: an existing point near it, a point inserted on an outline edge or a line
 * it lies on, or a new interior point at the roof's current height there. Null when it is off the roof.
 */
const resolveEnd = (
  sheet: Mutable,
  at: Vec2,
  ids: SheetIds,
  surfaceHeight: (point: Vec2) => number,
): RoofPointValue | null => {
  const near = nearestPoint(sheet, at, roofSnapToleranceMm);
  if (near !== undefined) return near;
  for (let index = 0; index < sheet.outline.length; index += 1) {
    const aId = sheet.outline[index];
    const bId = sheet.outline[(index + 1) % sheet.outline.length];
    const a = aId === undefined ? undefined : pointOf(sheet, aId);
    const b = bId === undefined ? undefined : pointOf(sheet, bId);
    if (a === undefined || b === undefined) continue;
    if (onSegment(at, a, b).distance <= roofSnapToleranceMm)
      return splitOutlineEdge(sheet, index, at, ids.point()) ?? null;
  }
  for (let index = 0; index < sheet.lines.length; index += 1) {
    const line = sheet.lines[index];
    const a = line === undefined ? undefined : pointOf(sheet, line.a);
    const b = line === undefined ? undefined : pointOf(sheet, line.b);
    if (a === undefined || b === undefined) continue;
    if (onSegment(at, a, b).distance <= roofSnapToleranceMm) return splitLine(sheet, index, at, ids) ?? null;
  }
  const ring = sheet.outline.flatMap((id) => {
    const point = pointOf(sheet, id);
    return point === undefined ? [] : [point];
  });
  if (!pointInRing(at, ring)) return null;
  const point = { id: ids.point(), x: at.x, y: at.y, heightMm: Math.max(0, surfaceHeight(at)) };
  sheet.points.push(point);
  return point;
};

/**
 * Adds a break line from `from` to `to` (plan, floor frame). Ends snap onto points, the outline and other lines;
 * crossings split both lines at one shared point. Returns the new sheet and the IDs of the lines drawn.
 */
export const addBreakLine = (sheet: RoofSheet, from: Vec2, to: Vec2, ids: SheetIds): SheetResult => {
  if (Math.hypot(to.x - from.x, to.y - from.y) < roofSnapToleranceMm * 2)
    return refuse("A break line needs two different points.");
  const original = roofSurfaceOf(sheet);
  const surfaceHeight = (point: Vec2): number => roofHeightAt(original, point) ?? 0;
  const draft = mutable(sheet);
  const a = resolveEnd(draft, from, ids, surfaceHeight);
  const b = resolveEnd(draft, to, ids, surfaceHeight);
  if (a === null || b === null) return refuse("A break line must start and end on the roof.");
  if (a.id === b.id) return refuse("A break line needs two different points.");
  // Points along the new line: existing points on it, and crossings with lines (split at one shared point).
  const stops: { t: number; point: RoofPointValue }[] = [
    { t: 0, point: a },
    { t: 1, point: b },
  ];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  for (const point of draft.points) {
    if (point.id === a.id || point.id === b.id) continue;
    const { t, distance } = onSegment(point, a, b);
    if (
      distance <= roofSnapToleranceMm &&
      t * length > roofSnapToleranceMm &&
      (1 - t) * length > roofSnapToleranceMm
    )
      stops.push({ t, point });
  }
  for (let index = draft.lines.length - 1; index >= 0; index -= 1) {
    const line = draft.lines[index];
    const c = line === undefined ? undefined : pointOf(draft, line.a);
    const d = line === undefined ? undefined : pointOf(draft, line.b);
    if (line === undefined || c === undefined || d === undefined) continue;
    if ([c.id, d.id].some((id) => stops.some((stop) => stop.point.id === id))) continue;
    const crossing = segmentCrossing(a, b, c, d);
    if (crossing === null) continue;
    const shared = splitLine(draft, index, crossing.point, ids);
    if (shared !== undefined) stops.push({ t: crossing.t, point: shared });
  }
  // Crossing the outline is not allowed (the line would leave the roof).
  const ring = draft.outline.flatMap((id) => {
    const point = pointOf(draft, id);
    return point === undefined ? [] : [point];
  });
  for (let index = 0; index < ring.length; index += 1) {
    const c = ring[index];
    const d = ring[(index + 1) % ring.length];
    if (c !== undefined && d !== undefined && segmentCrossing(a, b, c, d) !== null)
      return refuse("A break line must stay on the roof.");
  }
  stops.sort((x, y) => x.t - y.t);
  for (let index = 0; index + 1 < stops.length; index += 1) {
    const first = stops[index];
    const second = stops[index + 1];
    if (first === undefined || second === undefined || first.point.id === second.point.id) continue;
    const outlineEdge = draft.outline.some((id, at) => {
      const next = draft.outline[(at + 1) % draft.outline.length];
      return (
        (id === first.point.id && next === second.point.id) ||
        (id === second.point.id && next === first.point.id)
      );
    });
    if (outlineEdge) continue;
    draft.lines.push({ id: ids.line(), a: first.point.id, b: second.point.id });
  }
  return checked(tidySheet(draft));
};

export type SheetMove = Readonly<{ x: number; y: number; h: number }>;

/**
 * Moves points: plan offsets (outline editing; break-line ends) and heights (pulling up or down). A height below the
 * base is refused (the guard rail). One call is one edit (the tool previews and commits it).
 */
export const movePoints = (sheet: RoofSheet, pointIds: readonly string[], by: SheetMove): SheetResult => {
  const moving = new Set(pointIds);
  if (moving.size === 0) return { ok: true, sheet };
  const points = sheet.points.map((point) =>
    moving.has(point.id)
      ? { ...point, x: point.x + by.x, y: point.y + by.y, heightMm: point.heightMm + by.h }
      : point,
  );
  if (points.some((point) => moving.has(point.id) && point.heightMm < -1e-6))
    return refuse("A roof point cannot go below the roof's eave height; lower the whole roof instead.");
  return checked({
    ...sheet,
    points: points.map((point) => ({ ...point, heightMm: Math.max(0, point.heightMm) })),
  });
};

/** Sets the height of points (typed in the properties panel or the Move tool). */
export const setPointHeights = (
  sheet: RoofSheet,
  pointIds: readonly string[],
  heightMm: number,
): SheetResult => {
  if (heightMm < 0)
    return refuse("A roof point cannot go below the roof's eave height; lower the whole roof instead.");
  const ids = new Set(pointIds);
  return checked({
    ...sheet,
    points: sheet.points.map((point) => (ids.has(point.id) ? { ...point, heightMm } : point)),
  });
};

/** Deletes points (and the lines on them) and lines; an outline keeps at least three points. */
export const deleteFromSheet = (
  sheet: RoofSheet,
  pointIds: readonly string[],
  lineIds: readonly string[],
): SheetResult => {
  const points = new Set(pointIds);
  const lines = new Set(lineIds);
  const outline = sheet.outline.filter((id) => !points.has(id));
  if (outline.length < 3)
    return refuse("A roof outline keeps at least three points. Delete the roof itself instead.");
  return checked(
    tidySheet({
      points: sheet.points.filter((point) => !points.has(point.id)),
      outline,
      lines: sheet.lines.filter((line) => !lines.has(line.id) && !points.has(line.a) && !points.has(line.b)),
    }),
  );
};

/** Inserts an outline point on the outline edge nearest to `at` (Alt-click on the edge), at the edge's height. */
export const insertOutlinePoint = (sheet: RoofSheet, at: Vec2, id: string): SheetResult => {
  const draft = mutable(sheet);
  let best: { index: number; distance: number } | undefined;
  draft.outline.forEach((aId, index) => {
    const bId = draft.outline[(index + 1) % draft.outline.length];
    const a = pointOf(draft, aId);
    const b = bId === undefined ? undefined : pointOf(draft, bId);
    if (a === undefined || b === undefined) return;
    const { distance } = onSegment(at, a, b);
    if (best === undefined || distance < best.distance) best = { index, distance };
  });
  if (best === undefined) return refuse("No outline edge there.");
  splitOutlineEdge(draft, best.index, at, id);
  return checked(draft);
};

/** Replaces the outline with a new ring (drawn with Rectangle, Circle or Polygon): a flat sheet, no break lines. */
export const replaceOutline = (ring: Ring, ids: SheetIds): SheetResult => {
  if (!isSimpleRing(ring)) return refuse("The roof outline would cross itself.");
  return checked(sheetFromRing(ring, ids));
};

/** The relative heights of every point after lowering/raising the whole sheet so its lowest point is at 0. */
export const roofSheetHeightRange = (sheet: RoofSheet): Readonly<{ min: number; max: number }> => {
  const heights = sheet.points.map((point) => point.heightMm);
  return { min: Math.min(...heights), max: Math.max(...heights) };
};

/** The roof height over a plan point (relative), for tools; 0 outside. */
export const sheetHeightAt = heightAt;
