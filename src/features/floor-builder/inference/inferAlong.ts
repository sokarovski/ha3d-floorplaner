// Inference along a wall's edge line (trim/extend and split): a position on the line snaps to named stops
// (corners, other wall ends, the span midpoint), then to points of the floor in line with it, and to where
// other edges' extensions and guides cross the line. Screen-space capture; deterministic.
import type { Vec2 } from "@shared/geometry/vector";
import type { CueLine, InferenceCue, InferenceScene } from "./inferenceTypes";
import { inferenceCapturePx } from "./inferPoint";

export type AlongLine = Readonly<{ origin: Vec2; direction: Vec2 }>;

export type AlongStop = Readonly<{ alongMm: number; label: string }>;

export type AlongInference = Readonly<{ alongMm: number; cue: InferenceCue }>;

const pointAt = (line: AlongLine, along: number): Vec2 => ({
  x: line.origin.x + line.direction.x * along,
  y: line.origin.y + line.direction.y * along,
});

const alongOf = (line: AlongLine, point: Vec2): number =>
  (point.x - line.origin.x) * line.direction.x + (point.y - line.origin.y) * line.direction.y;

const minCrossingSine = 0.05;

export const inferAlong = (
  scene: InferenceScene,
  line: AlongLine,
  alongMm: number,
  mmPerPixel: number,
  options: Readonly<{ stops: readonly AlongStop[]; hMm: number }>,
): AlongInference | undefined => {
  const radius = inferenceCapturePx * mmPerPixel;
  const h = options.hMm;
  const cueAt = (along: number, label: string, lines: readonly CueLine[]): AlongInference => ({
    alongMm: along,
    cue: { lines, marker: { ...pointAt(line, along), h }, label },
  });
  let bestStop: AlongStop | undefined;
  for (const stop of options.stops)
    if (
      Math.abs(stop.alongMm - alongMm) <= radius &&
      (bestStop === undefined || Math.abs(stop.alongMm - alongMm) < Math.abs(bestStop.alongMm - alongMm))
    )
      bestStop = stop;
  if (bestStop !== undefined) return cueAt(bestStop.alongMm, bestStop.label, []);

  let best: Readonly<{ along: number; label: string; source: Vec2 }> | undefined;
  const consider = (along: number, label: string, source: Vec2): void => {
    if (Math.abs(along - alongMm) > radius) return;
    if (best === undefined || Math.abs(along - alongMm) < Math.abs(best.along - alongMm))
      best = { along, label, source };
  };
  for (const vertex of [...scene.vertices, ...scene.guidePoints])
    consider(alongOf(line, vertex), "In line with point", vertex);
  for (const named of scene.namedPoints)
    consider(alongOf(line, named.point), `In line with ${named.label.toLowerCase()}`, named.point);
  const guides = new Set(scene.guideLines);
  for (const segment of [...scene.segments, ...scene.guideLines]) {
    if (!segment.straight) continue;
    const isGuide = guides.has(segment);
    const denominator = line.direction.x * segment.direction.y - line.direction.y * segment.direction.x;
    if (Math.abs(denominator) < minCrossingSine) continue;
    const dx = segment.a.x - line.origin.x;
    const dy = segment.a.y - line.origin.y;
    const t = (dx * segment.direction.y - dy * segment.direction.x) / denominator;
    const crossing = pointAt(line, t);
    const u =
      (crossing.x - segment.a.x) * segment.direction.x + (crossing.y - segment.a.y) * segment.direction.y;
    const onSegment = u >= 0 && u <= segment.lengthMm;
    consider(
      t,
      isGuide ? "On guide" : onSegment ? "On edge" : "On extension",
      isGuide || onSegment ? crossing : u < 0 ? segment.a : segment.b,
    );
  }
  if (best === undefined) return undefined;
  const stop = pointAt(line, best.along);
  return cueAt(best.along, best.label, [{ from: { ...best.source, h }, to: { ...stop, h }, color: "edge" }]);
};
