// Push detents and the tuck solver (D05, spec/builder/features/shared-walls.md#arranging-areas).
// Both only change the moving area's transform; thicknesses, alignments, and floor shapes never change.
import type { AreaValue } from "@shared/domain/schemas/area";
import { contactToleranceMm, parallelSineTolerance } from "./tolerances";
import type { Vec2 } from "./vector";
import { addVec, crossVec, directionDeg, dotVec, normalizeDeg, rotateVec, scaleVec, subVec } from "./vector";
import { degToRad } from "./affine";
import type { WallSide } from "./wallBands";
import { realWallInFloor, wallFacePlane } from "./wallFaces";

export type PushDetent = Readonly<{
  /** Room-contour separation along the moving wall's outward normal. */
  separationMm: number;
  /** Translation to apply to the moving area. */
  translationMm: Vec2;
  /** The moving area's resulting positionMm. */
  positionMm: Vec2;
}>;

export type PushDetents = Readonly<{
  currentSeparationMm: number;
  /** Outer faces coincide: merged thickness tA + tB. */
  touching: PushDetent;
  /** The thinner band nests inside the thicker one: merged thickness max(tA, tB). Also the "snap to shared wall" fix. */
  fullClash: PushDetent;
  /** Separations below this intrude into the other room (flagged, never blocked). */
  intrudesBelowMm: number;
}>;

export type DetentFailure =
  | Readonly<{ kind: "wallNotFound"; wallId: string }>
  | Readonly<{ kind: "notParallel" }>
  | Readonly<{ kind: "notOpposed" }>;

export type DetentResult =
  Readonly<{ ok: true; detents: PushDetents }> | Readonly<{ ok: false; failure: DetentFailure }>;

export type WallRef = Readonly<{ area: AreaValue; wallId: string }>;

/**
 * Detents for dragging the moving area's wall toward a parallel, opposed target wall. Stated in band terms
 * (interior/exterior face offsets), so inside and center alignments get the same face relationships.
 */
export const computePushDetents = (moving: WallRef, target: WallRef): DetentResult => {
  const a = realWallInFloor(moving.area, moving.wallId);
  if (a === null) return { ok: false, failure: { kind: "wallNotFound", wallId: moving.wallId } };
  const b = realWallInFloor(target.area, target.wallId);
  if (b === null) return { ok: false, failure: { kind: "wallNotFound", wallId: target.wallId } };
  const normal = a.edge.outwardNormal;
  if (Math.abs(crossVec(normal, b.edge.outwardNormal)) > parallelSineTolerance)
    return { ok: false, failure: { kind: "notParallel" } };
  if (dotVec(normal, b.edge.outwardNormal) > 0) return { ok: false, failure: { kind: "notOpposed" } };
  // Along `normal`, A's band spans [aIn, aOut] and B's band spans [s − bOut, s − bIn], s = contour separation.
  const currentSeparationMm = dotVec(subVec(b.edge.start, a.edge.start), normal);
  const touchingMm = a.exteriorOffsetMm + b.exteriorOffsetMm;
  const fullClashMm =
    a.thicknessMm <= b.thicknessMm
      ? a.interiorOffsetMm + b.exteriorOffsetMm
      : a.exteriorOffsetMm + b.interiorOffsetMm;
  const detent = (separationMm: number): PushDetent => {
    const translationMm = scaleVec(normal, currentSeparationMm - separationMm);
    return { separationMm, translationMm, positionMm: addVec(moving.area.positionMm, translationMm) };
  };
  return {
    ok: true,
    detents: {
      currentSeparationMm,
      touching: detent(touchingMm),
      fullClash: detent(fullClashMm),
      intrudesBelowMm: fullClashMm - contactToleranceMm,
    },
  };
};

export type TuckFace = Readonly<{
  area: AreaValue;
  wallId: string;
  side: WallSide;
  /** Picked point on the face, floor coordinates. */ pointMm: Vec2;
}>;

export type TuckResult = Readonly<{ positionMm: Vec2; rotationDeg: number; rotationDeltaDeg: number }>;

/** Projects a point onto a face plane. */
const ontoPlane = (point: Vec2, plane: { point: Vec2; normal: Vec2 }): Vec2 =>
  subVec(point, scaleVec(plane.normal, dotVec(subVec(point, plane.point), plane.normal)));

/**
 * Tuck: rotate the moving area about its picked point so the two faces are parallel and opposed, then
 * translate it so the picked points (projected onto their faces) coincide. Returns the new transform.
 */
export const solveTuck = (moving: TuckFace, target: TuckFace): TuckResult | null => {
  const movingWall = realWallInFloor(moving.area, moving.wallId);
  const targetWall = realWallInFloor(target.area, target.wallId);
  if (movingWall === null || targetWall === null) return null;
  const movingPlane = wallFacePlane(movingWall, moving.side);
  const targetPlane = wallFacePlane(targetWall, target.side);
  const rotationDeltaDeg = normalizeDeg(
    directionDeg(scaleVec(targetPlane.normal, -1)) - directionDeg(movingPlane.normal),
  );
  const pivot = ontoPlane(moving.pointMm, movingPlane);
  const destination = ontoPlane(target.pointMm, targetPlane);
  const radians = degToRad(rotationDeltaDeg);
  // p' = R(θ)(p − pivot) + destination, so the area origin T maps to R(θ)(T − pivot) + destination.
  const positionMm = addVec(rotateVec(subVec(moving.area.positionMm, pivot), radians), destination);
  return {
    positionMm,
    rotationDeg: normalizeDeg(moving.area.rotationDeg + rotationDeltaDeg),
    rotationDeltaDeg,
  };
};
