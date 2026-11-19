import type { ReactElement } from "react";
import { DropZone, FileTrigger } from "react-aria-components";
import { Button } from "../../components/Button/Button";
import type { PropertyEditorProps } from "../editorContract";
import { EditorMessage } from "../EditorMessage/EditorMessage";
import { checkFile, describeFile, firstDroppedFile } from "../fileRules";

export const FilePropEditor = ({
  id,
  label,
  value,
  annotation,
  disabled,
  error,
  onCommit,
}: PropertyEditorProps): ReactElement => {
  const accept = annotation.accept ?? [];
  const choose = (file: File | undefined): void => {
    if (file !== undefined) onCommit(file);
  };
  const current = value instanceof File ? value : undefined;
  const problem = current === undefined ? undefined : checkFile(current, accept, annotation.maxBytes);
  return (
    <div data-editor-file="">
      <DropZone
        aria-label={`${label}: drop a file`}
        isDisabled={disabled}
        onDrop={(event) => {
          void firstDroppedFile(event.items).then(choose);
        }}
        data-editor-dropzone=""
      >
        {current === undefined ? (
          <span>Drop a file here, or</span>
        ) : (
          <span data-editor-file-name="">{describeFile(current)}</span>
        )}
        <FileTrigger
          acceptedFileTypes={accept.length === 0 ? undefined : [...accept]}
          onSelect={(files) => {
            choose(files?.[0] ?? undefined);
          }}
        >
          <Button variant="secondary" size="sm" disabled={disabled} aria-label={`Choose ${label}`}>
            {current === undefined ? "Choose file…" : "Choose another…"}
          </Button>
        </FileTrigger>
      </DropZone>
      <EditorMessage id={`${id}-message`} message={problem ?? error} />
    </div>
  );
};
