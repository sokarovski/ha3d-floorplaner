// Working writes and explicit Save (D09): full-document PUT about 1.5 s after the last commit, serialized;
// an older acknowledgment never clears newer edits; failures keep local work and retry with backoff.
import type { StoreApi } from "zustand/vanilla";
import { ApiClientError } from "../../../api/apiError";
import type { HouseClient } from "../../../api/houseClient";
import type { DocumentState, SaveState } from "../stores/documentStore";
import type { HouseDocument } from "@shared/domain/schemas/house";
import { hasUnsavedRevision } from "./saveStatusText";

export const workingWriteDelayMs = 1500;
const maxRetryDelayMs = 30000;

export type SaveService = Readonly<{
  schedule: () => void;
  /** Writes pending changes now; resolves true when everything committed so far is on disk. */
  flush: () => Promise<boolean>;
  /** Explicit Save: flush, then create one Git revision. */
  saveRevision: (message?: string) => Promise<boolean>;
  /** After a conflict: overwrite the server copy with the local document. */
  overwriteServer: () => Promise<boolean>;
  retry: () => void;
  dispose: () => void;
}>;

/** Key-order-independent form of a JSON value, so a server round trip compares equal to what was sent. */
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => [key, canonical(entry)]),
  );
};

/** Same house content, ignoring the revision counter the server maintains. */
const sameContent = (a: HouseDocument, b: HouseDocument): boolean =>
  JSON.stringify(canonical({ ...a, revision: 0 })) === JSON.stringify(canonical({ ...b, revision: 0 }));

export const createSaveService = (
  houseId: string,
  client: HouseClient,
  documents: StoreApi<DocumentState>,
  saves: StoreApi<SaveState>,
): SaveService => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<boolean> | undefined;
  let retryDelay = 1000;
  let disposed = false;
  /** The last explicit Save failed while creating the Git revision (working writes are unaffected). */
  let revisionFailed = false;
  let lastRevisionMessage: string | undefined;

  const hasPending = (): boolean => documents.getState().generation !== saves.getState().writtenGeneration;

  const clearTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const writeOnce = async (): Promise<boolean> => {
    const { document, generation } = documents.getState();
    const { serverRevision } = saves.getState();
    const submitted = structuredClone(document);
    revisionFailed = false;
    saves.setState({ status: "saving", message: undefined });
    try {
      const revision = await client.saveDocument(houseId, submitted, serverRevision);
      retryDelay = 1000;
      saves.setState({ serverRevision: revision, writtenGeneration: generation });
      return true;
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.category === "conflict") {
        // A retry after a lost acknowledgement conflicts with its own earlier write: when the server copy is
        // exactly what was sent, adopt its revision and carry on silently.
        const server = await client.loadDocument(houseId).catch(() => undefined);
        if (server !== undefined && sameContent(server.document, submitted)) {
          retryDelay = 1000;
          saves.setState({ serverRevision: server.revision, writtenGeneration: generation });
          return true;
        }
        saves.setState({
          status: "conflict",
          message: "The house was changed elsewhere. Your edits are kept here.",
        });
        return false;
      }
      const message = error instanceof Error ? error.message : "The save failed.";
      saves.setState({ status: "failed", message: `${message} Your edits are kept; retrying.` });
      if (!disposed) {
        clearTimer();
        timer = setTimeout(() => {
          timer = undefined;
          void flush();
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, maxRetryDelayMs);
      }
      return false;
    }
  };

  // Baseline for "differs from the last revision": serialised once at open, after each revision and restore.
  saves.setState({ savedFingerprint: JSON.stringify(documents.getState().document) });

  // Runs only when writes settle (not per edit): one serialisation compared with the last revision's.
  const compareWithRevision = (): void => {
    const { document, generation } = documents.getState();
    const state = saves.getState();
    if (generation === state.savedGeneration || generation === state.matchesSavedGeneration) return;
    if (JSON.stringify(document) === state.savedFingerprint)
      saves.setState({ matchesSavedGeneration: generation });
  };

  const settleStatus = (): void => {
    const state = saves.getState();
    if (state.status === "conflict") return;
    // A failed working write keeps "failed" until a write succeeds; a failed revision creation is cleared
    // by any later settled flush (the document is written; the Save button still offers the revision).
    if (state.status === "failed" && !revisionFailed) return;
    revisionFailed = false;
    if (hasPending()) saves.setState({ status: "pending" });
    else {
      compareWithRevision();
      saves.setState({
        status: hasUnsavedRevision(saves.getState(), documents.getState().generation) ? "written" : "saved",
      });
    }
  };

  const flush = async (): Promise<boolean> => {
    clearTimer();
    if (saves.getState().status === "conflict") return false;
    if (running !== undefined) {
      await running;
      return hasPending() ? flush() : saves.getState().status !== "failed";
    }
    if (!hasPending()) {
      settleStatus();
      return true;
    }
    running = writeOnce();
    const ok = await running;
    running = undefined;
    if (ok && hasPending()) return flush();
    if (ok) settleStatus();
    return ok;
  };

  const saveRevision = async (message?: string): Promise<boolean> => {
    if (saves.getState().revisionInProgress) return false;
    lastRevisionMessage = message;
    saves.setState({ revisionInProgress: true });
    try {
      const written = await flush();
      if (!written) return false;
      const { document, generation } = documents.getState();
      const fingerprint = JSON.stringify(document);
      await client.createRevision(houseId, message);
      revisionFailed = false;
      saves.setState({
        savedGeneration: generation,
        savedFingerprint: fingerprint,
        matchesSavedGeneration: generation,
      });
      settleStatus();
      return true;
    } catch (error: unknown) {
      revisionFailed = true;
      saves.setState({
        status: "failed",
        message: error instanceof Error ? `Save failed: ${error.message}` : "Save failed.",
      });
      return false;
    } finally {
      saves.setState({ revisionInProgress: false });
    }
  };

  return {
    schedule: () => {
      if (saves.getState().status === "conflict") return;
      if (saves.getState().status !== "failed") saves.setState({ status: "pending" });
      clearTimer();
      timer = setTimeout(() => {
        timer = undefined;
        void flush();
      }, workingWriteDelayMs);
    },
    flush,
    saveRevision,
    overwriteServer: async () => {
      try {
        const current = await client.loadDocument(houseId);
        saves.setState({ serverRevision: current.revision, status: "pending", message: undefined });
        return await flush();
      } catch {
        saves.setState({ status: "conflict", message: "The server copy could not be read." });
        return false;
      }
    },
    retry: () => {
      retryDelay = 1000;
      if (revisionFailed && saves.getState().status === "failed") {
        // Retry now after a failed Save repeats the revision, not just the working write.
        saves.setState({ status: "pending", message: undefined });
        void saveRevision(lastRevisionMessage);
        return;
      }
      if (saves.getState().status === "failed") saves.setState({ status: "pending" });
      void flush();
    },
    dispose: () => {
      disposed = true;
      clearTimer();
    },
  };
};
