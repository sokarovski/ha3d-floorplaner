import Type from "typebox";
import { openingSizeFromParameters } from "@shared/domain/templates/openingSize";
import { fitUnderRoof, wallItemTopLimitMm } from "@shared/geometry/roofItems";
import {
  addObjectCommand,
  addOpeningCommand,
  newAreableInstance,
  newWallableInstance,
} from "@shared/domain/commands/instanceCommands";
import { addCarpetCommand, addLightCommand, createLight } from "@shared/domain/commands/furnishingCommands";
import { defineCommand } from "@shared/domain/commands/command";
import { indexEntities } from "@shared/domain/house/entityIndex";
import { getAjv, toIssues } from "@shared/domain/validation/ajv";
import { templateParameterSchema } from "@shared/domain/templates/metadata";
import { latestVersion, loadTemplateMetadata } from "../templates/templateLibrary";
import { AgentError } from "./automationTypes";
import type { AutomationContext } from "./automationTypes";
import { defineTool } from "./toolDefinition";
import { EntityIdInput, NameInput, PointInput } from "./shapeInput";

const templateFields = {
  templateId: EntityIdInput,
  version: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "Omitted: latest available version. The placed instance pins this version.",
    }),
  ),
  name: NameInput,
  parameters: Type.Optional(
    Type.Record(Type.String(), Type.Union([Type.Number(), Type.String(), Type.Boolean()])),
  ),
};

const templateChoice = async (
  context: AutomationContext,
  templateId: string,
  version: number | undefined,
) => {
  const items = await context.templates.list(context.session.houseId);
  const item = items.find((candidate) => candidate.id === templateId);
  if (item === undefined) throw new AgentError("NOT_FOUND", "Template not found; call list_templates.");
  const pinned = version ?? latestVersion(item);
  if (!item.versions.includes(pinned)) throw new AgentError("NOT_FOUND", "Template version not found.");
  const metadata = await loadTemplateMetadata(context.templates, context.session.houseId, item, pinned);
  if (metadata === undefined) throw new AgentError("EDIT_REJECTED", "Template metadata could not be loaded.");
  return { templateId, version: pinned, label: item.label, metadata };
};

const checkedParameters = (
  metadata: Awaited<ReturnType<typeof templateChoice>>["metadata"],
  parameters: Readonly<Record<string, unknown>>,
): void => {
  const schema = templateParameterSchema(metadata);
  const validate = getAjv().compile({
    type: "object",
    properties: schema.properties,
    required: schema.required,
    additionalProperties: false,
  });
  if (!validate(parameters)) {
    const issue = toIssues(validate.errors)[0];
    throw new AgentError(
      "INVALID_INPUT",
      `Template parameter ${issue?.pointer ?? "/"}: ${issue?.message ?? "Invalid value"}`,
    );
  }
};

export const furnishingTools = (context: AutomationContext) => [
  defineTool({
    name: "get_template",
    description:
      "Loads a template version's metadata, including parameter schemas, attachment hosts, and defaults. Use list_templates to find IDs.",
    effect: "read",
    input: Type.Object(
      { templateId: EntityIdInput, version: Type.Optional(Type.Integer({ minimum: 1 })) },
      { additionalProperties: false },
    ),
    output: Type.Unknown(),
    examples: [{ input: { templateId: "window-style-1" } }],
    run: async (input) => ({ data: await templateChoice(context, input.templateId, input.version) }),
  }),
  defineTool({
    name: "place_object",
    description:
      "Places an Areable glTF template in a room, pinning its version. Position is room-local. Wall-mounted objects require wallId in that room. Returns objectId.",
    effect: "edit",
    input: Type.Object(
      {
        ...templateFields,
        areaId: EntityIdInput,
        positionMm: PointInput,
        rotationDeg: Type.Optional(Type.Number()),
        elevationMm: Type.Optional(Type.Number({ minimum: 0 })),
        wallId: Type.Optional(EntityIdInput),
      },
      { additionalProperties: false },
    ),
    output: Type.Object({ objectId: Type.String() }),
    examples: [
      {
        input: {
          areaId: "a_example1",
          templateId: "dining-table",
          name: "Dining table",
          positionMm: { x: 0, y: 0 },
        },
      },
    ],
    run: async (input, house) => {
      const entities = indexEntities(house);
      const area = entities.get(input.areaId);
      if (area?.kind !== "area") throw new AgentError("NOT_FOUND", "Room not found.");
      const choice = await templateChoice(context, input.templateId, input.version);
      if (choice.metadata.contract !== "Areable")
        throw new AgentError("INVALID_INPUT", "Use an Areable template for an object.");
      if (input.wallId !== undefined) {
        const wall = entities.get(input.wallId);
        if (wall?.kind !== "wall" || wall.areaId !== area.id)
          throw new AgentError("NOT_FOUND", "The hosting wall must belong to this room.");
        if (!choice.metadata.attachment.hosts.includes("wall"))
          throw new AgentError("INVALID_INPUT", "This template does not attach to walls.");
      }
      const instance = newAreableInstance(choice, input.name.trim(), input.positionMm, input.wallId);
      if (instance.attachment.host === "wall" && input.wallId === undefined)
        throw new AgentError("INVALID_INPUT", "This template needs a wallId.");
      instance.parameters = { ...instance.parameters, ...input.parameters };
      checkedParameters(choice.metadata, instance.parameters);
      instance.rotationDeg = input.rotationDeg ?? 0;
      if (input.elevationMm !== undefined) instance.elevationMm = input.elevationMm;
      return { command: addObjectCommand(area.floorId, area.id, instance), data: { objectId: instance.id } };
    },
  }),
  defineTool({
    name: "place_opening",
    description:
      "Places a Wallable door/window template on a straight wall, pinning its version. distanceAlongWallMm is the opening centre measured from the wall span's start. Returns openingId; inspect get_geometry for fit/conflict flags.",
    effect: "edit",
    input: Type.Object(
      {
        ...templateFields,
        wallId: EntityIdInput,
        distanceAlongWallMm: Type.Number({ minimum: 0 }),
        bottomMm: Type.Optional(Type.Number({ minimum: 0 })),
      },
      { additionalProperties: false },
    ),
    output: Type.Object({ openingId: Type.String() }),
    examples: [
      {
        input: {
          wallId: "w_example1",
          templateId: "window-style-1",
          name: "Kitchen window",
          distanceAlongWallMm: 2000,
          bottomMm: 900,
        },
      },
    ],
    run: async (input, house) => {
      const wall = indexEntities(house).get(input.wallId);
      if (wall?.kind !== "wall") throw new AgentError("NOT_FOUND", "Wall not found.");
      if (wall.value.sourceEdge.edge === "arc")
        throw new AgentError("EDIT_REJECTED", "Openings on curved walls are not supported.");
      const choice = await templateChoice(context, input.templateId, input.version);
      if (choice.metadata.contract !== "Wallable")
        throw new AgentError("INVALID_INPUT", "Use a Wallable template for a door or window.");
      const instance = newWallableInstance(choice, input.name.trim(), input.distanceAlongWallMm);
      instance.parameters = { ...instance.parameters, ...input.parameters };
      checkedParameters(choice.metadata, instance.parameters);
      if (input.bottomMm !== undefined) instance.placement.bottomMm = input.bottomMm;
      // The window limit (Phase 19.2): an opening whose top would be above the roof's underside is refused.
      const floor = house.floors.find((candidate) => candidate.id === wall.floorId);
      const size = openingSizeFromParameters(instance);
      const limit =
        floor === undefined || size === null
          ? null
          : wallItemTopLimitMm(floor, wall.areaId, wall.id, input.distanceAlongWallMm, size.widthMm);
      if (size !== null && fitUnderRoof(instance.placement.bottomMm, size.heightMm, limit).kind !== "fits")
        throw new AgentError(
          "EDIT_REJECTED",
          `The opening's top would be above the roof (the underside there is ${String(Math.floor(limit ?? 0))} mm); lower it or make it shorter.`,
        );
      return {
        command: addOpeningCommand(wall.floorId, wall.areaId, wall.id, instance),
        data: { openingId: instance.id },
      };
    },
  }),
  defineTool({
    name: "add_light",
    description:
      "Adds a point light at a room-local position and elevation. Use set_properties for lumens, colour, brightness, or linear geometry. Returns lightId.",
    effect: "edit",
    input: Type.Object(
      {
        areaId: EntityIdInput,
        name: NameInput,
        positionMm: PointInput,
        elevationMm: Type.Number({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
    output: Type.Object({ lightId: Type.String() }),
    examples: [
      {
        input: { areaId: "a_example1", name: "Ceiling light", positionMm: { x: 0, y: 0 }, elevationMm: 2300 },
      },
    ],
    run: (input, house) => {
      const area = indexEntities(house).get(input.areaId);
      if (area?.kind !== "area") throw new AgentError("NOT_FOUND", "Room not found.");
      const light = createLight(input.name.trim(), input.positionMm);
      light.elevationMm = input.elevationMm;
      return { command: addLightCommand(area.floorId, area.id, light), data: { lightId: light.id } };
    },
  }),
  defineTool({
    name: "add_carpet",
    description:
      "Adds a default rectangular carpet, 2000 × 1400 mm, at a room-local position. Use add_shape, replace_shape, and set_properties to edit it. Returns carpetId.",
    effect: "edit",
    input: Type.Object(
      { areaId: EntityIdInput, name: NameInput, positionMm: PointInput },
      { additionalProperties: false },
    ),
    output: Type.Object({ carpetId: Type.String() }),
    examples: [{ input: { areaId: "a_example1", name: "Rug", positionMm: { x: 0, y: 0 } } }],
    run: (input, house) => {
      const area = indexEntities(house).get(input.areaId);
      if (area?.kind !== "area") throw new AgentError("NOT_FOUND", "Room not found.");
      const { command, carpetId } = addCarpetCommand(house, area.floorId, area.id, input.positionMm);
      return {
        data: { carpetId },
        command: defineCommand("Add carpet", area.floorId, (draft) => {
          const problem = command.apply(draft);
          if (problem !== undefined) return problem;
          const carpet = draft.floors
            .find((floor) => floor.id === area.floorId)
            ?.areas.find((candidate) => candidate.id === area.id)
            ?.floor.carpets.find((candidate) => candidate.id === carpetId);
          if (carpet !== undefined) carpet.name = input.name.trim();
          return undefined;
        }),
      };
    },
  }),
];
