// The one theme controller: resolves Light/Dark/Auto to data-theme on the UI root (<html data-ui-root>)
// and follows prefers-color-scheme while the choice is Auto (spec/design-system/README.md#2-theme-settings).
// It also writes the colour scheme's derived role tokens as --ui-color-* variables on the root (Phase 5.5),
// so a scheme change recolours the whole UI at once; tokens.tw.css holds the default scheme for first paint.
import { defaultScheme, deriveTheme } from "../../design-system/tokens/colorScheme";
import type { BaseColors } from "../../design-system/tokens/colorScheme";

export type ThemeChoice = "light" | "dark" | "auto";
export type EffectiveTheme = "light" | "dark";

export type ThemeController = Readonly<{
  apply: (choice: ThemeChoice, scheme?: BaseColors) => void;
  effective: () => EffectiveTheme;
  /** The current colour scheme's base colours (for the renderer's selection colours). */
  scheme: () => BaseColors;
  dispose: () => void;
}>;

const tokenCacheKey = "homeplan:theme-tokens";

export const createThemeController = (root: HTMLElement, media: MediaQueryList): ThemeController => {
  let choice: ThemeChoice = "auto";
  let scheme: BaseColors = defaultScheme;

  const resolve = (): EffectiveTheme => (choice === "auto" ? (media.matches ? "dark" : "light") : choice);

  const render = (): void => {
    const effective = resolve();
    root.setAttribute("data-theme", effective);
    for (const [role, value] of Object.entries(deriveTheme(scheme, effective)))
      root.style.setProperty(`--ui-color-${role}`, value);
    // index.html applies these before first paint, so a saved scheme never flashes the default one.
    try {
      window.localStorage.setItem(
        tokenCacheKey,
        JSON.stringify({ light: deriveTheme(scheme, "light"), dark: deriveTheme(scheme, "dark") }),
      );
    } catch {
      // Browser storage is a best-effort startup cache.
    }
  };

  const onSystemChange = (): void => {
    if (choice === "auto") render();
  };

  media.addEventListener("change", onSystemChange);

  return {
    apply: (next, nextScheme) => {
      choice = next;
      if (nextScheme !== undefined) scheme = nextScheme;
      render();
    },
    effective: resolve,
    scheme: () => scheme,
    dispose: () => {
      media.removeEventListener("change", onSystemChange);
    },
  };
};
