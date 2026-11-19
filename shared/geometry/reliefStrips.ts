// A wall feature's combined outline as stacked rectangles (wall relief groups). RealAllWalls builds walls as
// 2.5D height slices with a constant footprint each, so a feature (a union of rectangles, circles, and
// polygons in the face frame: x along the wall, y up) is cut into horizontal bands, each a rectangle
// between a left and a right extent. Vertically adjacent bands with the same extent merge, so a rectangle is
// one band and an arch is a body plus fine steps along its curve.
import type { ShapeValue } from "../domain/schemas/shapes";
import { regionRings } from "./region";
import { unionRings } from "./polygonKernel";
import { shapeOutline } from "./shapeOutline";

/** The default height of one band across a slanted or curved edge (mm). */
export const reliefStripStepMm = 10;
/** The most bands one feature is cut into; coarser steps are used beyond this. */
export const maxReliefStrips = 160;

export type ReliefStrip = Readonly<{ fromMm: number; toMm: number; bottomMm: number; topMm: number }>;

const sameExtent = (a: ReliefStrip, b: ReliefStrip): boolean =>
  Math.abs(a.fromMm - b.fromMm) < 0.25 && Math.abs(a.toMm - b.toMm) < 0.25;

/** Even-odd crossings of the horizontal line y = at, as sorted extents (pairs of x). */
const extentsAt = (rings: readonly (readonly { x: number; y: number }[])[], at: number): number[] => {
  const xs: number[] = [];
  for (const ring of rings) {
    ring.forEach((a, index) => {
      const b = ring[(index + 1) % ring.length];
      if (b === undefined || a.y === b.y) return;
      if ((a.y <= at && b.y > at) || (b.y <= at && a.y > at))
        xs.push(a.x + ((at - a.y) / (b.y - a.y)) * (b.x - a.x));
    });
  }
  return xs.sort((left, right) => left - right);
};

export const reliefStrips = (shapes: readonly ShapeValue[]): readonly ReliefStrip[] => {
  const region = unionRings(shapes.map((shape) => shapeOutline(shape).ring));
  const rings = regionRings(region);
  const levels = [
    ...new Set(rings.flatMap((ring) => ring.map((point) => Math.round(point.y * 1000) / 1000))),
  ].sort((left, right) => left - right);
  const first = levels[0];
  const last = levels[levels.length - 1];
  if (first === undefined || last === undefined) return [];
  const step = Math.max(reliefStripStepMm, (last - first) / maxReliefStrips);
  const strips: ReliefStrip[] = [];
  for (let index = 0; index + 1 < levels.length; index += 1) {
    const y0 = levels[index] ?? 0;
    const y1 = levels[index + 1] ?? 0;
    if (y1 - y0 < 1e-3) continue;
    const parts = Math.max(1, Math.ceil((y1 - y0) / step));
    for (let part = 0; part < parts; part += 1) {
      const bottomMm = y0 + ((y1 - y0) * part) / parts;
      const topMm = y0 + ((y1 - y0) * (part + 1)) / parts;
      const xs = extentsAt(rings, (bottomMm + topMm) / 2);
      for (let pair = 0; pair + 1 < xs.length; pair += 2) {
        const fromMm = xs[pair] ?? 0;
        const toMm = xs[pair + 1] ?? 0;
        if (toMm - fromMm < 1e-3) continue;
        const strip: ReliefStrip = { fromMm, toMm, bottomMm, topMm };
        const below = strips.findIndex(
          (candidate) => Math.abs(candidate.topMm - bottomMm) < 1e-3 && sameExtent(candidate, strip),
        );
        const found = strips[below];
        if (found === undefined) strips.push(strip);
        else strips[below] = { ...found, topMm };
      }
    }
  }
  return strips;
};

/** Bounding box of a feature's combined outline in the face frame, or null when it has no area. */
export const reliefBounds = (
  shapes: readonly ShapeValue[],
): Readonly<{ minX: number; maxX: number; minY: number; maxY: number }> | null => {
  const points = shapes.flatMap((shape) => shapeOutline(shape).ring);
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};
