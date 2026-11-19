// Playground helper (Phase 9.0): a second set of template parameter values that exercises every declared
// option and state without knowing the template: booleans flip, choices take their last other choice, and
// number state parameters go to their maximum. Read only from the template's own metadata (D26).
import { isSchemaNode } from "@shared/domain/schemas/schemaWalk";
import type { TemplateMetadata, TemplateParameterValue } from "@shared/domain/templates/metadata";
import { readTemplateProperty } from "@shared/domain/templates/metadata";

export const alternateParameters = (
  metadata: TemplateMetadata,
  parameters: Readonly<Record<string, TemplateParameterValue>>,
): Record<string, TemplateParameterValue> => {
  const next: Record<string, TemplateParameterValue> = { ...parameters };
  for (const [name, fragment] of Object.entries(metadata.properties ?? {})) {
    const info = readTemplateProperty(fragment).info;
    const value = parameters[name];
    if (info === null || !isSchemaNode(fragment)) continue;
    if (info.type === "boolean" && typeof value === "boolean") next[name] = !value;
    else if (info.type === "string" && info.choices !== undefined) {
      const other = info.choices.filter((choice) => choice !== value).at(-1);
      if (other !== undefined) next[name] = other;
    } else if (info.type === "number" && info.state && typeof fragment.maximum === "number")
      next[name] = fragment.maximum;
  }
  return next;
};
