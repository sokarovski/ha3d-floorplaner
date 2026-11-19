// Conversions from geometry-core outputs (plan mm) to Three.js BufferGeometry in the plan-root frame.
import {
  BufferAttribute,
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Path,
  Shape,
  ShapeGeometry,
  Vector2,
} from "three";
import type { MeshBuffers } from "@shared/geometry/meshData";
import type { Region, RegionPolygon, Ring } from "@shared/geometry/region";
import type { PlanPoint, PlanPoint3 } from "./runtimeTypes";

/** Indexed triangle geometry with normals and physical (mm) UVs. */
export const meshToGeometry = (mesh: MeshBuffers): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("uv", new BufferAttribute(mesh.uvs, 2));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

const segmentGeometry = (coordinates: readonly number[]): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(coordinates, 3));
  geometry.computeBoundingSphere();
  return geometry;
};

/** Closed rings as line-segment pairs at height hMm (for LineSegments; dashes need non-indexed pairs). */
export const ringsToSegments = (rings: readonly Ring[], hMm: number): BufferGeometry => {
  const coordinates: number[] = [];
  for (const ring of rings) {
    ring.forEach((point, index) => {
      const next = ring[(index + 1) % ring.length];
      if (next === undefined) return;
      coordinates.push(point.x, point.y, hMm, next.x, next.y, hMm);
    });
  }
  return segmentGeometry(coordinates);
};

/** Edges of a vertical prism over a ring: bottom and top loops plus one vertical per vertex. */
export const prismEdgeSegments = (ring: Ring, bottomMm: number, topMm: number): BufferGeometry => {
  const coordinates: number[] = [];
  ring.forEach((point, index) => {
    const next = ring[(index + 1) % ring.length];
    if (next === undefined) return;
    coordinates.push(point.x, point.y, bottomMm, next.x, next.y, bottomMm);
    coordinates.push(point.x, point.y, topMm, next.x, next.y, topMm);
    coordinates.push(point.x, point.y, bottomMm, point.x, point.y, topMm);
  });
  return segmentGeometry(coordinates);
};

const withHeight = (point: PlanPoint3 | PlanPoint): PlanPoint3 =>
  "h" in point ? point : { x: point.x, y: point.y, h: 0 };

/** Line-segment pairs for a polyline (optionally closed). */
export const polylineSegments = (
  points: readonly (PlanPoint3 | PlanPoint)[],
  closed: boolean,
): BufferGeometry => {
  const coordinates: number[] = [];
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    if (from === undefined || to === undefined) continue;
    const a = withHeight(from);
    const b = withHeight(to);
    coordinates.push(a.x, a.y, a.h, b.x, b.y, b.h);
  }
  return segmentGeometry(coordinates);
};

const toVectors = (ring: Ring): Vector2[] => ring.map((point) => new Vector2(point.x, point.y));

const polygonShape = (polygon: RegionPolygon): Shape => {
  const shape = new Shape(toVectors(polygon.outer));
  for (const hole of polygon.holes) shape.holes.push(new Path(toVectors(hole)));
  return shape;
};

/** Flat upward-facing fill of a region at hMm. */
export const regionFill = (region: Region, hMm: number): BufferGeometry => {
  const geometry = new ShapeGeometry(region.polygons.map(polygonShape));
  geometry.translate(0, 0, hMm);
  return geometry;
};

/**
 * Fills of regions, each lifted onto its own plane h = c + ax·x + ay·y (mm), as one geometry (the shadow-only
 * ceiling under a roof, Phase 19.3).
 */
export const regionFillOnPlanes = (
  patches: readonly Readonly<{ region: Region; plane: Readonly<{ c: number; ax: number; ay: number }> }>[],
): BufferGeometry => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const { region, plane } of patches) {
    const shape = new ShapeGeometry(region.polygons.map(polygonShape));
    const source = shape.getAttribute("position");
    const index = shape.getIndex();
    const base = positions.length / 3;
    for (let at = 0; at < source.count; at += 1) {
      const x = source.getX(at);
      const y = source.getY(at);
      positions.push(x, y, plane.c + plane.ax * x + plane.ay * y);
    }
    if (index !== null) for (let at = 0; at < index.count; at += 1) indices.push(base + index.getX(at));
    else for (let at = 0; at < source.count; at += 1) indices.push(base + at);
    shape.dispose();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};

/** Solid vertical prism over a ring between two heights. */
export const ringPrism = (ring: Ring, bottomMm: number, topMm: number): BufferGeometry => {
  const geometry = new ExtrudeGeometry(new Shape(toVectors(ring)), {
    depth: Math.max(topMm - bottomMm, 0.01),
    bevelEnabled: false,
  });
  geometry.translate(0, 0, bottomMm);
  return geometry;
};

export const planPoint3 = withHeight;
