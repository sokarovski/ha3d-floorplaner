import type { ReactElement } from "react";
import { IconButton } from "../../../design-system/components/IconButton/IconButton";
import { MenuButton } from "../../../design-system/components/MenuButton/MenuButton";
import { TreeItem } from "../../../design-system/components/TreeItem/TreeItem";
import { hideShortcutLabel } from "../services/hideActions";
import type { TreeMagnifier, TreeNode } from "../services/houseTree";

type TreeNodeViewProps = Readonly<{
  node: TreeNode;
  onMagnifier: (action: TreeMagnifier, rowId: string) => void;
  onAdd: (itemId: string, rowId: string) => void;
  onDelete: (rowId: string) => void;
  /** The eye (Phase 7.5): hide the row for this session, or show it again. */
  onToggleHidden: (rowId: string) => void;
  /** Rows above a selected row (tinted). */
  containsSelection: ReadonlySet<string>;
}>;

export const TreeNodeView = ({
  node,
  onMagnifier,
  onAdd,
  onDelete,
  onToggleHidden,
  containsSelection,
}: TreeNodeViewProps): ReactElement => (
  <TreeItem
    id={node.id}
    label={node.label}
    icon={node.icon}
    warning={node.warning}
    muted={node.muted}
    faded={node.faded}
    disabled={node.disabled}
    containsSelection={containsSelection.has(node.id)}
    badge={node.badge}
    pinnedAction={
      node.hide?.hidden === true ? (
        <IconButton
          icon="eyeOff"
          size="sm"
          label={`Show ${node.label} (${hideShortcutLabel})`}
          onPress={() => {
            onToggleHidden(node.id);
          }}
        />
      ) : undefined
    }
    actions={
      node.magnifier === undefined &&
      node.addItems === undefined &&
      !node.deletable &&
      node.hide === undefined ? undefined : (
        <>
          {node.hide === undefined || node.hide.hidden ? null : (
            <IconButton
              icon="eye"
              size="sm"
              label={`Hide ${node.label} (${hideShortcutLabel})`}
              onPress={() => {
                onToggleHidden(node.id);
              }}
            />
          )}
          {node.deletable ? (
            <IconButton
              icon="trash"
              size="sm"
              label={`Delete ${node.label}`}
              onPress={() => {
                onDelete(node.id);
              }}
            />
          ) : null}
          {node.magnifier === undefined ? null : (
            <IconButton
              icon="frame"
              size="sm"
              label={node.magnifier.label}
              onPress={() => {
                if (node.magnifier !== undefined) onMagnifier(node.magnifier.action, node.id);
              }}
            />
          )}
          {node.addItems === undefined ? null : (
            <MenuButton
              label={`Add to ${node.label}`}
              icon="plus"
              size="sm"
              placement="bottom end"
              items={node.addItems}
              onAction={(itemId) => {
                onAdd(itemId, node.id);
              }}
            />
          )}
        </>
      )
    }
  >
    {node.children === undefined
      ? undefined
      : node.children.map((child) => (
          <TreeNodeView
            key={child.id}
            node={child}
            onMagnifier={onMagnifier}
            onAdd={onAdd}
            onDelete={onDelete}
            onToggleHidden={onToggleHidden}
            containsSelection={containsSelection}
          />
        ))}
  </TreeItem>
);
