// Floor-frame geometry queries for tools: boundary pieces with source-edge provenance, wall end lines, hit tests.
import { applyAffine, invertAffine } from "@shared/geometry/affine";
import { computeAreaFloorGeometry } from "@shared/geometry/areaGeometry";
import { pointInRegion } from "@shared/geometry/region";
import type { Vec2 } from "@shared/geometry/vector";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { WallValue } from "@shared/domain/schemas/wall";
import { resolveSpan } from "@shared/domain/house/wallSpan";
import { circleArcEdgeKey } from "@shared/geometry/shapeOutline";
import type { ArcFrame } from "@shared/geometry/wallBands";
import { wallAlongOf, wallPointAt } from "@shared/geometry/wallBands";
import { distance, projectOnSegment } from "./snapping";

export type BoundaryPieceRef = Readonly<{
  areaId: string;
  shapeId: string;
  edgeKey: string;
  /** Interval along the source edge, mm from its start vertex. */
  fromMm: number;
  toMm: number;
  edgeLengthMm: number;
  /** Floor-frame endpoints of the piece. */
  start: Vec2;
  end: Vec2;
  /** Floor-frame endpoints of the whole source edge (a circle's arc: its point at local 0°, twice). */
  edgeStart: Vec2;
  edgeEnd: Vec2;
  /** Circle arc pieces (D20): the circle in the floor frame; positions are arc length. */
  arc: ArcFrame | null;
  /** The piece as a polyline in floor coordinates (two points for a straight piece). */
  points: readonly Vec2[];
}>;

/** Where a position (mm along a source edge) lies, for straight edges and circle arcs alike. */
export type EdgeParameter = Readonly<{
  edgeStart: Vec2;
  edgeEnd: Vec2;
  edgeLengthMm: number;
  arc: ArcFrame | null;
}>;

const straightStub = (edge: EdgeParameter) => {
  const length = Math.hypot(edge.edgeEnd.x - edge.edgeStart.x, edge.edgeEnd.y - edge.edgeStart.y) || 1;
  const direction = {
    x: (edge.edgeEnd.x - edge.edgeStart.x) / length,
    y: (edge.edgeEnd.y - edge.edgeStart.y) / length,
  };
  return {
    start: edge.edgeStart,
    end: edge.edgeEnd,
    direction,
    outwardNormal: { x: direction.y, y: -direction.x },
    lengthMm: edge.edgeLengthMm,
  };
};

export const pointOnEdge = (edge: EdgeParameter, mm: number): Vec2 =>
  wallPointAt({ edge: straightStub(edge), arc: edge.arc }, mm).point;

export const alongEdge = (edge: EdgeParameter, point: Vec2): number =>
  wallAlongOf({ edge: straightStub(edge), arc: edge.arc }, point);

/** Polyline of an edge interval: its two ends, or arc samples about every 5°. */
export const edgePolyline = (edge: EdgeParameter, fromMm: number, toMm: number): readonly Vec2[] => {
  if (edge.arc === null) return [pointOnEdge(edge, fromMm), pointOnEdge(edge, toMm)];
  const step = ((5 * Math.PI) / 180) * edge.arc.radiusMm;
  const count = Math.max(1, Math.ceil((toMm - fromMm) / step));
  return Array.from({ length: count + 1 }, (_unused, i) =>
    pointOnEdge(edge, fromMm + ((toMm - fromMm) * i) / count),
  );
};

export const activeFloor = (house: HouseDocument, floorId: string): BuildingFloorValue | undefined =>
  house.floors.find((floor) => floor.id === floorId);

export const toAreaLocal = (area: AreaValue, point: Vec2): Vec2 =>
  applyAffine(invertAffine(computeAreaFloorGeometry(area).areaToFloor), point);

export const toFloor = (area: AreaValue, point: Vec2): Vec2 =>
  applyAffine(computeAreaFloorGeometry(area).areaToFloor, point);

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Every wallable boundary piece of an area's floor shape, in floor coordinates. */
export const boundaryPieces = (area: AreaValue): readonly BoundaryPieceRef[] => {
  const geometry = computeAreaFloorGeometry(area);
  const pieces: BoundaryPieceRef[] = [];
  for (const edge of geometry.local.union.edges.values()) {
    if (!edge.wallable || edge.lengthMm <= 0) continue;
    const edgeStart = applyAffine(geometry.areaToFloor, edge.start);
    const edgeEnd = applyAffine(geometry.areaToFloor, edge.end);
    for (const interval of edge.intervals) {
      const start = lerp(edgeStart, edgeEnd, interval.fromMm / edge.lengthMm);
      const end = lerp(edgeStart, edgeEnd, interval.toMm / edge.lengthMm);
      pieces.push({
        areaId: area.id,
        shapeId: edge.shapeId,
        edgeKey: edge.edgeKey,
        fromMm: interval.fromMm,
        toMm: interval.toMm,
        edgeLengthMm: edge.lengthMm,
        start,
        end,
        edgeStart,
        edgeEnd,
        arc: null,
        points: [start, end],
      });
    }
  }
  const rotation = Math.atan2(geometry.areaToFloor.b, geometry.areaToFloor.a);
  for (const arcBoundary of geometry.local.union.arcs.values()) {
    const arc: ArcFrame = {
      centerMm: applyAffine(geometry.areaToFloor, arcBoundary.centerMm),
      radiusMm: arcBoundary.radiusMm,
      zeroAngleRad: rotation,
    };
    const zero = {
      x: arc.centerMm.x + Math.cos(rotation) * arc.radiusMm,
      y: arc.centerMm.y + Math.sin(rotation) * arc.radiusMm,
    };
    const edge: EdgeParameter = { edgeStart: zero, edgeEnd: zero, edgeLengthMm: arcBoundary.lengthMm, arc };
    for (const interval of arcBoundary.intervals)
      pieces.push({
        areaId: area.id,
        shapeId: arcBoundary.shapeId,
        edgeKey: circleArcEdgeKey,
        fromMm: interval.fromMm,
        toMm: interval.toMm,
        edgeLengthMm: arcBoundary.lengthMm,
        start: pointOnEdge(edge, interval.fromMm),
        end: pointOnEdge(edge, interval.toMm),
        edgeStart: zero,
        edgeEnd: zero,
        arc,
        points: edgePolyline(edge, interval.fromMm, interval.toMm),
      });
  }
  return pieces;
};

/** Bare stretches of a boundary piece: the parts no wall on that edge covers. */
export const barePieces = (area: AreaValue, piece: BoundaryPieceRef): readonly BoundaryPieceRef[] => {
  const walls = area.walls
    .filter((wall) => wall.sourceEdge.shapeId === piece.shapeId && wall.sourceEdge.edge === piece.edgeKey)
    .map((wall) => resolveSpan(wall.spanMm, piece.edgeLengthMm))
    .sort((a, b) => a.start - b.start);
  const result: BoundaryPieceRef[] = [];
  let cursor = piece.fromMm;
  const emit = (from: number, to: number): void => {
    if (to - from < 1) return;
    result.push({
      ...piece,
      fromMm: from,
      toMm: to,
      start: pointOnEdge(piece, from),
      end: pointOnEdge(piece, to),
      points: edgePolyline(piece, from, to),
    });
  };
  for (const span of walls) {
    if (span.end <= cursor || span.start >= piece.toMm) continue;
    emit(cursor, Math.min(span.start, piece.toMm));
    cursor = Math.max(cursor, span.end);
  }
  emit(cursor, piece.toMm);
  return result;
};

export const nearestPiece = (
  pieces: readonly BoundaryPieceRef[],
  point: Vec2,
  maxDistanceMm: number,
): BoundaryPieceRef | undefined => {
  let best: BoundaryPieceRef | undefined;
  let bestDistance = maxDistanceMm;
  for (const piece of pieces) {
    const d = distance(point, projectOnSegment(point, piece.start, piece.end));
    if (d <= bestDistance) {
      best = piece;
      bestDistance = d;
    }
  }
  return best;
};

/** The area whose floor shape contains a floor point (topmost = last drawn). */
export const areaAtPoint = (floor: BuildingFloorValue, point: Vec2): AreaValue | undefined => {
  for (let index = floor.areas.length - 1; index >= 0; index -= 1) {
    const area = floor.areas[index];
    if (area !== undefined && pointInRegion(point, computeAreaFloorGeometry(area).floorShape)) return area;
  }
  return undefined;
};

export type WallEndLine = Readonly<{
  wallId: string;
  areaId: string;
  end: "start" | "end";
  point: Vec2;
  /** Position of the end on its source edge (mm; arc length on a circle). */
  alongMm: number;
  edgeStart: Vec2;
  edgeEnd: Vec2;
  edgeLengthMm: number;
  arc: ArcFrame | null;
}>;

/** The two vertical end lines of each wall, in floor coordinates (on the source-edge contour). */
export const wallEndLines = (area: AreaValue): readonly WallEndLine[] => {
  const geometry = computeAreaFloorGeometry(area);
  const lines: WallEndLine[] = [];
  for (const realWall of geometry.realWalls) {
    const { edge } = realWall;
    const wall = area.walls.find((candidate) => candidate.id === realWall.wallId);
    if (wall === undefined || edge.lengthMm <= 0) continue;
    const base = {
      wallId: wall.id,
      areaId: area.id,
      edgeStart: edge.start,
      edgeEnd: edge.end,
      edgeLengthMm: edge.lengthMm,
      arc: realWall.arc,
    };
    // Arc walls: `edge` is the chord of the span; positions are measured on the arc.
    const at = (mm: number): Vec2 =>
      realWall.arc === null
        ? lerp(edge.start, edge.end, mm / edge.lengthMm)
        : wallPointAt(realWall, mm).point;
    lines.push({ ...base, end: "start", point: at(realWall.spanMm.fromMm), alongMm: realWall.spanMm.fromMm });
    lines.push({ ...base, end: "end", point: at(realWall.spanMm.toMm), alongMm: realWall.spanMm.toMm });
  }
  return lines;
};

export const wallById = (area: AreaValue, wallId: string): WallValue | undefined =>
  area.walls.find((wall) => wall.id === wallId);

/** Floor-frame bounds of a set of areas (for framing). */
export const areaBounds = (
  areas: readonly AreaValue[],
): Readonly<{ minX: number; minY: number; maxX: number; maxY: number }> | undefined => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const area of areas) {
    const geometry = computeAreaFloorGeometry(area);
    const rings = [
      ...geometry.floorShape.polygons.map((polygon) => polygon.outer),
      ...geometry.realWalls.flatMap((wall) => wall.pieces.map((piece) => piece.ring)),
    ];
    for (const ring of rings) {
      for (const point of ring) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
    if (!Number.isFinite(minX)) {
      minX = Math.min(minX, area.positionMm.x - 1000);
      minY = Math.min(minY, area.positionMm.y - 1000);
      maxX = Math.max(maxX, area.positionMm.x + 1000);
      maxY = Math.max(maxY, area.positionMm.y + 1000);
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : undefined;
};
