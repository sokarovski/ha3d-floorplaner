import type { ReactElement } from "react";

type HexSwatchProps = Readonly<{
  /** Any CSS colour (hex or rgb()). */
  color: string;
  label: string;
}>;

/** A swatch of an arbitrary colour (ramp steps, derived roles): the colour is a CSS variable the .tw.css paints. */
export const HexSwatch = ({ color, label }: HexSwatchProps): ReactElement => (
  <span
    data-ds-hex-swatch=""
    role="img"
    aria-label={`${label}: ${color}`}
    title={`${label}: ${color}`}
    ref={(element) => {
      element?.style.setProperty("--swatch", color);
    }}
  />
);
