import type { ReactElement } from "react";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { choicesOf } from "@shared/domain/schemas/schemaWalk";
import { Icon } from "../../components/Icon/Icon";
import { iconPaths } from "../../components/Icon/icons";
import type { IconName } from "../../components/Icon/icons";
import type { PropertyEditorProps } from "../editorContract";

const isIconName = (value: string | undefined): value is IconName =>
  value !== undefined && value in iconPaths;

/**
 * A single choice among two or three options as a pill-shaped segmented control (Phase 5.9, owner H11):
 * every option visible, one click to change. Choices come from the schema (anyOf consts with titles); the
 * optional `optionIcons` annotation adds an icon per option.
 */
export const SegmentedPropEditor = ({
  label,
  value,
  schema,
  annotation,
  mixed,
  disabled,
  describedBy,
  onCommit,
}: PropertyEditorProps): ReactElement => {
  const choices = choicesOf(schema);
  const selected = mixed || typeof value !== "string" ? [] : [value];
  return (
    <ToggleButtonGroup
      aria-label={label}
      aria-describedby={describedBy}
      selectionMode="single"
      disallowEmptySelection={!mixed}
      selectedKeys={selected}
      isDisabled={disabled}
      onSelectionChange={(keys) => {
        const [next] = [...keys];
        if (typeof next === "string" && next !== value && choices.some((choice) => choice.value === next))
          onCommit(next);
      }}
      data-editor-segmented=""
    >
      {choices.map((choice) => {
        const icon = annotation.optionIcons?.[choice.value];
        return (
          <ToggleButton key={choice.value} id={choice.value} data-editor-segment="">
            {isIconName(icon) ? <Icon name={icon} size="sm" /> : null}
            {choice.title}
          </ToggleButton>
        );
      })}
    </ToggleButtonGroup>
  );
};
