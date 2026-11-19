import type { ReactElement } from "react";
import { numericLimits } from "@shared/domain/schemas/schemaWalk";
import { formatPlainNumber, parsePlainNumber } from "@shared/domain/units/numbers";
import { Input } from "../../components/Input/Input";
import type { PropertyEditorProps } from "../editorContract";
import { EditorMessage } from "../EditorMessage/EditorMessage";
import { QuickPicks } from "../QuickPicks/QuickPicks";
import { checkLimits } from "../limitMessages";
import { useDraftField } from "../useDraftField";

export const NumberPropEditor = ({
  id,
  label,
  value,
  schema,
  annotation,
  mixed,
  disabled,
  describedBy,
  onCommit,
}: PropertyEditorProps): ReactElement => {
  const limits = numericLimits(schema);
  const suffix = annotation.unitSuffix;
  const format = (amount: number): string =>
    suffix === undefined ? formatPlainNumber(amount) : `${formatPlainNumber(amount)} ${suffix}`;
  const field = useDraftField(
    mixed || typeof value !== "number" ? "" : formatPlainNumber(value),
    (text) => {
      const parsed = parsePlainNumber(text, limits.integer);
      if (!parsed.ok) return parsed;
      const message = checkLimits(parsed.value, limits, format);
      return message === undefined ? parsed : { ok: false, message };
    },
    onCommit,
  );
  const messageId = `${id}-message`;
  return (
    <div data-editor-number="" data-editor-with-picks={annotation.quickPicks === undefined ? undefined : ""}>
      <Input
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
        suffix={suffix}
        aria-describedby={field.message === undefined ? describedBy : messageId}
      />
      <EditorMessage id={messageId} message={field.message} />
      {annotation.quickPicks === undefined || annotation.quickPicks.length === 0 ? null : (
        <QuickPicks
          label={`${label} quick picks`}
          picks={annotation.quickPicks.map((pick) => ({ value: pick, text: format(pick) }))}
          value={mixed || typeof value !== "number" ? undefined : value}
          disabled={disabled}
          onPick={(pick) => {
            onCommit(pick);
          }}
        />
      )}
    </div>
  );
};
