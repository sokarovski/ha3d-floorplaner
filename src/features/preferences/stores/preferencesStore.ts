// The installation-global preference store (one per app; no users/profiles, D12).
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import { defaultPreferences } from "@shared/domain/schemas/preferences";
import type { PreferencesValue } from "@shared/domain/schemas/preferences";

export type PreferencesSyncStatus = "idle" | "syncing" | "failed";

export type PreferencesState = Readonly<{
  preferences: PreferencesValue;
  revision: number | undefined;
  status: PreferencesSyncStatus;
}>;

export type PreferencesStore = StoreApi<PreferencesState>;

export const createPreferencesStore = (initial: PreferencesValue = defaultPreferences): PreferencesStore =>
  createStore<PreferencesState>(() => ({ preferences: initial, revision: undefined, status: "idle" }));
