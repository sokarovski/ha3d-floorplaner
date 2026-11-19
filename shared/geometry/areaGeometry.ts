// Per-area derived geometry with memoization by input identity. The local result (union + RealWalls in
// the area frame) is keyed by the area's shapes and walls arrays, so a rigid area move reuses it and only
// the floor-frame view is rebuilt. Immer drafts are never cached (DraftSafeWeakMap): a draft keeps its identity
// while a command mutates it.
import { DraftSafeWeakMap } from "./draftSafeWeakMap";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import type { WallValue } from "@shared/domain/schemas/wall";
import type { Affine2 } from "./affine";
import { applyAffine, applyLinear } from "./affine";
import type { FloorShapeUnion } from "./floorShapeUnion";
import { computeFloorShapeUnion } from "./floorShapeUnion";
import { areaToFloorAffine } from "./placement";
import type { Region } from "./region";
import { transformRegion, transformRing } from "./region";
import type { OrphanWall, RealWall } from "./wallBands";
import { computeAreaWalls } from "./wallBands";

/** Area-frame geometry: floor-shape union, RealWalls, and orphaned walls. */
export type AreaLocalGeometry = Readonly<{
  areaId: string;
  union: FloorShapeUnion;
  realWalls: readonly RealWall[];
  orphans: readonly OrphanWall[];
}>;

/** The same geometry placed in the building-floor frame. */
export type AreaFloorGeometry = Readonly<{
  areaId: string;
  local: AreaLocalGeometry;
  areaToFloor: Affine2;
  /** Floor-shape union in floor coordinates. */
  floorShape: Region;
  /** RealWalls in floor coordinates. */
  realWalls: readonly RealWall[];
}>;

const unionCache = new DraftSafeWeakMap<readonly ShapeValue[], FloorShapeUnion>();
const localCache = new DraftSafeWeakMap<
  readonly ShapeValue[],
  DraftSafeWeakMap<readonly WallValue[], Map<string, AreaLocalGeometry>>
>();
const floorCache = new DraftSafeWeakMap<AreaValue, AreaFloorGeometry>();

export const floorShapeUnionOf = (shapes: readonly ShapeValue[]): FloorShapeUnion => {
  const cached = unionCache.get(shapes);
  if (cached !== undefined) return cached;
  const union = computeFloorShapeUnion(shapes);
  unionCache.set(shapes, union);
  return union;
};

export const computeAreaLocalGeometry = (area: AreaValue): AreaLocalGeometry => {
  const shapes = area.floor.shapes;
  const byWalls =
    localCache.get(shapes) ?? new DraftSafeWeakMap<readonly WallValue[], Map<string, AreaLocalGeometry>>();
  localCache.set(shapes, byWalls);
  const byId = byWalls.get(area.walls) ?? new Map<string, AreaLocalGeometry>();
  byWalls.set(area.walls, byId);
  const cached = byId.get(area.id);
  if (cached !== undefined) return cached;
  const union = floorShapeUnionOf(shapes);
  const walls = computeAreaWalls(area.id, shapes, union, area.walls);
  const result: AreaLocalGeometry = {
    areaId: area.id,
    union,
    realWalls: walls.realWalls,
    orphans: walls.orphans,
  };
  byId.set(area.id, result);
  return result;
};

/** Places a RealWall (built in the area frame) into another frame. */
export const transformRealWall = (wall: RealWall, m: Affine2): RealWall => ({
  ...wall,
  edge: {
    ...wall.edge,
    start: applyAffine(m, wall.edge.start),
    end: applyAffine(m, wall.edge.end),
    direction: applyLinear(m, wall.edge.direction),
    outwardNormal: applyLinear(m, wall.edge.outwardNormal),
  },
  arc:
    wall.arc === null
      ? null
      : {
          centerMm: applyAffine(m, wall.arc.centerMm),
          radiusMm: wall.arc.radiusMm,
          zeroAngleRad: wall.arc.zeroAngleRad + Math.atan2(m.b, m.a),
        },
  pieces: wall.pieces.map((piece) => ({
    ...piece,
    ring: transformRing(piece.ring, m),
    faces: piece.faces.map((face) => ({
      ...face,
      start: applyAffine(m, face.start),
      end: applyAffine(m, face.end),
    })),
  })),
});

export const computeAreaFloorGeometry = (area: AreaValue): AreaFloorGeometry => {
  const cached = floorCache.get(area);
  if (cached !== undefined) return cached;
  const local = computeAreaLocalGeometry(area);
  const areaToFloor = areaToFloorAffine(area);
  const result: AreaFloorGeometry = {
    areaId: area.id,
    local,
    areaToFloor,
    floorShape: transformRegion(local.union.region, areaToFloor),
    realWalls: local.realWalls.map((wall) => transformRealWall(wall, areaToFloor)),
  };
  floorCache.set(area, result);
  return result;
};
