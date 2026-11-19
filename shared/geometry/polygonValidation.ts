// Polygon pencil validation (D04): at least three non-collinear points, no self-intersection, CCW storage.
import type { PolygonVertexValue } from "@shared/domain/schemas/shapes";
import { ringSignedArea } from "./region";
import { minPieceLengthMm, onLineToleranceMm } from "./tolerances";
import type { Vec2 } from "./vector";
import { crossVec, distance, subVec } from "./vector";

export type PolygonProblem =
  | Readonly<{ kind: "tooFewPoints" }>
  | Readonly<{ kind: "collinear" }>
  | Readonly<{ kind: "duplicateVertex"; index: number }>
  | Readonly<{ kind: "selfIntersection"; edgeA: number; edgeB: number }>;

export type PolygonValidation =
  Readonly<{ valid: true }> | Readonly<{ valid: false; problems: readonly PolygonProblem[] }>;

/** Orientation of three points with a physical tolerance: 1 CCW, −1 CW, 0 collinear. */
const orientation = (a: Vec2, b: Vec2, c: Vec2): number => {
  const span = Math.max(distance(a, b), distance(b, c), distance(a, c));
  const cross = crossVec(subVec(b, a), subVec(c, a));
  if (span === 0 || Math.abs(cross) / span <= onLineToleranceMm) return 0;
  return cross > 0 ? 1 : -1;
};

const onSegment = (a: Vec2, b: Vec2, p: Vec2): boolean =>
  Math.min(a.x, b.x) - onLineToleranceMm <= p.x &&
  p.x <= Math.max(a.x, b.x) + onLineToleranceMm &&
  Math.min(a.y, b.y) - onLineToleranceMm <= p.y &&
  p.y <= Math.max(a.y, b.y) + onLineToleranceMm;

export const segmentsIntersect = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean => {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0) return true;
  return (
    (o1 === 0 && onSegment(a, b, c)) ||
    (o2 === 0 && onSegment(a, b, d)) ||
    (o3 === 0 && onSegment(c, d, a)) ||
    (o4 === 0 && onSegment(c, d, b))
  );
};

/** Index pairs of non-adjacent edges that intersect or touch. */
export const findSelfIntersections = (points: readonly Vec2[]): { edgeA: number; edgeB: number }[] => {
  const count = points.length;
  const found: { edgeA: number; edgeB: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === count - 1);
      if (adjacent) continue;
      const a = points[i];
      const b = points[(i + 1) % count];
      const c = points[j];
      const d = points[(j + 1) % count];
      if (a === undefined || b === undefined || c === undefined || d === undefined) continue;
      if (segmentsIntersect(a, b, c, d)) found.push({ edgeA: i, edgeB: j });
    }
  }
  return found;
};

/** True when every point lies on one line (within the on-line tolerance). */
export const allCollinear = (points: readonly Vec2[]): boolean => {
  const first = points[0];
  if (first === undefined) return true;
  const far = points.reduce(
    (best, point) => (distance(point, first) > distance(best, first) ? point : best),
    first,
  );
  return points.every((point) => orientation(first, far, point) === 0);
};

export const validatePolygonPoints = (points: readonly Vec2[]): PolygonValidation => {
  const problems: PolygonProblem[] = [];
  if (points.length < 3) return { valid: false, problems: [{ kind: "tooFewPoints" }] };
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    if (next !== undefined && distance(point, next) < minPieceLengthMm)
      problems.push({ kind: "duplicateVertex", index });
  });
  if (allCollinear(points)) problems.push({ kind: "collinear" });
  else for (const pair of findSelfIntersections(points)) problems.push({ kind: "selfIntersection", ...pair });
  return problems.length === 0 ? { valid: true } : { valid: false, problems };
};

/** Returns the vertices in counterclockwise order, reversing a clockwise list and keeping vertex IDs. */
export const counterclockwisePolygonVertices = (
  vertices: readonly PolygonVertexValue[],
): PolygonVertexValue[] => (ringSignedArea(vertices) < 0 ? [...vertices].reverse() : [...vertices]);
