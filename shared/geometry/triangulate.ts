// Region triangulation (clipper2-ts constrained Delaunay) to indexed plan triangles, CCW in plan.
import { Clipper, TriangulateResult } from "clipper2-ts";
import { toPath64 } from "./polygonKernel";
import type { Region } from "./region";
import { regionRings } from "./region";
import { fixedPointUnitsPerMm } from "./tolerances";
import type { Vec2 } from "./vector";

export type PlanTriangulation = Readonly<{
  vertices: readonly Vec2[];
  indices: readonly number[];
  ok: boolean;
}>;

export const triangulateRegion = (region: Region): PlanTriangulation => {
  const paths = regionRings(region).map(toPath64);
  if (paths.length === 0) return { vertices: [], indices: [], ok: true };
  const { result, solution } = Clipper.triangulate(paths, true);
  if (result !== TriangulateResult.success) return { vertices: [], indices: [], ok: false };
  const vertices: Vec2[] = [];
  const indices: number[] = [];
  const lookup = new Map<string, number>();
  const vertexIndex = (point: { x: number; y: number }): number => {
    const key = `${point.x},${point.y}`;
    const existing = lookup.get(key);
    if (existing !== undefined) return existing;
    vertices.push({ x: point.x / fixedPointUnitsPerMm, y: point.y / fixedPointUnitsPerMm });
    lookup.set(key, vertices.length - 1);
    return vertices.length - 1;
  };
  for (const triangle of solution) {
    const [a, b, c] = triangle;
    if (a === undefined || b === undefined || c === undefined) continue;
    const twiceArea = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (twiceArea === 0) continue;
    const ia = vertexIndex(a);
    const ib = vertexIndex(b);
    const ic = vertexIndex(c);
    if (twiceArea > 0) indices.push(ia, ib, ic);
    else indices.push(ia, ic, ib);
  }
  return { vertices, indices, ok: true };
};
