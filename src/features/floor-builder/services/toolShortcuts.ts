// Tool shortcuts (SketchUp-like): a key switches the tool of the current mode, which cancels any operation in
// progress. They apply when the keyboard is on the canvas, the toolbox, the header, or the house tree (letters
// only: Space selects a tree row), never inside a field, a menu, or a popup.
import type { EditorSession } from "./editorSession";
import { editPathOf, levelName } from "./editContext";
import { toolForShortcut, toolLevelOf, unavailableToolForShortcut } from "./toolCatalog";

const shortcutScope = "[data-builder-viewport], [data-toolbox], [data-builder-header]";

export const inShortcutScope = (target: EventTarget | null, key: string): boolean =>
  target === document.body ||
  target === document.documentElement ||
  (target instanceof Element &&
    (target.closest(shortcutScope) !== null || (key !== " " && target.closest("[data-tree]") !== null)));

/** Returns true when the key selected a tool. */
export const applyToolShortcut = (session: EditorSession, event: KeyboardEvent): boolean => {
  if (event.repeat || !inShortcutScope(event.target, event.key)) return false;
  const ui = session.ui.getState();
  const { houseOverview, focusCarpetId, focusWallFace, focusReliefId } = ui;
  const tool = toolForShortcut(
    toolLevelOf(ui),
    event.key,
    focusCarpetId !== undefined,
    focusWallFace !== undefined,
    focusReliefId !== undefined,
  );
  if (tool === undefined) {
    const elsewhere = event.shiftKey ? undefined : unavailableToolForShortcut(event.key);
    if (elsewhere === undefined) return false;
    const name = elsewhere.label.split(":")[0] ?? elsewhere.label;
    session.notify(
      "info",
      `${name} is not available in the ${houseOverview ? "whole-house overview (double-click a floor to open it)" : levelName(editPathOf(session.ui.getState()))}.`,
    );
    return true;
  }
  // A focused toolbox button would otherwise also react to the key (Space presses it).
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body)
    document.activeElement.blur();
  session.ui.setState({ tool, reassignWallId: undefined });
  return true;
};
