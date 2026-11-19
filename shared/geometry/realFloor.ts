// RealFloor per area (D03/D04): floor-shape union ∪ wall band footprints along their actual spans, minus
// openings, placed in the building-floor frame and triangulated. Solid coverage (including outward wall
// support) is built first and the cuts are subtracted last, so support never refills a stairwell. The cuts of a
// floor are the footprints of the stairs and floor openings that reach it (floorCuts.ts, Phase 16.14); a floor
// built without its house has none. A yard's RealFloor (its lawn, Phase 17.2) is also clipped by the solids of the
// floor's rooms, so a yard drawn around or against the house never lies under (or over) a room floor or its walls;
// only buildRealFloors does this, since it needs the whole floor.
import { DraftSafeWeakMap } from "./draftSafeWeakMap";
import { isYard } from "@shared/domain/house/yards";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { AreaFloorGeometry } from "./areaGeometry";
import { computeAreaFloorGeometry } from "./areaGeometry";
import type { FloorCuts } from "./floorCuts";
import { noFloorCuts } from "./floorCuts";
import type { MeshBuffers } from "./meshData";
import { createMeshAccumulator, pushVertex, toMeshBuffers } from "./meshData";
import { differenceRegions, unionRegions, unionRings } from "./polygonKernel";
import type { Region, Ring } from "./region";
import { regionRings, transformRing } from "./region";
import { triangulateRegion } from "./triangulate";

export type RealFloor = Readonly<{
  areaId: string;
  /** RealFloor outline in floor coordinates. */
  region: Region;
  /** Upward-facing triangles at h = 0; UVs are plan (x, y) in mm. */
  mesh: MeshBuffers;
  triangulationOk: boolean;
}>;

export type RealFloorOptions = Readonly<{
  /** Opening footprints in the area frame, subtracted from the result. */
  openings?: readonly Ring[];
  /** The floor's cuts (floor coordinates, floorCutsOf), subtracted from the result. */
  cuts?: FloorCuts;
}>;

const plainCache = new DraftSafeWeakMap<AreaValue, RealFloor>();
const cutCache = new DraftSafeWeakMap<AreaValue, { signature: string; result: RealFloor }>();
const floorCache = new DraftSafeWeakMap<
  BuildingFloorValue,
  { signature: string; result: ReadonlyMap<string, RealFloor> }
>();

/** RealFloor region in floor coordinates. Inside-aligned bands lie within the floor shape, so all bands are united. */
export const realFloorRegion = (geometry: AreaFloorGeometry, openings: readonly Ring[] = []): Region => {
  const bandRings = geometry.realWalls.flatMap((wall) => wall.pieces.map((piece) => piece.ring));
  const united = unionRings([...regionRings(geometry.floorShape), ...bandRings]);
  if (openings.length === 0) return united;
  return differenceRegions(
    united,
    unionRings(
      openings.map((ring) => transformRing(ring, geometry.areaToFloor)),
      { closeContacts: false },
    ),
  );
};

const floorMesh = (region: Region): { mesh: MeshBuffers; ok: boolean } => {
  const triangulation = triangulateRegion(region);
  const mesh = createMeshAccumulator();
  for (const vertex of triangulation.vertices)
    pushVertex(mesh, { x: vertex.x, y: vertex.y, h: 0 }, { x: 0, y: 0, h: 1 }, vertex);
  mesh.indices.push(...triangulation.indices);
  return { mesh: toMeshBuffers(mesh), ok: triangulation.ok };
};

const computeRealFloor = (area: AreaValue, openings: readonly Ring[], cuts: FloorCuts): RealFloor => {
  const geometry = computeAreaFloorGeometry(area);
  let region = realFloorRegion(geometry, openings);
  if (cuts.region.polygons.length > 0) region = differenceRegions(region, cuts.region);
  const { mesh, ok } = floorMesh(region);
  return { areaId: area.id, region, mesh, triangulationOk: ok };
};

/** One area's RealFloor. Memoized by area identity (and the cuts' signature when given). */
export const buildRealFloor = (area: AreaValue, options: RealFloorOptions = {}): RealFloor => {
  const openings = options.openings ?? [];
  const cuts = options.cuts ?? noFloorCuts;
  if (openings.length > 0) return computeRealFloor(area, openings, cuts);
  if (cuts.region.polygons.length === 0) {
    const cached = plainCache.get(area);
    if (cached !== undefined) return cached;
    const result = computeRealFloor(area, [], cuts);
    plainCache.set(area, result);
    return result;
  }
  const cached = cutCache.get(area);
  if (cached?.signature === cuts.signature) return cached.result;
  const result = computeRealFloor(area, [], cuts);
  cutCache.set(area, { signature: cuts.signature, result });
  return result;
};

/**
 * Every area's RealFloor on a building floor, keyed by area ID, with the floor's cuts (stairs and floor openings,
 * floorCutsOf) subtracted from every area. Memoized by floor identity and the cuts' signature; unchanged areas are
 * reused while the cuts are unchanged.
 */
export const buildRealFloors = (
  floor: BuildingFloorValue,
  cuts: FloorCuts = noFloorCuts,
): ReadonlyMap<string, RealFloor> => {
  const cached = floorCache.get(floor);
  if (cached?.signature === cuts.signature) return cached.result;
  const rooms = floor.areas.filter((area) => !isYard(area));
  const yards = floor.areas.filter(isYard);
  const roomSolids =
    yards.length === 0 || rooms.length === 0
      ? null
      : unionRegions(rooms.map((area) => realFloorRegion(computeAreaFloorGeometry(area))));
  const result = new Map(
    floor.areas.map((area): [string, RealFloor] => {
      const plain = buildRealFloor(area, { cuts });
      if (roomSolids === null || !isYard(area)) return [area.id, plain];
      const region = differenceRegions(plain.region, roomSolids);
      const { mesh, ok } = floorMesh(region);
      return [area.id, { areaId: area.id, region, mesh, triangulationOk: ok }];
    }),
  );
  floorCache.set(floor, { signature: cuts.signature, result });
  return result;
};
