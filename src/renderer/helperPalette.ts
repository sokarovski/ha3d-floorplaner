// Helper colors per theme for the default colour scheme. They mirror the semantic tokens in
// src/design-system/styles/tokens.tw.css (canvas, grid, guide, primary/focus, warning, danger, muted); the runtime
// cannot read CSS variables of a WebGL canvas, so the values are duplicated here and must follow token changes.
// A custom scheme (Phase 5.5) changes the UI tokens but not these helper colours.
// Light-theme selection/accent now match the primary token (#1D4ED8); the earlier #2563EB read too pale as
// thin WebGL lines (owner, 2026-11-15).
import type { HelperTheme, OverlayTone } from "./runtimeTypes";

export type HelperPalette = Readonly<{
  /** Viewport background (canvas token), sRGB hex. */
  background: string;
  /** Ground grid line color, sRGB 0–1 with alpha (grid token). */
  grid: Readonly<{ r: number; g: number; b: number; a: number }>;
  guide: string;
  selection: string;
  outline: string;
  tones: Readonly<Record<OverlayTone, string>>;
}>;

const palettes: Readonly<Record<HelperTheme, HelperPalette>> = {
  light: {
    background: "#F1F5F9",
    grid: { r: 71 / 255, g: 85 / 255, b: 105 / 255, a: 0.32 },
    guide: "#7C3AED",
    selection: "#1D4ED8",
    outline: "#475569",
    tones: {
      accent: "#1D4ED8",
      accentStrong: "#1E3A8A",
      guide: "#7C3AED",
      warning: "#B45309",
      danger: "#B91C1C",
      neutral: "#475569",
      inferenceX: "#DC2626",
      inferenceY: "#16A34A",
      inferenceVertical: "#2563EB",
      inferenceEdge: "#C026D3",
    },
  },
  dark: {
    background: "#0F172A",
    grid: { r: 203 / 255, g: 213 / 255, b: 225 / 255, a: 0.26 },
    guide: "#C4B5FD",
    selection: "#93C5FD",
    outline: "#CBD5E1",
    tones: {
      accent: "#93C5FD",
      accentStrong: "#DBEAFE",
      guide: "#C4B5FD",
      warning: "#FDE68A",
      danger: "#FCA5A5",
      neutral: "#CBD5E1",
      inferenceX: "#F87171",
      inferenceY: "#4ADE80",
      inferenceVertical: "#60A5FA",
      inferenceEdge: "#E879F9",
    },
  },
};

export const helperPalette = (
  theme: HelperTheme,
  accent?: Readonly<{ selection: string; accent: string; accentStrong: string }>,
): HelperPalette => {
  const base = palettes[theme];
  return accent === undefined
    ? base
    : {
        ...base,
        selection: accent.selection,
        tones: { ...base.tones, accent: accent.accent, accentStrong: accent.accentStrong },
      };
};
