// Resized template meshes (contact frame, meters) → BufferGeometry, with optional box-projected UVs in mm
// for surface-material overrides (spec/builder/features/object-templates.md#material-slots-and-textures).
import { BufferAttribute, BufferGeometry } from "three";
import type { ResizedMesh } from "@shared/geometry/templateResize";

const boxUvs = (positions: Float32Array, normals: Float32Array | null): Float32Array => {
  const count = positions.length / 3;
  const uvs = new Float32Array(count * 2);
  for (let index = 0; index < count; index += 1) {
    const px = (positions[index * 3] ?? 0) * 1000;
    const py = (positions[index * 3 + 1] ?? 0) * 1000;
    const pz = (positions[index * 3 + 2] ?? 0) * 1000;
    const nx = Math.abs(normals?.[index * 3] ?? 0);
    const ny = Math.abs(normals?.[index * 3 + 1] ?? 0);
    const nz = Math.abs(normals?.[index * 3 + 2] ?? 1);
    if (nx >= ny && nx >= nz) uvs.set([pz, py], index * 2);
    else if (ny >= nz) uvs.set([px, pz], index * 2);
    else uvs.set([px, py], index * 2);
  }
  return uvs;
};

export const resizedGeometry = (mesh: ResizedMesh, boxProjected: boolean): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  if (mesh.normals !== null) geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  const uvs = boxProjected ? boxUvs(mesh.positions, mesh.normals) : mesh.uvs;
  if (uvs !== null) geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  if (mesh.normals === null) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};
