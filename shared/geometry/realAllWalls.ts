// RealAllWalls per building floor (D05), 2.5D:
//   RealWall bands of all areas in floor coordinates
//   → opening prisms through the full merged depth, relief prisms (boxes added, niches cut) at a face
//   → height levels (wall heights, opening bottoms/tops) → slices
//   → per slice: 2D union of bands − opening prisms (contact faces vanish in the union)
//   → classify outline pieces by band-face provenance (owner or cap)
//   → the floor's roof in Cuts walls mode (Phase 19.2, roofLimit.ts): with Walls rise to the roof, bands under the
//     roof (of walls whose own Rise to roof is not off, Phase 19.5) are raised to the highest underside over them (a band crossing the roof's outline is split there, its
//     uncovered part keeping its height); then every roof piece clips the walls over its own plan region while
//     extruding (wallMesh: trimmed faces, sloped caps, step faces at the outline)
//   → mesh with material groups, physical UVs, and per-triangle face back-references.
// Yards (Phase 17.2) take no part: their walls are fences (yardFences.ts), drawn as templates, never merged with
// the house's walls, cut by gates, or checked for intrusions.
import { DraftSafeWeakMap } from "./draftSafeWeakMap";
import { isYard } from "@shared/domain/house/yards";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { AreaFloorGeometry } from "./areaGeometry";
import { computeAreaFloorGeometry } from "./areaGeometry";
import { classifySliceEdges } from "./faceClassification";
import { heightLevels, sliceFootprint, sliceInputs } from "./heightSlices";
import { differenceRegions, intersectRegions, unionRings } from "./polygonKernel";
import type { Region } from "./region";
import { pointInRing, regionArea } from "./region";
import type { RoofLimit } from "./roofLimit";
import { floorRoofLimit, highestUndersideOver, roofUndersideAt } from "./roofLimit";
import { heightToleranceMm } from "./tolerances";
import type {
  FloorBand,
  HeightSlice,
  OpeningPrism,
  OpeningSizeResolver,
  RealAllWalls,
  WallGeometryIssue,
} from "./realAllWallsTypes";
import type { Vec2 } from "./vector";
import type { RealWall, WallFaceRef } from "./wallBands";
import type { AreaFootprint } from "./wallIntrusions";
import { findIntrusions } from "./wallIntrusions";
import { buildRealAllWallsMesh } from "./wallMesh";
import { resolveOpeningPrisms } from "./wallOpenings";
import { resolveReliefPrisms } from "./wallReliefs";

const cache = new DraftSafeWeakMap<BuildingFloorValue, DraftSafeWeakMap<OpeningSizeResolver, RealAllWalls>>();

const floorBands = (geometries: readonly AreaFloorGeometry[]): FloorBand[] =>
  geometries.flatMap((geometry) =>
    geometry.realWalls.flatMap((wall) =>
      wall.pieces.map((piece) => ({
        wallId: wall.wallId,
        areaId: wall.areaId,
        heightMm: wall.heightMm,
        ring: piece.ring,
        faces: piece.faces,
        wall,
      })),
    ),
  );

/** Bands smaller than this (mm²) after splitting at the roof's outline are dropped (slivers). */
const sliverAreaMm2 = 1;

/**
 * Walls rise to the roof (Phase 19.2): a band under the roof whose top is below the highest underside over it is
 * raised to that height (the roof then trims it to the underside); a band crossing the roof's outline is split there
 * and only its covered part rises. Bands outside the roof keep their height.
 */
const riseToRoof = (
  bands: readonly FloorBand[],
  limit: RoofLimit | null,
  keepHeight: ReadonlySet<string>,
): FloorBand[] => {
  if (limit?.wallsRise !== true) return [...bands];
  return bands.flatMap((band): FloorBand[] => {
    // A wall with Rise to roof off (Phase 19.5) keeps its own height; the roof still clips it.
    if (keepHeight.has(band.wallId)) return [band];
    const region: Region = { polygons: [{ outer: band.ring, holes: [] }] };
    const highest = highestUndersideOver(limit, region);
    if (highest === null || highest <= band.heightMm + heightToleranceMm) return [band];
    const inside = intersectRegions(region, limit.coverage);
    const outside = differenceRegions(region, limit.coverage);
    if (regionArea(outside) < sliverAreaMm2) return [{ ...band, heightMm: highest }];
    const part = (piece: Region, heightMm: number): FloorBand[] =>
      piece.polygons
        .filter((polygon) => regionArea({ polygons: [polygon] }) >= sliverAreaMm2)
        .map((polygon) => ({ ...band, ring: polygon.outer, heightMm }));
    return [...part(inside, highestUndersideOver(limit, inside) ?? highest), ...part(outside, band.heightMm)];
  });
};

/** The walls of a floor whose Rise to roof is off (Phase 19.5): they keep their own height under the roof. */
export const wallsKeepingHeight = (floor: Pick<BuildingFloorValue, "areas">): ReadonlySet<string> =>
  new Set(
    floor.areas.flatMap((area) =>
      area.walls.filter((wall) => wall.riseToRoof === false).map((wall) => wall.id),
    ),
  );

/** Each wall at the height of its tallest band (risen walls host openings up to the roof). */
const risenWalls = (
  wallsById: ReadonlyMap<string, RealWall>,
  bands: readonly FloorBand[],
): ReadonlyMap<string, RealWall> => {
  const tallest = new Map<string, number>();
  for (const band of bands) tallest.set(band.wallId, Math.max(tallest.get(band.wallId) ?? 0, band.heightMm));
  return new Map(
    [...wallsById].map(([id, wall]): [string, RealWall] => {
      const height = tallest.get(id) ?? wall.heightMm;
      return [id, height > wall.heightMm ? { ...wall, heightMm: height } : wall];
    }),
  );
};

/** An area's clear interior: floor shape minus its own bands. */
const clearInterior = (geometry: AreaFloorGeometry): AreaFootprint => ({
  areaId: geometry.areaId,
  clearInterior: differenceRegions(
    geometry.floorShape,
    unionRings(geometry.realWalls.flatMap((wall) => wall.pieces.map((piece) => piece.ring))),
  ),
});

/**
 * Builds RealAllWalls for one building floor. Memoized by floor and resolver identity (pass a stable
 * resolver); the floor object covers areas and roofs. Slices are the unclipped plan footprints (with risen walls);
 * the mesh applies the roof's limit.
 */
export const buildRealAllWalls = (
  floor: BuildingFloorValue,
  resolveOpeningSize: OpeningSizeResolver,
): RealAllWalls => {
  const byResolver = cache.get(floor) ?? new DraftSafeWeakMap<OpeningSizeResolver, RealAllWalls>();
  cache.set(floor, byResolver);
  const cached = byResolver.get(resolveOpeningSize);
  if (cached !== undefined) return cached;
  const result = build(floor, resolveOpeningSize, []);
  byResolver.set(resolveOpeningSize, result);
  return result;
};

/**
 * RealAllWalls of a part of a floor (`floor` holds only the areas to draw) cut also by openings of areas left
 * out (`extraOpenings`, prisms from the whole floor's RealAllWalls): a room drawn as its own layer keeps the
 * doorways its neighbours' openings cut through a shared wall (Phase 15.7). Not memoized; the caller keeps it.
 */
export const buildRealAllWallsWithOpenings = (
  floor: BuildingFloorValue,
  resolveOpeningSize: OpeningSizeResolver,
  extraOpenings: readonly OpeningPrism[],
): RealAllWalls => build(floor, resolveOpeningSize, extraOpenings);

const build = (
  floor: BuildingFloorValue,
  resolveOpeningSize: OpeningSizeResolver,
  extraOpenings: readonly OpeningPrism[],
): RealAllWalls => {
  const areas = floor.areas.filter((area) => !isYard(area));
  const geometries = areas.map(computeAreaFloorGeometry);
  const issues: WallGeometryIssue[] = geometries.flatMap((geometry) =>
    geometry.local.orphans.map((orphan): WallGeometryIssue => ({ kind: "orphanWall", ...orphan })),
  );
  const roofLimit = floorRoofLimit(floor);
  const bands = riseToRoof(floorBands(geometries), roofLimit, wallsKeepingHeight(floor));
  const wallsById = new Map<string, RealWall>(
    geometries.flatMap((geometry) =>
      geometry.realWalls.map((wall): [string, RealWall] => [wall.wallId, wall]),
    ),
  );
  // Openings and reliefs fit against the risen height (a gable window above the authored top); the window limit
  // under the roof is checked separately (floorIssues: items above the roof).
  const hosts = risenWalls(wallsById, bands);
  // Reliefs first: a box is also in the way of an opening's cut, so a window through a box goes through.
  const reliefs = resolveReliefPrisms(areas, hosts, bands);
  issues.push(...reliefs.issues);
  const boxBands: FloorBand[] = reliefs.prisms.flatMap((relief) => {
    const wall = wallsById.get(relief.wallId);
    return relief.mode !== "add" || wall === undefined
      ? []
      : [
          {
            wallId: relief.wallId,
            areaId: relief.areaId,
            heightMm: relief.topMm,
            ring: relief.footprint,
            faces: [],
            wall,
          },
        ];
  });
  const resolved = resolveOpeningPrisms(areas, hosts, [...bands, ...boxBands], resolveOpeningSize);
  issues.push(...resolved.issues);
  const openings = { prisms: [...resolved.prisms, ...extraOpenings] };

  const levels = heightLevels(bands, [...openings.prisms, ...reliefs.prisms]);
  const slices: HeightSlice[] = sliceInputs(levels, bands, openings.prisms, reliefs.prisms).map((input) => {
    const footprint = sliceFootprint(input);
    const classified = classifySliceEdges(
      footprint,
      input.bands,
      input.reliefs.flatMap((relief) => relief.faces),
    );
    issues.push(...classified.issues);
    return { bottomMm: input.bottomMm, topMm: input.topMm, footprint, edges: classified.edges };
  });
  // A box that reaches into another room is flagged like any band that does (Phase 5.0).
  issues.push(...findIntrusions([...bands, ...boxBands], geometries.map(clearInterior)));

  const result: RealAllWalls = {
    floorId: floor.id,
    roofLimit,
    bands,
    openings: openings.prisms,
    reliefs: reliefs.prisms,
    slices,
    mesh: buildRealAllWallsMesh(slices, wallsById, roofLimit),
    issues: dedupeAmbiguities(issues),
  };
  return result;
};

/** Ambiguity is reported once per wall set, not once per slice and piece. */
const dedupeAmbiguities = (issues: readonly WallGeometryIssue[]): WallGeometryIssue[] => {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (issue.kind !== "ambiguousOwnership") return true;
    const key = [...issue.wallIds].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Picking for top caps and shared bands: walls whose band contains the plan point at the given height (below the roof). */
export const wallsAtPoint = (realAllWalls: RealAllWalls, point: Vec2, heightMm: number): string[] => {
  const limit = roofUndersideAt(realAllWalls.roofLimit, point);
  if (limit !== null && heightMm > limit + heightToleranceMm) return [];
  return [
    ...new Set(
      realAllWalls.bands
        .filter((band) => band.heightMm >= heightMm && pointInRing(point, band.ring))
        .map((band) => band.wallId),
    ),
  ];
};

/** Picking for side faces: the wall face that owns a ray-hit triangle, or null for caps without an owner. */
export const faceOfTriangle = (realAllWalls: RealAllWalls, triangleIndex: number): WallFaceRef | null => {
  const faceIndex = realAllWalls.mesh.triangleFaces[triangleIndex];
  if (faceIndex === undefined || faceIndex < 0) return null;
  return realAllWalls.mesh.faceRefs[faceIndex] ?? null;
};
