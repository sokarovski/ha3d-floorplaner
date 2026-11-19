// Carpet meshes (spec/builder/features/materials-and-objects.md#6-carpets): the union of a carpet's
// shapes, composed shape → carpet → area → floor, clipped to the area's RealFloor, triangulated as a flat
// upward-facing surface. UVs are carpet-local mm, so textures tile at physical size and move with the carpet.
import { BufferAttribute, BufferGeometry } from "three";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { CarpetValue } from "@shared/domain/schemas/carpet";
import { applyAffine, composeAffine, invertAffine, placementAffine } from "@shared/geometry/affine";
import { areaToFloorAffine } from "@shared/geometry/placement";
import { intersectRegions, unionRings } from "@shared/geometry/polygonKernel";
import type { Region } from "@shared/geometry/region";
import { transformRing } from "@shared/geometry/region";
import { shapeOutline } from "@shared/geometry/shapeOutline";
import { triangulateRegion } from "@shared/geometry/triangulate";

/** Base lift above the floor and per-stack-index step (tree order: later carpets on top). */
export const carpetBaseLiftMm = 2;
export const carpetStackStepMm = 0.5;

export const carpetRegion = (area: AreaValue, carpet: CarpetValue, realFloor: Region): Region => {
  const carpetToFloor = composeAffine(
    areaToFloorAffine(area),
    placementAffine(carpet.positionMm, carpet.rotationDeg),
  );
  const rings = carpet.shapes.map((shape) => transformRing(shapeOutline(shape).ring, carpetToFloor));
  return intersectRegions(unionRings(rings, { closeContacts: false }), realFloor);
};

export const carpetGeometry = (
  area: AreaValue,
  carpet: CarpetValue,
  realFloor: Region,
  stackIndex: number,
): BufferGeometry | null => {
  const region = carpetRegion(area, carpet, realFloor);
  if (region.polygons.length === 0) return null;
  const triangulation = triangulateRegion(region);
  if (!triangulation.ok || triangulation.indices.length === 0) return null;
  const floorToCarpet = invertAffine(
    composeAffine(areaToFloorAffine(area), placementAffine(carpet.positionMm, carpet.rotationDeg)),
  );
  const hMm = carpetBaseLiftMm + carpetStackStepMm * stackIndex;
  const count = triangulation.vertices.length;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  triangulation.vertices.forEach((vertex, index) => {
    positions.set([vertex.x, vertex.y, hMm], index * 3);
    normals.set([0, 0, 1], index * 3);
    const local = applyAffine(floorToCarpet, vertex);
    uvs.set([local.x, local.y], index * 2);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(Uint32Array.from(triangulation.indices), 1));
  geometry.computeBoundingSphere();
  return geometry;
};
