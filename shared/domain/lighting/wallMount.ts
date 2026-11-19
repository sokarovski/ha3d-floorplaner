// Wall-mounted lights (Phase 17.3, spec/builder/features/lighting.md#wall-mounted-lights-phase-173): a light with
// `mount: "wall"` sits on one face of one of its area's walls, interior (into the room) or exterior (outside an
// outside wall: lanterns, up/down lights, bulkheads). Its stored position stays the truth for the plan point; the
// mount frame projects it onto the face line (clamped to the wall's span) at the light's elevation, and the
// fixture's front is the face's outward normal, so a light follows its wall when the wall moves or thickens.
// The property rules keep the stored fields in step: choosing Mount → Wall picks the nearest wall and the side the
// light is on; every mount change snaps the position onto the face and turns the heading to the face's normal.
import type { AreaValue } from "../schemas/area";
import type { LightValue } from "../schemas/light";
import { applyAffine, invertAffine } from "../../geometry/affine";
import { areaToFloorAffine } from "../../geometry/placement";
import type { Vec2 } from "../../geometry/vector";
import { addVec, directionDeg, dotVec, normalizeDeg, scaleVec, subVec } from "../../geometry/vector";
import { realWallInFloor, wallFacePlane } from "../../geometry/wallFaces";
import { computeAreaFloorGeometry } from "../../geometry/areaGeometry";
import type { RealWall, WallSide } from "../../geometry/wallBands";

/** How far in front of its face an emitter without a fixture model sits (mm), clear of the wall's own shadow. */
export const wallMountClearanceMm = 100;

/** A wall-mounted light's frame in the building-floor frame (mm). */
export type LightWallMount = Readonly<{
  wallId: string;
  side: WallSide;
  /** The light's point on the face. */
  point: Vec2;
  /** The face's outward unit normal (into the room for an interior face, away from it for an exterior one). */
  normal: Vec2;
  /** Unit direction along the wall (its source edge's direction). */
  direction: Vec2;
}>;

const faceFrame = (wall: RealWall, side: WallSide, floorPoint: Vec2): LightWallMount => {
  const plane = wallFacePlane(wall, side);
  const along = dotVec(subVec(floorPoint, plane.point), plane.direction);
  const clamped = Math.min(Math.max(along, wall.spanMm.fromMm), wall.spanMm.toMm);
  return {
    wallId: wall.wallId,
    side,
    point: addVec(plane.point, scaleVec(plane.direction, clamped)),
    normal: plane.normal,
    direction: plane.direction,
  };
};

/** The light's mount frame, or null for a free light (or one whose wall is gone: it is drawn where it is stored). */
export const lightWallMount = (area: AreaValue, light: LightValue): LightWallMount | null => {
  if (light.mount !== "wall" || light.wallId === undefined) return null;
  const wall = realWallInFloor(area, light.wallId);
  if (wall === null) return null;
  return faceFrame(
    wall,
    light.wallSide ?? "interior",
    applyAffine(areaToFloorAffine(area), light.positionMm),
  );
};

/**
 * Where the light is in the floor frame (mm, h up): its face point for a wall-mounted light (`clearanceMm` in front of
 * it when asked, for an emitter without a fixture model), else its stored position; always at its elevation.
 */
export const lightFloorPoint = (
  area: AreaValue,
  light: LightValue,
  clearanceMm = 0,
): Readonly<{ x: number; y: number; h: number }> => {
  const mount = lightWallMount(area, light);
  const point =
    mount === null
      ? applyAffine(areaToFloorAffine(area), light.positionMm)
      : addVec(mount.point, scaleVec(mount.normal, clearanceMm));
  return { x: point.x, y: point.y, h: light.elevationMm };
};

/** The nearest wall of the area to a floor point, and the side of it the point is on. */
export const nearestWallFace = (
  area: AreaValue,
  floorPoint: Vec2,
): Readonly<{ wallId: string; side: WallSide }> | null => {
  let best: { wallId: string; side: WallSide; distance: number } | null = null;
  for (const wall of computeAreaFloorGeometry(area).realWalls) {
    const offset = dotVec(subVec(floorPoint, wall.edge.start), wall.edge.direction);
    const along = Math.min(Math.max(offset, wall.spanMm.fromMm), wall.spanMm.toMm);
    const onLine = addVec(wall.edge.start, scaleVec(wall.edge.direction, along));
    const across = dotVec(subVec(floorPoint, onLine), wall.edge.outwardNormal);
    const distance = Math.hypot(floorPoint.x - onLine.x, floorPoint.y - onLine.y);
    if (best === null || distance < best.distance)
      best = {
        wallId: wall.wallId,
        side: across > (wall.interiorOffsetMm + wall.exteriorOffsetMm) / 2 ? "exterior" : "interior",
        distance,
      };
  }
  return best === null ? null : { wallId: best.wallId, side: best.side };
};

type MountableLight = {
  mount?: LightValue["mount"];
  wallId?: string;
  wallSide?: LightValue["wallSide"];
  positionMm: { x: number; y: number };
  rotationDeg: number;
  geometry: { type: LightValue["geometry"]["type"] };
};

/**
 * Snaps a wall-mounted light's stored position onto its face and (with `turn`) its heading to the face's normal (a
 * linear light's heading runs along the wall instead). A free light, or one whose wall is gone, is left as it is.
 */
export const snapToWallMount = (area: AreaValue, light: MountableLight, turn = true): void => {
  if (light.mount !== "wall" || light.wallId === undefined) return;
  const wall = realWallInFloor(area, light.wallId);
  if (wall === null) return;
  const toFloor = areaToFloorAffine(area);
  const frame = faceFrame(wall, light.wallSide ?? "interior", applyAffine(toFloor, light.positionMm));
  const local = applyAffine(invertAffine(toFloor), frame.point);
  light.positionMm = { x: Math.round(local.x), y: Math.round(local.y) };
  if (!turn) return;
  const heading = directionDeg(light.geometry.type === "linear" ? frame.direction : frame.normal);
  light.rotationDeg = Math.round(normalizeDeg(heading - area.rotationDeg) * 10) / 10;
};

/**
 * Mounts a light on the nearest wall of its area (Mount → Wall, or a wall-only fixture chosen): that wall, on the
 * given side or else the side the light is on, then snaps it. Returns false when the area has no wall.
 */
export const mountOnNearestWall = (area: AreaValue, light: MountableLight, side?: WallSide): boolean => {
  const nearest = nearestWallFace(area, applyAffine(areaToFloorAffine(area), light.positionMm));
  if (nearest === null) return false;
  light.mount = "wall";
  light.wallId = nearest.wallId;
  light.wallSide = side ?? nearest.side;
  snapToWallMount(area, light);
  return true;
};

const isMountable = (value: unknown): value is MountableLight => {
  if (typeof value !== "object" || value === null) return false;
  const record: Record<string, unknown> = { ...value };
  const position = record.positionMm;
  const geometry = record.geometry;
  return (
    typeof record.rotationDeg === "number" &&
    typeof position === "object" &&
    position !== null &&
    typeof geometry === "object" &&
    geometry !== null
  );
};

/**
 * Follow-up edits of the property command on a light's mount fields (D18 stays one command): Mount → Wall mounts it
 * on the nearest wall (unless a wall of its area is already chosen); Mount → Free drops the wall fields; a new wall
 * or side snaps the light onto that face.
 */
export const applyLightMountRules = (area: AreaValue, light: unknown, path: readonly string[]): void => {
  if (!isMountable(light)) return;
  const key = path.join(".");
  if (key === "mount") {
    if (light.mount === "wall") {
      const known = light.wallId !== undefined && realWallInFloor(area, light.wallId) !== null;
      if (known) snapToWallMount(area, light);
      else if (!mountOnNearestWall(area, light, light.wallSide)) light.mount = "free";
    } else {
      delete light.wallId;
      delete light.wallSide;
      if (light.mount === "free") delete light.mount;
    }
  } else if (key === "wallId" || key === "wallSide") snapToWallMount(area, light);
  else if (key === "positionMm" || key === "positionMm.x" || key === "positionMm.y")
    snapToWallMount(area, light, false);
};
