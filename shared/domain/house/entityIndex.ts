// Locates entities in the house document by stable ID (history targets IDs, not array indexes).
import type { AmbientEffectValue } from "../schemas/effects";
import type { ObjectGroupValue } from "../schemas/objectGroup";
import type { WallReliefValue } from "../schemas/wall";
import type { AreaValue, FloorSurfaceValue } from "../schemas/area";
import type { CarpetValue } from "../schemas/carpet";
import type { BuildingFloorValue } from "../schemas/floor";
import type { GuideValue } from "../schemas/guide";
import type { HouseDocument } from "../schemas/house";
import type { AreableInstanceValue, WallableInstanceValue } from "../schemas/instances";
import type { LightGroupValue, LightValue } from "../schemas/light";
import type {
  RoofHoleValue,
  RoofLineValue,
  RoofPointValue,
  RoofValue,
  RoofWindowValue,
} from "../schemas/roof";
import type { ShapeValue } from "../schemas/shapes";
import type { WallValue } from "../schemas/wall";

export type DocumentPath = readonly (string | number)[];

export type EntityRef =
  | Readonly<{ kind: "house"; id: string; path: DocumentPath; value: HouseDocument }>
  | Readonly<{ kind: "floor"; id: string; path: DocumentPath; floorId: string; value: BuildingFloorValue }>
  | Readonly<{
      kind: "area";
      id: string;
      path: DocumentPath;
      floorId: string;
      areaId: string;
      value: AreaValue;
    }>
  | Readonly<{
      kind: "floorSurface";
      id: string;
      path: DocumentPath;
      floorId: string;
      areaId: string;
      value: FloorSurfaceValue;
    }>
  | Readonly<{
      kind: "shape";
      id: string;
      path: DocumentPath;
      floorId: string;
      areaId: string;
      carpetId: string | undefined;
      /** The wall feature (relief) whose group holds this shape, when it is one. */
      reliefId?: string | undefined;
      value: ShapeValue;
    }>
  | Readonly<{
      kind: "carpet";
      id: string;
      path: DocumentPath;
      floorId: string;
      areaId: string;
      value: CarpetValue;
    }>
  | Readonly<{
      kind: "wall";
      id: string;
      path: DocumentPath;
      floorId: string;
      areaId: string;
      value: WallValue;
    }>
  | Readonly<{
      kind: "opening";
      id: string;
      path: DocumentPath;
      floorId: string;
      areaId: string;
      wallId: string;
      value: WallableInstanceValue;
    }>
  | Readonly<{
      kind: "relief";
      id: string;
      path: DocumentPath;
      floorId: string;
      areaId: string;
      wallId: string;
      value: WallReliefValue;
    }>
  | Readonly<{
      kind: "object";
      id: string;
      path: DocumentPath;
      floorId: string;
      areaId: string;
      value: AreableInstanceValue;
    }>
  | Readonly<{
      /** An ambient effect on an object (D24). */
      kind: "effect";
      id: string;
      path: DocumentPath;
      floorId: string;
      areaId: string;
      objectId: string;
      value: AmbientEffectValue;
    }>
  | Readonly<{
      kind: "objectGroup";
      id: string;
      path: DocumentPath;
      floorId: string;
      areaId: string;
      value: ObjectGroupValue;
    }>
  | Readonly<{
      kind: "light";
      id: string;
      path: DocumentPath;
      floorId: string;
      areaId: string;
      value: LightValue;
    }>
  | Readonly<{ kind: "lightGroup"; id: string; path: DocumentPath; floorId: string; value: LightGroupValue }>
  | Readonly<{ kind: "guide"; id: string; path: DocumentPath; floorId: string; value: GuideValue }>
  /** A roof (Phase 19.1) and its points and break lines (selected and edited in the roof's editing level). */
  | Readonly<{ kind: "roof"; id: string; path: DocumentPath; floorId: string; value: RoofValue }>
  | Readonly<{
      kind: "roofPoint";
      id: string;
      path: DocumentPath;
      floorId: string;
      roofId: string;
      value: RoofPointValue;
    }>
  | Readonly<{
      kind: "roofLine";
      id: string;
      path: DocumentPath;
      floorId: string;
      roofId: string;
      value: RoofLineValue;
    }>
  /** A roof's holes and roof windows (Phase 19.3), on its sheet. */
  | Readonly<{
      kind: "roofHole";
      id: string;
      path: DocumentPath;
      floorId: string;
      roofId: string;
      value: RoofHoleValue;
    }>
  | Readonly<{
      kind: "roofWindow";
      id: string;
      path: DocumentPath;
      floorId: string;
      roofId: string;
      value: RoofWindowValue;
    }>;

export type EntityKind = EntityRef["kind"];

/** Builds an ID → entity map for the whole document. Cheap enough to rebuild per document version. */
export const indexEntities = (house: HouseDocument): ReadonlyMap<string, EntityRef> => {
  const map = new Map<string, EntityRef>();
  map.set(house.id, { kind: "house", id: house.id, path: [], value: house });
  house.floors.forEach((floor, floorIndex) => {
    const floorPath = ["floors", floorIndex];
    const floorId = floor.id;
    map.set(floorId, { kind: "floor", id: floorId, path: floorPath, floorId, value: floor });
    floor.lightGroups.forEach((group, index) => {
      map.set(group.id, {
        kind: "lightGroup",
        id: group.id,
        path: [...floorPath, "lightGroups", index],
        floorId,
        value: group,
      });
    });
    floor.guides.forEach((guide, index) => {
      map.set(guide.id, {
        kind: "guide",
        id: guide.id,
        path: [...floorPath, "guides", index],
        floorId,
        value: guide,
      });
    });
    (floor.roofs ?? []).forEach((roof, index) => {
      const roofPath = [...floorPath, "roofs", index];
      map.set(roof.id, { kind: "roof", id: roof.id, path: roofPath, floorId, value: roof });
      roof.points.forEach((point, pointIndex) => {
        map.set(point.id, {
          kind: "roofPoint",
          id: point.id,
          path: [...roofPath, "points", pointIndex],
          floorId,
          roofId: roof.id,
          value: point,
        });
      });
      roof.lines.forEach((line, lineIndex) => {
        map.set(line.id, {
          kind: "roofLine",
          id: line.id,
          path: [...roofPath, "lines", lineIndex],
          floorId,
          roofId: roof.id,
          value: line,
        });
      });
      (roof.holes ?? []).forEach((hole, holeIndex) => {
        map.set(hole.id, {
          kind: "roofHole",
          id: hole.id,
          path: [...roofPath, "holes", holeIndex],
          floorId,
          roofId: roof.id,
          value: hole,
        });
      });
      (roof.windows ?? []).forEach((window, windowIndex) => {
        map.set(window.id, {
          kind: "roofWindow",
          id: window.id,
          path: [...roofPath, "windows", windowIndex],
          floorId,
          roofId: roof.id,
          value: window,
        });
      });
    });
    floor.areas.forEach((area, areaIndex) => {
      const areaPath = [...floorPath, "areas", areaIndex];
      const areaId = area.id;
      map.set(areaId, { kind: "area", id: areaId, path: areaPath, floorId, areaId, value: area });
      const surfacePath = [...areaPath, "floor"];
      map.set(area.floor.id, {
        kind: "floorSurface",
        id: area.floor.id,
        path: surfacePath,
        floorId,
        areaId,
        value: area.floor,
      });
      area.floor.shapes.forEach((shape, index) => {
        map.set(shape.id, {
          kind: "shape",
          id: shape.id,
          path: [...surfacePath, "shapes", index],
          floorId,
          areaId,
          carpetId: undefined,
          value: shape,
        });
      });
      area.floor.carpets.forEach((carpet, carpetIndex) => {
        const carpetPath = [...surfacePath, "carpets", carpetIndex];
        map.set(carpet.id, {
          kind: "carpet",
          id: carpet.id,
          path: carpetPath,
          floorId,
          areaId,
          value: carpet,
        });
        carpet.shapes.forEach((shape, index) => {
          map.set(shape.id, {
            kind: "shape",
            id: shape.id,
            path: [...carpetPath, "shapes", index],
            floorId,
            areaId,
            carpetId: carpet.id,
            value: shape,
          });
        });
      });
      area.walls.forEach((wall, wallIndex) => {
        const wallPath = [...areaPath, "walls", wallIndex];
        map.set(wall.id, { kind: "wall", id: wall.id, path: wallPath, floorId, areaId, value: wall });
        wall.objects.forEach((opening, index) => {
          map.set(opening.id, {
            kind: "opening",
            id: opening.id,
            path: [...wallPath, "objects", index],
            floorId,
            areaId,
            wallId: wall.id,
            value: opening,
          });
        });
        (wall.reliefs ?? []).forEach((relief, index) => {
          map.set(relief.id, {
            kind: "relief",
            id: relief.id,
            path: [...wallPath, "reliefs", index],
            floorId,
            areaId,
            wallId: wall.id,
            value: relief,
          });
          relief.shapes.forEach((shape, shapeIndex) => {
            map.set(shape.id, {
              kind: "shape",
              id: shape.id,
              path: [...wallPath, "reliefs", index, "shapes", shapeIndex],
              floorId,
              areaId,
              carpetId: undefined,
              reliefId: relief.id,
              value: shape,
            });
          });
        });
      });
      area.objects.forEach((object, index) => {
        const objectPath = [...areaPath, "objects", index];
        map.set(object.id, {
          kind: "object",
          id: object.id,
          path: objectPath,
          floorId,
          areaId,
          value: object,
        });
        (object.effects ?? []).forEach((effect, effectIndex) => {
          map.set(effect.id, {
            kind: "effect",
            id: effect.id,
            path: [...objectPath, "effects", effectIndex],
            floorId,
            areaId,
            objectId: object.id,
            value: effect,
          });
        });
      });
      (area.objectGroups ?? []).forEach((group, index) => {
        map.set(group.id, {
          kind: "objectGroup",
          id: group.id,
          path: [...areaPath, "objectGroups", index],
          floorId,
          areaId,
          value: group,
        });
      });
      area.lights.forEach((light, index) => {
        map.set(light.id, {
          kind: "light",
          id: light.id,
          path: [...areaPath, "lights", index],
          floorId,
          areaId,
          value: light,
        });
      });
    });
  });
  return map;
};

/** The floor an entity belongs to, if any. */
export const floorOf = (ref: EntityRef): string | undefined =>
  ref.kind === "house" ? undefined : ref.floorId;

/** The group an object belongs to in its area, if any. */
export const objectGroupOf = (
  house: HouseDocument,
  objectId: string,
): Readonly<{ areaId: string; memberId: string; group: ObjectGroupValue }> | undefined => {
  for (const floor of house.floors)
    for (const area of floor.areas)
      for (const group of area.objectGroups ?? [])
        if (group.memberIds.includes(objectId)) return { areaId: area.id, memberId: objectId, group };
  return undefined;
};
