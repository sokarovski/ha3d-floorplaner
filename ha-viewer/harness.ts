// Dev-only fake Home Assistant for harness.html: sets panel, narrow, and a new hass object per change,
// keeping unchanged entity objects identical like HA does.
import "./main";
import { createId } from "@shared/domain/ids";
import type { HaHouseBubblesValue } from "@shared/domain/schemas/homeAssistant";
import type { Hass, HassEntity } from "./hassStore";

const entity = (entityId: string, name: string, state: string): HassEntity => ({
  entity_id: entityId,
  state,
  attributes: { friendly_name: name },
  last_changed: new Date().toISOString(),
});

let states: Record<string, HassEntity> = {
  "light.kitchen": entity("light.kitchen", "Kitchen", "off"),
  "light.hallway": entity("light.hallway", "Hallway", "off"),
  "sensor.living_room_temperature": {
    ...entity("sensor.living_room_temperature", "Living room", "21.5"),
    attributes: { friendly_name: "Living room", unit_of_measurement: "°C" },
  },
};

/**
 * A fake AC (Phase 8): `climate.living_room` cycles cooling → heating → idle (the Cycle climate button), with
 * HA's `hvac_action` attribute, for binding conditions such as "hvac_action is cooling".
 */
const climateSteps = [
  { state: "cool", action: "cooling" },
  { state: "heat", action: "heating" },
  { state: "cool", action: "idle" },
] as const;
let climateStep = 0;
/** The AC's swing modes (10.5: the louver angle from `swing_mode`; the AC swing button steps them). */
const swingModes = ["off", "vertical", "horizontal", "both"] as const;
let swingStep = 1;
const climateEntity = (): HassEntity => {
  const step = climateSteps[climateStep % climateSteps.length] ?? climateSteps[0];
  return {
    ...entity("climate.living_room", "Living room AC", step.state),
    attributes: {
      friendly_name: "Living room AC",
      hvac_action: step.action,
      hvac_modes: ["off", "cool", "heat"],
      // Swing modes (10.3: the AC's louver suggests this entity; ClimateEntityFeature.SWING_MODE is 32).
      swing_modes: swingModes,
      swing_mode: swingModes[swingStep % swingModes.length] ?? "off",
      supported_features: 1 | 8 | 32,
      current_temperature: 23.5,
      temperature: 22,
    },
  };
};

/** A fake washing machine plug: `sensor.washing_machine_power` 0 W or 450 W (numeric_state conditions). */
let washerRunning = false;
const washerEntity = (): HassEntity => ({
  ...entity("sensor.washing_machine_power", "Washing machine power", washerRunning ? "450" : "0"),
  attributes: { friendly_name: "Washing machine power", unit_of_measurement: "W", device_class: "power" },
});
/**
 * A fake TV (Phase 8.8): `media_player.living_room_tv` steps Netflix (an `entity_picture`, here a data-URL icon)
 * → YouTube (no picture: the screen shows the app name) → off (the TV app button).
 */
const netflixIcon = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">' +
    '<rect width="256" height="256" rx="40" fill="#000"/>' +
    '<path d="M84 40h36l52 132V40h32v176h-34L118 82v134H84z" fill="#e50914"/></svg>',
)}`;
const tvSteps = [
  { state: "playing", app: "Netflix", picture: netflixIcon },
  { state: "on", app: "YouTube", picture: null },
  { state: "off", app: null, picture: null },
] as const;
let tvStep = 0;
const tvEntity = (): HassEntity => {
  const step = tvSteps[tvStep % tvSteps.length] ?? tvSteps[0];
  return {
    ...entity("media_player.living_room_tv", "Living room TV", step.state),
    attributes: {
      friendly_name: "Living room TV",
      ...(step.app === null ? {} : { app_name: step.app, source: step.app }),
      ...(step.picture === null ? {} : { entity_picture: step.picture }),
    },
  };
};
/** A fake motion sensor (Phase 8.6): `binary_sensor.hallway_motion` on / off (the Hallway motion button). */
let motion = false;
const motionEntity = (): HassEntity => ({
  ...entity("binary_sensor.hallway_motion", "Hallway motion", motion ? "on" : "off"),
  attributes: { friendly_name: "Hallway motion", device_class: "motion" },
});
states = {
  ...states,
  "binary_sensor.hallway_motion": motionEntity(),
  "climate.living_room": climateEntity(),
  "sensor.washing_machine_power": washerEntity(),
  "media_player.living_room_tv": tvEntity(),
  // A fake camera (8.5): a placed camera icon bubble opens its more-info (HA's live view) on tap.
  "camera.front_door": {
    ...entity("camera.front_door", "Front door", "idle"),
    attributes: { friendly_name: "Front door", icon: "mdi:cctv" },
  },
};
/**
 * Fake doors, windows, and blinds (Phase 9.7) for state-parameter bindings: a door contact sensor
 * (`binary_sensor.front_door`, on = open; the Front door button, and Front door unavailable to check that the
 * stored value is kept), a window contact sensor (`binary_sensor.kitchen_window`), a cover with tilt
 * (`cover.living_room_blinds`, the Blinds tilt button steps `current_tilt_position` 100 → 50 → 0; its
 * `cover.toggle_tilt` service, a tap on a blind bound to it (10.1), opens a shut tilt to 100, else shuts it;
 * `fakeService` below), and a lock
 * (`lock.front_door`, the Lock button steps locked → unlocked → open).
 */
let doorOpen = false;
let doorUnavailable = false;
const doorEntity = (): HassEntity => ({
  ...entity(
    "binary_sensor.front_door",
    "Front door",
    doorUnavailable ? "unavailable" : doorOpen ? "on" : "off",
  ),
  attributes: { friendly_name: "Front door", device_class: "door" },
});
let windowOpen = false;
const windowEntity = (): HassEntity => ({
  ...entity("binary_sensor.kitchen_window", "Kitchen window", windowOpen ? "on" : "off"),
  attributes: { friendly_name: "Kitchen window", device_class: "window" },
});
const tiltSteps = [100, 50, 0] as const;
let tiltStep = 0;
const coverEntity = (): HassEntity => {
  const tilt = tiltSteps[tiltStep % tiltSteps.length] ?? 100;
  return {
    ...entity("cover.living_room_blinds", "Living room blinds", tilt > 0 ? "open" : "closed"),
    attributes: {
      friendly_name: "Living room blinds",
      device_class: "blind",
      // Open / close / set position and open / close / set tilt (CoverEntityFeature 1 | 2 | 4 | 16 | 32 | 128).
      supported_features: 1 | 2 | 4 | 16 | 32 | 128,
      current_position: 100,
      current_tilt_position: tilt,
    },
  };
};

const lockSteps = ["locked", "unlocked", "open"] as const;
let lockStep = 0;
const lockEntity = (): HassEntity => ({
  ...entity("lock.front_door", "Front door lock", lockSteps[lockStep % lockSteps.length] ?? "locked"),
  attributes: { friendly_name: "Front door lock" },
});
states = {
  ...states,
  "binary_sensor.front_door": doorEntity(),
  "binary_sensor.kitchen_window": windowEntity(),
  "cover.living_room_blinds": coverEntity(),
  "lock.front_door": lockEntity(),
};
/**
 * More doors, windows, and covers (Phase 10.3) so the suggestions have something to choose between: a bathroom
 * door contact, a balcony door contact, a dining window contact, a kitchen roller blind without tilt, and a
 * hall motion sensor that is no door.
 */
const contact = (entityId: string, name: string, deviceClass: string, state = "off"): HassEntity => ({
  ...entity(entityId, name, state),
  attributes: { friendly_name: name, device_class: deviceClass },
});
states = {
  ...states,
  "binary_sensor.bathroom_door": contact("binary_sensor.bathroom_door", "Bathroom door", "door"),
  "binary_sensor.balcony_door": contact("binary_sensor.balcony_door", "Balcony door", "door"),
  "binary_sensor.dining_window": contact(
    "binary_sensor.dining_window",
    "Dining window",
    "window",
    "unavailable",
  ),
  "cover.kitchen_blinds": {
    ...entity("cover.kitchen_blinds", "Kitchen roller blind", "open"),
    attributes: {
      friendly_name: "Kitchen roller blind",
      device_class: "shade",
      supported_features: 1 | 2 | 4,
      current_position: 100,
    },
  },
};

/**
 * The remaining state sources (Phase 10.4, 10.5), one fake per case:
 * - `cover.dining_venetian_blinds`: a venetian blind reporting 50 = open, 0 and 100 = closed (the Venetian tilt
 *   button steps 50 → 0 → 100), with set tilt position;
 * - `binary_sensor.kitchen_window_tilted`: the kitchen window's second sensor; the two-sensor button steps closed
 *   (both off) → tilted (tilted on) → open (open on);
 * - `sensor.children_window_handle`: a three-state window handle (an enum sensor: closed / tilted / open);
 * - `cover.balcony_sliding_door`: a motorised sliding door reporting `current_position` 0 / 50 / 100;
 * - `select.living_room_ac_horizontal_position`: the AC's louver positions as a select (off, 1–5, swing);
 * - `binary_sensor.washing_machine_door`: the washer's door sensor.
 */
const fakeCover = (
  entityId: string,
  name: string,
  deviceClass: string,
  features: number,
  position: number,
  tilt?: number,
): HassEntity => ({
  ...entity(entityId, name, position > 0 || (tilt ?? 0) > 0 ? "open" : "closed"),
  attributes: {
    friendly_name: name,
    device_class: deviceClass,
    supported_features: features,
    current_position: position,
    ...(tilt === undefined ? {} : { current_tilt_position: tilt }),
  },
});
const venetianSteps = [50, 0, 100] as const;
let venetianStep = 0;
const slidingSteps = [0, 50, 100] as const;
let slidingStep = 0;
const windowSteps = ["closed", "tilted", "open"] as const;
let windowStep = 0;
let handleStep = 0;
const vaneOptions = ["off", "1", "2", "3", "4", "5", "swing"] as const;
let vaneStep = 0;
let washerDoorOpen = false;
const tiltedEntity = (): HassEntity =>
  contact(
    "binary_sensor.kitchen_window_tilted",
    "Kitchen window tilted",
    "window",
    windowSteps[windowStep % windowSteps.length] === "tilted" ? "on" : "off",
  );
const handleEntity = (): HassEntity => ({
  ...entity(
    "sensor.children_window_handle",
    "second bedroom window handle",
    windowSteps[handleStep % windowSteps.length] ?? "closed",
  ),
  attributes: {
    friendly_name: "second bedroom window handle",
    device_class: "enum",
    options: [...windowSteps],
  },
});
const vaneEntity = (): HassEntity => ({
  ...entity(
    "select.living_room_ac_horizontal_position",
    "AC Horizontal Position",
    vaneOptions[vaneStep % vaneOptions.length] ?? "off",
  ),
  attributes: { friendly_name: "AC Horizontal Position", options: [...vaneOptions] },
});
states = {
  ...states,
  "cover.dining_venetian_blinds": fakeCover(
    "cover.dining_venetian_blinds",
    "Dining room venetian blinds",
    "blind",
    1 | 2 | 4 | 16 | 32 | 128,
    0,
    venetianSteps[0],
  ),
  "binary_sensor.kitchen_window_tilted": tiltedEntity(),
  "sensor.children_window_handle": handleEntity(),
  "cover.balcony_sliding_door": fakeCover(
    "cover.balcony_sliding_door",
    "Balcony sliding door",
    "door",
    1 | 2 | 4 | 8,
    slidingSteps[0],
  ),
  "select.living_room_ac_horizontal_position": vaneEntity(),
  "binary_sensor.washing_machine_door": contact(
    "binary_sensor.washing_machine_door",
    "Washing machine door",
    "door",
  ),
};

/** Sets a fake cover's tilt (HA's `set_cover_tilt_position`) or position (`set_cover_position`). */
const setCover = (
  entityId: string,
  attribute: "current_tilt_position" | "current_position",
  value: number,
) => {
  const current = states[entityId];
  if (current === undefined || !(attribute in current.attributes)) return false;
  const attributes = { ...current.attributes, [attribute]: Math.min(Math.max(Math.round(value), 0), 100) };
  const open = [attributes.current_position, attributes.current_tilt_position].some(
    (number) => typeof number === "number" && number > 0,
  );
  states = { ...states, [entityId]: { ...current, state: open ? "open" : "closed", attributes } };
  return true;
};

/**
 * HA's cover and select services on the fake entities: `toggle_tilt` (a tilt at 0 opens to 100, any other tilt
 * shuts to 0), `set_cover_tilt_position`, `set_cover_position`, and `select_option`. True when one applied.
 */
const fakeService = (
  domain: string,
  service: string,
  entityId: string,
  data: Readonly<Record<string, unknown>>,
): boolean => {
  const current = states[entityId];
  if (current === undefined) return false;
  if (domain === "cover" && service === "toggle_tilt") {
    const tilt = current.attributes.current_tilt_position;
    return typeof tilt === "number" && setCover(entityId, "current_tilt_position", tilt === 0 ? 100 : 0);
  }
  if (domain === "cover" && service === "set_cover_tilt_position" && typeof data.tilt_position === "number")
    return setCover(entityId, "current_tilt_position", data.tilt_position);
  if (domain === "cover" && service === "set_cover_position" && typeof data.position === "number")
    return setCover(entityId, "current_position", data.position);
  if (domain === "select" && service === "select_option" && typeof data.option === "string") {
    states = { ...states, [entityId]: { ...current, state: data.option } };
    return true;
  }
  return false;
};

/**
 * HA's area, device, and entity registries (the frontend's `hass.areas`, `hass.devices`, `hass.entities`; 10.3),
 * named like the rooms of the house we tested with. The front door contact and lock sit on one device in the second bedroom (the
 * entrance), so their area comes from the device, as in HA; the others have their own area.
 */
const areas: NonNullable<Hass["areas"]> = Object.fromEntries(
  [
    ["living_room", "Living room"],
    ["kitchen", "Kitchen"],
    ["dining_room", "Dining room"],
    ["corridor", "Corridor"],
    ["children_room", "second bedroom"],
    ["bathroom", "Bathroom"],
    ["utility_room", "Utility room"],
  ].map(([id = "", name = ""]) => [id, { area_id: id, name }]),
);
const devices: NonNullable<Hass["devices"]> = {
  dev_front_door: { area_id: "children_room" },
  dev_living_room_ac: { area_id: "living_room" },
};
const entityAreas: Readonly<Record<string, string>> = {
  "light.kitchen": "kitchen",
  "light.hallway": "corridor",
  "sensor.living_room_temperature": "living_room",
  "binary_sensor.hallway_motion": "corridor",
  "sensor.washing_machine_power": "bathroom",
  "media_player.living_room_tv": "living_room",
  "camera.front_door": "corridor",
  "binary_sensor.kitchen_window": "kitchen",
  "cover.living_room_blinds": "living_room",
  "binary_sensor.bathroom_door": "bathroom",
  "binary_sensor.balcony_door": "living_room",
  "binary_sensor.dining_window": "dining_room",
  "cover.kitchen_blinds": "kitchen",
  "cover.dining_venetian_blinds": "dining_room",
  "binary_sensor.kitchen_window_tilted": "kitchen",
  "sensor.children_window_handle": "children_room",
  "cover.balcony_sliding_door": "living_room",
  "select.living_room_ac_horizontal_position": "living_room",
  "binary_sensor.washing_machine_door": "bathroom",
};
const entityRegistry: NonNullable<Hass["entities"]> = {
  ...Object.fromEntries(Object.entries(entityAreas).map(([id, area]) => [id, { area_id: area }])),
  "binary_sensor.front_door": { device_id: "dev_front_door", area_id: null },
  "lock.front_door": { device_id: "dev_front_door", area_id: null },
  "climate.living_room": { device_id: "dev_living_room_ac", area_id: null },
};

let darkMode = false;

/** A fake `sun.sun`: afternoon sun from the south-west, or night below the horizon (the Day / night button). */
const sunEntity = (night: boolean): HassEntity => ({
  ...entity("sun.sun", "Sun", night ? "below_horizon" : "above_horizon"),
  attributes: { friendly_name: "Sun", azimuth: night ? 320 : 225, elevation: night ? -25 : 35 },
});
let night = false;
states = { ...states, "sun.sun": sunEntity(night) };

const panel = document.querySelector("homeplan-panel");
if (panel === null) throw new Error("harness.html has no <homeplan-panel>.");

/** The last action the viewer ran, shown in the controls: HA's more-info dialog and services do not exist here. */
const showAction = (text: string): void => {
  const label = document.querySelector("#last-action");
  if (label !== null) label.textContent = `Last action: ${text}`;
};
document.addEventListener("hass-more-info", (event) => {
  const entityId = event instanceof CustomEvent ? field(event.detail, "entityId") : undefined;
  console.info("[harness] more-info", entityId);
  showAction(`more-info ${typeof entityId === "string" ? entityId : "?"}`);
});

const publish = (): void => {
  const hass: Hass = {
    states,
    entities: entityRegistry,
    devices,
    areas,
    themes: { darkMode },
    // Fake services: <domain>.toggle/turn_on/turn_off on the fake entities, the covers' toggle_tilt,
    // set_cover_tilt_position and set_cover_position, and select_option (entity in the data or the target);
    // everything else is logged.
    callWS: () => Promise.reject(new Error("The harness has no Home Assistant websocket.")),
    callService: (domain, service, data, target) => {
      const entityId = data?.entity_id ?? target?.entity_id;
      console.info("[harness] callService", domain, service, data, target);
      const tilt = data?.tilt_position ?? data?.position ?? data?.option;
      showAction(
        `${domain}.${service}${typeof entityId === "string" ? ` ${entityId}` : ""}${
          typeof tilt === "number" || typeof tilt === "string" ? ` ${String(tilt)}` : ""
        }`,
      );
      if (typeof entityId === "string" && fakeService(domain, service, entityId, data ?? {})) {
        publish();
        return Promise.resolve(undefined);
      }
      if (typeof entityId === "string" && ["toggle", "turn_on", "turn_off"].includes(service)) {
        const current = states[entityId];
        if (current !== undefined)
          setState(
            entityId,
            service === "toggle"
              ? current.state === "on"
                ? "off"
                : "on"
              : service === "turn_on"
                ? "on"
                : "off",
          );
      }
      return Promise.resolve(undefined);
    },
  };
  panel.setAttribute("data-dark", String(darkMode));
  document.body.style.background = darkMode ? "#111" : "#fafafa";
  Reflect.set(panel, "hass", hass);
};

const setState = (entityId: string, state: string): void => {
  const current = states[entityId];
  if (current === undefined) return;
  states = { ...states, [entityId]: { ...current, state } };
  publish();
};

const toggle = (entityId: string): void => {
  const current = states[entityId];
  if (current !== undefined) setState(entityId, current.state === "on" ? "off" : "on");
};

Reflect.set(panel, "narrow", window.innerWidth < 870);
// `?house=<id>` shows that house instead of the viewer setup's (the setup is not changed); without it, the setup's.
const houseParam = new URLSearchParams(window.location.search).get("house");
Reflect.set(panel, "panel", {
  config: {
    mode: "dev",
    api_base: `${window.location.origin}/api`,
    ...(houseParam === null || houseParam === "" ? {} : { house_id: houseParam }),
  },
});
publish();

document.querySelector("#toggle-test")?.addEventListener("click", () => {
  toggle("light.kitchen");
});
document.querySelector("#toggle-other")?.addEventListener("click", () => {
  toggle("light.hallway");
});
document.querySelector("#night")?.addEventListener("click", () => {
  night = !night;
  states = { ...states, "sun.sun": sunEntity(night) };
  publish();
});
document.querySelector("#climate")?.addEventListener("click", () => {
  climateStep += 1;
  states = { ...states, "climate.living_room": climateEntity() };
  publish();
});
document.querySelector("#washer")?.addEventListener("click", () => {
  washerRunning = !washerRunning;
  states = { ...states, "sensor.washing_machine_power": washerEntity() };
  publish();
});
document.querySelector("#tv")?.addEventListener("click", () => {
  tvStep += 1;
  states = { ...states, "media_player.living_room_tv": tvEntity() };
  publish();
});
document.querySelector("#motion")?.addEventListener("click", () => {
  motion = !motion;
  states = { ...states, "binary_sensor.hallway_motion": motionEntity() };
  publish();
});
document.querySelector("#door")?.addEventListener("click", () => {
  doorOpen = !doorOpen;
  doorUnavailable = false;
  states = { ...states, "binary_sensor.front_door": doorEntity() };
  publish();
});
document.querySelector("#door-unavailable")?.addEventListener("click", () => {
  doorUnavailable = !doorUnavailable;
  states = { ...states, "binary_sensor.front_door": doorEntity() };
  publish();
});
document.querySelector("#window")?.addEventListener("click", () => {
  windowOpen = !windowOpen;
  states = { ...states, "binary_sensor.kitchen_window": windowEntity() };
  publish();
});
document.querySelector("#tilt")?.addEventListener("click", () => {
  tiltStep += 1;
  setCover(
    "cover.living_room_blinds",
    "current_tilt_position",
    tiltSteps[tiltStep % tiltSteps.length] ?? 100,
  );
  publish();
});
document.querySelector("#lock")?.addEventListener("click", () => {
  lockStep += 1;
  states = { ...states, "lock.front_door": lockEntity() };
  publish();
});
document.querySelector("#venetian")?.addEventListener("click", () => {
  venetianStep += 1;
  setCover(
    "cover.dining_venetian_blinds",
    "current_tilt_position",
    venetianSteps[venetianStep % venetianSteps.length] ?? 50,
  );
  publish();
});
document.querySelector("#window-two")?.addEventListener("click", () => {
  windowStep += 1;
  windowOpen = windowSteps[windowStep % windowSteps.length] === "open";
  states = {
    ...states,
    "binary_sensor.kitchen_window": windowEntity(),
    "binary_sensor.kitchen_window_tilted": tiltedEntity(),
  };
  publish();
});
document.querySelector("#handle")?.addEventListener("click", () => {
  handleStep += 1;
  states = { ...states, "sensor.children_window_handle": handleEntity() };
  publish();
});
document.querySelector("#sliding-cover")?.addEventListener("click", () => {
  slidingStep += 1;
  setCover(
    "cover.balcony_sliding_door",
    "current_position",
    slidingSteps[slidingStep % slidingSteps.length] ?? 0,
  );
  publish();
});
document.querySelector("#swing")?.addEventListener("click", () => {
  swingStep += 1;
  states = { ...states, "climate.living_room": climateEntity() };
  publish();
});
document.querySelector("#vane")?.addEventListener("click", () => {
  vaneStep += 1;
  states = { ...states, "select.living_room_ac_horizontal_position": vaneEntity() };
  publish();
});
document.querySelector("#washer-door")?.addEventListener("click", () => {
  washerDoorOpen = !washerDoorOpen;
  setState("binary_sensor.washing_machine_door", washerDoorOpen ? "on" : "off");
});
document.querySelector("#dark")?.addEventListener("click", () => {
  darkMode = !darkMode;
  publish();
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const field = (value: unknown, name: string): unknown => (isRecord(value) ? value[name] : undefined);

/**
 * Demo bubbles (8.5): writes, for the house shown (`?house=`, else the viewer setup's), a temperature room bubble in the living room, a
 * "washing machine running" room bubble (numeric_state on the washer's power) in the utility room (else another
 * room), and a placed camera icon bubble on the first light (else a point in the first room), then reloads.
 * Other bubbles of that house are replaced; nothing else is touched.
 */
const writeDemoBubbles = async (): Promise<void> => {
  const api = `${window.location.origin}/api`;
  const preferences: unknown = await (await fetch(`${api}/preferences`)).json();
  const houseId =
    houseParam !== null && houseParam !== ""
      ? houseParam
      : field(field(field(field(preferences, "preferences"), "homeAssistant"), "viewer"), "houseId");
  if (typeof houseId !== "string") throw new Error("Choose a house in the viewer setup first.");
  const document: unknown = await (
    await fetch(`${api}/houses/${encodeURIComponent(houseId)}/document`)
  ).json();
  const areas = listOf(field(listOf(field(field(document, "document"), "floors"))[0], "areas"));
  const named = (pattern: RegExp): unknown =>
    areas.find((area) => {
      const name = field(area, "name");
      return typeof name === "string" && pattern.test(name);
    });
  const idOf = (value: unknown): string | null => {
    const id = field(value, "id");
    return typeof id === "string" ? id : null;
  };
  const living = idOf(named(/living/i) ?? areas[0]);
  const utility = idOf(named(/utility|laundry|wash|bath/i) ?? areas[1] ?? areas[0]);
  const light = areas.flatMap((area) => listOf(field(area, "lights"))).map(idOf)[0] ?? null;
  if (living === null || utility === null) throw new Error("The house has no rooms.");
  const rooms: Record<string, HaHouseBubblesValue["rooms"][string]> = {};
  const add = (areaId: string, bubble: HaHouseBubblesValue["rooms"][string][number]): void => {
    rooms[areaId] = [...(rooms[areaId] ?? []), bubble];
  };
  add(living, {
    id: createId("hb"),
    preset: "temperature",
    stateEntityId: "sensor.living_room_temperature",
    format: "value",
  });
  add(utility, {
    id: createId("hb"),
    preset: "state",
    stateEntityId: "sensor.washing_machine_power",
    icon: "mdi:washing-machine",
    format: "value",
    visibleWhen: { condition: "numeric_state", entity: "sensor.washing_machine_power", above: 5 },
  });
  const bubbles: HaHouseBubblesValue = {
    rooms,
    placed: {
      [createId("hb")]: {
        preset: "custom",
        stateEntityId: "camera.front_door",
        icon: "mdi:cctv",
        format: "icon",
        style: "bare",
        // HA keeps an action's other fields (here the entity it toggles) as given.
        holdAction: Object.assign({ action: "toggle" }, { entity: "light.hallway" }),
        anchor:
          light === null
            ? { kind: "point", areaId: living, positionMm: { x: 0, y: 0, h: 2000 } }
            : { kind: "light", lightId: light },
      },
    },
  };
  const revision = field(preferences, "revision");
  const response = await fetch(`${api}/preferences`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      expectedRevision: revision,
      patch: { homeAssistant: { bindings: { [houseId]: { bubbles } } } },
    }),
  });
  if (!response.ok) throw new Error(`The builder answered ${String(response.status)}.`);
  window.location.reload();
};

document.querySelector("#bubbles")?.addEventListener("click", () => {
  writeDemoBubbles().catch((error: unknown) => {
    console.error("[harness] demo bubbles", error);
    window.alert(error instanceof Error ? error.message : "Could not write the demo bubbles.");
  });
});
