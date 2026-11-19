import { useStore } from "zustand";
import type { PreferencesValue } from "@shared/domain/schemas/preferences";
import { useAppServices } from "../../../app/appServicesContext";

/** Narrow selector over the global preferences. */
export const usePreferences = <T>(select: (preferences: PreferencesValue) => T): T => {
  const { preferences } = useAppServices();
  return useStore(preferences.store, (state) => select(state.preferences));
};
