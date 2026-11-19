import { useState } from "react";
import type { ReactElement } from "react";
import {
  pathToPointer,
  resolveEditorName,
  schemaDescription,
  schemaTitle,
  valueAtPath,
} from "@shared/domain/schemas/schemaWalk";
import type { PropertyEntry } from "@shared/domain/schemas/schemaWalk";
import { FormField } from "../../components/FormField/FormField";
import { isSectionEditor } from "../fieldLayout";
import { validateFieldValue } from "../fieldValidation";
import type { SchemaFormContext } from "../schemaFormTypes";

type SchemaFieldProps = Readonly<{
  entry: PropertyEntry;
  owner: unknown;
  path: readonly string[];
  context: SchemaFormContext;
  /**
   * No visible label of its own: one of a pair of inline-labelled fields sharing a row (Phase 5.8), or the
   * only field of a group, which the group title already names.
   */
  labelHidden?: boolean;
}>;

export const SchemaField = ({
  entry,
  owner,
  path,
  context,
  labelHidden = false,
}: SchemaFieldProps): ReactElement | null => {
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const editorName = resolveEditorName(entry.node, entry.annotation);
  const Editor =
    editorName === undefined || editorName === "group" ? undefined : context.registry[editorName];
  if (Editor === undefined) return null;
  const pointer = pathToPointer(path);
  const id = `${context.formId}${pointer.replaceAll("/", "-")}`;
  const label = schemaTitle(entry.node, entry.key);
  const description = schemaDescription(entry.node);
  const error = localError ?? context.errors[pointer];
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const describedBy = [
    error === undefined ? undefined : errorId,
    description === undefined ? undefined : descriptionId,
  ]
    .filter((part) => part !== undefined)
    .join(" ");
  const readOnly = entry.node.readOnly === true || entry.annotation.derived === true;
  return (
    <FormField
      label={label}
      htmlFor={id}
      required={context.mode === "buffered" && entry.required}
      description={description}
      descriptionId={descriptionId}
      error={error}
      errorId={errorId}
      labelHidden={labelHidden}
      layout={
        labelHidden
          ? "stacked"
          : isSectionEditor(editorName)
            ? "section"
            : context.mode === "live"
              ? "inline"
              : "stacked"
      }
    >
      <Editor
        id={id}
        label={label}
        describedBy={describedBy === "" ? undefined : describedBy}
        schema={entry.node}
        annotation={entry.annotation}
        value={valueAtPath(owner, [entry.key])}
        owner={owner}
        projectUnit={context.projectUnit}
        disabled={context.disabled || readOnly}
        mixed={context.mixedPointers.has(pointer)}
        required={entry.required}
        error={error}
        onPreview={
          context.onPreview === undefined
            ? undefined
            : (value: unknown) => {
                context.onPreview?.(path, value);
              }
        }
        onCommit={(value: unknown) => {
          const problem = validateFieldValue(entry.node, value);
          if (problem !== undefined) {
            setLocalError(problem);
            return false;
          }
          setLocalError(undefined);
          return context.onCommit(path, value);
        }}
      />
    </FormField>
  );
};
