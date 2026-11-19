// Validates one committed property value against its own schema node before it becomes a command.
import { getAjv, toIssues } from "@shared/domain/validation/ajv";
import type { SchemaNode } from "@shared/domain/schemas/schemaWalk";

export const validateFieldValue = (node: SchemaNode, value: unknown): string | undefined => {
  if (value instanceof File) return undefined;
  const validate = getAjv().compile({ ...node });
  if (validate(value)) return undefined;
  const first = toIssues(validate.errors)[0];
  return first === undefined
    ? "Invalid value."
    : `${first.message.charAt(0).toUpperCase()}${first.message.slice(1)}.`;
};
