// Lamp types (Phase 8.9, owner decision Q1: the builder owns what the lamp is). A light may name the kind of
// lamp it holds; the type gives its white, a colour-rendering tint for the preview, and real output presets
// (watts → lumens), so "lower the wattage" becomes "choose the real lamp". Absent = an untyped light, drawn
// exactly as before 8.9. Spec: spec/builder/features/lighting.md#lamp-types.
import { readAtPropertyPath, setAtPropertyPath } from "../commands/draftPath";

export const lampTypes = [
  "tungsten",
  "halogen",
  "ledWarm",
  "ledNeutral",
  "ledCool",
  "fluorescent",
  "neon",
] as const;
export type LampType = (typeof lampTypes)[number];

/** One output preset of a lamp type: electrical power and the lamp's rated luminous flux. */
export type LampPreset = Readonly<{ watts: number; lumens: number }>;

export type LampTypeInfo = Readonly<{
  title: string;
  /** Default white (also the white of a fixed-white light of this type). */
  kelvin: number;
  /** Linear-RGB multiplier on the white (colour rendering), luminance-normalized by the renderer; 1 = none. */
  tint: readonly [number, number, number];
  /** sRGB colour chosen with the type when the light can show RGB (neon), else undefined. */
  rgb?: readonly [number, number, number];
  /** Rated presets, ascending; output between presets is interpolated, beyond them extrapolated. */
  presets: readonly LampPreset[];
}>;

const ledPresets: readonly LampPreset[] = [
  { watts: 2.5, lumens: 250 },
  { watts: 4.9, lumens: 470 },
  { watts: 8.5, lumens: 806 },
  { watts: 11, lumens: 1055 },
  { watts: 14, lumens: 1521 },
  { watts: 18, lumens: 2000 },
  { watts: 24, lumens: 2600 },
];

/**
 * Typical rated values (EU energy-label classes of common household lamps): tungsten A60 bulbs, eco halogen
 * A-shape bulbs, LED replacements and strips, CFL/T8 fluorescent, LED neon flex (about 40 lm/W).
 */
export const lampTypeInfo: Readonly<Record<LampType, LampTypeInfo>> = {
  tungsten: {
    title: "Tungsten",
    kelvin: 2700,
    tint: [1, 1, 1],
    presets: [
      { watts: 25, lumens: 220 },
      { watts: 40, lumens: 470 },
      { watts: 60, lumens: 800 },
      { watts: 75, lumens: 1055 },
      { watts: 100, lumens: 1521 },
    ],
  },
  halogen: {
    title: "Halogen",
    kelvin: 2900,
    tint: [1, 1, 1],
    presets: [
      { watts: 18, lumens: 235 },
      { watts: 28, lumens: 370 },
      { watts: 42, lumens: 630 },
      { watts: 53, lumens: 840 },
      { watts: 70, lumens: 1180 },
    ],
  },
  ledWarm: { title: "LED warm white", kelvin: 2700, tint: [1, 1, 1], presets: ledPresets },
  ledNeutral: { title: "LED neutral white", kelvin: 4000, tint: [1, 1, 1], presets: ledPresets },
  ledCool: { title: "LED cool daylight", kelvin: 6500, tint: [1, 1, 1], presets: ledPresets },
  fluorescent: {
    title: "Fluorescent",
    kelvin: 4000,
    // Tri-phosphor tubes sit slightly on the green side of the blackbody line.
    tint: [0.96, 1.03, 0.97],
    presets: [
      { watts: 8, lumens: 400 },
      { watts: 11, lumens: 600 },
      { watts: 15, lumens: 900 },
      { watts: 18, lumens: 1350 },
      { watts: 36, lumens: 3350 },
      { watts: 58, lumens: 5200 },
    ],
  },
  neon: {
    title: "Neon (LED flex)",
    kelvin: 2200,
    tint: [1, 1, 1],
    rgb: [255, 90, 40],
    presets: [
      { watts: 5, lumens: 200 },
      { watts: 10, lumens: 400 },
      { watts: 15, lumens: 600 },
      { watts: 20, lumens: 800 },
      { watts: 30, lumens: 1200 },
    ],
  },
};

export const lampTypeChoices: readonly (readonly [LampType, string])[] = lampTypes.map(
  (type) => [type, lampTypeInfo[type].title] as const,
);

export const isLampType = (value: unknown): value is LampType =>
  typeof value === "string" && lampTypes.some((type) => type === value);

/** Piecewise-linear lookup through (x, y) pairs sorted by x; extrapolates with the end segment's ratio. */
const through = (pairs: readonly (readonly [number, number])[], x: number): number => {
  const first = pairs[0];
  if (first === undefined) return x;
  if (x <= first[0]) return (x * first[1]) / first[0];
  for (let index = 1; index < pairs.length; index += 1) {
    const a = pairs[index - 1];
    const b = pairs[index];
    if (a === undefined || b === undefined) break;
    if (x <= b[0]) return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  const last = pairs[pairs.length - 1] ?? first;
  return (x * last[1]) / last[0];
};

/** Rated output of a lamp of this type at `watts`. */
export const lumensForWatts = (type: LampType, watts: number): number =>
  Math.round(
    through(
      lampTypeInfo[type].presets.map((preset) => [preset.watts, preset.lumens] as const),
      watts,
    ),
  );

/** Power of a lamp of this type that gives `lumens`, to 0.1 W. */
export const wattsForLumens = (type: LampType, lumens: number): number =>
  Math.max(
    0.1,
    Math.round(
      through(
        lampTypeInfo[type].presets.map((preset) => [preset.lumens, preset.watts] as const),
        lumens,
      ) * 10,
    ) / 10,
  );

/** The preset closest to `lumens`, compared as ratios (log scale), so the light keeps about its brightness. */
export const nearestPreset = (type: LampType, lumens: number): LampPreset => {
  const presets = lampTypeInfo[type].presets;
  let best = presets[0] ?? { watts: 1, lumens: 100 };
  for (const preset of presets)
    if (Math.abs(Math.log(preset.lumens / lumens)) < Math.abs(Math.log(best.lumens / lumens))) best = preset;
  return best;
};

/** Short owner-facing label of a preset, e.g. "8.5 W · 806 lm". */
export const presetLabel = (preset: LampPreset): string =>
  `${String(preset.watts)} W · ${String(preset.lumens)} lm`;

const colorModesOf = (light: unknown): readonly string[] => {
  const modes = readAtPropertyPath(light, ["renderCapabilities", "colorModes"]);
  return Array.isArray(modes) ? modes.filter((mode) => typeof mode === "string") : [];
};

/**
 * Follow-up edits of the property command on a light (D18 stays one command): choosing a lamp type sets its
 * white (or neon's colour) within the light's colour modes and snaps the output to the nearest preset;
 * choosing a lamp power sets the output; editing the output keeps the lamp power in step.
 */
export const applyLightPropertyRules = (light: unknown, path: readonly string[]): void => {
  const type = readAtPropertyPath(light, ["lampType"]);
  if (!isLampType(type)) return;
  const key = path.join(".");
  const info = lampTypeInfo[type];
  if (key === "lampType") {
    const modes = colorModesOf(light);
    if (info.rgb !== undefined && modes.includes("rgb")) {
      setAtPropertyPath(light, ["defaults", "color", "mode"], "rgb");
      setAtPropertyPath(light, ["defaults", "color", "rgb"], [...info.rgb]);
    } else if (modes.includes("colorTemperature")) {
      setAtPropertyPath(light, ["defaults", "color", "mode"], "colorTemperature");
      setAtPropertyPath(light, ["defaults", "color", "kelvin"], info.kelvin);
    } else if (modes.includes("fixedWhite")) {
      setAtPropertyPath(light, ["defaults", "color", "mode"], "fixedWhite");
    }
    const lumens = readAtPropertyPath(light, ["defaults", "outputLumens"]);
    const preset = nearestPreset(type, typeof lumens === "number" && lumens > 0 ? lumens : 800);
    setAtPropertyPath(light, ["lampWatts"], preset.watts);
    setAtPropertyPath(light, ["defaults", "outputLumens"], preset.lumens);
  } else if (key === "lampWatts") {
    const watts = readAtPropertyPath(light, ["lampWatts"]);
    if (typeof watts === "number" && watts > 0)
      setAtPropertyPath(light, ["defaults", "outputLumens"], lumensForWatts(type, watts));
  } else if (key === "defaults.outputLumens") {
    const lumens = readAtPropertyPath(light, ["defaults", "outputLumens"]);
    if (typeof lumens === "number" && lumens > 0)
      setAtPropertyPath(light, ["lampWatts"], wattsForLumens(type, lumens));
  }
};
