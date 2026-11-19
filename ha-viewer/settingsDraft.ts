// The Settings screen's draft (Phase 10.9, spec/home-assistant/bindings.md#saving): everything edited in Settings
// (bindings with room bubbles, presence, and floor presence gates, the dashboard, room tabs) stays a draft until Save, which writes every
// changed preferences key in one patch. Pure, so `npm run ha:conditions` checks it.
import type {
  HaAreaBindingValue,
  HaDashboardValue,
  HaEffectBindingValue,
  HaFloorBindingValue,
  HaHouseBindingsPatchValue,
  HaHouseBindingsValue,
  HaLightBindingValue,
  HaObjectBindingValue,
} from "@shared/domain/schemas/homeAssistant";
import type { SettingsPatch } from "./houseSource";

/** A clickable binding (light, object, room) with nothing set is not stored. */
const isEmpty = (binding: HaLightBindingValue): boolean =>
  (binding.stateEntityId ?? null) === null &&
  binding.tapAction === undefined &&
  binding.holdAction === undefined &&
  binding.doubleTapAction === undefined &&
  binding.visibleWhen === undefined;

const pruned = <T>(entries: Readonly<Record<string, T>>, empty: (value: T) => boolean): Record<string, T> =>
  Object.fromEntries(Object.entries(entries).filter(([, value]) => !empty(value)));

/** The bindings as stored: entries with nothing set are left out (a room's presence alone is kept). */
export const prunedBindings = (bindings: HaHouseBindingsValue): HaHouseBindingsValue => {
  // A floor without a presence gate is not stored; no gated floor leaves `floors` out.
  const floors = pruned(
    bindings.floors ?? {},
    (binding: HaFloorBindingValue) => binding.presenceWhen === undefined,
  );
  return {
    bubbles: bindings.bubbles,
    // A light with only its lumens or temperature re-adjusted (13.6) is kept.
    lights: pruned(
      bindings.lights,
      (binding: HaLightBindingValue) =>
        isEmpty(binding) && binding.lumens === undefined && binding.kelvin === undefined,
    ),
    objects: pruned(
      bindings.objects,
      (binding: HaObjectBindingValue) => isEmpty(binding) && binding.states === undefined,
    ),
    effects: pruned(
      bindings.effects,
      (binding: HaEffectBindingValue) =>
        binding.visibleWhen === undefined && (binding.variants ?? []).length === 0,
    ),
    areas: pruned(
      bindings.areas,
      (binding: HaAreaBindingValue) =>
        isEmpty(binding) && binding.presence === undefined && binding.haAreaId === undefined,
    ),
    ...(Object.keys(floors).length === 0 ? {} : { floors }),
  };
};

/** JSON with object keys sorted, so two equal values compare equal whatever order their keys were set in. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    typeof inner === "object" && inner !== null && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner,
  );

const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);

/** The kinds whose stored form differs (each replaces that kind whole in the patch); empty when none does. */
export const changedKinds = (
  saved: HaHouseBindingsValue,
  draft: HaHouseBindingsValue,
): HaHouseBindingsPatchValue => {
  const before = prunedBindings(saved);
  const after = prunedBindings(draft);
  return {
    ...(same(before.lights, after.lights) ? {} : { lights: after.lights }),
    ...(same(before.objects, after.objects) ? {} : { objects: after.objects }),
    ...(same(before.effects, after.effects) ? {} : { effects: after.effects }),
    ...(same(before.areas, after.areas) ? {} : { areas: after.areas }),
    ...(same(before.bubbles, after.bubbles) ? {} : { bubbles: after.bubbles }),
    // Removing the last floor gate stores an empty map (it replaces the kind whole).
    ...(same(before.floors ?? {}, after.floors ?? {}) ? {} : { floors: after.floors ?? {} }),
  };
};

/**
 * The dashboard fields Settings edits: which dashboard, each room's tab, panel width and title (14.4), each
 * floor's widgets (13.7: tab, columns, position), the navigation (14.6), and each house's main view (16.1); the
 * optional maps are stored empty rather than absent once Settings saves them, the navigation stays absent (the
 * device default) until chosen, and the main views stay absent while none is set (so a Save from a viewer whose
 * integration predates 16.1 never sends the field).
 */
const settingsFields = (dashboard: HaDashboardValue) => ({
  urlPath: dashboard.urlPath,
  areaTabs: dashboard.areaTabs,
  areaColumns: dashboard.areaColumns,
  areaTitles: dashboard.areaTitles ?? {},
  floorTabs: dashboard.floorTabs ?? {},
  floorColumns: dashboard.floorColumns ?? {},
  floorPositions: dashboard.floorPositions ?? {},
  ...(dashboard.navigation === undefined ? {} : { navigation: dashboard.navigation }),
  ...(Object.keys(dashboard.mainViews ?? {}).length === 0 ? {} : { mainViews: dashboard.mainViews }),
});

/**
 * The dashboard to store, or null when Settings changed none of its fields. The draft's fields go over the
 * current setting, so a room position saved from the room panel meanwhile (it is not part of Settings) is kept.
 */
export const dashboardForSave = (
  saved: HaDashboardValue,
  draft: HaDashboardValue,
  current: HaDashboardValue,
): HaDashboardValue | null => {
  if (same(settingsFields(saved), settingsFields(draft))) return null;
  // The draft's main views replace the current ones whole; none set leaves the field out.
  const { mainViews: _current, ...rest } = current;
  return { ...rest, ...settingsFields(draft) };
};

export type SettingsDraftInput = Readonly<{
  houseId: string;
  /** The bindings as loaded when Settings opened, and as edited. */
  savedBindings: HaHouseBindingsValue;
  draftBindings: HaHouseBindingsValue;
  /** The dashboard as Settings opened with it, as edited, and as the viewer has it now. */
  savedDashboard: HaDashboardValue;
  draftDashboard: HaDashboardValue;
  currentDashboard: HaDashboardValue;
}>;

/** The one preferences patch for a Save: only the changed keys, or null when nothing changed. */
export const settingsPatch = (input: SettingsDraftInput): SettingsPatch | null => {
  const kinds = changedKinds(input.savedBindings, input.draftBindings);
  const dashboard = dashboardForSave(input.savedDashboard, input.draftDashboard, input.currentDashboard);
  const bindings = Object.keys(kinds).length === 0 ? null : { [input.houseId]: kinds };
  if (bindings === null && dashboard === null) return null;
  return {
    ...(bindings === null ? {} : { bindings }),
    ...(dashboard === null ? {} : { dashboard }),
  };
};
