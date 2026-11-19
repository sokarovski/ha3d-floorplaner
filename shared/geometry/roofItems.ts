// Items under the roof (Phase 19.2, spec/builder/features/roofs.md#window-limit): the window limit and the issues for
// things above the roof. The roof is authored data, so the underside over any plan point is known without the
// derived walls (roofLimit.ts). A door or window (wall opening) goes through its wall, so its top must stay under the
// underside along its whole width on both faces of the wall; a wall-mounted object along its width on the face it
// hangs on; floor objects (stairs included) and lights at their plan point. Items are never clipped or moved by a
// roof edit, only flagged; placing, moving and resizing an opening keeps it under the roof (the tools snap it down or
// refuse).
import type { BuildingFloorValue } from "../domain/schemas/floor";
import type { AreaValue } from "../domain/schemas/area";
import type { LightValue } from "../domain/schemas/light";
import { lightWallMount } from "../domain/lighting/wallMount";
import type { WallSide } from "./wallBands";
import type { RealWall } from "./wallBands";
import type { OpeningSizeResolver } from "./realAllWallsTypes";
import { applyAffine } from "./affine";
import { computeAreaFloorGeometry } from "./areaGeometry";
import type { HeightProbe, RoofLimit } from "./roofLimit";
import {
  evaluateLinear,
  flagsAboveRoof,
  floorRoofLimit,
  lowestUndersideAlong,
  roofProbeMm,
  roofUndersideAt,
  segmentSpans,
} from "./roofLimit";
import { heightToleranceMm } from "./tolerances";
import { wallsKeepingHeight } from "./realAllWalls";
import type { Vec2 } from "./vector";

/** A face line of a wall between two positions along its source edge (mm from the edge start), just inside it. */
const faceLine = (wall: RealWall, side: WallSide, fromMm: number, toMm: number): readonly [Vec2, Vec2] => {
  const { start, direction, outwardNormal } = wall.edge;
  const inset = Math.min(roofProbeMm, wall.thicknessMm / 4);
  const offset = side === "exterior" ? wall.exteriorOffsetMm - inset : wall.interiorOffsetMm + inset;
  const at = (along: number): Vec2 => ({
    x: start.x + direction.x * along + outwardNormal.x * offset,
    y: start.y + direction.y * along + outwardNormal.y * offset,
  });
  return [at(fromMm), at(toMm)];
};

const realWallOf = (
  floor: Pick<BuildingFloorValue, "areas">,
  areaId: string,
  wallId: string,
): RealWall | undefined => {
  const area = floor.areas.find((candidate) => candidate.id === areaId);
  return area === undefined
    ? undefined
    : computeAreaFloorGeometry(area).realWalls.find((wall) => wall.wallId === wallId);
};

const lowestOver = (limit: RoofLimit | null, lines: readonly (readonly [Vec2, Vec2])[]): number | null => {
  let lowest: number | null = null;
  for (const [a, b] of lines) {
    const value = lowestUndersideAlong(limit, a, b);
    if (value !== null) lowest = lowest === null ? value : Math.min(lowest, value);
  }
  return lowest;
};

/**
 * The highest top a wall item may have: the lowest underside over its width (centre `centreAlongSpanMm` from the
 * wall's span start, as `distanceAlongWallMm`) on the given faces, or null where no roof is over it.
 */
export const wallItemTopLimitMm = (
  floor: Pick<BuildingFloorValue, "areas" | "roofs">,
  areaId: string,
  wallId: string,
  centreAlongSpanMm: number,
  widthMm: number,
  sides: readonly WallSide[] = ["interior", "exterior"],
): number | null => {
  const limit = floorRoofLimit(floor);
  if (limit === null) return null;
  const wall = realWallOf(floor, areaId, wallId);
  if (wall === undefined) return null;
  const centre = wall.spanMm.fromMm + centreAlongSpanMm;
  const half = Math.max(0, widthMm) / 2;
  return lowestOver(
    limit,
    sides.map((side) => faceLine(wall, side, centre - half, centre + half)),
  );
};

/**
 * The plan point a light is checked at against the roof: a wall-mounted light's point on its face, probed just inside
 * the wall (so a lantern on an exterior face under the eave counts as covered, like the wall itself), else its
 * stored position (floor frame).
 */
export const lightRoofProbe = (area: AreaValue, light: LightValue): Vec2 => {
  const mount = lightWallMount(area, light);
  if (mount !== null)
    return {
      x: mount.point.x - mount.normal.x * roofProbeMm,
      y: mount.point.y - mount.normal.y * roofProbeMm,
    };
  return applyAffine(computeAreaFloorGeometry(area).areaToFloor, light.positionMm);
};

/**
 * The highest elevation a light may have (Phase 19.5): the underside over its point (a wall-mounted light: on its
 * face), or null where no roof cuts the floor or none is over it.
 */
export const lightTopLimitMm = (
  floor: Pick<BuildingFloorValue, "roofs">,
  area: AreaValue,
  light: LightValue,
): number | null => roofUndersideAt(floorRoofLimit(floor), lightRoofProbe(area, light));

/** One point of a wall face's top: along the face from the wall's span start, and the top's height there. */
export type FaceTopPoint = Readonly<{ alongMm: number; topMm: number }>;

/**
 * The top of a wall face under its floor's roof (Phase 19.5: the wall face view frames the risen gable shape): where
 * the roof covers the face, a wall that rises (the roof's Walls rise and the wall's own Rise to roof) reaches the
 * underside, any other is cut to min(its height, underside); elsewhere it keeps its own height. A polyline from the
 * span start to its end (along 0…length), or null when no roof cuts the floor's walls.
 */
export const wallFaceTopProfile = (
  floor: Pick<BuildingFloorValue, "areas" | "roofs">,
  areaId: string,
  wallId: string,
  side: WallSide,
): FaceTopPoint[] | null => {
  const limit = floorRoofLimit(floor);
  if (limit === null) return null;
  const wall = realWallOf(floor, areaId, wallId);
  if (wall === undefined) return null;
  const length = wall.spanMm.toMm - wall.spanMm.fromMm;
  if (length <= 0) return null;
  const rises = limit.wallsRise && !wallsKeepingHeight(floor).has(wallId);
  const [a, b] = faceLine(wall, side, wall.spanMm.fromMm, wall.spanMm.toMm);
  const own = wall.heightMm;
  const points: FaceTopPoint[] = [];
  const push = (t: number, topMm: number): void => {
    const last = points[points.length - 1];
    const alongMm = t * length;
    if (last !== undefined && Math.abs(last.alongMm - alongMm) < 1e-6 && Math.abs(last.topMm - topMm) < 1e-6)
      return;
    points.push({ alongMm, topMm });
  };
  for (const span of segmentSpans(limit, a, b)) {
    if (span.piece === undefined) {
      push(span.t0, own);
      push(span.t1, own);
      continue;
    }
    const plane = span.piece.plane;
    const at = (t: number): number =>
      evaluateLinear(plane, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const h0 = at(span.t0);
    const h1 = at(span.t1);
    if (rises) {
      push(span.t0, h0);
      push(span.t1, h1);
      continue;
    }
    // Not rising: the lower of the wall's own top and the underside (a kink where they cross).
    push(span.t0, Math.min(own, h0));
    if ((h0 - own) * (h1 - own) < 0) {
      const t = span.t0 + ((span.t1 - span.t0) * (own - h0)) / (h1 - h0);
      push(t, own);
    }
    push(span.t1, Math.min(own, h1));
  }
  return points;
};

/** What placing an opening under the roof does: fits, is lowered to fit (new bottom), or cannot fit at all. */
export type RoofFit =
  | Readonly<{ kind: "fits" }>
  | Readonly<{ kind: "lowered"; bottomMm: number; limitMm: number }>
  | Readonly<{ kind: "tooTall"; limitMm: number }>;

/** Keeps an opening's top under the roof by lowering it (never below the floor). */
export const fitUnderRoof = (bottomMm: number, heightMm: number, limitMm: number | null): RoofFit => {
  if (limitMm === null || bottomMm + heightMm <= limitMm + heightToleranceMm) return { kind: "fits" };
  const lowered = Math.floor(limitMm - heightMm);
  return lowered >= 0 ? { kind: "lowered", bottomMm: lowered, limitMm } : { kind: "tooTall", limitMm };
};

const numberParameter = (parameters: Readonly<Record<string, unknown>>, key: string): number | undefined => {
  const value = parameters[key];
  return typeof value === "number" ? value : undefined;
};

/**
 * IDs of the floor's items above the roof's underside (never clipped, only flagged): openings (doors and windows,
 * along their width on both faces), wall-mounted objects (along their width on their face), floor and overhead
 * objects (stairs: their rise) and lights (at their plan point).
 */
export const itemsAboveRoof = (
  floor: BuildingFloorValue,
  resolveOpeningSize: OpeningSizeResolver,
): readonly string[] => {
  const limit = floorRoofLimit(floor);
  if (limit === null) return [];
  const flagged: string[] = [];
  const probes: HeightProbe[] = [];
  for (const area of floor.areas) {
    const geometry = computeAreaFloorGeometry(area);
    const toFloor = geometry.areaToFloor;
    const wallOf = (id: string): RealWall | undefined =>
      geometry.realWalls.find((wall) => wall.wallId === id);
    for (const wall of area.walls) {
      const real = wallOf(wall.id);
      if (real === undefined) continue;
      for (const opening of wall.objects) {
        const size = resolveOpeningSize(opening, wall, area);
        if (size === null) continue;
        const centre = real.spanMm.fromMm + opening.placement.distanceAlongWallMm;
        const half = size.widthMm / 2;
        const lowest = lowestOver(limit, [
          faceLine(real, "interior", centre - half, centre + half),
          faceLine(real, "exterior", centre - half, centre + half),
        ]);
        if (lowest !== null && opening.placement.bottomMm + size.heightMm > lowest + heightToleranceMm)
          flagged.push(opening.id);
      }
    }
    for (const object of area.objects) {
      const wall =
        object.attachment.host === "wall" && object.attachment.wallId !== undefined
          ? wallOf(object.attachment.wallId)
          : undefined;
      if (wall !== undefined) {
        const centre = wall.spanMm.fromMm + object.positionMm.x;
        const half = (numberParameter(object.parameters, "widthMm") ?? 0) / 2;
        const lowest = lowestOver(limit, [
          faceLine(wall, object.attachment.hostSide ?? "interior", centre - half, centre + half),
        ]);
        const top = object.elevationMm + (numberParameter(object.parameters, "heightMm") ?? 0);
        if (lowest !== null && top > lowest + heightToleranceMm) flagged.push(object.id);
        continue;
      }
      // An overhead object hangs from the area's tallest wall top (the renderer's overhead reference) by its
      // elevation; a stair's top is its rise (Phase 16.14); other objects stand at their elevation.
      const overhead = object.attachment.host === "overhead";
      if (overhead && area.walls.length === 0) continue;
      probes.push({
        id: object.id,
        pointMm: applyAffine(toFloor, object.positionMm),
        topMm: overhead
          ? Math.max(...area.walls.map((candidate) => candidate.heightMm)) - object.elevationMm
          : object.elevationMm +
            (numberParameter(object.parameters, object.floorCut === "stair" ? "totalRiseMm" : "heightMm") ??
              0),
      });
    }
    for (const light of area.lights)
      probes.push({ id: light.id, pointMm: lightRoofProbe(area, light), topMm: light.elevationMm });
  }
  return [...flagged, ...flagsAboveRoof(limit, probes)];
};
