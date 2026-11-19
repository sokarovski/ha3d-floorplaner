// Area commands: add (Area N at the view center), transform, delete, duplicate.
import { computeAreaFloorGeometry } from "../../geometry/areaGeometry";
import { realFloorRegion } from "../../geometry/realFloor";
import { regionBounds } from "../../geometry/region";
import type { Bounds } from "../../geometry/region";
import { createArea } from "../house/defaults";
import { createPathway, createYard, groundFloorOf, isYard, yardDefaults } from "../house/yards";
import { collectIds } from "../house/integrity";
import { createId } from "../ids";
import type { AreaValue } from "../schemas/area";
import type { HouseDocument } from "../schemas/house";
import { defaultNameMaxLength } from "../schemas/values";
import type { Vector2 } from "../schemas/values";
import type { ShapeValue } from "../schemas/shapes";
import { defineCommand } from "./command";
import type { Command } from "./command";
import { nextFreeName } from "./naming";

/** A complete measured room is one atomic operation, including its initial footprint. */
export const addAreaWithShapeCommand = (
  floorId: string,
  name: string,
  positionMm: Vector2,
  rotationDeg: number,
  shape: ShapeValue,
): Readonly<{ command: Command; areaId: string; floorSurfaceId: string }> => {
  const area = createArea(name, { ...positionMm });
  area.rotationDeg = ((rotationDeg % 360) + 360) % 360;
  area.floor.shapes.push(structuredClone(shape));
  return {
    areaId: area.id,
    floorSurfaceId: area.floor.id,
    command: defineCommand(`Create ${name}`, floorId, (draft) => {
      const floor = draft.floors.find((candidate) => candidate.id === floorId);
      if (floor === undefined) return "The floor no longer exists.";
      floor.areas.push(structuredClone(area));
      return undefined;
    }),
  };
};

export const addAreaCommand = (
  house: HouseDocument,
  floorId: string,
  centerMm: Vector2,
): Readonly<{ command: Command; areaId: string }> => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  const area = createArea(nextFreeName(floor?.areas.map((candidate) => candidate.name) ?? [], "Area"), {
    x: Math.round(centerMm.x),
    y: Math.round(centerMm.y),
  });
  return {
    areaId: area.id,
    command: defineCommand(`Add ${area.name}`, floorId, (draft) => {
      const target = draft.floors.find((candidate) => candidate.id === floorId);
      if (target === undefined) return "The floor no longer exists.";
      target.areas.push(area);
      return undefined;
    }),
  };
};

/**
 * Add yard (Phase 17.2, spec/builder/features/yards.md#adding-a-yard): only on the ground floor. The new yard is an
 * 8 × 6 m rectangle of Lawn, placed against the south (−y) side of everything on the floor (the RealFloor solids
 * of its rooms and yards, walls included), centred on it. When the floor's southmost area is a room, the yard's
 * north edge lies against the house and gets no fence; otherwise (another yard is further south) it is fenced all
 * round. On a floor without areas it is centred on `centerMm` with fences all round.
 */
export const addYardCommand = (
  house: HouseDocument,
  floorId: string,
  centerMm: Vector2,
): Readonly<{ command: Command; areaId: string }> => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  const boundsOf = (areas: readonly AreaValue[]): Bounds | null => {
    const polygons = areas.flatMap((area) => realFloorRegion(computeAreaFloorGeometry(area)).polygons);
    return polygons.length === 0 ? null : regionBounds({ polygons });
  };
  const all = boundsOf(floor?.areas ?? []);
  const rooms = boundsOf(floor?.areas.filter((area) => !isYard(area)) ?? []);
  const name = nextFreeName(floor?.areas.map((candidate) => candidate.name) ?? [], "Yard");
  const againstHouse = all !== null && rooms !== null && rooms.minY <= all.minY + 1;
  const area =
    all === null
      ? createYard(name, centerMm)
      : createYard(
          name,
          { x: (all.minX + all.maxX) / 2, y: all.minY - yardDefaults.depthMm / 2 },
          againstHouse ? { openEdges: ["top"] } : {},
        );
  return {
    areaId: area.id,
    command: defineCommand(`Add ${area.name}`, floorId, (draft) => {
      const target = draft.floors.find((candidate) => candidate.id === floorId);
      if (target === undefined) return "The floor no longer exists.";
      if (groundFloorOf(draft.floors)?.id !== floorId) return "Yards are added on the ground floor only.";
      target.areas.push(area);
      return undefined;
    }),
  };
};

/** Add pathway (Phase 17.2): a carpet of built-in Paving in a yard, `Path N`, at `centerMm` (area frame). */
export const addPathwayCommand = (
  house: HouseDocument,
  floorId: string,
  areaId: string,
  centerMm: Vector2,
): Readonly<{ command: Command; carpetId: string }> => {
  const area = house.floors
    .find((candidate) => candidate.id === floorId)
    ?.areas.find((candidate) => candidate.id === areaId);
  const pathway = createPathway(
    nextFreeName(area?.floor.carpets.map((candidate) => candidate.name) ?? [], "Path"),
    centerMm,
  );
  return {
    carpetId: pathway.id,
    command: defineCommand(`Add ${pathway.name}`, floorId, (draft) => {
      const target = draft.floors
        .find((candidate) => candidate.id === floorId)
        ?.areas.find((candidate) => candidate.id === areaId);
      if (target === undefined) return "The area no longer exists.";
      if (!isYard(target)) return "Pathways are added in yards only.";
      target.floor.carpets.push(pathway);
      return undefined;
    }),
  };
};

export const setAreaTransformCommand = (
  floorId: string,
  areaId: string,
  positionMm: Vector2,
  rotationDeg: number,
  label = "Move area",
): Command =>
  defineCommand(label, floorId, (draft) => {
    const area = draft.floors
      .find((floor) => floor.id === floorId)
      ?.areas.find((candidate) => candidate.id === areaId);
    if (area === undefined) return "The area no longer exists.";
    area.positionMm = { x: positionMm.x, y: positionMm.y };
    area.rotationDeg = ((rotationDeg % 360) + 360) % 360;
    return undefined;
  });

/**
 * Gives every entity in a copied area a fresh ID and remaps its internal references through the old → new map:
 * walls → source shapes/vertices, wall-hosted objects and wall-mounted lights → walls, object groups → members.
 * Undefined when an ID was missed (a field added to the schema but not here): the copy would share it with its source.
 */
const reidentifyArea = (area: AreaValue): AreaValue | undefined => {
  const ids = new Map<string, string>();
  const fresh = (old: string, prefix: Parameters<typeof createId>[0]): string => {
    const next = createId(prefix);
    ids.set(old, next);
    return next;
  };
  const remap = (old: string): string => ids.get(old) ?? old;
  const reidentifyShapes = (shapes: ShapeValue[]): void => {
    for (const shape of shapes) {
      shape.id = fresh(shape.id, "s");
      if (shape.type === "polygon") for (const vertex of shape.vertices) vertex.id = fresh(vertex.id, "v");
    }
  };
  const copy = structuredClone(area);
  copy.id = fresh(area.id, "a");
  copy.floor.id = fresh(area.floor.id, "fs");
  reidentifyShapes(copy.floor.shapes);
  for (const carpet of copy.floor.carpets) {
    carpet.id = fresh(carpet.id, "c");
    reidentifyShapes(carpet.shapes);
  }
  for (const wall of copy.walls) {
    wall.id = fresh(wall.id, "w");
    wall.sourceEdge = {
      shapeId: remap(wall.sourceEdge.shapeId),
      edge: wall.sourceEdge.edge.split(">").map(remap).join(">"),
    };
    for (const opening of wall.objects) opening.id = fresh(opening.id, "o");
    for (const relief of wall.reliefs ?? []) {
      relief.id = fresh(relief.id, "wr");
      reidentifyShapes(relief.shapes);
    }
  }
  for (const object of copy.objects) {
    object.id = fresh(object.id, "o");
    for (const effect of object.effects ?? []) effect.id = fresh(effect.id, "fx");
    const wallId = object.attachment.wallId;
    if (wallId !== undefined) object.attachment.wallId = remap(wallId);
  }
  for (const light of copy.lights) {
    light.id = fresh(light.id, "l");
    if (light.wallId !== undefined) light.wallId = remap(light.wallId);
  }
  for (const group of copy.objectGroups ?? []) {
    group.id = fresh(group.id, "og");
    group.memberIds = group.memberIds.map(remap);
  }
  const sourceIds = new Set(collectIds(area).map((entry) => entry.id));
  return collectIds(copy).some((entry) => sourceIds.has(entry.id)) ? undefined : copy;
};

export const duplicateAreaCommand = (
  house: HouseDocument,
  floorId: string,
  areaId: string,
): Readonly<{ command: Command; newAreaId: string | undefined }> => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  const source = floor?.areas.find((candidate) => candidate.id === areaId);
  if (floor === undefined || source === undefined)
    return {
      newAreaId: undefined,
      command: defineCommand("Duplicate area", floorId, () => "The area no longer exists."),
    };
  const copy = reidentifyArea(source);
  if (copy === undefined)
    return {
      newAreaId: undefined,
      command: defineCommand("Duplicate area", floorId, () => "The area could not be copied with fresh IDs."),
    };
  // "<name> copy N" stays within the 120-character Name limit: the base is shortened (by code points), never N.
  const base = Array.from(source.name)
    .slice(0, defaultNameMaxLength - " copy 9999".length)
    .join("")
    .trimEnd();
  copy.name = nextFreeName(
    floor.areas.map((candidate) => candidate.name),
    `${base} copy`,
  );
  copy.positionMm = { x: source.positionMm.x + 500, y: source.positionMm.y - 500 };
  return {
    newAreaId: copy.id,
    command: defineCommand(`Duplicate ${source.name}`, floorId, (draft) => {
      draft.floors.find((candidate) => candidate.id === floorId)?.areas.push(copy);
      return undefined;
    }),
  };
};
