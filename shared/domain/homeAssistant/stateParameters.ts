// State parameters driven by Home Assistant (Phase 9.7, spec/home-assistant/bindings.md#state-parameters). Pure:
// an object binding's `states` turn entity values into the template's live-state parameter values (D26), which
// the viewer draws instead of the stored values (never written to house.json). Nothing here knows a door or a
// blind: the template declares the parameter, the binding maps a value onto its type. The one name it knows is
// the blinds parameter (`blindsClosed`), whose cover a tap on an opening toggles by default (10.1); the one
// attribute it knows is a cover's `current_tilt_position`, whose conventions it names (10.4).
import type {
  HaActionValue,
  HaObjectBindingValue,
  HaStateMappingValue,
  HaStateMapValue,
  HaStateSourceValue,
  HaStateValueValue,
} from "../schemas/homeAssistant";
import { maxStateCases } from "../schemas/homeAssistant";
import type { TemplateParameterValue, TemplateStateParameter } from "../templates/metadata";
import { conditionNumber, conditionText } from "./conditions";
import type { EntityLookup } from "./conditions";

/** States that carry no value: the parameter keeps its stored value. */
const noValueStates: ReadonlySet<string> = new Set(["unavailable", "unknown", ""]);

/** The entity a mapping (or its fallback) reads: its own, else the binding's state entity; null for neither. */
export const mappingEntity = (
  mapping: HaStateSourceValue,
  stateEntityId: string | null | undefined,
): string | null => mapping.entity ?? stateEntityId ?? null;

/** The map applied to one HA value; undefined keeps the stored value. */
export const applyStateMap = (map: HaStateMapValue, value: unknown): HaStateValueValue | undefined => {
  switch (map.kind) {
    case "table": {
      const text = conditionText(value);
      if (text === undefined) return undefined;
      const found = map.cases.find((entry) =>
        typeof entry.state === "string" ? entry.state === text : entry.state.includes(text),
      );
      return found === undefined ? map.otherwise : found.value;
    }
    case "threshold": {
      const number = conditionNumber(value);
      if (Number.isNaN(number)) return undefined;
      return number <= map.at ? map.atOrBelow : map.above;
    }
    case "linear": {
      const number = conditionNumber(value);
      const { from, to } = map;
      if (Number.isNaN(number) || from.start === from.end) return undefined;
      const t = Math.min(Math.max((number - from.start) / (from.end - from.start), 0), 1);
      return to.start + t * (to.end - to.start);
    }
    case "band": {
      const number = conditionNumber(value);
      if (Number.isNaN(number)) return undefined;
      const inside = number >= Math.min(map.from, map.to) && number <= Math.max(map.from, map.to);
      return inside ? map.inside : map.outside;
    }
  }
};

/** The raw HA value a source reads (its attribute, else the state); undefined when there is none. */
export const sourceValue = (
  source: HaStateSourceValue,
  stateEntityId: string | null | undefined,
  getEntity: EntityLookup,
): unknown => {
  const entityId = mappingEntity(source, stateEntityId);
  if (entityId === null) return undefined;
  const entity = getEntity(entityId);
  if (entity === undefined || noValueStates.has(entity.state)) return undefined;
  const value = source.attribute === undefined ? entity.state : entity.attributes[source.attribute];
  return value === null ? undefined : value;
};

const sourceMapped = (
  source: HaStateSourceValue,
  stateEntityId: string | null | undefined,
  getEntity: EntityLookup,
): HaStateValueValue | undefined => {
  const value = sourceValue(source, stateEntityId, getEntity);
  return value === undefined ? undefined : applyStateMap(source.map, value);
};

/**
 * One mapping's value now: undefined (keep the stored value) without an entity, for an unknown or unavailable
 * entity, a missing or null attribute, or a value the map does not cover. When the mapping gives no value its
 * `fallback` (a second entity, 10.5) is read the same way.
 */
export const mappedStateValue = (
  mapping: HaStateMappingValue,
  stateEntityId: string | null | undefined,
  getEntity: EntityLookup,
): HaStateValueValue | undefined =>
  sourceMapped(mapping, stateEntityId, getEntity) ??
  (mapping.fallback === undefined ? undefined : sourceMapped(mapping.fallback, stateEntityId, getEntity));

/**
 * A mapped value checked against the parameter it drives: the right type, a declared choice, and numbers clamped
 * to the parameter's limits. Anything else is undefined (the stored value stays).
 */
export const stateParameterValue = (
  parameter: Pick<TemplateStateParameter, "type" | "choices" | "minimum" | "maximum">,
  value: HaStateValueValue | undefined,
): TemplateParameterValue | undefined => {
  if (value === undefined || typeof value !== parameter.type) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return Math.min(
      Math.max(value, parameter.minimum ?? Number.NEGATIVE_INFINITY),
      parameter.maximum ?? Number.POSITIVE_INFINITY,
    );
  }
  if (typeof value === "string" && parameter.choices !== undefined)
    return parameter.choices.some((choice) => choice.value === value) ? value : undefined;
  return value;
};

/** Every state the binding maps now, by parameter name (unchecked; the viewer checks them against the template). */
export const liveStateValues = (
  binding: HaObjectBindingValue,
  getEntity: EntityLookup,
): Readonly<Record<string, HaStateValueValue>> => {
  const values: Record<string, HaStateValueValue> = {};
  for (const [parameter, mapping] of Object.entries(binding.states ?? {})) {
    const value = mappedStateValue(mapping, binding.stateEntityId, getEntity);
    if (value !== undefined) values[parameter] = value;
  }
  return values;
};

/**
 * The instance's parameters with live states laid over the stored ones (checked per parameter); the stored object
 * itself when nothing changes, so an unchanged instance keeps its identity and is not rebuilt.
 */
export const parametersWithLiveStates = (
  stored: Readonly<Record<string, TemplateParameterValue>>,
  parameters: readonly TemplateStateParameter[],
  live: Readonly<Record<string, HaStateValueValue>>,
): Readonly<Record<string, TemplateParameterValue>> => {
  let next: Record<string, TemplateParameterValue> | null = null;
  for (const parameter of parameters) {
    const value = stateParameterValue(parameter, live[parameter.name]);
    if (value === undefined || stored[parameter.name] === value) continue;
    next ??= { ...stored };
    next[parameter.name] = value;
  }
  return next ?? stored;
};

// ---- Defaults for the binding editor (sensible per domain; the owner changes them) --------------------------

/** The value a choice parameter takes when "active": the last choice that is not its default. */
const activeChoice = (parameter: TemplateStateParameter): string | undefined => {
  const others = (parameter.choices ?? []).filter((choice) => choice.value !== parameter.default);
  return others[others.length - 1]?.value;
};

const defaultChoice = (parameter: TemplateStateParameter): string =>
  typeof parameter.default === "string" ? parameter.default : "";

const low = (parameter: TemplateStateParameter): number => parameter.minimum ?? 0;
const high = (parameter: TemplateStateParameter): number =>
  parameter.maximum ?? (parameter.unit === "°" ? 90 : 100);

/** How far an angle opens for an on / off source: 90° at most (a washer's 110° door opens like a door, 10.5). */
export const maxContactAngle = 90;
const onHigh = (parameter: TemplateStateParameter): number =>
  parameter.unit === "°"
    ? Math.min(high(parameter), Math.max(maxContactAngle, low(parameter)))
    : high(parameter);

/** On / off of the parameter's type: true / false, the maximum (90° at most) / minimum, the active choice / the default. */
const onOff = (parameter: TemplateStateParameter): readonly [HaStateValueValue, HaStateValueValue] => {
  if (parameter.type === "boolean") return [true, false];
  if (parameter.type === "number") return [onHigh(parameter), low(parameter)];
  const off = defaultChoice(parameter);
  return [activeChoice(parameter) ?? off, off];
};

/** A value table: these states → "on", everything else → "off". */
const onWhen = (parameter: TemplateStateParameter, states: readonly string[]): HaStateMappingValue => {
  const [on, off] = onOff(parameter);
  return {
    map: {
      kind: "table",
      cases: [{ state: states.length === 1 ? (states[0] ?? "on") : [...states], value: on }],
      otherwise: off,
    },
  };
};

/** The strings of an entity's list attribute (`options`, `swing_modes`). */
const stringList = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "string" && item !== "" ? [item] : []))
    : [];

const optionWords = (option: string): readonly string[] => option.toLowerCase().split(/[^a-z0-9]+/);
const openWords: readonly string[] = ["open", "opened", "on"];
const shutWords: readonly string[] = ["closed", "close", "shut", "off"];
/** Options that stop a louver (closed) and options that keep it swinging (shown fully open). */
const stopWords: readonly string[] = ["off", "stop", "stopped", "fixed", "none", "closed", "close"];
const swingWords: readonly string[] = [
  "on",
  "swing",
  "swinging",
  "auto",
  "both",
  "vertical",
  "horizontal",
  "all",
  "full",
];

/**
 * The choice an HA option means: the choice with that value or title (any case), else one whose value starts the
 * option or the other way round ("tilted" → `tilt`), else "open" / "on" → the active choice and "closed" / "off"
 * → the default; undefined when nothing fits.
 */
export const choiceForOption = (option: string, parameter: TemplateStateParameter): string | undefined => {
  const text = option.trim().toLowerCase();
  const choices = parameter.choices ?? [];
  const exact = choices.find(
    (choice) => choice.value.toLowerCase() === text || choice.title.toLowerCase() === text,
  );
  if (exact !== undefined) return exact.value;
  const stem = choices.find((choice) => {
    const value = choice.value.toLowerCase();
    return value.length >= 3 && text.length >= 3 && (text.startsWith(value) || value.startsWith(text));
  });
  if (stem !== undefined) return stem.value;
  if (openWords.includes(text)) return activeChoice(parameter);
  if (shutWords.includes(text)) return defaultChoice(parameter) === "" ? undefined : defaultChoice(parameter);
  return undefined;
};

/** A value table from an entity's options onto a choice parameter (`choiceForOption`); options that fit no choice keep the stored value. */
const optionChoices = (options: readonly string[], parameter: TemplateStateParameter): HaStateMapValue => ({
  kind: "table",
  cases: options
    .flatMap((option) => {
      const value = choiceForOption(option, parameter);
      return value === undefined ? [] : [{ state: option, value }];
    })
    .slice(0, maxStateCases),
});

const rounded = (value: number): number => Math.round(value * 10) / 10;

/**
 * A value table from an entity's options onto a number parameter (a louver angle from swing modes or a select of
 * positions, 10.5): numbered positions ("Fixed 1" … "Fixed 5", the AC we tested with select) are positions in their number
 * order even when they say "fixed"; other options that stop it (off, stop, fixed, …) → the minimum; options that keep it swinging (on,
 * swing, auto, both, vertical, horizontal, …) → the maximum; the other options (named positions), in their order,
 * spread evenly over the range (over the range above the minimum when a stop option already takes it).
 */
export const optionNumbers = (
  options: readonly string[],
  parameter: TemplateStateParameter,
): HaStateMapValue => {
  const min = low(parameter);
  const max = high(parameter);
  const words = (option: string): readonly string[] => optionWords(option);
  const swinging = (option: string): boolean => words(option).some((word) => swingWords.includes(word));
  /** A numbered position ("Fixed 3", "Position 2"): a number in it and no swinging word; ordered by its number. */
  const number = (option: string): number | undefined => {
    if (swinging(option)) return undefined;
    const match = /\d+/.exec(option);
    return match === null ? undefined : Number(match[0]);
  };
  const stops = options.filter(
    (option) => number(option) === undefined && words(option).some((word) => stopWords.includes(word)),
  );
  const swings = options.filter((option) => !stops.includes(option) && swinging(option));
  const named = options.filter((option) => !stops.includes(option) && !swings.includes(option));
  // Numbered positions keep their number order (Fixed 1 … Fixed 5), named ones their option order after them.
  const positions = [
    ...named
      .filter((option) => number(option) !== undefined)
      .sort((a, b) => (number(a) ?? 0) - (number(b) ?? 0)),
    ...named.filter((option) => number(option) === undefined),
  ];
  const spread = (index: number): number => {
    if (stops.length > 0) return min + ((index + 1) / positions.length) * (max - min);
    if (positions.length === 1) return max;
    return min + (index / (positions.length - 1)) * (max - min);
  };
  const valueOf = (option: string): number => {
    if (stops.includes(option)) return min;
    if (swings.includes(option)) return max;
    return rounded(spread(positions.indexOf(option)));
  };
  return {
    kind: "table",
    cases: options.map((option) => ({ state: option, value: valueOf(option) })).slice(0, maxStateCases),
  };
};

/**
 * A sensible first mapping for an entity of `domain` (with its `attributes`, when known) driving `parameter`:
 *
 * - `cover`: a boolean from `current_tilt_position` in HA's convention (0 = closed, 100 = open: ≤ 50 → true, so
 *   blinds read "closed" when tilted shut; see `tiltConventions`), a number linearly from `current_position`
 *   0–100 onto the parameter's range (a motorised sliding door), a choice from the state (`open` / `opening` →
 *   the active choice, else the default).
 * - `lock`: locks do not open doors; only `open` (a lock that unlatches) counts as on, `unlocked` stays off.
 * - `climate` with a number: its `swing_mode` attribute, the `swing_modes` spread by `optionNumbers` (off → the
 *   minimum, swinging → the maximum); without `swing_modes`, `off` → the minimum, else the maximum (10.5).
 * - `input_select` / `select` (and a `sensor` with `options`, an enum such as a window handle): a choice from
 *   each option (`choiceForOption`: "tilted" → tilt, "open" → the active choice); a number from the options
 *   spread over the range (`optionNumbers`); without options each choice maps to itself.
 * - `sensor` / `input_number` / `number` with a number parameter: linearly from 0–100.
 * - Anything else (`binary_sensor`, `switch`, `input_boolean`, …): `on` / `open` → on, else off (a door's open
 *   angle → its maximum but 90° at most, so a washer's door opens to 90°; a window's open mode → its last choice,
 *   swing; a boolean → true; a sliding door's percentage → 100).
 */
export const defaultStateMapping = (
  domain: string,
  parameter: TemplateStateParameter,
  attributes: Readonly<Record<string, unknown>> = {},
): HaStateMappingValue => {
  const options = stringList(attributes.options);
  if (domain === "cover") {
    if (parameter.type === "boolean")
      return { attribute: tiltAttribute, map: tiltConventionMap("standard", parameter) };
    if (parameter.type === "number")
      return {
        attribute: "current_position",
        map: {
          kind: "linear",
          from: { start: 0, end: 100 },
          to: { start: low(parameter), end: high(parameter) },
        },
      };
    return onWhen(parameter, ["open", "opening"]);
  }
  if (domain === "lock") return onWhen(parameter, ["open"]);
  if (domain === "climate" && parameter.type === "number") {
    const modes = stringList(attributes.swing_modes);
    return {
      attribute: "swing_mode",
      map:
        modes.length > 0
          ? optionNumbers(modes, parameter)
          : { kind: "table", cases: [{ state: "off", value: low(parameter) }], otherwise: high(parameter) },
    };
  }
  const selects = domain === "input_select" || domain === "select";
  if ((selects || domain === "sensor") && options.length > 0) {
    if (parameter.choices !== undefined) return { map: optionChoices(options, parameter) };
    if (parameter.type === "number") return { map: optionNumbers(options, parameter) };
  }
  if (selects && parameter.choices !== undefined)
    return {
      map: {
        kind: "table",
        cases: parameter.choices.map((choice) => ({ state: choice.value, value: choice.value })),
      },
    };
  if (
    (domain === "sensor" || domain === "input_number" || domain === "number") &&
    parameter.type === "number"
  )
    return {
      map: {
        kind: "linear",
        from: { start: 0, end: 100 },
        to: { start: low(parameter), end: high(parameter) },
      },
    };
  return onWhen(parameter, ["on", "open"]);
};

/**
 * A second entity's first mapping for a choice parameter (10.5): its domain's default, with an on / off table's
 * "on" turned to a choice the first mapping does not give yet (the window's "open" sensor gives swing, so the
 * "tilted" sensor gives tilt). The first mapping loses its `otherwise` (the second has its own), so it falls
 * through to the second whenever it does not match. Returns both.
 */
export const secondSource = (
  domain: string,
  parameter: TemplateStateParameter,
  first: HaStateMappingValue,
  attributes: Readonly<Record<string, unknown>> = {},
): Readonly<{ first: HaStateMappingValue; fallback: HaStateSourceValue }> => {
  const base = defaultStateMapping(domain, parameter, attributes);
  const given = new Set(first.map.kind === "table" ? first.map.cases.map((entry) => entry.value) : []);
  const unused = (parameter.choices ?? [])
    .map((choice) => choice.value)
    .filter((value) => value !== parameter.default && !given.has(value));
  const next = unused[unused.length - 1];
  const map: HaStateMapValue =
    base.map.kind === "table" && base.map.cases.length === 1 && next !== undefined
      ? { ...base.map, cases: base.map.cases.map((entry) => ({ ...entry, value: next })) }
      : base.map;
  let firstMap = first.map;
  if (firstMap.kind === "table") {
    const { otherwise: _moved, ...rest } = firstMap;
    firstMap = rest;
  }
  return { first: { ...first, map: firstMap }, fallback: { ...base, map } };
};

/** A fresh map of `kind` for the parameter (the editor's kind switch). */
export const defaultStateMap = (
  kind: HaStateMapValue["kind"],
  parameter: TemplateStateParameter,
): HaStateMapValue => {
  const [on, off] = onOff(parameter);
  switch (kind) {
    case "table":
      return { kind, cases: [{ state: "on", value: on }], otherwise: off };
    case "threshold":
      return { kind, at: 50, atOrBelow: on, above: off };
    case "linear":
      return { kind, from: { start: 0, end: 100 }, to: { start: low(parameter), end: high(parameter) } };
    case "band":
      return { kind, from: 25, to: 75, inside: on, outside: off };
  }
};

// ---- Tilt conventions (Phase 10.4, spec/home-assistant/bindings.md#tilt-conventions) ------------------------

/** The cover attribute a blinds parameter reads (HA: 0 … 100). */
export const tiltAttribute = "current_tilt_position";

/** How a cover reports its slats' tilt. */
export type TiltConvention = "standard" | "inverted" | "venetian";

export type TiltConventionInfo = Readonly<{
  id: TiltConvention;
  title: string;
  /** The tilt the "open slats" control sets, and the one "closed slats" sets. */
  open: number;
  closed: number;
}>;

/**
 * The conventions the blinds mapping offers: HA's own (0 = closed, 100 = open; at or below 50 reads closed),
 * inverted (100 = closed; above 50 reads closed), and venetian (50 = open, 0 and 100 closed in opposite
 * directions; 25–75 reads open).
 */
export const tiltConventions: readonly TiltConventionInfo[] = [
  { id: "standard", title: "0 = closed, 100 = open (HA standard)", open: 100, closed: 0 },
  { id: "inverted", title: "100 = closed, 0 = open", open: 0, closed: 100 },
  { id: "venetian", title: "50 = open, 0 and 100 = closed (venetian)", open: 50, closed: 0 },
];

/** The band of tilts a venetian blind reads open. */
const venetianBand = { from: 25, to: 75 } as const;

/** The value a boolean blinds parameter has when the slats are shut: true, unless it is about being open. */
export const tiltClosedValue = (parameter: Pick<TemplateStateParameter, "name">): boolean =>
  !/open/i.test(parameter.name);

/** The map of a convention for a boolean parameter (`tiltClosedValue` is the shut value). */
export const tiltConventionMap = (
  convention: TiltConvention,
  parameter: Pick<TemplateStateParameter, "name">,
): HaStateMapValue => {
  const closed = tiltClosedValue(parameter);
  switch (convention) {
    case "standard":
      return { kind: "threshold", at: 50, atOrBelow: closed, above: !closed };
    case "inverted":
      return { kind: "threshold", at: 50, atOrBelow: !closed, above: closed };
    case "venetian":
      return { kind: "band", ...venetianBand, inside: !closed, outside: closed };
  }
};

/** The convention a map is, or null for a map of its own (the editor then shows the map). */
export const tiltConventionOf = (
  map: HaStateMapValue,
  parameter: Pick<TemplateStateParameter, "name">,
): TiltConvention | null =>
  tiltConventions.find(
    (convention) => JSON.stringify(tiltConventionMap(convention.id, parameter)) === JSON.stringify(map),
  )?.id ?? null;

/**
 * The tilts the "open slats" / "closed slats" controls set for a map: a band's middle and 0 (a venetian blind,
 * any band), the inverted convention's 0 and 100, else HA's 100 and 0.
 */
export const tiltPositions = (
  map: HaStateMapValue,
  parameter: Pick<TemplateStateParameter, "name">,
): Readonly<{ open: number; closed: number }> => {
  if (map.kind === "band") return { open: Math.round((map.from + map.to) / 2), closed: 0 };
  const convention = tiltConventions.find((info) => info.id === tiltConventionOf(map, parameter));
  return convention?.id === "inverted"
    ? { open: convention.open, closed: convention.closed }
    : { open: 100, closed: 0 };
};

/** HA's `cover.set_cover_tilt_position` on a cover, as HA's action editor writes it. */
export const setTiltAction = (cover: string, tilt: number): HaActionValue => {
  const action = {
    action: "perform-action",
    perform_action: "cover.set_cover_tilt_position",
    target: { entity_id: cover },
    data: { tilt_position: tilt },
  };
  return action;
};

/** HA's cover feature for setting the tilt position (`CoverEntityFeature.SET_TILT_POSITION`). */
export const coverSetTiltPosition = 128;

/** Whether a cover's `supported_features` include setting the tilt position. */
export const supportsTiltPosition = (attributes: Readonly<Record<string, unknown>>): boolean => {
  const features = attributes.supported_features;
  return typeof features === "number" && (features & coverSetTiltPosition) !== 0;
};

// ---- Gestures on wall openings (Phase 10.1, spec/home-assistant/bindings.md#opening-gestures) ---------------

/** The state parameter templates use for blinds drawn closed (the built-in openings' convention, Phase 9). */
export const blindsStateParameter = "blindsClosed";

export type OpeningGesture = "tap" | "hold" | "doubleTap";

/** A gesture's action and the entity it acts on when the action names none. */
export type ResolvedAction = Readonly<{ action: HaActionValue; entityId: string | null }>;

/**
 * The entity that drives an opening's main state: the first state mapping's entity (the blinds mapping counts
 * last, since blinds are not the opening itself), else the binding's `stateEntityId`; null when neither is set.
 */
export const openingMainEntity = (binding: HaObjectBindingValue): string | null => {
  const mappings = Object.entries(binding.states ?? {});
  const ordered = [
    ...mappings.filter(([parameter]) => parameter !== blindsStateParameter),
    ...mappings.filter(([parameter]) => parameter === blindsStateParameter),
  ];
  for (const [, mapping] of ordered) {
    const entityId = mappingEntity(mapping, binding.stateEntityId);
    if (entityId !== null) return entityId;
  }
  return binding.stateEntityId ?? null;
};

/** The `cover` entity driving the opening's blinds parameter, or null (no mapping, or another domain). */
export const openingBlindsCover = (binding: HaObjectBindingValue): string | null => {
  const mapping = binding.states?.[blindsStateParameter];
  const entityId = mapping === undefined ? null : mappingEntity(mapping, binding.stateEntityId);
  return entityId?.startsWith("cover.") === true ? entityId : null;
};

/**
 * An opening's action for a gesture without a configured one, or null (nothing; the tap goes on to its room):
 * tap toggles the tilt of the cover driving its blinds (`cover.toggle_tilt`; for a venetian blind, whose blinds
 * mapping is a band on the tilt, `cover.set_cover_tilt_position` between shut (0) and the band's middle (50),
 * from the tilt `getEntity` reports now), else opens the main entity's more-info; hold opens the main entity's
 * more-info; double tap does nothing. Without a main entity, nothing.
 */
export const defaultOpeningAction = (
  binding: HaObjectBindingValue,
  gesture: OpeningGesture,
  getEntity?: EntityLookup,
): ResolvedAction | null => {
  const main = openingMainEntity(binding);
  if (gesture === "doubleTap" || main === null) return null;
  const cover = gesture === "tap" ? openingBlindsCover(binding) : null;
  const blinds = binding.states?.[blindsStateParameter];
  if (cover !== null && blinds?.attribute === tiltAttribute && blinds.map.kind === "band") {
    const tilt = getEntity === undefined ? undefined : getEntity(cover)?.attributes[tiltAttribute];
    const band = blinds.map;
    const open =
      typeof tilt === "number" &&
      tilt >= Math.min(band.from, band.to) &&
      tilt <= Math.max(band.from, band.to);
    const positions = tiltPositions(band, { name: blindsStateParameter });
    return { action: setTiltAction(cover, open ? positions.closed : positions.open), entityId: cover };
  }
  if (cover !== null) {
    // HA's action object as its action editor writes a service call (its other fields are HA's).
    const toggleTilt = {
      action: "perform-action",
      perform_action: "cover.toggle_tilt",
      target: { entity_id: cover },
    };
    return { action: toggleTilt, entityId: cover };
  }
  return { action: { action: "more-info" }, entityId: main };
};

/**
 * What a gesture on an opening runs: its configured action (on `stateEntityId`, else the main entity), else the
 * default above (`getEntity` gives a venetian blind's tilt now); null for nothing (a configured `none` included).
 */
export const openingGestureAction = (
  binding: HaObjectBindingValue,
  gesture: OpeningGesture,
  getEntity?: EntityLookup,
): ResolvedAction | null => {
  const configured =
    gesture === "tap" ? binding.tapAction : gesture === "hold" ? binding.holdAction : binding.doubleTapAction;
  if (configured === undefined) return defaultOpeningAction(binding, gesture, getEntity);
  if (configured.action === "none") return null;
  return { action: configured, entityId: binding.stateEntityId ?? openingMainEntity(binding) };
};
