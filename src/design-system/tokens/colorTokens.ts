// The colour roles with their light and dark values, derived from the default scheme (Phase 5.5) — the
// same derivation that writes tokens.tw.css and that the theme controller applies, so nothing is kept in
// step by hand. The /ds Colors page lists these.
import { defaultScheme, deriveTheme } from "./colorScheme";

export type ColorToken = Readonly<{ role: string; light: string; dark: string; use: string }>;

const uses: readonly (readonly [string, string])[] = [
  ["canvas", "Application background"],
  ["surface", "Panels, cards, toolbox"],
  ["surface-raised", "Menus, popovers, dialogs"],
  ["input", "Input backgrounds"],
  ["foreground", "Main text/icons"],
  ["muted", "Secondary text"],
  ["disabled-foreground", "Disabled labels/icons"],
  ["border", "Subtle separators"],
  ["border-strong", "Control outlines where stronger contrast is needed"],
  ["hover", "Neutral hover surface"],
  ["pressed", "Pressed neutral controls"],
  ["primary", "Primary action background"],
  ["primary-hover", "Primary action hover"],
  ["on-primary", "Primary action text/icons"],
  ["selection", "Selected tree item/tool"],
  ["on-selection", "Selection text/icons"],
  ["focus", "Keyboard focus indicator"],
  ["danger", "Error/destructive text/icons and filled danger actions"],
  ["danger-hover", "Filled danger action hover"],
  ["on-danger", "Filled danger action text/icons"],
  ["danger-surface", "Error surface"],
  ["success", "Success text/icons"],
  ["success-surface", "Success surface"],
  ["warning", "Warning text/icons"],
  ["warning-surface", "Warning surface"],
  ["info", "Informational text/icons"],
  ["info-surface", "Informational surface"],
  ["overlay", "Modal backdrop"],
  ["grid", "Subtle editor grid"],
  ["guide", "Construction guides and markers"],
  ["axis-x", "Red (plan x) axis: inference cues, view gizmo"],
  ["axis-y", "Green (plan y) axis: inference cues, view gizmo"],
  ["axis-z", "Blue (vertical) axis: inference cues, view gizmo"],
];

const light = deriveTheme(defaultScheme, "light");
const dark = deriveTheme(defaultScheme, "dark");

export const colorTokens: readonly ColorToken[] = uses.map(([role, use]) => ({
  role,
  light: light[role] ?? "",
  dark: dark[role] ?? "",
  use,
}));
