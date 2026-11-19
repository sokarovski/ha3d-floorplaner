// Text value rules: trimmed, NFC-normalized, within minLength/maxLength/pattern (D14 names).
import type { SchemaNode } from "@shared/domain/schemas/schemaWalk";

export const parseTextValue = (
  text: string,
  schema: SchemaNode,
): Readonly<{ ok: true; value: string }> | Readonly<{ ok: false; message: string }> => {
  const value = text.normalize("NFC").trim();
  const minLength = typeof schema.minLength === "number" ? schema.minLength : undefined;
  const maxLength = typeof schema.maxLength === "number" ? schema.maxLength : undefined;
  if (minLength !== undefined && value.length < minLength) {
    return {
      ok: false,
      message: minLength === 1 ? "Enter a value." : `Use at least ${String(minLength)} characters.`,
    };
  }
  if (maxLength !== undefined && value.length > maxLength)
    return { ok: false, message: `Use at most ${String(maxLength)} characters.` };
  if (/\p{Cc}/u.test(value)) return { ok: false, message: "Control characters are not allowed." };
  if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value))
    return { ok: false, message: "The value has an invalid format." };
  return { ok: true, value };
};
