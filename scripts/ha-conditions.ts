// Home Assistant binding checks (D25, spec/home-assistant/bindings.md#verification): the condition evaluator
// against fixed entity states, the schema's accepted and refused shapes, and the pre-8.0 preferences migration.
// Run: npm run ha:conditions
import {
  activeVariant,
  entitiesOf,
  evaluateCondition,
  isShown,
  presenceActive,
  presenceAllowed,
} from "@shared/domain/homeAssistant/conditions";
import type { ConditionEntity } from "@shared/domain/homeAssistant/conditions";
import { haDefaultAction } from "../ha-viewer/haActions";
import { mergeBindings, migrateStoredBindings } from "@shared/domain/homeAssistant/bindings";
import {
  bubbleIcon,
  bubbleText,
  defaultBubbleAction,
  stateWords,
} from "@shared/domain/homeAssistant/bubbles";
import {
  HaAreaBinding,
  HaCondition,
  HaEffectBinding,
  HaHouseBindings,
  HaHouseBubbles,
  HaObjectBinding,
} from "@shared/domain/schemas/homeAssistant";
import { emptyHouseBindings } from "@shared/domain/schemas/homeAssistant";
import type { HaConditionValue, HaEffectBindingValue } from "@shared/domain/schemas/homeAssistant";
import { Preferences, defaultPreferences } from "@shared/domain/schemas/preferences";
import { compileValidator } from "@shared/domain/validation/ajv";
import {
  choiceForOption,
  defaultOpeningAction,
  defaultStateMapping,
  mappedStateValue,
  openingGestureAction,
  openingMainEntity,
  secondSource,
  stateParameterValue,
  supportsTiltPosition,
  tiltClosedValue,
  tiltConventionMap,
  tiltConventionOf,
  tiltPositions,
} from "@shared/domain/homeAssistant/stateParameters";
import {
  haAreas,
  parameterKind,
  roomHaArea,
  roomProposals,
  suggestEntities,
  suggestionEntities,
} from "@shared/domain/homeAssistant/suggestions";
import type { HaRegistries, RoomProposal } from "@shared/domain/homeAssistant/suggestions";
import type { TemplateStateParameter } from "@shared/domain/templates/metadata";
import type { HaObjectBindingValue, HaStateMappingValue } from "@shared/domain/schemas/homeAssistant";
import { createConnectionMemory, memoryLifetimeMs } from "../ha-viewer/connectionMemory";
import { tvContent } from "../ha-viewer/tvLabel";
import { optionalChange } from "../ha-viewer/events";
import { intrusionRooms } from "../ha-viewer/bindingEvaluator";
import {
  bindingTree,
  countText,
  houseSelection,
  isSelected,
  matchesSearch,
  revealKeys,
  searchWords,
} from "../ha-viewer/bindingList";
import { changedKinds, dashboardForSave, prunedBindings, settingsPatch } from "../ha-viewer/settingsDraft";
import { effectiveNavigation, wheelNavigation, withNavigation } from "../ha-viewer/navigationSetting";
import {
  roomColumns,
  roomHasTab,
  roomTitleShown,
  tabForArea,
  withDashboardPath,
  withRoomColumns,
  withRoomTab,
  withRoomTitle,
} from "../ha-viewer/dashboardViews";
import type { ViewLayout } from "../ha-viewer/dashboardViews";
import { roomFrameInsets } from "../ha-viewer/roomInsets";
import { viewerFloor } from "../ha-viewer/viewerFloor";
import { bindingTargets } from "../ha-viewer/bindingTargets";
import {
  floorBindings,
  houseBindings,
  floorView,
  initialView,
  isMultiFloor,
  mainViewOf,
  stepBetween,
  stepView,
  wholeHouse,
  withMainView,
} from "../ha-viewer/floorNavigation";
import type { ViewerView } from "../ha-viewer/floorNavigation";
import { SnapshotDashboard } from "@shared/contracts/homeplanIntegration";
import { createArea, createFloor } from "@shared/domain/house/defaults";
import { createLight } from "@shared/domain/commands/furnishingCommands";
import type { HaDashboardValue, HaHouseBindingsValue } from "@shared/domain/schemas/homeAssistant";
import type { ListItem } from "../ha-viewer/bindingList";
import type { BindingTarget } from "../ha-viewer/bindingTargets";

const states: Readonly<Record<string, ConditionEntity>> = {
  "light.kitchen": { state: "on", attributes: { brightness: 180, color_mode: "color_temp" } },
  "light.hallway": { state: "off", attributes: {} },
  "light.porch": { state: "unavailable", attributes: {} },
  "climate.living_room": {
    state: "cool",
    attributes: { hvac_action: "cooling", current_temperature: 23.5, preset_mode: null },
  },
  "sensor.washer_power": { state: "450.5", attributes: { unit_of_measurement: "W" } },
  "sensor.broken": { state: "unknown", attributes: {} },
  "sensor.empty": { state: "", attributes: {} },
  "binary_sensor.door": { state: "on", attributes: { battery_low: false } },
};
const getEntity = (entityId: string): ConditionEntity | undefined => states[entityId];

type Check = Readonly<{ label: string; pass: boolean; detail: string }>;
const results: Check[] = [];

const expect = (label: string, condition: HaConditionValue, expected: boolean): void => {
  const actual = evaluateCondition(condition, getEntity);
  results.push({
    label,
    pass: actual === expected,
    detail: `expected ${String(expected)}, got ${String(actual)}`,
  });
};

const check = (label: string, pass: boolean, detail = ""): void => {
  results.push({ label, pass, detail });
};

// ---- state ----
expect("state equals", { condition: "state", entity: "light.kitchen", state: "on" }, true);
expect("state differs", { condition: "state", entity: "light.hallway", state: "on" }, false);
expect("state is one of", { condition: "state", entity: "light.hallway", state: ["on", "off"] }, true);
expect("state_not", { condition: "state", entity: "light.hallway", state_not: "on" }, true);
expect("state_not one of", { condition: "state", entity: "light.kitchen", state_not: ["on", "off"] }, false);
// ---- unavailable and missing (HA: a missing entity reads as "unavailable") ----
expect("unavailable is not on", { condition: "state", entity: "light.porch", state: "on" }, false);
expect("unavailable state_not on", { condition: "state", entity: "light.porch", state_not: "on" }, true);
expect("missing reads unavailable", { condition: "state", entity: "light.gone", state: "unavailable" }, true);
expect("missing state_not on", { condition: "state", entity: "light.gone", state_not: "on" }, true);
expect("missing is not on", { condition: "state", entity: "light.gone", state: "on" }, false);
// ---- attribute (extension) ----
expect(
  "attribute equals",
  { condition: "state", entity: "climate.living_room", attribute: "hvac_action", state: "cooling" },
  true,
);
expect(
  "attribute differs",
  { condition: "state", entity: "climate.living_room", attribute: "hvac_action", state: "heating" },
  false,
);
expect(
  "number attribute as text",
  { condition: "state", entity: "light.kitchen", attribute: "brightness", state: "180" },
  true,
);
expect(
  "boolean attribute as text",
  { condition: "state", entity: "binary_sensor.door", attribute: "battery_low", state: "false" },
  true,
);
expect(
  "missing attribute never equals",
  { condition: "state", entity: "climate.living_room", attribute: "fan_mode", state: "auto" },
  false,
);
expect(
  "missing attribute state_not",
  { condition: "state", entity: "climate.living_room", attribute: "fan_mode", state_not: "auto" },
  true,
);
expect(
  "null attribute never equals",
  { condition: "state", entity: "climate.living_room", attribute: "preset_mode", state: "null" },
  false,
);
// ---- numeric_state ----
expect("above", { condition: "numeric_state", entity: "sensor.washer_power", above: 5 }, true);
expect("not above", { condition: "numeric_state", entity: "sensor.washer_power", above: 500 }, false);
expect("below", { condition: "numeric_state", entity: "sensor.washer_power", below: 500 }, true);
expect(
  "between",
  { condition: "numeric_state", entity: "sensor.washer_power", above: 400, below: 500 },
  true,
);
expect(
  "outside",
  { condition: "numeric_state", entity: "sensor.washer_power", above: 451, below: 500 },
  false,
);
expect("strictly above", { condition: "numeric_state", entity: "sensor.washer_power", above: 450.5 }, false);
expect("no bounds holds for a number", { condition: "numeric_state", entity: "sensor.washer_power" }, true);
expect("unknown is not numeric", { condition: "numeric_state", entity: "sensor.broken", below: 1e9 }, false);
expect("empty is not numeric", { condition: "numeric_state", entity: "sensor.empty", below: 1 }, false);
expect("missing is not numeric", { condition: "numeric_state", entity: "sensor.gone", below: 1e9 }, false);
expect(
  "numeric attribute",
  { condition: "numeric_state", entity: "climate.living_room", attribute: "current_temperature", above: 23 },
  true,
);
// ---- and / or ----
const kitchenOn: HaConditionValue = { condition: "state", entity: "light.kitchen", state: "on" };
const hallwayOn: HaConditionValue = { condition: "state", entity: "light.hallway", state: "on" };
expect("and both", { condition: "and", conditions: [kitchenOn, kitchenOn] }, true);
expect("and one fails", { condition: "and", conditions: [kitchenOn, hallwayOn] }, false);
expect("or one holds", { condition: "or", conditions: [hallwayOn, kitchenOn] }, true);
expect("or none", { condition: "or", conditions: [hallwayOn, hallwayOn] }, false);
expect("empty and holds", { condition: "and", conditions: [] }, true);
expect("empty or fails", { condition: "or", conditions: [] }, false);
expect(
  "nested or in and",
  {
    condition: "and",
    conditions: [kitchenOn, { condition: "or", conditions: [hallwayOn, { ...hallwayOn, state: "off" }] }],
  },
  true,
);

// ---- bindings: visibleWhen, variants, entities ----
const cooling: HaConditionValue = {
  condition: "state",
  entity: "climate.living_room",
  attribute: "hvac_action",
  state: "cooling",
};
const heating: HaConditionValue = { ...cooling, state: "heating" };
const swirl: HaEffectBindingValue = {
  visibleWhen: { condition: "or", conditions: [cooling, heating] },
  variants: [
    { when: heating, color: [226, 72, 52] },
    { when: cooling, color: [56, 140, 236] },
  ],
};
check("visibleWhen holds", isShown(swirl, getEntity));
check("no visibleWhen is shown", isShown({}, getEntity));
check("first matching variant", activeVariant(swirl, getEntity)?.color?.[2] === 236);
check("no variant matches", activeVariant({ variants: [{ when: heating }] }, getEntity) === null);
const used = [...entitiesOf({ stateEntityId: "light.kitchen", ...swirl })].sort().join(",");
check("entitiesOf", used === "climate.living_room,light.kitchen", used);
check("entitiesOf without entity", entitiesOf({ stateEntityId: null }).size === 0);

// ---- schema ----
const validateCondition = compileValidator(HaCondition);
check("schema: state", validateCondition(kitchenOn));
check("schema: state and state_not refused", !validateCondition({ ...kitchenOn, state_not: "off" }));
check("schema: unknown condition refused", !validateCondition({ condition: "time", after: "08:00" }));
check("schema: numeric needs a number", !validateCondition({ ...kitchenOn, condition: "numeric_state" }));
check(
  "schema: three levels",
  validateCondition({ condition: "or", conditions: [{ condition: "and", conditions: [kitchenOn] }] }),
);
check(
  "schema: four levels refused",
  !validateCondition({
    condition: "or",
    conditions: [{ condition: "and", conditions: [{ condition: "or", conditions: [kitchenOn] }] }],
  }),
);
check("schema: effect variant", compileValidator(HaEffectBinding)(swirl));

// ---- migration: today's light bindings survive unchanged ----
const before = {
  h_1: {
    lights: {
      l_1: { stateEntityId: "light.kitchen", tapAction: { action: "toggle" } },
      l_2: { stateEntityId: null },
    },
  },
};
const migrated = migrateStoredBindings(before);
const validatePreferences = compileValidator(Preferences);
const preferences = {
  ...defaultPreferences,
  homeAssistant: { ...defaultPreferences.homeAssistant, bindings: migrated },
};
check("migration: valid preferences", validatePreferences(preferences));
check(
  "migration: lights unchanged",
  JSON.stringify(Reflect.get(Reflect.get(migrated, "h_1") ?? {}, "lights")) ===
    JSON.stringify(before.h_1.lights),
);
if (validatePreferences(preferences)) {
  const merged = mergeBindings(preferences.homeAssistant.bindings, {
    h_1: { objects: { o_1: { stateEntityId: "climate.living_room" } } },
  });
  check("patch by kind keeps lights", merged.h_1?.lights.l_1?.stateEntityId === "light.kitchen");
  check("patch by kind sets objects", merged.h_1?.objects.o_1?.stateEntityId === "climate.living_room");
  const added = mergeBindings(preferences.homeAssistant.bindings, { h_2: { areas: {} } });
  check("patch adds a house with every kind", added.h_2?.lights !== undefined && added.h_1 !== undefined);
}

// ---- presence / intrusion (8.6) ----
const motionStates: Readonly<Record<string, ConditionEntity>> = {
  "binary_sensor.hallway_motion": { state: "on", attributes: { device_class: "motion" } },
  "binary_sensor.idle": { state: "off", attributes: {} },
  "alarm_control_panel.home": { state: "triggered", attributes: {} },
  "alarm_control_panel.calm": { state: "armed_away", attributes: {} },
};
const motionLookup = (entityId: string): ConditionEntity | undefined => motionStates[entityId];
check("presence: motion on", presenceActive({ entityId: "binary_sensor.hallway_motion" }, motionLookup));
check("presence: motion off", !presenceActive({ entityId: "binary_sensor.idle" }, motionLookup));
check("presence: alarm triggered", presenceActive({ entityId: "alarm_control_panel.home" }, motionLookup));
check("presence: alarm armed", !presenceActive({ entityId: "alarm_control_panel.calm" }, motionLookup));
check("presence: missing entity", !presenceActive({ entityId: "binary_sensor.gone" }, motionLookup));
check(
  "presence: own condition wins",
  presenceActive(
    {
      entityId: "binary_sensor.idle",
      when: { condition: "state", entity: "alarm_control_panel.calm", state: "armed_away" },
    },
    motionLookup,
  ),
);
const presenceUsed = [
  ...entitiesOf({
    presence: {
      entityId: "binary_sensor.hallway_motion",
      when: { condition: "state", entity: "alarm_control_panel.home", state: "triggered" },
    },
  }),
]
  .sort()
  .join(",");
check(
  "presence: entitiesOf",
  presenceUsed === "alarm_control_panel.home,binary_sensor.hallway_motion",
  presenceUsed,
);
const validateArea = compileValidator(HaAreaBinding);
check("schema: room without presence", validateArea({ stateEntityId: "sensor.t" }));
check(
  "schema: room presence",
  validateArea({ presence: { entityId: "binary_sensor.hallway_motion", corners: [{ x: 0, y: 0 }] } }),
);
check(
  "schema: nine corners refused",
  !validateArea({
    presence: {
      entityId: "binary_sensor.hallway_motion",
      corners: Array.from({ length: 9 }, (_, x) => ({ x, y: 0 })),
    },
  }),
);
check("schema: presence needs an entity", !validateArea({ presence: { corners: [] } }));
// ---- the floor's presence gate (owner, 2026-11-18): a floor sweeps only while its condition holds ----
{
  const gateStates: Readonly<Record<string, ConditionEntity>> = {
    ...motionStates,
    "binary_sensor.kitchen_motion": { state: "on", attributes: {} },
    "alarm_control_panel.disarmed": { state: "disarmed", attributes: {} },
  };
  const gateLookup = (entityId: string): ConditionEntity | undefined => gateStates[entityId];
  const armed = (entity: string): HaConditionValue => ({
    condition: "state",
    entity,
    state: ["armed_away", "armed_home", "armed_night", "armed_vacation", "armed_custom_bypass"],
  });
  check("gate: absent allows", presenceAllowed(undefined, gateLookup) && presenceAllowed({}, gateLookup));
  check(
    "gate: met (alarm armed)",
    presenceAllowed({ presenceWhen: armed("alarm_control_panel.calm") }, gateLookup),
  );
  check(
    "gate: not met (alarm disarmed)",
    !presenceAllowed({ presenceWhen: armed("alarm_control_panel.disarmed") }, gateLookup),
  );
  const floorOf = (areaId: string): string | undefined =>
    ({ hall: "f_ground", kitchen: "f_ground", attic: "f_top" })[areaId];
  const gated = (presenceWhen: HaConditionValue | undefined): HaHouseBindingsValue => ({
    ...emptyHouseBindings(),
    areas: {
      hall: { presence: { entityId: "binary_sensor.hallway_motion", corners: [] } },
      kitchen: { presence: { entityId: "binary_sensor.kitchen_motion" } },
      attic: { presence: { entityId: "binary_sensor.hallway_motion" } },
      idle: { presence: { entityId: "binary_sensor.idle" } },
    },
    ...(presenceWhen === undefined ? {} : { floors: { f_ground: { presenceWhen } } }),
  });
  const sweeping = (bindings: HaHouseBindingsValue): string =>
    intrusionRooms(bindings, floorOf, gateLookup)
      .map((room) => room.areaId)
      .join(",");
  check("gate: absent sweeps every active room", sweeping(gated(undefined)) === "hall,kitchen,attic");
  check(
    "gate: met sweeps the floor's active rooms",
    sweeping(gated(armed("alarm_control_panel.calm"))) === "hall,kitchen,attic",
  );
  check(
    "gate: not met stops the floor's rooms only",
    sweeping(gated(armed("alarm_control_panel.disarmed"))) === "attic",
    sweeping(gated(armed("alarm_control_panel.disarmed"))),
  );
  check(
    "gate: corners pass through",
    intrusionRooms(gated(undefined), floorOf, gateLookup)[0]?.corners?.length === 0,
  );
  const validateHouse = compileValidator(HaHouseBindings);
  check("schema: house without floors", validateHouse(emptyHouseBindings()));
  check(
    "schema: floor gate",
    validateHouse({
      ...emptyHouseBindings(),
      floors: { f_ground: { presenceWhen: armed("alarm_control_panel.x") } },
    }),
  );
  check("schema: empty floor binding", validateHouse({ ...emptyHouseBindings(), floors: { f_ground: {} } }));
  check(
    "schema: unknown floor field refused",
    !validateHouse({
      ...emptyHouseBindings(),
      floors: { f_ground: { when: armed("alarm_control_panel.x") } },
    }),
  );
  const storedGate = migrateStoredBindings({
    h_1: { lights: {}, floors: { f_ground: { presenceWhen: armed("alarm_control_panel.x") } } },
  });
  check(
    "migration: floor gate kept",
    JSON.stringify(Reflect.get(Reflect.get(storedGate, "h_1") ?? {}, "floors")) ===
      JSON.stringify({ f_ground: { presenceWhen: armed("alarm_control_panel.x") } }),
  );
  check(
    "migration: no floors stays absent",
    Reflect.get(Reflect.get(migrateStoredBindings({ h_1: { lights: {} } }), "h_1") ?? {}, "floors") ===
      undefined,
  );
  const base = { h_1: gated(armed("alarm_control_panel.x")) };
  check(
    "patch without floors keeps the gate",
    mergeBindings(base, { h_1: { lights: {} } }).h_1?.floors?.f_ground?.presenceWhen !== undefined,
  );
  check(
    "patch with empty floors clears the gate",
    JSON.stringify(mergeBindings(base, { h_1: { floors: {} } }).h_1?.floors) === "{}",
  );
  const ungated = gated(undefined);
  check(
    "draft: adding a gate patches floors",
    JSON.stringify(changedKinds(ungated, gated(armed("alarm_control_panel.x")))) ===
      JSON.stringify({ floors: { f_ground: { presenceWhen: armed("alarm_control_panel.x") } } }),
  );
  check(
    "draft: removing the last gate stores empty floors",
    JSON.stringify(changedKinds(gated(armed("alarm_control_panel.x")), ungated)) ===
      JSON.stringify({ floors: {} }),
  );
  check(
    "draft: an empty floor binding is not stored or changed",
    !("floors" in prunedBindings({ ...ungated, floors: { f_ground: {} } })) &&
      Object.keys(changedKinds(ungated, { ...ungated, floors: { f_ground: {} } })).length === 0,
  );
}
// ---- bubbles (8.5): storage, migration, content, defaults ----
{
  const migratedBubbles = migrateStoredBindings(before);
  const house = Reflect.get(migratedBubbles, "h_1");
  check(
    "migration: pre-8.5 house gets empty bubbles",
    JSON.stringify(Reflect.get(house ?? {}, "bubbles")) === JSON.stringify({ rooms: {}, placed: {} }),
  );
  const partial = migrateStoredBindings({ h_1: { lights: {}, bubbles: { rooms: { a_1: [] } } } });
  check(
    "migration: partial bubbles filled",
    JSON.stringify(Reflect.get(Reflect.get(partial, "h_1") ?? {}, "bubbles")) ===
      JSON.stringify({ rooms: { a_1: [] }, placed: {} }),
  );
  const bubbles = {
    rooms: {
      a_living: [
        {
          id: "hb_1",
          preset: "temperature",
          stateEntityId: "sensor.living_room_temperature",
          format: "value",
        },
        {
          id: "hb_2",
          preset: "state",
          stateEntityId: "sensor.washer_power",
          icon: "mdi:washing-machine",
          format: "icon",
          visibleWhen: { condition: "numeric_state", entity: "sensor.washer_power", above: 5 },
        },
      ],
    },
    placed: {
      hb_3: {
        preset: "custom",
        stateEntityId: "camera.front_door",
        icon: "mdi:cctv",
        format: "icon",
        style: "bare",
        holdAction: { action: "toggle", entity: "light.porch" },
        anchor: { kind: "point", areaId: "a_hall", positionMm: { x: 100, y: 200, h: 2200 } },
      },
      hb_4: { preset: "light", format: "icon", anchor: { kind: "light", lightId: "l_1" } },
    },
  };
  check("schema: room and placed bubbles", compileValidator(HaHouseBubbles)(bubbles));
  check(
    "schema: bubble with unknown anchor refused",
    !compileValidator(HaHouseBubbles)({
      rooms: {},
      placed: { hb_5: { preset: "custom", format: "icon", anchor: { kind: "wall", wallId: "w_1" } } },
    }),
  );
  if (validatePreferences(preferences)) {
    const merged = mergeBindings(preferences.homeAssistant.bindings, {
      h_1: { bubbles: { rooms: {}, placed: {} } },
    });
    check("patch with bubbles keeps lights", merged.h_1?.lights.l_1?.stateEntityId === "light.kitchen");
    const lightsOnly = mergeBindings(merged, { h_1: { lights: {} } });
    check("patch without bubbles keeps them", lightsOnly.h_1?.bubbles.placed !== undefined);
  }
  const living = { state: "21.46", attributes: { unit_of_measurement: "°C", icon: "mdi:sofa" } };
  check(
    "bubble value with unit",
    bubbleText({ preset: "temperature", format: "value", stateEntityId: "s" }, living) === "21.5 °C",
  );
  check(
    "bubble attribute without unit",
    bubbleText(
      { preset: "temperature", format: "value", stateEntityId: "c", attribute: "current_temperature" },
      states["climate.living_room"],
    ) === "23.5",
  );
  check(
    "bubble state in words",
    bubbleText(
      { preset: "state", format: "state", stateEntityId: "d" },
      { state: "not_home", attributes: {} },
    ) === "Not home",
  );
  check("bubble icon only", bubbleText({ preset: "light", format: "icon" }, living) === null);
  check(
    "bubble missing entity",
    bubbleText({ preset: "temperature", format: "value", stateEntityId: "x" }, undefined) === "Unavailable",
  );
  check(
    "bubble icon: own first",
    bubbleIcon({ preset: "temperature", format: "value", icon: "mdi:a" }, living) === "mdi:a",
  );
  check(
    "bubble icon: entity's",
    bubbleIcon({ preset: "temperature", format: "value" }, living) === "mdi:sofa",
  );
  check(
    "bubble icon: preset's",
    bubbleIcon({ preset: "temperature", format: "value" }, undefined) === "mdi:thermometer",
  );
  check("bubble default tap more-info", defaultBubbleAction("custom", "tap").action === "more-info");
  check("bubble light toggle tap", defaultBubbleAction("light", "tap").action === "toggle");
  check("bubble hold default none", defaultBubbleAction("temperature", "hold").action === "none");
  check("state words", stateWords("on") === "On");
  check(
    "bubble entities for subscriptions",
    [
      ...entitiesOf({
        stateEntityId: "sensor.washer_power",
        visibleWhen: { condition: "numeric_state", entity: "sensor.washer_power", above: 5 },
      }),
    ].join(",") === "sensor.washer_power",
  );
}

// Phase 10.0: editor change events must carry "no condition" as undefined. A plain CustomEvent turns an undefined
// detail into null, which the editors stored and the preferences schema then rejected, so nothing ever saved.
{
  // The DOM types say `detail` is what was passed; at run time an undefined detail reads back as null.
  const rawDetail: unknown = new CustomEvent("x", { detail: undefined }).detail;
  check("CustomEvent turns undefined detail into null (why 10.0 broke)", rawDetail === null);
  check(
    "optionalChange keeps undefined",
    optionalChange<HaConditionValue>("condition-change", undefined).detail.value === undefined,
  );
  const heat: HaConditionValue = { condition: "state", entity: "climate.living_room_ac", state: "heat" };
  check(
    "optionalChange keeps a condition",
    optionalChange<HaConditionValue>("condition-change", heat).detail.value === heat,
  );
  const withObject = (objects: unknown): unknown => ({
    ...defaultPreferences,
    homeAssistant: {
      ...defaultPreferences.homeAssistant,
      bindings: { h_test: { ...emptyHouseBindings(), objects } },
    },
  });
  check(
    "preferences accept an object shown-when condition",
    validatePreferences(withObject({ o_1: { visibleWhen: heat } })),
  );
  check(
    "preferences reject a null shown-when (the old broken save)",
    !validatePreferences(withObject({ o_1: { visibleWhen: null } })),
  );
}

// Phase 10.1: default gestures on doors and windows (openings), from their binding's state mappings.
{
  const contact: HaStateMappingValue = {
    map: { kind: "table", cases: [{ state: "on", value: 90 }], otherwise: 0 },
  };
  const tilt = (entity?: string): HaStateMappingValue => ({
    ...(entity === undefined ? {} : { entity }),
    attribute: "current_tilt_position",
    map: { kind: "threshold", at: 50, atOrBelow: true, above: false },
  });
  const describe = (binding: HaObjectBindingValue, gesture: "tap" | "hold" | "doubleTap"): string => {
    const resolved = openingGestureAction(binding, gesture);
    return resolved === null
      ? "none"
      : `${resolved.action.action}${
          typeof Reflect.get(resolved.action, "perform_action") === "string"
            ? `:${String(Reflect.get(resolved.action, "perform_action"))}`
            : ""
        }@${resolved.entityId ?? "-"}`;
  };
  const door: HaObjectBindingValue = {
    states: { openAngleDeg: { ...contact, entity: "binary_sensor.front_door" } },
  };
  check(
    "opening: main entity from the first mapping",
    openingMainEntity(door) === "binary_sensor.front_door",
  );
  check(
    "opening: door tap more-info",
    describe(door, "tap") === "more-info@binary_sensor.front_door",
    describe(door, "tap"),
  );
  check("opening: door hold more-info", describe(door, "hold") === "more-info@binary_sensor.front_door");
  check("opening: double tap default none", describe(door, "doubleTap") === "none");
  const stateOnly: HaObjectBindingValue = { stateEntityId: "binary_sensor.kitchen_window" };
  check(
    "opening: main entity falls back to stateEntityId",
    describe(stateOnly, "tap") === "more-info@binary_sensor.kitchen_window",
  );
  check(
    "opening: mapping without entity reads stateEntityId",
    openingMainEntity({ stateEntityId: "binary_sensor.w", states: { openMode: contact } }) ===
      "binary_sensor.w",
  );
  check("opening: unbound takes no tap", defaultOpeningAction({}, "tap") === null);
  check(
    "opening: no entity takes no hold",
    describe({ states: { openAngleDeg: contact } }, "hold") === "none",
  );
  const casement: HaObjectBindingValue = {
    states: {
      blindsClosed: tilt("cover.living_room_blinds"),
      openMode: { ...contact, entity: "binary_sensor.kitchen_window" },
    },
  };
  check(
    "opening: blinds cover tap toggles tilt",
    describe(casement, "tap") === "perform-action:cover.toggle_tilt@cover.living_room_blinds",
    describe(casement, "tap"),
  );
  const toggled = openingGestureAction(casement, "tap");
  check(
    "opening: toggle_tilt targets the cover",
    JSON.stringify(toggled === null ? null : Reflect.get(toggled.action, "target")) ===
      JSON.stringify({ entity_id: "cover.living_room_blinds" }),
  );
  check(
    "opening: blinds count last for the main entity (hold)",
    describe(casement, "hold") === "more-info@binary_sensor.kitchen_window",
    describe(casement, "hold"),
  );
  const blindOnly: HaObjectBindingValue = {
    stateEntityId: "cover.kitchen_blinds",
    states: { blindsClosed: tilt() },
  };
  check(
    "opening: blinds from stateEntityId cover",
    describe(blindOnly, "tap") === "perform-action:cover.toggle_tilt@cover.kitchen_blinds",
  );
  check(
    "opening: blinds hold more-info of the cover",
    describe(blindOnly, "hold") === "more-info@cover.kitchen_blinds",
  );
  const sensorBlinds: HaObjectBindingValue = {
    states: { blindsClosed: { ...contact, entity: "binary_sensor.blinds" } },
  };
  check(
    "opening: blinds from a non-cover tap more-info",
    describe(sensorBlinds, "tap") === "more-info@binary_sensor.blinds",
  );
  // HA's action objects carry their own fields (here an entity), kept as given.
  const porchToggle = { action: "toggle", entity: "light.porch" };
  const configured: HaObjectBindingValue = {
    ...door,
    tapAction: porchToggle,
    holdAction: { action: "none" },
    doubleTapAction: { action: "more-info" },
  };
  check("opening: configured tap wins", describe(configured, "tap") === "toggle@binary_sensor.front_door");
  check("opening: configured none takes nothing", describe(configured, "hold") === "none");
  check(
    "opening: configured double tap on the main entity",
    describe(configured, "doubleTap") === "more-info@binary_sensor.front_door",
  );
  check(
    "opening: configured action prefers stateEntityId",
    describe({ ...configured, stateEntityId: "binary_sensor.other" }, "doubleTap") ===
      "more-info@binary_sensor.other",
  );
}

// ---- binding suggestions (10.3) ----
{
  const contact = (name: string, deviceClass: string, state = "off"): ConditionEntity => ({
    state,
    attributes: { friendly_name: name, device_class: deviceClass },
  });
  const suggestionStates: Readonly<Record<string, ConditionEntity>> = {
    "binary_sensor.front_door": contact("Front door", "door"),
    "binary_sensor.bathroom_door": contact("Bathroom door", "door"),
    "binary_sensor.balcony_door": contact("Balcony door", "door"),
    "binary_sensor.kitchen_window": contact("Kitchen window", "window"),
    "binary_sensor.dining_window": contact("Dining window", "window", "unavailable"),
    "binary_sensor.hall_motion": contact("Hall motion", "motion"),
    "binary_sensor.front_door_battery": contact("Front door battery", "battery"),
    "binary_sensor.hidden_door": contact("Hidden door", "door"),
    "cover.living_room_blinds": {
      state: "open",
      attributes: { friendly_name: "Living room blinds", device_class: "blind", supported_features: 255 },
    },
    "cover.living_room_roller": {
      state: "open",
      attributes: {
        friendly_name: "Living room roller",
        device_class: "shade",
        supported_features: 7,
        current_position: 100,
      },
    },
    "cover.garage": {
      state: "closed",
      attributes: {
        friendly_name: "Garage",
        device_class: "garage",
        supported_features: 7,
        current_position: 0,
      },
    },
    "climate.living_room_ac": {
      state: "cool",
      attributes: {
        friendly_name: "Living room AC",
        swing_modes: ["off", "vertical"],
        supported_features: 41,
      },
    },
    "climate.bedroom": { state: "off", attributes: { friendly_name: "Bedroom heating" } },
    "select.ac_vane": {
      state: "auto",
      attributes: { friendly_name: "AC vane", options: ["auto", "up", "down"] },
    },
    "input_select.window_mode": {
      state: "closed",
      attributes: { friendly_name: "Window mode", options: ["closed", "tilt", "swing"] },
    },
    "light.kitchen": { state: "on", attributes: { friendly_name: "Kitchen" } },
    "light.living_room": { state: "off", attributes: { friendly_name: "Living room lamp" } },
    "media_player.living_room_tv": { state: "on", attributes: { friendly_name: "Living room TV" } },
    "sun.sun": { state: "above_horizon", attributes: { friendly_name: "Sun" } },
  };
  const registries: HaRegistries = {
    areas: {
      living_room: { area_id: "living_room", name: "Living room" },
      kitchen: { area_id: "kitchen", name: "Kitchen" },
      children_room: { area_id: "children_room", name: "second bedroom" },
      bathroom: { area_id: "bathroom", name: "Bathroom" },
      dining: { area_id: "dining", name: "Dining room" },
      living_room_balcony: { area_id: "living_room_balcony", name: "Living room balcony" },
    },
    devices: { dev_front: { area_id: "children_room" }, dev_ac: { area_id: "living_room" } },
    entities: {
      "binary_sensor.front_door": { device_id: "dev_front", area_id: null },
      "binary_sensor.front_door_battery": { device_id: "dev_front", entity_category: "diagnostic" },
      "binary_sensor.hidden_door": { area_id: "children_room", hidden: true },
      "binary_sensor.bathroom_door": { area_id: "bathroom" },
      "binary_sensor.balcony_door": { area_id: "living_room" },
      "binary_sensor.kitchen_window": { area_id: "kitchen" },
      "binary_sensor.dining_window": { area_id: "kitchen" },
      "cover.living_room_blinds": { area_id: "living_room" },
      "cover.living_room_roller": { area_id: "living_room" },
      "climate.living_room_ac": { device_id: "dev_ac", area_id: "living_room" },
      "climate.bedroom": { area_id: "bathroom" },
      "light.kitchen": { area_id: "kitchen" },
      "light.living_room": { area_id: "living_room" },
    },
  };
  const entities = suggestionEntities(suggestionStates, registries);
  const ids = (list: readonly { entityId: string }[]): string => list.map((item) => item.entityId).join(",");
  const parameter = (
    name: string,
    title: string,
    type: "number" | "boolean" | "string",
    extra: Partial<TemplateStateParameter> = {},
  ): TemplateStateParameter => ({
    name,
    title,
    type,
    default: type === "number" ? 0 : type === "boolean" ? false : "closed",
    ...extra,
  });
  const openAngle = parameter("openAngleDeg", "Open angle", "number", { unit: "°", minimum: 0, maximum: 90 });
  const openMode = parameter("openMode", "Open", "string", {
    choices: [
      { value: "closed", title: "Closed" },
      { value: "tilt", title: "Tilt" },
      { value: "swing", title: "Swing" },
    ],
  });
  const blinds = parameter("blindsClosed", "Blinds closed", "boolean");
  const louver = parameter("louverAngleDeg", "Louver open", "number", { unit: "°", maximum: 60 });
  const slide = parameter("openPct", "Slide open", "number", { maximum: 100 });
  const area = (id: string): string | null =>
    entities.find((entity) => entity.entityId === id)?.areaId ?? null;
  const state = (p: TemplateStateParameter) => ({ kind: "state", parameter: p }) as const;
  const children = { name: "Entrance door", roomName: "Second bedroom", areaId: "children_room" };

  check("suggest: entity area from its device", area("binary_sensor.front_door") === "children_room");
  check("suggest: entity's own area wins", area("climate.living_room_ac") === "living_room");
  check(
    "suggest: hidden and diagnostic entities left out",
    !entities.some((e) => e.entityId === "binary_sensor.hidden_door" || e.entityId.endsWith("_battery")),
  );
  // The AC we tested with select (2026-11-17): "Fixed 1" … "Fixed 5" are positions, not "stopped".
  {
    const vertical = defaultStateMapping("select", louver, {
      options: [
        "Off",
        "All Positions Swinging",
        "Fixed 1",
        "Fixed 2",
        "Fixed 3",
        "Fixed 4",
        "Fixed 5",
        "3x (1,2,3 Swinging)",
      ],
    });
    const cases = vertical.map.kind === "table" ? vertical.map.cases : [];
    const at = (option: string): unknown => cases.find((entry) => entry.state === option)?.value;
    check(
      "louver: numbered fixed positions spread (the AC we tested with select)",
      at("Off") === 0 &&
        at("Fixed 1") === 12 &&
        at("Fixed 3") === 36 &&
        at("Fixed 5") === 60 &&
        at("All Positions Swinging") === 60,
      JSON.stringify(cases),
    );
  }
  check("suggest: area name", entities.find((e) => e.entityId === "light.kitchen")?.areaName === "Kitchen");
  check(
    "suggest: parameter kinds",
    [openAngle, openMode, blinds, louver, slide, parameter("lidUp", "Lid raised", "boolean")]
      .map(parameterKind)
      .join(",") === "contact,openMode,tilt,swing,position,contact",
    [openAngle, openMode, blinds, louver, slide].map(parameterKind).join(","),
  );
  const door = suggestEntities(state(openAngle), children, entities);
  check(
    "suggest: door angle → the door sensor in the room's area first",
    door[0]?.entityId === "binary_sensor.front_door",
    ids(door),
  );
  check("suggest: three suggestions", door.length === 3, ids(door));
  check("suggest: chip reason", door[0]?.reason === "door · second bedroom", door[0]?.reason);
  check("suggest: same area flagged", door[0]?.sameArea === true && door[1]?.sameArea === false);
  const all = suggestEntities(state(openAngle), children, entities, 50);
  check(
    "suggest: motion sensors, lights, and the sun never fit a door",
    !all.some((s) => ["binary_sensor.hall_motion", "light.kitchen", "sun.sun"].includes(s.entityId)),
    ids(all),
  );
  check(
    "suggest: unavailable last",
    all[all.length - 1]?.entityId === "binary_sensor.dining_window",
    ids(all),
  );
  const bathroom = suggestEntities(
    state(openAngle),
    { name: "Bathroom door", roomName: "Bathroom", areaId: null },
    entities,
  );
  check(
    "suggest: name similarity without an area",
    bathroom[0]?.entityId === "binary_sensor.bathroom_door",
    ids(bathroom),
  );
  const windowAngle = suggestEntities(
    state(openAngle),
    { name: "Kitchen window", roomName: "Kitchen", areaId: "kitchen" },
    entities,
  );
  check(
    "suggest: a window's angle prefers window sensors",
    windowAngle[0]?.entityId === "binary_sensor.kitchen_window",
    ids(windowAngle),
  );
  const mode = suggestEntities(
    state(openMode),
    { name: "Kitchen window", roomName: "Kitchen", areaId: "kitchen" },
    entities,
  );
  check(
    "suggest: window open mode → window sensor in the area",
    mode[0]?.entityId === "binary_sensor.kitchen_window",
    ids(mode),
  );
  check(
    "suggest: open mode → a select offering the choices",
    mode[1]?.entityId === "input_select.window_mode",
    ids(mode),
  );
  const living = { name: "Window above the sofa", roomName: "Living room", areaId: "living_room" };
  const blind = suggestEntities(state(blinds), living, entities);
  check(
    "suggest: blinds → cover with tilt first",
    blind[0]?.entityId === "cover.living_room_blinds",
    ids(blind),
  );
  check("suggest: blinds reason", blind[0]?.reason === "blind, tilt · Living room", blind[0]?.reason);
  check(
    "suggest: blinds → only covers",
    blind.every((s) => s.entityId.startsWith("cover.")),
    ids(blind),
  );
  const ac = {
    name: "AC indoor unit — Charmo Arctic PRO II 18k",
    roomName: "Living room",
    areaId: "living_room",
  };
  const swing = suggestEntities(state(louver), ac, entities);
  check(
    "suggest: louver → climate with swing modes",
    swing[0]?.entityId === "climate.living_room_ac",
    ids(swing),
  );
  check(
    "suggest: louver → a select before a climate without swing",
    swing[1]?.entityId === "select.ac_vane" &&
      !swing.slice(0, 2).some((s) => s.entityId === "climate.bedroom"),
    ids(swing),
  );
  const sliding = suggestEntities(
    state(slide),
    { name: "Balcony sliding doors (living room)", roomName: "Living room", areaId: "living_room" },
    entities,
    50,
  );
  check("suggest: slide → door sensor", sliding[0]?.entityId === "binary_sensor.balcony_door", ids(sliding));
  check(
    "suggest: slide → a position cover before a blind",
    sliding.findIndex((s) => s.entityId === "cover.garage") >= 0 &&
      sliding.findIndex((s) => s.entityId === "cover.garage") <
        sliding.findIndex((s) => s.entityId === "cover.living_room_roller"),
    ids(sliding),
  );
  const main = suggestEntities({ kind: "object", opening: false }, ac, entities);
  check("suggest: AC main entity → climate", main[0]?.entityId === "climate.living_room_ac", ids(main));
  const tv = suggestEntities(
    { kind: "object", opening: false },
    { ...ac, name: "Recessed television" },
    entities,
  );
  check("suggest: TV main entity → media player", tv[0]?.entityId === "media_player.living_room_tv", ids(tv));
  const openingMain = suggestEntities({ kind: "object", opening: true }, children, entities);
  check(
    "suggest: opening main entity → contact",
    openingMain[0]?.entityId === "binary_sensor.front_door",
    ids(openingMain),
  );
  const lights = suggestEntities(
    { kind: "light" },
    { name: "Ceiling", roomName: "Living room", areaId: "living_room" },
    entities,
  );
  check(
    "suggest: lights only, room's area first",
    ids(lights) === "light.living_room,light.kitchen",
    ids(lights),
  );
  const areaList = haAreas(registries);
  check(
    "room area: from the room binding's entity",
    roomHaArea("Hall", ["binary_sensor.front_door"], entities, areaList) === "children_room",
  );
  check(
    'room area: by name ("\'s" and "room" ignored)',
    roomHaArea("Second bedroom", [], entities, areaList) === "children_room",
  );
  check("room area: the closest name", roomHaArea("Living room", [], entities, areaList) === "living_room");
  check("room area: none", roomHaArea("Attic", [], entities, areaList) === null);
  check(
    "room area: no registries",
    haAreas({}).length === 0 && suggestionEntities(suggestionStates, {})[0]?.areaId === null,
  );
  const washer = parameter("doorOpenDeg", "Door open", "number", { unit: "°", maximum: 110 });
  const bathroomItems = [
    { id: "o_washer", name: "Washing machine", parameters: [washer], mapped: [] },
    { id: "o_door", name: "Bathroom door", parameters: [openAngle], mapped: [] },
    { id: "o_window", name: "Small bathroom window", parameters: [openMode, openAngle], mapped: [] },
  ];
  const bathroomProposals = roomProposals(
    bathroomItems,
    { name: "Bathroom", areaId: "bathroom" },
    entities,
    new Set(),
  );
  const describe = (list: readonly RoomProposal[]): string =>
    list.map((p) => `${p.itemId}.${p.parameter.name}=${p.suggestion.entityId}`).join(",");
  check(
    "room: the door sensor goes to the door, not the washer",
    describe(bathroomProposals) === "o_door.openAngleDeg=binary_sensor.bathroom_door",
    describe(bathroomProposals),
  );
  const sofaWindow = {
    id: "o_window",
    name: "Window above the sofa",
    parameters: [openMode, openAngle, blinds],
    mapped: [],
  };
  const acUnit = { id: "o_ac", name: "AC indoor unit", parameters: [louver], mapped: [] };
  const livingItems = [
    sofaWindow,
    { id: "o_slide", name: "Balcony sliding doors (living room)", parameters: [slide], mapped: [] },
    acUnit,
  ];
  const livingProposals = roomProposals(
    livingItems,
    { name: "Living room", areaId: "living_room" },
    entities,
    new Set(),
  );
  check(
    "room: one entity per thing, best fits",
    describe(livingProposals) ===
      "o_window.blindsClosed=cover.living_room_blinds,o_slide.openPct=binary_sensor.balcony_door,o_ac.louverAngleDeg=climate.living_room_ac",
    describe(livingProposals),
  );
  const skipped = roomProposals(
    [{ ...sofaWindow, mapped: ["blindsClosed"] }, acUnit],
    { name: "Living room", areaId: "living_room" },
    entities,
    new Set(["climate.living_room_ac"]),
  );
  check(
    "room: mapped parameters and used entities skipped",
    describe(skipped) === "o_ac.louverAngleDeg=select.ac_vane",
    describe(skipped),
  );
  const entrance = roomProposals(
    [
      { id: "o_glazed", name: "Glazed utility door with blind", parameters: [openAngle], mapped: [] },
      { id: "o_oak", name: "Entrance door", parameters: [openAngle], mapped: [] },
    ],
    { name: "Second bedroom", areaId: "children_room" },
    entities,
    new Set(),
  );
  check(
    "room: the entrance door gets the front door sensor (synonyms)",
    describe(entrance) === "o_oak.openAngleDeg=binary_sensor.front_door",
    describe(entrance),
  );
  const kitchen = roomProposals(
    [{ id: "o_kw", name: "Kitchen window", parameters: [openMode, openAngle], mapped: [] }],
    { name: "Kitchen", areaId: "kitchen" },
    entities,
    new Set(),
  );
  check(
    "room: one thing may use an entity for several parameters; unavailable not proposed",
    describe(kitchen) ===
      "o_kw.openMode=binary_sensor.kitchen_window,o_kw.openAngleDeg=binary_sensor.kitchen_window",
    describe(kitchen),
  );
  // Accepting a suggestion fills in the domain's default mapping, which drives the parameter.
  const accepted: HaStateMappingValue = {
    entity: "binary_sensor.front_door",
    ...defaultStateMapping("binary_sensor", openAngle),
  };
  const lookup = (value: string) => (id: string) =>
    id === "binary_sensor.front_door" ? { state: value, attributes: {} } : undefined;
  check(
    "suggest: accepted door sensor opens the door",
    mappedStateValue(accepted, null, lookup("on")) === 90 &&
      mappedStateValue(accepted, null, lookup("off")) === 0,
  );
  const tilted: HaStateMappingValue = {
    entity: "cover.living_room_blinds",
    ...defaultStateMapping("cover", blinds),
  };
  const cover = (tilt: number) => () => ({ state: "open", attributes: { current_tilt_position: tilt } });
  check(
    "suggest: accepted blinds cover closes at tilt 0",
    mappedStateValue(tilted, null, cover(0)) === true && mappedStateValue(tilted, null, cover(100)) === false,
  );
}

// ---- Tilt conventions and blinds control (10.4) ----
{
  const blinds = { name: "blindsClosed" };
  const cover = (tilt: number | null) => (id: string) =>
    id === "cover.venetian"
      ? { state: "open", attributes: tilt === null ? {} : { current_tilt_position: tilt } }
      : undefined;
  const read = (map: HaStateMappingValue["map"], tilt: number): string => {
    const value = mappedStateValue(
      { entity: "cover.venetian", attribute: "current_tilt_position", map },
      null,
      cover(tilt),
    );
    return value === true ? "closed" : value === false ? "open" : "none";
  };
  const reads = (map: HaStateMappingValue["map"]): string =>
    [0, 25, 50, 75, 100].map((tilt) => read(map, tilt)).join(",");
  const standard = tiltConventionMap("standard", blinds);
  const inverted = tiltConventionMap("inverted", blinds);
  const venetian = tiltConventionMap("venetian", blinds);
  check(
    "tilt: HA standard (0 closed, 100 open; 50 reads closed)",
    reads(standard) === "closed,closed,closed,open,open",
    reads(standard),
  );
  check("tilt: inverted (100 closed)", reads(inverted) === "open,open,open,closed,closed", reads(inverted));
  check(
    "tilt: venetian (50 open, 0 and 100 closed)",
    reads(venetian) === "closed,open,open,open,closed" && read(venetian, 20) === "closed",
    reads(venetian),
  );
  check(
    "tilt: conventions recognised from their maps",
    tiltConventionOf(standard, blinds) === "standard" &&
      tiltConventionOf(inverted, blinds) === "inverted" &&
      tiltConventionOf(venetian, blinds) === "venetian",
  );
  check(
    "tilt: a mapping stored before 10.4 reads as the HA standard",
    tiltConventionOf({ kind: "threshold", at: 50, atOrBelow: true, above: false }, blinds) === "standard",
  );
  check(
    "tilt: a threshold of its own is custom",
    tiltConventionOf({ kind: "threshold", at: 40, atOrBelow: true, above: false }, blinds) === null,
  );
  check(
    "tilt: the cover default is the HA standard",
    JSON.stringify(
      defaultStateMapping("cover", {
        name: "blindsClosed",
        title: "Blinds closed",
        type: "boolean",
        default: false,
      }),
    ) === JSON.stringify({ attribute: "current_tilt_position", map: standard }),
  );
  check(
    "tilt: a parameter about open slats flips the values",
    !tiltClosedValue({ name: "slatsOpen" }) &&
      tiltClosedValue(blinds) &&
      JSON.stringify(tiltConventionMap("standard", { name: "slatsOpen" })) ===
        JSON.stringify({ kind: "threshold", at: 50, atOrBelow: false, above: true }),
  );
  check(
    "tilt: test positions per convention",
    JSON.stringify([standard, inverted, venetian].map((map) => tiltPositions(map, blinds))) ===
      JSON.stringify([
        { open: 100, closed: 0 },
        { open: 0, closed: 100 },
        { open: 50, closed: 0 },
      ]),
  );
  check(
    "tilt: set tilt position feature (128)",
    supportsTiltPosition({ supported_features: 1 | 2 | 16 | 32 | 128 }) &&
      !supportsTiltPosition({ supported_features: 1 | 2 | 16 | 32 }) &&
      !supportsTiltPosition({}),
  );
  const validateObject = compileValidator(HaObjectBinding);
  const venetianBinding: HaObjectBindingValue = {
    states: {
      blindsClosed: { entity: "cover.venetian", attribute: "current_tilt_position", map: venetian },
    },
  };
  check("schema: band map accepted", validateObject(venetianBinding));
  check(
    "schema: band without outside refused",
    !validateObject({
      states: { blindsClosed: { map: { kind: "band", from: 25, to: 75, inside: false } } },
    }),
  );
  check(
    "preferences accept a venetian blinds binding",
    validatePreferences({
      ...defaultPreferences,
      homeAssistant: {
        ...defaultPreferences.homeAssistant,
        bindings: { h_test: { ...emptyHouseBindings(), objects: { o_w: venetianBinding } } },
      },
    }),
  );
  const tap = (binding: HaObjectBindingValue, tilt: number | null | undefined): string => {
    const resolved = openingGestureAction(binding, "tap", tilt === undefined ? undefined : cover(tilt));
    if (resolved === null) return "none";
    const data: unknown = Reflect.get(resolved.action, "data");
    const position: unknown =
      typeof data === "object" && data !== null ? Reflect.get(data, "tilt_position") : null;
    return `${String(Reflect.get(resolved.action, "perform_action"))}${
      typeof position === "number" ? `=${String(position)}` : ""
    }@${resolved.entityId ?? "-"}`;
  };
  check(
    "tilt tap: venetian open (50) shuts to 0",
    tap(venetianBinding, 50) === "cover.set_cover_tilt_position=0@cover.venetian",
    tap(venetianBinding, 50),
  );
  check(
    "tilt tap: venetian shut (0 or 100) opens to 50",
    tap(venetianBinding, 0) === "cover.set_cover_tilt_position=50@cover.venetian" &&
      tap(venetianBinding, 100) === "cover.set_cover_tilt_position=50@cover.venetian",
  );
  check(
    "tilt tap: venetian without a tilt (or no lookup) opens to 50",
    tap(venetianBinding, null) === "cover.set_cover_tilt_position=50@cover.venetian" &&
      tap(venetianBinding, undefined) === "cover.set_cover_tilt_position=50@cover.venetian",
  );
  const withMap = (map: HaStateMappingValue["map"]): HaObjectBindingValue => ({
    states: { blindsClosed: { entity: "cover.venetian", attribute: "current_tilt_position", map } },
  });
  check(
    "tilt tap: standard and inverted toggle the tilt",
    tap(withMap(standard), 50) === "cover.toggle_tilt@cover.venetian" &&
      tap(withMap(inverted), 50) === "cover.toggle_tilt@cover.venetian",
  );
  check(
    "tilt tap: the set position action targets the cover",
    JSON.stringify(
      Reflect.get(openingGestureAction(venetianBinding, "tap", cover(0))?.action ?? {}, "target"),
    ) === JSON.stringify({ entity_id: "cover.venetian" }),
  );
  check(
    "tilt hold: venetian still more-info",
    openingGestureAction(venetianBinding, "hold", cover(50))?.action.action === "more-info",
  );
}

// ---- The remaining state sources (10.5) ----
{
  const parameter = (
    name: string,
    type: "number" | "boolean" | "string",
    extra: Partial<TemplateStateParameter> = {},
  ): TemplateStateParameter => ({
    name,
    title: name,
    type,
    default: type === "number" ? 0 : type === "boolean" ? false : "closed",
    ...extra,
  });
  const openPct = parameter("openPct", "number", { title: "Slide open", minimum: 0, maximum: 100 });
  const openMode = parameter("openMode", "string", {
    title: "Open",
    choices: [
      { value: "closed", title: "Closed" },
      { value: "tilt", title: "Tilt" },
      { value: "swing", title: "Swing" },
    ],
  });
  const louver = parameter("louverAngleDeg", "number", {
    title: "Louver open",
    unit: "°",
    minimum: 0,
    maximum: 60,
  });
  const washerDoor = parameter("doorOpenDeg", "number", {
    title: "Door open",
    unit: "°",
    minimum: 0,
    maximum: 110,
  });
  type Fake = Readonly<Record<string, ConditionEntity>>;
  const value = (mapping: HaStateMappingValue, fakes: Fake, p: TemplateStateParameter): string => {
    const mapped = stateParameterValue(
      p,
      mappedStateValue(mapping, null, (id) => fakes[id]),
    );
    return mapped === undefined ? "keep" : String(mapped);
  };
  const on = (id: string, state: string): Fake => ({ [id]: { state, attributes: {} } });

  // Sliding door: a contact (closed 0, open 100) or a motorised cover's position (linear).
  const slideContact: HaStateMappingValue = {
    entity: "binary_sensor.balcony",
    ...defaultStateMapping("binary_sensor", openPct),
  };
  check(
    "sliding door: contact closed 0, open 100",
    value(slideContact, on("binary_sensor.balcony", "on"), openPct) === "100" &&
      value(slideContact, on("binary_sensor.balcony", "off"), openPct) === "0",
  );
  const slideCover: HaStateMappingValue = {
    entity: "cover.balcony_sliding_door",
    ...defaultStateMapping("cover", openPct),
  };
  const coverAt = (position: number): Fake => ({
    "cover.balcony_sliding_door": { state: "open", attributes: { current_position: position } },
  });
  check(
    "sliding door: motorised cover current_position linear",
    slideCover.attribute === "current_position" &&
      [0, 50, 100].map((position) => value(slideCover, coverAt(position), openPct)).join(",") === "0,50,100",
  );

  // Windows: one contact, two sensors, or a three-state handle.
  const single: HaStateMappingValue = {
    entity: "binary_sensor.window_open",
    ...defaultStateMapping("binary_sensor", openMode),
  };
  check(
    "window: one contact open → swing, closed → closed",
    value(single, on("binary_sensor.window_open", "on"), openMode) === "swing" &&
      value(single, on("binary_sensor.window_open", "off"), openMode) === "closed",
  );
  const second = secondSource("binary_sensor", openMode, single);
  const two: HaStateMappingValue = {
    ...second.first,
    fallback: { entity: "binary_sensor.window_tilted", ...second.fallback },
  };
  check(
    "window: second sensor gets the unused choice (tilt); the first loses its otherwise",
    JSON.stringify(two) ===
      JSON.stringify({
        entity: "binary_sensor.window_open",
        map: { kind: "table", cases: [{ state: ["on", "open"], value: "swing" }] },
        fallback: {
          entity: "binary_sensor.window_tilted",
          map: { kind: "table", cases: [{ state: ["on", "open"], value: "tilt" }], otherwise: "closed" },
        },
      }),
    JSON.stringify(two),
  );
  const sensors = (open: string, tilted: string): Fake => ({
    ...on("binary_sensor.window_open", open),
    ...on("binary_sensor.window_tilted", tilted),
  });
  check(
    "window: two sensors closed / tilted / open",
    [sensors("off", "off"), sensors("off", "on"), sensors("on", "off"), sensors("on", "on")]
      .map((fakes) => value(two, fakes, openMode))
      .join(",") === "closed,tilt,swing,swing",
  );
  check(
    "window: open sensor unavailable falls back to the tilted sensor",
    value(two, sensors("unavailable", "on"), openMode) === "tilt",
  );
  check(
    "window: both sensors subscribed",
    [...entitiesOf(two.fallback === undefined ? {} : { states: { openMode: two } })].join(",") ===
      "binary_sensor.window_open,binary_sensor.window_tilted",
  );
  check(
    "schema: a second entity accepted, a third refused",
    compileValidator(HaObjectBinding)({ states: { openMode: two } }) &&
      !compileValidator(HaObjectBinding)({
        states: { openMode: { ...two, fallback: { ...two.fallback, fallback: two.fallback } } },
      }),
  );
  const handleAttributes = { device_class: "enum", options: ["closed", "tilted", "open"] };
  const handle: HaStateMappingValue = {
    entity: "sensor.window_handle",
    ...defaultStateMapping("sensor", openMode, handleAttributes),
  };
  const handleAt = (state: string): Fake => ({
    "sensor.window_handle": { state, attributes: handleAttributes },
  });
  check(
    "window: three-state handle closed / tilted / open",
    ["closed", "tilted", "open", "broken"]
      .map((state) => value(handle, handleAt(state), openMode))
      .join(",") === "closed,tilt,swing,keep",
  );
  check(
    "window: option words → choices",
    [
      choiceForOption("Tilted", openMode),
      choiceForOption("SWING", openMode),
      choiceForOption("shut", openMode),
      choiceForOption("on", openMode),
      choiceForOption("ajar", openMode),
    ].join(",") === "tilt,swing,closed,swing,",
  );
  const selectMode = defaultStateMapping("select", openMode, { options: ["Closed", "Tilt", "Swing"] });
  check(
    "window: a select's option titles map to the choices",
    value({ entity: "select.w", ...selectMode }, on("select.w", "Tilt"), openMode) === "tilt",
  );

  // AC louver: the climate's swing_mode, or a select of positions.
  const climate = (mode: string, modes: readonly string[] | null): Fake => ({
    "climate.ac": {
      state: "cool",
      attributes: { swing_mode: mode, ...(modes === null ? {} : { swing_modes: modes }) },
    },
  });
  const modes = ["off", "vertical", "horizontal", "both"];
  const swing: HaStateMappingValue = {
    entity: "climate.ac",
    ...defaultStateMapping("climate", louver, { swing_modes: modes }),
  };
  check(
    "louver: swing_mode off → 0, swinging → 60",
    swing.attribute === "swing_mode" &&
      modes.map((mode) => value(swing, climate(mode, modes), louver)).join(",") === "0,60,60,60",
    modes.map((mode) => value(swing, climate(mode, modes), louver)).join(","),
  );
  const named = ["off", "top", "middle", "bottom"];
  const positions: HaStateMappingValue = {
    entity: "climate.ac",
    ...defaultStateMapping("climate", louver, { swing_modes: named }),
  };
  check(
    "louver: named swing positions spread above the stop",
    named.map((mode) => value(positions, climate(mode, named), louver)).join(",") === "0,20,40,60",
    named.map((mode) => value(positions, climate(mode, named), louver)).join(","),
  );
  const bare: HaStateMappingValue = { entity: "climate.ac", ...defaultStateMapping("climate", louver) };
  check(
    "louver: climate without swing_modes: off → 0, else 60",
    value(bare, climate("off", null), louver) === "0" && value(bare, climate("on", null), louver) === "60",
  );
  const vaneOptions = ["off", "1", "2", "3", "4", "5", "swing"];
  const vane: HaStateMappingValue = {
    entity: "select.ac_horizontal_position",
    ...defaultStateMapping("select", louver, { options: vaneOptions }),
  };
  const vaneAt = (option: string): Fake => on("select.ac_horizontal_position", option);
  check(
    "louver: select positions off, 1–5, swing → 0, 12 … 60, 60",
    vaneOptions.map((option) => value(vane, vaneAt(option), louver)).join(",") === "0,12,24,36,48,60,60",
    vaneOptions.map((option) => value(vane, vaneAt(option), louver)).join(","),
  );
  const plain: HaStateMappingValue = {
    entity: "select.ac_horizontal_position",
    ...defaultStateMapping("select", louver, { options: ["top", "middle", "bottom"] }),
  };
  check(
    "louver: plain select options spread evenly over the range",
    ["top", "middle", "bottom"].map((option) => value(plain, vaneAt(option), louver)).join(",") === "0,30,60",
  );
  const louverEntities = suggestionEntities(
    {
      "select.living_room_ac_horizontal_position": {
        state: "3",
        attributes: { friendly_name: "AC Horizontal Position", options: vaneOptions },
      },
      "select.ac_fan_speed": {
        state: "auto",
        attributes: { friendly_name: "AC fan speed", options: ["auto", "low", "high"] },
      },
    },
    {},
  );
  const louverSuggestions = suggestEntities(
    { kind: "state", parameter: louver },
    { name: "Split air conditioner", roomName: "Living room", areaId: null },
    louverEntities,
  );
  check(
    "louver: a position select fits fully, another select as a stand-in",
    louverSuggestions[0]?.entityId === "select.living_room_ac_horizontal_position" &&
      louverSuggestions[0].fit === 3 &&
      louverSuggestions[1]?.fit === 2,
    louverSuggestions.map((item) => `${item.entityId}:${String(item.fit)}`).join(","),
  );

  // Washer and dryer doors: a door sensor opens them like a door (90°, not their 110° maximum).
  const washer: HaStateMappingValue = {
    entity: "binary_sensor.washer_door",
    ...defaultStateMapping("binary_sensor", washerDoor),
  };
  check(
    "appliance door: door sensor open 90, closed 0",
    value(washer, on("binary_sensor.washer_door", "on"), washerDoor) === "90" &&
      value(washer, on("binary_sensor.washer_door", "off"), washerDoor) === "0",
  );
  check(
    "appliance door: a cover still uses the whole range",
    JSON.stringify(defaultStateMapping("cover", washerDoor).map) ===
      JSON.stringify({ kind: "linear", from: { start: 0, end: 100 }, to: { start: 0, end: 110 } }),
  );
}

// The Settings list (10.8): search by name, room, entity ID, and friendly name; tree grouping.
{
  const target = (
    kind: BindingTarget["kind"],
    id: string,
    name: string,
    areaId: string,
    areaName: string,
    opening?: true,
  ): BindingTarget => ({
    kind,
    id,
    name,
    areaId,
    areaName,
    effects: [],
    ...(opening === true ? { opening } : {}),
  });
  const item = (
    bound: BindingTarget,
    entityIds: readonly string[] = [],
    entityNames: readonly string[] = [],
  ): ListItem => ({
    target: bound,
    entityIds,
    entityNames,
    connected: entityIds.length > 0,
  });
  const ceiling = item(
    target("lights", "l1", "Ceiling", "hall", "Hallway"),
    ["light.hallway"],
    ["Hallway ceiling"],
  );
  const frontDoor = item(target("objects", "d1", "Front door", "hall", "Hallway", true), [
    "binary_sensor.front_door",
  ]);
  const pendant = item(target("lights", "l2", "Pendant", "kitchen", "Kitchen"));
  const items: readonly ListItem[] = [
    item(target("areas", "hall", "Hallway", "hall", "")),
    ceiling,
    frontDoor,
    item(target("areas", "kitchen", "Kitchen", "kitchen", ""), ["sensor.kitchen_temperature"]),
    pendant,
    item(target("objects", "o1", "Fridge", "kitchen", "Kitchen")),
    item(target("objects", "w1", "Window", "kitchen", "Kitchen", true)),
    item(target("objects", "d2", "Pantry door", "kitchen", "Kitchen", true)),
  ];
  const names = (list: readonly ListItem[]): string => list.map((entry) => entry.target.name).join(",");
  check("list: blank search has no words", searchWords("  ").length === 0);
  check("list: matches the room, ignoring case", matchesSearch(pendant, searchWords("KITCHEN")));
  check("list: matches the entity ID", matchesSearch(frontDoor, searchWords("front_door")));
  check("list: matches the friendly name", matchesSearch(ceiling, searchWords("hallway ceiling")));
  check("list: every word must match", !matchesSearch(ceiling, searchWords("ceiling kitchen")));
  check(
    "list: words match from their start (door is not indoor)",
    !matchesSearch(
      { ...pendant, target: { ...pendant.target, name: "AC indoor unit" } },
      searchWords("door"),
    ) && matchesSearch(frontDoor, searchWords("door")),
  );

  const tree = bindingTree(items, "");
  const hall = tree[0];
  check(
    "list: tree rooms in floor order, the room's own row first",
    tree.map((room) => room.name).join(",") === "Hallway,Kitchen" && hall?.room?.target.id === "hall",
  );
  check(
    "list: tree groups only when not empty, with counts",
    hall?.groups
      .map((group) => `${group.key}:${String(group.connected)}/${String(group.total)}`)
      .join(",") === "lights:1/1,openings:1/1" &&
      tree[1]?.groups.map((group) => group.key).join(",") === "lights,objects,openings" &&
      tree[1].connected === 1 &&
      tree[1].total === 5,
    hall?.groups.map((group) => group.key).join(","),
  );
  const doors = bindingTree(items, "door");
  check(
    "list: searching hides empty rooms and groups",
    doors
      .map(
        (room) =>
          `${room.name}:${room.room === null ? "" : "room"}:${room.groups.map((group) => names(group.items)).join("|")}`,
      )
      .join(";") === "Hallway::Front door;Kitchen::Pantry door",
    doors.map((room) => room.name).join(","),
  );
  check(
    "list: a searched group keeps its whole count",
    doors[1]?.groups[0]?.total === 2 && doors[1].groups[0].items.length === 1,
  );
  check("list: no matches", bindingTree(items, "garage").length === 0);
}

// The Settings split screen (10.9): one Save patch with only the changed keys, room tabs, and tree selection.
{
  const view = { target: { x: 0, y: 0, h: 0 }, distance: 5, azimuth: 0, polar: 1 };
  const dashboard: HaDashboardValue = {
    urlPath: "homeplan",
    areaTabs: { house: { hall: "hallway" }, other: { kitchen: "k" } },
    areaViews: {},
    areaColumns: {},
  };
  const saved = {
    ...emptyHouseBindings(),
    lights: { l1: { stateEntityId: "light.hallway" } },
    areas: { hall: { presence: { entityId: "binary_sensor.hall_motion" } } },
  };
  const input = {
    houseId: "house",
    savedBindings: saved,
    draftBindings: saved,
    savedDashboard: dashboard,
    draftDashboard: dashboard,
    currentDashboard: dashboard,
  };
  check("settings: nothing changed, nothing saved", settingsPatch(input) === null);
  check(
    "settings: an emptied binding left in the draft is no change",
    settingsPatch({
      ...input,
      draftBindings: { ...saved, objects: { o1: {} }, areas: { ...saved.areas, kitchen: {} } },
    }) === null,
  );
  check(
    "settings: key order is no change",
    Object.keys(
      changedKinds(saved, {
        ...saved,
        areas: { hall: { presence: { entityId: "binary_sensor.hall_motion" } } },
        lights: { l1: { stateEntityId: "light.hallway" } },
      }),
    ).length === 0,
  );
  const lightPatch = settingsPatch({
    ...input,
    draftBindings: { ...saved, lights: { l1: { stateEntityId: "light.hall_2" } } },
  });
  check(
    "settings: a changed light sends only the lights",
    JSON.stringify(lightPatch) ===
      JSON.stringify({ bindings: { house: { lights: { l1: { stateEntityId: "light.hall_2" } } } } }),
    JSON.stringify(lightPatch),
  );
  check(
    "settings: a presence-only room is kept",
    prunedBindings(saved).areas.hall?.presence?.entityId === "binary_sensor.hall_motion",
  );
  const bubble = {
    id: "hb1",
    preset: "temperature" as const,
    format: "icon" as const,
    stateEntityId: "sensor.t",
  };
  const bubblePatch = settingsPatch({
    ...input,
    draftBindings: { ...saved, bubbles: { ...saved.bubbles, rooms: { hall: [bubble] } } },
  });
  check(
    "settings: room bubbles send the bubbles",
    bubblePatch?.bindings?.house?.bubbles?.rooms.hall?.[0]?.id === "hb1" &&
      bubblePatch.bindings.house.lights === undefined &&
      bubblePatch.dashboard === undefined,
  );
  const tabbed = withRoomTab(dashboard, "house", "kitchen", "cooking");
  check(
    "settings: a room tab is set per house and room",
    tabbed.areaTabs.house?.kitchen === "cooking" &&
      tabbed.areaTabs.house.hall === "hallway" &&
      tabbed.areaTabs.other?.kitchen === "k",
  );
  check(
    "settings: an empty tab matches by name again",
    withRoomTab(dashboard, "house", "hall", "").areaTabs.house?.hall === undefined,
  );
  const switched = withDashboardPath(dashboard, "house", "lovelace");
  check(
    "settings: another dashboard drops this house's tabs only",
    switched.urlPath === "lovelace" &&
      switched.areaTabs.house === undefined &&
      switched.areaTabs.other?.kitchen === "k" &&
      withDashboardPath(dashboard, "house", "homeplan") === dashboard,
  );
  const current = { ...dashboard, areaViews: { house: { hall: view } } };
  const both = settingsPatch({
    ...input,
    draftBindings: { ...saved, lights: {} },
    draftDashboard: withRoomColumns(tabbed, "house", "hall", 2),
    currentDashboard: current,
  });
  check(
    "settings: one patch holds the bindings and the dashboard",
    both?.bindings?.house?.lights !== undefined &&
      Object.keys(both.bindings.house.lights).length === 0 &&
      both.dashboard?.areaColumns.house?.hall === 2 &&
      both.dashboard.areaTabs.house?.kitchen === "cooking",
  );
  const panelLayout: ViewLayout = { kind: "panel", cards: [] };
  const views = [
    { key: "kuhinja", path: "kuhinja", title: "Kuhinja", label: "Kuhinja", layout: panelLayout },
    { key: "hall", path: "hall", title: "Hall", label: "Hall", layout: panelLayout },
  ];
  check(
    "settings: a room's tab matches its own name first, then its HA area's name",
    tabForArea(views, undefined, "Hall", "Kuhinja")?.key === "hall" &&
      tabForArea(views, undefined, "Kitchen", "Kuhinja")?.key === "kuhinja" &&
      tabForArea(views, undefined, "Kitchen", null) === null,
  );
  check(
    "settings: a room paired only with an HA area is kept on save",
    prunedBindings({ ...emptyHouseBindings(), areas: { hall: { haAreaId: "hallway" } } }).areas.hall
      ?.haAreaId === "hallway",
  );
  const wide = withRoomColumns(dashboard, "house", "hall", 2);
  check(
    "settings: panel width is per room, one column by default",
    roomColumns(dashboard, "house", "hall") === 1 &&
      roomColumns(wide, "house", "hall") === 2 &&
      roomColumns(wide, "house", "other") === 1 &&
      roomColumns(wide, null, "hall") === 1 &&
      withRoomColumns(wide, "house", "hall", 1).areaColumns.house?.hall === undefined,
  );
  const titled = withRoomTitle(dashboard, "house", "hall", true);
  check(
    "settings: a room title is per room, hidden by default, and saved with Settings (14.4)",
    !roomTitleShown(dashboard, "house", "hall") &&
      roomTitleShown(titled, "house", "hall") &&
      !roomTitleShown(titled, "house", "other") &&
      !roomTitleShown(titled, null, "hall") &&
      withRoomTitle(titled, "house", "hall", false).areaTitles?.house?.hall === undefined &&
      dashboardForSave(dashboard, titled, current)?.areaTitles?.house?.hall === true,
  );
  check(
    "settings: a room position saved meanwhile is kept",
    both?.dashboard?.areaViews.house?.hall?.distance === 5,
  );
  check(
    "settings: an unchanged dashboard is not sent",
    dashboardForSave(dashboard, { ...dashboard, areaViews: { house: { hall: view } } }, current) === null,
  );
  const mouse = withNavigation(dashboard, "mouse");
  check(
    "settings: navigation follows the device until chosen, then is saved with Settings (14.6)",
    effectiveNavigation(dashboard, true) === "touch" &&
      effectiveNavigation(dashboard, false) === "trackpad" &&
      effectiveNavigation(mouse, true) === "mouse" &&
      dashboardForSave(dashboard, mouse, current)?.navigation === "mouse" &&
      dashboardForSave(mouse, mouse, current) === null &&
      dashboardForSave(dashboard, dashboard, current)?.navigation === undefined &&
      wheelNavigation("trackpad") === "trackpad" &&
      wheelNavigation("mouse") === "mouse" &&
      wheelNavigation("touch") === "mouse",
  );
  check(
    "settings: stored settings without a navigation stay valid, and each mode validates (14.6)",
    validatePreferences(defaultPreferences) &&
      (["trackpad", "mouse", "touch"] as const).every((navigation) =>
        validatePreferences({
          ...defaultPreferences,
          homeAssistant: {
            ...defaultPreferences.homeAssistant,
            dashboard: { ...defaultPreferences.homeAssistant.dashboard, navigation },
          },
        }),
      ),
  );

  const lamp: BindingTarget = {
    kind: "lights",
    id: "l1",
    name: "Lamp",
    areaId: "hall",
    areaName: "Hallway",
    effects: [],
  };
  const door: BindingTarget = { ...lamp, kind: "objects", id: "d1", name: "Door", opening: true };
  const hallRoom: BindingTarget = { ...lamp, kind: "areas", id: "hall", name: "Hallway", areaName: "" };
  check(
    "settings: a tapped thing opens its room and group",
    JSON.stringify(revealKeys(lamp)) === JSON.stringify({ room: "hall", group: "hall/lights" }) &&
      revealKeys(door).group === "hall/openings" &&
      JSON.stringify(revealKeys(hallRoom)) === JSON.stringify({ room: "hall", group: null }),
  );
  check(
    "settings: selection matches kind and ID",
    isSelected({ kind: "lights", id: "l1" }, lamp) &&
      !isSelected({ kind: "objects", id: "l1" }, lamp) &&
      !isSelected(houseSelection, lamp),
  );
  check("settings: small count text", countText(2, 28) === "(2 of 28)");
}

// ---- Hidden things in the HA viewer (owner, 2026-11-17) ----
{
  const kept = createLight("Kept", { x: 500, y: 500 });
  const unused = { ...createLight("Unused", { x: 900, y: 500 }), hidden: true };
  const room = { ...createArea("Room", { x: 0, y: 0 }), lights: [kept, unused] };
  const spare = { ...createArea("Spare", { x: 5000, y: 0 }), hidden: true };
  const floor = { ...createFloor("Ground"), areas: [room, spare] };
  const shown = viewerFloor(floor);
  const ids = new Set(bindingTargets(shown).map((target) => target.id));
  check(
    "hidden: a hidden light gives no light and has no Settings row; a visible one stays",
    !shown.areas.some((area) => area.lights.some((light) => light.id === unused.id)) &&
      !ids.has(unused.id) &&
      ids.has(kept.id),
  );
  check(
    "hidden: a hidden room is left out of the viewer and Settings",
    !ids.has(spare.id) && ids.has(room.id),
  );
}

// ---- TV screen label (Phase 15.2) ----
{
  const label = (state: string, attributes: Record<string, unknown>): string | null =>
    tvContent("media_player.tv", state, attributes)?.label ?? null;
  check("tv: Netflix by app_name", label("playing", { app_name: "Netflix" }) === "Netflix");
  check(
    "tv: Netflix by app_id package",
    label("on", { app_id: "com.netflix.ninja", source: "HDMI 1" }) === "Netflix",
  );
  check(
    "tv: a package in app_name is mapped too",
    label("on", { app_name: "com.google.android.youtube.tv" }) === "YouTube",
  );
  check("tv: unknown package is tidied", label("on", { app_id: "com.example.myapp" }) === "Myapp");
  check(
    "tv: tidy skips a generic last segment",
    label("on", { app_id: "com.foo.bar_baz.android" }) === "Bar Baz",
  );
  check(
    "tv: app beats channel and input",
    label("on", { app_name: "Plex", media_channel: "BBC One", source: "HDMI 1" }) === "Plex",
  );
  check("tv: channel beats input", label("on", { media_channel: "BBC One", source: "HDMI 1" }) === "BBC One");
  check(
    "tv: live-TV title is the channel",
    label("on", { media_content_type: "channel", media_title: "RTL" }) === "RTL",
  );
  check("tv: HDMI input", label("on", { source: "HDMI 1" }) === "HDMI 1");
  check(
    "tv: generic source loses to the channel",
    label("on", { source: "TV", media_channel: "ZDF" }) === "ZDF",
  );
  check("tv: generic source alone is still shown", label("on", { source: "TV" }) === "TV");
  check("tv: nothing supplied is On", label("on", { friendly_name: "Living room TV" }) === "On");
  check(
    "tv: artwork and label together",
    ((c) => c?.picture === "/api/media_player_proxy/x?token=1" && c.label === "YouTube")(
      tvContent("media_player.tv", "playing", {
        app_name: "YouTube",
        entity_picture: "/api/media_player_proxy/x?token=1",
      }),
    ),
  );
  check(
    "tv: off, standby, unavailable are dark",
    ["off", "standby", "unavailable", "unknown"].every(
      (state) => label(state, { app_name: "Netflix" }) === null,
    ),
  );
  check("tv: a non-media_player is dark", tvContent("light.tv", "on", { app_name: "Netflix" }) === null);
}

// ---- 15.6: rooms without a dashboard tab open full-screen ----
{
  const views = [
    {
      key: "kitchen",
      label: "Kitchen",
      path: "kitchen",
      title: "Kitchen",
      layout: { kind: "masonry" as const, cards: [] },
    },
  ];
  const dash = { urlPath: "d", areaTabs: {}, areaViews: {}, areaColumns: {} };
  check("room tab: matched by name", roomHasTab(views, dash, "h", "a1", "Kitchen", null));
  check("room tab: none for another name", !roomHasTab(views, dash, "h", "a2", "the balcony", null));
  check("room tab: no tabs at all (read error)", !roomHasTab([], dash, "h", "a1", "Kitchen", null));
  check(
    "room tab: chosen tab",
    roomHasTab(views, { ...dash, areaTabs: { h: { a2: "kitchen" } } }, "h", "a2", "the balcony", null),
  );
  const none = roomFrameInsets(1400, false, 1);
  check(
    "room insets: no tab means zero insets",
    none.left === 0 && none.right === 0 && none.top === 0 && none.bottom === 0,
  );
  check("room insets: no tab, narrow screen, zero", roomFrameInsets(500, false, 2).bottom === 0);
  check("room insets: tab on a wide screen takes the right side", roomFrameInsets(1400, true, 1).right > 0.2);
  check(
    "room insets: tab on a narrow screen takes the bottom sheet",
    roomFrameInsets(500, true, 1).bottom === 0.6,
  );
}

{
  let now = 1_000_000;
  const memory = createConnectionMemory<object, string>(() => now);
  const client = {};
  check("connection memory: nothing before a connect", memory.view(client) === undefined);
  memory.remember(client, "houses A");
  now += 60_000;
  const fresh = memory.view(client);
  check(
    "connection memory: fresh hit within 15 minutes",
    fresh?.value === "houses A" && fresh.state === "connected",
  );
  now += memoryLifetimeMs;
  const stale = memory.view(client);
  check(
    "connection memory: stale after 15 minutes, data kept",
    stale?.value === "houses A" && stale.state === "expired",
  );
  memory.remember(client, "houses B");
  const replaced = memory.view(client);
  check(
    "connection memory: refresh replaces and is connected again",
    replaced?.value === "houses B" && replaced.state === "connected",
  );
  memory.markFailed(client);
  const failed = memory.view(client);
  check(
    "connection memory: failed refresh keeps data, marked",
    failed?.value === "houses B" && failed.state === "notRefreshed",
  );
  memory.remember(client, "houses C");
  check("connection memory: a later success clears the mark", memory.view(client)?.state === "connected");
  memory.forget(client);
  check("connection memory: forget drops it", memory.view(client) === undefined);
  const other = {};
  check("connection memory: no auto-fetch before the first success", !memory.autoRefresh(other));
  memory.markFailed(other);
  check("connection memory: a failure before any success changes nothing", !memory.autoRefresh(other));
  memory.remember(other, "x");
  check("connection memory: auto-fetch after a success", memory.autoRefresh(other));
  now += memoryLifetimeMs * 2;
  check("connection memory: auto-fetch still on when stale", memory.autoRefresh(other));
  memory.markFailed(other);
  check("connection memory: one failure switches auto-fetch off", !memory.autoRefresh(other));
  check("connection memory: data stays shown after the switch-off", memory.view(other)?.value === "x");
  memory.remember(other, "y");
  check("connection memory: a manual Connect success re-enables auto-fetch", memory.autoRefresh(other));
}

// ---- floors and the whole house (16.1, 16.3) ----
{
  // Document order differs from elevation order on purpose: Up / Down follow elevation (ties keep document order).
  const attic = { ...createFloor("Attic", 5500), id: "attic" };
  const ground = { ...createFloor("Ground", 0), id: "ground" };
  const first = { ...createFloor("First", 2800), id: "first" };
  const floors = [attic, ground, first];
  const show = (view: ViewerView | null): string =>
    view === null ? "null" : view.kind === "house" ? "house" : view.floorId;
  check("floors: one floor is not multi-floor", !isMultiFloor([ground]) && isMultiFloor(floors));
  check(
    "floors: Up climbs by elevation and goes from the top floor to the whole house",
    show(stepView(floors, floorView("ground"), "up")) === "first" &&
      show(stepView(floors, floorView("first"), "up")) === "attic" &&
      show(stepView(floors, floorView("attic"), "up")) === "house" &&
      stepView(floors, wholeHouse, "up") === null,
  );
  check(
    "floors: Down descends, is disabled at the bottom floor, and goes from the house to the top floor",
    show(stepView(floors, wholeHouse, "down")) === "attic" &&
      show(stepView(floors, floorView("first"), "down")) === "ground" &&
      stepView(floors, floorView("ground"), "down") === null,
  );
  check(
    "floors: a one-floor house has no floor steps; an unknown floor none",
    stepView([ground], floorView("ground"), "up") === null &&
      stepView(floors, floorView("gone"), "up") === null,
  );
  const tied = [
    { ...createFloor("B", 0), id: "b" },
    { ...createFloor("A", 0), id: "a" },
  ];
  check("floors: equal elevations keep document order", show(stepView(tied, floorView("b"), "up")) === "a");
  check(
    "floors: switch direction (the house is above every floor)",
    stepBetween(floors, wholeHouse, floorView("ground")) === "down" &&
      stepBetween(floors, floorView("ground"), floorView("attic")) === "up" &&
      stepBetween(floors, floorView("attic"), wholeHouse) === "up" &&
      stepBetween(floors, floorView("first"), floorView("first")) === null,
  );
  check(
    "main view: a multi-floor house opens on the whole house by default",
    show(initialView(floors, null)) === "house",
  );
  check("main view: a configured floor opens directly", show(initialView(floors, "first")) === "first");
  check(
    "main view: a deleted or missing floor falls back to the whole house",
    show(initialView(floors, "deleted")) === "house",
  );
  check(
    "main view: a one-floor house opens on its floor whatever is stored",
    show(initialView([ground], "first")) === "ground" && initialView([], null) === null,
  );
  const base: HaDashboardValue = { urlPath: null, areaTabs: {}, areaViews: {}, areaColumns: {} };
  const chosen = withMainView(withMainView(base, "h1", "first"), "h2", "attic");
  const reset = withMainView(chosen, "h1", null);
  check(
    "main view: stored per house by floor ID; Whole house removes the entry (and the empty map)",
    mainViewOf(chosen, "h1") === "first" &&
      mainViewOf(chosen, "h2") === "attic" &&
      mainViewOf(reset, "h1") === null &&
      mainViewOf(reset, "h2") === "attic" &&
      withMainView(reset, "h2", null).mainViews === undefined &&
      mainViewOf(base, null) === null,
  );
  const current = { ...chosen, urlPath: "rooms" };
  check(
    "main view: saved with Settings; clearing the last one leaves the field out (older integrations accept the Save)",
    dashboardForSave(base, chosen, base)?.mainViews?.h1 === "first" &&
      dashboardForSave(chosen, withMainView(withMainView(chosen, "h1", null), "h2", null), current)
        ?.mainViews === undefined &&
      dashboardForSave(base, withNavigation(base, "mouse"), base)?.mainViews === undefined &&
      dashboardForSave(chosen, chosen, current) === null,
  );
  const validateSnapshotDashboard = compileValidator(SnapshotDashboard);
  check(
    "main view: preferences and snapshot dashboards accept mainViews and settings without it",
    validatePreferences({
      ...defaultPreferences,
      homeAssistant: { ...defaultPreferences.homeAssistant, dashboard: chosen },
    }) &&
      validateSnapshotDashboard(chosen) &&
      validateSnapshotDashboard(base) &&
      !validateSnapshotDashboard({ ...base, mainViews: { h1: "" } }),
  );

  // Live bindings follow only the shown floor (16.3).
  const living = createArea("Living", { x: 0, y: 0 });
  const lamp = createLight("Lamp", { x: 0, y: 0 });
  living.lights.push(lamp);
  const bedroom = createArea("Bedroom", { x: 0, y: 0 });
  const bedLamp = createLight("Bed lamp", { x: 0, y: 0 });
  bedroom.lights.push(bedLamp);
  const down = { ...ground, areas: [living] };
  const up = { ...first, areas: [bedroom] };
  const bindings: HaHouseBindingsValue = {
    ...emptyHouseBindings(),
    lights: {
      [lamp.id]: { stateEntityId: "light.living" },
      [bedLamp.id]: { stateEntityId: "light.bed" },
    },
    areas: {
      [living.id]: { stateEntityId: "binary_sensor.living" },
      [bedroom.id]: { stateEntityId: "binary_sensor.bed" },
    },
    bubbles: {
      rooms: { [bedroom.id]: [{ id: "b1", preset: "custom", format: "icon" }] },
      placed: {
        p1: { preset: "custom", format: "icon", anchor: { kind: "light", lightId: lamp.id } },
        p2: {
          preset: "custom",
          format: "icon",
          anchor: { kind: "point", areaId: bedroom.id, positionMm: { x: 0, y: 0, h: 0 } },
        },
      },
    },
    floors: { ground: { presenceWhen: { condition: "state", entity: "input_boolean.away", state: "on" } } },
  };
  const groundLive = floorBindings(bindings, down);
  const firstLive = floorBindings(bindings, up);
  const noneLive = floorBindings(bindings, null);
  // The whole house (18.1): every floor's lights and things, nothing else (no rooms, bubbles, gates, effects).
  const houseLive = houseBindings(bindings, [down, up]);
  check(
    "live bindings: a floor follows only its own lights, rooms, bubbles and presence gate",
    Object.keys(groundLive.lights).join() === lamp.id &&
      Object.keys(groundLive.areas).join() === living.id &&
      Object.keys(groundLive.bubbles.placed).join() === "p1" &&
      Object.keys(groundLive.bubbles.rooms).length === 0 &&
      groundLive.floors?.ground !== undefined &&
      Object.keys(firstLive.lights).join() === bedLamp.id &&
      Object.keys(firstLive.bubbles.placed).join() === "p2" &&
      Object.keys(firstLive.bubbles.rooms).join() === bedroom.id &&
      firstLive.floors === undefined,
  );
  check(
    "live bindings: no floor follows none",
    Object.keys(noneLive.lights).length === 0 &&
      Object.keys(noneLive.areas).length === 0 &&
      Object.keys(noneLive.bubbles.placed).length === 0,
  );
  const houseEntities = new Set(Object.values(houseLive.lights).map((binding) => binding.stateEntityId));
  check(
    "live bindings: the whole house follows every floor's lights (one listener per entity), no rooms, bubbles or gates",
    Object.keys(houseLive.lights).sort().join() === [lamp.id, bedLamp.id].sort().join() &&
      houseEntities.size === 2 &&
      Object.keys(houseLive.areas).length === 0 &&
      Object.keys(houseLive.bubbles.placed).length === 0 &&
      Object.keys(houseLive.bubbles.rooms).length === 0 &&
      Object.keys(houseLive.effects).length === 0 &&
      houseLive.floors === undefined,
    `${String(houseEntities.size)} light entities`,
  );
  check(
    "live bindings: the departing floor's entities are no longer used",
    !Object.values(firstLive.lights).some((binding) => binding.stateEntityId === "light.living") &&
      Object.values(groundLive.lights).some((binding) => binding.stateEntityId === "light.living"),
  );
}

// Phase 21: HA's own gesture defaults for a thing's entity, and "Never" (an empty or), which no state meets.
{
  const tap = (entityId: string | null): string => haDefaultAction(entityId, "tap").action;
  check(
    "gesture defaults: a tap toggles HA's toggleable domains (light, switch, fan)",
    tap("light.kitchen") === "toggle" && tap("switch.kettle") === "toggle" && tap("fan.bedroom") === "toggle",
  );
  check(
    "gesture defaults: a tap opens more-info for other domains (climate, sensor, cover) and without an entity",
    tap("climate.living_room") === "more-info" &&
      tap("sensor.power") === "more-info" &&
      tap("cover.blinds") === "more-info" &&
      tap(null) === "more-info",
  );
  check(
    "gesture defaults: hold opens more-info, double tap does nothing",
    haDefaultAction("switch.kettle", "hold").action === "more-info" &&
      haDefaultAction("switch.kettle", "doubleTap").action === "none",
  );
  check(
    "Never (an empty or) is never met, whatever the states",
    !evaluateCondition({ condition: "or", conditions: [] }, () => ({ state: "on", attributes: {} })),
  );
}

let failures = 0;
for (const result of results) {
  if (!result.pass) failures += 1;
  console.log(
    `  ${result.pass ? "PASS" : "FAIL"}  ${result.label}${result.detail === "" ? "" : `  (${result.detail})`}`,
  );
}
console.log(failures === 0 ? `\nAll ${results.length} checks PASS` : `\n${failures} check(s) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
