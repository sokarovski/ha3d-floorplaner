// The roof face open in the roof face view (Phase 19.3, spec/builder/features/roofs.md#the-roof-face-view): the
// flat piece of the open roof under the level's plan point, its face frame (u level along the slope, v up the
// slope's surface, mm; shared/geometry/roofOpenings.ts), the camera frame that looks straight at the slope, and the
// conversion between face coordinates and points on the roof's top. The shape tools draw holes in face coordinates
// through the same face env as a wall face (faceSpace.ts); a hole or roof window is stored on the roof sheet (plan).
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { RoofValue } from "@shared/domain/schemas/roof";
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import type { RoofFaceFrame } from "@shared/geometry/roofOpenings";
import {
  faceAxes,
  fromFace,
  pieceFrame,
  pieceIndexAt,
  pieceRegion,
  roofOpenings,
  toFace,
} from "@shared/geometry/roofOpenings";
import type { Ring } from "@shared/geometry/region";
import { regionRings } from "@shared/geometry/region";
import type { RoofPiece } from "@shared/geometry/roofSurface";
import { planeHeight, roofSurface } from "@shared/geometry/roofSurface";
import type { Vec2 } from "@shared/geometry/vector";
import type { FaceViewFrame, PlanPoint3 } from "../../../renderer/runtimeTypes";
import type { UiState } from "../stores/uiStore";
import { openRoofOf } from "./roofSpace";

export type RoofFaceView = Readonly<{
  floor: BuildingFloorValue;
  roof: RoofValue;
  pieceIndex: number;
  piece: RoofPiece;
  frame: RoofFaceFrame;
  /** The face's outline in face coordinates. */
  rings: readonly Ring[];
  /** A point on the face (u along, v up the slope) on the roof's top, lifted toward the viewer. */
  toPlan: (u: number, v: number, liftMm?: number) => PlanPoint3;
  /** Face coordinates → roof sheet (plan) and back. */
  planOf: (point: Vec2) => Vec2;
  faceOfPlan: (point: Vec2) => Vec2;
  /** The camera frame (a tilted face view). */
  view: FaceViewFrame;
}>;

/** Space kept above the face before the view clips (mm): nothing stands on a roof, so the view never clips. */
const noClipMm = 1_000_000;

const viewCache = new WeakMap<RoofValue, Map<number, RoofFaceView>>();

/** The face of `roof` under the plan point, or undefined where no flat piece is under it. */
export const roofFaceAt = (
  floor: BuildingFloorValue,
  roof: RoofValue,
  point: Vec2,
): RoofFaceView | undefined => {
  const surface = roofSurface(roof);
  const pieceIndex = pieceIndexAt(surface, point);
  const piece = surface.pieces[pieceIndex];
  if (piece === undefined) return undefined;
  const byPiece = viewCache.get(roof) ?? new Map<number, RoofFaceView>();
  viewCache.set(roof, byPiece);
  const cached = byPiece.get(pieceIndex);
  if (cached?.floor === floor) return cached;
  const frame = pieceFrame(piece);
  const axes = faceAxes(frame);
  const thickness = Math.max(1, roof.thicknessMm);
  const topAt = (plan: Vec2): number => roof.eaveHeightMm + planeHeight(piece.plane, plan) + thickness;
  const toPlan = (u: number, v: number, liftMm = 3): PlanPoint3 => {
    const plan = fromFace(frame, { x: u, y: v });
    return {
      x: plan.x + axes.normal.x * liftMm,
      y: plan.y + axes.normal.y * liftMm,
      h: topAt(plan) + axes.normal.h * liftMm,
    };
  };
  const rings = regionRings(pieceRegion(piece)).map((ring) => ring.map((point) => toFace(frame, point)));
  const us = rings.flat().map((point) => point.x);
  const vs = rings.flat().map((point) => point.y);
  const minU = Math.min(...us);
  const maxU = Math.max(...us);
  const minV = Math.min(...vs);
  const maxV = Math.max(...vs);
  const origin = toPlan(0, 0, 0);
  const view: FaceViewFrame = {
    originMm: { x: origin.x, y: origin.y },
    directionPlan: frame.along,
    normalPlan: { x: axes.normal.x, y: axes.normal.y },
    lengthMm: Math.max(1, maxU - minU),
    heightMm: Math.max(1, maxV - minV),
    clipAheadMm: noClipMm,
    tilt: {
      originMm: origin,
      centerMm: toPlan((minU + maxU) / 2, (minV + maxV) / 2, 0),
      normal: axes.normal,
      along: axes.along,
      up: axes.up,
    },
  };
  const result: RoofFaceView = {
    floor,
    roof,
    pieceIndex,
    piece,
    frame,
    rings,
    toPlan,
    planOf: (point) => fromFace(frame, point),
    faceOfPlan: (point) => toFace(frame, point),
    view,
  };
  byPiece.set(pieceIndex, result);
  return result;
};

/** The roof face open in the face view, if any. */
export const openRoofFaceOf = (
  house: HouseDocument,
  ui: Pick<UiState, "activeFloorId" | "focusRoofId" | "focusRoofFace">,
): RoofFaceView | undefined => {
  if (ui.focusRoofFace === undefined) return undefined;
  const open = openRoofOf(house, ui);
  return open === undefined ? undefined : roofFaceAt(open.floor, open.roof, ui.focusRoofFace);
};

const polygon = (id: string, ring: Ring): ShapeValue => ({
  id,
  type: "polygon",
  positionMm: { x: 0, y: 0 },
  rotationDeg: 0,
  vertices: ring.map((point, index) => ({ id: `${id}-${String(index)}`, x: point.x, y: point.y })),
});

const areaCache = new WeakMap<RoofFaceView, AreaValue>();

/** An empty virtual area at the face origin: the shape tools draw a new hole on it in face coordinates. */
export const roofFaceArea = (face: RoofFaceView): AreaValue => {
  const cached = areaCache.get(face);
  if (cached !== undefined) return cached;
  const area: AreaValue = {
    id: face.roof.id,
    name: face.roof.name,
    positionMm: { x: 0, y: 0 },
    rotationDeg: 0,
    floor: { id: face.roof.id, material: face.roof.topMaterial, shapes: [], carpets: [] },
    walls: [],
    objects: [],
    lights: [],
  };
  areaCache.set(face, area);
  return area;
};

const floorCache = new WeakMap<RoofFaceView, BuildingFloorValue>();

/**
 * The virtual floor the shape tools snap to in a roof face: the empty drawing area, and a reference area with the
 * face's outline and the roof's holes and windows, all in face coordinates.
 */
export const roofFaceFloor = (face: RoofFaceView): BuildingFloorValue => {
  const cached = floorCache.get(face);
  if (cached !== undefined) return cached;
  const openings = roofOpenings(face.roof);
  const toFaceRing = (ring: Ring): Ring => ring.map((point) => face.faceOfPlan(point));
  const reference: AreaValue = {
    ...roofFaceArea(face),
    id: "roof-face-reference",
    floor: {
      id: "roof-face-reference",
      material: face.roof.topMaterial,
      shapes: [
        ...face.rings.map((ring, index) => polygon(`roof-face-outline-${String(index)}`, ring)),
        ...openings.holes.map((placed) =>
          polygon(`roof-face-${placed.hole.id}`, toFaceRing(placed.hole.points)),
        ),
        ...openings.windows.map((placed) =>
          polygon(`roof-face-${placed.window.id}`, toFaceRing(placed.ring)),
        ),
      ],
      carpets: [],
    },
  };
  const virtual: BuildingFloorValue = { ...face.floor, areas: [roofFaceArea(face), reference], guides: [] };
  floorCache.set(face, virtual);
  return virtual;
};
