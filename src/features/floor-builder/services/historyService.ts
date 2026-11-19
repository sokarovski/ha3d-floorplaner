// Pure history operations: record (clears redo, bounded), undo, redo (spec/builder/undo-redo.md).
import { applyPatches } from "immer";
import type { HistoryEntry } from "@shared/domain/commands/command";
import { validateHouseDocument } from "@shared/domain/commands/houseRules";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { HistoryState } from "../stores/documentStore";
import { maxHistoryEntries } from "../stores/documentStore";

export const recordEntry = (history: HistoryState, entry: HistoryEntry): HistoryState => ({
  past: [...history.past, entry].slice(-maxHistoryEntries),
  future: [],
});

export type ReplayResult =
  | Readonly<{ ok: true; document: HouseDocument; history: HistoryState; entry: HistoryEntry }>
  | Readonly<{ ok: false; message: string }>;

const replay = (document: HouseDocument, patches: HistoryEntry["forward"]): HouseDocument | string => {
  try {
    const next = applyPatches(document, [...patches]);
    // A fault the loaded house already had must not block undo/redo (only new faults are refused).
    return validateHouseDocument(next, document) ?? next;
  } catch {
    return "This step can no longer be applied.";
  }
};

export const undoEntry = (document: HouseDocument, history: HistoryState): ReplayResult => {
  const entry = history.past[history.past.length - 1];
  if (entry === undefined) return { ok: false, message: "Nothing to undo." };
  const next = replay(document, entry.inverse);
  if (typeof next === "string") return { ok: false, message: next };
  return {
    ok: true,
    document: next,
    entry,
    history: { past: history.past.slice(0, -1), future: [entry, ...history.future] },
  };
};

export const redoEntry = (document: HouseDocument, history: HistoryState): ReplayResult => {
  const entry = history.future[0];
  if (entry === undefined) return { ok: false, message: "Nothing to redo." };
  const next = replay(document, entry.forward);
  if (typeof next === "string") return { ok: false, message: next };
  return {
    ok: true,
    document: next,
    entry,
    history: { past: [...history.past, entry], future: history.future.slice(1) },
  };
};
