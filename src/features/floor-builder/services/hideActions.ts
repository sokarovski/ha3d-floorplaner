// Hide (Phase 7.5, P4): session-only hiding of areas, walls, wall features, objects, object groups, carpets,
// and lights (P5), from the tree's eye, Shift+H on the selection, and Unhide all. The drawn floor follows the
// shared visibility rule (shared/domain/house/visibility.ts), which the viewport and snapping both read.
import { indexEntities } from "@shared/domain/house/entityIndex";
import { floorView, isHideableKind } from "@shared/domain/house/visibility";
import type { FloorView, VisibilityRule } from "@shared/domain/house/visibility";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { UiState } from "../stores/uiStore";
import type { EditorSession } from "./editorSession";

/** The key that hides (or unhides) the selection; H stays Pan, as in SketchUp. */
export const hideShortcutLabel = "⇧H";

let ruleMemo: { hiddenIds: readonly string[]; showHidden: boolean; rule: VisibilityRule } | undefined;

/** The visibility rule of the UI state (stable while hiddenIds and showHidden are unchanged). */
export const visibilityRuleOf = (ui: Pick<UiState, "hiddenIds" | "showHidden">): VisibilityRule => {
  if (ruleMemo?.hiddenIds === ui.hiddenIds && ruleMemo.showHidden === ui.showHidden) return ruleMemo.rule;
  const rule: VisibilityRule = { hiddenIds: new Set(ui.hiddenIds), showHidden: ui.showHidden };
  ruleMemo = { hiddenIds: ui.hiddenIds, showHidden: ui.showHidden, rule };
  return rule;
};

/** The floor as drawn for snapping and inference: hidden things are not snapped to. */
export const drawnFloor = (
  floor: BuildingFloorValue,
  ui: Pick<UiState, "hiddenIds" | "showHidden">,
): BuildingFloorValue => floorView(floor, visibilityRuleOf(ui)).floor;

const activeView = (session: EditorSession): FloorView | undefined => {
  const ui = session.ui.getState();
  const floor = session.documents.getState().document.floors.find((item) => item.id === ui.activeFloorId);
  return floor === undefined ? undefined : floorView(floor, visibilityRuleOf(ui));
};

/** Drops what is no longer drawn from the selection (SketchUp: hiding deselects). */
export const pruneSelection = (session: EditorSession): void => {
  const view = activeView(session);
  if (view === undefined) return;
  const { selection } = session.ui.getState();
  const kept = selection.filter((id) => !view.offIds.has(id));
  if (kept.length !== selection.length) session.ui.setState({ selection: kept });
};

/** The hideable IDs among `ids` (P5 kinds); the area being edited cannot be hidden. */
const hideable = (session: EditorSession, ids: readonly string[]): string[] => {
  const entities = indexEntities(session.documents.getState().document);
  const { focusAreaId } = session.ui.getState();
  return ids.filter((id) => {
    const kind = entities.get(id)?.kind;
    return kind !== undefined && isHideableKind(kind) && id !== focusAreaId;
  });
};

export const canHide = (session: EditorSession, id: string): boolean => hideable(session, [id]).length > 0;

/** Hides `ids` for this session, or shows them again when every one of them is already hidden. */
export const toggleHidden = (session: EditorSession, ids: readonly string[]): boolean => {
  const targets = hideable(session, ids);
  if (targets.length === 0) return false;
  const { hiddenIds } = session.ui.getState();
  const allHidden = targets.every((id) => hiddenIds.includes(id));
  session.ui.setState({
    hiddenIds: allHidden
      ? hiddenIds.filter((id) => !targets.includes(id))
      : [...hiddenIds, ...targets.filter((id) => !hiddenIds.includes(id))],
  });
  pruneSelection(session);
  return true;
};

/** Shift+H: hide the selection (or unhide it when all of it is hidden). */
export const hideSelection = (session: EditorSession): boolean => {
  const { selection } = session.ui.getState();
  if (selection.length === 0) return false;
  if (toggleHidden(session, selection)) return true;
  session.notify(
    "info",
    "Only rooms, walls, wall features, objects, groups, carpets, and lights can be hidden.",
  );
  return true;
};

export const unhideAll = (session: EditorSession): void => {
  session.ui.setState({ hiddenIds: [] });
};

/** The hide shortcut from the viewport, toolbox, header, or tree (never inside a field). */
export const applyHideShortcut = (session: EditorSession, event: KeyboardEvent): boolean =>
  !event.repeat &&
  event.shiftKey &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.altKey &&
  event.key.toLowerCase() === "h" &&
  hideSelection(session);
