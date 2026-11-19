// Intended foreground/background pairings shown on /ds/colors. Each id has a matching data selector in ds-colors.tw.css.

export type ColorPairingDoc = Readonly<{ id: string; label: string; foreground: string; background: string }>;

export const pairings: readonly ColorPairingDoc[] = [
  { id: "text-surface", label: "Text on surface", foreground: "foreground", background: "surface" },
  { id: "muted-surface", label: "Muted on surface", foreground: "muted", background: "surface" },
  { id: "text-canvas", label: "Text on canvas", foreground: "foreground", background: "canvas" },
  { id: "on-primary", label: "On primary", foreground: "on-primary", background: "primary" },
  { id: "on-selection", label: "On selection", foreground: "on-selection", background: "selection" },
  { id: "on-danger", label: "On danger", foreground: "on-danger", background: "danger" },
  {
    id: "danger-surface",
    label: "Danger on danger surface",
    foreground: "danger",
    background: "danger-surface",
  },
  {
    id: "warning-surface",
    label: "Warning on warning surface",
    foreground: "warning",
    background: "warning-surface",
  },
  {
    id: "success-surface",
    label: "Success on success surface",
    foreground: "success",
    background: "success-surface",
  },
  { id: "info-surface", label: "Info on info surface", foreground: "info", background: "info-surface" },
];
