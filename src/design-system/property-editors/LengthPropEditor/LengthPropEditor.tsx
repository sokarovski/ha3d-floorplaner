import type { ReactElement } from "react";
import { numericLimits } from "@shared/domain/schemas/schemaWalk";
import { formatLength } from "@shared/domain/units/lengthUnits";
import type { PropertyEditorProps } from "../editorContract";
import { LengthInput } from "../LengthInput/LengthInput";
import { QuickPicks } from "../QuickPicks/QuickPicks";

export const LengthPropEditor = ({
  id,
  label,
  value,
  schema,
  annotation,
  projectUnit,
  mixed,
  disabled,
  describedBy,
  onCommit,
}: PropertyEditorProps): ReactElement => {
  const input = (
    <LengthInput
      id={id}
      value={typeof value === "number" ? value : undefined}
      unit={projectUnit}
      limits={numericLimits(schema)}
      mixed={mixed}
      disabled={disabled}
      describedBy={describedBy}
      // A short label inside the field (Phase 5.8); the full title stays the accessible name.
      start={annotation.inlineLabel}
      aria-label={annotation.inlineLabel === undefined ? undefined : label}
      onCommit={onCommit}
    />
  );
  const picks = annotation.quickPicks;
  // Suggested sizes (Phase 9.1, template quick picks) in the project unit, one click commits.
  return picks === undefined || picks.length === 0 ? (
    input
  ) : (
    <div data-editor-with-picks="">
      {input}
      <QuickPicks
        label={`${label} quick picks`}
        picks={picks.map((pick) => ({ value: pick, text: formatLength(pick, projectUnit) }))}
        value={mixed || typeof value !== "number" ? undefined : value}
        disabled={disabled}
        onPick={(pick) => {
          onCommit(pick);
        }}
      />
    </div>
  );
};
