// The domain command layer: each command mutates an Immer draft of the house document and produces one
// forward/inverse patch pair (spec/builder/undo-redo.md). Commands never touch React, stores, or transport.
import { enablePatches, produce, produceWithPatches } from "immer";
import type { Draft, Patch } from "immer";
import type { HouseDocument } from "../schemas/house";
import { validateHouseDocument } from "./houseRules";

enablePatches();

export type HistoryEntry = Readonly<{
  label: string;
  /** The floor the edit belongs to; Undo activates it before applying (floor-aware labels). */
  floorId: string | undefined;
  forward: readonly Patch[];
  inverse: readonly Patch[];
}>;

/** Return a message to reject the command; the document stays unchanged. */
export type CommandApply = (draft: Draft<HouseDocument>) => string | undefined;

export type Command = Readonly<{
  label: string;
  floorId: string | undefined;
  apply: CommandApply;
}>;

export type CommandOutcome =
  | Readonly<{ ok: true; changed: true; document: HouseDocument; entry: HistoryEntry }>
  | Readonly<{ ok: true; changed: false; document: HouseDocument }>
  | Readonly<{ ok: false; message: string }>;

export const runCommand = (document: HouseDocument, command: Command): CommandOutcome => {
  let rejection: string | undefined;
  let next: HouseDocument;
  let forward: Patch[];
  let inverse: Patch[];
  try {
    [next, forward, inverse] = produceWithPatches(document, (draft) => {
      rejection = command.apply(draft);
    });
  } catch (error) {
    // A failing command must never fail silently (Phase 3.0 finding): report it, keep the document.
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `${command.label} failed: ${reason}` };
  }
  if (rejection !== undefined) return { ok: false, message: rejection };
  if (forward.length === 0) return { ok: true, changed: false, document };
  const problem = validateHouseDocument(next, document);
  if (problem !== undefined) return { ok: false, message: problem };
  return {
    ok: true,
    changed: true,
    document: next,
    entry: { label: command.label, floorId: command.floorId, forward, inverse },
  };
};

/**
 * A command's result for a live preview (a tool's drag): no patches and no document validation, so it is
 * cheap per pointer move. Undefined when the command rejects or throws; commits still go through runCommand.
 */
export const previewCommand = (document: HouseDocument, command: Command): HouseDocument | undefined => {
  let rejection: string | undefined;
  try {
    const next = produce(document, (draft) => {
      rejection = command.apply(draft);
    });
    return rejection === undefined ? next : undefined;
  } catch {
    return undefined;
  }
};

export const defineCommand = (label: string, floorId: string | undefined, apply: CommandApply): Command => ({
  label,
  floorId,
  apply,
});
