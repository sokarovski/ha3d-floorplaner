// Editor keyboard shortcuts: ⌘Z, ⇧⌘Z, ⌘S, F, Delete, Escape (leaves one level when nothing else to do), ⌘A (Room Editor). Typing in fields is never captured,
// except ⌘S (the field commits on blur first). Tool shortcuts live in services/toolShortcuts.ts.
import { useEffect } from "react";
import { indexEntities } from "@shared/domain/house/entityIndex";
import type { EditorSession } from "../services/editorSession";
import { leaveEditLevel } from "../services/editContext";
import { deleteSelection } from "../services/selectionActions";
import { requestFrame } from "../services/treeActions";

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement);

/** A focused field without an uncommitted draft lets ⌘Z/⇧⌘Z reach model undo. */
const hasDraft = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && target.closest("[data-input-dirty]") !== null;

export const useBuilderShortcuts = (session: EditorSession, enabled: boolean): void => {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement && isTyping(document.activeElement))
          document.activeElement.blur();
        void session.save.saveRevision();
        return;
      }
      if (command && event.key.toLowerCase() === "z" && !hasDraft(event.target) && !event.defaultPrevented) {
        event.preventDefault();
        if (event.shiftKey) session.redo();
        else session.undo();
        return;
      }
      if (isTyping(event.target) || event.defaultPrevented) return;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) session.redo();
        else session.undo();
      } else if (command && event.key.toLowerCase() === "a") {
        const { mode, focusAreaId } = session.ui.getState();
        if (mode !== "area" || focusAreaId === undefined) return;
        event.preventDefault();
        const area = indexEntities(session.documents.getState().document).get(focusAreaId);
        if (area?.kind === "area")
          session.ui.setState({ selection: area.value.walls.map((wall) => wall.id) });
      } else if (!command && event.key.toLowerCase() === "f") {
        requestFrame(session, session.ui.getState().selection.length > 0 ? "selection" : "floor");
      } else if (event.key === "Delete" || event.key === "Backspace") {
        const entities = indexEntities(session.documents.getState().document);
        const refs = session.ui
          .getState()
          .selection.map((id) => entities.get(id))
          .filter((ref) => ref !== undefined);
        if (
          refs.length > 0 &&
          refs.every((ref) => ref.kind !== "house" && ref.kind !== "floor" && ref.kind !== "floorSurface")
        ) {
          event.preventDefault();
          deleteSelection(session, refs);
        }
      } else if (event.key === "Escape") {
        // Escape, after the tool had its chance to cancel a running operation (Phase 7.1, SketchUp): back to
        // Select, then clear the selection, then leave one editing level.
        const { tool, selection } = session.ui.getState();
        if (tool !== "select") session.ui.setState({ tool: "select", reassignWallId: undefined });
        else if (selection.length > 0) session.ui.setState({ selection: [] });
        else leaveEditLevel(session);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [session, enabled]);
};
