import type { ChangeEvent, ReactElement } from "react";
import { Input } from "../../components/Input/Input";
import { hexToRgb, readRgb, rgbToHex } from "../colorRules";
import type { PropertyEditorProps } from "../editorContract";
import { EditorMessage } from "../EditorMessage/EditorMessage";
import { useDraftField } from "../useDraftField";

export const ColorPropEditor = ({
  id,
  label,
  value,
  mixed,
  disabled,
  describedBy,
  onCommit,
}: PropertyEditorProps): ReactElement => {
  const rgb = readRgb(value) ?? [255, 255, 255];
  const hex = rgbToHex(rgb);
  const field = useDraftField(
    mixed ? "" : hex,
    (text) => {
      const parsed = hexToRgb(text);
      return parsed === undefined
        ? { ok: false, message: "Enter a hex color such as #ffcc88." }
        : { ok: true, value: parsed };
    },
    onCommit,
  );
  const messageId = `${id}-message`;
  return (
    <div data-editor-color-wrap="">
      <div data-editor-color="">
        <input
          type="color"
          aria-label={`${label} swatch`}
          value={hex}
          disabled={disabled}
          data-editor-color-swatch=""
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const parsed = hexToRgb(event.target.value);
            if (parsed !== undefined) onCommit(parsed);
          }}
        />
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
          aria-describedby={field.message === undefined ? describedBy : messageId}
        />
      </div>
      <EditorMessage id={messageId} message={field.message} />
    </div>
  );
};
