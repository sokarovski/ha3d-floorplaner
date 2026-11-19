// The Houses-screen window.homeplan bridge (spec/architecture/browser-automation.md#houses-level-bridge).
// It shares JSON checks, validation, fingerprints and the idempotent request ledger with the editor bridge.
import { createUuid } from "@shared/domain/ids";
import { compileValidator } from "@shared/domain/validation/ajv";
import { AgentError } from "../../floor-builder/automation/automationTypes";
import type { AgentErrorCode, AgentGuide } from "../../floor-builder/automation/automationTypes";
import {
  createRequestLedger,
  fingerprintOf,
  isJson,
  validateAgentInput,
} from "../../floor-builder/automation/bridgeCore";
import { housesTools } from "./housesTools";
import type { HousesAutomationContext } from "./housesTools";

export type HousesResult =
  | Readonly<{ ok: true; sessionId: string; data: unknown }>
  | Readonly<{ ok: false; sessionId: string; error: Readonly<{ code: AgentErrorCode; message: string }> }>;

export type HousesFunction = (input?: unknown) => Promise<HousesResult>;

export const createHousesAutomation = (context: HousesAutomationContext, guides: readonly AgentGuide[]) => {
  const sessionId = createUuid();
  let disposed = false;
  const ledger = createRequestLedger<HousesResult>();
  const registry = new Map(housesTools(context).map((tool) => [tool.metadata.name, tool]));
  const failure = (error: unknown): HousesResult => ({
    ok: false,
    sessionId,
    error: {
      code: error instanceof AgentError ? error.code : "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "The tool failed.",
    },
  });
  const ensureOpen = (): void => {
    if (disposed)
      throw new AgentError(
        "SESSION_CLOSED",
        "The Houses screen is closed. Reacquire window.homeplan and check describe().level.",
      );
  };
  const invoke = async (name: string, rawInput: unknown = {}): Promise<HousesResult> => {
    try {
      ensureOpen();
      if (!isJson(rawInput))
        throw new AgentError("INVALID_INPUT", "Inputs must contain only finite JSON values and no cycles.");
      const input: unknown = structuredClone(rawInput);
      const tool = registry.get(name);
      if (tool === undefined)
        throw new AgentError("NOT_FOUND", `Unknown tool: ${name}. Call describe() for available tools.`);
      validateAgentInput(tool.metadata.inputSchema, input);
      const checkOutput = (data: unknown): void => {
        if (!compileValidator(tool.dataSchema)(data))
          throw new AgentError("INTERNAL_ERROR", "Tool output does not match its schema.");
      };
      if (tool.metadata.effect !== "resource") {
        const data = await tool.run(input);
        // A navigation disposes this bridge once the Floor Builder mounts; its result is still reported.
        if (tool.metadata.effect === "read") ensureOpen();
        checkOutput(data);
        return { ok: true, sessionId, data: structuredClone(data) };
      }
      const requestId =
        typeof input === "object" && input !== null && "requestId" in input ? input.requestId : undefined;
      if (typeof requestId !== "string")
        throw new AgentError("INVALID_INPUT", "Changing tools require a requestId.");
      const fingerprint = fingerprintOf({ name, input });
      const replayed = ledger.replay(requestId, fingerprint);
      if (replayed !== undefined) return await replayed;
      return await ledger.run(requestId, fingerprint, async (): Promise<HousesResult> => {
        try {
          const data = await tool.run(input);
          ensureOpen();
          checkOutput(data);
          context.onChanged();
          return { ok: true, sessionId, data: structuredClone(data) };
        } catch (error: unknown) {
          return failure(error);
        }
      });
    } catch (error: unknown) {
      return failure(error);
    }
  };
  const tools: Readonly<Record<string, HousesFunction>> = Object.freeze(
    Object.fromEntries([...registry.keys()].map((name) => [name, (input?: unknown) => invoke(name, input)])),
  );
  const api = Object.freeze({
    apiVersion: "1",
    describe: () => {
      ensureOpen();
      return structuredClone({
        apiVersion: "1",
        level: "houses",
        sessionId,
        instructions:
          "You are on the Houses screen (no house is open). Read docs.read('getting-started'). Use list_houses before acting; change only houses the user asked about. Changing tools require a unique requestId. open_house navigates to the Floor Builder: then wait until window.homeplan.describe().level === 'editor'.",
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

export type HousesAutomation = ReturnType<typeof createHousesAutomation>["api"];
