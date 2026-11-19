import Type from "typebox";
import { House } from "@shared/domain/schemas/house";
import { ImageEntry } from "@shared/contracts/images";
import { TemplateListItem } from "@shared/contracts/templates";
import { indexEntities } from "@shared/domain/house/entityIndex";
import { builtInPresets } from "@shared/domain/house/defaults";
import { activateFloor, requestFrame, returnToOverview } from "../services/treeActions";
import { floorGeometryIssues, describeIssue, itemsAboveRoofOf, roofIssuesOf } from "../services/floorIssues";
import { boundaryPieces } from "../tools/planGeometry";
import { AgentError } from "./automationTypes";
import type { AutomationContext } from "./automationTypes";
import { defineTool, EmptyInput } from "./toolDefinition";
import { EntityIdInput } from "./shapeInput";

const savedState = (context: AutomationContext) => ({ ...context.session.saves.getState() });

export const sessionTools = (context: AutomationContext) => [
  defineTool({
    name: "get_state",
    description:
      "Returns a detached snapshot of the open house, active floor, whether the whole-house overview of a multi-floor house is shown (houseOverview), selection, tool, save state, and undo/redo counts. The result generation is the baseline for the next changing call.",
    effect: "read",
    input: EmptyInput,
    output: Type.Object({
      house: House,
      activeFloorId: Type.String(),
      houseOverview: Type.Boolean(),
      selection: Type.Array(Type.String()),
      tool: Type.String(),
      save: Type.Unknown(),
      undoCount: Type.Integer(),
      redoCount: Type.Integer(),
    }),
    examples: [{ input: {} }],
    run: (_input, house) => ({
      data: {
        house,
        activeFloorId: context.session.ui.getState().activeFloorId,
        houseOverview: context.session.ui.getState().houseOverview,
        selection: context.session.ui.getState().selection,
        tool: context.session.ui.getState().tool,
        save: savedState(context),
        undoCount: context.session.history.getState().past.length,
        redoCount: context.session.history.getState().future.length,
      },
    }),
  }),
  defineTool({
    name: "get_geometry",
    description:
      "Returns derived boundary pieces, stable edge keys, and wall/opening geometry issues (and items above the roof) for a floor. Boundary positions are floor-local; distances along edges are millimetres. Derived results are never persisted.",
    effect: "read",
    input: Type.Object({ floorId: EntityIdInput }, { additionalProperties: false }),
    output: Type.Object({ rooms: Type.Array(Type.Unknown()), issues: Type.Array(Type.Unknown()) }),
    examples: [{ input: { floorId: "f_example1" } }],
    run: ({ floorId }, house) => {
      const floor = house.floors.find((candidate) => candidate.id === floorId);
      if (floor === undefined) throw new AgentError("NOT_FOUND", "Floor not found.");
      return {
        data: {
          rooms: floor.areas.map((area) => ({ areaId: area.id, boundaries: boundaryPieces(area) })),
          issues: [
            ...floorGeometryIssues(house, floorId).map((issue) => ({
              ...issue,
              message: describeIssue(issue),
            })),
            // Phase 19.2: doors, windows, objects and lights reaching above the roof's underside.
            ...itemsAboveRoofOf(house, floorId).map((id) => ({
              kind: "aboveRoof",
              id,
              message: "This reaches above the roof. Lower it, move it, or raise the roof.",
            })),
            // Phase 19.3: holes and roof windows that no longer fit their roof.
            ...roofIssuesOf(house, floorId).map((issue) => ({
              kind: "roofItem",
              id: issue.id,
              message: issue.message,
            })),
          ],
        },
      };
    },
  }),
  defineTool({
    name: "list_templates",
    description:
      "Lists built-in and house glTF templates with IDs, contracts, versions, and labels. Homeplan performs the backend request.",
    effect: "read",
    input: EmptyInput,
    output: Type.Array(TemplateListItem),
    examples: [{ input: {} }],
    run: async () => ({ data: await context.templates.list(context.session.houseId) }),
  }),
  defineTool({
    name: "list_images",
    description:
      "Lists server-owned images uploaded to this house. Use their IDs in surface materials; the agent does not call asset endpoints directly. Built-in textures (builtinimg_… IDs) are not listed; they come with the built-in textured presets (list_material_presets).",
    effect: "read",
    input: EmptyInput,
    output: Type.Array(ImageEntry),
    examples: [{ input: {} }],
    run: async () => ({ data: await context.images.list(context.session.houseId) }),
  }),
  defineTool({
    name: "list_material_presets",
    description:
      "Returns built-in and house material presets. Copy a material into an editable surface property using set_properties.",
    effect: "read",
    input: EmptyInput,
    output: Type.Array(Type.Unknown()),
    examples: [{ input: {} }],
    run: (_input, house) => ({ data: [...builtInPresets, ...house.materialPresets] }),
  }),
  defineTool({
    name: "set_view",
    description:
      "Switches the active floor and Top/3D view, returns to that floor's Overview (leaving the whole-house overview), optionally selects entities on that floor, and frames the floor or selection. Does not create an undo entry.",
    effect: "session",
    input: Type.Object(
      {
        floorId: EntityIdInput,
        mode: Type.Union([Type.Literal("top"), Type.Literal("3d")]),
        selection: Type.Optional(Type.Array(EntityIdInput, { uniqueItems: true })),
      },
      { additionalProperties: false },
    ),
    output: Type.Object({ floorId: Type.String(), mode: Type.String() }),
    examples: [{ input: { floorId: "f_example1", mode: "top" } }],
    run: (input, house) => {
      if (!house.floors.some((floor) => floor.id === input.floorId))
        throw new AgentError("NOT_FOUND", "Floor not found.");
      const entities = indexEntities(house);
      const selection = input.selection ?? [];
      if (
        selection.some((id) => {
          const ref = entities.get(id);
          return ref === undefined || ref.kind === "house" || ref.floorId !== input.floorId;
        })
      )
        throw new AgentError("INVALID_INPUT", "Selected entities must belong to the requested floor.");
      return {
        data: { floorId: input.floorId, mode: input.mode },
        action: () => {
          returnToOverview(context.session);
          activateFloor(context.session, input.floorId);
          context.session.ui.setState({ selection, viewMode: input.mode });
          requestFrame(context.session, selection.length === 0 ? "floor" : "selection");
          return { floorId: input.floorId, mode: input.mode };
        },
      };
    },
  }),
  ...(["undo", "redo"] as const).map((name) =>
    defineTool({
      name,
      description: `${name === "undo" ? "Undoes" : "Redoes"} the most recent model operation, including manual edits. One batch is one step.`,
      effect: "session",
      input: EmptyInput,
      output: Type.Object({ changed: Type.Boolean() }),
      examples: [{ input: {} }],
      run: () => ({ data: { changed: false }, action: () => ({ changed: context.session[name]() }) }),
    }),
  ),
  defineTool({
    name: "save",
    description:
      "Flushes full-document working writes, then creates an explicit Git revision through Homeplan's save service. Backend revision conflicts preserve local edits and return SAVE_FAILED. No overwrite is performed.",
    effect: "save",
    input: Type.Object(
      { message: Type.Optional(Type.String({ maxLength: 500 })) },
      { additionalProperties: false },
    ),
    output: Type.Unknown(),
    examples: [{ input: { message: "Create measured rooms" } }],
    run: (input) => ({
      data: {},
      action: async () => {
        if (!(await context.session.save.saveRevision(input.message)))
          throw new AgentError(
            "SAVE_FAILED",
            context.session.saves.getState().message ?? "The revision could not be saved.",
          );
        return savedState(context);
      },
    }),
  }),
];
