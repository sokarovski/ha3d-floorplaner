// Shared mechanics of the window.homeplan bridges (spec/architecture/browser-automation.md): JSON input
// checks, schema validation, request fingerprints, session-local idempotent retries, and resource-error
// mapping. The editor bridge (createAutomation) and the Houses bridge (houses/automation) both use them.
import type { TSchema } from "typebox";
import { isSchemaNode } from "@shared/domain/schemas/schemaWalk";
import { compileValidator, toIssues } from "@shared/domain/validation/ajv";
import { ApiClientError } from "../../../api/apiError";
import { AgentError } from "./automationTypes";

/** Finite JSON values without cycles, plain objects and arrays only. */
export const isJson = (value: unknown, ancestors = new Set<unknown>()): boolean => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid =
    (Array.isArray(value) ||
      Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null) &&
    Object.values(value).every((entry: unknown) => isJson(entry, ancestors));
  ancestors.delete(value);
  return valid;
};

/** A canonical (key-sorted) serialization used to recognize identical retries. */
export const fingerprintOf = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map((entry: unknown) => fingerprintOf(entry)).join(",")}]`;
  if (isSchemaNode(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${fingerprintOf(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
};

/** SHA-256 of the fingerprint, so a retry cache holds hashes rather than uploaded contents. */
export const resourceFingerprint = async (value: unknown): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprintOf(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** Validates a tool input against its catalog schema; the first issue becomes an INVALID_INPUT error. */
export const validateAgentInput = (schema: TSchema, input: unknown): void => {
  const validate = compileValidator(schema);
  if (!validate(input)) {
    const issue = toIssues(validate.errors)[0];
    throw new AgentError("INVALID_INPUT", `${issue?.pointer ?? "/"}: ${issue?.message ?? "Invalid input"}`);
  }
};

/** Maps resource-client failures to structured agent errors; `hint` tells the agent how to check an uncertain outcome. */
export const resourceCall = async <T>(run: () => Promise<T>, fallback: string, hint: string): Promise<T> => {
  try {
    return await run();
  } catch (error: unknown) {
    if (error instanceof AgentError) throw error;
    if (error instanceof ApiClientError) {
      if (error.category === "notFound") throw new AgentError("NOT_FOUND", error.message);
      if (["validation", "tooLarge", "unsupportedVersion"].includes(error.category)) {
        const issue = Object.entries(error.fieldErrors())[0];
        throw new AgentError(
          "INVALID_INPUT",
          issue === undefined ? error.message : `${error.message} ${issue[0]}: ${issue[1]}`,
        );
      }
    }
    const message = error instanceof Error ? error.message : fallback;
    throw new AgentError("RESOURCE_FAILED", `${message} ${hint}`);
  }
};

const maxRemembered = 200;

/**
 * One changing call at a time, with session-local idempotent retries: an identical retry of a remembered
 * successful request (or of the running one) returns its result; a reused ID with other arguments is rejected.
 */
export const createRequestLedger = <R extends Readonly<{ ok: boolean }>>() => {
  const completed = new Map<string, Readonly<{ fingerprint: string; result: R }>>();
  let running: Readonly<{ requestId: string; fingerprint: string; promise: Promise<R> }> | undefined;
  return {
    /**
     * The remembered or in-flight result for this request, or undefined when it is new. Synchronous, so a
     * caller can check and then start `run` without another call slipping in. Throws BUSY/REQUEST_ID_REUSED.
     */
    replay: (requestId: string, fingerprint: string): Promise<R> | undefined => {
      const previous = completed.get(requestId);
      if (previous !== undefined) {
        if (previous.fingerprint !== fingerprint)
          throw new AgentError("REQUEST_ID_REUSED", "Use a new requestId for a different operation.");
        return Promise.resolve(structuredClone(previous.result));
      }
      if (running === undefined) return undefined;
      if (running.requestId === requestId) {
        if (running.fingerprint !== fingerprint)
          throw new AgentError("REQUEST_ID_REUSED", "Use a new requestId for a different operation.");
        return running.promise.then((result) => structuredClone(result));
      }
      throw new AgentError("BUSY", "Another agent operation is running. Await it before the next change.");
    },
    /**
     * Runs a new request (call it synchronously after `replay`); successful results are remembered for the
     * most recent 200 request IDs.
     */
    run: async (requestId: string, fingerprint: string, work: () => Promise<R>): Promise<R> => {
      const promise = work().then((result) => {
        if (result.ok) {
          completed.set(requestId, { fingerprint, result });
          if (completed.size > maxRemembered) {
            const oldest = completed.keys().next().value;
            if (oldest !== undefined) completed.delete(oldest);
          }
        }
        return result;
      });
      running = { requestId, fingerprint, promise };
      try {
        return structuredClone(await promise);
      } finally {
        running = undefined;
      }
    },
    clear: (): void => {
      completed.clear();
    },
  };
};

/** The public shape both bridges share; `describe().level` tells the agent which one is mounted. */
export type HomeplanBridge = Readonly<{
  apiVersion: string;
  describe: () => unknown;
  docs: Readonly<{ read: (id: string) => string }>;
  tools: Readonly<Record<string, (input?: unknown) => Promise<unknown>>>;
  callTool: (name: string, input?: unknown) => Promise<unknown>;
}>;

declare global {
  var homeplan: HomeplanBridge | undefined;
}
