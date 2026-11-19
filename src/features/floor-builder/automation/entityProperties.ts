import { getAjv, toIssues } from "@shared/domain/validation/ajv";
import { isSchemaNode, objectProperties } from "@shared/domain/schemas/schemaWalk";
import type { SchemaNode } from "@shared/domain/schemas/schemaWalk";
import type { EntityRef } from "@shared/domain/house/entityIndex";
import { schemaForEntity } from "../services/selectionSchema";
import { instanceSchemaFor } from "../services/instanceSchemas";
import { loadTemplateMetadata } from "../templates/templateLibrary";
import { AgentError } from "./automationTypes";
import type { AutomationContext } from "./automationTypes";

export const entitySchema = async (context: AutomationContext, ref: EntityRef): Promise<SchemaNode> => {
  if (ref.kind === "object" || ref.kind === "opening") {
    const templates = await context.templates.list(context.session.houseId);
    const item = templates.find((candidate) => candidate.id === ref.value.templateId);
    if (!item?.versions.includes(ref.value.templateVersion))
      throw new AgentError("NOT_FOUND", "The instance's pinned template version is unavailable.");
    if (
      (await loadTemplateMetadata(
        context.templates,
        context.session.houseId,
        item,
        ref.value.templateVersion,
      )) === undefined
    )
      throw new AgentError("EDIT_REJECTED", "Template metadata could not be loaded.");
  }
  const schema = schemaForEntity(ref, (entity) => instanceSchemaFor(context.session.houseId, entity));
  if (!isSchemaNode(schema)) throw new AgentError("INTERNAL_ERROR", "Entity schema is unavailable.");
  return schema;
};

/** Only schema-declared property-panel fields; never identity, child collections or prototype paths. */
export const validatePropertyPath = (schema: SchemaNode, path: readonly string[]): void => {
  let node = schema;
  for (const key of path) {
    if (["__proto__", "prototype", "constructor"].includes(key))
      throw new AgentError("INVALID_INPUT", "Unsafe property path.");
    const entry = objectProperties(node).find((candidate) => candidate.key === key);
    if (entry === undefined || entry.node.readOnly === true || entry.annotation.hidden === true)
      throw new AgentError(
        "INVALID_INPUT",
        "Only declared editable properties can be changed. Use structural tools for IDs, shapes, walls, and children.",
      );
    node = entry.node;
  }
  // Reject replacement of an object that contains protected children, even if its parent is editable.
  const containsProtected = (candidate: SchemaNode): boolean =>
    objectProperties(candidate).some(
      (entry) =>
        entry.node.readOnly === true || entry.annotation.hidden === true || containsProtected(entry.node),
    );
  if (containsProtected(node))
    throw new AgentError(
      "INVALID_INPUT",
      "Edit the individual property rather than replacing an object containing protected fields.",
    );
};

export const validateEntityValue = (schema: SchemaNode, value: unknown): void => {
  const validate = getAjv().compile(schema);
  if (!validate(value)) {
    const issue = toIssues(validate.errors)[0];
    throw new AgentError(
      "INVALID_INPUT",
      `${issue?.pointer ?? "/"}: ${issue?.message ?? "Invalid property value"}`,
    );
  }
};

export const entityWithTemplateVersion = (ref: EntityRef, version: number): EntityRef => {
  switch (ref.kind) {
    case "opening":
      return { ...ref, value: { ...ref.value, templateVersion: version } };
    case "object":
      return { ...ref, value: { ...ref.value, templateVersion: version } };
    default:
      return ref;
  }
};
