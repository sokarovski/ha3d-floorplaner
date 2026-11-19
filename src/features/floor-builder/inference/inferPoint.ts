// Point inference (SketchUp-like): endpoints, shape centres and circle quadrants, midpoints, intersections of inference lines, points on edges and
// guides, the red/green axes and parallel/perpendicular directions from the operation's anchor, extensions of
// straight edges, and alignment with any vertex along the plan axes. Screen-space capture; deterministic.
import type { Vec2 } from "@shared/geometry/vector";
import type { CueColor, CueLine, InferenceKind, InferenceScene, PointInference } from "./inferenceTypes";

/** Capture radius in CSS pixels (D05 convention: 8–12 px). */
export const inferenceCapturePx = 10;

export type InferPointOptions = Readonly<{
  /** The operation's anchor (first click): enables axis and parallel/perpendicular inference from it. */
  from?: Vec2;
  /** Height of the cue lines (plan mm); 0 by default. */
  hMm?: number;
}>;

type Line = Readonly<{
  origin: Vec2;
  direction: Vec2;
  /** Valid range of t along the direction from the origin (segments); unbounded when undefined. */
  bounds?: readonly [number, number];
  kind: InferenceKind;
  rank: number;
  label: string;
  color: CueColor | null;
  /** Where the dotted cue starts (the anchor, the edge end, the aligned vertex). */
  source: Vec2 | null;
}>;

const minParallelSine = 0.05;
const maxIntersectionLines = 14;

const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const along = (line: Line, t: number): Vec2 => ({
  x: line.origin.x + line.direction.x * t,
  y: line.origin.y + line.direction.y * t,
});
const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
const axisColor = (direction: Vec2): CueColor =>
  Math.abs(direction.x) >= Math.abs(direction.y) ? "axisX" : "axisY";

const inBounds = (line: Line, t: number, slack: number): boolean =>
  line.bounds === undefined || (t >= line.bounds[0] - slack && t <= line.bounds[1] + slack);

const cueLines = (lines: readonly Line[], point: Vec2, h: number): CueLine[] =>
  lines.flatMap((line) =>
    line.source === null || line.color === null || distance(line.source, point) < 1
      ? []
      : [{ from: { ...line.source, h }, to: { ...point, h }, color: line.color }],
  );

const result = (
  point: Vec2,
  kind: InferenceKind,
  label: string,
  lines: readonly Line[],
  h: number,
): PointInference => ({
  point,
  kind,
  cue: { lines: cueLines(lines, point, h), marker: { ...point, h }, label },
});

/** Every inference line within the capture radius of the pointer, nearest first within each rank. */
const candidateLines = (
  scene: InferenceScene,
  pointer: Vec2,
  radius: number,
  from: Vec2 | undefined,
): Line[] => {
  const lines: (Line & { distance: number })[] = [];
  const consider = (line: Line): void => {
    const t = dot(sub(pointer, line.origin), line.direction);
    if (!inBounds(line, t, 0)) return;
    const d = distance(pointer, along(line, t));
    if (d <= radius) lines.push({ ...line, distance: d });
  };
  for (const segment of scene.segments) {
    const t = dot(sub(pointer, segment.a), segment.direction);
    if (t >= 0 && t <= segment.lengthMm)
      consider({
        origin: segment.a,
        direction: segment.direction,
        bounds: [0, segment.lengthMm],
        kind: "onEdge",
        rank: 1,
        label: "On edge",
        color: null,
        source: null,
      });
    else if (segment.straight)
      consider({
        origin: segment.a,
        direction: segment.direction,
        kind: "extension",
        rank: 5,
        label: "On extension",
        color: "edge",
        source: t < 0 ? segment.a : segment.b,
      });
  }
  for (const guide of scene.guideLines)
    consider({
      origin: guide.a,
      direction: guide.direction,
      kind: "guide",
      rank: 2,
      label: "On guide",
      color: null,
      source: null,
    });
  if (from !== undefined) {
    for (const direction of [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ])
      consider({
        origin: from,
        direction,
        kind: "axis",
        rank: 3,
        label: direction.x === 1 ? "On red axis" : "On green axis",
        color: axisColor(direction),
        source: from,
      });
    const seen = new Set<string>();
    for (const segment of scene.segments) {
      if (!segment.straight) continue;
      const { direction } = segment;
      if (Math.abs(direction.x) < 1e-6 || Math.abs(direction.y) < 1e-6) continue;
      const angle = (((Math.atan2(direction.y, direction.x) * 180) / Math.PI + 180) % 90).toFixed(1);
      if (seen.has(angle)) continue;
      seen.add(angle);
      consider({
        origin: from,
        direction,
        kind: "parallel",
        rank: 4,
        label: "Parallel to edge",
        color: "edge",
        source: from,
      });
      consider({
        origin: from,
        direction: { x: -direction.y, y: direction.x },
        kind: "perpendicular",
        rank: 4,
        label: "Perpendicular to edge",
        color: "edge",
        source: from,
      });
    }
  }
  for (const vertex of [
    ...scene.vertices,
    ...scene.guidePoints,
    ...scene.namedPoints.map((named) => named.point),
  ]) {
    if (Math.abs(pointer.y - vertex.y) <= radius)
      consider({
        origin: vertex,
        direction: { x: 1, y: 0 },
        kind: "alignment",
        rank: 6,
        label: "Aligned with point",
        color: "axisX",
        source: vertex,
      });
    if (Math.abs(pointer.x - vertex.x) <= radius)
      consider({
        origin: vertex,
        direction: { x: 0, y: 1 },
        kind: "alignment",
        rank: 6,
        label: "Aligned with point",
        color: "axisY",
        source: vertex,
      });
  }
  return lines.sort((a, b) => a.rank - b.rank || a.distance - b.distance);
};

const intersectionOf = (a: Line, b: Line): Vec2 | undefined => {
  const denominator = cross(a.direction, b.direction);
  if (Math.abs(denominator) < minParallelSine) return undefined;
  const t = cross(sub(b.origin, a.origin), b.direction) / denominator;
  const point = along(a, t);
  const u = dot(sub(point, b.origin), b.direction);
  return inBounds(a, t, 0.5) && inBounds(b, u, 0.5) ? point : undefined;
};

/** The inferred point for a free pointer position, or undefined when nothing is within reach. */
export const inferPoint = (
  scene: InferenceScene,
  pointer: Vec2,
  mmPerPixel: number,
  options: InferPointOptions = {},
): PointInference | undefined => {
  const radius = inferenceCapturePx * mmPerPixel;
  const h = options.hMm ?? 0;
  let nearest: Vec2 | undefined;
  let nearestDistance = radius;
  for (const vertex of scene.vertices) {
    const d = distance(pointer, vertex);
    if (d <= nearestDistance) {
      nearest = vertex;
      nearestDistance = d;
    }
  }
  if (nearest !== undefined) return result(nearest, "endpoint", "Endpoint", [], h);
  let named: (typeof scene.namedPoints)[number] | undefined;
  let namedDistance = radius;
  for (const candidate of scene.namedPoints) {
    const d = distance(pointer, candidate.point);
    if (d <= namedDistance) {
      named = candidate;
      namedDistance = d;
    }
  }
  if (named !== undefined) return result(named.point, named.kind, named.label, [], h);
  for (const point of scene.guidePoints)
    if (distance(pointer, point) <= radius) return result(point, "endpoint", "Guide point", [], h);
  for (const segment of scene.segments) {
    if (!segment.straight) continue;
    const mid = { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 };
    if (distance(pointer, mid) <= radius * 0.8) return result(mid, "midpoint", "Midpoint", [], h);
  }
  const lines = candidateLines(scene, pointer, radius, options.from);
  if (lines.length === 0) return undefined;
  const pool = lines.slice(0, maxIntersectionLines);
  let best: Readonly<{ point: Vec2; a: Line; b: Line; score: number }> | undefined;
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      const a = pool[i];
      const b = pool[j];
      if (a === undefined || b === undefined) continue;
      const point = intersectionOf(a, b);
      if (point === undefined) continue;
      const d = distance(pointer, point);
      if (d > radius) continue;
      const score = (a.rank + b.rank) * radius + d;
      if (best === undefined || score < best.score) best = { point, a, b, score };
    }
  }
  if (best !== undefined) {
    const label =
      best.a.kind === "onEdge" || best.b.kind === "onEdge"
        ? `On edge · ${(best.a.kind === "onEdge" ? best.b : best.a).label}`
        : "Intersection";
    return result(best.point, "intersection", label, [best.a, best.b], h);
  }
  const line = lines[0];
  if (line === undefined) return undefined;
  const t = dot(sub(pointer, line.origin), line.direction);
  return result(along(line, t), line.kind, line.label, [line], h);
};
