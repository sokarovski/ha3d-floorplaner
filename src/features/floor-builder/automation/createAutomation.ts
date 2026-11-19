import Type from "typebox";
import { defineCommand, runCommand } from "@shared/domain/commands/command";
import type { Command } from "@shared/domain/commands/command";
import { compileValidator } from "@shared/domain/validation/ajv";
import { isSchemaNode } from "@shared/domain/schemas/schemaWalk";
import { AgentError } from "./automationTypes";
import type { AgentFunction, AgentGuide, AgentResult, AutomationContext } from "./automationTypes";
import { layoutTools } from "./layoutTools";
import { propertyTools } from "./propertyTools";
import { furnishingTools } from "./furnishingTools";
import { sessionTools } from "./sessionTools";
import { templateTools } from "./templateTools";
import { ChangeControl, defineTool } from "./toolDefinition";
import {
  createRequestLedger,
  fingerprintOf,
  isJson,
  resourceFingerprint,
  validateAgentInput,
} from "./bridgeCore";

export const createAutomation = (context: AutomationContext, guides: readonly AgentGuide[]) => {
  const { session } = context;
  const sessionId = crypto.randomUUID();
  let disposed = false;
  const ledger = createRequestLedger<AgentResult>();
  const base = [
    ...sessionTools(context),
    ...layoutTools(),
    ...propertyTools(context),
    ...furnishingTools(context),
    ...templateTools(context),
  ];
  const edits = base.filter((tool) => tool.metadata.effect === "edit");
  const batch = defineTool({
    name: "batch",
    description:
      "Applies up to 100 model-edit tools atomically as one undo step. Each operation has tool and input (without expectedGeneration/requestId). Use existing IDs; there is no generated-ID interpolation. Failure leaves document and history unchanged.",
    effect: "edit",
    input: Type.Object(
      {
        label: Type.String({ minLength: 1, maxLength: 120 }),
        operations: Type.Array(
          Type.Object(
            {
              tool: Type.Union(edits.map((tool) => Type.Literal(tool.metadata.name))),
              input: Type.Record(Type.String(), Type.Unknown()),
            },
            { additionalProperties: false },
          ),
          { minItems: 1, maxItems: 100 },
        ),
      },
      { additionalProperties: false },
    ),
    output: Type.Object({ results: Type.Array(Type.Unknown()) }),
    examples: [
      {
        input: {
          label: "Name rooms",
          operations: [
            {
              tool: "set_properties",
              input: { entityId: "a_example1", changes: [{ path: ["name"], value: "Kitchen" }] },
            },
          ],
        },
      },
    ],
    run: async (input, initial) => {
      let snapshot = initial;
      const commands: Command[] = [];
      const results: unknown[] = [];
      for (const operation of input.operations) {
        const tool = edits.find((candidate) => candidate.metadata.name === operation.tool);
        if (tool === undefined)
          throw new AgentError("INVALID_INPUT", "Only model-edit tools can be batched.");
        if ("expectedGeneration" in operation.input || "requestId" in operation.input)
          throw new AgentError(
            "INVALID_INPUT",
            "Batch operation inputs omit generation and request ID; set them on the batch itself.",
          );
        const prepared = await tool.prepare(operation.input, snapshot);
        if (prepared.command === undefined || prepared.action !== undefined)
          throw new AgentError("INTERNAL_ERROR", "A batch operation did not produce a model command.");
        const outcome = runCommand(snapshot, prepared.command);
        if (!outcome.ok) throw new AgentError("EDIT_REJECTED", outcome.message);
        if (!compileValidator(tool.dataSchema)(prepared.data))
          throw new AgentError("INTERNAL_ERROR", "A batch tool returned invalid output.");
        snapshot = outcome.document;
        commands.push(prepared.command);
        results.push({ tool: operation.tool, data: prepared.data });
      }
      const floorIds = new Set(commands.map((command) => command.floorId));
      return {
        data: { results },
        command: defineCommand(
          input.label,
          floorIds.size === 1 ? commands[0]?.floorId : undefined,
          (draft) => {
            for (const command of commands) {
              const problem = command.apply(draft);
              if (problem !== undefined) return problem;
            }
            return undefined;
          },
        ),
      };
    },
  });
  const registry = new Map([...base, batch].map((tool) => [tool.metadata.name, tool]));
  const failure = (error: unknown): AgentResult => ({
    ok: false,
    sessionId,
    generation: session.documents.getState().generation,
    error: {
      code: error instanceof AgentError ? error.code : "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "The tool failed.",
    },
  });
  const ensureOpen = (): void => {
    if (disposed || session.isDisposed())
      throw new AgentError(
        "SESSION_CLOSED",
        "This editor session is closed. Open a house and reacquire window.homeplan.",
      );
  };
  const ensureReady = (expectedGeneration: number): void => {
    ensureOpen();
    const state = session.documents.getState();
    if (state.generation !== expectedGeneration)
      throw new AgentError(
        "STALE_GENERATION",
        "The document changed. Call get_state and replan against its generation.",
      );
    const ui = session.ui.getState();
    if (
      state.preview !== undefined ||
      ui.tool !== "select" ||
      ui.toolOperationActive ||
      ui.placingLightId !== undefined
    )
      throw new AgentError(
        "BUSY",
        "Finish or cancel the manual operation and choose Select before agent changes.",
      );
    if (session.saves.getState().revisionInProgress)
      throw new AgentError("BUSY", "A revision save is already in progress.");
  };
  const invoke = async (name: string, rawInput: unknown = {}): Promise<AgentResult> => {
    try {
      ensureOpen();
      if (!isJson(rawInput))
        throw new AgentError("INVALID_INPUT", "Inputs must contain only finite JSON values and no cycles.");
      const input: unknown = structuredClone(rawInput);
      const tool = registry.get(name);
      if (tool === undefined)
        throw new AgentError("NOT_FOUND", `Unknown tool: ${name}. Call describe() for available tools.`);
      validateAgentInput(tool.metadata.inputSchema, input);
      const generation = session.documents.getState().generation;
      const document = session.documents.getState().document;
      if (tool.metadata.effect === "read") {
        const prepared = await tool.prepare(input, document);
        ensureOpen();
        if (!compileValidator(tool.dataSchema)(prepared.data))
          throw new AgentError("INTERNAL_ERROR", "Tool output does not match its schema.");
        return { ok: true, sessionId, generation, data: structuredClone(prepared.data) };
      }
      const controlValid = compileValidator(ChangeControl);
      if (!isSchemaNode(input)) throw new AgentError("INVALID_INPUT", "Input must be an object.");
      const control = { expectedGeneration: input.expectedGeneration, requestId: input.requestId };
      if (!controlValid(control))
        throw new AgentError("INVALID_INPUT", "Changing tools require expectedGeneration and requestId.");
      const fingerprint =
        tool.metadata.effect === "resource"
          ? await resourceFingerprint({ name, input })
          : fingerprintOf({ name, input });
      const replayed = ledger.replay(control.requestId, fingerprint);
      if (replayed !== undefined) return await replayed;
      ensureReady(control.expectedGeneration);
      return await ledger.run(control.requestId, fingerprint, async (): Promise<AgentResult> => {
        try {
          const prepared = await tool.prepare(input, document);
          ensureReady(control.expectedGeneration);
          if (prepared.action === undefined && !compileValidator(tool.dataSchema)(prepared.data))
            throw new AgentError("INTERNAL_ERROR", "Tool output does not match its schema.");
          let data = prepared.data;
          if (prepared.command !== undefined) {
            const outcome = session.execute(prepared.command);
            if (!outcome.ok) throw new AgentError("EDIT_REJECTED", outcome.message);
          }
          if (prepared.action !== undefined) data = await prepared.action(ensureOpen);
          ensureOpen();
          if (!compileValidator(tool.dataSchema)(data))
            throw new AgentError("INTERNAL_ERROR", "Tool output does not match its schema.");
          return {
            ok: true,
            sessionId,
            generation: session.documents.getState().generation,
            data: structuredClone(data),
          };
        } catch (error: unknown) {
          return failure(error);
        }
      });
    } catch (error: unknown) {
      return failure(error);
    }
  };
  const tools: Readonly<Record<string, AgentFunction>> = Object.freeze(
    Object.fromEntries([...registry.keys()].map((name) => [name, (input?: unknown) => invoke(name, input)])),
  );
  const api = Object.freeze({
    apiVersion: "1",
    describe: () => {
      ensureOpen();
      return structuredClone({
        apiVersion: "1",
        level: "editor",
        sessionId,
        houseId: session.houseId,
        instructions:
          "Read docs.read('getting-started'). Call tools.get_state() before editing. Changing tools require expectedGeneration and a unique requestId. Execute functions in this editor page's JavaScript context; Homeplan handles backend requests.",
        docs: guides.map(({ id, title }) => ({
          id,
          title,
          functionPath: `window.homeplan.docs.read(${JSON.stringify(id)})`,
        })),
        tools: [...registry.values()].map((tool) => tool.metadata),
      });
    },
    docs: Object.freeze({
      read: (id: string): string => {
        ensureOpen();
        const guide = guides.find((candidate) => candidate.id === id);
        if (guide === undefined)
          throw new AgentError("NOT_FOUND", "Guide not found. Call describe() for document IDs.");
        return guide.markdown;
      },
    }),
    tools,
    callTool: invoke,
  });
  return {
    api,
    dispose: () => {
      disposed = true;
      ledger.clear();
    },
  };
};

export type HomeplanAutomation = ReturnType<typeof createAutomation>["api"];
