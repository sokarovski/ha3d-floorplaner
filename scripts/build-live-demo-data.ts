// The website's live demo data (spec/product/showcase-website.md#live-demo): the static files the HA panel's demo
// source (ha-viewer/houseSource.ts, createDemoHouseSource) reads for the demo city apartment, written to
// dist/live-demo-public/data/: preferences.json (viewer setup, bindings, room-cards dashboard),
// houses/<id>/document.json, and every built-in template (templates/<id>/v<version>.glb) and texture
// (images/<id>.png) the house uses, copied from what the server serves. Deterministic: the same demo house and
// built-in files give the same bytes. Run: npm run demo:data
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PreferencesResponse } from "../shared/contracts/preferences";
import type { PreferencesResponseValue } from "../shared/contracts/preferences";
import { findBuiltInImage, isBuiltInImageId } from "../shared/domain/house/builtinMaterials";
import { readStoredHouseEnvelope } from "../shared/domain/house/readStoredHouse";
import type { HaHouseBindingsValue } from "../shared/domain/schemas/homeAssistant";
import { defaultPreferences } from "../shared/domain/schemas/preferences";
import { compileValidator } from "../shared/domain/validation/ajv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "dist/live-demo-public/data");
const housePath = resolve(root, "server/demo-houses/city-apartment.json");
/** The room-cards dashboard the demo's fake Home Assistant serves (ha-viewer/liveDemo.ts). */
const dashboardPath = "homeplan-rooms";

const raw: unknown = JSON.parse(readFileSync(housePath, "utf8"));
const revision: unknown = typeof raw === "object" && raw !== null ? Reflect.get(raw, "revision") : undefined;
const read = readStoredHouseEnvelope({ revision, document: raw });
if (read.kind === "invalid") throw new Error(`The demo city apartment is invalid: ${read.message}`);
const house = read.document;

const floor = house.floors[0];
if (floor === undefined) throw new Error("The demo city apartment has no floor.");
const area = (name: string) => {
  const found = floor.areas.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`The demo city apartment has no room "${name}".`);
  return found;
};
/** The ID of a named object or wall opening (doors and windows live on the room's walls). */
const objectIn = (areaName: string, name: string): string => {
  const found: string[] = [];
  const search = (value: unknown): void => {
    if (Array.isArray(value)) for (const item of value) search(item);
    else if (typeof value === "object" && value !== null) {
      const id: unknown = Reflect.get(value, "id");
      if (typeof id === "string" && Reflect.get(value, "name") === name) found.push(id);
      for (const item of Object.values(value)) search(item);
    }
  };
  search(area(areaName));
  const [id] = found;
  if (id === undefined || found.length > 1)
    throw new Error(`The demo room "${areaName}" has no single object "${name}".`);
  return id;
};

const toggle = { action: "toggle" };
/** Long press on any linked thing opens HA's more-info dialog for its entity. */
const moreInfo = { action: "more-info" };
const lightsOf = (areaName: string, entityId: string): HaHouseBindingsValue["lights"] =>
  Object.fromEntries(
    area(areaName).lights.map((light) => [
      light.id,
      { stateEntityId: entityId, tapAction: toggle, holdAction: moreInfo },
    ]),
  );

/** The demo's bindings: the fake HA entities of ha-viewer/fakeHome.ts on the apartment's lamps and openings. */
const bindings: HaHouseBindingsValue = {
  lights: {
    ...lightsOf("Living, kitchen and dining", "light.kitchen"),
    ...lightsOf("Entrance hall", "light.hallway"),
    ...lightsOf("Bathroom", "light.bathroom"),
    ...lightsOf("Bedroom", "light.bedroom"),
  },
  objects: {
    [objectIn("Living, kitchen and dining", "Balcony door")]: {
      stateEntityId: "cover.balcony_sliding_door",
      holdAction: moreInfo,
      states: {
        openPct: {
          entity: "cover.balcony_sliding_door",
          attribute: "current_position",
          map: { kind: "linear", from: { start: 0, end: 100 }, to: { start: 0, end: 100 } },
        },
        blindsClosed: {
          entity: "cover.living_room_blinds",
          attribute: "current_tilt_position",
          map: { kind: "threshold", at: 0, atOrBelow: true, above: false },
        },
      },
    },
    [objectIn("Bathroom", "Bathroom door")]: {
      stateEntityId: "binary_sensor.bathroom_door",
      holdAction: moreInfo,
      states: {
        openAngleDeg: {
          entity: "binary_sensor.bathroom_door",
          map: {
            kind: "table",
            cases: [
              { state: "on", value: 90 },
              { state: "off", value: 0 },
            ],
          },
        },
      },
    },
    [objectIn("Living, kitchen and dining", "TV")]: {
      stateEntityId: "media_player.living_room_tv",
      holdAction: moreInfo,
    },
    // The washer's round door follows its door sensor.
    [objectIn("Utility", "Washing machine")]: {
      stateEntityId: "switch.washing_machine",
      holdAction: moreInfo,
      states: {
        doorOpenDeg: {
          entity: "binary_sensor.washing_machine_door",
          map: {
            kind: "table",
            cases: [
              { state: "on", value: 100 },
              { state: "off", value: 0 },
            ],
          },
        },
      },
    },
    // The front door's template has no open state, so the hall's door sensor opens the Living door it faces.
    [objectIn("Living, kitchen and dining", "Living door")]: {
      stateEntityId: "binary_sensor.front_door",
      holdAction: moreInfo,
      states: {
        openAngleDeg: {
          entity: "binary_sensor.front_door",
          map: {
            kind: "table",
            cases: [
              { state: "on", value: 90 },
              { state: "off", value: 0 },
            ],
          },
        },
      },
    },
  },
  effects: {},
  // The hallway motion sensor sweeps the entrance hall (default corners).
  areas: {
    [area("Entrance hall").id]: {
      stateEntityId: null,
      presence: { entityId: "binary_sensor.hallway_motion" },
    },
  },
  // A bubble above the utility room shows whether the washing machine is on.
  bubbles: {
    rooms: {
      [area("Utility").id]: [
        {
          id: "b_washer",
          preset: "state",
          stateEntityId: "switch.washing_machine",
          icon: "mdi:washing-machine",
          format: "state",
        },
      ],
    },
    placed: {},
  },
};

const preferences: PreferencesResponseValue = {
  revision: 0,
  preferences: {
    ...defaultPreferences,
    homeAssistant: {
      viewer: { houseId: house.id, testEntityId: null },
      bindings: { [house.id]: bindings },
      dashboard: {
        ...defaultPreferences.homeAssistant.dashboard,
        urlPath: dashboardPath,
        // The living room opens looking from the left towards the TV wall (saved once in the harness, then tilted).
        areaViews: {
          [house.id]: {
            [area("Living, kitchen and dining").id]: {
              target: { x: 3125, y: 3700, h: 1200 },
              distance: 13,
              azimuth: -0.9602,
              polar: 0.56,
            },
          },
        },
      },
    },
  },
};
if (!compileValidator(PreferencesResponse)(preferences))
  throw new Error("The demo preferences do not match the preferences contract.");

// Every built-in template version and texture the house refers to (the URLs the viewer requests).
const templates = new Set<string>();
const images = new Set<string>();
const visit = (value: unknown): void => {
  if (Array.isArray(value)) {
    for (const item of value) visit(item);
    return;
  }
  if (typeof value === "string") {
    if (isBuiltInImageId(value)) images.add(value);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const templateId: unknown = Reflect.get(value, "templateId");
  const version: unknown = Reflect.get(value, "templateVersion");
  if (typeof templateId === "string" && typeof version === "number") {
    if (templateId.startsWith("t_")) throw new Error(`The demo house uses a house template (${templateId}).`);
    templates.add(`${templateId}/v${String(version)}`);
  }
  for (const item of Object.values(value)) visit(item);
};
visit(house);
const houseImages = JSON.stringify(house).match(/"img_[A-Za-z0-9_-]+"/g);
if (houseImages !== null) throw new Error("The demo house uses uploaded house images.");

await rm(out, { recursive: true, force: true });
const write = async (path: string, text: string): Promise<void> => {
  await mkdir(dirname(resolve(out, path)), { recursive: true });
  await writeFile(resolve(out, path), text);
};
await write("preferences.json", `${JSON.stringify(preferences, null, 2)}\n`);
await write(
  `houses/${house.id}/document.json`,
  `${JSON.stringify({ revision: read.revision, document: house })}\n`,
);
for (const template of [...templates].sort()) {
  const target = resolve(out, "templates", `${template}.glb`);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, "server/builtin-templates", `${template}.glb`), target);
}
for (const imageId of [...images].sort()) {
  const image = findBuiltInImage(imageId);
  if (image === undefined) throw new Error(`Unknown built-in image ${imageId}.`);
  await mkdir(resolve(out, "images"), { recursive: true });
  await copyFile(
    resolve(root, "server/builtin-materials", image.file),
    resolve(out, "images", `${imageId}.png`),
  );
}
console.log(
  `OK   live demo data for "${house.name}": ${String(templates.size)} templates, ${String(images.size)} textures → ${out}`,
);
