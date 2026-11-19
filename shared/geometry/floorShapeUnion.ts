// Floor-shape union per area (D04): compound region (components and holes kept) plus, for every source
// edge, the intervals (mm from its start vertex) that lie on the union boundary.
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import type { Interval } from "./interval";
import { mergeIntervals } from "./interval";
import { unionRings } from "./polygonKernel";
import type { PolygonProblem } from "./polygonValidation";
import { validatePolygonPoints } from "./polygonValidation";
import type { SourceSegment } from "./provenance";
import { coverSegment, createSourceIndex, projectOntoSource } from "./provenance";
import type { Region, Ring } from "./region";
import { regionRings, ringSignedArea } from "./region";
import type { EdgeProvenance, ShapeOutline } from "./shapeOutline";
import { shapeOutline, sourceEdgeId } from "./shapeOutline";
import { joinToleranceMm, minPieceLengthMm } from "./tolerances";
import type { Vec2 } from "./vector";
import { distance } from "./vector";

/** One source edge and the parts of it that lie on the union boundary. */
export type SourceEdgeBoundary = Readonly<{
  shapeId: string;
  edgeKey: string;
  wallable: boolean;
  start: Vec2;
  end: Vec2;
  lengthMm: number;
  /** Merged, sorted intervals in mm from the edge's start vertex; empty when the edge is interior. */
  intervals: readonly Interval[];
}>;

/**
 * A circle's outline as one arc edge (D20): arc-length parameter from the circle's local 0° (area +x),
 * counterclockwise, and the parts of the arc on the union boundary.
 */
export type ArcBoundary = Readonly<{
  shapeId: string;
  centerMm: Vec2;
  radiusMm: number;
  lengthMm: number;
  intervals: readonly Interval[];
}>;

/** A piece of the union boundary and the source edges it lies on (empty when none, e.g. a closed gap). */
export type BoundaryPiece = Readonly<{ start: Vec2; end: Vec2; sources: readonly EdgeProvenance[] }>;

export type BoundaryLoop = Readonly<{ isHole: boolean; pieces: readonly BoundaryPiece[] }>;

export type FloorShapeProblem =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "invalidPolygon"; shapeId: string; problems: readonly PolygonProblem[] }>;

export type FloorShapeUnion = Readonly<{
  /** Union in the area frame. */
  region: Region;
  outlines: readonly ShapeOutline[];
  loops: readonly BoundaryLoop[];
  /** Every edge of every valid shape keyed by sourceEdgeId(shapeId, edgeKey). */
  edges: ReadonlyMap<string, SourceEdgeBoundary>;
  /** Circle arcs by shape ID. */
  arcs: ReadonlyMap<string, ArcBoundary>;
  problems: readonly FloorShapeProblem[];
}>;

const validOutline = (shape: ShapeValue, outline: ShapeOutline): PolygonProblem[] => {
  if (shape.type !== "polygon") return [];
  const validation = validatePolygonPoints(outline.ring);
  return validation.valid ? [] : [...validation.problems];
};

const ringSegments = (ring: Ring): [Vec2, Vec2][] =>
  ring.flatMap((start, index): [Vec2, Vec2][] => {
    const end = ring[(index + 1) % ring.length];
    return end === undefined ? [] : [[start, end]];
  });

/** Clamps a parameter to [0, length], snapping values within the join tolerance onto the edge's vertices. */
const snapToEnds = (valueMm: number, lengthMm: number): number => {
  if (valueMm <= joinToleranceMm) return 0;
  if (valueMm >= lengthMm - joinToleranceMm) return lengthMm;
  return valueMm;
};

export const computeFloorShapeUnion = (shapes: readonly ShapeValue[]): FloorShapeUnion => {
  const problems: FloorShapeProblem[] = [];
  const outlines: ShapeOutline[] = [];
  for (const shape of shapes) {
    const outline = shapeOutline(shape);
    const outlineProblems = validOutline(shape, outline);
    if (outlineProblems.length > 0)
      problems.push({ kind: "invalidPolygon", shapeId: shape.id, problems: outlineProblems });
    else outlines.push(outline);
  }
  const region = unionRings(outlines.map((outline) => outline.ring));
  if (region.polygons.length === 0) problems.push({ kind: "empty" });

  const sources: SourceSegment<EdgeProvenance>[] = outlines.flatMap((outline) =>
    outline.edges.map((edge) => ({ start: edge.start, end: edge.end, payload: edge.provenance })),
  );
  const index = createSourceIndex(sources);
  const collected = new Map<SourceSegment<EdgeProvenance>, Interval[]>();
  const loops: BoundaryLoop[] = regionRings(region).map((ring) => {
    const pieces: BoundaryPiece[] = [];
    for (const [start, end] of ringSegments(ring)) {
      for (const piece of coverSegment(start, end, index)) {
        pieces.push({
          start: piece.start,
          end: piece.end,
          sources: piece.owners.map((owner) => owner.payload),
        });
        for (const owner of piece.owners) {
          const fromMm = projectOntoSource(owner, piece.start);
          const toMm = projectOntoSource(owner, piece.end);
          const list = collected.get(owner) ?? [];
          list.push({ fromMm: Math.min(fromMm, toMm), toMm: Math.max(fromMm, toMm) });
          collected.set(owner, list);
        }
      }
    }
    return { isHole: ringSignedArea(ring) < 0, pieces };
  });

  const edges = new Map<string, SourceEdgeBoundary>();
  for (const source of sources) {
    const lengthMm = distance(source.start, source.end);
    const intervals = mergeIntervals(collected.get(source) ?? [], minPieceLengthMm)
      .map((interval) => ({
        fromMm: snapToEnds(interval.fromMm, lengthMm),
        toMm: snapToEnds(interval.toMm, lengthMm),
      }))
      .filter((interval) => interval.toMm - interval.fromMm >= minPieceLengthMm);
    const key = sourceEdgeId(source.payload.shapeId, source.payload.edgeKey);
    if (!source.payload.wallable && edges.has(key)) continue;
    edges.set(key, {
      shapeId: source.payload.shapeId,
      edgeKey: source.payload.edgeKey,
      wallable: source.payload.wallable,
      start: source.start,
      end: source.end,
      lengthMm,
      intervals,
    });
  }
  const arcs = new Map<string, ArcBoundary>();
  for (const shape of shapes) {
    if (shape.type !== "circle" || !outlines.some((outline) => outline.shapeId === shape.id)) continue;
    const facets = sources.filter((source) => source.payload.shapeId === shape.id);
    const lengthMm = 2 * Math.PI * shape.radiusMm;
    const step = lengthMm / Math.max(1, facets.length);
    const intervals = facets.flatMap((facet, index) => {
      const chord = distance(facet.start, facet.end);
      if (chord === 0) return [];
      return (collected.get(facet) ?? []).map((interval) => ({
        fromMm: (index + interval.fromMm / chord) * step,
        toMm: (index + interval.toMm / chord) * step,
      }));
    });
    arcs.set(shape.id, {
      shapeId: shape.id,
      centerMm: shape.positionMm,
      radiusMm: shape.radiusMm,
      lengthMm,
      intervals: mergeIntervals(intervals, minPieceLengthMm)
        .map((interval) => ({
          fromMm: snapToEnds(interval.fromMm, lengthMm),
          toMm: snapToEnds(interval.toMm, lengthMm),
        }))
        .filter((interval) => interval.toMm - interval.fromMm >= minPieceLengthMm),
    });
  }
  return { region, outlines, loops, edges, arcs, problems };
};
