// The website's live demo (spec/product/showcase-website.md#live-demo): <homeplan-panel> on the demo city
// apartment with the fake home of fakeHome.ts, read-only demo data (houseSource.ts, createDemoHouseSource) and
// real Home Assistant cards from the HA cards bundle (packaging/ha-cards/). Every state change goes to the panel
// and to the cards' Home Assistant context, so lamps tapped in 3D and card controls stay in step.
import "./main";
import { createFakeHome } from "./fakeHome";

const panel = document.querySelector("homeplan-panel");
if (panel === null) throw new Error("The live demo page has no <homeplan-panel>.");
const home = createFakeHome();

/** A card of a sections view; `toggle` lets a visitor flip a simulated sensor from its tile. */
const tile = (entity: string, toggle = false): Record<string, unknown> => ({
  type: "tile",
  entity,
  ...(toggle ? { tap_action: { action: "toggle" }, icon_tap_action: { action: "toggle" } } : {}),
});
const view = (title: string, cards: readonly Record<string, unknown>[]): Record<string, unknown> => ({
  title,
  path: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  type: "sections",
  max_columns: 1,
  sections: [{ type: "grid", cards }],
});

/** The demo's room-cards dashboard: one tab per room of the apartment, named like the room ("Match by name"). */
const dashboardPath = "homeplan-rooms";
const dashboard = {
  views: [
    view("Living, kitchen and dining", [
      { type: "thermostat", entity: "climate.living_room" },
      { type: "media-control", entity: "media_player.living_room_tv" },
      tile("light.kitchen"),
      {
        ...tile("cover.living_room_blinds"),
        // A blind only reports its slat tilt: tapping tilts the slats open or closed.
        tap_action: {
          action: "perform-action",
          perform_action: "cover.toggle_tilt",
          target: { entity_id: "cover.living_room_blinds" },
        },
        icon_tap_action: {
          action: "perform-action",
          perform_action: "cover.toggle_tilt",
          target: { entity_id: "cover.living_room_blinds" },
        },
      },
    ]),
    view("Entrance hall", [
      tile("light.hallway"),
      tile("binary_sensor.hallway_motion", true),
      { ...tile("binary_sensor.front_door", true), name: "Living room door" },
      tile("lock.front_door"),
    ]),
    view("Bedroom", [tile("light.bedroom")]),
    view("Bathroom", [tile("light.bathroom"), tile("binary_sensor.bathroom_door", true)]),
    view("Utility", [
      { ...tile("switch.washing_machine"), name: "Washer" },
      { ...tile("sensor.washing_machine_power"), name: "Power" },
      { ...tile("binary_sensor.washing_machine_door", true), name: "Washer door" },
    ]),
    view("Balcony", [tile("cover.balcony_sliding_door", true)]),
  ],
};

const callWS = (message: Readonly<Record<string, unknown>>): Promise<unknown> => {
  if (message.type === "lovelace/dashboards/list")
    return Promise.resolve([
      {
        id: dashboardPath,
        url_path: dashboardPath,
        title: "Homeplan rooms",
        icon: "mdi:floor-plan",
        mode: "storage",
        show_in_sidebar: false,
        require_admin: false,
      },
    ]);
  if (message.type === "lovelace/config" && message.url_path === dashboardPath)
    return Promise.resolve(dashboard);
  return Promise.reject(new Error(`The live demo has no ${String(message.type)}.`));
};

// HA's registries as its frontend carries them (its cards read the full entries).
const entities = Object.fromEntries(
  Object.entries(home.entities).map(([entityId, entry]) => [
    entityId,
    { entity_id: entityId, platform: "demo", labels: [], area_id: null, device_id: null, ...entry },
  ]),
);
const deviceNames: Readonly<Record<string, string>> = {
  dev_front_door: "Front door",
  dev_living_room_ac: "Living room AC",
};
const devices = Object.fromEntries(
  Object.entries(home.devices).map(([id, entry]) => [
    id,
    { id, name: deviceNames[id] ?? null, labels: [], ...entry },
  ]),
);
const areas = Object.fromEntries(
  Object.entries(home.areas).map(([id, entry]) => [
    id,
    { floor_id: null, icon: null, picture: null, labels: [], aliases: [], ...entry },
  ]),
);
// A visitor is no HA admin: the panel hides Edit mode and Settings.
const user = {
  id: "demo",
  name: "Visitor",
  is_admin: false,
  is_owner: false,
  credentials: [],
  mfa_modules: [],
};

type Cards = Readonly<{
  completeHass: (partial: Readonly<Record<string, unknown>>) => Promise<unknown>;
  provideHass: (host: HTMLElement, hass: unknown) => (next: unknown) => void;
}>;

/** The HA cards bundle's helpers (window.homeplanHaCards, set when ha-cards.js loads). */
const loadCards = async (): Promise<Cards> => {
  await import(/* @vite-ignore */ new URL("ha-cards/ha-cards.js", document.baseURI).href);
  const api: unknown = Reflect.get(window, "homeplanHaCards");
  const complete: unknown = typeof api === "object" && api !== null ? Reflect.get(api, "completeHass") : null;
  const provide: unknown = typeof api === "object" && api !== null ? Reflect.get(api, "provideHass") : null;
  if (typeof complete !== "function" || typeof provide !== "function")
    throw new Error("The Home Assistant cards did not load.");
  return {
    completeHass: async (partial) => {
      const hass: unknown = await Reflect.apply(complete, api, [partial]);
      return hass;
    },
    provideHass: (host, hass) => {
      const update: unknown = Reflect.apply(provide, api, [host, hass]);
      if (typeof update !== "function") throw new Error("The Home Assistant cards did not load.");
      return (next) => {
        Reflect.apply(update, undefined, [next]);
      };
    },
  };
};

const start = async (): Promise<void> => {
  const cards = await loadCards();
  let localize: unknown = undefined;
  let update: ((next: unknown) => void) | null = null;
  let queue = Promise.resolve();

  /** A new hass for the panel and the cards' context, in order (HA's own fills it, from the fake home). */
  const publish = (): void => {
    queue = queue
      .then(async () => {
        const hass = await cards.completeHass({
          states: home.states(),
          entities,
          devices,
          areas,
          user,
          callWS,
          callService,
          ...(localize === undefined ? {} : { localize }),
        });
        localize ??= typeof hass === "object" && hass !== null ? Reflect.get(hass, "localize") : undefined;
        if (update === null) update = cards.provideHass(document.body, hass);
        else update(hass);
        Reflect.set(panel, "hass", hass);
      })
      .catch((error: unknown) => {
        console.error("[live demo]", error);
      });
  };
  const callService = (
    domain: string,
    service: string,
    data?: Readonly<Record<string, unknown>>,
    target?: Readonly<Record<string, unknown>>,
  ): Promise<unknown> => {
    if (home.callService(domain, service, data, target)) publish();
    return Promise.resolve({ context: { id: "", parent_id: null, user_id: null } });
  };

  publish();
  await queue;
  const narrow = (): void => {
    Reflect.set(panel, "narrow", window.innerWidth < 870);
  };
  narrow();
  window.addEventListener("resize", narrow);
  Reflect.set(panel, "panel", {
    config: { mode: "demo", data_base: new URL("data/", document.baseURI).href },
  });
};

start().catch((error: unknown) => {
  console.error("[live demo]", error);
  const message = document.querySelector("#demo-error");
  if (message !== null) message.textContent = "The live demo could not start in this browser.";
});
