import type { ReactElement, ReactNode } from "react";

type FormFieldProps = Readonly<{
  label: string;
  labelId?: string;
  htmlFor?: string;
  description?: string;
  descriptionId?: string;
  error?: string;
  errorId?: string;
  required?: boolean;
  hint?: ReactNode;
  /**
   * Label above ("stacked") or beside ("inline") the control; "section" (Phase 19.7) makes the label a bold
   * section title with space above, for a composite editor (a material, a location) among other fields.
   */
  layout?: "stacked" | "inline" | "section";
  /** The label stays for screen readers but is not shown (the field carries an inline label, Phase 5.8). */
  labelHidden?: boolean;
  children: ReactNode;
}>;

export const FormField = ({
  label,
  labelId,
  htmlFor,
  description,
  descriptionId,
  error,
  errorId,
  required = false,
  hint,
  layout = "stacked",
  labelHidden = false,
  children,
}: FormFieldProps): ReactElement => (
  <div
    data-form-field=""
    data-form-field-inline={layout === "inline" ? "" : undefined}
    data-form-field-section={layout === "section" ? "" : undefined}
    data-form-field-invalid={error === undefined ? undefined : ""}
  >
    <label
      data-form-field-label=""
      data-form-field-label-hidden={labelHidden ? "" : undefined}
      id={labelId}
      htmlFor={htmlFor}
    >
      {label}
      {required ? (
        <span data-form-field-required="" aria-hidden="true">
          {" "}
          *
        </span>
      ) : null}
    </label>
    <div data-form-field-control="">
      {children}
      {hint === undefined ? null : <div data-form-field-hint="">{hint}</div>}
      {description === undefined ? null : (
        <div data-form-field-description="" id={descriptionId}>
          {description}
        </div>
      )}
      {error === undefined ? null : (
        <div data-form-field-error="" id={errorId} role="alert">
          {error}
        </div>
      )}
    </div>
  </div>
);
