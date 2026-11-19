import type { ReactElement } from "react";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import type { PropertyEditorProps } from "../editorContract";

/**
 * A yes/no value as a small right-aligned Yes / No segmented control (owner, Phase 5 follow-up: switches and
 * checkboxes looked out of place among the other segmented choices). One click commits; Mixed selects neither.
 */
export const TogglePropEditor = ({
  id,
  label,
  value,
  mixed,
  disabled,
  describedBy,
  onCommit,
}: PropertyEditorProps): ReactElement => {
  const selected = mixed || typeof value !== "boolean" ? [] : [value ? "yes" : "no"];
  return (
    <div id={id} data-editor-yes-no="">
      <ToggleButtonGroup
        aria-label={label}
        aria-describedby={describedBy}
        selectionMode="single"
        disallowEmptySelection={!mixed}
        selectedKeys={selected}
        isDisabled={disabled}
        onSelectionChange={(keys) => {
          const [next] = [...keys];
          if (next !== "yes" && next !== "no") return;
          const flag = next === "yes";
          if (mixed || flag !== value) onCommit(flag);
        }}
        data-editor-segmented=""
        data-editor-segmented-compact=""
      >
        <ToggleButton id="yes" data-editor-segment="">
          Yes
        </ToggleButton>
        <ToggleButton id="no" data-editor-segment="">
          No
        </ToggleButton>
      </ToggleButtonGroup>
    </div>
  );
};
