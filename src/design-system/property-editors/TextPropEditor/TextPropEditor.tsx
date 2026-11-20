import type { ReactElement } from "react";
import { Input } from "../../components/Input/Input";
import type { PropertyEditorProps } from "../editorContract";
import { EditorMessage } from "../EditorMessage/EditorMessage";
import { parseTextValue } from "../textRules";
import { useDraftField } from "../useDraftField";

export const TextPropEditor = ({
  id,
  value,
  schema,
  annotation,
  mixed,
  disabled,
  describedBy,
  onPreview,
  onCommit,
}: PropertyEditorProps): ReactElement => {
  const field = useDraftField(
    mixed || typeof value !== "string" ? "" : value,
    (text) => parseTextValue(text, schema),
    onCommit,
  );
  const messageId = `${id}-message`;
  return (
    <div data-editor-text="">
      <Input
        id={id}
        value={field.text}
        onChange={(text) => {
          field.setText(text);
          // The text as typed, for hosts that follow it before the commit (the material chooser's preset name).
          onPreview?.(text);
        }}
        onBlur={field.onBlur}
        onKeyDown={field.onKeyDown}
        placeholder={mixed ? "Mixed" : annotation.placeholder}
        disabled={disabled}
        invalid={field.message !== undefined}
        dirty={field.editing}
        aria-describedby={field.message === undefined ? describedBy : messageId}
      />
      <EditorMessage id={messageId} message={field.message} />
    </div>
  );
};
