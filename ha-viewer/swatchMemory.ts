// Remembered average colours of house images (Phase 15.1): until an image's texture is ready, objects and floors draw
// their base colour tinted by the image's average colour from an earlier visit, so they are never black and change
// little when the texture arrives. A per-device convenience in localStorage; a private window or blocked storage just
// means no tint the first time. Framework-free.
import type { Swatch, SwatchMemory } from "../src/renderer/textureCache";

const storageKey = "homeplan.swatches";
/** At most this many images are remembered (the oldest are dropped). */
const maxEntries = 400;

const isSwatch = (value: unknown): value is Swatch =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((channel) => typeof channel === "number" && channel >= 0 && channel <= 1);

const read = (): Map<string, Swatch> => {
  const map = new Map<string, Swatch>();
  try {
    const text = window.localStorage.getItem(storageKey);
    if (text === null) return map;
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object") return map;
    for (const [id, value] of Object.entries(parsed)) if (isSwatch(value)) map.set(id, value);
  } catch {
    // Unreadable storage: nothing remembered.
  }
  return map;
};

export const createSwatchMemory = (): SwatchMemory => {
  let cached: Map<string, Swatch> | null = null;
  const all = (): Map<string, Swatch> => {
    cached ??= read();
    return cached;
  };
  return {
    get: (imageId) => all().get(imageId) ?? null,
    set: (imageId, swatch) => {
      const map = all();
      map.delete(imageId);
      map.set(imageId, [
        Math.round(swatch[0] * 1000) / 1000,
        Math.round(swatch[1] * 1000) / 1000,
        Math.round(swatch[2] * 1000) / 1000,
      ]);
      while (map.size > maxEntries) {
        const oldest = map.keys().next();
        if (oldest.done === true) break;
        map.delete(oldest.value);
      }
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(map)));
      } catch {
        // Full or blocked storage: the colour is remembered for this visit only.
      }
    },
  };
};
