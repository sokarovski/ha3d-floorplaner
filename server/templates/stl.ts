// STL (binary or ASCII) → one glTF mesh node "Body" with material "Body", flat normals, and box-projected
// UVs in meters computed in the normalized frame. Positions stay in source units (the root transform scales).
import { Document } from "@gltf-transform/core";
import { validationError } from "../http/errors";
import type { RootTransformValue } from "../../shared/contracts/templates";
import { applyRoot, rotationRows } from "./rootTransform";
import type { Vec3 } from "./rootTransform";

const parseBinary = (bytes: Uint8Array): Float32Array<ArrayBuffer> | undefined => {
  if (bytes.byteLength < 84) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  if (84 + count * 50 !== bytes.byteLength) return undefined;
  const positions = new Float32Array(count * 9);
  for (let t = 0; t < count; t += 1) {
    const base = 84 + t * 50 + 12;
    for (let k = 0; k < 9; k += 1) positions[t * 9 + k] = view.getFloat32(base + k * 4, true);
  }
  return positions;
};

const parseAscii = (bytes: Uint8Array): Float32Array<ArrayBuffer> | undefined => {
  const text = new TextDecoder().decode(bytes);
  if (!/^\s*solid/.test(text)) return undefined;
  const values: number[] = [];
  for (const match of text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) {
    values.push(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  if (values.length === 0 || values.length % 9 !== 0 || values.some((value) => !Number.isFinite(value)))
    return undefined;
  return new Float32Array(values);
};

export const parseStl = (bytes: Uint8Array): Float32Array<ArrayBuffer> => {
  const positions = parseBinary(bytes) ?? parseAscii(bytes);
  if (positions === undefined || positions.length === 0) {
    throw validationError([
      { pointer: "/body/file", message: "is not a readable STL file (binary or ASCII)" },
    ]);
  }
  return positions;
};

export const stlBounds = (positions: Float32Array): { min: Vec3; max: Vec3 } => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis] ?? 0;
      min[axis] = Math.min(min[axis] ?? 0, value);
      max[axis] = Math.max(max[axis] ?? 0, value);
    }
  }
  return { min: [min[0] ?? 0, min[1] ?? 0, min[2] ?? 0], max: [max[0] ?? 0, max[1] ?? 0, max[2] ?? 0] };
};

/** Builds the glTF document for an STL. UV box projection uses the import-time root transform. */
export const stlDocument = (
  positions: Float32Array<ArrayBuffer>,
  transform: RootTransformValue,
): Document => {
  const count = positions.length / 3;
  const normals = new Float32Array(positions.length);
  const uvs = new Float32Array(count * 2);
  const rows = rotationRows(transform);
  const at = (vertex: number): Vec3 => [
    positions[vertex * 3] ?? 0,
    positions[vertex * 3 + 1] ?? 0,
    positions[vertex * 3 + 2] ?? 0,
  ];
  for (let t = 0; t < count / 3; t += 1) {
    const a = at(t * 3);
    const b = at(t * 3 + 1);
    const c = at(t * 3 + 2);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n: Vec3 = [
      (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
      (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
      (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
    ];
    const length = Math.hypot(n[0], n[1], n[2]);
    n = length > 0 ? [n[0] / length, n[1] / length, n[2] / length] : [0, 1, 0];
    // Dominant axis of the normal in the normalized frame picks the projection plane.
    const nf = rows.map((row) => Math.abs(row[0] * n[0] + row[1] * n[1] + row[2] * n[2]));
    const dominant =
      (nf[0] ?? 0) >= (nf[1] ?? 0) && (nf[0] ?? 0) >= (nf[2] ?? 0) ? 0 : (nf[1] ?? 0) >= (nf[2] ?? 0) ? 1 : 2;
    for (let k = 0; k < 3; k += 1) {
      const vertex = t * 3 + k;
      normals.set(n, vertex * 3);
      const f = applyRoot(transform, at(vertex));
      const [u, v] = dominant === 0 ? [f[2], f[1]] : dominant === 1 ? [f[0], f[2]] : [f[0], f[1]];
      uvs[vertex * 2] = u;
      uvs[vertex * 2 + 1] = -v;
    }
  }
  const document = new Document();
  const buffer = document.createBuffer();
  const material = document
    .createMaterial("Body")
    .setBaseColorFactor([0.8, 0.8, 0.8, 1])
    .setRoughnessFactor(0.8)
    .setMetallicFactor(0);
  const primitive = document
    .createPrimitive()
    .setAttribute("POSITION", document.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer))
    .setAttribute("NORMAL", document.createAccessor().setType("VEC3").setArray(normals).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", document.createAccessor().setType("VEC2").setArray(uvs).setBuffer(buffer))
    .setMaterial(material);
  const node = document.createNode("Body").setMesh(document.createMesh("Body").addPrimitive(primitive));
  document.getRoot().setDefaultScene(document.createScene("Scene").addChild(node));
  return document;
};
