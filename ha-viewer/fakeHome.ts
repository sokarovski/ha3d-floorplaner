// The fake Home Assistant home shared by the dev harness (harness.ts) and the website's live demo (liveDemo.ts):
// its entities and their states, HA's area/device/entity registries, the services the fakes answer, and the
// harness's step buttons. A change replaces the changed entity objects only (HA keeps unchanged ones identical).
import type { Hass, HassEntity } from "./hassStore";

/** An entity as HA's frontend has it (HA's own cards also read `last_updated` and `context`). */
export type FakeEntity = HassEntity &
  Readonly<{
    last_updated: string;
    context: Readonly<{ id: string; parent_id: null; user_id: null }>;
  }>;

const entity = (entityId: string, name: string, state: string): FakeEntity => {
  const now = new Date().toISOString();
  return {
    entity_id: entityId,
    state,
    attributes: { friendly_name: name },
    last_changed: now,
    last_updated: now,
    context: { id: "", parent_id: null, user_id: null },
  };
};

/** A dimmable light (`supported_color_modes: brightness`); off drops the brightness, as HA reports it. */
const lightEntity = (entityId: string, name: string, brightness: number | null): FakeEntity => ({
  ...entity(entityId, name, brightness === null ? "off" : "on"),
  attributes: {
    friendly_name: name,
    supported_color_modes: ["brightness"],
    supported_features: 0,
    ...(brightness === null ? { color_mode: null } : { color_mode: "brightness", brightness }),
  },
});

/** The harness's step buttons (their element IDs in harness.html), each changing the fake states. */
export type FakeControl =
  | "toggle-test"
  | "toggle-other"
  | "night"
  | "climate"
  | "washer"
  | "tv"
  | "motion"
  | "door"
  | "door-unavailable"
  | "window"
  | "tilt"
  | "lock"
  | "venetian"
  | "window-two"
  | "handle"
  | "sliding-cover"
  | "swing"
  | "vane"
  | "washer-door";

export type FakeHome = Readonly<{
  states: () => Readonly<Record<string, FakeEntity>>;
  areas: NonNullable<Hass["areas"]>;
  devices: NonNullable<Hass["devices"]>;
  entities: NonNullable<Hass["entities"]>;
  /** Applies a service call to the fakes; true when a state changed. */
  callService: (
    domain: string,
    service: string,
    data?: Readonly<Record<string, unknown>>,
    target?: Readonly<Record<string, unknown>>,
  ) => boolean;
  control: (control: FakeControl) => void;
}>;

export const createFakeHome = (): FakeHome => {
  let states: Record<string, FakeEntity> = {
    "light.kitchen": lightEntity("light.kitchen", "Living room light", null),
    "light.hallway": lightEntity("light.hallway", "Hallway", null),
    "light.bathroom": lightEntity("light.bathroom", "Bathroom", null),
    "light.bedroom": lightEntity("light.bedroom", "Bedroom", null),
    "switch.washing_machine": {
      ...entity("switch.washing_machine", "Washing machine", "off"),
      attributes: { friendly_name: "Washing machine", icon: "mdi:washing-machine" },
    },
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
  /** The AC's target temperature (HA's `climate.set_temperature`, the thermostat card's + and −). */
  let targetTemperature = 22;
  const climateEntity = (): FakeEntity => {
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
        temperature: targetTemperature,
        min_temp: 16,
        max_temp: 30,
        target_temp_step: 0.5,
      },
    };
  };

  /** A fake washing machine plug: `sensor.washing_machine_power` 0 W or 450 W (numeric_state conditions). */
  let washerRunning = false;
  const washerEntity = (): FakeEntity => ({
    ...entity("sensor.washing_machine_power", "Washing machine power", washerRunning ? "450" : "0"),
    attributes: {
      friendly_name: "Washing machine power",
      unit_of_measurement: "W",
      device_class: "power",
    },
  });
  /**
   * A fake TV (Phase 8.8): `media_player.living_room_tv` steps Netflix (an `entity_picture`, here a data-URL
   * icon) → YouTube (no picture: the screen shows the app name) → off (the TV app button).
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
  const tvEntity = (): FakeEntity => {
    const step = tvSteps[tvStep % tvSteps.length] ?? tvSteps[0];
    return {
      ...entity("media_player.living_room_tv", "Living room TV", step.state),
      attributes: {
        friendly_name: "Living room TV",
        // Pause, volume, mute, turn on/off, play (MediaPlayerEntityFeature 1 | 4 | 8 | 128 | 256 | 16384).
        supported_features: 1 | 4 | 8 | 128 | 256 | 16384,
        ...(step.app === null ? {} : { app_name: step.app, source: step.app }),
        ...(step.picture === null ? {} : { entity_picture: step.picture }),
      },
    };
  };
  /** A fake motion sensor (Phase 8.6): `binary_sensor.hallway_motion` on / off (the Hallway motion button). */
  let motion = false;
  const motionEntity = (): FakeEntity => ({
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
   * `fakeService` below), and a lock (`lock.front_door`, the Lock button steps locked → unlocked → open).
   */
  let doorOpen = false;
  let doorUnavailable = false;
  const doorEntity = (): FakeEntity => ({
    ...entity(
      "binary_sensor.front_door",
      "Front door",
      doorUnavailable ? "unavailable" : doorOpen ? "on" : "off",
    ),
    attributes: { friendly_name: "Front door", device_class: "door" },
  });
  let windowOpen = false;
  const windowEntity = (): FakeEntity => ({
    ...entity("binary_sensor.kitchen_window", "Kitchen window", windowOpen ? "on" : "off"),
    attributes: { friendly_name: "Kitchen window", device_class: "window" },
  });
  const tiltSteps = [100, 50, 0] as const;
  let tiltStep = 0;
  const coverEntity = (): FakeEntity => {
    const tilt = tiltSteps[tiltStep % tiltSteps.length] ?? 100;
    return {
      ...entity("cover.living_room_blinds", "Living room blinds", tilt > 0 ? "open" : "closed"),
      attributes: {
        friendly_name: "Living room blinds",
        device_class: "blind",
        // Venetian blinds report only their slat tilt: open / close / set tilt (CoverEntityFeature 16 | 32 | 128).
        supported_features: 16 | 32 | 128,
        current_tilt_position: tilt,
      },
    };
  };

  const lockSteps = ["locked", "unlocked", "open"] as const;
  let lockStep = 0;
  const lockEntity = (): FakeEntity => ({
    ...entity("lock.front_door", "Front door lock", lockSteps[lockStep % lockSteps.length] ?? "locked"),
    // Open (LockEntityFeature.OPEN is 1).
    attributes: { friendly_name: "Front door lock", supported_features: 1 },
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
  const contact = (entityId: string, name: string, deviceClass: string, state = "off"): FakeEntity => ({
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
   * - `binary_sensor.kitchen_window_tilted`: the kitchen window's second sensor; the two-sensor button steps
   *   closed (both off) → tilted (tilted on) → open (open on);
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
  ): FakeEntity => ({
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
  const tiltedEntity = (): FakeEntity =>
    contact(
      "binary_sensor.kitchen_window_tilted",
      "Kitchen window tilted",
      "window",
      windowSteps[windowStep % windowSteps.length] === "tilted" ? "on" : "off",
    );
  const handleEntity = (): FakeEntity => ({
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
  const vaneEntity = (): FakeEntity => ({
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

  /** A fake `sun.sun`: afternoon sun from the south-west, or night below the horizon (the Day / night button). */
  const sunEntity = (night: boolean): FakeEntity => ({
    ...entity("sun.sun", "Sun", night ? "below_horizon" : "above_horizon"),
    attributes: { friendly_name: "Sun", azimuth: night ? 320 : 225, elevation: night ? -25 : 35 },
  });
  let night = false;
  states = { ...states, "sun.sun": sunEntity(night) };

  const setState = (entityId: string, state: string, attributes?: FakeEntity["attributes"]): void => {
    const current = states[entityId];
    if (current === undefined) return;
    const now = new Date().toISOString();
    states = {
      ...states,
      [entityId]: {
        ...current,
        state,
        attributes: attributes ?? current.attributes,
        ...(state === current.state ? {} : { last_changed: now }),
        last_updated: now,
      },
    };
  };

  /** Sets a fake cover's tilt (HA's `set_cover_tilt_position`) or position (`set_cover_position`). */
  const setCover = (
    entityId: string,
    attribute: "current_tilt_position" | "current_position",
    value: number,
  ): boolean => {
    const current = states[entityId];
    if (current === undefined || !(attribute in current.attributes)) return false;
    const attributes = { ...current.attributes, [attribute]: Math.min(Math.max(Math.round(value), 0), 100) };
    const open = [attributes.current_position, attributes.current_tilt_position].some(
      (number) => typeof number === "number" && number > 0,
    );
    setState(entityId, open ? "open" : "closed", attributes);
    return true;
  };

  /** A light on (at `brightness`, else its last one, else full) or off (the brightness dropped). */
  const setLight = (entityId: string, on: boolean, brightness?: number): void => {
    const current = states[entityId];
    if (current === undefined) return;
    const last = current.attributes.brightness;
    const level = brightness ?? (typeof last === "number" ? last : 255);
    const name = current.attributes.friendly_name;
    const next = lightEntity(entityId, typeof name === "string" ? name : entityId, on ? level : null);
    setState(entityId, next.state, next.attributes);
  };

  const numberIn = (data: Readonly<Record<string, unknown>>, key: string): number | undefined => {
    const value = data[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  };

  /**
   * HA's services on the fake entities: lights (`turn_on` with `brightness` or `brightness_pct`, `turn_off`,
   * `toggle`), covers (`toggle_tilt`: a tilt at 0 opens to 100, any other tilt shuts to 0; set / open / close tilt
   * and position), `select_option`, the AC's `set_temperature`, `set_hvac_mode` and `set_swing_mode`, the lock's
   * `lock` / `unlock` / `open`, and the TV's play / pause / on / off. True when one applied.
   */
  const fakeService = (
    domain: string,
    service: string,
    entityId: string,
    data: Readonly<Record<string, unknown>>,
  ): boolean => {
    const current = states[entityId];
    if (current === undefined) return false;
    const attributes = current.attributes;
    if (domain === "light" && ["turn_on", "turn_off", "toggle"].includes(service)) {
      const percent = numberIn(data, "brightness_pct");
      const brightness = numberIn(data, "brightness") ?? (percent === undefined ? undefined : percent * 2.55);
      const on = service === "toggle" ? current.state !== "on" : service === "turn_on";
      setLight(
        entityId,
        on,
        brightness === undefined ? undefined : Math.round(Math.min(Math.max(brightness, 1), 255)),
      );
      return true;
    }
    if (domain === "cover") {
      const tilt = attributes.current_tilt_position;
      if (service === "toggle_tilt")
        return typeof tilt === "number" && setCover(entityId, "current_tilt_position", tilt === 0 ? 100 : 0);
      const tiltTo = numberIn(data, "tilt_position");
      if (service === "set_cover_tilt_position" && tiltTo !== undefined)
        return setCover(entityId, "current_tilt_position", tiltTo);
      const positionTo = numberIn(data, "position");
      if (service === "set_cover_position" && positionTo !== undefined)
        return setCover(entityId, "current_position", positionTo);
      if (service === "open_cover_tilt" || service === "close_cover_tilt")
        return setCover(entityId, "current_tilt_position", service === "open_cover_tilt" ? 100 : 0);
      if (service === "open_cover" || service === "close_cover")
        return setCover(entityId, "current_position", service === "open_cover" ? 100 : 0);
      if (service === "stop_cover" || service === "stop_cover_tilt") return false;
    }
    if (domain === "select" && service === "select_option" && typeof data.option === "string") {
      setState(entityId, data.option);
      return true;
    }
    if (domain === "climate" && entityId === "climate.living_room") {
      const temperature = numberIn(data, "temperature");
      if (service === "set_temperature" && temperature !== undefined) {
        targetTemperature = temperature;
        states = { ...states, [entityId]: { ...climateEntity(), state: current.state } };
        return true;
      }
      if (service === "set_hvac_mode" && typeof data.hvac_mode === "string") {
        setState(entityId, data.hvac_mode);
        return true;
      }
      if (service === "set_swing_mode" && typeof data.swing_mode === "string") {
        setState(entityId, current.state, { ...attributes, swing_mode: data.swing_mode });
        return true;
      }
    }
    if (domain === "lock" && ["lock", "unlock", "open"].includes(service)) {
      setState(entityId, service === "lock" ? "locked" : service === "unlock" ? "unlocked" : "open");
      return true;
    }
    if (domain === "media_player") {
      const next: Readonly<Record<string, string>> = {
        media_play: "playing",
        media_pause: "paused",
        media_play_pause: current.state === "playing" ? "paused" : "playing",
        turn_on: "on",
        turn_off: "off",
      };
      const state = next[service];
      if (state !== undefined) {
        setState(entityId, state);
        return true;
      }
    }
    return false;
  };

  /**
   * HA's area, device, and entity registries (the frontend's `hass.areas`, `hass.devices`, `hass.entities`;
   * 10.3), named like the rooms of the house we tested with. The front door contact and lock sit on one device in the second bedroom
   * (the entrance), so their area comes from the device, as in HA; the others have their own area.
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
    "light.bathroom": "bathroom",
    "light.bedroom": "bedroom",
    "switch.washing_machine": "bathroom",
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
  const entities: NonNullable<Hass["entities"]> = {
    ...Object.fromEntries(Object.entries(entityAreas).map(([id, area]) => [id, { area_id: area }])),
    "binary_sensor.front_door": { device_id: "dev_front_door", area_id: null },
    "lock.front_door": { device_id: "dev_front_door", area_id: null },
    "climate.living_room": { device_id: "dev_living_room_ac", area_id: null },
  };

  const toggle = (entityId: string): void => {
    const current = states[entityId];
    if (current === undefined) return;
    if (entityId.startsWith("light.")) setLight(entityId, current.state !== "on");
    else setState(entityId, current.state === "on" ? "off" : "on");
  };

  const controls: Readonly<Record<FakeControl, () => void>> = {
    "toggle-test": () => {
      toggle("light.kitchen");
    },
    "toggle-other": () => {
      toggle("light.hallway");
    },
    night: () => {
      night = !night;
      states = { ...states, "sun.sun": sunEntity(night) };
    },
    climate: () => {
      climateStep += 1;
      states = { ...states, "climate.living_room": climateEntity() };
    },
    washer: () => {
      washerRunning = !washerRunning;
      states = { ...states, "sensor.washing_machine_power": washerEntity() };
    },
    tv: () => {
      tvStep += 1;
      states = { ...states, "media_player.living_room_tv": tvEntity() };
    },
    motion: () => {
      motion = !motion;
      states = { ...states, "binary_sensor.hallway_motion": motionEntity() };
    },
    door: () => {
      doorOpen = !doorOpen;
      doorUnavailable = false;
      states = { ...states, "binary_sensor.front_door": doorEntity() };
    },
    "door-unavailable": () => {
      doorUnavailable = !doorUnavailable;
      states = { ...states, "binary_sensor.front_door": doorEntity() };
    },
    window: () => {
      windowOpen = !windowOpen;
      states = { ...states, "binary_sensor.kitchen_window": windowEntity() };
    },
    tilt: () => {
      tiltStep += 1;
      setCover(
        "cover.living_room_blinds",
        "current_tilt_position",
        tiltSteps[tiltStep % tiltSteps.length] ?? 100,
      );
    },
    lock: () => {
      lockStep += 1;
      states = { ...states, "lock.front_door": lockEntity() };
    },
    venetian: () => {
      venetianStep += 1;
      setCover(
        "cover.dining_venetian_blinds",
        "current_tilt_position",
        venetianSteps[venetianStep % venetianSteps.length] ?? 50,
      );
    },
    "window-two": () => {
      windowStep += 1;
      windowOpen = windowSteps[windowStep % windowSteps.length] === "open";
      states = {
        ...states,
        "binary_sensor.kitchen_window": windowEntity(),
        "binary_sensor.kitchen_window_tilted": tiltedEntity(),
      };
    },
    handle: () => {
      handleStep += 1;
      states = { ...states, "sensor.children_window_handle": handleEntity() };
    },
    "sliding-cover": () => {
      slidingStep += 1;
      setCover(
        "cover.balcony_sliding_door",
        "current_position",
        slidingSteps[slidingStep % slidingSteps.length] ?? 0,
      );
    },
    swing: () => {
      swingStep += 1;
      states = { ...states, "climate.living_room": climateEntity() };
    },
    vane: () => {
      vaneStep += 1;
      states = { ...states, "select.living_room_ac_horizontal_position": vaneEntity() };
    },
    "washer-door": () => {
      washerDoorOpen = !washerDoorOpen;
      setState("binary_sensor.washing_machine_door", washerDoorOpen ? "on" : "off");
    },
  };

  return {
    states: () => states,
    areas,
    devices,
    entities,
    callService: (domain, service, data, target) => {
      const entityId = data?.entity_id ?? target?.entity_id;
      if (typeof entityId !== "string") return false;
      if (fakeService(domain, service, entityId, data ?? {})) return true;
      const current = states[entityId];
      if (current === undefined || !["toggle", "turn_on", "turn_off"].includes(service)) return false;
      setState(
        entityId,
        service === "toggle" ? (current.state === "on" ? "off" : "on") : service === "turn_on" ? "on" : "off",
      );
      return true;
    },
    control: (control) => {
      controls[control]();
    },
  };
};
