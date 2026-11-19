import type { ReactElement } from "react";
import type { Key } from "react-aria-components";
import {
  Button as AriaButton,
  ComboBox,
  Input as AriaInput,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from "react-aria-components";
import { choicesOf } from "@shared/domain/schemas/schemaWalk";
import { Icon } from "../../components/Icon/Icon";
import type { PropertyEditorProps } from "../editorContract";

export const SelectPropEditor = ({
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
  const choices = choicesOf(schema);
  const selected = mixed || typeof value !== "string" ? null : value;
  const commitKey = (key: Key | null): void => {
    if (key === null) return;
    const next = String(key);
    if (next !== selected && choices.some((choice) => choice.value === next)) onCommit(next);
  };
  return annotation.searchable === true ? (
    <ComboBox
      aria-label={label}
      aria-describedby={describedBy}
      value={selected}
      onChange={commitKey}
      isDisabled={disabled}
      menuTrigger="focus"
      data-editor-select=""
    >
      <div data-editor-combobox="">
        <AriaInput id={id} data-editor-combobox-input="" placeholder={mixed ? "Mixed" : "Search…"} />
        <AriaButton data-icon-button="" data-icon-button-sm="" aria-label={`Show ${label} choices`}>
          <Icon name="chevronDown" size="sm" />
        </AriaButton>
      </div>
      <Popover data-editor-listbox-popover="">
        <ListBox data-editor-listbox="">
          {choices.map((choice) => (
            <ListBoxItem key={choice.value} id={choice.value} textValue={choice.title} data-editor-option="">
              {choice.title}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </ComboBox>
  ) : (
    <Select
      aria-label={label}
      aria-describedby={describedBy}
      value={selected}
      onChange={commitKey}
      isDisabled={disabled}
      placeholder={mixed ? "Mixed" : "Choose…"}
      data-editor-select=""
    >
      <AriaButton id={id} data-editor-select-button="">
        <SelectValue data-editor-select-value="" />
        <Icon name="chevronDown" size="sm" />
      </AriaButton>
      <Popover data-editor-listbox-popover="">
        <ListBox data-editor-listbox="">
          {choices.map((choice) => (
            <ListBoxItem key={choice.value} id={choice.value} textValue={choice.title} data-editor-option="">
              {choice.title}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
};
