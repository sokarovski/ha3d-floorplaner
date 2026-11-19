// The builder's ambient-effects play/pause (D24): starts paused (owner: no redraws without need) and remembers
// the last choice in this browser (owner, 2026-11-17). A viewer convenience, not house or installation data, so
// it stays out of the preferences schema. Storage may be unavailable (private mode, blocked site data): paused
// is used then.
const storageKey = "homeplan.builder.effectsOn";

export const readEffectsOn = (): boolean => {
  try {
    return window.localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
};

export const writeEffectsOn = (on: boolean): void => {
  try {
    window.localStorage.setItem(storageKey, on ? "true" : "false");
  } catch {
    // Not stored: the choice lasts until the page reloads.
  }
};
