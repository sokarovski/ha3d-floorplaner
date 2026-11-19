import type { ReactElement } from "react";
import type { PropertyEditorProps } from "../editorContract";
import { formatReadOnlyValue } from "../readOnlyFormat";

export const ReadOnlyPropEditor = ({
  id,
  value,
  schema,
  annotation,
  projectUnit,
  mixed,
}: PropertyEditorProps): ReactElement => (
  <output id={id} data-editor-readonly="">
    {mixed ? "Mixed" : formatReadOnlyValue(value, schema, annotation, projectUnit)}
  </output>
);
