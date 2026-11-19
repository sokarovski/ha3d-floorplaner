import Type from "typebox";
import { addFloorCommand, deleteFloorCommand } from "@shared/domain/commands/floorCommands";
import { addAreaWithShapeCommand, setAreaTransformCommand } from "@shared/domain/commands/areaCommands";
import { addShapeCommand, replaceShapeCommand } from "@shared/domain/commands/shapeCommands";
import { raiseWallsCommand } from "@shared/domain/commands/wallCommands";
import { defineCommand } from "@shared/domain/commands/command";
import { effectiveWallHeightMm } from "@shared/domain/house/defaults";
import { indexEntities } from "@shared/domain/house/entityIndex";
import { barePieces, boundaryPieces } from "../tools/planGeometry";
import { AgentError } from "./automationTypes";
import { defineTool } from "./toolDefinition";
import { EntityIdInput, makeShape, NameInput, PointInput, ShapeInput } from "./shapeInput";

export const layoutTools = () => [
  defineTool({
    name: "create_floor",
    description: "Adds a building floor. Does not switch the visible floor. Returns floorId.",
    effect: "edit",
    input: Type.Object({ name: NameInput }, { additionalProperties: false }),
    output: Type.Object({ floorId: Type.String() }),
    examples: [{ input: { name: "Upstairs" } }],
    run: (input, house) => {
      const { command, floorId } = addFloorCommand(house);
      return {
        data: { floorId },
        command: defineCommand("Create floor", floorId, (draft) => {
          const problem = command.apply(draft);
          if (problem !== undefined) return problem;
          const floor = draft.floors.find((candidate) => candidate.id === floorId);
          if (floor !== undefined) floor.name = input.name.trim();
          return undefined;
        }),
      };
    },
  }),
  defineTool({
    name: "delete_floor",
    description:
      "Deletes a building floor and its contents. The final floor cannot be deleted. Undo restores it.",
    effect: "edit",
    input: Type.Object({ floorId: EntityIdInput }, { additionalProperties: false }),
    output: Type.Object({ floorId: Type.String() }),
    examples: [{ input: { floorId: "f_example1" } }],
    run: ({ floorId }, house) => ({ data: { floorId }, command: deleteFloorCommand(house, floorId) }),
  }),
  defineTool({
    name: "create_room",
    description:
      "Creates a named room with one rectangle, circle, or polygon footprint. Room position is floor-local; footprint coordinates are room-local. Walls are raised separately. Returns areaId, floorSurfaceId, and shapeId.",
    effect: "edit",
    input: Type.Object(
      {
        floorId: EntityIdInput,
        name: NameInput,
        positionMm: PointInput,
        rotationDeg: Type.Optional(Type.Number()),
        shape: ShapeInput,
      },
      { additionalProperties: false },
    ),
    output: Type.Object({ areaId: Type.String(), floorSurfaceId: Type.String(), shapeId: Type.String() }),
    examples: [
      {
        input: {
          floorId: "f_example1",
          name: "Kitchen",
          positionMm: { x: 0, y: 0 },
          shape: {
            type: "rectangle",
            positionMm: { x: 0, y: 0 },
            rotationDeg: 0,
            widthMm: 4000,
            depthMm: 3000,
          },
        },
      },
    ],
    run: (input) => {
      const shape = makeShape(input.shape);
      const { command, areaId, floorSurfaceId } = addAreaWithShapeCommand(
        input.floorId,
        input.name.trim(),
        input.positionMm,
        input.rotationDeg ?? 0,
        shape,
      );
      return { command, data: { areaId, floorSurfaceId, shapeId: shape.id } };
    },
  }),
  defineTool({
    name: "move_room",
    description: "Sets a room's floor-local position and rotation. Its contents follow it.",
    effect: "edit",
    input: Type.Object(
      { areaId: EntityIdInput, positionMm: PointInput, rotationDeg: Type.Number() },
      { additionalProperties: false },
    ),
    output: Type.Object({ areaId: Type.String() }),
    examples: [{ input: { areaId: "a_example1", positionMm: { x: 4200, y: 0 }, rotationDeg: 0 } }],
    run: (input, house) => {
      const area = indexEntities(house).get(input.areaId);
      if (area?.kind !== "area") throw new AgentError("NOT_FOUND", "Room not found.");
      return {
        command: setAreaTransformCommand(area.floorId, area.id, input.positionMm, input.rotationDeg),
        data: { areaId: area.id },
      };
    },
  }),
  defineTool({
    name: "add_shape",
    description:
      "Adds a footprint piece to a room or carpet. Pieces union together. Coordinates are local to the room or carpet; returns shapeId.",
    effect: "edit",
    input: Type.Object(
      { areaId: EntityIdInput, carpetId: Type.Optional(EntityIdInput), shape: ShapeInput },
      { additionalProperties: false },
    ),
    output: Type.Object({ shapeId: Type.String() }),
    examples: [
      {
        input: {
          areaId: "a_example1",
          shape: { type: "circle", positionMm: { x: 2000, y: 0 }, radiusMm: 1000 },
        },
      },
    ],
    run: (input, house) => {
      const area = indexEntities(house).get(input.areaId);
      if (area?.kind !== "area") throw new AgentError("NOT_FOUND", "Room not found.");
      const shape = makeShape(input.shape);
      return {
        command: addShapeCommand(area.floorId, area.id, shape, input.carpetId),
        data: { shapeId: shape.id },
      };
    },
  }),
  defineTool({
    name: "replace_shape",
    description:
      "Replaces an existing footprint piece, retaining its ID. Regenerated polygon vertices or a changed shape type can orphan existing walls; inspect get_geometry afterward. Prefer set_properties for rectangle dimensions when keeping wall anchors. Returns shapeId.",
    effect: "edit",
    input: Type.Object({ shapeId: EntityIdInput, shape: ShapeInput }, { additionalProperties: false }),
    output: Type.Object({ shapeId: Type.String() }),
    examples: [
      {
        input: {
          shapeId: "s_example1",
          shape: {
            type: "rectangle",
            positionMm: { x: 0, y: 0 },
            rotationDeg: 0,
            widthMm: 5000,
            depthMm: 3000,
          },
        },
      },
    ],
    run: (input, house) => {
      const ref = indexEntities(house).get(input.shapeId);
      if (ref?.kind !== "shape") throw new AgentError("NOT_FOUND", "Shape not found.");
      return {
        command: replaceShapeCommand(
          ref.floorId,
          ref.areaId,
          makeShape(input.shape, ref.id),
          "Replace footprint",
          ref.carpetId,
        ),
        data: { shapeId: ref.id },
      };
    },
  }),
  defineTool({
    name: "raise_walls",
    description:
      "Raises walls on currently bare room boundary pieces without replacing existing walls or openings. Returns the room's wallIds. Uses the house default height when omitted.",
    effect: "edit",
    input: Type.Object(
      {
        areaId: EntityIdInput,
        heightMm: Type.Optional(Type.Number({ minimum: 100, maximum: 10000 })),
        thicknessMm: Type.Optional(Type.Number({ minimum: 1, maximum: 2000 })),
        alignment: Type.Optional(
          Type.Union([Type.Literal("outside"), Type.Literal("inside"), Type.Literal("center")]),
        ),
      },
      { additionalProperties: false },
    ),
    output: Type.Object({ wallIds: Type.Array(Type.String()) }),
    examples: [{ input: { areaId: "a_example1", heightMm: 2400, thicknessMm: 200, alignment: "outside" } }],
    run: (input, house) => {
      const ref = indexEntities(house).get(input.areaId);
      if (ref?.kind !== "area") throw new AgentError("NOT_FOUND", "Room not found.");
      const boundary = boundaryPieces(ref.value);
      if (boundary.length === 0) throw new AgentError("EDIT_REJECTED", "The room has no wallable boundary.");
      const pieces = boundary.flatMap((piece) => barePieces(ref.value, piece));
      const { command, wallIds } = raiseWallsCommand(
        ref.floorId,
        ref.id,
        pieces,
        input.heightMm ?? effectiveWallHeightMm(house),
        undefined,
      );
      return {
        data: { wallIds: [...ref.value.walls.map((wall) => wall.id), ...wallIds] },
        command: defineCommand("Raise room walls", ref.floorId, (draft) => {
          const problem = command.apply(draft);
          if (problem !== undefined) return problem;
          const area = draft.floors
            .find((floor) => floor.id === ref.floorId)
            ?.areas.find((area) => area.id === ref.id);
          if (area === undefined) return "Room not found.";
          for (const wall of area.walls)
            if (wallIds.includes(wall.id)) {
              if (input.thicknessMm !== undefined) wall.thicknessMm = input.thicknessMm;
              if (input.alignment !== undefined) wall.alignment = input.alignment;
            }
          return undefined;
        }),
      };
    },
  }),
];
