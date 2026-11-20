// A Home Assistant without Home Assistant, shared by the website's live demo (liveDemo.ts) and the dev harness's
// fake HA (harness.ts; Phase 21, owner: the fake HA works like the live demo). It runs <homeplan-panel> on a fake
// home (fakeHome.ts) with real Home Assistant cards from the HA cards bundle (packaging/ha-cards/): HA's own
// `completeHass` fills the hass object, `provideHass` gives the cards their context, and a small dashboard answers
// `lovelace/dashboards/list` and `lovelace/config`, so rooms open with their cards. Every state change goes to the
// panel and to the cards, so lamps tapped in 3D and card controls stay in step. Without the cards bundle (a dev
// server before `npm run demo:ha-cards`), the panel gets a plain hass and rooms open without cards.
import type { FakeHome } from "./fakeHome";

/** A Lovelace dashboard as HA stores it (only what the room cards read). */
export type FakeDashboard = Readonly<{ views: readonly Readonly<Record<string, unknown>>[] }>;

/** A card of a sections view; `toggle` lets a visitor flip a simulated sensor from its tile. */
export const tileCard = (entity: string, toggle = false): Record<string, unknown> => ({
  type: "tile",
  entity,
  ...(toggle ? { tap_action: { action: "toggle" }, icon_tap_action: { action: "toggle" } } : {}),
});

/** One dashboard tab; the viewer matches a room to the tab of the same name. */
export const dashboardView = (
  title: string,
  cards: readonly Readonly<Record<string, unknown>>[],
): Record<string, unknown> => ({
  title,
  path: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  type: "sections",
  max_columns: 1,
  sections: [{ type: "grid", cards }],
});

/** The demo's room-cards dashboard: one tab per room of the demo city apartment, named like the room. */
export const demoDashboard: FakeDashboard = {
  views: [
    dashboardView("Living, kitchen and dining", [
      { type: "thermostat", entity: "climate.living_room" },
      { type: "media-control", entity: "media_player.living_room_tv" },
      tileCard("light.kitchen"),
      {
        ...tileCard("cover.living_room_blinds"),
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
    dashboardView("Entrance hall", [
      tileCard("light.hallway"),
      tileCard("binary_sensor.hallway_motion", true),
      { ...tileCard("binary_sensor.front_door", true), name: "Living room door" },
      tileCard("lock.front_door"),
    ]),
    dashboardView("Bedroom", [tileCard("light.bedroom")]),
    dashboardView("Bathroom", [tileCard("light.bathroom"), tileCard("binary_sensor.bathroom_door", true)]),
    dashboardView("Utility", [
      { ...tileCard("switch.washing_machine"), name: "Washer" },
      { ...tileCard("sensor.washing_machine_power"), name: "Power" },
      { ...tileCard("binary_sensor.washing_machine_door", true), name: "Washer door" },
    ]),
    dashboardView("Balcony", [tileCard("cover.balcony_sliding_door", true)]),
  ],
};

/** The room-cards dashboard's path (the viewer's default dashboard is matched by it). */
export const fakeDashboardPath = "homeplan-rooms";

const deviceNames: Readonly<Record<string, string>> = {
  dev_front_door: "Front door",
  dev_living_room_ac: "Living room AC",
};

/** HA's registries as its frontend carries them (its cards read the full entries). */
const registries = (home: FakeHome): Readonly<{ entities: unknown; devices: unknown; areas: unknown }> => ({
  entities: Object.fromEntries(
    Object.entries(home.entities).map(([entityId, entry]) => [
      entityId,
      { entity_id: entityId, platform: "demo", labels: [], area_id: null, device_id: null, ...entry },
    ]),
  ),
  devices: Object.fromEntries(
    Object.entries(home.devices).map(([id, entry]) => [
      id,
      { id, name: deviceNames[id] ?? null, labels: [], ...entry },
    ]),
  ),
  areas: Object.fromEntries(
    Object.entries(home.areas).map(([id, entry]) => [
      id,
      { floor_id: null, icon: null, picture: null, labels: [], aliases: [], ...entry },
    ]),
  ),
});

type Cards = Readonly<{
  completeHass: (partial: Readonly<Record<string, unknown>>) => Promise<unknown>;
  provideHass: (host: HTMLElement, hass: unknown) => (next: unknown) => void;
}>;

/** The HA cards bundle's helpers (window.homeplanHaCards, set when ha-cards.js loads). */
const loadCards = async (base: string): Promise<Cards> => {
  await import(/* @vite-ignore */ new URL("ha-cards/ha-cards.js", base).href);
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

export type FakeHaOptions = Readonly<{
  panel: Element;
  /** The fake home (or one with stored entities on top, fakeHaStore.ts); read on every publish. */
  home: () => FakeHome;
  /** The room-cards dashboard, read on every request (it may follow the entities). */
  dashboard: () => FakeDashboard;
  /** An HA admin sees Edit mode and Settings (the harness); a visitor does not (the live demo). */
  admin: boolean;
  /** Where ha-cards/ lives (its URL's base). */
  cardsBase: string;
  /** HA's dark mode, read on every publish. */
  darkMode?: () => boolean;
  /** Every service call, after the fake home has answered it (the harness logs it). */
  onService?: (domain: string, service: string, data?: Readonly<Record<string, unknown>>) => void;
}>;

export type FakeHa = Readonly<{
  /** Sends the current states to the panel and the cards. */
  publish: () => void;
  /** Whether HA's own cards loaded. */
  withCards: () => boolean;
}>;

export const startFakeHa = async (options: FakeHaOptions): Promise<FakeHa> => {
  const { panel } = options;
  let cards: Cards | null = null;
  try {
    cards = await loadCards(options.cardsBase);
  } catch (error: unknown) {
    console.warn(
      "[fake HA] Home Assistant's cards are not available (run `npm run demo:ha-cards`); rooms open without cards.",
      error,
    );
  }
  const user = options.admin
    ? { id: "dev", name: "Developer", is_admin: true, is_owner: true, credentials: [], mfa_modules: [] }
    : { id: "demo", name: "Visitor", is_admin: false, is_owner: false, credentials: [], mfa_modules: [] };
  const callWS = (message: Readonly<Record<string, unknown>>): Promise<unknown> => {
    if (message.type === "lovelace/dashboards/list")
      return Promise.resolve([
        {
          id: fakeDashboardPath,
          url_path: fakeDashboardPath,
          title: "Homeplan rooms",
          icon: "mdi:floor-plan",
          mode: "storage",
          show_in_sidebar: false,
          require_admin: false,
        },
      ]);
    // One dashboard: every dashboard reads as it (a house's bindings may name one of a real HA's dashboards).
    if (message.type === "lovelace/config") return Promise.resolve(options.dashboard());
    return Promise.reject(new Error(`The fake Home Assistant has no ${String(message.type)}.`));
  };
  let localize: unknown = undefined;
  let update: ((next: unknown) => void) | null = null;
  let queue = Promise.resolve();
  const publish = (): void => {
    queue = queue
      .then(async () => {
        const home = options.home();
        const partial = {
          states: home.states(),
          ...registries(home),
          user,
          callWS,
          callService,
          themes: { darkMode: options.darkMode?.() ?? false },
          ...(localize === undefined ? {} : { localize }),
        };
        if (cards === null) {
          Reflect.set(panel, "hass", partial);
          return;
        }
        const hass = await cards.completeHass(partial);
        localize ??= typeof hass === "object" && hass !== null ? Reflect.get(hass, "localize") : undefined;
        if (update === null) update = cards.provideHass(document.body, hass);
        else update(hass);
        Reflect.set(panel, "hass", hass);
      })
      .catch((error: unknown) => {
        console.error("[fake HA]", error);
      });
  };
  const callService = (
    domain: string,
    service: string,
    data?: Readonly<Record<string, unknown>>,
    target?: Readonly<Record<string, unknown>>,
  ): Promise<unknown> => {
    if (options.home().callService(domain, service, data, target)) publish();
    options.onService?.(domain, service, data);
    return Promise.resolve({ context: { id: "", parent_id: null, user_id: null } });
  };
  publish();
  await queue;
  return { publish, withCards: () => cards !== null };
};
