// The effective UI theme as applied by the theme controller on the UI root (data-theme).
import type { HelperTheme } from "../../../renderer/runtimeTypes";

export const documentTheme = (): HelperTheme =>
  document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
