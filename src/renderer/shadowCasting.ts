// Which template parts cast a sun shadow (Phase 15.5, owner 2026-11-18: windows blocked all sunlight). Shared
// by the instance layer and the sun-through-openings check (scripts/check-window-sun.ts), so both use one rule.
import type { Material } from "three";

/** A clear, see-through material (glTF alpha blend below 0.6 opacity, or physical transmission): no sun shadow. */
export const seeThrough = (material: Material | null): boolean => {
  if (material === null) return false;
  if (material.transparent && material.opacity < 0.6) return true;
  return (
    "transmission" in material && typeof material.transmission === "number" && material.transmission > 0.5
  );
};

/**
 * The share of light a see-through material passes (Phase 15.5 sky portals): its physical transmission, else
 * 1 − opacity for blended glass (the built-in clear glass, alpha 0.2: 0.8); 0 for anything not see-through.
 */
export const glassTransmission = (material: Material | null): number => {
  if (material === null || !seeThrough(material)) return 0;
  if ("transmission" in material && typeof material.transmission === "number" && material.transmission > 0.5)
    return Math.min(1, material.transmission);
  return Math.min(1, Math.max(0, 1 - material.opacity));
};
