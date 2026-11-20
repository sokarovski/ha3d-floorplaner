// Dev-only fake Home Assistant for harness.html: sets panel, narrow, and a new hass object per change,
// keeping unchanged entity objects identical like HA does.
import "./main";
import { createId } from "@shared/domain/ids";
import type { HaHouseBubblesValue } from "@shared/domain/schemas/homeAssistant";
import { createFakeHome } from "./fakeHome";
import type { FakeControl } from "./fakeHome";
import type { Hass } from "./hassStore";

const home = createFakeHome();

let darkMode = false;

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
    states: home.states(),
    entities: home.entities,
    devices: home.devices,
    areas: home.areas,
    themes: { darkMode },
    // Fake services (fakeHome.ts): lights, covers, select, the AC, the lock and the TV on the fake entities, and
    // toggle/turn_on/turn_off on the others (entity in the data or the target); everything is logged.
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
      if (home.callService(domain, service, data, target)) publish();
      return Promise.resolve(undefined);
    },
  };
  panel.setAttribute("data-dark", String(darkMode));
  document.body.style.background = darkMode ? "#111" : "#fafafa";
  Reflect.set(panel, "hass", hass);
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

const controls: readonly FakeControl[] = [
  "toggle-test",
  "toggle-other",
  "night",
  "climate",
  "washer",
  "tv",
  "motion",
  "door",
  "door-unavailable",
  "window",
  "tilt",
  "lock",
  "venetian",
  "window-two",
  "handle",
  "sliding-cover",
  "swing",
  "vane",
  "washer-door",
];
for (const control of controls)
  document.querySelector(`#${control}`)?.addEventListener("click", () => {
    home.control(control);
    publish();
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

// Phase 21 prototype switch (three/prototypeFlags.ts): the button flips its localStorage key and reloads.
const protoSwitch = (
  selector: string,
  key: string,
  label: string,
  values: readonly [string, string],
): void => {
  const button = document.querySelector(selector);
  if (button === null) return;
  let current = values[0];
  try {
    current = window.localStorage.getItem(key) === values[1] ? values[1] : values[0];
  } catch {
    // Storage blocked: the switch shows the default and cannot change.
  }
  button.textContent = `${label}: ${current} (switch)`;
  button.addEventListener("click", () => {
    try {
      window.localStorage.setItem(key, current === values[0] ? values[1] : values[0]);
    } catch {
      return;
    }
    window.location.reload();
  });
};
protoSwitch("#proto-limits", "homeplan.proto.limits", "Limits", ["standard", "low"]);
