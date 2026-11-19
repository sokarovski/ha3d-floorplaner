// Wall lines and face planes in the building-floor frame, for detents, tucking, and snapping.
import type { AreaValue } from "@shared/domain/schemas/area";
import { computeAreaFloorGeometry } from "./areaGeometry";
import type { Vec2 } from "./vector";
import { addVec, scaleVec } from "./vector";
import type { RealWall, WallSide } from "./wallBands";

/** A face plane in plan: a point on it, its direction (source-edge direction), and its outward normal. */
export type WallFacePlane = Readonly<{ point: Vec2; direction: Vec2; normal: Vec2 }>;

/** The placed RealWall of an area, or null when the wall is unknown or orphaned. */
export const realWallInFloor = (area: AreaValue, wallId: string): RealWall | null =>
  computeAreaFloorGeometry(area).realWalls.find((wall) => wall.wallId === wallId) ?? null;

/** Interior faces look into the room (−outward normal); exterior faces look away from it. */
export const wallFacePlane = (wall: RealWall, side: WallSide): WallFacePlane => {
  const offset = side === "interior" ? wall.interiorOffsetMm : wall.exteriorOffsetMm;
  return {
    point: addVec(wall.edge.start, scaleVec(wall.edge.outwardNormal, offset)),
    direction: wall.edge.direction,
    normal: side === "interior" ? scaleVec(wall.edge.outwardNormal, -1) : wall.edge.outwardNormal,
  };
};
