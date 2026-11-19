// Where the viewer gets houses, assets, and its setup (spec/home-assistant/viewer-mvp.md#house-source).
// Only this module knows URLs. The dev implementation talks to the builder's API through the Vite proxy; the demo
// implementation reads the static files `npm run demo:data` writes for the website's live demo.
import type { AssetReader } from "../src/renderer/assetTransport";
import type { Static, TSchema } from "typebox";
import { StoredHouseDocumentEnvelope } from "@shared/contracts/document";
import type { HouseDocumentEnvelopeValue } from "@shared/contracts/document";
import { HouseListResponse } from "@shared/contracts/houses";
import type { HouseCardValue } from "@shared/contracts/houses";
import { PreferencesResponse } from "@shared/contracts/preferences";
import { compileValidator } from "@shared/domain/validation/ajv";
import { readStoredHouseEnvelope } from "@shared/domain/house/readStoredHouse";
import { emptyHouseBindings } from "@shared/domain/schemas/homeAssistant";
import type {
  HaBindingsPatchValue,
  HaDashboardValue,
  HaHouseBindingsPatchValue,
  HaHouseBindingsValue,
} from "@shared/domain/schemas/homeAssistant";

/** What one Settings Save writes (10.9): the changed bindings kinds per house and the dashboard, if changed. */
export type SettingsPatch = Readonly<{ bindings?: HaBindingsPatchValue; dashboard?: HaDashboardValue }>;

export type ViewerSetup = Readonly<{ houseId: string | null; testEntityId: string | null }>;

export type HouseSource = Readonly<{
  integration?: boolean;
  /** The website's live demo: nothing can be saved, so Edit mode needs an HA admin like in the integration. */
  readOnly?: boolean;
  dispose?: () => void;
  acceptConfigRevision?: (previous: number, next: number) => void;
  readAsset?: AssetReader;
  listHouses: () => Promise<readonly HouseCardValue[]>;
  loadHouse: (houseId: string) => Promise<HouseDocumentEnvelopeValue>;
  /** Built-in templates (IDs not starting with t_) are global; house templates live under the house. */
  templateUrl: (houseId: string, templateId: string, version: number) => string;
  imageUrl: (houseId: string, imageId: string) => string;
  readSetup: () => Promise<ViewerSetup>;
  saveSetup: (setup: ViewerSetup) => Promise<void>;
  /** The bindings of one house (D25: HA configuration, stored in preferences next to the setup). */
  readBindings: (houseId: string) => Promise<HaHouseBindingsValue>;
  /** Saves the kinds given (each replaces that kind whole, `bubbles` included); the others are kept. */
  saveBindings: (houseId: string, bindings: HaHouseBindingsPatchValue) => Promise<void>;
  /** The room-cards dashboard and the room-to-tab mapping. */
  readDashboard: () => Promise<HaDashboardValue>;
  saveDashboard: (dashboard: HaDashboardValue) => Promise<void>;
  /** Saves the Settings screen's changes (10.9) in one revision-aware preferences patch. */
  saveSettings: (patch: SettingsPatch) => Promise<void>;
}>;

export class SourceError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "SourceError";
    this.status = status;
  }
}

const decode = <S extends TSchema>(schema: S, payload: unknown, what: string): Static<S> => {
  const validate = compileValidator(schema);
  if (!validate(payload)) throw new SourceError(`The builder sent an unexpected ${what}.`, null);
  return payload;
};

/**
 * A loaded `{ revision, document }` of any supported house schema version, migrated to the current one (Phase 16.14:
 * an HA copy may still be version 4; its staircase areas become stair objects and floor openings).
 */
export const currentHouseEnvelope = (envelope: unknown): HouseDocumentEnvelopeValue => {
  const read = readStoredHouseEnvelope(envelope);
  if (read.kind === "invalid") throw new SourceError(read.message, null);
  return { revision: read.revision, document: read.document };
};

export const createDevHouseSource = (apiBase: string): HouseSource => {
  const base = apiBase.replace(/\/$/, "");

  const request = async <S extends TSchema>(
    schema: S,
    what: string,
    path: readonly string[],
    init?: RequestInit,
  ): Promise<Static<S>> => {
    let response: Response;
    try {
      response = await fetch(url(path), init);
    } catch {
      throw new SourceError(`The builder at ${base} is unreachable.`, null);
    }
    if (!response.ok)
      throw new SourceError(
        response.status === 404
          ? `The ${what} was not found.`
          : `The builder answered ${String(response.status)}.`,
        response.status,
      );
    const payload: unknown = await response.json();
    return decode(schema, payload, what);
  };

  const url = (path: readonly string[]): string =>
    `${base}/${path.map((segment) => encodeURIComponent(segment)).join("/")}`;

  const readPreferences = () => request(PreferencesResponse, "preferences", ["preferences"]);

  /** Patches preferences.homeAssistant against the latest revision. */
  const patchHomeAssistant = async (homeAssistant: Readonly<Record<string, unknown>>): Promise<void> => {
    const { revision } = await readPreferences();
    await request(PreferencesResponse, "preferences", ["preferences"], {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: revision, patch: { homeAssistant } }),
    });
  };

  return {
    listHouses: async () => (await request(HouseListResponse, "house list", ["houses"])).houses,
    loadHouse: async (houseId) =>
      currentHouseEnvelope(
        await request(StoredHouseDocumentEnvelope, "house", ["houses", houseId, "document"]),
      ),
    templateUrl: (houseId, templateId, version) =>
      templateId.startsWith("t_")
        ? url(["houses", houseId, "templates", templateId, "v", String(version)])
        : url(["templates", "builtin", templateId, "v", String(version)]),
    imageUrl: (houseId, imageId) => url(["houses", houseId, "images", imageId, "file"]),
    readSetup: async () => (await readPreferences()).preferences.homeAssistant.viewer,
    saveSetup: (setup) => patchHomeAssistant({ viewer: setup }),
    readBindings: async (houseId) =>
      (await readPreferences()).preferences.homeAssistant.bindings[houseId] ?? emptyHouseBindings(),
    saveBindings: (houseId, bindings) => patchHomeAssistant({ bindings: { [houseId]: bindings } }),
    readDashboard: async () => (await readPreferences()).preferences.homeAssistant.dashboard,
    saveDashboard: (dashboard) => patchHomeAssistant({ dashboard }),
    saveSettings: (patch) => patchHomeAssistant(patch),
  };
};

/**
 * The website's live demo (spec/product/showcase-website.md#live-demo): one house read from static files under
 * `dataBase` (`preferences.json`, `houses/<id>/document.json`, `templates/<id>/v<version>.glb`,
 * `images/<id>.png`), written by `npm run demo:data`. Read-only: there is no house list and nothing saves.
 */
export const createDemoHouseSource = (dataBase: string): HouseSource => {
  const base = dataBase.replace(/\/$/, "");
  const url = (...path: readonly string[]): string =>
    `${base}/${path.map((segment) => encodeURIComponent(segment)).join("/")}`;
  const read = async <S extends TSchema>(schema: S, what: string, address: string): Promise<Static<S>> => {
    const response = await fetch(address);
    if (!response.ok) throw new SourceError(`The demo ${what} could not be loaded.`, response.status);
    const payload: unknown = await response.json();
    return decode(schema, payload, what);
  };
  let preferences: Promise<Static<typeof PreferencesResponse>> | null = null;
  const readPreferences = () => {
    preferences ??= read(PreferencesResponse, "preferences", url("preferences.json"));
    return preferences;
  };
  const readOnly = (): Promise<never> =>
    Promise.reject(new SourceError("The live demo cannot save changes.", null));
  return {
    readOnly: true,
    listHouses: readOnly,
    loadHouse: async (houseId) =>
      currentHouseEnvelope(
        await read(StoredHouseDocumentEnvelope, "house", url("houses", houseId, "document.json")),
      ),
    templateUrl: (houseId, templateId, version) =>
      templateId.startsWith("t_")
        ? url("houses", houseId, "templates", templateId, `v${String(version)}.glb`)
        : url("templates", templateId, `v${String(version)}.glb`),
    imageUrl: (_houseId, imageId) => url("images", `${imageId}.png`),
    readSetup: async () => (await readPreferences()).preferences.homeAssistant.viewer,
    saveSetup: readOnly,
    readBindings: async (houseId) =>
      (await readPreferences()).preferences.homeAssistant.bindings[houseId] ?? emptyHouseBindings(),
    saveBindings: readOnly,
    readDashboard: async () => (await readPreferences()).preferences.homeAssistant.dashboard,
    saveDashboard: readOnly,
    saveSettings: readOnly,
  };
};
