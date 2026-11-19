// Home Assistant bindings in preferences (D25, spec/home-assistant/bindings.md#storage): reading stored bindings
// written before D25 (only `lights`), before 8.5 (no `bubbles`), or without floor bindings (optional `floors`), and
// merging a preferences patch, shared by the server and the builder's preferences client so both merge the same way.
import { emptyHouseBindings, haBindingKinds } from "../schemas/homeAssistant";
import type { HaBindingsPatchValue, HaBindingsValue, HaHouseBindingsValue } from "../schemas/homeAssistant";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Stored bubbles brought to the current shape: missing room lists and placed bubbles are empty (8.5). */
const migrateBubbles = (stored: unknown): Readonly<Record<string, unknown>> => ({
  rooms: isRecord(stored) && isRecord(stored.rooms) ? stored.rooms : {},
  placed: isRecord(stored) && isRecord(stored.placed) ? stored.placed : {},
});

/**
 * Stored bindings brought to the current shape: every house gets every kind (a missing kind is empty) and its
 * bubbles. Today's light bindings pass through unchanged; validation against the schema follows.
 */
export const migrateStoredBindings = (stored: unknown): Readonly<Record<string, unknown>> => {
  if (!isRecord(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored).map(([houseId, house]) => [
      houseId,
      {
        ...Object.fromEntries(
          haBindingKinds.map((kind) => {
            const entries = isRecord(house) ? house[kind] : undefined;
            return [kind, isRecord(entries) ? entries : {}];
          }),
        ),
        bubbles: migrateBubbles(isRecord(house) ? house.bubbles : undefined),
        // Floor bindings (the presence gate) are optional: kept when stored, absent otherwise.
        ...(isRecord(house) && isRecord(house.floors) ? { floors: house.floors } : {}),
      },
    ]),
  );
};

/** One house's bindings with a patch applied: each kind in the patch (and `bubbles`, `floors`) replaces it whole. */
const mergeHouse = (
  current: HaHouseBindingsValue | undefined,
  patch: HaBindingsPatchValue[string],
): HaHouseBindingsValue => {
  const base = current ?? emptyHouseBindings();
  const floors = patch.floors ?? base.floors;
  return {
    lights: patch.lights ?? base.lights,
    objects: patch.objects ?? base.objects,
    effects: patch.effects ?? base.effects,
    areas: patch.areas ?? base.areas,
    bubbles: patch.bubbles ?? base.bubbles,
    ...(floors === undefined ? {} : { floors }),
  };
};

/** Houses listed in the patch are merged by kind; other houses are kept. */
export const mergeBindings = (
  current: HaBindingsValue,
  patch: HaBindingsPatchValue | undefined,
): HaBindingsValue => {
  if (patch === undefined) return current;
  const next: HaBindingsValue = { ...current };
  for (const [houseId, house] of Object.entries(patch)) next[houseId] = mergeHouse(current[houseId], house);
  return next;
};
