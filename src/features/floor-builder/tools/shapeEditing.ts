// Pure shape-edit helpers in area-local mm: handle hit tests and the edited shape for a drag.
import type { Vec2 } from "@shared/geometry/vector";
import type { PolygonShapeValue, ShapeValue } from "@shared/domain/schemas/shapes";
import { createId } from "@shared/domain/ids";
import { distance, projectOnSegment } from "./snapping";

const rad = (degrees: number): number => (degrees * Math.PI) / 180;

const rotate = (v: Vec2, degrees: number): Vec2 => {
  const c = Math.cos(rad(degrees));
  const s = Math.sin(rad(degrees));
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

/** Area-local vertex positions of a polygon. */
export const polygonPoints = (shape: PolygonShapeValue): readonly Vec2[] =>
  shape.vertices.map((vertex) => {
    const r = rotate(vertex, shape.rotationDeg);
    return { x: shape.positionMm.x + r.x, y: shape.positionMm.y + r.y };
  });

export type ShapeHandle =
  | Readonly<{ kind: "vertex"; shapeId: string; index: number }>
  | Readonly<{ kind: "polygonEdge"; shapeId: string; index: number; at: Vec2 }>
  | Readonly<{ kind: "rectEdge"; shapeId: string; side: "left" | "right" | "bottom" | "top" }>
  /** A rectangle corner; signs pick the corner in the rectangle's own axes. */
  | Readonly<{ kind: "rectCorner"; shapeId: string; sx: 1 | -1; sy: 1 | -1 }>
  /** A circle quadrant point; `direction` is area-local and lies on the floor's red/green axes. */
  | Readonly<{ kind: "quadrant"; shapeId: string; direction: Vec2 }>;

/** Unit directions of the floor's +x, +y, −x, −y axes in the area frame. */
export const floorAxesInArea = (areaRotationDeg: number): readonly Vec2[] =>
  [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ].map((axis) => rotate(axis, -areaRotationDeg));

/** A circle's quadrant points (area-local) on the floor's axes. */
export const circleQuadrants = (
  center: Vec2,
  radiusMm: number,
  areaRotationDeg: number,
): readonly Readonly<{ direction: Vec2; point: Vec2 }>[] =>
  floorAxesInArea(areaRotationDeg).map((direction) => ({
    direction,
    point: { x: center.x + direction.x * radiusMm, y: center.y + direction.y * radiusMm },
  }));

/** A rectangle's corners (area-local) with their signs. */
export const rectangleCorners = (
  shape: Extract<ShapeValue, { type: "rectangle" }>,
): readonly Readonly<{ sx: 1 | -1; sy: 1 | -1; point: Vec2 }>[] =>
  (
    [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ] as const
  ).map(([sx, sy]) => {
    const offset = rotate({ x: (sx * shape.widthMm) / 2, y: (sy * shape.heightMm) / 2 }, shape.rotationDeg);
    return { sx, sy, point: { x: shape.positionMm.x + offset.x, y: shape.positionMm.y + offset.y } };
  });

/** A rectangle's side midpoints (area-local), the edge handles. */
export const rectangleSideMidpoints = (shape: Extract<ShapeValue, { type: "rectangle" }>): readonly Vec2[] =>
  [
    { x: shape.widthMm / 2, y: 0 },
    { x: 0, y: shape.heightMm / 2 },
    { x: -shape.widthMm / 2, y: 0 },
    { x: 0, y: -shape.heightMm / 2 },
  ].map((offset) => {
    const r = rotate(offset, shape.rotationDeg);
    return { x: shape.positionMm.x + r.x, y: shape.positionMm.y + r.y };
  });

/**
 * The handle under an area-local point: polygon vertices then edges; rectangle corners then sides; circle
 * quadrant points (on the floor's axes, hence the area's rotation).
 */
export const findHandle = (
  shapes: readonly ShapeValue[],
  point: Vec2,
  capture: number,
  preferId: string | undefined,
  areaRotationDeg = 0,
): ShapeHandle | undefined => {
  const ordered = [...shapes].sort((a, b) => (a.id === preferId ? -1 : b.id === preferId ? 1 : 0));
  for (const shape of ordered) {
    if (shape.type === "polygon") {
      const points = polygonPoints(shape);
      const index = points.findIndex((vertex) => distance(vertex, point) <= capture);
      if (index >= 0) return { kind: "vertex", shapeId: shape.id, index };
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (a === undefined || b === undefined) continue;
        const projected = projectOnSegment(point, a, b);
        if (distance(projected, point) <= capture)
          return { kind: "polygonEdge", shapeId: shape.id, index: i, at: projected };
      }
    } else if (shape.type === "circle") {
      const quadrant = circleQuadrants(shape.positionMm, shape.radiusMm, areaRotationDeg).find(
        (candidate) => distance(candidate.point, point) <= capture,
      );
      if (quadrant !== undefined)
        return { kind: "quadrant", shapeId: shape.id, direction: quadrant.direction };
    } else {
      const corner = rectangleCorners(shape).find((candidate) => distance(candidate.point, point) <= capture);
      if (corner !== undefined)
        return { kind: "rectCorner", shapeId: shape.id, sx: corner.sx, sy: corner.sy };
      const local = rotate(
        { x: point.x - shape.positionMm.x, y: point.y - shape.positionMm.y },
        -shape.rotationDeg,
      );
      const hw = shape.widthMm / 2;
      const hh = shape.heightMm / 2;
      const within = (value: number, half: number): boolean =>
        value >= -half - capture && value <= half + capture;
      if (Math.abs(local.x - hw) <= capture && within(local.y, hh))
        return { kind: "rectEdge", shapeId: shape.id, side: "right" };
      if (Math.abs(local.x + hw) <= capture && within(local.y, hh))
        return { kind: "rectEdge", shapeId: shape.id, side: "left" };
      if (Math.abs(local.y - hh) <= capture && within(local.x, hw))
        return { kind: "rectEdge", shapeId: shape.id, side: "top" };
      if (Math.abs(local.y + hh) <= capture && within(local.x, hw))
        return { kind: "rectEdge", shapeId: shape.id, side: "bottom" };
    }
  }
  return undefined;
};

/** Whether a resize keeps the centre fixed: circles by default, rectangles with Option (Phase 4.2). */
export const resizesAboutCenter = (shape: ShapeValue, alternate: boolean): boolean =>
  shape.type === "circle" ? !alternate : alternate;

/**
 * The shape after dragging a handle to an area-local point (null when the result would be degenerate).
 * `alternate` is Option/Alt: it switches between "opposite side fixed" and "about the centre"
 * (circles default to the centre, rectangles to the opposite side, see `resizesAboutCenter`).
 */
export const dragHandle = (
  shape: ShapeValue,
  handle: ShapeHandle,
  point: Vec2,
  alternate = false,
): ShapeValue | null => {
  if (handle.kind === "vertex" && shape.type === "polygon") {
    const local = rotate(
      { x: point.x - shape.positionMm.x, y: point.y - shape.positionMm.y },
      -shape.rotationDeg,
    );
    return {
      ...shape,
      vertices: shape.vertices.map((vertex, index) =>
        index === handle.index ? { ...vertex, x: local.x, y: local.y } : vertex,
      ),
    };
  }
  if (handle.kind === "quadrant" && shape.type === "circle") {
    if (resizesAboutCenter(shape, alternate)) {
      const radius = distance(shape.positionMm, point);
      return radius < 1 ? null : { ...shape, radiusMm: radius };
    }
    // By diameter: the opposite quadrant stays put; the circle grows along the handle's axis.
    const u = handle.direction;
    const opposite = {
      x: shape.positionMm.x - u.x * shape.radiusMm,
      y: shape.positionMm.y - u.y * shape.radiusMm,
    };
    const diameter = (point.x - opposite.x) * u.x + (point.y - opposite.y) * u.y;
    if (diameter < 2) return null;
    return {
      ...shape,
      positionMm: { x: opposite.x + (u.x * diameter) / 2, y: opposite.y + (u.y * diameter) / 2 },
      radiusMm: diameter / 2,
    };
  }
  if ((handle.kind === "rectEdge" || handle.kind === "rectCorner") && shape.type === "rectangle") {
    const local = rotate(
      { x: point.x - shape.positionMm.x, y: point.y - shape.positionMm.y },
      -shape.rotationDeg,
    );
    const hw = shape.widthMm / 2;
    const hh = shape.heightMm / 2;
    const centered = resizesAboutCenter(shape, alternate);
    let minX = -hw;
    let maxX = hw;
    let minY = -hh;
    let maxY = hh;
    const movesX =
      handle.kind === "rectCorner"
        ? handle.sx
        : handle.side === "right"
          ? 1
          : handle.side === "left"
            ? -1
            : 0;
    const movesY =
      handle.kind === "rectCorner"
        ? handle.sy
        : handle.side === "top"
          ? 1
          : handle.side === "bottom"
            ? -1
            : 0;
    if (movesX !== 0) {
      const anchor = centered ? -local.x : -movesX * hw;
      minX = Math.min(anchor, local.x);
      maxX = Math.max(anchor, local.x);
    }
    if (movesY !== 0) {
      const anchor = centered ? -local.y : -movesY * hh;
      minY = Math.min(anchor, local.y);
      maxY = Math.max(anchor, local.y);
    }
    const width = maxX - minX;
    const height = maxY - minY;
    if (width < 1 || height < 1) return null;
    const center = rotate({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, shape.rotationDeg);
    return {
      ...shape,
      positionMm: { x: shape.positionMm.x + center.x, y: shape.positionMm.y + center.y },
      widthMm: width,
      heightMm: height,
    };
  }
  return null;
};

/** Inserts a vertex on a polygon edge (new stable vertex ID). */
export const insertVertex = (shape: PolygonShapeValue, edgeIndex: number, at: Vec2): PolygonShapeValue => {
  const local = rotate({ x: at.x - shape.positionMm.x, y: at.y - shape.positionMm.y }, -shape.rotationDeg);
  const vertices = [...shape.vertices];
  vertices.splice(edgeIndex + 1, 0, { id: createId("v"), x: local.x, y: local.y });
  return { ...shape, vertices };
};

export const deleteVertex = (shape: PolygonShapeValue, index: number): PolygonShapeValue | null =>
  shape.vertices.length <= 3
    ? null
    : { ...shape, vertices: shape.vertices.filter((_vertex, position) => position !== index) };
