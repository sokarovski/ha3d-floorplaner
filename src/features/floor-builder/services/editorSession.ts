// One editor session per opened house (spec/architecture/state-and-data.md#state-ownership): the document,
// history, save, and UI stores plus the only public edit actions. UI callers never setState the document.
import type { StoreApi } from "zustand/vanilla";
import { previewCommand, runCommand } from "@shared/domain/commands/command";
import type { Command, CommandOutcome } from "@shared/domain/commands/command";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { HouseClient } from "../../../api/houseClient";
import { createDocumentStore, createHistoryStore, createSaveStore } from "../stores/documentStore";
import type { DocumentState, HistoryState, SaveState } from "../stores/documentStore";
import { createUiStore } from "../stores/uiStore";
import type { UiState } from "../stores/uiStore";
import { hasHouseOverview } from "@shared/domain/house/floorPlacement";
import { editPathOf, focusFieldsOf, validEditPath } from "./editContext";
import { recordEntry, redoEntry, undoEntry } from "./historyService";
import { pickerStore } from "../templates/templatePickerStore";
import { createSaveService } from "./saveService";
import type { SaveService } from "./saveService";

export type EditorSession = Readonly<{
  houseId: string;
  documents: StoreApi<DocumentState>;
  history: StoreApi<HistoryState>;
  saves: StoreApi<SaveState>;
  ui: StoreApi<UiState>;
  save: SaveService;
  execute: (command: Command) => CommandOutcome;
  /** Shows a command's result in the viewport without committing it; undefined clears the preview. */
  preview: (command: Command | undefined) => void;
  undo: () => boolean;
  redo: () => boolean;
  /** Replaces the session document after a revision restore: a new history baseline. */
  replaceDocument: (document: HouseDocument, serverRevision: number) => void;
  notify: (tone: "info" | "warning" | "danger", text: string) => void;
  isDisposed: () => boolean;
  dispose: () => void;
}>;

export const createEditorSession = (
  houseId: string,
  document: HouseDocument,
  serverRevision: number,
  client: HouseClient,
): EditorSession => {
  const firstFloor = document.floors[0];
  if (firstFloor === undefined) throw new Error("A house document always has a floor.");
  const documents = createDocumentStore(document);
  const history = createHistoryStore();
  const saves = createSaveStore(serverRevision);
  // A multi-floor house opens on the whole-house overview, a one-floor house on its floor (Phase 16.4).
  const ui = createUiStore(firstFloor.id, document.id, hasHouseOverview(document));
  const save = createSaveService(houseId, client, documents, saves);
  let disposed = false;

  const publish = (next: HouseDocument): void => {
    documents.setState((state) => ({ document: next, generation: state.generation + 1, preview: undefined }));
    save.schedule();
  };

  const notify = (tone: "info" | "warning" | "danger", text: string): void => {
    ui.setState({ notice: { tone, text } });
  };

  const ensureContextStillExists = (): void => {
    const { activeFloorId } = ui.getState();
    const floors = documents.getState().document.floors;
    if (!floors.some((floor) => floor.id === activeFloorId)) {
      const fallback = floors[0];
      if (fallback !== undefined)
        ui.setState({ activeFloorId: fallback.id, ...focusFieldsOf([]), tool: "select", selection: [] });
    }
    // The whole-house overview needs more than one floor (a floor deleted, or an add undone).
    if (ui.getState().houseOverview && !hasHouseOverview(documents.getState().document))
      ui.setState({ houseOverview: false, selection: [] });
    // Every open level must still exist (Undo of a carpet or feature creation, a delete, a restore).
    const state = ui.getState();
    const path = editPathOf(state);
    const valid = validEditPath(documents.getState().document, state.activeFloorId, path);
    if (valid.length < path.length) ui.setState({ ...focusFieldsOf(valid), tool: "select", selection: [] });
  };

  const activateEntryFloor = (floorId: string | undefined): void => {
    if (floorId === undefined || floorId === ui.getState().activeFloorId) return;
    if (documents.getState().document.floors.some((floor) => floor.id === floorId)) {
      ui.setState((state) => ({
        activeFloorId: floorId,
        ...focusFieldsOf([]),
        frameRequest: { serial: state.frameRequest.serial + 1, target: "floor" },
      }));
    }
  };

  return {
    houseId,
    documents,
    history,
    saves,
    ui,
    save,
    preview: (command) => {
      const { document: current, preview } = documents.getState();
      if (command === undefined) {
        if (preview !== undefined) documents.setState({ preview: undefined });
        return;
      }
      documents.setState({ preview: previewCommand(current, command) });
    },
    execute: (command) => {
      if (documents.getState().preview !== undefined) documents.setState({ preview: undefined });
      const outcome = runCommand(documents.getState().document, command);
      if (!outcome.ok) {
        notify("danger", outcome.message);
        return outcome;
      }
      if (outcome.changed) {
        history.setState((state) => recordEntry(state, outcome.entry));
        publish(outcome.document);
        ensureContextStillExists();
        ui.setState({ notice: undefined });
      }
      return outcome;
    },
    undo: () => {
      const result = undoEntry(documents.getState().document, history.getState());
      if (!result.ok) {
        notify("info", result.message);
        return false;
      }
      activateEntryFloor(result.entry.floorId);
      history.setState(result.history);
      publish(result.document);
      ensureContextStillExists();
      notify("info", `Undid: ${result.entry.label}`);
      return true;
    },
    redo: () => {
      const result = redoEntry(documents.getState().document, history.getState());
      if (!result.ok) {
        notify("info", result.message);
        return false;
      }
      activateEntryFloor(result.entry.floorId);
      history.setState(result.history);
      publish(result.document);
      ensureContextStillExists();
      notify("info", `Redid: ${result.entry.label}`);
      return true;
    },
    replaceDocument: (next, revision) => {
      documents.setState((state) => ({ document: next, generation: state.generation + 1 }));
      const generation = documents.getState().generation;
      saves.setState({
        serverRevision: revision,
        writtenGeneration: generation,
        savedGeneration: generation,
        savedFingerprint: JSON.stringify(next),
        matchesSavedGeneration: generation,
        status: "saved",
        message: undefined,
      });
      history.setState({ past: [], future: [] });
      ensureContextStillExists();
    },
    notify,
    isDisposed: () => disposed,
    dispose: () => {
      disposed = true;
      save.dispose();
      // An open template picker belongs to this house; the next session starts with none.
      pickerStore.setState({ request: undefined });
    },
  };
};
