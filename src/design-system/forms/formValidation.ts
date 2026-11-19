// Whole-form validation for buffered forms: Ajv against the form schema, plus file checks for file editors.
import type { TSchema } from "typebox";
import {
  objectProperties,
  isSchemaNode,
  pathToPointer,
  valueAtPath,
} from "@shared/domain/schemas/schemaWalk";
import type { SchemaNode } from "@shared/domain/schemas/schemaWalk";
import { getAjv, toIssues } from "@shared/domain/validation/ajv";
import { checkFile } from "../property-editors/fileRules";

export type FieldErrors = Readonly<Record<string, string>>;

const fileFieldErrors = (
  node: SchemaNode,
  value: unknown,
  path: readonly string[],
  errors: Record<string, string>,
): void => {
  for (const entry of objectProperties(node)) {
    const childPath = [...path, entry.key];
    const childValue = valueAtPath(value, [entry.key]);
    if (entry.annotation.editor === "file" && childValue instanceof File) {
      const problem = checkFile(childValue, entry.annotation.accept ?? [], entry.annotation.maxBytes);
      if (problem !== undefined) errors[pathToPointer(childPath)] = problem;
    } else if (isSchemaNode(childValue)) {
      fileFieldErrors(entry.node, childValue, childPath, errors);
    }
  }
};

const humanize = (message: string): string =>
  message.startsWith("must have required property")
    ? "This field is required."
    : message.charAt(0).toUpperCase() + message.slice(1) + ".";

/** Validates the whole draft; returns field errors keyed by JSON Pointer (empty when valid). */
export const validateFormDraft = (schema: TSchema, draft: unknown): FieldErrors => {
  const errors: Record<string, string> = {};
  const validate = getAjv().compile(schema);
  if (!validate(draft)) {
    for (const issue of toIssues(validate.errors)) {
      errors[issue.pointer] ??= humanize(issue.message);
    }
  }
  if (isSchemaNode(schema)) fileFieldErrors(schema, draft, [], errors);
  return errors;
};
