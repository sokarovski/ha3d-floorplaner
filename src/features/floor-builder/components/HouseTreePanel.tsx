import { indexEntities } from "@shared/domain/house/entityIndex";
import { deleteSelection } from "../services/selectionActions";
import { useEffect, useMemo, useRef } from "react";
import type { ReactElement } from "react";
import { Panel } from "../../../design-system/components/Panel/Panel";
import { Tree } from "../../../design-system/components/Tree/Tree";
import { useHouse, useSession, useUi } from "../hooks/sessionContext";
import { useTreeIssues } from "../hooks/useTreeIssues";
import { buildHouseTree, lockTreeToArea, treeAncestors, withVisibility } from "../services/houseTree";
import { toggleHidden, visibilityRuleOf } from "../services/hideActions";
import { floorView } from "@shared/domain/house/visibility";
import { enterHouseOverview } from "../services/editContext";
import {
  enterAreaEditor,
  enterCarpetEditor,
  enterRoof,
  enterWallFeature,
  enterWallFace,
  runAdd,
  openFloor,
  runMagnifier,
  selectRow,
} from "../services/treeActions";
import { TreeNodeView } from "./TreeNodeView";

export const HouseTreePanel = (): ReactElement => {
  const session = useSession();
  const house = useHouse((value) => value);
  const selection = useUi((ui) => ui.selection);
  const expanded = useUi((ui) => ui.expanded);
  const issues = useTreeIssues();
  // Locked to the open room, or to the open roof (Phase 19.1).
  const lockedTo = useUi((ui) => ui.focusRoofId ?? (ui.mode === "overview" ? undefined : ui.focusAreaId));
  const hiddenIds = useUi((ui) => ui.hiddenIds);
  const showHidden = useUi((ui) => ui.showHidden);
  const { root, disabledIds } = useMemo(() => {
    // Hide and Hidden (Phase 7.5): the eye on hideable rows, saved-Hidden greyed, undrawn rows faded.
    const rule = visibilityRuleOf({ hiddenIds, showHidden });
    const offIds = new Set(house.floors.flatMap((floor) => [...floorView(floor, rule).offIds]));
    const tree = withVisibility(buildHouseTree(house, issues), house, { hiddenIds: rule.hiddenIds, offIds });
    return lockTreeToArea(tree, lockedTo);
  }, [house, issues, lockedTo, hiddenIds, showHidden]);
  const ancestors = useMemo(() => treeAncestors(root, selection), [root, selection]);
  // Tree reveal (Phase 7.4): a selection made anywhere (view, keys, automation) opens every row above it and
  // scrolls the first selected row into view; rows the user collapsed stay collapsed otherwise.
  const revealed = useRef<readonly string[] | undefined>(undefined);
  useEffect(() => {
    // Only a new selection reveals; edits that rebuild the tree must not reopen rows the user collapsed.
    if (revealed.current === selection) return;
    revealed.current = selection;
    const { expanded: open } = session.ui.getState();
    const missing = [...ancestors].filter((id) => !open.includes(id));
    if (missing.length > 0) session.ui.setState({ expanded: [...open, ...missing] });
    const first = selection[0];
    if (first === undefined) return;
    requestAnimationFrame(() => {
      // Scroll only the tree's own panel: scrollIntoView would also scroll the page around the editor.
      const row = document.querySelector(`[data-tree] [data-key="${CSS.escape(first)}"]`);
      const scroller = row?.closest("[data-panel-scroll]");
      if (row === null || scroller === null || scroller === undefined) return;
      const rowBox = row.getBoundingClientRect();
      const box = scroller.getBoundingClientRect();
      if (rowBox.top < box.top) scroller.scrollTop -= box.top - rowBox.top;
      else if (rowBox.bottom > box.bottom) scroller.scrollTop += rowBox.bottom - box.bottom;
    });
  }, [session, ancestors, selection]);
  return (
    <Panel aria-label="House" padded={false}>
      <Tree
        label="House contents"
        selectedIds={selection}
        onAction={(rowId) => {
          // Double-click / Enter: a room opens the Room Editor, a carpet the Carpet Editor (Phase 5.14).
          const ref = indexEntities(house).get(rowId);
          // Floors are groups in the whole-house overview (Phase 16.4): Enter on a floor opens it, on House the overview.
          if (ref?.kind === "floor") openFloor(session, rowId);
          else if (ref?.kind === "house") enterHouseOverview(session, [rowId]);
          else if (ref?.kind === "carpet") enterCarpetEditor(session, rowId);
          else if (ref?.kind === "roof") enterRoof(session, rowId);
          else if (ref?.kind === "relief") enterWallFeature(session, rowId);
          else if (ref?.kind === "wall") enterWallFace(session, rowId);
          else enterAreaEditor(session, rowId);
        }}
        expandedIds={expanded}
        disabledIds={disabledIds}
        onExpandedChange={(ids) => {
          session.ui.setState({ expanded: ids });
        }}
        selectionMode="multiple"
        onSelectionChange={(ids) => {
          // A plain click selects one row with its special cases; ⌘- or Shift-click picks several real items
          // (Phase 7.3: e.g. to group them from the tree). Synthetic rows, the house, and floors are left out.
          const rowId = ids[0];
          if (ids.length <= 1) {
            if (rowId !== undefined) selectRow(session, rowId);
            else session.ui.setState({ selection: [] });
            return;
          }
          const entities = indexEntities(session.documents.getState().document);
          session.ui.setState({
            selection: ids.filter((id) => {
              const kind = entities.get(id)?.kind;
              return kind !== undefined && kind !== "house" && kind !== "floor";
            }),
          });
        }}
      >
        <TreeNodeView
          node={root}
          onDelete={(rowId) => {
            const ref = indexEntities(session.documents.getState().document).get(rowId);
            if (ref !== undefined) deleteSelection(session, [ref]);
          }}
          onToggleHidden={(rowId) => {
            toggleHidden(session, [rowId]);
          }}
          containsSelection={ancestors}
          onMagnifier={(action, rowId) => {
            runMagnifier(session, action, rowId);
          }}
          onAdd={(itemId, rowId) => {
            runAdd(session, itemId, rowId);
          }}
        />
      </Tree>
    </Panel>
  );
};
