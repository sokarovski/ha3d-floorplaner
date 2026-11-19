// Light color and photometric conversions for the browser preview (D08 implementation conventions;
// documented in spec/builder/features/lighting.md#preview-renderer-conventions).
import { Color, SRGBColorSpace } from "three";
import { lampTypeInfo } from "@shared/domain/lighting/lampTypes";
import type { LightValue } from "@shared/domain/schemas/light";

/** The white of untyped `fixedWhite` lights; a typed light's fixed white is its lamp type's (lampTypes.ts). */
export const fixedWhiteKelvin = 3000;

type Rgb = Readonly<{ r: number; g: number; b: number }>;

const clampByte = (value: number): number => Math.min(255, Math.max(0, value));

/**
 * Kelvin → sRGB (0–255) after Tanner Helland's curve fit of the CIE 1964 10° blackbody colors,
 * valid from 1000 K to 40000 K.
 */
export const kelvinToSrgb = (kelvin: number): Rgb => {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  const r = t <= 66 ? 255 : clampByte(329.698727446 * Math.pow(t - 60, -0.1332047592));
  const g =
    t <= 66
      ? clampByte(99.4708025861 * Math.log(t) - 161.1195681661)
      : clampByte(288.1221695283 * Math.pow(t - 60, -0.0755148492));
  const b = t >= 66 ? 255 : t <= 19 ? 0 : clampByte(138.5177312231 * Math.log(t - 10) - 305.0447927307);
  return { r, g, b };
};

const linearFromSrgbBytes = (rgb: Rgb): Color =>
  new Color().setRGB(rgb.r / 255, rgb.g / 255, rgb.b / 255, SRGBColorSpace);

const luminance = (color: Color): number => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;

/**
 * The emitter color in linear working space. White modes (fixedWhite, colorTemperature) are normalized to
 * relative luminance 1, so lumens keep their meaning when the temperature changes. RGB colors are
 * normalized to a maximum channel of 1: the lumen value is the white-equivalent output, tinted. A typed lamp's
 * white gets its colour-rendering tint (fluorescent's slight green) before the normalization (Phase 8.9).
 */
export const lightEmitterColor = (light: LightValue): Color => {
  const color = light.defaults.color;
  if (color.mode === "rgb") {
    const [r = 255, g = 255, b = 255] = color.rgb;
    const linear = linearFromSrgbBytes({ r, g, b });
    const max = Math.max(linear.r, linear.g, linear.b);
    return max > 0 ? linear.multiplyScalar(1 / max) : new Color(1, 1, 1);
  }
  const lamp = light.lampType === undefined ? undefined : lampTypeInfo[light.lampType];
  const kelvin = color.mode === "colorTemperature" ? color.kelvin : (lamp?.kelvin ?? fixedWhiteKelvin);
  const linear = linearFromSrgbBytes(kelvinToSrgb(kelvin));
  if (lamp !== undefined) linear.multiply(new Color(lamp.tint[0], lamp.tint[1], lamp.tint[2]));
  const y = luminance(linear);
  return y > 0 ? linear.multiplyScalar(1 / y) : new Color(1, 1, 1);
};

/**
 * Preview calibration applied to every artificial emitter after the photometric conversion: Three.js
 * intensity = candela (or nits) × this factor. The baseline sun/sky are not in physical lux, so this fixes
 * the ratio between lamps and the night ambient; see lighting.ts for the day/night exposure policy.
 * Phase 8.9: 0.2 → 0.1. At 0.2 the night "camera" put middle grey at about 4 lx on a 0.7 floor, two stops
 * brighter than a phone exposing a lamp-lit room (about 18 lx), so every surface near a lamp clipped to white;
 * at 0.1 middle grey sits at about 8 lx and AgX keeps the lamp pools graded.
 */
export const previewPhotometricScale = 0.1;

/** Effective luminous flux: outputLumens × brightness, 0 when disabled. */
export const effectiveLumens = (light: LightValue): number =>
  light.defaults.enabled
    ? light.defaults.outputLumens * Math.min(1, Math.max(0, light.defaults.brightness))
    : 0;

/**
 * Point lights and untyped spot lights: candela = lm / 4π (isotropic; a spot cone masks it, as in
 * glTF/Blender exports).
 */
export const lumensToCandela = (lumens: number): number => lumens / (4 * Math.PI);

/**
 * Peak candela of a Three.js `SpotLight` that emits exactly `lumens` into its cone. Its falloff is
 * smoothstep(cos a, cos(a·(1 − penumbra)), cos θ); integrated over the sphere that is the solid angle
 * Ω = 2π · (1 − (cos a + cos(a·(1 − penumbra))) / 2), so candela = lm / Ω. Used by linear-light samples
 * (penumbra 1: Ω = π · (1 − cos a)) and by typed spot lights, whose lumens are the real lamp's (Phase 8.9).
 */
export const lumensToConeCandela = (lumens: number, halfAngle: number, penumbra: number): number => {
  const inner = halfAngle * (1 - Math.min(1, Math.max(0, penumbra)));
  const solidAngle = 2 * Math.PI * (1 - (Math.cos(halfAngle) + Math.cos(inner)) / 2);
  return lumens / Math.max(solidAngle, 1e-4);
};

/**
 * A fixture's glow (emissive lens, diffuser, bulb, shade) follows its light (Phase 8.9, K15): the light's
 * colour (maximum channel 1) and `level` 0–1, the brightness, 0 when the light gives no light.
 */
export type FixtureGlow = Readonly<{ color: Color; level: number }>;

export const fixtureGlowOf = (light: LightValue): FixtureGlow => {
  const color = lightEmitterColor(light);
  const max = Math.max(color.r, color.g, color.b);
  return {
    color: max > 0 ? color.multiplyScalar(1 / max) : new Color(1, 1, 1),
    level: effectiveLumens(light) > 0 ? Math.min(1, Math.max(0, light.defaults.brightness)) : 0,
  };
};
