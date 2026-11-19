import type { ReactElement } from "react";
import { isSchemaNode } from "@shared/domain/schemas/schemaWalk";
import type { PropertyEditorProps } from "../editorContract";
import { LengthInput } from "../LengthInput/LengthInput";

export const Vector2LengthPropEditor = ({
  id,
  label,
  value,
  projectUnit,
  mixed,
  disabled,
  describedBy,
  onCommit,
}: PropertyEditorProps): ReactElement => {
  const x = isSchemaNode(value) && typeof value.x === "number" ? value.x : undefined;
  const y = isSchemaNode(value) && typeof value.y === "number" ? value.y : undefined;
  return (
    <div data-editor-vector="">
      <div data-editor-vector-axis="">
        <LengthInput
          start={<span data-axis="x">X</span>}
          id={id}
          value={x}
          unit={projectUnit}
          limits={{ integer: false }}
          mixed={mixed}
          disabled={disabled}
          aria-label={`${label} X`}
          describedBy={describedBy}
          onCommit={(next) => onCommit({ x: next, y: y ?? 0 })}
        />
      </div>
      <div data-editor-vector-axis="">
        <LengthInput
          start={<span data-axis="y">Y</span>}
          id={`${id}-y`}
          value={y}
          unit={projectUnit}
          limits={{ integer: false }}
          mixed={mixed}
          disabled={disabled}
          aria-label={`${label} Y`}
          describedBy={describedBy}
          onCommit={(next) => onCommit({ x: x ?? 0, y: next })}
        />
      </div>
    </div>
  );
};
