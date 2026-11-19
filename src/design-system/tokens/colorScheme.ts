// Two-level colours (Phase 5.5, owner H8): a colour scheme is five base colours; every semantic role token
// is derived from them for light and dark. Each base becomes a 12-step OKLCH ramp (even perceived lightness,
// after Radix Colors), roles map to ramp steps, hover/pressed are state layers over any surface, and text
// roles are nudged until they reach WCAG AA against their background. One source for tokens.tw.css (the
// first-paint fallback written by `npm run styles:sync`), the theme controller (instant scheme changes),
// the /ds Colors and Themes pages, and the renderer's selection colours.

export type BaseColors = Readonly<{
  neutral: string;
  accent: string;
  danger: string;
  warning: string;
  success: string;
}>;
export type SchemePreset = "blue" | "graphite" | "green";
export type Theme = "light" | "dark";

export const schemePresets: Readonly<Record<SchemePreset, BaseColors>> = {
  blue: { neutral: "#64748B", accent: "#1D4ED8", danger: "#DC2626", warning: "#D97706", success: "#16A34A" },
  graphite: {
    neutral: "#71717A",
    accent: "#3F3F46",
    danger: "#DC2626",
    warning: "#D97706",
    success: "#16A34A",
  },
  green: { neutral: "#78716C", accent: "#15803D", danger: "#DC2626", warning: "#D97706", success: "#15803D" },
};

export const defaultScheme: BaseColors = schemePresets.blue;

/** Editor colours whose meaning must not change with a scheme (axes, guides). */
const fixedRoles: Readonly<Record<Theme, Readonly<Record<string, string>>>> = {
  light: { guide: "#7C3AED", "axis-x": "#DC2626", "axis-y": "#16A34A", "axis-z": "#2563EB" },
  dark: { guide: "#C4B5FD", "axis-x": "#F87171", "axis-y": "#4ADE80", "axis-z": "#60A5FA" },
};

// ---- OKLCH ↔ sRGB -------------------------------------------------------------------------------

type Oklch = { l: number; c: number; h: number };
type Rgb = { r: number; g: number; b: number };

const toLinear = (value: number): number =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const toGamma = (value: number): number =>
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

export const hexToRgb = (hex: string): Rgb => {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean;
  const value = Number.parseInt(full, 16);
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
};

const rgbToHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b]
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, channel)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;

const rgbToOklch = ({ r, g, b }: Rgb): Oklch => {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
};

const oklchToLinear = ({ l: L, c, h }: Oklch): Rgb => {
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
};

const inGamut = ({ r, g, b }: Rgb): boolean =>
  [r, g, b].every((value) => value >= -1e-4 && value <= 1 + 1e-4);

/** OKLCH to hex, reducing chroma until the colour fits sRGB. */
const oklchToHex = (color: Oklch): string => {
  let { c } = color;
  let linear = oklchToLinear({ ...color, c });
  for (let i = 0; i < 30 && !inGamut(linear); i += 1) {
    c *= 0.9;
    linear = oklchToLinear({ ...color, c });
  }
  return rgbToHex({ r: toGamma(linear.r), g: toGamma(linear.g), b: toGamma(linear.b) });
};

// ---- Ramps ----------------------------------------------------------------------------------------

/** Target lightness per step 1–12; step 9 is the base's own solid colour (lifted in dark mode). */
const rampLightness: Readonly<Record<Theme, readonly number[]>> = {
  light: [0.995, 0.975, 0.95, 0.925, 0.895, 0.86, 0.8, 0.72, -1, -2, 0.47, 0.28],
  dark: [0.17, 0.205, 0.255, 0.29, 0.33, 0.375, 0.44, 0.53, -1, -2, 0.83, 0.96],
};
/** Chroma relative to the base per step: quiet tints at the ends, full at the solid steps. */
const rampChroma: readonly number[] = [0.06, 0.12, 0.22, 0.32, 0.42, 0.5, 0.6, 0.75, 1, 1, 0.85, 0.5];

export type Ramp = readonly string[];

export const rampOf = (base: string, theme: Theme): Ramp => {
  const color = rgbToOklch(hexToRgb(base));
  const solid = theme === "light" ? Math.min(color.l, 0.62) : Math.max(color.l, 0.76);
  return rampLightness[theme].map((target, index) => {
    const l = target === -1 ? solid : target === -2 ? solid + (theme === "light" ? -0.06 : 0.06) : target;
    return oklchToHex({ l, c: color.c * (rampChroma[index] ?? 1), h: color.h });
  });
};

const step = (ramp: Ramp, n: number): string => ramp[n - 1] ?? "#000000";

// ---- Contrast -------------------------------------------------------------------------------------

const luminance = (hex: string): number => {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};

/** Moves a text colour's lightness away from its background until it reaches the ratio (AA 4.5:1). */
const ensureContrast = (text: string, background: string, ratio = 4.5): string => {
  let color = rgbToOklch(hexToRgb(text));
  const darker = luminance(background) > 0.18;
  let hex = text;
  for (let i = 0; i < 40 && contrastRatio(hex, background) < ratio; i += 1) {
    color = { ...color, l: Math.min(1, Math.max(0, color.l + (darker ? -0.02 : 0.02))) };
    hex = oklchToHex(color);
  }
  return hex;
};

/** White or the darkest neutral, whichever reads better on a solid colour. */
const onSolid = (solid: string, dark: string): string =>
  contrastRatio("#FFFFFF", solid) >= contrastRatio(dark, solid) ? "#FFFFFF" : dark;

const alpha = (hex: string, percent: number): string => {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${String(Math.round(r * 255))} ${String(Math.round(g * 255))} ${String(Math.round(b * 255))} / ${String(percent)}%)`;
};

// ---- Roles ----------------------------------------------------------------------------------------

export type ThemeTokens = Readonly<Record<string, string>>;

/** Every semantic role for one theme, derived from the scheme's base colours. */
export const deriveTheme = (scheme: BaseColors, theme: Theme): ThemeTokens => {
  const neutral = rampOf(scheme.neutral, theme);
  const accent = rampOf(scheme.accent, theme);
  const danger = rampOf(scheme.danger, theme);
  const warning = rampOf(scheme.warning, theme);
  const success = rampOf(scheme.success, theme);
  const light = theme === "light";
  const canvas = light ? step(neutral, 2) : step(neutral, 1);
  const surface = light ? "#FFFFFF" : step(neutral, 2);
  const foreground = step(neutral, 12);
  const primary = step(accent, 9);
  const dangerSolid = light ? step(danger, 10) : step(danger, 11);
  return {
    canvas,
    surface,
    "surface-raised": light ? "#FFFFFF" : step(neutral, 4),
    input: light ? step(neutral, 3) : step(neutral, 3),
    foreground,
    muted: ensureContrast(step(neutral, 11), surface),
    "disabled-foreground": step(neutral, light ? 9 : 8),
    border: step(neutral, light ? 5 : 6),
    "border-strong": step(neutral, 8),
    hover: alpha(foreground, light ? 6 : 8),
    pressed: alpha(foreground, light ? 10 : 14),
    primary,
    "primary-hover": step(accent, 10),
    "on-primary": onSolid(primary, step(neutral, light ? 12 : 1)),
    selection: step(accent, light ? 3 : 4),
    "on-selection": ensureContrast(step(accent, light ? 11 : 12), step(accent, light ? 3 : 4)),
    focus: step(accent, light ? 9 : 10),
    danger: ensureContrast(dangerSolid, surface),
    "danger-hover": step(danger, light ? 11 : 12),
    "on-danger": onSolid(dangerSolid, step(danger, 1)),
    "danger-surface": step(danger, light ? 2 : 3),
    success: ensureContrast(step(success, 11), surface),
    "success-surface": step(success, light ? 2 : 3),
    warning: ensureContrast(step(warning, 11), surface),
    "warning-surface": step(warning, light ? 2 : 3),
    info: ensureContrast(step(accent, 11), surface),
    "info-surface": step(accent, light ? 2 : 3),
    overlay: alpha(light ? step(neutral, 12) : "#000000", light ? 35 : 60),
    grid: alpha(step(neutral, light ? 11 : 11), light ? 20 : 18),
    ...fixedRoles[theme],
  };
};

/** Text/background pairings checked on the Themes page (WCAG AA 4.5:1). */
export const contrastPairs: readonly Readonly<{ text: string; background: string }>[] = [
  { text: "foreground", background: "surface" },
  { text: "foreground", background: "canvas" },
  { text: "muted", background: "surface" },
  { text: "on-primary", background: "primary" },
  { text: "on-selection", background: "selection" },
  { text: "danger", background: "surface" },
  { text: "on-danger", background: "danger" },
  { text: "success", background: "surface" },
  { text: "warning", background: "surface" },
  { text: "info", background: "surface" },
];

/** The renderer's selection colours (WebGL cannot read CSS variables). */
export const helperAccent = (
  scheme: BaseColors,
  theme: Theme,
): Readonly<{ selection: string; accent: string; accentStrong: string }> => {
  const accent = rampOf(scheme.accent, theme);
  if (theme === "light")
    return { selection: step(accent, 10), accent: step(accent, 10), accentStrong: step(accent, 12) };
  // Dark mode (owner, Phase 5 follow-up): selections sit on light floors and walls, so the selection fill
  // and the strong tone use the deep solid accent (the light ramp's solid steps) instead of pale tints;
  // thin handle lines keep the light accent, which reads against the dark background.
  const solid = rampOf(scheme.accent, "light");
  return { selection: step(solid, 9), accent: step(accent, 10), accentStrong: step(solid, 9) };
};

const toHex = ([r, g, b]: readonly number[]): string =>
  rgbToHex({ r: (r ?? 0) / 255, g: (g ?? 0) / 255, b: (b ?? 0) / 255 });

/** The scheme a preference names: a preset, or custom base colours (sRGB 0–255; missing ones from Blue). */
export const schemeFromPreference = (
  name: SchemePreset | "custom",
  custom: Readonly<Partial<Record<keyof BaseColors, readonly number[]>>> | undefined,
): BaseColors => {
  if (name !== "custom") return schemePresets[name];
  const pick = (key: keyof BaseColors): string => {
    const value = custom?.[key];
    return value === undefined ? defaultScheme[key] : toHex(value);
  };
  return {
    neutral: pick("neutral"),
    accent: pick("accent"),
    danger: pick("danger"),
    warning: pick("warning"),
    success: pick("success"),
  };
};

/** A scheme's base colours as sRGB 0–255 triples (the Custom colours preference starts from these). */
export const schemeToRgb = (scheme: BaseColors): Record<keyof BaseColors, number[]> => {
  const channels = (hex: string): number[] => {
    const { r, g, b } = hexToRgb(hex);
    return [r, g, b].map((value) => Math.round(value * 255));
  };
  return {
    neutral: channels(scheme.neutral),
    accent: channels(scheme.accent),
    danger: channels(scheme.danger),
    warning: channels(scheme.warning),
    success: channels(scheme.success),
  };
};
