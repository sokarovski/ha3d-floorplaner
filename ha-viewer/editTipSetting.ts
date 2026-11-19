// The Edit mode tip ("Tap a light, object, room, or bubble …") can be hidden for good (owner 2026-11-16). A
// per-browser convenience, so it lives in this browser's storage, not in the preferences; storage may be
// unavailable (private mode, blocked site data): the tip then simply shows again.
const storageKey = "homeplan.haViewer.editTipHidden";

export const readEditTipHidden = (): boolean => {
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
};

export const writeEditTipHidden = (): void => {
  try {
    window.localStorage.setItem(storageKey, "1");
  } catch {
    // Not stored: the tip shows again next time.
  }
};
