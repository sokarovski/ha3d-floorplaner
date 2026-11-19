// The viewer's ordered pick pipeline (Phase 8.1): a tap resolves through stages in a fixed order, and the first
// stage that claims it wins: bubble (8.5) → light → object (8.3) → room. Bubbles and object actions do not exist
// yet; their stages slot in before and after the light stage. The room stage always answers last: the nearest
// surface's room (a floor, carpet, object, or opening in an `area:<id>` group, or a wall's interior face by
// RealAllWalls face provenance), else the nearest room hit volume along the ray (roomVolumes.ts), so a tap above
// a far room, or on an exterior wall, still opens a room.
import type { Intersection, Object3D } from "three";
import type { AreaValue } from "@shared/domain/schemas/area";
import { computeAreaFloorGeometry } from "@shared/geometry/areaGeometry";
import type { PickHit } from "../../src/renderer/runtimeTypes";
import type { PlanRay, RoomVolume } from "./roomVolumes";
import { nearestVolume } from "./roomVolumes";

export type ViewerPick =
  | Readonly<{ kind: "light"; lightId: string }>
  | Readonly<{ kind: "object"; objectId: string }>
  | Readonly<{ kind: "room"; areaId: string }>;

export type PickInput = Readonly<{
  /** Drawn surfaces under the pointer, nearest first, without those the cutaway removed. */
  hits: readonly Intersection[];
  /** The pointer ray in plan mm. */
  ray: PlanRay;
}>;

export type PickStage = (input: PickInput) => ViewerPick | null;

export const runPickStages = (stages: readonly PickStage[], input: PickInput): ViewerPick | null => {
  for (const stage of stages) {
    const pick = stage(input);
    if (pick !== null) return pick;
  }
  return null;
};

/** Volumes extend this far above the highest wall, so a tap on a wall top still lands inside (mm). */
const volumeHeadroomMm = 50;
/** The volume height of an area without walls (mm, as the instance layer's overhead reference). */
const wallessHeightMm = 2500;

/** One hit volume per area: its floor shape extruded from the floor to its highest wall. */
export const roomVolumes = (areas: readonly AreaValue[]): RoomVolume[] =>
  areas.flatMap((area) => {
    const region = computeAreaFloorGeometry(area).floorShape;
    if (region.polygons.length === 0) return [];
    const topMm =
      (area.walls.length === 0 ? wallessHeightMm : Math.max(...area.walls.map((wall) => wall.heightMm))) +
      volumeHeadroomMm;
    return [{ areaId: area.id, region, bottomMm: 0, topMm }];
  });

const ancestorId = (object: Object3D, pattern: RegExp): string | null => {
  for (let current: Object3D | null = object; current !== null; current = current.parent) {
    const id = pattern.exec(current.name)?.[1];
    if (id !== undefined) return id;
  }
  return null;
};

/** Lights: the nearest surface belongs to a light's fixture (or emitter). */
export const lightStage =
  (lightIds: ReadonlySet<string>): PickStage =>
  (input) => {
    const hit = input.hits[0];
    if (hit === undefined) return null;
    const id = ancestorId(hit.object, /^(?:instance|light):(.+)$/);
    return id !== null && lightIds.has(id) ? { kind: "light", lightId: id } : null;
  };

/** Objects (8.0 Edit mode, 8.3 actions): the nearest surface belongs to a placed object (`instance:<id>`). */
export const objectStage =
  (objectIds: ReadonlySet<string>): PickStage =>
  (input) => {
    const hit = input.hits[0];
    if (hit === undefined) return null;
    const id = ancestorId(hit.object, /^instance:(.+)$/);
    return id !== null && objectIds.has(id) ? { kind: "object", objectId: id } : null;
  };

/**
 * Rooms: the nearest surface's room, else the nearest volume. `wallPick` resolves a hit on a wall layer through
 * the floor scene's pick targets (face provenance); only an interior face names its room directly, other wall
 * faces (exterior, ends, tops) fall to the volumes, which contain the walls of their room.
 */
export const roomStage =
  (volumes: readonly RoomVolume[], wallPick: (hit: Intersection) => PickHit | null): PickStage =>
  (input) => {
    const hit = input.hits[0];
    if (hit !== undefined) {
      const wall = wallPick(hit);
      if (wall?.kind === "wall") {
        if (wall.side === "interior") return { kind: "room", areaId: wall.areaId };
      } else {
        const areaId = ancestorId(hit.object, /^area:(.+)$/);
        if (areaId !== null) return { kind: "room", areaId };
      }
    }
    const volume = nearestVolume(volumes, input.ray);
    return volume === null ? null : { kind: "room", areaId: volume.areaId };
  };
