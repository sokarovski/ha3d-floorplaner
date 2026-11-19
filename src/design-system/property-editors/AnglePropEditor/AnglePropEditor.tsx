import type { ReactElement } from "react";
import { numericLimits, schemaDefault } from "@shared/domain/schemas/schemaWalk";
import { formatDegrees, normalizeDegrees, parseAngle } from "@shared/domain/units/angles";
import { Input } from "../../components/Input/Input";
import type { PropertyEditorProps } from "../editorContract";
import { EditorMessage } from "../EditorMessage/EditorMessage";
import { QuickPicks } from "../QuickPicks/QuickPicks";
import { checkLimits } from "../limitMessages";
import { useDraftField } from "../useDraftField";

export const AnglePropEditor = ({
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
  const wraps = limits.maximum === undefined || (limits.minimum === 0 && limits.maximum === 360);
  // An optional angle that is absent shows its schema default (a strip's facing, Phase 13.3).
  const fallback = schemaDefault(schema);
  const shown = typeof value === "number" ? value : typeof fallback === "number" ? fallback : undefined;
  const field = useDraftField(
    mixed || shown === undefined ? "" : formatDegrees(shown),
    (text) => {
      const parsed = parseAngle(text);
      if (!parsed.ok) return parsed;
      const degrees = wraps ? normalizeDegrees(parsed.degrees) : parsed.degrees;
      const message = checkLimits(degrees, limits, (amount) => `${formatDegrees(amount)}°`);
      return message === undefined ? { ok: true, value: degrees } : { ok: false, message };
    },
    onCommit,
  );
  const messageId = `${id}-message`;
  return (
    <div data-editor-angle="" data-editor-with-picks={annotation.quickPicks === undefined ? undefined : ""}>
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
        suffix="°"
        aria-describedby={field.message === undefined ? describedBy : messageId}
      />
      <EditorMessage id={messageId} message={field.message} />
      {annotation.quickPicks === undefined || annotation.quickPicks.length === 0 ? null : (
        <QuickPicks
          label={`${label} quick picks`}
          picks={annotation.quickPicks.map((pick) => ({ value: pick, text: `${formatDegrees(pick)}°` }))}
          value={mixed ? undefined : shown}
          disabled={disabled}
          onPick={(pick) => {
            onCommit(pick);
          }}
        />
      )}
    </div>
  );
};
