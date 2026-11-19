// Floors and the whole house in the HA viewer (Phase 16.1, 16.3; owner decisions 2026-11-18;
// spec/home-assistant/viewer-mvp.md#floors-and-the-whole-house). Pure (no DOM), so `npm run ha:conditions` checks it.
//
// A house with more than one floor has three view levels: the whole house (an exterior floor selector), one floor,
// and a room of that floor. Up / Down step through the floors by elevation (floorsByElevation); the whole house sits
// above the top floor, so Up from the top floor goes there and Down from it goes to the top floor. A one-floor house
// shows its floor as before, with no floor controls and no Main view setting.
import { floorsByElevation } from "@shared/domain/house/floorPlacement";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { HaDashboardValue, HaHouseBindingsValue } from "@shared/domain/schemas/homeAssistant";
import { emptyHouseBindings } from "@shared/domain/schemas/homeAssistant";

/** What the viewer shows: the whole house (multi-floor houses only) or one floor. */
export type ViewerView = Readonly<{ kind: "house" }> | Readonly<{ kind: "floor"; floorId: string }>;

/** Which way a floor switch goes: up to a higher floor (or the whole house), or down. */
export type FloorStep = "up" | "down";

type Floors = readonly Pick<BuildingFloorValue, "id" | "positionMm" | "elevationMm">[];

export const wholeHouse: ViewerView = { kind: "house" };

export const floorView = (floorId: string): ViewerView => ({ kind: "floor", floorId });

/** Floor controls, the whole-house view and the Main view setting exist only for houses with several floors. */
export const isMultiFloor = (floors: Floors): boolean => floors.length > 1;

export const sameView = (a: ViewerView | null, b: ViewerView | null): boolean =>
  a === null || b === null
    ? a === b
    : a.kind === b.kind && (a.kind === "house" || (b.kind === "floor" && a.floorId === b.floorId));

/** The house's configured main view (a floor ID), or null for the whole house (the default). */
export const mainViewOf = (dashboard: HaDashboardValue, houseId: string | null): string | null =>
  houseId === null ? null : (dashboard.mainViews?.[houseId] ?? null);

/** The dashboard setting with this house's main view set (a floor ID) or reset to the whole house (null). */
export const withMainView = (
  dashboard: HaDashboardValue,
  houseId: string,
  floorId: string | null,
): HaDashboardValue => {
  const { [houseId]: _previous, ...others } = dashboard.mainViews ?? {};
  const mainViews = floorId === null ? others : { ...others, [houseId]: floorId };
  const { mainViews: _old, ...rest } = dashboard;
  return Object.keys(mainViews).length === 0 ? rest : { ...rest, mainViews };
};

/**
 * The view a house opens on: a one-floor house its floor; a multi-floor house the configured main floor when it
 * still exists, else the whole house (owner: a deleted or missing floor falls back to the whole house). Null for a
 * house without floors.
 */
export const initialView = (floors: Floors, mainFloorId: string | null): ViewerView | null => {
  const first = floors[0];
  if (first === undefined) return null;
  if (!isMultiFloor(floors)) return floorView(first.id);
  return mainFloorId !== null && floors.some((floor) => floor.id === mainFloorId)
    ? floorView(mainFloorId)
    : wholeHouse;
};

/** The view's place in the Up / Down order: floors by elevation from 0, the whole house last; −1 if unknown. */
const rank = (floors: Floors, view: ViewerView): number => {
  const ordered = floorsByElevation(floors);
  return view.kind === "house" ? ordered.length : ordered.findIndex((floor) => floor.id === view.floorId);
};

/**
 * Where Up or Down goes from a view, or null when that button is disabled: Down at the bottom floor, Up in the
 * whole-house view, and both for a one-floor house. Up from the top floor goes to the whole house.
 */
export const stepView = (floors: Floors, view: ViewerView, step: FloorStep): ViewerView | null => {
  if (!isMultiFloor(floors)) return null;
  const ordered = floorsByElevation(floors);
  const at = rank(floors, view);
  if (at < 0) return null;
  const next = step === "up" ? at + 1 : at - 1;
  if (next < 0 || next > ordered.length) return null;
  const floor = ordered[next];
  return floor === undefined ? wholeHouse : floorView(floor.id);
};

/** The direction a switch between two views goes (the whole house counts as above every floor); null if equal. */
export const stepBetween = (floors: Floors, from: ViewerView, to: ViewerView): FloorStep | null => {
  const a = rank(floors, from);
  const b = rank(floors, to);
  return a === b || a < 0 || b < 0 ? null : b > a ? "up" : "down";
};

/**
 * The bindings the live evaluator follows for a view (16.3): only what the shown floor holds, so a floor that is not
 * shown has no HA listeners (lights, objects with their openings, effects, rooms with their presence and bubbles,
 * placed bubbles on its things, and its own presence gate). The whole-house view follows `houseBindings` instead.
 * The full bindings stay with Settings, which edits every floor's.
 */
export const floorBindings = (
  bindings: HaHouseBindingsValue,
  floor: BuildingFloorValue | null,
): HaHouseBindingsValue => {
  if (floor === null) return emptyHouseBindings();
  const areas = new Set(floor.areas.map((area) => area.id));
  const lights = new Set(floor.areas.flatMap((area) => area.lights.map((light) => light.id)));
  const objects = new Set(
    floor.areas.flatMap((area) => [
      ...area.objects.map((object) => object.id),
      ...area.walls.flatMap((wall) => wall.objects.map((opening) => opening.id)),
    ]),
  );
  const effects = new Set(
    floor.areas.flatMap((area) =>
      area.objects.flatMap((object) => (object.effects ?? []).map((effect) => effect.id)),
    ),
  );
  const pick = <T>(entries: Readonly<Record<string, T>>, ids: ReadonlySet<string>): Record<string, T> =>
    Object.fromEntries(Object.entries(entries).filter(([id]) => ids.has(id)));
  const placed = Object.fromEntries(
    Object.entries(bindings.bubbles.placed).filter(([, bubble]) => {
      const anchor = bubble.anchor;
      return anchor.kind === "light"
        ? lights.has(anchor.lightId)
        : anchor.kind === "object"
          ? objects.has(anchor.objectId)
          : areas.has(anchor.areaId);
    }),
  );
  const gate = bindings.floors?.[floor.id];
  return {
    lights: pick(bindings.lights, lights),
    objects: pick(bindings.objects, objects),
    effects: pick(bindings.effects, effects),
    areas: pick(bindings.areas, areas),
    bubbles: { rooms: pick(bindings.bubbles.rooms, areas), placed },
    ...(gate === undefined ? {} : { floors: { [floor.id]: gate } }),
  };
};

/**
 * The bindings the whole-house view follows (Phase 18.1, owner: "display all elements"): what it draws live, the
 * lights of every floor (lamps show their HA state) and the objects, doors and windows of every floor (their live
 * state parameters, 9.7). Nothing it does not draw or answer: no effects (not drawn there), rooms, bubbles, presence
 * sweeps or floor gates; it takes no object taps, so an object's actions need no listener. The evaluator subscribes
 * once per entity, so the cost is the number of distinct entities bound to the house's lights and things.
 */
export const houseBindings = (
  bindings: HaHouseBindingsValue,
  floors: readonly BuildingFloorValue[],
): HaHouseBindingsValue => {
  const lights = new Set(
    floors.flatMap((floor) => floor.areas.flatMap((area) => area.lights.map((light) => light.id))),
  );
  const objects = new Set(
    floors.flatMap((floor) =>
      floor.areas.flatMap((area) => [
        ...area.objects.map((object) => object.id),
        ...area.walls.flatMap((wall) => wall.objects.map((opening) => opening.id)),
      ]),
    ),
  );
  const pick = <T>(entries: Readonly<Record<string, T>>, ids: ReadonlySet<string>): Record<string, T> =>
    Object.fromEntries(Object.entries(entries).filter(([id]) => ids.has(id)));
  return {
    ...emptyHouseBindings(),
    lights: pick(bindings.lights, lights),
    objects: pick(bindings.objects, objects),
  };
};
