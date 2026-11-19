// The global preferences document (spec/architecture/application-preferences.md).
import type { PreferencesPatchValue } from "../../shared/contracts/preferences";
import { mergeBindings, migrateStoredBindings } from "../../shared/domain/homeAssistant/bindings";
import { Preferences, defaultPreferences } from "../../shared/domain/schemas/preferences";
import type { PreferencesValue } from "../../shared/domain/schemas/preferences";
import { compileValidator, toIssues } from "../../shared/domain/validation/ajv";
import { ApiError, validationError } from "../http/errors";
import { isRecord, parseJson } from "../lib/json";
import type { ServiceContext } from "./context";
import { preferencesLock } from "./context";

const validatePreferences = compileValidator(Preferences);

type Stored = Readonly<{ revision: number; preferences: PreferencesValue }>;

const section = (value: unknown, key: string): Record<string, unknown> => {
  if (!isRecord(value)) return {};
  const child = value[key];
  return isRecord(child) ? child : {};
};

/**
 * The panel width was one house-wide `panelColumns` until 2026-11-17; it is now per room (`areaColumns`, one column
 * by default). The old field is dropped on read; it cannot say which rooms it meant.
 */
const withoutLegacyPanelColumns = (dashboard: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(dashboard).filter(([key]) => key !== "panelColumns"));

/** Defaults merged with the stored document. A missing file is revision 0 with defaults. */
const readStored = async (context: ServiceContext): Promise<Stored> => {
  const text = await context.preferences.read();
  if (text === undefined) return { revision: 0, preferences: structuredClone(defaultPreferences) };
  const parsed = parseJson(text);
  if (!parsed.ok || !isRecord(parsed.value))
    throw new ApiError("invalidDocument", "application-preferences.json is corrupt.");
  const { schemaVersion, revision } = parsed.value;
  if (typeof schemaVersion === "number" && schemaVersion > 1) {
    throw new ApiError(
      "unsupportedVersion",
      "application-preferences.json is newer than this server supports.",
    );
  }
  if (schemaVersion !== 1 || typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
    throw new ApiError("invalidDocument", "application-preferences.json is corrupt.");
  }
  const stored = parsed.value.preferences;
  const merged: unknown = {
    appearance: { ...defaultPreferences.appearance, ...section(stored, "appearance") },
    editor: { ...defaultPreferences.editor, ...section(stored, "editor") },
    homeAssistant: {
      viewer: {
        ...defaultPreferences.homeAssistant.viewer,
        ...section(section(stored, "homeAssistant"), "viewer"),
      },
      // D25: bindings written before 8.0 have only `lights`; every house gets every kind (lights unchanged).
      bindings: migrateStoredBindings(section(section(stored, "homeAssistant"), "bindings")),
      dashboard: withoutLegacyPanelColumns({
        ...defaultPreferences.homeAssistant.dashboard,
        ...section(section(stored, "homeAssistant"), "dashboard"),
      }),
    },
  };
  if (!validatePreferences(merged)) {
    throw new ApiError(
      "invalidDocument",
      "application-preferences.json does not match the preferences schema.",
      { errors: toIssues(validatePreferences.errors) },
    );
  }
  return { revision, preferences: merged };
};

export const getPreferences = (context: ServiceContext): Promise<Stored> => readStored(context);

export const patchPreferences = (
  context: ServiceContext,
  expectedRevision: number,
  patch: PreferencesPatchValue,
): Promise<Stored> =>
  context.queue.run(preferencesLock, async () => {
    const current = await readStored(context);
    if (current.revision !== expectedRevision) {
      throw new ApiError("staleRevision", "The preferences were changed since they were loaded.", {
        currentRevision: current.revision,
      });
    }
    const preferences: PreferencesValue = {
      appearance: { ...current.preferences.appearance, ...patch.appearance },
      editor: { ...current.preferences.editor, ...patch.editor },
      homeAssistant: {
        viewer: { ...current.preferences.homeAssistant.viewer, ...patch.homeAssistant?.viewer },
        bindings: mergeBindings(current.preferences.homeAssistant.bindings, patch.homeAssistant?.bindings),
        dashboard: patch.homeAssistant?.dashboard ?? current.preferences.homeAssistant.dashboard,
      },
    };
    // The patch schema checks each field; the merged whole is checked again before anything is written.
    const merged: unknown = preferences;
    if (!validatePreferences(merged)) {
      throw validationError(
        toIssues(validatePreferences.errors).map((issue) => ({
          pointer: `/body/patch${issue.pointer}`,
          message: issue.message,
        })),
        "The merged preferences do not match the preferences schema.",
      );
    }
    const next: Stored = { revision: current.revision + 1, preferences: merged };
    await context.preferences.write({ schemaVersion: 1, revision: next.revision, preferences: merged });
    return next;
  });

/**
 * Purge (D14): a permanently deleted house leaves no Home Assistant bindings behind. Bumps the revision only when
 * the house had bindings. Trash keeps them so a restored house is unchanged.
 */
export const removeHouseBindings = (context: ServiceContext, houseId: string): Promise<void> =>
  context.queue.run(preferencesLock, async () => {
    const current = await readStored(context);
    const { bindings } = current.preferences.homeAssistant;
    if (!Object.hasOwn(bindings, houseId)) return;
    const preferences: PreferencesValue = {
      ...current.preferences,
      homeAssistant: {
        ...current.preferences.homeAssistant,
        bindings: Object.fromEntries(Object.entries(bindings).filter(([id]) => id !== houseId)),
      },
    };
    await context.preferences.write({ schemaVersion: 1, revision: current.revision + 1, preferences });
  });
