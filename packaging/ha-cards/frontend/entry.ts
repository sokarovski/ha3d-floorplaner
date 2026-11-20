// Homeplan's HA cards bundle (spec/product/showcase-website.md#live-demo): real Home Assistant Lovelace cards
// without a Home Assistant server, for the website's live demo. Compiled inside a home-assistant/frontend
// checkout by scripts/build-ha-cards.mjs (HA's toolchain and types; not part of Homeplan's lint/typecheck).
//  - window.loadCardHelpers(): same public shape as in HA, limited card types.
//  - window.homeplanHaCards.completeHass(partial): fills what the cards read
//    (localize, formatters, locale, config, connection, ...) with HA's code.
//  - window.homeplanHaCards.provideHass(host, hass): Lit context providers on
//    `host` (HA root normally provides them) + a "hass-action" handler (HA's
//    root action mixin normally handles tap/hold actions). Returns an updater.
import "./static-path";
import "../src/resources/append-ha-style"; // theme CSS variables + Roboto @font-face on <html>
import { ContextProvider } from "@lit/context";
import { createLovelaceElement } from "../src/panels/lovelace/create-element/create-element-base";
import type { LovelaceCardConfig } from "../src/data/lovelace/config/card";
import { computeLocalize } from "../src/common/translations/localize";
import { computeFormatFunctions } from "../src/common/translations/entity-state";
import { handleAction } from "../src/panels/lovelace/common/handle-action";
import { updateHassGroups } from "../src/data/context/updateContext";
import {
  apiContext,
  areasContext,
  configContext,
  configSingleContext,
  connectionContext,
  connectionSingleContext,
  devicesContext,
  entitiesContext,
  floorsContext,
  formattersContext,
  internationalizationContext,
  localeContext,
  localizeContext,
  panelsContext,
  reducedMotionContext,
  registriesContext,
  selectedThemeContext,
  servicesContext,
  statesContext,
  themesContext,
  uiContext,
  userContext,
  userDataContext,
} from "../src/data/context";
import { ENTITY_COMPONENT_ICONS } from "../src/fake_data/entity_component_icons";
import { DateFormat, FirstWeekday, NumberFormat, TimeFormat, TimeZone } from "../src/data/translation";
import { translationMetadata } from "../src/resources/translations-metadata";
import type { HomeAssistant } from "../src/types";

const ALWAYS_LOADED_TYPES = new Set<string>([]);
const LAZY_LOAD_TYPES: Record<string, () => Promise<unknown>> = {
  tile: () => import("../src/panels/lovelace/cards/hui-tile-card"),
  light: () => import("../src/panels/lovelace/cards/hui-light-card"),
  thermostat: () => import("../src/panels/lovelace/cards/hui-thermostat-card"),
  "media-control": () => import("../src/panels/lovelace/cards/hui-media-control-card"),
  entities: () => import("../src/panels/lovelace/cards/hui-entities-card"),
  // Not shown as a card: the viewer's Settings build its editor once so HA loads ha-form and its selectors, as
  // inside Home Assistant (ha-viewer/haElements.ts); the dev harness's Settings then use HA's own fields.
  button: () => import("../src/panels/lovelace/cards/hui-button-card"),
};

export const createCardElement = (config: LovelaceCardConfig) =>
  createLovelaceElement("card", config, ALWAYS_LOADED_TYPES, LAZY_LOAD_TYPES, undefined, undefined);

Object.assign(window, { loadCardHelpers: async () => ({ createCardElement }) });

// ---------------------------------------------------------------- fake hass
const localizeCache = document.createElement("div");
let resourcesPromise: Promise<Record<string, Record<string, string>>> | undefined;
const loadResources = () =>
  (resourcesPromise ??= Promise.all([
    import("./translations/core-en.json"),
    import("./translations/lovelace-en.json"),
  ]).then(([core, lovelace]) => ({ en: { ...core.default, ...lovelace.default } })));

const completeHass = async (partial: Partial<HomeAssistant>): Promise<HomeAssistant> => {
  const callWS = partial.callWS ?? (async (msg: any) => Promise.reject(new Error(`No WS ${msg.type}`)));
  const builtinWS = (msg: any): unknown => {
    if (msg.type === "frontend/get_icons")
      return { resources: msg.category === "entity_component" ? ENTITY_COMPONENT_ICONS : {} };
    if (msg.type === "frontend/get_translations") return { resources: {} };
    return undefined;
  };
  const connection: any = partial.connection ?? {
    haVersion: "homeplan-demo",
    socket: { readyState: WebSocket.OPEN },
    sendMessage: () => undefined,
    sendMessagePromise: async (msg: any) => builtinWS(msg) ?? callWS(msg),
    subscribeMessage: async () => () => undefined,
    subscribeEvents: async () => () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  const locale = partial.locale ?? {
    language: "en",
    number_format: NumberFormat.language,
    time_format: TimeFormat.language,
    date_format: DateFormat.language,
    time_zone: TimeZone.local,
    first_weekday: FirstWeekday.language,
  };
  const config: any = {
    location_name: "Home",
    latitude: 0,
    longitude: 0,
    elevation: 0,
    radius: 100,
    unit_system: {
      length: "km",
      mass: "kg",
      temperature: "°C",
      volume: "L",
      pressure: "Pa",
      wind_speed: "m/s",
      accumulated_precipitation: "mm",
    },
    components: [],
    time_zone: "UTC",
    currency: "EUR",
    country: "DE",
    language: "en",
    version: "2026.11.0",
    state: "RUNNING",
    ...partial.config,
  };
  // Icons (frontend/get_icons) are only looked up for loaded components
  config.components = [
    ...new Set([
      ...(config.components ?? []),
      ...Object.keys(partial.states ?? {}).map((id) => id.split(".")[0]),
    ]),
  ];
  const localize = partial.localize ?? (await computeLocalize(localizeCache, "en", await loadResources()));
  const entities = partial.entities ?? {};
  const devices = partial.devices ?? {};
  const areas = partial.areas ?? {};
  const floors = partial.floors ?? {};
  const formatters = await computeFormatFunctions(localize, locale, config, entities, devices, areas, floors);
  const hass: any = {
    auth: { data: { hassUrl: location.origin }, accessToken: "" },
    connection,
    connected: true,
    debugConnection: false,
    states: {},
    services: {},
    entities,
    devices,
    areas,
    floors,
    config,
    locale,
    localize,
    language: "en",
    selectedLanguage: null,
    translationMetadata,
    loadBackendTranslation: async () => localize,
    loadFragmentTranslation: async () => localize,
    themes: {
      default_theme: "default",
      default_dark_theme: null,
      themes: {},
      darkMode: false,
      theme: "default",
    },
    selectedTheme: { theme: "default", dark: false },
    panels: {},
    panelUrl: "lovelace",
    dockedSidebar: "docked",
    kioskMode: false,
    enableShortcuts: false,
    vibrate: false,
    suspendWhenHidden: false,
    user: {
      id: "homeplan",
      name: "Homeplan",
      is_admin: true,
      is_owner: true,
      credentials: [],
      mfa_modules: [],
    },
    userData: {},
    systemData: {},
    hassUrl: (path = "") => path,
    callService: async () => ({ context: { id: "", parent_id: null, user_id: null } }),
    callApi: async () => Promise.reject(new Error("callApi not available")),
    callApiRaw: async () => Promise.reject(new Error("callApiRaw not available")),
    fetchWithAuth: async () => Promise.reject(new Error("fetchWithAuth not available")),
    sendWS: () => undefined,
    ...formatters,
    ...partial,
    callWS: (msg: any) => connection.sendMessagePromise(msg),
  };
  hass.themes = { ...hass.themes, darkMode: hass.themes.darkMode ?? false };
  return hass as HomeAssistant;
};

const provideHass = (host: HTMLElement, initial: HomeAssistant) => {
  let hass = initial;
  const groups: Record<string, ContextProvider<any>> = {};
  const groupContexts = {
    registries: registriesContext,
    internationalization: internationalizationContext,
    api: apiContext,
    connection: connectionContext,
    ui: uiContext,
    config: configContext,
    formatters: formattersContext,
  };
  for (const [key, context] of Object.entries(groupContexts))
    groups[key] = new ContextProvider(host, {
      context: context as any,
      initialValue: updateHassGroups[key](hass),
    });
  const singles: [any, (h: any) => unknown][] = [
    [statesContext, (h) => h.states],
    [servicesContext, (h) => h.services],
    [entitiesContext, (h) => h.entities],
    [devicesContext, (h) => h.devices],
    [areasContext, (h) => h.areas],
    [floorsContext, (h) => h.floors],
    [connectionSingleContext, (h) => h.connection],
    [localizeContext, (h) => h.localize],
    [localeContext, (h) => h.locale],
    [configSingleContext, (h) => h.config],
    [themesContext, (h) => h.themes],
    [selectedThemeContext, (h) => h.selectedTheme],
    [userContext, (h) => h.user],
    [userDataContext, (h) => h.userData],
    [panelsContext, (h) => h.panels],
  ];
  const singleProviders = singles.map(
    ([context, get]) => [new ContextProvider(host, { context, initialValue: get(hass) }), get] as const,
  );
  new ContextProvider(host, { context: reducedMotionContext, initialValue: false });
  host.addEventListener("hass-action", (ev: any) => {
    const node = (ev.composedPath()[0] as HTMLElement | undefined) ?? host;
    handleAction(node, hass, ev.detail.config, ev.detail.action);
  });
  // "hass-more-info" (a card's more-info action, or the panel's long press): HA's own more-info dialog, which the
  // HA root normally opens.
  let dialog: any;
  host.addEventListener("hass-more-info", async (ev: any) => {
    const entityId: unknown = ev.detail?.entityId;
    if (typeof entityId !== "string" || entityId === "") return;
    await import("../src/dialogs/more-info/ha-more-info-dialog");
    if (dialog === undefined) {
      dialog = document.createElement("ha-more-info-dialog");
      host.appendChild(dialog);
    }
    dialog.hass = hass;
    dialog.showDialog({ entityId });
  });
  return (next: HomeAssistant) => {
    hass = next;
    if (dialog !== undefined) dialog.hass = hass;
    for (const [key, provider] of Object.entries(groups))
      provider.setValue(updateHassGroups[key](hass, provider.value));
    for (const [provider, get] of singleProviders) provider.setValue(get(hass));
  };
};

Object.assign(window, { homeplanHaCards: { completeHass, provideHass } });
