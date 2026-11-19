// Object groups: group, ungroup, and move or turn a set of an area's objects, lights, and carpets together
// (spec/builder/features/object-groups.md; lights and carpets may join since Phase 7.3).
import type { Draft } from "immer";
import { rotateVec } from "../../geometry/vector";
import type { Vec2 } from "../../geometry/vector";
import { createId } from "../ids";
import type { AreaValue } from "../schemas/area";
import type { HouseDocument } from "../schemas/house";
import { defineCommand } from "./command";
import type { Command } from "./command";
import { nextFreeName } from "./naming";

const findArea = (
  draft: Draft<HouseDocument>,
  floorId: string,
  areaId: string,
): Draft<AreaValue> | undefined =>
  draft.floors.find((floor) => floor.id === floorId)?.areas.find((area) => area.id === areaId);

/** The things of an area a group may hold: floor or overhead objects, lights, and carpets. */
type Groupable = Readonly<{ id: string; positionMm: Vec2; rotationDeg: number }>;

const groupables = (area: Draft<AreaValue>): Draft<Groupable>[] => [
  ...area.objects,
  ...area.lights,
  ...area.floor.carpets,
];

/** IDs an area's group may list (objects, lights, carpets). */
export const groupableIds = (area: AreaValue): ReadonlySet<string> =>
  new Set([...area.objects, ...area.lights, ...area.floor.carpets].map((item) => item.id));

/** Drops members that no longer exist and groups left with fewer than two. Run after anything that deletes objects. */
export const pruneObjectGroups = (draft: Draft<HouseDocument>): void => {
  for (const floor of draft.floors)
    for (const area of floor.areas) {
      if (area.objectGroups === undefined) continue;
      const ids = new Set(groupables(area).map((item) => item.id));
      for (const group of area.objectGroups) group.memberIds = group.memberIds.filter((id) => ids.has(id));
      area.objectGroups = area.objectGroups.filter((group) => group.memberIds.length >= 2);
      if (area.objectGroups.length === 0) delete area.objectGroups;
    }
};

const heading = (degrees: number): number => ((degrees % 360) + 360) % 360;

export const groupObjectsCommand = (
  floorId: string,
  areaId: string,
  memberIds: readonly string[],
): Readonly<{ command: Command; groupId: string }> => {
  const groupId = createId("og");
  return {
    groupId,
    command: defineCommand("Group objects", floorId, (draft) => {
      const area = findArea(draft, floorId, areaId);
      if (area === undefined) return "The area no longer exists.";
      const ids = [...new Set(memberIds)];
      if (ids.length < 2) return "Select at least two things to group.";
      const allowed = new Set(groupables(area).map((item) => item.id));
      if (!ids.every((id) => allowed.has(id)))
        return "Only objects, lights, and carpets of one room can be grouped.";
      // An object belongs to one group: grouping again takes it out of its old group.
      for (const group of area.objectGroups ?? [])
        group.memberIds = group.memberIds.filter((id) => !ids.includes(id));
      area.objectGroups = [
        ...(area.objectGroups ?? []),
        {
          id: groupId,
          name: nextFreeName(
            (area.objectGroups ?? []).map((group) => group.name),
            "Group",
          ),
          memberIds: ids,
        },
      ];
      pruneObjectGroups(draft);
      return undefined;
    }),
  };
};

export const ungroupObjectsCommand = (floorId: string, areaId: string, groupId: string): Command =>
  defineCommand("Ungroup objects", floorId, (draft) => {
    const area = findArea(draft, floorId, areaId);
    if (area?.objectGroups?.some((group) => group.id === groupId) !== true)
      return "The group no longer exists.";
    area.objectGroups = area.objectGroups.filter((group) => group.id !== groupId);
    if (area.objectGroups.length === 0) delete area.objectGroups;
    return undefined;
  });

/** Moves the members by the same offset (room-local mm). */
export const moveObjectsCommand = (
  floorId: string,
  areaId: string,
  memberIds: readonly string[],
  delta: Vec2,
  label = "Move group",
): Command =>
  defineCommand(label, floorId, (draft) => {
    const area = findArea(draft, floorId, areaId);
    if (area === undefined) return "The area no longer exists.";
    for (const item of groupables(area))
      if (memberIds.includes(item.id)) {
        item.positionMm.x = Math.round((item.positionMm.x + delta.x) * 10) / 10;
        item.positionMm.y = Math.round((item.positionMm.y + delta.y) * 10) / 10;
      }
    return undefined;
  });

/** Turns the members counterclockwise about a room-local pivot: positions swing round it and each object turns too. */
export const rotateObjectsCommand = (
  floorId: string,
  areaId: string,
  memberIds: readonly string[],
  pivot: Vec2,
  degrees: number,
  label = "Rotate group",
): Command =>
  defineCommand(label, floorId, (draft) => {
    const area = findArea(draft, floorId, areaId);
    if (area === undefined) return "The area no longer exists.";
    for (const item of groupables(area))
      if (memberIds.includes(item.id)) {
        const turned = rotateVec(
          { x: item.positionMm.x - pivot.x, y: item.positionMm.y - pivot.y },
          (degrees * Math.PI) / 180,
        );
        item.positionMm.x = Math.round((pivot.x + turned.x) * 10) / 10;
        item.positionMm.y = Math.round((pivot.y + turned.y) * 10) / 10;
        item.rotationDeg = heading(item.rotationDeg + degrees);
      }
    return undefined;
  });
