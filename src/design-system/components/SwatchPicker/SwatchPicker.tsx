import type { ReactElement } from "react";
import { RadioButton, RadioField, RadioGroup } from "react-aria-components";

/** One choice: a colour swatch (sRGB 0–255; null = a custom choice) and its name. */
export type SwatchOption = Readonly<{
  id: string;
  label: string;
  color: readonly [number, number, number] | null;
  /** The finish carries a texture: the swatch shows its base colour with a texture mark. */
  textured?: boolean;
}>;

type SwatchPickerProps = Readonly<{
  /** Accessible name of the group (the field label). */
  label: string;
  describedBy?: string;
  options: readonly SwatchOption[];
  /** The chosen option's ID, or null when none is (mixed selection). */
  value: string | null;
  disabled?: boolean;
  onChange: (id: string) => void;
}>;

const cssColor = (color: readonly [number, number, number]): string =>
  `rgb(${String(color[0])} ${String(color[1])} ${String(color[2])})`;

/**
 * A single choice among named finishes shown as colour swatches (Phase 9.1, template material choices): a radio
 * group (arrow keys move, Space chooses), each option a round swatch with its name under it.
 */
export const SwatchPicker = ({
  label,
  describedBy,
  options,
  value,
  disabled = false,
  onChange,
}: SwatchPickerProps): ReactElement => (
  <RadioGroup
    aria-label={label}
    aria-describedby={describedBy}
    orientation="horizontal"
    value={value}
    isDisabled={disabled}
    onChange={onChange}
    data-swatch-picker=""
  >
    {options.map((option) => (
      <RadioField key={option.id} value={option.id} data-swatch-field="">
        <RadioButton data-swatch-option="">
          <span
            aria-hidden="true"
            data-swatch-color=""
            data-swatch-custom={option.color === null ? "" : undefined}
            data-swatch-textured={option.textured === true ? "" : undefined}
            ref={(element) => {
              if (option.color !== null) element?.style.setProperty("--swatch-color", cssColor(option.color));
            }}
          />
          <span data-swatch-label="">{option.label}</span>
        </RadioButton>
      </RadioField>
    ))}
  </RadioGroup>
);
