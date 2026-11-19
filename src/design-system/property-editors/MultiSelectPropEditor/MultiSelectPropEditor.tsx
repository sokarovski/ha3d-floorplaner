import type { ReactElement } from "react";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { arrayItemsNode, choicesOf } from "@shared/domain/schemas/schemaWalk";
import type { PropertyEditorProps } from "../editorContract";
import { EditorMessage } from "../EditorMessage/EditorMessage";
import { orderedSelection } from "../multiSelectRules";

export const MultiSelectPropEditor = ({
  id,
  label,
  value,
  schema,
  mixed,
  disabled,
  describedBy,
  onCommit,
}: PropertyEditorProps): ReactElement => {
  const items = arrayItemsNode(schema);
  const choices = items === undefined ? [] : choicesOf(items);
  const selected = mixed || !Array.isArray(value) ? [] : value.filter((entry) => typeof entry === "string");
  const minItems = typeof schema.minItems === "number" ? schema.minItems : 0;
  return (
    <div data-editor-multiselect="" id={id}>
      <ToggleButtonGroup
        aria-label={label}
        aria-describedby={describedBy}
        selectionMode="multiple"
        selectedKeys={selected}
        isDisabled={disabled}
        onSelectionChange={(keys) => {
          const next = orderedSelection(keys, choices);
          if (next.length >= minItems) onCommit(next);
        }}
        data-editor-chips=""
      >
        {choices.map((choice) => (
          <ToggleButton key={choice.value} id={choice.value} data-editor-chip="">
            {choice.title}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <EditorMessage message={mixed ? "Values differ across the selection." : undefined} />
    </div>
  );
};
