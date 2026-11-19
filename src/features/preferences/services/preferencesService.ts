// Preference service: applies changes immediately, caches them for startup, and batches patches to the API.
// Acknowledgments clear only the submitted fields; failures keep the pending patch and retry with backoff.
import type { PreferencesPatchValue } from "@shared/contracts/preferences";
import type { PreferencesValue } from "@shared/domain/schemas/preferences";
import { ApiClientError } from "../../../api/apiError";
import type { PreferencesClient } from "../../../api/preferencesClient";
import type { ThemeController } from "../../../app/theme/themeController";
import { schemeFromPreference } from "../../../design-system/tokens/colorScheme";
import { createPreferencesStore } from "../stores/preferencesStore";
import type { PreferencesStore } from "../stores/preferencesStore";
import { applyPreferencesPatch, isEmptyPatch, mergePatches, readCachedPreferences } from "./preferencesPatch";

const cacheKey = "homeplan:preferences";
const syncDelayMs = 600;

export type PreferencesService = Readonly<{
  store: PreferencesStore;
  start: () => void;
  update: (patch: PreferencesPatchValue) => void;
}>;

export const createPreferencesService = (
  client: PreferencesClient,
  theme: ThemeController,
  storage: Storage,
): PreferencesService => {
  const cached = readCachedPreferences(storage.getItem(cacheKey));
  const store = createPreferencesStore(cached);
  let pending: PreferencesPatchValue = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let retryDelay = 1000;
  let loading = false;
  let loadDelay = 1000;

  const apply = (preferences: PreferencesValue): void => {
    theme.apply(
      preferences.appearance.theme,
      schemeFromPreference(preferences.appearance.colorScheme, preferences.appearance.customColors),
    );
    try {
      storage.setItem(cacheKey, JSON.stringify(preferences));
    } catch {
      // Browser storage is a best-effort startup cache.
    }
  };

  const schedule = (delay: number): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, delay);
  };

  // The server revision comes from the first successful read; until then a failed read is retried with
  // backoff, and pending patches wait for it (a patch is never sent without a revision).
  const load = (): void => {
    if (loading) return;
    loading = true;
    void client.get().then(
      (response) => {
        loading = false;
        loadDelay = 1000;
        const local = applyPreferencesPatch(response.preferences, pending);
        store.setState({ preferences: local, revision: response.revision, status: "idle" });
        apply(local);
        if (!isEmptyPatch(pending)) schedule(syncDelayMs);
      },
      () => {
        loading = false;
        store.setState({ status: "failed" });
        const delay = loadDelay;
        loadDelay = Math.min(loadDelay * 2, 30000);
        setTimeout(load, delay);
      },
    );
  };

  const flush = async (): Promise<void> => {
    const revision = store.getState().revision;
    if (revision === undefined) {
      load();
      return;
    }
    if (inFlight || isEmptyPatch(pending)) return;
    const submitted = pending;
    pending = {};
    inFlight = true;
    store.setState({ status: "syncing" });
    try {
      const response = await client.patch(submitted, revision);
      retryDelay = 1000;
      const local = applyPreferencesPatch(response.preferences, pending);
      store.setState({ preferences: local, revision: response.revision, status: "idle" });
      apply(local);
    } catch (error: unknown) {
      pending = mergePatches(submitted, pending);
      if (error instanceof ApiClientError && error.category === "conflict") {
        const fresh = await client.get().catch(() => undefined);
        if (fresh !== undefined) store.setState({ revision: fresh.revision });
      }
      store.setState({ status: "failed" });
      retryDelay = Math.min(retryDelay * 2, 30000);
      schedule(retryDelay);
    } finally {
      inFlight = false;
      if (!isEmptyPatch(pending) && timer === undefined) schedule(syncDelayMs);
    }
  };

  return {
    store,
    start: () => {
      apply(store.getState().preferences);
      load();
    },
    update: (patch) => {
      pending = mergePatches(pending, patch);
      const next = applyPreferencesPatch(store.getState().preferences, patch);
      store.setState({ preferences: next });
      apply(next);
      schedule(syncDelayMs);
    },
  };
};
