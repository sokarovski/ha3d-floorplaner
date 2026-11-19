import type { ChangeEvent, FocusEvent, KeyboardEvent, ReactElement, ReactNode, Ref } from "react";

type InputProps = Readonly<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  type?: "text" | "number" | "search" | "datetime-local";
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  /** The control holds an uncommitted draft (editor shortcuts leave it alone). */
  dirty?: boolean;
  monospace?: boolean;
  align?: "start" | "end";
  suffix?: string;
  /** Content inside the field before the text (Phase 5.8): a short label, an icon. Decorative. */
  start?: ReactNode;
  /** Content inside the field after the text and suffix: a Keycap, an icon. Decorative. */
  end?: ReactNode;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-labelledby"?: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  step?: number;
  min?: number;
  max?: number;
}>;

export const Input = ({
  id,
  value,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  type = "text",
  placeholder,
  disabled = false,
  readOnly = false,
  invalid = false,
  dirty = false,
  monospace = false,
  align = "start",
  suffix,
  start,
  end,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-labelledby": ariaLabelledBy,
  autoFocus,
  inputRef,
  step,
  min,
  max,
}: InputProps): ReactElement => (
  <span
    data-input=""
    data-input-dirty={dirty ? "" : undefined}
    data-input-invalid={invalid ? "" : undefined}
    data-input-disabled={disabled ? "" : undefined}
    onPointerDown={(event) => {
      // A click on an adornment focuses the text (adornments never take focus themselves).
      if (event.target !== event.currentTarget.querySelector("input")) {
        event.preventDefault();
        event.currentTarget.querySelector("input")?.focus();
      }
    }}
  >
    {start === undefined ? null : (
      <span data-input-start="" aria-hidden="true">
        {start}
      </span>
    )}
    <input
      ref={inputRef}
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      aria-invalid={invalid ? true : undefined}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-labelledby={ariaLabelledBy}
      autoFocus={autoFocus}
      step={step}
      min={min}
      max={max}
      spellCheck={false}
      autoComplete="off"
      data-input-control=""
      data-input-mono={monospace ? "" : undefined}
      data-input-end={align === "end" ? "" : undefined}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        onChange(event.target.value);
      }}
      onBlur={onBlur}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    />
    {suffix === undefined ? null : <span data-input-suffix="">{suffix}</span>}
    {end === undefined ? null : (
      <span data-input-end-slot="" aria-hidden="true">
        {end}
      </span>
    )}
  </span>
);
