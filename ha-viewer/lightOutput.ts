// A light's output as Home Assistant may re-adjust it (Phase 13.6, D25 Q1 amended 2026-11-18;
// spec/home-assistant/light-state.md#lumens-and-temperature-overrides): the house's own lumens and default colour
// temperature, and whether the bound entity is a colour light (then its live colour wins over a temperature
// override). Pure, so the Settings field and the 3D view agree.
import { lampTypeInfo } from "@shared/domain/lighting/lampTypes";
import { haLightKelvin, haLightLumens } from "@shared/domain/schemas/homeAssistant";
import type { LightValue } from "@shared/domain/schemas/light";
import { fixedWhiteKelvin } from "../src/renderer/lightColor";

/** The house's values of a light, the defaults its overrides replace. */
export type HouseLightOutput = Readonly<{
  lumens: number;
  /** The white it is drawn with: its colour temperature, else its lamp type's or the fixed white. */
  kelvin: number;
  /** The builder's colour mode: an RGB light has no temperature of its own. */
  mode: LightValue["defaults"]["color"]["mode"];
}>;

export const houseLightOutput = (light: LightValue): HouseLightOutput => {
  const color = light.defaults.color;
  const lamp = light.lampType === undefined ? undefined : lampTypeInfo[light.lampType];
  return {
    lumens: light.defaults.outputLumens,
    kelvin: color.mode === "colorTemperature" ? color.kelvin : (lamp?.kelvin ?? fixedWhiteKelvin),
    mode: color.mode,
  };
};

/** HA colour modes that carry a colour or a colour temperature of their own. */
const colourModes: ReadonlySet<string> = new Set(["color_temp", "hs", "rgb", "rgbw", "rgbww", "xy"]);

/**
 * The colour mode a light entity reports (`color_mode`), else one it supports (`supported_color_modes`, which HA
 * also reports while the light is off), when that mode has a colour; null for a white-only or on/off entity.
 */
export const entityColourMode = (
  attributes: Readonly<Record<string, unknown>> | undefined,
): string | null => {
  const mode = attributes?.color_mode;
  if (typeof mode === "string" && colourModes.has(mode)) return mode;
  const supported = attributes?.supported_color_modes;
  if (!Array.isArray(supported)) return null;
  const found = supported.find(
    (entry): entry is string => typeof entry === "string" && colourModes.has(entry),
  );
  return found ?? null;
};

/** A lumens value the override accepts (above 0, at most 200 000), else undefined. */
export const validLumens = (value: number | undefined): number | undefined =>
  value === undefined || !Number.isFinite(value) || value <= haLightLumens.exclusiveMinimum
    ? undefined
    : Math.min(value, haLightLumens.maximum);

/** A temperature the override accepts: rounded to 50 K and kept within 1500–9000 K; undefined when not a number. */
export const validKelvin = (value: number | undefined): number | undefined =>
  value === undefined || !Number.isFinite(value)
    ? undefined
    : Math.min(
        Math.max(Math.round(value / haLightKelvin.step) * haLightKelvin.step, haLightKelvin.minimum),
        haLightKelvin.maximum,
      );
