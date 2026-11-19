// Global preferences routes (spec/architecture/api.md#preferences, spec/architecture/application-preferences.md).
import Type from "typebox";
import type { Static } from "typebox";
import { HaBindingsPatch } from "../domain/schemas/homeAssistant";
import { Preferences } from "../domain/schemas/preferences";
import { RevisionNumber } from "./common";

/** GET /api/preferences and the PATCH response: defaults merged with the stored document. */
export const PreferencesResponse = Type.Object(
  { revision: RevisionNumber, preferences: Preferences },
  { additionalProperties: false },
);
export type PreferencesResponseValue = Static<typeof PreferencesResponse>;

const appearance = Preferences.properties.appearance.properties;
const editor = Preferences.properties.editor.properties;

/** Only the allowlisted fields; any other key is rejected with 400 validation. */
export const PreferencesPatch = Type.Object(
  {
    appearance: Type.Optional(
      Type.Object(
        {
          theme: Type.Optional(appearance.theme),
          colorScheme: Type.Optional(appearance.colorScheme),
          customColors: Type.Optional(appearance.customColors),
        },
        { additionalProperties: false },
      ),
    ),
    editor: Type.Optional(
      Type.Object(
        {
          showGroundGrid: Type.Optional(editor.showGroundGrid),
          navigation: Type.Optional(editor.navigation),
          treeShare: Type.Optional(editor.treeShare),
        },
        { additionalProperties: false },
      ),
    ),
    homeAssistant: Type.Optional(
      Type.Object(
        {
          viewer: Type.Optional(Preferences.properties.homeAssistant.properties.viewer),
          /**
           * Houses listed here are merged by kind (D25): each kind given (`lights`, `objects`, `effects`, `areas`)
           * replaces that kind of the house whole; kinds and houses not listed are kept.
           */
          bindings: Type.Optional(HaBindingsPatch),
          /** Replaces the stored dashboard setting whole. */
          dashboard: Type.Optional(Preferences.properties.homeAssistant.properties.dashboard),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type PreferencesPatchValue = Static<typeof PreferencesPatch>;

/** PATCH /api/preferences */
export const PatchPreferencesBody = Type.Object(
  { expectedRevision: RevisionNumber, patch: PreferencesPatch },
  { additionalProperties: false },
);
export type PatchPreferencesBodyValue = Static<typeof PatchPreferencesBody>;
