// Global preferences (spec/architecture/application-preferences.md).
import { PreferencesResponse } from "@shared/contracts/preferences";
import type { PreferencesPatchValue, PreferencesResponseValue } from "@shared/contracts/preferences";
import type { HttpClient } from "./httpClient";

export type PreferencesClient = ReturnType<typeof createPreferencesClient>;

export const createPreferencesClient = (http: HttpClient) => ({
  get: async (signal?: AbortSignal): Promise<PreferencesResponseValue> =>
    http.request({ method: "GET", path: ["preferences"], signal }, PreferencesResponse),
  patch: async (patch: PreferencesPatchValue, expectedRevision: number): Promise<PreferencesResponseValue> =>
    http.request(
      { method: "PATCH", path: ["preferences"], body: { expectedRevision, patch } },
      PreferencesResponse,
    ),
});
