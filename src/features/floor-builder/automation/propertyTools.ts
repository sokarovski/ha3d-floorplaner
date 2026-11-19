import Type from "typebox";
import { setPropertyCommand } from "@shared/domain/commands/propertyCommands";
import { defineCommand } from "@shared/domain/commands/command";
import { deleteEntitiesCommand } from "@shared/domain/commands/deleteCommands";
import { indexEntities } from "@shared/domain/house/entityIndex";
import { withValueAtPath } from "@shared/domain/schemas/schemaWalk";
import { AgentError } from "./automationTypes";
import type { AutomationContext } from "./automationTypes";
import {
  entitySchema,
  entityWithTemplateVersion,
  validateEntityValue,
  validatePropertyPath,
} from "./entityProperties";
import { EntityIdInput } from "./shapeInput";
import { defineTool } from "./toolDefinition";

export const propertyTools = (context: AutomationContext) => [
  defineTool({
    name: "get_entity_schema",
    description:
      "Returns the same property JSON Schema used by the panel, including pinned template parameters. readOnly and x-homeplan.hidden fields cannot be changed through set_properties.",
    effect: "read",
    input: Type.Object({ entityId: EntityIdInput }, { additionalProperties: false }),
    output: Type.Object({ kind: Type.String(), schema: Type.Unknown() }),
    examples: [{ input: { entityId: "a_example1" } }],
    run: async ({ entityId }, house) => {
      const ref = indexEntities(house).get(entityId);
      if (ref === undefined) throw new AgentError("NOT_FOUND", "Entity not found.");
      return { data: { kind: ref.kind, schema: await entitySchema(context, ref) } };
    },
  }),
  defineTool({
    name: "set_properties",
    description:
      "Sets one or more editable properties on one entity as a single undo step. Paths are arrays of schema property names. Use get_entity_schema first. This also edits materials, dimensions, light settings, and template parameters; identity and child collections are protected.",
    effect: "edit",
    input: Type.Object(
      {
        entityId: EntityIdInput,
        changes: Type.Array(
          Type.Object(
            {
              path: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 16 }),
              value: Type.Unknown(),
            },
            { additionalProperties: false },
          ),
          { minItems: 1, maxItems: 100 },
        ),
      },
      { additionalProperties: false },
    ),
    output: Type.Object({ entityId: Type.String() }),
    examples: [{ input: { entityId: "a_example1", changes: [{ path: ["name"], value: "Living room" }] } }],
    run: async (input, house) => {
      const ref = indexEntities(house).get(input.entityId);
      if (ref === undefined) throw new AgentError("NOT_FOUND", "Entity not found.");
      const version = input.changes.findLast(
        (change) => change.path.length === 1 && change.path[0] === "templateVersion",
      )?.value;
      const schema = await entitySchema(
        context,
        typeof version === "number" ? entityWithTemplateVersion(ref, version) : ref,
      );
      // Check the complete result so coordinated property updates can satisfy constraints together.
      let value: unknown = ref.value;
      for (const change of input.changes) {
        validatePropertyPath(schema, change.path);
        value = withValueAtPath(value, change.path, change.value);
      }
      validateEntityValue(schema, value);
      const commands = input.changes.map((change) =>
        setPropertyCommand(house, [ref.id], change.path, change.value, "Set property"),
      );
      return {
        data: { entityId: ref.id },
        command: defineCommand("Set properties", ref.kind === "house" ? undefined : ref.floorId, (draft) => {
          for (const command of commands) {
            const problem = command.apply(draft);
            if (problem !== undefined) return problem;
          }
          return undefined;
        }),
      };
    },
  }),
  defineTool({
    name: "delete_entities",
    description:
      "Deletes rooms, shapes, walls, openings, objects, lights, or carpets by stable IDs in one undo step. Use delete_floor for a floor. Referenced children are removed with their parent.",
    effect: "edit",
    input: Type.Object(
      { entityIds: Type.Array(EntityIdInput, { minItems: 1, maxItems: 100, uniqueItems: true }) },
      { additionalProperties: false },
    ),
    output: Type.Object({ entityIds: Type.Array(Type.String()) }),
    examples: [{ input: { entityIds: ["o_example1"] } }],
    run: ({ entityIds }, house) => {
      const entities = indexEntities(house);
      if (entityIds.some((id) => !entities.has(id)))
        throw new AgentError("NOT_FOUND", "At least one entity no longer exists.");
      const refs = entityIds.map((id) => entities.get(id));
      if (
        refs.some((ref) =>
          refs.some(
            (parent) =>
              parent !== undefined &&
              ref !== undefined &&
              parent.id !== ref.id &&
              parent.path.length < ref.path.length &&
              parent.path.every((part, i) => ref.path[i] === part),
          ),
        )
      )
        throw new AgentError("INVALID_INPUT", "Delete the parent alone; do not also list its descendants.");
      return { command: deleteEntitiesCommand(house, entityIds), data: { entityIds } };
    },
  }),
];
