// Mixed selections (Phase 5.7, owner H9): the properties a selection of different object types shares —
// the same key with the same schema in every type — as one object schema, grouped by the shared catalog
// groups. A carpet and a light share Name and Position, so both show and one edit writes both.
import { readAnnotation } from "@shared/domain/schemas/annotations";
import { propertyGroupCatalog, propertyGroups } from "@shared/domain/schemas/propertyGroups";
import type { PropertyGroupId } from "@shared/domain/schemas/propertyGroups";
import { isSchemaNode } from "@shared/domain/schemas/schemaWalk";

const isGroupId = (value: unknown): value is PropertyGroupId =>
  typeof value === "string" && value in propertyGroupCatalog;

/** The shared object schema, or undefined when the types share no editable property. */
export const sharedSchema = (schemas: readonly object[]): object | undefined => {
  const first = schemas[0];
  if (first === undefined || !isSchemaNode(first) || !isSchemaNode(first.properties)) return undefined;
  const firstProperties = first.properties;
  const common: Record<string, unknown> = {};
  for (const [key, property] of Object.entries(firstProperties)) {
    const signature = JSON.stringify(property);
    const everywhere = schemas.every((schema) => {
      if (!isSchemaNode(schema) || !isSchemaNode(schema.properties)) return false;
      const other = schema.properties[key];
      return other !== undefined && JSON.stringify(other) === signature;
    });
    if (everywhere && readAnnotation(property).hidden !== true) common[key] = property;
  }
  if (Object.keys(common).length === 0) return undefined;
  const required = Array.isArray(first.required)
    ? first.required.filter(
        (key) =>
          typeof key === "string" &&
          key in common &&
          schemas.every(
            (schema) =>
              isSchemaNode(schema) && Array.isArray(schema.required) && schema.required.includes(key),
          ),
      )
    : [];
  const groups = [...new Set(Object.values(common).map((property) => readAnnotation(property).group))].filter(
    isGroupId,
  );
  return {
    type: "object",
    properties: common,
    required,
    additionalProperties: false,
    title: "Shared properties",
    "x-homeplan": propertyGroups(...groups),
  };
};
