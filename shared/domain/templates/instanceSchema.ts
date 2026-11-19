// Combines a base instance schema with the parameters a template declares (D18): the panel then shows
// template parameters (width, height, stepCount, options, states) and the material choices of its choosable
// slots without template-specific code.
import { isSchemaNode } from "../schemas/schemaWalk";
import type { SchemaNode } from "../schemas/schemaWalk";

export type TemplatePanelParts = Readonly<{
  /** Parameter schemas by name (`templateParameterSchema`). */
  parameterProperties: Readonly<Record<string, object>>;
  required?: readonly string[];
  /** Panel groups of the parameters (Settings, State); ungrouped axis sizes form the Size group. */
  groups?: readonly Readonly<{ id: string; title: string }>[];
  /** Fields of the choosable material slots (`templateMaterialChoiceSchemas`), Phase 9.1. */
  materialChoices?: Readonly<Record<string, object>>;
}>;

/**
 * Returns a copy of the base schema whose `parameters` property lists the template's parameter schemas and, when
 * the template offers material choices, whose `materialOverrides` lists one field per choosable slot (other
 * overrides stay allowed and are kept as they are).
 */
export const withTemplateParameters = (base: SchemaNode, parts: TemplatePanelParts): SchemaNode => {
  const properties = isSchemaNode(base.properties) ? base.properties : {};
  const previous = isSchemaNode(properties.parameters) ? properties.parameters : {};
  const previousAnnotation = isSchemaNode(previous["x-homeplan"])
    ? previous["x-homeplan"]
    : { group: "template", order: 10 };
  const overrides = isSchemaNode(properties.materialOverrides) ? properties.materialOverrides : {};
  const choices = parts.materialChoices ?? {};
  return {
    ...base,
    properties: {
      ...properties,
      parameters: {
        title: "Size",
        "x-homeplan": {
          ...previousAnnotation,
          ...(parts.groups === undefined ? {} : { groups: parts.groups.map((group) => ({ ...group })) }),
        },
        type: "object",
        properties: parts.parameterProperties,
        required: [...(parts.required ?? [])],
        additionalProperties: true,
      },
      ...(Object.keys(choices).length === 0
        ? {}
        : {
            materialOverrides: {
              title: "Materials",
              "x-homeplan": isSchemaNode(overrides["x-homeplan"])
                ? overrides["x-homeplan"]
                : { group: "appearance", order: 30 },
              type: "object",
              properties: choices,
              additionalProperties: true,
            },
          }),
    },
  };
};
