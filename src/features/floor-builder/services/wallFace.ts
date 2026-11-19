// The wall face open in the face view (Phase 5.1): its frame for the camera, the conversion between
// along/height on the face and floor plan points, its reliefs, and the lines a face tool snaps to (the wall's
// ends, floor, top, and centre lines; openings' edges; other reliefs' edges and centres).
import type { AreaValue } from "@shared/domain/schemas/area";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { WallReliefValue, WallValue } from "@shared/domain/schemas/wall";
import { openingSizeFromParameters } from "@shared/domain/templates/openingSize";
import { computeAreaFloorGeometry } from "@shared/geometry/areaGeometry";
import { buildRealAllWalls } from "@shared/geometry/realAllWalls";
import { reliefBounds } from "@shared/geometry/reliefStrips";
import type { FaceTopPoint } from "@shared/geometry/roofItems";
import { wallFaceTopProfile } from "@shared/geometry/roofItems";
import type { RealWall, WallSide } from "@shared/geometry/wallBands";
import type { FaceViewFrame, PlanPoint, PlanPoint3 } from "../../../renderer/runtimeTypes";
import { wallLabel } from "./labels";

export type FocusWallFace = Readonly<{ wallId: string; side: WallSide }>;

export type WallFace = Readonly<{
  area: AreaValue;
  wall: WallValue;
  real: RealWall;
  side: WallSide;
  label: string;
  lengthMm: number;
  /** The face's tallest point: the risen gable under a roof (Phase 19.5), else the wall's height. */
  heightMm: number;
  /**
   * The face's top from its start to its end (Phase 19.5): under a roof the risen and clipped shape (a gable end's
   * triangle), else the wall's flat top.
   */
  topProfile: readonly FaceTopPoint[];
  frame: FaceViewFrame;
  /** A point on the face (along from the span start, up from the floor), lifted toward the viewer. */
  toPlan: (alongMm: number, heightMm: number, liftMm?: number) => PlanPoint3;
  reliefs: readonly WallReliefValue[];
  /** Door and window openings on this wall as rectangles on the face (snap references for the shape tools). */
  openingRects: readonly Readonly<{ fromMm: number; toMm: number; bottomMm: number; topMm: number }>[];
  /** Snap lines: positions along the wall and heights. */
  snapAlong: readonly number[];
  snapHeights: readonly number[];
}>;

/** Space kept in front of the face (beyond its deepest box) before the view clips. */
const clipMarginMm = 200;

export const wallFaceOf = (
  house: HouseDocument,
  floorId: string,
  focus: FocusWallFace | undefined,
): WallFace | undefined => {
  if (focus === undefined) return undefined;
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  const area = floor?.areas.find((candidate) => candidate.walls.some((wall) => wall.id === focus.wallId));
  if (floor === undefined || area === undefined) return undefined;
  const index = area.walls.findIndex((wall) => wall.id === focus.wallId);
  const wall = area.walls[index];
  const real = computeAreaFloorGeometry(area).realWalls.find(
    (candidate) => candidate.wallId === focus.wallId,
  );
  if (wall === undefined || real?.arc !== null) return undefined;
  const { edge } = real;
  const offset = focus.side === "interior" ? real.interiorOffsetMm : real.exteriorOffsetMm;
  // Toward the viewer: into the room for the interior face, away from it for the exterior face.
  const toward = focus.side === "interior" ? -1 : 1;
  const normalPlan: PlanPoint = { x: edge.outwardNormal.x * toward, y: edge.outwardNormal.y * toward };
  const originMm: PlanPoint = {
    x: edge.start.x + edge.direction.x * real.spanMm.fromMm + edge.outwardNormal.x * offset,
    y: edge.start.y + edge.direction.y * real.spanMm.fromMm + edge.outwardNormal.y * offset,
  };
  const lengthMm = real.spanMm.toMm - real.spanMm.fromMm;
  const reliefs = (wall.reliefs ?? []).filter((relief) => relief.face === focus.side);
  const deepestBox = Math.max(0, ...reliefs.map((relief) => relief.depthMm));
  const toPlan = (alongMm: number, heightMm: number, liftMm = 2): PlanPoint3 => ({
    x: originMm.x + edge.direction.x * alongMm + normalPlan.x * liftMm,
    y: originMm.y + edge.direction.y * alongMm + normalPlan.y * liftMm,
    h: heightMm,
  });
  const openings = buildRealAllWalls(floor, openingSizeFromParameters).openings.filter(
    (opening) => opening.wallId === wall.id,
  );
  // Under a roof the face is the risen (or clipped) shape, not the authored rectangle (Phase 19.5).
  const profile = wallFaceTopProfile(floor, area.id, wall.id, focus.side) ?? [
    { alongMm: 0, topMm: wall.heightMm },
    { alongMm: lengthMm, topMm: wall.heightMm },
  ];
  const faceHeightMm = Math.max(1, ...profile.map((point) => point.topMm));
  const snapAlong = [
    0,
    lengthMm,
    lengthMm / 2,
    ...openings.flatMap((opening) => [
      opening.alongFromMm - real.spanMm.fromMm,
      opening.alongToMm - real.spanMm.fromMm,
    ]),
    ...reliefs.flatMap((relief) => {
      const box = reliefBounds(relief.shapes);
      return box === null ? [] : [box.minX, box.maxX, (box.minX + box.maxX) / 2];
    }),
  ];
  const snapHeights = [
    0,
    wall.heightMm,
    wall.heightMm / 2,
    ...(faceHeightMm !== wall.heightMm ? [faceHeightMm] : []),
    ...openings.flatMap((opening) => [opening.bottomMm, opening.topMm]),
    ...reliefs.flatMap((relief) => {
      const box = reliefBounds(relief.shapes);
      return box === null ? [] : [box.minY, box.maxY, (box.minY + box.maxY) / 2];
    }),
  ];
  return {
    area,
    wall,
    real,
    side: focus.side,
    label: `${wallLabel(area, wall, index)} (${focus.side})`,
    lengthMm,
    heightMm: faceHeightMm,
    topProfile: profile,
    frame: {
      originMm,
      directionPlan: { x: edge.direction.x, y: edge.direction.y },
      normalPlan,
      lengthMm,
      heightMm: faceHeightMm,
      clipAheadMm: deepestBox + clipMarginMm,
    },
    toPlan,
    reliefs,
    openingRects: openings.map((opening) => ({
      fromMm: opening.alongFromMm - real.spanMm.fromMm,
      toMm: opening.alongToMm - real.spanMm.fromMm,
      bottomMm: opening.bottomMm,
      topMm: opening.topMm,
    })),
    snapAlong,
    snapHeights,
  };
};
