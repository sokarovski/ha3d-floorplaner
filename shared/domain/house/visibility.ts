// Hide and Hidden (Phase 7.5, P4/P5; spec/builder/model.md#hide-and-hidden): what of a floor is drawn.
// One rule for every front end: the builder viewport passes its session-hidden IDs and the Show hidden toggle;
// the HA viewer and exports pass `viewerVisibility` (no session hides, saved-hidden things never drawn).
//
// - Off (not drawn, not picked, not snapped to): session-hidden, or saved `hidden` while Show hidden is off.
//   An off area drops with everything in it (its walls too, so shared walls are derived as if it were not
//   there); an off wall, wall feature, object, or carpet is left out; an off object group leaves out its members.
//   An off light stays in the floor because it keeps shining: only its fixture and pin are concealed.
// - Ghosted (drawn faded, pickable): saved `hidden` while Show hidden is on, and everything inside it.
// Persisted data is never changed: the result is a derived floor, cached per floor and rule.
import { DraftSafeWeakMap } from "../../geometry/draftSafeWeakMap";
import type { AreaValue } from "../schemas/area";
import type { BuildingFloorValue } from "../schemas/floor";
import type { HouseDocument } from "../schemas/house";

export type VisibilityRule = Readonly<{
  /** Session-only Hide (never saved). */
  hiddenIds: ReadonlySet<string>;
  /** Show hidden: saved-hidden things drawn ghosted instead of left out. */
  showHidden: boolean;
}>;

/** The HA viewer and exports: no session hides, and saved-hidden things are never drawn. */
export const viewerVisibility: VisibilityRule = { hiddenIds: new Set(), showHidden: false };

export type FloorView = Readonly<{
  /** The floor as drawn: off things removed (off lights kept, see `concealedLightIds`). */
  floor: BuildingFloorValue;
  /** `floor` without the ghosted walls: the walls drawn solid (the same object when nothing is ghosted). */
  solidFloor: BuildingFloorValue;
  /** Only the ghosted walls (their areas with just those walls), drawn as one faded layer; null when none. */
  ghostWalls: BuildingFloorValue | null;
  /** Entities drawn ghosted: areas, walls, wall features, carpets, objects (stairs included), openings, lights. */
  ghostIds: ReadonlySet<string>;
  /** Off lights: they still shine, but their fixture and pin are not drawn or picked. */
  concealedLightIds: ReadonlySet<string>;
  /** Every entity of the floor that is not drawn (off), including everything inside an off area or group. */
  offIds: ReadonlySet<string>;
}>;

/** The kinds Hide and Hidden apply to (P5). */
export const hideableKinds = ["area", "wall", "relief", "object", "objectGroup", "carpet", "light"] as const;
export type HideableKind = (typeof hideableKinds)[number];

export const isHideableKind = (kind: string): kind is HideableKind =>
  hideableKinds.some((candidate) => candidate === kind);

type Flagged = Readonly<{ id: string; hidden?: boolean }>;

const ruleKey = (rule: VisibilityRule): string =>
  `${rule.showHidden ? "show" : "hide"}|${[...rule.hiddenIds].sort().join(",")}`;

const cache = new DraftSafeWeakMap<BuildingFloorValue, Readonly<{ key: string; view: FloorView }>>();
const areaCache = new DraftSafeWeakMap<AreaValue, Readonly<{ key: string; area: AreaValue }>>();

/** Every hideable ID in an area (for its cache key and its off set). */
const areaEntityIds = (area: AreaValue): string[] => [
  area.id,
  area.floor.id,
  ...area.floor.carpets.map((carpet) => carpet.id),
  ...area.walls.flatMap((wall) => [
    wall.id,
    ...wall.objects.map((opening) => opening.id),
    ...(wall.reliefs ?? []).map((relief) => relief.id),
  ]),
  ...area.objects.map((object) => object.id),
  ...(area.objectGroups ?? []).map((group) => group.id),
  ...area.lights.map((light) => light.id),
];

const hasSavedHidden = (area: AreaValue): boolean =>
  area.hidden === true ||
  area.floor.carpets.some((carpet) => carpet.hidden === true) ||
  area.walls.some(
    (wall) => wall.hidden === true || (wall.reliefs ?? []).some((relief) => relief.hidden === true),
  ) ||
  area.objects.some((object) => object.hidden === true) ||
  (area.objectGroups ?? []).some((group) => group.hidden === true) ||
  area.lights.some((light) => light.hidden === true);

/** True when something on the floor is saved Hidden (the builder offers Show hidden then). */
export const floorHasSavedHidden = (floor: BuildingFloorValue): boolean => floor.areas.some(hasSavedHidden);

/** The floor as drawn under `rule` (see the file comment); cached per floor and rule. */
export const floorView = (floor: BuildingFloorValue, rule: VisibilityRule): FloorView => {
  const key = ruleKey(rule);
  const cached = cache.get(floor);
  if (cached?.key === key) return cached.view;
  const isOff = (entity: Flagged): boolean =>
    rule.hiddenIds.has(entity.id) || (entity.hidden === true && !rule.showHidden);
  const isGhost = (entity: Flagged): boolean => entity.hidden === true && rule.showHidden;
  const ghostIds = new Set<string>();
  const concealedLightIds = new Set<string>();
  const offIds = new Set<string>();
  const ghostWallIds = new Set<string>();
  const areas: AreaValue[] = [];
  let changed = false;
  for (const area of floor.areas) {
    if (isOff(area)) {
      changed = true;
      for (const id of areaEntityIds(area)) offIds.add(id);
      continue;
    }
    const touched = hasSavedHidden(area) || areaEntityIds(area).some((id) => rule.hiddenIds.has(id));
    if (!touched) {
      areas.push(area);
      continue;
    }
    const areaGhost = isGhost(area);
    const offMembers = new Set<string>();
    const ghostMembers = new Set<string>();
    for (const group of area.objectGroups ?? []) {
      if (isOff(group)) {
        offIds.add(group.id);
        for (const id of group.memberIds) offMembers.add(id);
      } else if (areaGhost || isGhost(group)) {
        ghostIds.add(group.id);
        for (const id of group.memberIds) ghostMembers.add(id);
      }
    }
    const shown = <T extends Flagged>(items: readonly T[]): T[] =>
      items.filter((item) => {
        const off = isOff(item) || offMembers.has(item.id);
        if (off) offIds.add(item.id);
        else if (areaGhost || isGhost(item) || ghostMembers.has(item.id)) ghostIds.add(item.id);
        return !off;
      });
    if (areaGhost) {
      ghostIds.add(area.id);
      ghostIds.add(area.floor.id);
    }
    const carpets = shown(area.floor.carpets);
    const walls = area.walls
      .filter((wall) => {
        if (!isOff(wall)) return true;
        offIds.add(wall.id);
        for (const opening of wall.objects) offIds.add(opening.id);
        for (const relief of wall.reliefs ?? []) offIds.add(relief.id);
        return false;
      })
      .map((wall) => {
        const wallGhost = areaGhost || isGhost(wall);
        if (wallGhost) {
          ghostWallIds.add(wall.id);
          ghostIds.add(wall.id);
          for (const opening of wall.objects) ghostIds.add(opening.id);
        }
        const reliefs = wall.reliefs;
        if (reliefs === undefined) return wall;
        const kept = reliefs.filter((relief) => {
          const off = isOff(relief);
          if (off) offIds.add(relief.id);
          else if (wallGhost || isGhost(relief)) ghostIds.add(relief.id);
          return !off;
        });
        return kept.length === reliefs.length ? wall : { ...wall, reliefs: kept };
      });
    // Objects mounted on an off or ghosted wall go with it (they would lose their host otherwise).
    for (const object of area.objects)
      if (
        object.attachment.host === "wall" &&
        object.attachment.wallId !== undefined &&
        offIds.has(object.attachment.wallId)
      )
        offMembers.add(object.id);
      else if (
        object.attachment.host === "wall" &&
        object.attachment.wallId !== undefined &&
        ghostWallIds.has(object.attachment.wallId)
      )
        ghostMembers.add(object.id);
    const objects = shown(area.objects);
    for (const light of area.lights) {
      if (isOff(light) || offMembers.has(light.id)) {
        concealedLightIds.add(light.id);
        offIds.add(light.id);
      } else if (areaGhost || isGhost(light) || ghostMembers.has(light.id)) ghostIds.add(light.id);
    }
    const same =
      carpets.length === area.floor.carpets.length &&
      objects.length === area.objects.length &&
      walls.length === area.walls.length &&
      walls.every((wall, index) => wall === area.walls[index]);
    if (same) {
      areas.push(area);
      continue;
    }
    changed = true;
    // Keep the derived area's identity while the rule and the area stay the same (renderers diff by identity).
    const previous = areaCache.get(area);
    if (previous?.key === key) {
      areas.push(previous.area);
      continue;
    }
    const next: AreaValue = { ...area, floor: { ...area.floor, carpets }, objects, walls };
    areaCache.set(area, { key, area: next });
    areas.push(next);
  }
  const drawn: BuildingFloorValue = changed ? { ...floor, areas } : floor;
  let solidFloor = drawn;
  let ghostWalls: BuildingFloorValue | null = null;
  if (ghostWallIds.size > 0) {
    solidFloor = {
      ...drawn,
      areas: drawn.areas.map((area) =>
        area.walls.some((wall) => ghostWallIds.has(wall.id))
          ? { ...area, walls: area.walls.filter((wall) => !ghostWallIds.has(wall.id)) }
          : area,
      ),
    };
    ghostWalls = {
      ...drawn,
      areas: drawn.areas
        .filter((area) => area.walls.some((wall) => ghostWallIds.has(wall.id)))
        .map((area) => ({ ...area, walls: area.walls.filter((wall) => ghostWallIds.has(wall.id)) })),
    };
  }
  const view: FloorView = { floor: drawn, solidFloor, ghostWalls, ghostIds, concealedLightIds, offIds };
  cache.set(floor, { key, view });
  return view;
};

/** The house with one floor replaced by its drawn view (the same house when nothing is left out). */
export const houseWithFloor = (house: HouseDocument, floor: BuildingFloorValue): HouseDocument => {
  const index = house.floors.findIndex((candidate) => candidate.id === floor.id);
  if (index < 0 || house.floors[index] === floor) return house;
  return { ...house, floors: house.floors.map((candidate, at) => (at === index ? floor : candidate)) };
};
