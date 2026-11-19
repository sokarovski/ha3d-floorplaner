import type { ReactElement, ReactNode } from "react";
import type { LengthUnit } from "@shared/domain/schemas/house";
import type { NumericLimits } from "@shared/domain/schemas/schemaWalk";
import {
  formatLength,
  formatLengthNumber,
  lengthParseMessage,
  parseLength,
} from "@shared/domain/units/lengthUnits";
import { Input } from "../../components/Input/Input";
import { EditorMessage } from "../EditorMessage/EditorMessage";
import { checkLimits, lengthFormatter } from "../limitMessages";
import { useDraftField } from "../useDraftField";

type LengthInputProps = Readonly<{
  id: string;
  value: number | undefined;
  unit: LengthUnit;
  limits: NumericLimits;
  mixed: boolean;
  disabled: boolean;
  onCommit: (millimeters: number) => boolean;
  "aria-label"?: string;
  describedBy?: string;
  /** A short label or axis tag inside the field (Phase 5.8). */
  start?: ReactNode;
}>;

export const LengthInput = ({
  id,
  value,
  unit,
  limits,
  mixed,
  disabled,
  onCommit,
  "aria-label": ariaLabel,
  describedBy,
  start,
}: LengthInputProps): ReactElement => {
  const committedText = mixed || value === undefined ? "" : formatLengthNumber(value, unit);
  const field = useDraftField(
    committedText,
    (text) => {
      const parsed = parseLength(text, unit);
      if (!parsed.ok) return { ok: false, message: lengthParseMessage(parsed) ?? "Invalid length." };
      const limitMessage = checkLimits(parsed.millimeters, limits, lengthFormatter(unit));
      return limitMessage === undefined
        ? { ok: true, value: parsed.millimeters }
        : { ok: false, message: limitMessage };
    },
    onCommit,
  );
  const live = field.editing ? parseLength(field.text, unit) : undefined;
  const hint =
    live !== undefined && live.ok && live.explicitUnit
      ? `= ${formatLength(live.millimeters, unit)}`
      : undefined;
  const messageId = `${id}-message`;
  return (
    <div data-editor-length="">
      <Input
        start={start}
        id={id}
        value={field.text}
        onChange={field.setText}
        onBlur={field.onBlur}
        onKeyDown={field.onKeyDown}
        placeholder={mixed ? "Mixed" : undefined}
        disabled={disabled}
        invalid={field.message !== undefined}
        dirty={field.editing}
        monospace
        align="end"
        suffix={unit}
        aria-label={ariaLabel}
        aria-describedby={field.message === undefined ? describedBy : messageId}
      />
      {hint === undefined ? null : <div data-editor-hint="">{hint}</div>}
      <EditorMessage id={messageId} message={field.message} />
    </div>
  );
};
