// Clipping helpers for the roof's wall limit in the 2.5D wall pipeline (Phase 19.2). The kept solid of a slice
// [bottom, top] over footprint F is { (P, h) : P ∈ F, bottom ≤ h ≤ min(top, H(P)) }, where H is the underside of the
// roof piece over P (shared/geometry/roofLimit.ts) and +∞ where no roof covers P. Each piece is a plane limited to its
// own plan region, so faces are split where they cross a piece boundary and every stretch is trimmed by its piece.
import { differenceRegions, intersectRegions, unionRings } from "./polygonKernel";
import type { Bounds, Region } from "./region";
import { pointInRegion, regionBounds, regionRings } from "./region";
import type { Linear2, RoofLimit, RoofLimitPiece } from "./roofLimit";
import { evaluateLinear, roofProbeMm, segmentBreaks, segmentSpans } from "./roofLimit";
import { heightToleranceMm } from "./tolerances";
import type { Vec2 } from "./vector";
import { lerpVec, normalizeVec, rightNormal, subVec } from "./vector";

export const clipBoundsMarginMm = 1000;

const boundsRing = (bounds: Bounds, margin = clipBoundsMarginMm): Vec2[] => [
  { x: bounds.minX - margin, y: bounds.minY - margin },
  { x: bounds.maxX + margin, y: bounds.minY - margin },
  { x: bounds.maxX + margin, y: bounds.maxY + margin },
  { x: bounds.minX - margin, y: bounds.maxY + margin },
];

/** Sutherland–Hodgman: keeps the part of a convex polygon where f ≥ 0. */
export const clipConvex = (polygon: readonly Vec2[], f: Linear2): Vec2[] => {
  const result: Vec2[] = [];
  polygon.forEach((current, index) => {
    const next = polygon[(index + 1) % polygon.length];
    if (next === undefined) return;
    const fc = evaluateLinear(f, current);
    const fn = evaluateLinear(f, next);
    if (fc >= 0) result.push(current);
    if (fc >= 0 !== fn >= 0) result.push(lerpVec(current, next, fc / (fc - fn)));
  });
  return result;
};

export const minusLinear = (a: Linear2, b: Linear2): Linear2 => ({
  c: a.c - b.c,
  ax: a.ax - b.ax,
  ay: a.ay - b.ay,
});

const constant = (value: number): Linear2 => ({ c: value, ax: 0, ay: 0 });

/** The plan region (within bounds plus a margin) where every constraint f ≥ 0 holds. */
const convexRegionWhere = (bounds: Bounds, constraints: readonly Linear2[]): Region => {
  let polygon: Vec2[] = boundsRing(bounds);
  for (const constraint of constraints) {
    polygon = clipConvex(polygon, constraint);
    if (polygon.length < 3) return { polygons: [] };
  }
  return unionRings([polygon], { closeContacts: false });
};

/**
 * The parts of a horizontal region at heightMm that survive the roof: everything outside the roof, and inside each
 * piece the part strictly below its underside (a cap at heightMm is kept there).
 */
export const regionsUnderRoof = (region: Region, limit: RoofLimit | null, heightMm: number): Region[] => {
  if (limit === null || region.polygons.length === 0) return [region];
  const outside = differenceRegions(region, limit.coverage);
  const inside = limit.pieces.map((piece) =>
    intersectRegions(
      intersectRegions(region, piece.region),
      convexRegionWhere(piece.bounds, [minusLinear(piece.plane, constant(heightMm + heightToleranceMm))]),
    ),
  );
  return [outside, ...inside].filter((part) => part.polygons.length > 0);
};

/** Sloped cap pieces of a slice: per roof piece, the footprint under it where bottom < H ≤ top. */
export const slopedCapRegions = (
  footprint: Region,
  limit: RoofLimit | null,
  bottomMm: number,
  topMm: number,
): { piece: RoofLimitPiece; region: Region }[] => {
  if (limit === null) return [];
  return limit.pieces.flatMap((piece) => {
    const where = convexRegionWhere(piece.bounds, [
      minusLinear(piece.plane, constant(bottomMm + heightToleranceMm)),
      minusLinear(constant(topMm + heightToleranceMm), piece.plane),
    ]);
    if (where.polygons.length === 0) return [];
    const region = intersectRegions(intersectRegions(footprint, piece.region), where);
    return region.polygons.length === 0 ? [] : [{ piece, region }];
  });
};

/** A trimmed piece of a vertical face: plan parameters t0..t1 along the edge and the top height at each end. */
export type FaceSpan = Readonly<{ t0: number; t1: number; top0: number; top1: number }>;

/** Trims the stretch t0..t1 of a face to min(top, plane), split where the plane crosses bottom or top. */
const trimToPlane = (
  start: Vec2,
  end: Vec2,
  t0: number,
  t1: number,
  bottomMm: number,
  topMm: number,
  plane: Linear2 | undefined,
): FaceSpan[] => {
  if (plane === undefined) return [{ t0, t1, top0: topMm, top1: topMm }];
  const h0 = evaluateLinear(plane, lerpVec(start, end, t0));
  const h1 = evaluateLinear(plane, lerpVec(start, end, t1));
  const breaks = new Set<number>([t0, t1]);
  for (const level of [bottomMm, topMm]) {
    const d0 = h0 - level;
    const d1 = h1 - level;
    if (d0 !== d1 && d0 > 0 !== d1 > 0) breaks.add(t0 + ((t1 - t0) * d0) / (d0 - d1));
  }
  const sorted = [...breaks].sort((a, b) => a - b);
  const topAt = (t: number): number =>
    Math.max(bottomMm, Math.min(topMm, h0 + ((h1 - h0) * (t - t0)) / (t1 - t0)));
  const spans: FaceSpan[] = [];
  for (let index = 0; index + 1 < sorted.length; index += 1) {
    const a = sorted[index];
    const b = sorted[index + 1];
    if (a === undefined || b === undefined || b - a <= 1e-12) continue;
    const top0 = topAt(a);
    const top1 = topAt(b);
    if (Math.max(top0, top1) <= bottomMm + heightToleranceMm) continue;
    spans.push({ t0: a, t1: b, top0, top1 });
  }
  return spans;
};

/**
 * Trims a vertical face (edge start→end, bottom..top; its solid lies to the left) to the roof: split where it crosses
 * a piece boundary, each stretch trimmed by the piece over it (probed just inside the solid, so a face lying on the
 * roof's outline counts as covered); stretches outside the roof keep the full height.
 */
export const clipFaceSpans = (
  start: Vec2,
  end: Vec2,
  bottomMm: number,
  topMm: number,
  limit: RoofLimit | null,
): FaceSpan[] => {
  if (limit === null) return [{ t0: 0, t1: 1, top0: topMm, top1: topMm }];
  const normal = rightNormal(normalizeVec(subVec(end, start)));
  const probe = { x: -normal.x * roofProbeMm, y: -normal.y * roofProbeMm };
  return segmentSpans(limit, start, end, probe).flatMap((span) =>
    trimToPlane(start, end, span.t0, span.t1, bottomMm, topMm, span.piece?.plane),
  );
};

/**
 * A stretch of a step face: parameters t0..t1, the face's bottom (the lower underside, within the slice) and its top
 * (the slice top, or the higher underside at a step line) at each end.
 */
export type StepSpan = Readonly<{
  t0: number;
  t1: number;
  low0: number;
  low1: number;
  high0: number;
  high1: number;
}>;

/**
 * A vertical step face in the walls: where the roof's outline crosses them (the uncovered wall's side above the
 * underside), or where a step line crosses them (Phase 19.5: the raised side's wall above the low side's underside).
 */
export type StepFace = Readonly<{ start: Vec2; end: Vec2; spans: readonly StepSpan[] }>;

/** The stretches of a→b where the plane is below topMm, with the plane clamped to the slice as the face's bottom. */
const stepSpans = (a: Vec2, b: Vec2, bottomMm: number, topMm: number, plane: Linear2): StepSpan[] => {
  const h0 = evaluateLinear(plane, a);
  const h1 = evaluateLinear(plane, b);
  const breaks = new Set<number>([0, 1]);
  for (const level of [bottomMm, topMm]) {
    const d0 = h0 - level;
    const d1 = h1 - level;
    if (d0 !== d1 && d0 > 0 !== d1 > 0) breaks.add(d0 / (d0 - d1));
  }
  const sorted = [...breaks].sort((x, y) => x - y);
  const lowAt = (t: number): number => Math.max(bottomMm, Math.min(topMm, h0 + (h1 - h0) * t));
  const spans: StepSpan[] = [];
  for (let index = 0; index + 1 < sorted.length; index += 1) {
    const t0 = sorted[index];
    const t1 = sorted[index + 1];
    if (t0 === undefined || t1 === undefined || t1 - t0 <= 1e-12) continue;
    const low0 = lowAt(t0);
    const low1 = lowAt(t1);
    if (Math.min(low0, low1) >= topMm - heightToleranceMm) continue;
    spans.push({ t0, t1, low0, low1, high0: topMm, high1: topMm });
  }
  return spans;
};

/**
 * The stretches of a→b between two planes (low and high, clamped to the slice), split where either crosses the
 * slice's bottom or top; stretches where they meet within the tolerance are dropped.
 */
const betweenSpans = (
  a: Vec2,
  b: Vec2,
  bottomMm: number,
  topMm: number,
  low: Linear2,
  high: Linear2,
): StepSpan[] => {
  const l0 = evaluateLinear(low, a);
  const l1 = evaluateLinear(low, b);
  const g0 = evaluateLinear(high, a);
  const g1 = evaluateLinear(high, b);
  const breaks = new Set<number>([0, 1]);
  for (const [v0, v1] of [
    [l0, l1],
    [g0, g1],
  ] as const)
    for (const level of [bottomMm, topMm]) {
      const d0 = v0 - level;
      const d1 = v1 - level;
      if (d0 !== d1 && d0 > 0 !== d1 > 0) breaks.add(d0 / (d0 - d1));
    }
  const clamp = (value: number): number => Math.max(bottomMm, Math.min(topMm, value));
  const sorted = [...breaks].sort((x, y) => x - y);
  const spans: StepSpan[] = [];
  for (let index = 0; index + 1 < sorted.length; index += 1) {
    const t0 = sorted[index];
    const t1 = sorted[index + 1];
    if (t0 === undefined || t1 === undefined || t1 - t0 <= 1e-12) continue;
    const span = {
      t0,
      t1,
      low0: clamp(l0 + (l1 - l0) * t0),
      low1: clamp(l0 + (l1 - l0) * t1),
      high0: clamp(g0 + (g1 - g0) * t0),
      high1: clamp(g0 + (g1 - g0) * t1),
    };
    if (Math.max(span.high0 - span.low0, span.high1 - span.low1) <= heightToleranceMm) continue;
    spans.push(span);
  }
  return spans;
};

const pointKey = (p: Vec2): string => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

/**
 * Step faces at step lines (Phase 19.5): where two roof pieces meet along a boundary with different undersides (a
 * step line; break and fold lines are continuous and give none) and the walls' footprint lies on both sides, the wall
 * under the higher piece shows a vertical face toward the lower one, from the lower underside up to the higher one
 * (both clamped to the slice). Each face runs so that its solid (the higher side) is on its left.
 */
const pieceStepFaces = (
  footprint: Region,
  limit: RoofLimit,
  footprintEdges: readonly (readonly [Vec2, Vec2])[],
  bottomMm: number,
  topMm: number,
): StepFace[] => {
  if (limit.pieces.length < 2) return [];
  const seen = new Set<string>();
  const edges: (readonly [Vec2, Vec2])[] = [];
  for (const piece of limit.pieces)
    for (const ring of regionRings(piece.region))
      ring.forEach((c, index) => {
        const d = ring[(index + 1) % ring.length];
        if (d === undefined) return;
        const key = [pointKey(c), pointKey(d)].sort().join("|");
        if (seen.has(key)) return;
        seen.add(key);
        edges.push([c, d]);
      });
  const faces: StepFace[] = [];
  const bounds = regionBounds(footprint);
  for (const [c, d] of edges) {
    if (
      Math.max(c.x, d.x) < bounds.minX - 1 ||
      Math.min(c.x, d.x) > bounds.maxX + 1 ||
      Math.max(c.y, d.y) < bounds.minY - 1 ||
      Math.min(c.y, d.y) > bounds.maxY + 1
    )
      continue;
    const normal = rightNormal(normalizeVec(subVec(d, c)));
    // Only a boundary whose two sides have different undersides (a step line) can need a face.
    const centre = lerpVec(c, d, 0.5);
    const sideA = limit.pieces.find((candidate) =>
      pointInRegion(
        { x: centre.x + normal.x * roofProbeMm, y: centre.y + normal.y * roofProbeMm },
        candidate.region,
      ),
    );
    const sideB = limit.pieces.find((candidate) =>
      pointInRegion(
        { x: centre.x - normal.x * roofProbeMm, y: centre.y - normal.y * roofProbeMm },
        candidate.region,
      ),
    );
    if (
      sideA === undefined ||
      sideB === undefined ||
      sideA === sideB ||
      [c, d].every(
        (point) =>
          Math.abs(evaluateLinear(sideA.plane, point) - evaluateLinear(sideB.plane, point)) <=
          heightToleranceMm,
      )
    )
      continue;
    const breaks = segmentBreaks(c, d, [...footprintEdges, ...edges]);
    for (let k = 0; k + 1 < breaks.length; k += 1) {
      const t0 = breaks[k];
      const t1 = breaks[k + 1];
      if (t0 === undefined || t1 === undefined || t1 - t0 <= 1e-9) continue;
      const middle = lerpVec(c, d, (t0 + t1) / 2);
      const right = { x: middle.x + normal.x * roofProbeMm, y: middle.y + normal.y * roofProbeMm };
      const left = { x: middle.x - normal.x * roofProbeMm, y: middle.y - normal.y * roofProbeMm };
      if (!pointInRegion(right, footprint) || !pointInRegion(left, footprint)) continue;
      const leftPiece = limit.pieces.find((candidate) => pointInRegion(left, candidate.region));
      const rightPiece = limit.pieces.find((candidate) => pointInRegion(right, candidate.region));
      if (leftPiece === undefined || rightPiece === undefined || leftPiece === rightPiece) continue;
      const leftHigher = evaluateLinear(leftPiece.plane, middle) > evaluateLinear(rightPiece.plane, middle);
      const high = leftHigher ? leftPiece : rightPiece;
      const low = leftHigher ? rightPiece : leftPiece;
      // The face's solid (under the higher piece) on its left, its normal toward the lower side.
      const a = lerpVec(c, d, leftHigher ? t0 : t1);
      const b = lerpVec(c, d, leftHigher ? t1 : t0);
      const spans = betweenSpans(a, b, bottomMm, topMm, low.plane, high.plane);
      if (spans.length > 0) faces.push({ start: a, end: b, spans });
    }
  }
  return faces;
};

/**
 * Step faces of a slice: where the outline of the roof runs through the footprint, the uncovered part keeps its full
 * height and the covered part is trimmed, so the uncovered part shows a vertical face toward the covered side from
 * the underside up to the slice top. Each face runs so that its outward (right-hand) normal faces the covered side.
 * Phase 19.5: also at step lines crossing the footprint (pieceStepFaces).
 */
export const stepFaces = (
  footprint: Region,
  limit: RoofLimit | null,
  bottomMm: number,
  topMm: number,
): StepFace[] => {
  if (limit === null || footprint.polygons.length === 0) return [];
  const footprintEdges = regionRings(footprint).flatMap((ring) =>
    ring.flatMap((a, index): (readonly [Vec2, Vec2])[] => {
      const b = ring[(index + 1) % ring.length];
      return b === undefined ? [] : [[a, b] as const];
    }),
  );
  const faces: StepFace[] = [];
  for (const ring of regionRings(limit.coverage))
    ring.forEach((c, index) => {
      const d = ring[(index + 1) % ring.length];
      if (d === undefined) return;
      const normal = rightNormal(normalizeVec(subVec(d, c)));
      const breaks = segmentBreaks(c, d, footprintEdges);
      for (let k = 0; k + 1 < breaks.length; k += 1) {
        const t0 = breaks[k];
        const t1 = breaks[k + 1];
        if (t0 === undefined || t1 === undefined || t1 - t0 <= 1e-9) continue;
        const middle = lerpVec(c, d, (t0 + t1) / 2);
        const right = { x: middle.x + normal.x * roofProbeMm, y: middle.y + normal.y * roofProbeMm };
        const left = { x: middle.x - normal.x * roofProbeMm, y: middle.y - normal.y * roofProbeMm };
        if (!pointInRegion(right, footprint) || !pointInRegion(left, footprint)) continue;
        const leftCovered = pointInRegion(left, limit.coverage);
        if (leftCovered === pointInRegion(right, limit.coverage)) continue;
        const covered = leftCovered ? left : right;
        const piece = limit.pieces.find((candidate) => pointInRegion(covered, candidate.region));
        if (piece === undefined) continue;
        // The face's solid (the uncovered part) is on its left, its normal toward the covered side.
        const a = lerpVec(c, d, leftCovered ? t1 : t0);
        const b = lerpVec(c, d, leftCovered ? t0 : t1);
        const spans = stepSpans(a, b, bottomMm, topMm, piece.plane);
        if (spans.length > 0) faces.push({ start: a, end: b, spans });
      }
    });
  return [...faces, ...pieceStepFaces(footprint, limit, footprintEdges, bottomMm, topMm)];
};
