// Binding suggestions (Phase 10.3, spec/home-assistant/bindings.md#suggestions). Pure: given what a binding field
// drives (a template's state parameter, a light, an object's or opening's main entity), the thing's and its room's
// names, the room's Home Assistant area, and HA's entities, rank the entities that fit. Nothing here knows a
// template: a parameter's kind comes from the words in its name and title, its type, choices, and unit; an
// entity's fit from its domain, device class, supported features, and attributes.
import type { TemplateStateParameter } from "../templates/metadata";
import type { ConditionEntity } from "./conditions";

// ---- HA's entities with their area -----------------------------------------------------------------------

/** HA's entity registry entry as the frontend's `hass.entities` holds it (only the fields read here). */
export type HaEntityRegistryEntry = Readonly<{
  device_id?: string | null;
  area_id?: string | null;
  hidden?: boolean;
  entity_category?: string | null;
}>;
/** HA's device registry entry (`hass.devices`). */
export type HaDeviceRegistryEntry = Readonly<{ area_id?: string | null }>;
/** HA's area registry entry (`hass.areas`). */
export type HaAreaRegistryEntry = Readonly<{ area_id: string; name: string }>;

/** HA's registries as the frontend's `hass` carries them; all optional (an older HA, the harness). */
export type HaRegistries = Readonly<{
  entities?: Readonly<Record<string, HaEntityRegistryEntry | undefined>>;
  devices?: Readonly<Record<string, HaDeviceRegistryEntry | undefined>>;
  areas?: Readonly<Record<string, HaAreaRegistryEntry | undefined>>;
}>;

/** An HA area: its ID and name. */
export type HaArea = Readonly<{ id: string; name: string }>;

/** An entity as the ranking reads it. */
export type SuggestionEntity = Readonly<{
  entityId: string;
  domain: string;
  /** The friendly name, else the entity ID. */
  name: string;
  deviceClass: string | null;
  supportedFeatures: number;
  attributes: Readonly<Record<string, unknown>>;
  state: string;
  /** The entity's own area, else its device's (HA's rule); null when neither has one. */
  areaId: string | null;
  areaName: string | null;
}>;

const textOf = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/** The areas HA knows, by name. */
export const haAreas = (registries: HaRegistries): readonly HaArea[] =>
  Object.values(registries.areas ?? {})
    .flatMap((area): HaArea[] => (area === undefined ? [] : [{ id: area.area_id, name: area.name }]))
    .sort((a, b) => a.name.localeCompare(b.name));

/** The entity's area: its registry entry's own, else its device's; null when neither has one. */
export const entityAreaId = (entityId: string, registries: HaRegistries): string | null => {
  const entry = registries.entities?.[entityId];
  if (entry === undefined) return null;
  const own = textOf(entry.area_id);
  if (own !== null) return own;
  const deviceId = textOf(entry.device_id);
  return deviceId === null ? null : textOf(registries.devices?.[deviceId]?.area_id);
};

/**
 * HA's entities as the ranking reads them. Hidden entities and configuration or diagnostic entities
 * (`entity_category`) are left out: they are not what a door or a lamp shows.
 */
export const suggestionEntities = (
  states: Readonly<Record<string, ConditionEntity | undefined>>,
  registries: HaRegistries,
): readonly SuggestionEntity[] => {
  const areaNames = new Map(haAreas(registries).map((area) => [area.id, area.name]));
  return Object.entries(states).flatMap(([entityId, entity]): SuggestionEntity[] => {
    if (entity === undefined) return [];
    const entry = registries.entities?.[entityId];
    if (entry?.hidden === true || textOf(entry?.entity_category) !== null) return [];
    const areaId = entityAreaId(entityId, registries);
    const features = entity.attributes.supported_features;
    return [
      {
        entityId,
        domain: entityId.split(".")[0] ?? "",
        name: textOf(entity.attributes.friendly_name) ?? entityId,
        deviceClass: textOf(entity.attributes.device_class),
        supportedFeatures: typeof features === "number" ? features : 0,
        attributes: entity.attributes,
        state: entity.state,
        areaId,
        areaName: areaId === null ? null : (areaNames.get(areaId) ?? null),
      },
    ];
  });
};

// ---- Words -----------------------------------------------------------------------------------------------

/** Words that say nothing about which entity is meant. */
const stopWords: ReadonlySet<string> = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "with",
  "in",
  "on",
  "to",
  "room",
  "deg",
]);

/** Words shared by many entities of a kind (a door sensor, a window): they count, but little. */
const genericWords: ReadonlySet<string> = new Set([
  "door",
  "window",
  "open",
  "sensor",
  "contact",
  "blind",
  "light",
  "lamp",
  "main",
  "left",
  "right",
]);

/** Words that name the same thing ("entrance door" is the "front door"). */
const synonyms: ReadonlyMap<string, string> = new Map([
  ["entrance", "front"],
  ["entry", "front"],
  ["television", "tv"],
  ["aircon", "ac"],
  ["louvre", "louver"],
  ["lounge", "living"],
]);

const singular = (word: string): string =>
  word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;

/**
 * Lower-case words of a name or a parameter name (`openAngleDeg` → open, angle), singular, a few synonyms joined
 * (entrance → front, television → tv), without stop words.
 */
export const nameWords = (text: string): readonly string[] => [
  ...new Set(
    text
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .replace(/['’]s\b/g, "")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 1 && !/^\d+$/.test(word) && !stopWords.has(word))
      .map((word) => synonyms.get(word) ?? singular(word)),
  ),
];

const hasAny = (words: readonly string[], set: readonly string[]): boolean =>
  words.some((word) => set.includes(word));

// ---- What a field drives ---------------------------------------------------------------------------------

/** The parameter fields the ranking reads. */
export type SuggestionParameter = Pick<
  TemplateStateParameter,
  "name" | "title" | "type" | "choices" | "unit" | "description"
>;

/** What the suggested entity drives. */
export type SuggestionRole =
  | Readonly<{ kind: "state"; parameter: SuggestionParameter }>
  | Readonly<{ kind: "light" }>
  /** An object's or (`opening`) a door's or window's own entity (`stateEntityId`). */
  | Readonly<{ kind: "object"; opening: boolean }>;

/** The thing and its room, as the name and area rules read them. */
export type SuggestionContext = Readonly<{
  /** The object's, opening's, or light's name. */
  name: string;
  roomName: string;
  /** The HA area linked to the room (`roomHaArea`), or null. */
  areaId: string | null;
}>;

/**
 * What a state parameter is, from its words, type, choices, and unit (first match):
 * `tilt` blinds, shades, slats, curtains; `swing` louvers, vanes, flaps, swing; `position` a percentage, a
 * position, a slide; `openMode` a choice about opening (or with choices such as tilt or swing); `contact` an
 * angle or anything about open, doors, or lids; `generic` the rest (by type).
 */
export type ParameterKind = "tilt" | "swing" | "position" | "openMode" | "contact" | "generic";

export const parameterKind = (parameter: SuggestionParameter): ParameterKind => {
  const words = nameWords(`${parameter.name} ${parameter.title}`);
  if (hasAny(words, ["blind", "shade", "slat", "curtain", "shutter"])) return "tilt";
  if (hasAny(words, ["louver", "louvre", "vane", "flap", "swing"])) return "swing";
  if (parameter.unit === "%" || hasAny(words, ["pct", "percent", "position", "slide"])) return "position";
  const choices = (parameter.choices ?? []).map((choice) => choice.value.toLowerCase());
  if (
    parameter.type === "string" &&
    (hasAny(words, ["open", "mode"]) || hasAny(choices, ["tilt", "swing", "open", "ajar"]))
  )
    return "openMode";
  if (parameter.unit === "°" || hasAny(words, ["open", "opened", "door", "lid", "ajar", "angle", "raised"]))
    return "contact";
  return "generic";
};

// ---- Fit -------------------------------------------------------------------------------------------------

/** HA's cover features (`CoverEntityFeature`): set position, open / close / set tilt. */
const coverSetPosition = 4;
const coverTilt = 16 | 32 | 128;
/** HA's climate feature for swing modes (`ClimateEntityFeature.SWING_MODE`). */
const climateSwing = 32;

const contactClasses = ["door", "garage_door", "opening", "window"] as const;
const blindClasses = ["blind", "shade", "curtain", "shutter", "awning"] as const;

const tiltSupport = (entity: SuggestionEntity): boolean =>
  (entity.supportedFeatures & coverTilt) !== 0 || "current_tilt_position" in entity.attributes;
const positionSupport = (entity: SuggestionEntity): boolean =>
  (entity.supportedFeatures & coverSetPosition) !== 0 || "current_position" in entity.attributes;
const swingModes = (entity: SuggestionEntity): boolean =>
  (Array.isArray(entity.attributes.swing_modes) && entity.attributes.swing_modes.length > 0) ||
  (entity.supportedFeatures & climateSwing) !== 0;
const isClass = (entity: SuggestionEntity, classes: readonly string[]): boolean =>
  entity.deviceClass !== null && classes.includes(entity.deviceClass);

/** How many of the parameter's choices (value or title) an entity's `options` offer. */
const matchingOptions = (entity: SuggestionEntity, parameter: SuggestionParameter): number => {
  const options = entity.attributes.options;
  if (!Array.isArray(options)) return 0;
  const offered = new Set(
    options.flatMap((option) => (typeof option === "string" ? [option.toLowerCase()] : [])),
  );
  return (parameter.choices ?? []).filter(
    (choice) => offered.has(choice.value.toLowerCase()) || offered.has(choice.title.toLowerCase()),
  ).length;
};

/** How many text options an entity offers (a select's `options`). */
const stringOptions = (entity: SuggestionEntity): number => {
  const options = entity.attributes.options;
  return Array.isArray(options) ? options.filter((option) => typeof option === "string").length : 0;
};

/** The words of an entity's friendly name and object ID. */
const entityWords = (entity: SuggestionEntity): readonly string[] =>
  nameWords(`${entity.name} ${entity.entityId.split(".")[1] ?? ""}`);

/** Words that name a louver's position in a select ("AC Horizontal Position", "Vane", "Swing"). */
const louverWords: readonly string[] = [
  "position",
  "swing",
  "louver",
  "vane",
  "flap",
  "horizontal",
  "vertical",
];

/** Which way a louver parameter moves, from its words: a flap that swings "down" is vertical; "left"/"right" horizontal. */
const louverDirection = (parameter: SuggestionParameter): "vertical" | "horizontal" | null => {
  const said = nameWords(`${parameter.name} ${parameter.title} ${parameter.description ?? ""}`);
  if (hasAny(said, ["up", "down", "vertical"])) return "vertical";
  if (hasAny(said, ["left", "right", "horizontal"])) return "horizontal";
  return null;
};

/** An entity's fit: 3 the kind of entity meant, 2 a good stand-in, 1 possible; with a short label. */
type Fit = Readonly<{ fit: 1 | 2 | 3; label: string }>;

const fitOf = (fit: 1 | 2 | 3, label: string): Fit => ({ fit, label });
const classLabel = (entity: SuggestionEntity, fallback: string): string => entity.deviceClass ?? fallback;

/** A contact sensor (or a door-like cover, a lock) for an open angle, a door, a lid; windows prefer windows. */
const contactFit = (entity: SuggestionEntity, window: boolean): Fit | null => {
  if (entity.domain === "binary_sensor") {
    if (isClass(entity, contactClasses)) {
      const preferred = window ? entity.deviceClass === "window" : entity.deviceClass !== "window";
      return fitOf(preferred || entity.deviceClass === "opening" ? 3 : 1, classLabel(entity, "contact"));
    }
    return entity.deviceClass === null ? fitOf(1, "binary sensor") : null;
  }
  if (entity.domain === "cover")
    return isClass(entity, ["door", "garage", "gate", "window"])
      ? fitOf(2, classLabel(entity, "cover"))
      : fitOf(1, classLabel(entity, "cover"));
  if (entity.domain === "lock") return fitOf(1, "lock");
  if (entity.domain === "input_boolean") return fitOf(1, "helper");
  return null;
};

const stateFit = (
  entity: SuggestionEntity,
  parameter: SuggestionParameter,
  kind: ParameterKind,
  window: boolean,
): Fit | null => {
  const options = matchingOptions(entity, parameter);
  const isSelect = entity.domain === "select" || entity.domain === "input_select";
  switch (kind) {
    case "tilt":
      if (entity.domain !== "cover") return null;
      if (tiltSupport(entity)) return fitOf(3, `${classLabel(entity, "cover")}, tilt`);
      return fitOf(1, classLabel(entity, "cover"));
    case "swing":
      // A climate's swing mode lumps the directions together (on, vertical, horizontal, both), so when the parameter
      // says which way it moves, a select for that direction (the flap's actual position) ranks first.
      if (entity.domain === "climate")
        return swingModes(entity)
          ? fitOf(louverDirection(parameter) === null ? 3 : 2, "swing modes")
          : fitOf(1, "climate");
      // A select of louver positions ("AC Vertical Position"; 10.5) is as good as the climate's swing modes. When the
      // parameter says which way it moves (a flap that swings "down" is vertical; "left"/"right" is horizontal), the
      // select for the other direction is only a stand-in (the AC we tested with has both).
      if (isSelect) {
        if (stringOptions(entity) === 0 || !hasAny(entityWords(entity), louverWords))
          return fitOf(2, "options");
        const direction = louverDirection(parameter);
        const other =
          direction === "vertical" ? "horizontal" : direction === "horizontal" ? "vertical" : null;
        return other !== null && hasAny(entityWords(entity), [other])
          ? fitOf(2, `${other} positions`)
          : fitOf(3, direction === null ? "positions" : `${direction} positions`);
      }
      if (entity.domain === "fan") return fitOf(1, "fan");
      return null;
    case "position":
      if (entity.domain === "binary_sensor" && isClass(entity, ["door", "garage_door", "opening"]))
        return fitOf(3, classLabel(entity, "contact"));
      if (entity.domain === "binary_sensor" && isClass(entity, ["window"])) return fitOf(2, "window");
      if (entity.domain === "cover") {
        // Blinds have a position too, but they are not the door or window that slides.
        if (isClass(entity, blindClasses)) return fitOf(1, classLabel(entity, "cover"));
        return positionSupport(entity)
          ? fitOf(3, `${classLabel(entity, "cover")}, position`)
          : fitOf(1, "cover");
      }
      if (["sensor", "input_number", "number"].includes(entity.domain)) return fitOf(1, entity.domain);
      return null;
    case "openMode":
      if (isSelect) return options > 0 ? fitOf(3, "options") : fitOf(1, "options");
      if (entity.domain === "sensor" && options > 0) return fitOf(3, "options");
      if (entity.domain === "binary_sensor") {
        if (isClass(entity, ["window", "opening"])) return fitOf(3, classLabel(entity, "contact"));
        if (isClass(entity, contactClasses)) return fitOf(1, classLabel(entity, "contact"));
        return entity.deviceClass === null ? fitOf(1, "binary sensor") : null;
      }
      if (entity.domain === "cover") return fitOf(1, classLabel(entity, "cover"));
      return null;
    case "contact":
      return contactFit(entity, window);
    case "generic":
      if (parameter.type === "boolean")
        return ["binary_sensor", "input_boolean", "switch"].includes(entity.domain)
          ? fitOf(1, classLabel(entity, entity.domain))
          : null;
      if (parameter.type === "number")
        return ["sensor", "input_number", "number"].includes(entity.domain)
          ? fitOf(1, classLabel(entity, entity.domain))
          : null;
      if (isSelect) return options > 0 ? fitOf(3, "options") : fitOf(1, "options");
      return entity.domain === "sensor" && options > 0 ? fitOf(2, "options") : null;
  }
};

/** Domains an object's own entity is (things a person controls or reads). */
const objectDomains: ReadonlySet<string> = new Set([
  "climate",
  "media_player",
  "fan",
  "vacuum",
  "humidifier",
  "water_heater",
  "switch",
  "cover",
  "camera",
  "sensor",
  "binary_sensor",
  "light",
  "lock",
  "valve",
  "lawn_mower",
]);

/** Words in an object's name that point at a domain (an AC → climate, a TV → media_player). */
const domainWords: readonly (readonly [string, readonly string[]])[] = [
  ["climate", ["ac", "aircon", "conditioner", "climate", "thermostat", "heater", "radiator", "hvac", "heat"]],
  ["media_player", ["tv", "television", "speaker", "soundbar", "receiver", "player", "sonos"]],
  ["fan", ["fan", "purifier", "ventilator"]],
  ["vacuum", ["vacuum", "robot"]],
  ["humidifier", ["humidifier", "dehumidifier"]],
  ["camera", ["camera", "doorbell"]],
  ["switch", ["plug", "socket", "outlet"]],
];

const objectFit = (entity: SuggestionEntity, words: readonly string[], opening: boolean): Fit | null => {
  if (opening) {
    if (entity.domain === "binary_sensor" && isClass(entity, contactClasses))
      return fitOf(3, classLabel(entity, "contact"));
    if (entity.domain === "cover") return fitOf(2, classLabel(entity, "cover"));
    if (entity.domain === "lock") return fitOf(1, "lock");
    return null;
  }
  if (!objectDomains.has(entity.domain)) return null;
  const hinted = domainWords.some(([domain, hints]) => domain === entity.domain && hasAny(words, hints));
  return hinted ? fitOf(3, entity.domain) : fitOf(1, classLabel(entity, entity.domain));
};

const roleFit = (role: SuggestionRole, entity: SuggestionEntity, words: readonly string[]): Fit | null => {
  if (role.kind === "light") return entity.domain === "light" ? fitOf(3, "light") : null;
  if (role.kind === "object") return objectFit(entity, words, role.opening);
  return stateFit(entity, role.parameter, parameterKind(role.parameter), words.includes("window"));
};

// ---- Ranking ---------------------------------------------------------------------------------------------

/** States that carry no value: the entity is ranked last. */
const deadStates: ReadonlySet<string> = new Set(["unavailable", "unknown"]);

export type EntitySuggestion = Readonly<{
  entityId: string;
  name: string;
  /** 3 the kind of entity meant, 2 a good stand-in, 1 possible. */
  fit: number;
  /** In the HA area linked to the room. */
  sameArea: boolean;
  /** Distinctive words the entity shares with the thing's or room's name. */
  nameMatches: readonly string[];
  available: boolean;
  score: number;
  areaName: string | null;
  /** Short words for a chip: "door · Living room", "cover, tilt · Kitchen · unavailable". */
  reason: string;
}>;

const objectWordScore = 12;
const genericWordScore = 3;
const roomWordScore = 6;
const nameScoreCap = 36;
const areaScore = 50;
const fitScore = 100;

/**
 * The entities that fit a field, best first: by fit (domain, device class, features), then in the room's HA area,
 * then by the words the entity's friendly name and ID share with the thing's and room's names. Unavailable or
 * unknown entities come last. Entities that do not fit at all are not suggested.
 */
export const suggestEntities = (
  role: SuggestionRole,
  context: SuggestionContext,
  entities: readonly SuggestionEntity[],
  limit = 3,
): readonly EntitySuggestion[] => {
  const words = nameWords(context.name);
  const roomWords = nameWords(context.roomName).filter((word) => !words.includes(word));
  const ranked = entities.flatMap((entity): EntitySuggestion[] => {
    const fit = roleFit(role, entity, words);
    if (fit === null) return [];
    const own = entityWords(entity);
    const shared = words.filter((word) => own.includes(word));
    const sharedRoom = roomWords.filter((word) => own.includes(word));
    const nameScore = Math.min(
      shared.reduce((sum, word) => sum + (genericWords.has(word) ? genericWordScore : objectWordScore), 0) +
        sharedRoom.length * roomWordScore,
      nameScoreCap,
    );
    const sameArea = context.areaId !== null && entity.areaId === context.areaId;
    const available = !deadStates.has(entity.state);
    return [
      {
        entityId: entity.entityId,
        name: entity.name,
        fit: fit.fit,
        sameArea,
        nameMatches: [...shared, ...sharedRoom].filter((word) => !genericWords.has(word)),
        available,
        score: fit.fit * fitScore + (sameArea ? areaScore : 0) + nameScore,
        areaName: entity.areaName,
        reason: [fit.label, entity.areaName, available ? null : "unavailable"]
          .filter((part): part is string => part !== null)
          .join(" · "),
      },
    ];
  });
  return ranked
    .sort(
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        b.score - a.score ||
        a.entityId.localeCompare(b.entityId),
    )
    .slice(0, limit);
};

// ---- A room's HA area ------------------------------------------------------------------------------------

/**
 * The HA area linked to a room: the area of the room binding's entities (its `stateEntityId`, its presence
 * entity), else the HA area whose name has the room's words (case, "'s", and "room" ignored: "Second bedroom" is
 * "second bedroom"); null when none fits.
 */
export const roomHaArea = (
  roomName: string,
  roomEntityIds: readonly string[],
  entities: readonly SuggestionEntity[],
  areas: readonly HaArea[],
): string | null => {
  for (const entityId of roomEntityIds) {
    const areaId = entities.find((entity) => entity.entityId === entityId)?.areaId ?? null;
    if (areaId !== null) return areaId;
  }
  const words = nameWords(roomName);
  if (words.length === 0) return null;
  const matching = areas.filter((area) => {
    const own = nameWords(area.name);
    return words.every((word) => own.includes(word));
  });
  // The closest name: the fewest extra words.
  const best = matching.sort((a, b) => nameWords(a.name).length - nameWords(b.name).length)[0];
  return best?.id ?? null;
};

// ---- Suggestions for a whole room ------------------------------------------------------------------------

/** An object or opening in the room with its state parameters and those already mapped. */
export type RoomSuggestionItem<P extends SuggestionParameter = SuggestionParameter> = Readonly<{
  id: string;
  name: string;
  parameters: readonly P[];
  /** Names of the parameters that already have a mapping (they get no proposal). */
  mapped: readonly string[];
}>;

export type RoomProposal<P extends SuggestionParameter = SuggestionParameter> = Readonly<{
  itemId: string;
  itemName: string;
  parameter: P;
  suggestion: EntitySuggestion;
}>;

/**
 * Proposed bindings for every unmapped state parameter of a room's objects and openings: the best entity that
 * fits well (fit 2 or 3), is available, not in `used` (bound elsewhere), and is in the room's HA area or shares a
 * distinctive word with the thing's or room's name. Each entity goes to one thing at most (a thing may use it for
 * several parameters): the best-scoring pairs are taken first, so a door sensor goes to the door rather than to
 * the washing machine's door in the same room. In item and parameter order.
 */
export const roomProposals = <P extends SuggestionParameter>(
  items: readonly RoomSuggestionItem<P>[],
  room: Readonly<{ name: string; areaId: string | null }>,
  entities: readonly SuggestionEntity[],
  used: ReadonlySet<string>,
): readonly RoomProposal<P>[] => {
  const candidates = items.flatMap((item, itemIndex) =>
    item.parameters
      .filter((parameter) => !item.mapped.includes(parameter.name))
      .flatMap((parameter, parameterIndex) =>
        suggestEntities(
          { kind: "state", parameter },
          { name: item.name, roomName: room.name, areaId: room.areaId },
          entities,
          Number.POSITIVE_INFINITY,
        )
          .filter(
            (suggestion) =>
              suggestion.fit >= 2 &&
              suggestion.available &&
              !used.has(suggestion.entityId) &&
              (suggestion.sameArea || suggestion.nameMatches.length > 0),
          )
          .map((suggestion) => ({ item, itemIndex, parameter, parameterIndex, suggestion })),
      ),
  );
  candidates.sort((a, b) => b.suggestion.score - a.suggestion.score);
  const owner = new Map<string, string>();
  const taken = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const key = `${candidate.item.id}\u0000${candidate.parameter.name}`;
    if (taken.has(key)) continue;
    const holder = owner.get(candidate.suggestion.entityId);
    if (holder !== undefined && holder !== candidate.item.id) continue;
    owner.set(candidate.suggestion.entityId, candidate.item.id);
    taken.set(key, candidate);
  }
  return [...taken.values()]
    .sort((a, b) => a.itemIndex - b.itemIndex || a.parameterIndex - b.parameterIndex)
    .map(({ item, parameter, suggestion }): RoomProposal<P> => ({
      itemId: item.id,
      itemName: item.name,
      parameter,
      suggestion,
    }));
};
