// Dev-only fake Home Assistant for harness.html (Phase 21: the fake HA works like the website's live demo): the
// shared fake Home Assistant of fakeHaHost.ts with real HA cards, as an HA admin (Edit mode and Settings), on the
// fake home with the entities of Setup HA laid over it (fakeHaStore.ts, kept in this browser). Everything the
// harness offers is in Settings → Setup HA (21.18: its Controls page holds the step buttons, dark mode, day and
// night, the renderer and the demo bubbles) and on window.homeplan (fakeHaBridge.ts); the page has no bar of its own.
import "./main";
import { availableRenderers, deviceRenderer, rendererList, saveDeviceRenderer } from "./three/renderers";
import { createId } from "@shared/domain/ids";
import type { HaHouseBubblesValue } from "@shared/domain/schemas/homeAssistant";
import { createFakeHaBridge } from "./fakeHaBridge";
import { startFakeHa } from "./fakeHaHost";
import { createFakeHaStore } from "./fakeHaStore";
import { FakeHaSetup } from "./fakeHaSetup";
import type { FakeHaControl } from "./fakeHaSetup";
import { createFakeHome } from "./fakeHome";
import type { FakeControl } from "./fakeHome";
import { registerSetupHaTab } from "./setupHaTab";

const store = createFakeHaStore(createFakeHome());
let home = store.home();

let darkMode = false;
let lastAction = "none";

const panel = document.querySelector("homeplan-panel");
if (panel === null) throw new Error("harness.html has no <homeplan-panel>.");

// Settings → Setup HA (the second tab, after House): created once, kept while the page lives.
const setup = new FakeHaSetup();
setup.store = store;

/** The last action the viewer (or a card) ran, shown on Setup HA's Controls page. */
const showAction = (text: string): void => {
  lastAction = text;
  setup.lastAction = text;
};
document.addEventListener("hass-more-info", (event) => {
  const entityId = event instanceof CustomEvent ? field(event.detail, "entityId") : undefined;
  console.info("[harness] more-info", entityId);
  showAction(`more-info ${typeof entityId === "string" ? entityId : "?"}`);
});

const fake = await startFakeHa({
  panel,
  home: () => home,
  dashboard: () => store.dashboard(),
  admin: true,
  // The dev server serves the cards bundle (npm run demo:ha-cards) next to this page (vite.config.ts).
  cardsBase: document.baseURI,
  darkMode: () => darkMode,
  onService: (domain, service, data) => {
    const entityId = data?.entity_id;
    console.info("[harness] callService", domain, service, data);
    const tilt = data?.tilt_position ?? data?.position ?? data?.option;
    showAction(
      `${domain}.${service}${typeof entityId === "string" ? ` ${entityId}` : ""}${
        typeof tilt === "number" || typeof tilt === "string" ? ` ${String(tilt)}` : ""
      }`,
    );
  },
});
setup.currentHass = () => fake.hass();
const publish = (): void => {
  panel.setAttribute("data-dark", String(darkMode));
  document.body.style.background = darkMode ? "#111" : "#fafafa";
  fake.publish();
};
/** The stored entities changed (Setup HA or window.homeplan): the panel, the cards and Setup HA follow. */
const refresh = (): void => {
  home = store.home();
  publish();
  setup.requestUpdate();
};
setup.addEventListener("fake-ha-changed", refresh);

const narrow = (): void => {
  Reflect.set(panel, "narrow", window.innerWidth < 870);
};
narrow();
window.addEventListener("resize", narrow);
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

/** The step controls of the demo entities (fakeHome.ts), by group. */
const steps: readonly (readonly [FakeControl, string, string])[] = [
  ["toggle-test", "Toggle light.kitchen", "Lights"],
  ["toggle-other", "Toggle light.hallway", "Lights"],
  ["night", "Day / night", "Display"],
  ["climate", "Cycle climate (cooling / heating / idle)", "Climate"],
  ["swing", "AC swing off / vertical / horizontal / both", "Climate"],
  ["vane", "AC horizontal position (select)", "Climate"],
  ["washer", "Washer power 0 / 450 W", "Appliances"],
  ["washer-door", "Washer door open / closed", "Appliances"],
  ["tv", "TV app (Netflix / YouTube / off)", "Appliances"],
  ["motion", "Hallway motion on / off", "Sensors"],
  ["door", "Front door open / closed", "Sensors"],
  ["door-unavailable", "Front door unavailable", "Sensors"],
  ["window", "Kitchen window open / closed", "Sensors"],
  ["window-two", "Kitchen window closed / tilted / open (two sensors)", "Sensors"],
  ["handle", "Window handle closed / tilted / open", "Sensors"],
  ["tilt", "Blinds tilt 100 / 50 / 0", "Covers and locks"],
  ["venetian", "Venetian tilt 50 / 0 / 100", "Covers and locks"],
  ["sliding-cover", "Balcony door motor 0 / 50 / 100 %", "Covers and locks"],
  ["lock", "Lock locked / unlocked / open", "Covers and locks"],
];
const setDarkMode = (on: boolean): void => {
  darkMode = on;
  publish();
};
const setRenderer = (id: string): boolean => {
  if (!rendererList.some((entry) => entry.id === id) || !saveDeviceRenderer(id, {})) return false;
  window.location.reload();
  return true;
};
const controls: readonly FakeHaControl[] = [
  ...steps.map(([id, label, group]) => ({
    id,
    label,
    group,
    run: () => {
      home.control(id);
      publish();
      showAction(`control ${label}`);
    },
  })),
  {
    id: "dark",
    label: "Dark mode on / off",
    group: "Display",
    run: () => {
      setDarkMode(!darkMode);
      showAction(`dark mode ${darkMode ? "on" : "off"}`);
    },
  },
  {
    id: "renderer",
    label: `Renderer: ${deviceRenderer().label} (next, reloads)`,
    group: "Viewer",
    run: () => {
      const index = rendererList.findIndex((entry) => entry.id === deviceRenderer().id);
      const next = rendererList[(index + 1) % rendererList.length];
      if (next !== undefined) setRenderer(next.id);
    },
  },
  {
    id: "bubbles",
    label: "Demo bubbles (reloads)",
    group: "Viewer",
    run: () => {
      writeDemoBubbles().catch((error: unknown) => {
        console.error("[harness] demo bubbles", error);
        window.alert(error instanceof Error ? error.message : "Could not write the demo bubbles.");
      });
    },
  },
];
setup.controls = controls;
registerSetupHaTab({
  subtitle:
    "The fake Home Assistant: step controls and entities, kept in this browser; changes apply at once.",
  element: () => setup,
});

// window.homeplan (21.18): the same as Setup HA, for scripts and agents.
Reflect.set(
  window,
  "homeplan",
  createFakeHaBridge({
    store,
    refresh,
    callService: (domain, service, data) => {
      void fake.callService(domain, service, data);
    },
    controls: () => controls,
    lastAction: () => lastAction,
    setDarkMode,
    renderers: () => {
      const current = deviceRenderer().id;
      return availableRenderers().map((renderer) => ({
        id: renderer.id,
        label: renderer.label,
        current: renderer.id === current,
      }));
    },
    setRenderer,
    writeDemoBubbles: () => writeDemoBubbles(),
  }),
);

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
