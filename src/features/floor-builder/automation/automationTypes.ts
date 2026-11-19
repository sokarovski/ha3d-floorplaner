import type { TSchema } from "typebox";
import type { Command } from "@shared/domain/commands/command";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { EditorSession } from "../services/editorSession";
import type { ImageClient } from "../../../api/imageClient";
import type { TemplateClient } from "../../../api/templateClient";

export type AutomationContext = Readonly<{
  session: EditorSession;
  images: ImageClient;
  templates: TemplateClient;
  onTemplatesChanged?: () => void;
}>;

export type AgentErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "EDIT_REJECTED"
  | "STALE_GENERATION"
  | "REQUEST_ID_REUSED"
  | "BUSY"
  | "SESSION_CLOSED"
  | "SAVE_FAILED"
  | "RESOURCE_FAILED"
  | "INTERNAL_ERROR";

export class AgentError extends Error {
  constructor(
    public readonly code: AgentErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type AgentResult =
  | Readonly<{ ok: true; sessionId: string; generation: number; data: unknown }>
  | Readonly<{
      ok: false;
      sessionId: string;
      generation: number;
      error: Readonly<{ code: AgentErrorCode; message: string }>;
    }>;

export type PreparedTool = Readonly<{
  data: unknown;
  command?: Command;
  action?: (ensureOpen: () => void) => unknown;
}>;

export type ToolMetadata = Readonly<{
  name: string;
  functionPath: string;
  description: string;
  effect: "read" | "edit" | "session" | "save" | "resource";
  inputSchema: TSchema;
  outputSchema: TSchema;
  examples: readonly Readonly<{ input: unknown }>[];
}>;

export type AgentTool = Readonly<{
  metadata: ToolMetadata;
  dataSchema: TSchema;
  prepare: (input: unknown, document: HouseDocument) => Promise<PreparedTool>;
}>;

export type AgentGuide = Readonly<{ id: string; title: string; markdown: string }>;
export type AgentFunction = (input?: unknown) => Promise<AgentResult>;
