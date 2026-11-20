// Setup HA's entities (Phase 21, the dev harness's fake HA): entities added or changed in the Setup HA screen,
// stored in this browser (localStorage `homeplan.fakeHa`), laid over the demo home of fakeHome.ts. An entity edited
// there replaces the demo one (it then keeps its stored state; on/off domains still toggle); a deleted demo entity
// is hidden; Reset forgets everything. Areas are the room names the viewer matches room cards and suggestions by.
import type { HaAreaRegistryEntry, HaEntityRegistryEntry } from "@shared/domain/homeAssistant/suggestions";
import type { FakeEntity, FakeHome } from "./fakeHome";
import type { FakeDashboard } from "./fakeHaHost";
import { dashboardView, demoDashboard, tileCard } from "./fakeHaHost";

/** One stored entity: its state, attributes (friendly_name among them) and area (a room name), or deleted. */
export type StoredEntity = Readonly<{
  state: string;
  attributes: Readonly<Record<string, unknown>>;
  area: string | null;
  deleted?: boolean;
}>;

type Stored = Readonly<{ version: 1; entities: Readonly<Record<string, StoredEntity>> }>;

const storageKey = "homeplan.fakeHa";
const empty: Stored = { version: 1, entities: {} };

/** Domains whose entities turn on and off from a tap (a stored one toggles like the demo's). */
export const onOffDomains: ReadonlySet<string> = new Set([
  "light",
  "switch",
  "fan",
  "input_boolean",
  "binary_sensor",
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const read = (): Stored => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.entities)) return empty;
    const entities: Record<string, StoredEntity> = {};
    for (const [entityId, value] of Object.entries(parsed.entities)) {
      if (!isRecord(value) || typeof value.state !== "string" || !isRecord(value.attributes)) continue;
      entities[entityId] = {
        state: value.state,
        attributes: value.attributes,
        area: typeof value.area === "string" ? value.area : null,
        ...(value.deleted === true ? { deleted: true } : {}),
      };
    }
    return { version: 1, entities };
  } catch {
    return empty;
  }
};

const write = (stored: Stored): void => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(stored));
  } catch {
    // Storage blocked: the change lasts until the page reloads.
  }
};

/** An area's registry ID from its name (stable, so the same name is the same area). */
const areaIdOf = (name: string): string => `area_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

export type FakeHaStore = Readonly<{
  /** The demo home with the stored entities over it. */
  home: () => FakeHome;
  /** The demo dashboard, plus a tab of tiles for every other area that has entities. */
  dashboard: () => FakeDashboard;
  /** Every entity now (demo and stored), by ID, with its area name. */
  list: () => readonly Readonly<{
    entityId: string;
    entity: FakeEntity;
    area: string | null;
    stored: boolean;
  }>[];
  /** The room names in use (demo areas and stored ones). */
  areaNames: () => readonly string[];
  save: (entityId: string, entity: StoredEntity) => void;
  remove: (entityId: string) => void;
  reset: () => void;
}>;

export const createFakeHaStore = (base: FakeHome): FakeHaStore => {
  let stored = read();
  const now = (): string => new Date().toISOString();
  const asEntity = (entityId: string, value: StoredEntity): FakeEntity => ({
    entity_id: entityId,
    state: value.state,
    attributes: value.attributes,
    last_changed: now(),
    last_updated: now(),
    context: { id: "", parent_id: null, user_id: null },
  });
  // Stored entities keep their object until they change, as HA does.
  const cache = new Map<string, Readonly<{ source: StoredEntity; entity: FakeEntity }>>();
  const entityOf = (entityId: string, value: StoredEntity): FakeEntity => {
    const hit = cache.get(entityId);
    if (hit?.source === value) return hit.entity;
    const entity = asEntity(entityId, value);
    cache.set(entityId, { source: value, entity });
    return entity;
  };
  const demoAreaName = (entityId: string): string | null => {
    const areaId = base.entities[entityId]?.area_id;
    return areaId === undefined || areaId === null ? null : (base.areas[areaId]?.name ?? null);
  };
  const states = (): Readonly<Record<string, FakeEntity>> => {
    const merged: Record<string, FakeEntity> = Object.fromEntries(
      Object.entries(base.states()).filter(([entityId]) => stored.entities[entityId]?.deleted !== true),
    );
    for (const [entityId, value] of Object.entries(stored.entities))
      if (value.deleted !== true) merged[entityId] = entityOf(entityId, value);
    return merged;
  };
  const areaNames = (): string[] => {
    const names = new Set(
      Object.values(base.areas).flatMap((area) => (area === undefined ? [] : [area.name])),
    );
    for (const value of Object.values(stored.entities)) if (value.area !== null) names.add(value.area);
    return [...names].sort((a, b) => a.localeCompare(b));
  };
  const home = (): FakeHome => {
    const areas: Record<string, HaAreaRegistryEntry> = {};
    for (const [id, area] of Object.entries(base.areas)) if (area !== undefined) areas[id] = area;
    for (const name of areaNames())
      if (!Object.values(areas).some((area) => area.name === name))
        areas[areaIdOf(name)] = { area_id: areaIdOf(name), name };
    const areaIdByName = new Map(Object.entries(areas).map(([id, area]) => [area.name, id]));
    const entities: Record<string, HaEntityRegistryEntry> = {};
    for (const [entityId, entry] of Object.entries(base.entities))
      if (entry !== undefined && stored.entities[entityId]?.deleted !== true) entities[entityId] = entry;
    for (const [entityId, value] of Object.entries(stored.entities))
      if (value.deleted !== true)
        entities[entityId] = {
          ...(entities[entityId] ?? {}),
          area_id: value.area === null ? null : (areaIdByName.get(value.area) ?? null),
        };
    return {
      states,
      areas,
      devices: base.devices,
      entities,
      control: base.control,
      callService: (domain, service, data, target) => {
        const entityId = data?.entity_id ?? target?.entity_id;
        const own = typeof entityId === "string" ? stored.entities[entityId] : undefined;
        if (own === undefined || own.deleted === true || typeof entityId !== "string")
          return base.callService(domain, service, data, target);
        if (
          !onOffDomains.has(entityId.split(".")[0] ?? "") ||
          !["toggle", "turn_on", "turn_off"].includes(service)
        )
          return false;
        const next =
          service === "toggle" ? (own.state === "on" ? "off" : "on") : service === "turn_on" ? "on" : "off";
        stored = { ...stored, entities: { ...stored.entities, [entityId]: { ...own, state: next } } };
        write(stored);
        return true;
      },
    };
  };
  return {
    home,
    dashboard: () => {
      // A demo entity already on its room's tab stays where it is; every other entity with an area gets a tile, on
      // its room's demo tab (a section of its own) or on a new tab named like the room.
      const shown = (entityId: string): boolean =>
        demoDashboard.views.some((view) => JSON.stringify(view).includes(`"${entityId}"`));
      const byArea = new Map<string, string[]>();
      for (const [entityId, value] of Object.entries(stored.entities)) {
        if (value.deleted === true || value.area === null || shown(entityId)) continue;
        byArea.set(value.area, [...(byArea.get(value.area) ?? []), entityId]);
      }
      const card = (entityId: string): Record<string, unknown> => {
        const domain = entityId.split(".")[0];
        if (domain === "climate") return { type: "thermostat", entity: entityId };
        if (domain === "media_player") return { type: "media-control", entity: entityId };
        return tileCard(entityId, domain === "binary_sensor");
      };
      const cardsOf = (area: string): Record<string, unknown>[] =>
        [...(byArea.get(area) ?? [])].sort().map(card);
      const demoTitles = new Set(demoDashboard.views.map((view) => view.title));
      return {
        views: [
          ...demoDashboard.views.map((view) => {
            const extra = typeof view.title === "string" ? cardsOf(view.title) : [];
            const sections: readonly unknown[] = Array.isArray(view.sections) ? view.sections : [];
            return extra.length === 0
              ? view
              : { ...view, sections: [...sections, { type: "grid", cards: extra }] };
          }),
          ...[...byArea.keys()]
            .filter((area) => !demoTitles.has(area))
            .map((area) => dashboardView(area, cardsOf(area))),
        ],
      };
    },
    list: () =>
      Object.entries(states())
        .map(([entityId, entity]) => {
          const own = stored.entities[entityId];
          return {
            entityId,
            entity,
            area: own === undefined ? demoAreaName(entityId) : own.area,
            stored: own !== undefined,
          };
        })
        .sort((a, b) => a.entityId.localeCompare(b.entityId)),
    areaNames,
    save: (entityId, entity) => {
      stored = { ...stored, entities: { ...stored.entities, [entityId]: entity } };
      write(stored);
    },
    remove: (entityId) => {
      stored = {
        ...stored,
        entities: {
          ...stored.entities,
          [entityId]: { state: "", attributes: {}, area: null, deleted: true },
        },
      };
      write(stored);
    },
    reset: () => {
      stored = empty;
      cache.clear();
      write(stored);
    },
  };
};
