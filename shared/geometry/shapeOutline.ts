// Source-shape outlines in the area frame, each edge carrying its provenance (shape ID + edge key).
// Edge keys: rectangle edge names in CCW order (bottom, right, top, left); polygon "<fromVertexId>><toVertexId>"
// in CCW order; circle segments share the non-wallable key "arc" (curved walls are post-MVP).
import type {
  CircleShapeValue,
  PolygonShapeValue,
  RectangleShapeValue,
  ShapeValue,
} from "@shared/domain/schemas/shapes";
import { rectangleEdgeNames } from "@shared/domain/schemas/shapes";
import { applyAffine } from "./affine";
import { shapeToAreaAffine } from "./placement";
import type { Ring } from "./region";
import { ringSignedArea } from "./region";
import { circleChordToleranceMm } from "./tolerances";
import type { Vec2 } from "./vector";

export const circleArcEdgeKey = "arc";

export type EdgeProvenance = Readonly<{ shapeId: string; edgeKey: string; wallable: boolean }>;

export type OutlineEdge = Readonly<{ start: Vec2; end: Vec2; provenance: EdgeProvenance }>;

/** One source shape's closed outline in the area frame: CCW ring plus its edges in ring order. */
export type ShapeOutline = Readonly<{ shapeId: string; ring: Ring; edges: readonly OutlineEdge[] }>;

/** Number of circle segments so that the sagitta stays within the chord tolerance. */
export const circleSegmentCount = (
  radiusMm: number,
  chordToleranceMm: number = circleChordToleranceMm,
): number => {
  const ratio = 1 - chordToleranceMm / radiusMm;
  if (ratio <= 0) return 8;
  const count = Math.ceil(Math.PI / Math.acos(ratio));
  return Math.min(4096, Math.max(8, count));
};

/** Stable lookup key for a source edge. */
export const sourceEdgeId = (shapeId: string, edgeKey: string): string => `${shapeId}|${edgeKey}`;

export const polygonEdgeKey = (fromVertexId: string, toVertexId: string): string =>
  `${fromVertexId}>${toVertexId}`;

const outlineFromLocal = (
  shape: ShapeValue,
  local: readonly Vec2[],
  keys: readonly string[],
  wallable: boolean,
): ShapeOutline => {
  const toArea = shapeToAreaAffine(shape);
  const ring = local.map((point) => applyAffine(toArea, point));
  const edges: OutlineEdge[] = [];
  ring.forEach((start, index) => {
    const end = ring[(index + 1) % ring.length];
    const edgeKey = keys[index];
    if (end === undefined || edgeKey === undefined) return;
    edges.push({ start, end, provenance: { shapeId: shape.id, edgeKey, wallable } });
  });
  return { shapeId: shape.id, ring, edges };
};

const rectangleOutline = (shape: RectangleShapeValue): ShapeOutline => {
  const halfWidth = shape.widthMm / 2;
  const halfHeight = shape.heightMm / 2;
  // Corner i is the start vertex of edge rectangleEdgeNames[i].
  const corners: Vec2[] = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];
  return outlineFromLocal(shape, corners, rectangleEdgeNames, true);
};

const circleOutline = (shape: CircleShapeValue): ShapeOutline => {
  const count = circleSegmentCount(shape.radiusMm);
  const points: Vec2[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (2 * Math.PI * index) / count;
    points.push({ x: shape.radiusMm * Math.cos(angle), y: shape.radiusMm * Math.sin(angle) });
  }
  return outlineFromLocal(
    shape,
    points,
    points.map(() => circleArcEdgeKey),
    false,
  );
};

/** Polygon vertices in CCW order (a clockwise list is reversed, keeping vertex IDs). */
const counterclockwiseVertices = (shape: PolygonShapeValue): PolygonShapeValue["vertices"] =>
  ringSignedArea(shape.vertices) < 0 ? [...shape.vertices].reverse() : shape.vertices;

const polygonOutline = (shape: PolygonShapeValue): ShapeOutline => {
  const vertices = counterclockwiseVertices(shape);
  const keys = vertices.map((vertex, index) =>
    polygonEdgeKey(vertex.id, vertices[(index + 1) % vertices.length]?.id ?? vertex.id),
  );
  return outlineFromLocal(
    shape,
    vertices.map((vertex) => ({ x: vertex.x, y: vertex.y })),
    keys,
    true,
  );
};

export const shapeOutline = (shape: ShapeValue): ShapeOutline => {
  switch (shape.type) {
    case "rectangle":
      return rectangleOutline(shape);
    case "circle":
      return circleOutline(shape);
    case "polygon":
      return polygonOutline(shape);
  }
};

/**
 * Length of a named edge of a shape: a straight wallable edge, or a circle's whole arc (its circumference,
 * D20: arc walls measure arc length from the circle's local 0°); null when the shape has no such edge.
 */
export const shapeEdgeLength = (shape: ShapeValue, edgeKey: string): number | null => {
  if (shape.type === "circle") return edgeKey === circleArcEdgeKey ? 2 * Math.PI * shape.radiusMm : null;
  const edge = shapeOutline(shape).edges.find(
    (candidate) => candidate.provenance.edgeKey === edgeKey && candidate.provenance.wallable,
  );
  return edge === undefined ? null : Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);
};
