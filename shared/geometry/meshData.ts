// Mesh-ready buffers in plan millimetres: positions (x, y, h), normals, and physical UVs in mm.
// The renderer converts (x, y, h) mm to Three.js (x/1000, h/1000, −y/1000) m, a proper rotation, so
// triangle winding (CCW seen from the outward normal) carries over unchanged.
import type { Vec2 } from "./vector";

export type MeshBuffers = Readonly<{
  /** xyz triples: plan x, plan y, height h (mm). */
  positions: Float32Array;
  /** Unit normals in the same (x, y, h) axes. */
  normals: Float32Array;
  /** Physical texture coordinates in mm (u along the surface, v up or plan y). */
  uvs: Float32Array;
  indices: Uint32Array;
}>;

export type Vec3 = Readonly<{ x: number; y: number; h: number }>;

/** Growable mesh accumulator. */
export type MeshAccumulator = {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly indices: number[];
};

export const createMeshAccumulator = (): MeshAccumulator => ({
  positions: [],
  normals: [],
  uvs: [],
  indices: [],
});

export const pushVertex = (mesh: MeshAccumulator, position: Vec3, normal: Vec3, uv: Vec2): number => {
  mesh.positions.push(position.x, position.y, position.h);
  mesh.normals.push(normal.x, normal.y, normal.h);
  mesh.uvs.push(uv.x, uv.y);
  return mesh.positions.length / 3 - 1;
};

export const toMeshBuffers = (mesh: MeshAccumulator): MeshBuffers => ({
  positions: Float32Array.from(mesh.positions),
  normals: Float32Array.from(mesh.normals),
  uvs: Float32Array.from(mesh.uvs),
  indices: Uint32Array.from(mesh.indices),
});
