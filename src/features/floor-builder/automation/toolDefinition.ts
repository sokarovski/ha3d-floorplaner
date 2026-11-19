import Type from "typebox";
import type { Static, TObject, TSchema } from "typebox";
import { isSchemaNode } from "@shared/domain/schemas/schemaWalk";
import type { HouseDocument } from "@shared/domain/schemas/house";
import { compileValidator, toIssues } from "@shared/domain/validation/ajv";
import { AgentError } from "./automationTypes";
import type { AgentTool, PreparedTool, ToolMetadata } from "./automationTypes";

export const EmptyInput = Type.Object({}, { additionalProperties: false });
export const ChangeControl = Type.Object({
  expectedGeneration: Type.Integer({
    minimum: 0,
    description: "Generation from get_state or the last result.",
  }),
  requestId: Type.String({
    minLength: 1,
    maxLength: 128,
    description: "Unique operation ID; reuse only for an identical retry.",
  }),
});

export const resultSchema = (data: TSchema): TSchema =>
  Type.Union([
    Type.Object(
      { ok: Type.Literal(true), sessionId: Type.String(), generation: Type.Integer({ minimum: 0 }), data },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        ok: Type.Literal(false),
        sessionId: Type.String(),
        generation: Type.Integer({ minimum: 0 }),
        error: Type.Object({ code: Type.String(), message: Type.String() }, { additionalProperties: false }),
      },
      { additionalProperties: false },
    ),
  ]);

export const defineTool = <S extends TObject>(
  definition: Readonly<{
    name: string;
    description: string;
    effect: ToolMetadata["effect"];
    input: S;
    output: TSchema;
    examples: readonly Readonly<{ input: unknown }>[];
    run: (input: Static<S>, document: HouseDocument) => PreparedTool | Promise<PreparedTool>;
  }>,
): AgentTool => {
  const changing = definition.effect !== "read";
  const validate = compileValidator(definition.input);
  return {
    metadata: {
      name: definition.name,
      functionPath: `window.homeplan.tools.${definition.name}`,
      description: definition.description,
      effect: definition.effect,
      inputSchema: changing
        ? Type.Object(
            { ...definition.input.properties, ...ChangeControl.properties },
            { additionalProperties: false },
          )
        : definition.input,
      outputSchema: resultSchema(definition.output),
      examples: definition.examples.map(({ input }) => ({
        input:
          changing && isSchemaNode(input)
            ? { ...input, expectedGeneration: 0, requestId: `example-${definition.name}` }
            : input,
      })),
    },
    dataSchema: definition.output,
    prepare: async (input, document) => {
      if (!isSchemaNode(input)) throw new AgentError("INVALID_INPUT", "Tool input must be a JSON object.");
      const { expectedGeneration: _generation, requestId: _requestId, ...args } = input;
      const value = changing ? args : input;
      if (!validate(value)) {
        const issue = toIssues(validate.errors)[0];
        throw new AgentError(
          "INVALID_INPUT",
          `${issue?.pointer ?? "/"}: ${issue?.message ?? "Invalid input"}`,
        );
      }
      return await definition.run(value, document);
    },
  };
};
