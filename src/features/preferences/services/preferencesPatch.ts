// Pure helpers for preference patches: merge, and the allowlisted cache shape.
import type { PreferencesPatchValue } from "@shared/contracts/preferences";
import { mergeBindings } from "@shared/domain/homeAssistant/bindings";
import { Preferences } from "@shared/domain/schemas/preferences";
import type { PreferencesValue } from "@shared/domain/schemas/preferences";
import { compileValidator } from "@shared/domain/validation/ajv";

export const applyPreferencesPatch = (
  base: PreferencesValue,
  patch: PreferencesPatchValue,
): PreferencesValue => ({
  appearance: { ...base.appearance, ...patch.appearance },
  editor: { ...base.editor, ...patch.editor },
  homeAssistant: {
    viewer: { ...base.homeAssistant.viewer, ...patch.homeAssistant?.viewer },
    bindings: mergeBindings(base.homeAssistant.bindings, patch.homeAssistant?.bindings),
    dashboard: patch.homeAssistant?.dashboard ?? base.homeAssistant.dashboard,
  },
});

export const mergePatches = (a: PreferencesPatchValue, b: PreferencesPatchValue): PreferencesPatchValue => ({
  ...(a.appearance === undefined && b.appearance === undefined
    ? {}
    : { appearance: { ...a.appearance, ...b.appearance } }),
  ...(a.editor === undefined && b.editor === undefined ? {} : { editor: { ...a.editor, ...b.editor } }),
});

export const isEmptyPatch = (patch: PreferencesPatchValue): boolean =>
  patch.appearance === undefined && patch.editor === undefined;

/** Reads the browser startup cache (allowlisted fields only); invalid caches are ignored. */
export const readCachedPreferences = (raw: string | null): PreferencesValue | undefined => {
  if (raw === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    const validate = compileValidator(Preferences);
    return validate(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The patch for a whole edited preferences value (the live Settings form, Phase 5.9): every allowlisted field,
 * or undefined when the value is not valid preferences.
 */
export const readPreferencesPatch = (value: unknown): PreferencesPatchValue | undefined => {
  const validate = compileValidator(Preferences);
  if (!validate(value)) return undefined;
  return {
    appearance: {
      theme: value.appearance.theme,
      colorScheme: value.appearance.colorScheme,
      ...(value.appearance.customColors === undefined ? {} : { customColors: value.appearance.customColors }),
    },
    editor: { showGroundGrid: value.editor.showGroundGrid, navigation: value.editor.navigation },
  };
};
