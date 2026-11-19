// The viewer's live binding evaluator (D25, spec/home-assistant/bindings.md#evaluation): it subscribes once per
// entity that any binding of the shown house uses (state entities and condition entities), and tells its
// listeners which bindings depend on the entities that changed. Consumers (light states now; object actions,
// conditional effects, bubbles, and presence in 8.3–8.6) ask it whether a binding is shown and which variant holds.
// Bubbles (8.5) are keyed `{ kind: "bubbles", id }` by their bubble ID, room and placed alike; a floor's presence
// gate (owner, 2026-11-18) `{ kind: "floors", id }` by its floor ID.
import {
  activeVariant,
  conditionEntities,
  entitiesOf,
  isShown,
  presenceActive,
  presenceAllowed,
} from "@shared/domain/homeAssistant/conditions";
import type { EntityLookup } from "@shared/domain/homeAssistant/conditions";
import { emptyHouseBindings } from "@shared/domain/schemas/homeAssistant";
import type {
  HaAreaPresenceValue,
  HaBindingKind,
  HaBubbleContentValue,
  HaEffectVariantValue,
  HaHouseBindingsValue,
} from "@shared/domain/schemas/homeAssistant";
import type { HassStore } from "./hassStore";

/** One binding: its kind and the builder's stable ID (a bubble: its bubble ID). */
export type BindingKey = Readonly<{ kind: HaBindingKind | "bubbles" | "floors"; id: string }>;

/** Called with every binding that depends on an entity that changed (coalesced per task). */
export type BindingListener = (changed: readonly BindingKey[]) => void;

export type BindingEvaluator = Readonly<{
  /**
   * Replaces the bindings and their subscriptions (one per entity used). Listeners hear only later changes; the
   * caller evaluates the new bindings itself.
   */
  setBindings: (bindings: HaHouseBindingsValue) => void;
  bindings: () => HaHouseBindingsValue;
  /** The entity lookup conditions read (the hass store). */
  lookup: EntityLookup;
  /** True when the thing has no binding, no `visibleWhen`, or its `visibleWhen` holds now. */
  shown: (kind: HaBindingKind, id: string) => boolean;
  /** True when the bubble has no `visibleWhen` or it holds now (room and placed bubbles, 8.5). */
  bubbleShown: (bubble: HaBubbleContentValue) => boolean;
  /** The effect's first variant that holds now, or null for its authored look. */
  effectVariant: (effectId: string) => HaEffectVariantValue | null;
  /** True while the room has a presence / intrusion setting (8.6) and it is active now. */
  presenceActive: (areaId: string) => boolean;
  subscribe: (listener: BindingListener) => () => void;
  /** The entities subscribed to now (for checks: one subscription per entity). */
  subscribedEntities: () => readonly string[];
  dispose: () => void;
}>;

/** What a binding's entities are read from. */
type Dependent = Parameters<typeof entitiesOf>[0];

const keyText = (key: BindingKey): string => `${key.kind}:${key.id}`;

export const createBindingEvaluator = (store: HassStore): BindingEvaluator => {
  let bindings = emptyHouseBindings();
  const users = new Map<string, BindingKey[]>();
  const unsubscribes = new Map<string, () => void>();
  const listeners = new Set<BindingListener>();
  let pending = new Map<string, BindingKey>();
  let flushQueued = false;

  const lookup: EntityLookup = (entityId) => store.entity(entityId);

  const flush = (): void => {
    flushQueued = false;
    const changed = [...pending.values()];
    pending = new Map();
    if (changed.length === 0) return;
    for (const listener of [...listeners]) listener(changed);
  };

  const queue = (keys: readonly BindingKey[]): void => {
    for (const key of keys) pending.set(keyText(key), key);
    if (flushQueued) return;
    flushQueued = true;
    queueMicrotask(flush);
  };

  const unsubscribeAll = (): void => {
    for (const unsubscribe of unsubscribes.values()) unsubscribe();
    unsubscribes.clear();
    users.clear();
  };

  const binding = (kind: HaBindingKind, id: string) => bindings[kind][id];

  return {
    setBindings: (next) => {
      bindings = next;
      unsubscribeAll();
      const add = (kind: BindingKey["kind"], entries: Readonly<Record<string, Dependent>>): void => {
        for (const [id, value] of Object.entries(entries)) {
          const key: BindingKey = { kind, id };
          for (const entityId of entitiesOf(value)) {
            const list = users.get(entityId) ?? [];
            list.push(key);
            users.set(entityId, list);
          }
        }
      };
      add("lights", next.lights);
      add("objects", next.objects);
      add("effects", next.effects);
      add("areas", next.areas);
      add("bubbles", {
        ...Object.fromEntries(
          Object.values(next.bubbles.rooms).flatMap((list) => list.map((bubble) => [bubble.id, bubble])),
        ),
        ...next.bubbles.placed,
      });
      for (const [floorId, floor] of Object.entries(next.floors ?? {}))
        if (floor.presenceWhen !== undefined)
          for (const entityId of conditionEntities(floor.presenceWhen)) {
            const list = users.get(entityId) ?? [];
            list.push({ kind: "floors", id: floorId });
            users.set(entityId, list);
          }
      for (const [entityId, keys] of users)
        unsubscribes.set(
          entityId,
          store.subscribeEntity(entityId, () => {
            queue(keys);
          }),
        );
    },
    bindings: () => bindings,
    lookup,
    bubbleShown: (bubble) => isShown(bubble, lookup),
    shown: (kind, id) => {
      const value = binding(kind, id);
      return value === undefined || isShown(value, lookup);
    },
    effectVariant: (effectId) => {
      const value = bindings.effects[effectId];
      return value === undefined ? null : activeVariant(value, lookup);
    },
    presenceActive: (areaId) => {
      const presence = bindings.areas[areaId]?.presence;
      return presence !== undefined && presenceActive(presence, lookup);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribedEntities: () => [...unsubscribes.keys()],
    dispose: () => {
      unsubscribeAll();
      listeners.clear();
      pending = new Map();
    },
  };
};

/** A room that sweeps (the 3D view's `IntrusionRoom`; declared here so the checks need no three.js). */
export type SweepingRoom = Readonly<{ areaId: string; corners: HaAreaPresenceValue["corners"] }>;

/**
 * The rooms that sweep now (8.6): those with a presence setting that is active, on a floor whose presence gate
 * holds or that has none (owner, 2026-11-18). A gated floor's rooms neither sweep nor tint. `floorOf` gives a
 * room's floor ID (undefined: a room the house no longer has, ungated).
 */
export const intrusionRooms = (
  bindings: HaHouseBindingsValue,
  floorOf: (areaId: string) => string | undefined,
  lookup: EntityLookup,
): readonly SweepingRoom[] =>
  Object.entries(bindings.areas).flatMap(([areaId, binding]): SweepingRoom[] => {
    const presence = binding.presence;
    if (presence === undefined || !presenceActive(presence, lookup)) return [];
    const floorId = floorOf(areaId);
    const floor = floorId === undefined ? undefined : bindings.floors?.[floorId];
    return presenceAllowed(floor, lookup) ? [{ areaId, corners: presence.corners }] : [];
  });
