// Home Assistant card conditions, evaluated (D25, spec/home-assistant/bindings.md#evaluation). Pure: the caller
// passes an entity lookup (the viewer's hass store, or fixtures in scripts/ha-conditions.ts). The semantics follow
// Home Assistant's frontend (`checkConditionsMet`): a missing entity reads as "unavailable", a state that is not a
// number fails every numeric test, an empty `and` holds and an empty `or` does not.
import type { HaConditionValue, HaEntityConditionValue } from "../schemas/homeAssistant";

/** The part of an HA entity state object a condition reads. */
export type ConditionEntity = Readonly<{ state: string; attributes: Readonly<Record<string, unknown>> }>;

export type EntityLookup = (entityId: string) => ConditionEntity | undefined;

/** HA's state for an entity it does not know. */
export const unavailableState = "unavailable";

/** Anything a condition may gate: shown while `visibleWhen` holds, restyled by the first `variants` that holds. */
export type Conditional<V extends Readonly<{ when: HaConditionValue }>> = Readonly<{
  visibleWhen?: HaConditionValue;
  variants?: readonly V[];
}>;

/** The tested value: the attribute when one is named (undefined when the entity lacks it), else the state. */
const testedValue = (condition: HaEntityConditionValue, getEntity: EntityLookup): unknown => {
  const entity = getEntity(condition.entity);
  if (condition.attribute === undefined) return entity?.state ?? unavailableState;
  return entity?.attributes[condition.attribute];
};

/** A value as HA's string comparison sees it: strings as they are, numbers and booleans as text. */
export const conditionText = (value: unknown): string | undefined =>
  typeof value === "string"
    ? value
    : typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : undefined;

/** A value as HA's numeric tests see it: a number, numeric text, else NaN. */
export const conditionNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return Number.NaN;
  return Number(value);
};

const matches = (value: unknown, states: string | readonly string[]): boolean => {
  const text = conditionText(value);
  if (text === undefined) return false;
  return typeof states === "string" ? text === states : states.includes(text);
};

const evaluateEntity = (condition: HaEntityConditionValue, getEntity: EntityLookup): boolean => {
  const value = testedValue(condition, getEntity);
  if (condition.condition === "numeric_state") {
    const number = conditionNumber(value);
    if (Number.isNaN(number)) return false;
    return (
      (condition.above === undefined || number > condition.above) &&
      (condition.below === undefined || number < condition.below)
    );
  }
  return "state" in condition ? matches(value, condition.state) : !matches(value, condition.state_not);
};

/** Whether a condition holds for the current entity states. */
export const evaluateCondition = (condition: HaConditionValue, getEntity: EntityLookup): boolean => {
  switch (condition.condition) {
    case "and":
      return condition.conditions.every((inner) => evaluateCondition(inner, getEntity));
    case "or":
      return condition.conditions.some((inner) => evaluateCondition(inner, getEntity));
    default:
      return evaluateEntity(condition, getEntity);
  }
};

/** Shown: no `visibleWhen`, or it holds. */
export const isShown = (
  binding: Readonly<{ visibleWhen?: HaConditionValue }>,
  getEntity: EntityLookup,
): boolean => binding.visibleWhen === undefined || evaluateCondition(binding.visibleWhen, getEntity);

/** The first variant whose `when` holds, or null (the authored look). */
export const activeVariant = <V extends Readonly<{ when: HaConditionValue }>>(
  binding: Conditional<V>,
  getEntity: EntityLookup,
): V | null => binding.variants?.find((variant) => evaluateCondition(variant.when, getEntity)) ?? null;

/** Every entity a condition reads. */
export const conditionEntities = (condition: HaConditionValue, into = new Set<string>()): Set<string> => {
  if (condition.condition === "and" || condition.condition === "or")
    for (const inner of condition.conditions) conditionEntities(inner, into);
  else into.add(condition.entity);
  return into;
};

/** A room's presence / intrusion setting as far as conditions go (8.6). */
export type PresenceTest = Readonly<{ entityId: string; when?: HaConditionValue }>;

/** The states that mean "someone is there" when a presence setting has no condition of its own (8.6). */
export const presenceStates: readonly string[] = ["on", "triggered"];

/** The condition a presence setting tests: its own `when`, else its entity is "on" or "triggered". */
export const presenceCondition = (presence: PresenceTest): HaConditionValue =>
  presence.when ?? { condition: "state", entity: presence.entityId, state: [...presenceStates] };

/** Whether a room's presence / intrusion is active now (8.6). */
export const presenceActive = (presence: PresenceTest, getEntity: EntityLookup): boolean =>
  evaluateCondition(presenceCondition(presence), getEntity);

/**
 * Whether a floor's rooms may sweep now: the floor has no presence gate (`presenceWhen`), or it holds (owner,
 * 2026-11-18; for example only while the alarm is armed).
 */
export const presenceAllowed = (
  floor: Readonly<{ presenceWhen?: HaConditionValue }> | undefined,
  getEntity: EntityLookup,
): boolean => floor?.presenceWhen === undefined || evaluateCondition(floor.presenceWhen, getEntity);

/**
 * Every entity a binding depends on (its state entity, `visibleWhen`, every variant's `when`, a room's presence
 * entity and condition, and an object's state-parameter entities with their second entities, 9.7 and 10.5): what
 * a viewer subscribes to. Action targets are not included; they are read only when the action runs.
 */
export const entitiesOf = (
  binding: Readonly<{
    stateEntityId?: string | null;
    visibleWhen?: HaConditionValue;
    variants?: readonly Readonly<{ when: HaConditionValue }>[];
    presence?: PresenceTest;
    states?: Readonly<
      Record<string, Readonly<{ entity?: string; fallback?: Readonly<{ entity?: string }> }>>
    >;
  }>,
  into = new Set<string>(),
): Set<string> => {
  if (typeof binding.stateEntityId === "string") into.add(binding.stateEntityId);
  for (const mapping of Object.values(binding.states ?? {})) {
    if (mapping.entity !== undefined) into.add(mapping.entity);
    if (mapping.fallback?.entity !== undefined) into.add(mapping.fallback.entity);
  }
  if (binding.visibleWhen !== undefined) conditionEntities(binding.visibleWhen, into);
  for (const variant of binding.variants ?? []) conditionEntities(variant.when, into);
  if (binding.presence !== undefined) {
    into.add(binding.presence.entityId);
    conditionEntities(presenceCondition(binding.presence), into);
  }
  return into;
};
