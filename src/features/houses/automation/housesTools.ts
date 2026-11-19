// The Houses-screen tool registry (spec/architecture/browser-automation.md#houses-level-bridge): each tool owns its
// description, schemas, examples and handler, and delegates to the typed house resource client.
import Type from "typebox";
import type { Static, TObject, TSchema } from "typebox";
import { DisplayName, IdString } from "@shared/contracts/common";
import {
  HouseListResponse,
  RenameHouseResponse,
  TrashListResponse,
  ValidHouseCard,
} from "@shared/contracts/houses";
import type { ValidHouseCardValue } from "@shared/contracts/houses";
import { compileValidator, toIssues } from "@shared/domain/validation/ajv";
import type { HouseClient } from "../../../api/houseClient";
import { AgentError } from "../../floor-builder/automation/automationTypes";
import { resourceCall } from "../../floor-builder/automation/bridgeCore";
import { EmptyInput } from "../../floor-builder/automation/toolDefinition";

export type HousesAutomationContext = Readonly<{
  houses: HouseClient;
  /** Called after a successful change so the visible lists refresh. */
  onChanged: () => void;
  /** Navigates to the Floor Builder for a house; the Houses bridge is then disposed. */
  onOpen: (houseId: string) => void;
}>;

export type HousesToolMetadata = Readonly<{
  name: string;
  functionPath: string;
  description: string;
  effect: "read" | "resource" | "navigate";
  inputSchema: TSchema;
  outputSchema: TSchema;
  examples: readonly Readonly<{ input: unknown }>[];
}>;

export type HousesTool = Readonly<{
  metadata: HousesToolMetadata;
  dataSchema: TSchema;
  run: (input: unknown) => Promise<unknown>;
}>;

export const HousesRequestControl = Type.Object({
  requestId: Type.String({
    minLength: 1,
    maxLength: 128,
    description: "Unique operation ID; reuse only for an identical retry.",
  }),
});

export const housesResultSchema = (data: TSchema): TSchema =>
  Type.Union([
    Type.Object({ ok: Type.Literal(true), sessionId: Type.String(), data }, { additionalProperties: false }),
    Type.Object(
      {
        ok: Type.Literal(false),
        sessionId: Type.String(),
        error: Type.Object({ code: Type.String(), message: Type.String() }, { additionalProperties: false }),
      },
      { additionalProperties: false },
    ),
  ]);

const defineHousesTool = <S extends TObject>(
  definition: Readonly<{
    name: string;
    description: string;
    effect: HousesToolMetadata["effect"];
    input: S;
    output: TSchema;
    examples: readonly Readonly<{ input: Static<S> }>[];
    run: (input: Static<S>) => Promise<unknown>;
  }>,
): HousesTool => {
  const changing = definition.effect === "resource";
  const validate = compileValidator(definition.input);
  return {
    metadata: {
      name: definition.name,
      functionPath: `window.homeplan.tools.${definition.name}`,
      description: definition.description,
      effect: definition.effect,
      inputSchema: changing
        ? Type.Object(
            { ...definition.input.properties, ...HousesRequestControl.properties },
            { additionalProperties: false },
          )
        : definition.input,
      outputSchema: housesResultSchema(definition.output),
      examples: definition.examples.map(({ input }) => ({
        input: changing ? { ...input, requestId: `example-${definition.name}` } : input,
      })),
    },
    dataSchema: definition.output,
    run: async (input) => {
      if (typeof input !== "object" || input === null || Array.isArray(input))
        throw new AgentError("INVALID_INPUT", "Tool input must be a JSON object.");
      const args = Object.fromEntries(
        Object.entries(input).filter(([key]) => !changing || key !== "requestId"),
      );
      if (!validate(args)) {
        const issue = toIssues(validate.errors)[0];
        throw new AgentError(
          "INVALID_INPUT",
          `${issue?.pointer ?? "/"}: ${issue?.message ?? "Invalid input"}`,
        );
      }
      return await definition.run(args);
    },
  };
};

const housesCall = async <T>(run: () => Promise<T>): Promise<T> =>
  resourceCall(
    run,
    "The house request failed.",
    "Call list_houses/list_trash before retrying an uncertain server result.",
  );

const HouseIdInput = Type.Object({ houseId: IdString }, { additionalProperties: false });
const HouseIdOutput = Type.Object({ houseId: IdString }, { additionalProperties: false });
const HouseOutput = Type.Object({ house: ValidHouseCard }, { additionalProperties: false });

/** The current valid card for a house in the list (not the trash), or a structured error. */
const findHouse = async (context: HousesAutomationContext, houseId: string): Promise<ValidHouseCardValue> => {
  const card = (await housesCall(() => context.houses.list())).find((entry) => entry.id === houseId);
  if (card === undefined)
    throw new AgentError("NOT_FOUND", `No house ${houseId} in the list. Call list_houses (or list_trash).`);
  if (card.status !== "ok")
    throw new AgentError("INVALID_INPUT", `House ${houseId} has invalid metadata: ${card.problem.message}`);
  return card;
};

export const housesTools = (context: HousesAutomationContext): readonly HousesTool[] => [
  defineHousesTool({
    name: "list_houses",
    description:
      "Lists every house card (not the trash), most recently modified first. A valid card has status 'ok', id, name, floorCount, revision and modifiedAt; a folder with unreadable metadata has status 'invalid' and a problem.",
    effect: "read",
    input: EmptyInput,
    output: HouseListResponse,
    examples: [{ input: {} }],
    run: async () => ({ houses: await housesCall(() => context.houses.list()) }),
  }),
  defineHousesTool({
    name: "create_house",
    description:
      "Creates a new house with its first floor (Etage1) and returns its card. The visible list refreshes; the editor is not opened (use open_house).",
    effect: "resource",
    input: Type.Object({ name: DisplayName }, { additionalProperties: false }),
    output: HouseOutput,
    examples: [{ input: { name: "Garden cottage" } }],
    run: async ({ name }) => ({ house: await housesCall(() => context.houses.create(name)) }),
  }),
  defineHousesTool({
    name: "clone_house",
    description:
      "Copies a house's last saved state (images and house templates included, Git history not) into a new house named name, or '<name> (copy)' by default. The original is not changed.",
    effect: "resource",
    input: Type.Object(
      { houseId: IdString, name: Type.Optional(DisplayName) },
      { additionalProperties: false },
    ),
    output: HouseOutput,
    examples: [{ input: { houseId: "h_example1" } }, { input: { houseId: "h_example1", name: "Variant B" } }],
    run: async ({ houseId, name }) => ({
      house: await housesCall(() => context.houses.clone(houseId, name)),
    }),
  }),
  defineHousesTool({
    name: "rename_house",
    description:
      "Changes a house's display name (its ID and folder stay the same). Uses the house's current revision; if it changed concurrently, call list_houses and retry with a new requestId.",
    effect: "resource",
    input: Type.Object({ houseId: IdString, name: DisplayName }, { additionalProperties: false }),
    output: RenameHouseResponse,
    examples: [{ input: { houseId: "h_example1", name: "Lake house" } }],
    run: async ({ houseId, name }) => {
      const card = await findHouse(context, houseId);
      return await housesCall(() => context.houses.rename(houseId, name, card.revision));
    },
  }),
  defineHousesTool({
    name: "trash_house",
    description:
      "Moves a house to the trash (restorable with restore_house). There is no permanent delete tool; only the user can empty the trash. Trash only houses the user asked about.",
    effect: "resource",
    input: HouseIdInput,
    output: HouseIdOutput,
    examples: [{ input: { houseId: "h_example1" } }],
    run: async ({ houseId }) => {
      await housesCall(() => context.houses.trash(houseId));
      return { houseId };
    },
  }),
  defineHousesTool({
    name: "list_trash",
    description: "Lists trashed houses with their cards and trashedAt, most recently trashed first.",
    effect: "read",
    input: EmptyInput,
    output: TrashListResponse,
    examples: [{ input: {} }],
    run: async () => ({ houses: await housesCall(() => context.houses.listTrash()) }),
  }),
  defineHousesTool({
    name: "restore_house",
    description: "Restores a trashed house to the house list.",
    effect: "resource",
    input: HouseIdInput,
    output: HouseIdOutput,
    examples: [{ input: { houseId: "h_example1" } }],
    run: async ({ houseId }) => {
      await housesCall(() => context.houses.restore(houseId));
      return { houseId };
    },
  }),
  defineHousesTool({
    name: "open_house",
    description:
      "Opens a house in the Floor Builder. This Houses bridge then closes; wait until window.homeplan.describe().level === 'editor' and reacquire window.homeplan before editing.",
    effect: "navigate",
    input: HouseIdInput,
    output: HouseIdOutput,
    examples: [{ input: { houseId: "h_example1" } }],
    run: async ({ houseId }) => {
      await findHouse(context, houseId);
      context.onOpen(houseId);
      return { houseId };
    },
  }),
];
