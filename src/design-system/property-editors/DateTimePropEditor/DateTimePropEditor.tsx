import type { ReactElement } from "react";
import { Input } from "../../components/Input/Input";
import type { PropertyEditorProps } from "../editorContract";
import { EditorMessage } from "../EditorMessage/EditorMessage";
import { parseLocalDateTime } from "../dateTimeRules";
import { useDraftField } from "../useDraftField";

export const DateTimePropEditor = ({
  id,
  value,
  mixed,
  disabled,
  describedBy,
  onCommit,
}: PropertyEditorProps): ReactElement => {
  const field = useDraftField(mixed || typeof value !== "string" ? "" : value, parseLocalDateTime, onCommit);
  const messageId = `${id}-message`;
  return (
    <div data-editor-datetime="">
      <Input
        id={id}
        type="datetime-local"
        step={1}
        value={field.text}
        onChange={field.setText}
        onBlur={field.onBlur}
        onKeyDown={field.onKeyDown}
        disabled={disabled}
        invalid={field.message !== undefined}
        dirty={field.editing}
        aria-describedby={field.message === undefined ? describedBy : messageId}
      />
      <EditorMessage id={messageId} message={field.message} />
    </div>
  );
};
