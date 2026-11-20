// Phase 21 prototype switch, for comparing in the fake viewer (the dev harness's button sets it and reloads). Read
// once when a viewer is created, from localStorage; absent, unreadable, or unknown values keep the shipped limits.
// Owner (2026-11-20): keep the normal limits; per-device limits become configurable later, then this goes.
//
// - `homeplan.proto.limits`: "low" caps the pixel ratio at 1.5, the floor's shadow lamps at 4, and their shadow maps
//   at 256 px (21.6); else the shipped limits (2, the GPU's budget, 512 px).

export type LimitsProfile = "standard" | "low";

export type ViewerLimits = Readonly<{
  pixelRatioCap: number;
  /** null: the GPU's budget (`shadowBudget`). */
  floorShadowLamps: number | null;
  pointShadowSize: number;
}>;

const limitsByProfile: Readonly<Record<LimitsProfile, ViewerLimits>> = {
  standard: { pixelRatioCap: 2, floorShadowLamps: null, pointShadowSize: 512 },
  low: { pixelRatioCap: 1.5, floorShadowLamps: 4, pointShadowSize: 256 },
};

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const limitsProfile = (): LimitsProfile =>
  read("homeplan.proto.limits") === "low" ? "low" : "standard";

export const viewerLimits = (): ViewerLimits => limitsByProfile[limitsProfile()];
