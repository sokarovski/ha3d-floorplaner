import type { ReactElement, ReactNode } from "react";
import { Tree as AriaTree } from "react-aria-components";
import { selectionToIds } from "./selectionIds";

type TreeProps = Readonly<{
  label: string;
  children: ReactNode;
  selectedIds: readonly string[];
  onSelectionChange: (ids: readonly string[]) => void;
  /** Activate a row with double-click or Enter. */
  onAction?: (id: string) => void;
  expandedIds: readonly string[];
  onExpandedChange: (ids: readonly string[]) => void;
  selectionMode?: "single" | "multiple";
  /** Rows that cannot be selected (they still expand); mark them with TreeItem `disabled`. */
  disabledIds?: readonly string[];
}>;

export const Tree = ({
  label,
  children,
  selectedIds,
  onSelectionChange,
  onAction,
  expandedIds,
  onExpandedChange,
  selectionMode = "single",
  disabledIds = [],
}: TreeProps): ReactElement => (
  <AriaTree
    aria-label={label}
    data-tree=""
    selectionMode={selectionMode}
    selectionBehavior="replace"
    onAction={
      onAction === undefined
        ? undefined
        : (key) => {
            onAction(String(key));
          }
    }
    selectedKeys={selectedIds}
    disabledKeys={disabledIds}
    disabledBehavior="selection"
    onSelectionChange={(selection) => {
      onSelectionChange(selectionToIds(selection));
    }}
    expandedKeys={expandedIds}
    onExpandedChange={(keys) => {
      onExpandedChange(selectionToIds(keys));
    }}
  >
    {children}
  </AriaTree>
);
