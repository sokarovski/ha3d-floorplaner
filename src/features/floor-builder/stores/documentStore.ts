// The one authoritative editable house document of an editor session, plus its history and save slices.
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import type { HistoryEntry } from "@shared/domain/commands/command";
import type { HouseDocument } from "@shared/domain/schemas/house";

export type DocumentState = Readonly<{
  document: HouseDocument;
  /** Increments on every committed change (command, undo, redo, restore). */
  generation: number;
  /**
   * A tool's uncommitted result (owner, Phase 5 follow-up: moves and turns show live): the viewport draws it
   * instead of the document while the operation runs. Never saved, never in history.
   */
  preview: HouseDocument | undefined;
}>;

export type HistoryState = Readonly<{
  past: readonly HistoryEntry[];
  future: readonly HistoryEntry[];
}>;

export type SaveStatus = "saved" | "written" | "pending" | "saving" | "failed" | "conflict";

export type SaveState = Readonly<{
  status: SaveStatus;
  /** Server document revision acknowledged for the last successful working write. */
  serverRevision: number;
  /** Generation contained in the last acknowledged write. */
  writtenGeneration: number;
  /** Generation contained in the last Git revision (explicit Save). */
  savedGeneration: number;
  /** Serialised document of the last Git revision (or of the document when the session opened); compared lazily. */
  savedFingerprint: string | undefined;
  /** Newest generation whose content is known to equal the last revision (set when the save state settles). */
  matchesSavedGeneration: number;
  revisionInProgress: boolean;
  message: string | undefined;
}>;

export const createDocumentStore = (document: HouseDocument): StoreApi<DocumentState> =>
  createStore<DocumentState>(() => ({ document, generation: 0, preview: undefined }));

export const createHistoryStore = (): StoreApi<HistoryState> =>
  createStore<HistoryState>(() => ({ past: [], future: [] }));

export const createSaveStore = (serverRevision: number): StoreApi<SaveState> =>
  createStore<SaveState>(() => ({
    status: "saved",
    serverRevision,
    writtenGeneration: 0,
    savedGeneration: 0,
    savedFingerprint: undefined,
    matchesSavedGeneration: 0,
    revisionInProgress: false,
    message: undefined,
  }));

export const maxHistoryEntries = 200;
