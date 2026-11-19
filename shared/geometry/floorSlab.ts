// Building-floor slab (Phase 16.2, owner 2026-11-18; spec/builder/model.md#floor-placement-and-slab): derived, never
// persisted. Coverage is the union of every area's RealFloor solid (its floor shape united with its wall bands, so
// the support under outward walls is included), minus the floor's cuts (stairs and floor openings, floorCuts.ts,
// Phase 16.14; a floor built without its house has none). Areas that touch or clash merge into one slab part;
// disjoint areas give separate parts. The slab is extruded downward from the floor's finished floor (h = 0,
// floor-local) by its thickness. Yards (Phase 17.2) are outdoors and have no slab: they add no coverage.
//
// Faces (all in the slab material): the underside at h = −thickness, the side faces along every coverage ring
// (outer edges and hole edges), and a top face at h = 0 only where the slab is not under a room's RealFloor
// (normally nowhere). There is no top face under room floors, so nothing is coplanar with them. Slivers thinner
// than `topSliverMm` between the coverage and the RealFloors are dropped from the top face.
import { DraftSafeWeakMap } from "./draftSafeWeakMap";
import { floorSlabOf } from "@shared/domain/house/floorPlacement";
import { isYard } from "@shared/domain/house/yards";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import { computeAreaFloorGeometry } from "./areaGeometry";
import type { FloorCuts } from "./floorCuts";
import { noFloorCuts } from "./floorCuts";
import type { MeshAccumulator, MeshBuffers } from "./meshData";
import { createMeshAccumulator, pushVertex, toMeshBuffers } from "./meshData";
import { differenceRegions, offsetRegion, unionRegions } from "./polygonKernel";
import { buildRealFloors, realFloorRegion } from "./realFloor";
import type { Region } from "./region";
import { regionArea, regionRings } from "./region";
import { triangulateRegion } from "./triangulate";

export type SlabGeometry = Readonly<{
  thicknessMm: number;
  /** Slab coverage in floor coordinates (the underside's outline); its polygons are the slab's parts. */
  region: Region;
  /** The slab top outside every room floor (drawn at h = 0); usually empty. */
  exposedTop: Region;
  /** Underside, sides and exposed top; UVs are physical mm (plan x/y on flat faces, along/height on sides). */
  mesh: MeshBuffers;
  triangulationOk: boolean;
}>;

/** Exposed-top features narrower than this (mm) are slivers along shared edges, not slab top (convention). */
const topSliverMm = 2;
/** Exposed-top pieces smaller than this (mm²) are dropped (convention). */
const minTopAreaMm2 = 100;

/** The floor's slab outline: united RealFloor solids of its rooms (not yards) minus the floor's cuts (floor frame). */
export const slabCoverage = (
  floor: Pick<BuildingFloorValue, "areas">,
  cuts: FloorCuts = noFloorCuts,
): Region => {
  const solids = floor.areas
    .filter((area) => !isYard(area))
    .map((area) => realFloorRegion(computeAreaFloorGeometry(area)));
  const united = unionRegions(solids);
  return cuts.region.polygons.length === 0 ? united : differenceRegions(united, cuts.region);
};

const exposedTopOf = (coverage: Region, floor: BuildingFloorValue, cuts: FloorCuts): Region => {
  const roomFloors = [...buildRealFloors(floor, cuts).values()].map((realFloor) => realFloor.region);
  const rest = roomFloors.length === 0 ? coverage : differenceRegions(coverage, unionRegions(roomFloors));
  if (rest.polygons.length === 0) return rest;
  // Morphological opening: shrinking then growing removes slivers left by numerically different boundaries.
  const opened = offsetRegion(offsetRegion(rest, -topSliverMm / 2), topSliverMm / 2);
  return {
    polygons: opened.polygons.filter((polygon) => regionArea({ polygons: [polygon] }) >= minTopAreaMm2),
  };
};

/** A flat face over `region` at height h; downward faces reverse the plan triangles' winding. */
const pushFlat = (mesh: MeshAccumulator, region: Region, h: number, up: boolean): boolean => {
  const triangulation = triangulateRegion(region);
  const base = mesh.positions.length / 3;
  for (const vertex of triangulation.vertices)
    pushVertex(mesh, { x: vertex.x, y: vertex.y, h }, { x: 0, y: 0, h: up ? 1 : -1 }, vertex);
  const indices = triangulation.indices;
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const a = (indices[index] ?? 0) + base;
    const b = (indices[index + 1] ?? 0) + base;
    const c = (indices[index + 2] ?? 0) + base;
    if (up) mesh.indices.push(a, b, c);
    else mesh.indices.push(a, c, b);
  }
  return triangulation.ok;
};

/**
 * Side faces along every ring from h = bottom to 0, facing out of the slab (right of each edge: outer rings are
 * counterclockwise and holes clockwise), counterclockwise seen from outside.
 */
const pushSides = (mesh: MeshAccumulator, region: Region, bottomMm: number): void => {
  for (const ring of regionRings(region)) {
    let along = 0;
    ring.forEach((a, index) => {
      const b = ring[(index + 1) % ring.length];
      if (b === undefined) return;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length === 0) return;
      const normal = { x: (b.y - a.y) / length, y: -(b.x - a.x) / length, h: 0 };
      const a0 = pushVertex(mesh, { x: a.x, y: a.y, h: bottomMm }, normal, { x: along, y: bottomMm });
      const b0 = pushVertex(mesh, { x: b.x, y: b.y, h: bottomMm }, normal, {
        x: along + length,
        y: bottomMm,
      });
      const b1 = pushVertex(mesh, { x: b.x, y: b.y, h: 0 }, normal, { x: along + length, y: 0 });
      const a1 = pushVertex(mesh, { x: a.x, y: a.y, h: 0 }, normal, { x: along, y: 0 });
      mesh.indices.push(a0, b0, b1, a0, b1, a1);
      along += length;
    });
  }
};

const computeSlab = (
  floor: BuildingFloorValue,
  thicknessMm: number,
  cuts: FloorCuts,
): SlabGeometry | null => {
  const region = slabCoverage(floor, cuts);
  if (region.polygons.length === 0) return null;
  const exposedTop = exposedTopOf(region, floor, cuts);
  const mesh = createMeshAccumulator();
  const undersideOk = pushFlat(mesh, region, -thicknessMm, false);
  pushSides(mesh, region, -thicknessMm);
  const topOk = exposedTop.polygons.length === 0 || pushFlat(mesh, exposedTop, 0, true);
  return {
    thicknessMm,
    region,
    exposedTop,
    mesh: toMeshBuffers(mesh),
    triangulationOk: undersideOk && topOk,
  };
};

const cache = new DraftSafeWeakMap<BuildingFloorValue["areas"], Map<string, SlabGeometry | null>>();
/** Slabs kept per areas array (thickness × cuts), oldest dropped first (implementation convention). */
const maxCachedSlabs = 8;

/**
 * The floor's slab with its cuts (floorCutsOf), or null when its thickness is 0 or it has no coverage. Memoized by
 * the areas array, the thickness and the cuts' signature (the material is not part of the geometry:
 * floorSlabOf(floor).material).
 */
export const buildFloorSlab = (
  floor: BuildingFloorValue,
  cuts: FloorCuts = noFloorCuts,
): SlabGeometry | null => {
  const { thicknessMm } = floorSlabOf(floor);
  if (thicknessMm <= 0) return null;
  const slabs = cache.get(floor.areas) ?? new Map<string, SlabGeometry | null>();
  cache.set(floor.areas, slabs);
  const key = `${String(thicknessMm)}|${cuts.signature}`;
  const cached = slabs.get(key);
  if (cached !== undefined) return cached;
  const result = computeSlab(floor, thicknessMm, cuts);
  slabs.set(key, result);
  for (const oldest of slabs.keys()) {
    if (slabs.size <= maxCachedSlabs) break;
    slabs.delete(oldest);
  }
  return result;
};
