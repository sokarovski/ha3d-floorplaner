import type { ReactElement } from "react";

type ColorSwatchProps = Readonly<{
  role: string;
  theme: "light" | "dark" | "current";
}>;

/** Renders a swatch for a token role; the color comes from the data-ds-swatch-role selector in ds-colors.tw.css. */
export const ColorSwatch = ({ role, theme }: ColorSwatchProps): ReactElement =>
  theme === "current" ? (
    <span
      data-ds-swatch=""
      data-ds-swatch-role={role}
      aria-label={`${role} in the current theme`}
      role="img"
    />
  ) : (
    <span data-ui-root="" data-theme={theme} data-ds-swatch-wrap="">
      <span data-ds-swatch="" data-ds-swatch-role={role} aria-label={`${role} in ${theme}`} role="img" />
    </span>
  );
