// Sky light indoors (Phase 15.5, owner decision 2026-11-18: "make sun patches real"; spec/builder/features/
// lighting.md#sky-light-through-windows-phase-155). Framework-free rules shared by the shader (skyShading.ts) and
// the check script (scripts/check-sky-light.ts), so both use one model.
//
// - Indoor fill: inside a room under its shadow-only ceiling the hemisphere sky fill (and the HA viewer's
//   image-based fill) falls by daylight to the bounce floor `indoorBounce` (0.6: shade about 0.7 stop darker
//   than before, still clearly daytime; owner 2026-11-18: a cut to 0.06 made the house look like night).
// - Light from outside is stronger indoors (owner 2026-11-18: contrast must come from adding light through the
//   windows, not from removing it): the direct sun on indoor surfaces × `indoorSunGain` (2 in full daylight) and
//   the sky portals × `portalGain` (6). A convention for the eye's indoor adaptation and the window light's
//   interreflection, which the preview does not simulate; it is not physical. At night (daylight 0) nothing
//   changes.
// - Sky portals: every exterior window or glazed door lights its room as a one-sided rectangle at its glass,
//   facing in, of radiance L = τ · b · a · f(s) · E_v / π: E_v the vertical irradiance the day sky fill gives the
//   outside of that wall (the hemisphere light's horizontal-normal value, so the window passes in what the
//   facade receives), τ the glass transmission, b the blind factor, a the glass share of the rectangle, and
//   f(s) brighter toward the sun's side of the sky (s = horizontal outward normal · unit direction toward the
//   sun, which includes the sun's elevation cosine). The colour runs from a cool sky (away from the sun: a north
//   window at 42° N) to a warm one toward the sun. The direct sun is not part of it: it already enters through
//   clear glass with its shadow map (shadowCasting.ts).
import { Color } from "three";
import type { TemplateParameterValue } from "@shared/domain/templates/metadata";
import { dayAmbient, skyFillColors } from "./lighting";

/**
 * Indoor bounce floor: the share of the daylight sky fill left inside a room. 0.6 keeps a room in shade clearly
 * daytime, about 0.7 stop under the unblocked fill (owner 2026-11-18: at most about a stop darker; 0.06 read as
 * night). Contrast comes from `indoorSunGain` and `portalGain` (scripts/check-sky-light.ts).
 */
export const indoorBounce = 0.6;

/** The direct sun on indoor surfaces in full daylight is multiplied by this (1 at night, linear in daylight). */
export const indoorSunGainMax = 2;
export const indoorSunGain = (daylight: number): number =>
  1 + (indoorSunGainMax - 1) * Math.min(1, Math.max(0, daylight));

/**
 * Sky portals are this much brighter than the window's physical sky light (the indoor adaptation that lifts the
 * bounce floor to 0.6, plus the window light's interreflection): a surface 1 m in front of a bare north window
 * is then brighter than the unblocked fill was there (scripts/check-sky-light.ts).
 */
export const portalGain = 6;

/** The sky-fill multiplier inside a room for daylight d (0 at night .. 1). */
export const indoorFill = (daylight: number): number =>
  1 - (1 - indoorBounce) * Math.min(1, Math.max(0, daylight));

/** Blind factors on sky light (owner brief 2026-11-18; the windows:sun ray check: open slats pass about 0.4). */
export const openSlatsFactor = 0.4;
export const closedSlatsFactor = 0.02;
/** A lowered fabric or bamboo shade passes this share of the sky light where it covers the glass. */
export const shadeTransmission = 0.15;

const flag = (value: TemplateParameterValue | undefined): boolean => value === true;

/**
 * The blind factor of one parameter set (template defaults merged in): venetian blinds (`blind`/`blinds`,
 * closed by `blindsClosed`), a roller shade (`shade`, lowered by `shadeLoweredPct`), else 1.
 */
export const blindFactor = (parameters: Readonly<Record<string, TemplateParameterValue>>): number => {
  if (flag(parameters.blind) || flag(parameters.blinds))
    return flag(parameters.blindsClosed) ? closedSlatsFactor : openSlatsFactor;
  if (flag(parameters.shade)) {
    const lowered = parameters.shadeLoweredPct;
    const share = typeof lowered === "number" ? Math.min(1, Math.max(0, lowered / 100)) : 1;
    return 1 - share * (1 - shadeTransmission);
  }
  return 1;
};

/** A pose blend's factor (HA state animations blend parameter sets): the weighted mean. */
export const blendedBlindFactor = (
  sets: readonly Readonly<{ parameters: Readonly<Record<string, TemplateParameterValue>>; weight: number }>[],
): number => {
  let total = 0;
  let sum = 0;
  for (const set of sets) {
    total += set.weight;
    sum += set.weight * blindFactor(set.parameters);
  }
  return total > 0 ? sum / total : 1;
};

/** f(s): up to 1.8 facing the sun's side of the sky, down to 0.8 facing away (clear-sky brightening). */
export const skyDirectionFactor = (s: number): number =>
  1 + 0.8 * Math.max(0, Math.min(1, s)) - 0.2 * Math.max(0, Math.min(1, -s));

/** Linear-RGB tints of luminance 1: the cool sky away from the sun and the warm sky toward it. */
const luminance = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const normalized = (r: number, g: number, b: number): readonly [number, number, number] => {
  const y = luminance(r, g, b);
  return [r / y, g / y, b / y];
};
const coolSky = normalized(0.86, 0.96, 1.18);
const warmSky = normalized(1.08, 1.0, 0.88);

/** The day sky fill's irradiance on a vertical surface outdoors (luminance, before daylight and gain). */
export const verticalSkyIrradiance = ((): number => {
  const sky = new Color(skyFillColors.sky);
  const ground = new Color(skyFillColors.ground);
  return (dayAmbient * (luminance(sky.r, sky.g, sky.b) + luminance(ground.r, ground.g, ground.b))) / 2;
})();

/** The day sky fill's irradiance on an upward surface outdoors (luminance, before daylight and gain). */
export const horizontalSkyIrradiance = ((): number => {
  const sky = new Color(skyFillColors.sky);
  return dayAmbient * luminance(sky.r, sky.g, sky.b);
})();

export type PortalInput = Readonly<{
  /** s: horizontal outward unit normal of the opening · unit direction toward the sun. */
  sunSide: number;
  /** Daylight d (lighting.ts) and the exposure gain g (1 / exposure). */
  daylight: number;
  gain: number;
  transmission: number;
  blind: number;
  /** The glass share of the portal rectangle (frames and mullions excluded). */
  glassShare: number;
}>;

/** The portal's linear-RGB radiance in scene units (as the hemisphere and sun intensities, gain included). */
export const portalRadiance = (input: PortalInput): readonly [number, number, number] => {
  const d = Math.min(1, Math.max(0, input.daylight));
  const scale =
    (input.transmission *
      input.blind *
      Math.min(1, Math.max(0, input.glassShare)) *
      skyDirectionFactor(input.sunSide) *
      verticalSkyIrradiance *
      portalGain *
      d *
      input.gain) /
    Math.PI;
  const t = Math.max(0, Math.min(1, input.sunSide));
  const tint = (cool: number, warm: number): number => scale * (cool + (warm - cool) * t);
  return [tint(coolSky[0], warmSky[0]), tint(coolSky[1], warmSky[1]), tint(coolSky[2], warmSky[2])];
};
