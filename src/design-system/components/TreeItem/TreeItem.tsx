import type { ReactElement, ReactNode } from "react";
import { Button as AriaButton, TreeItem as AriaTreeItem, TreeItemContent } from "react-aria-components";
import { Icon } from "../Icon/Icon";
import type { IconName } from "../Icon/icons";

type TreeItemProps = Readonly<{
  id: string;
  label: string;
  icon?: IconName;
  badge?: ReactNode;
  /** Row actions, shown while the row is hovered, selected, or focused. */
  actions?: ReactNode;
  /** An action that stays visible (e.g. the eye of a hidden row, so it can be shown again), after `actions`. */
  pinnedAction?: ReactNode;
  warning?: boolean;
  muted?: boolean;
  /** What the row stands for is not shown (e.g. hidden in a view): label and icon at half strength. */
  faded?: boolean;
  /** Greyed and not selectable (pair with Tree `disabledIds`); actions are hidden. */
  disabled?: boolean;
  /** A row above a selected row (Phase 7.4): a light tint shows where the selection is. */
  containsSelection?: boolean;
  children?: ReactNode;
}>;

export const TreeItem = ({
  id,
  label,
  icon,
  badge,
  actions,
  pinnedAction,
  warning = false,
  muted = false,
  faded = false,
  disabled = false,
  containsSelection = false,
  children,
}: TreeItemProps): ReactElement => (
  <AriaTreeItem
    id={id}
    textValue={label}
    data-tree-item=""
    data-tree-item-warning={warning ? "" : undefined}
    data-tree-item-muted={muted ? "" : undefined}
    data-tree-item-faded={faded ? "" : undefined}
    data-tree-item-disabled={disabled ? "" : undefined}
    data-tree-item-contains-selection={containsSelection ? "" : undefined}
  >
    <TreeItemContent>
      <div data-tree-row="">
        {children === undefined ? (
          <span data-tree-chevron-space="" />
        ) : (
          <AriaButton slot="chevron" data-tree-chevron="" aria-label={`Expand ${label}`}>
            <Icon name="chevronRight" size="sm" />
          </AriaButton>
        )}
        {icon === undefined ? null : (
          <span data-tree-icon="">
            <Icon name={icon} size="sm" />
          </span>
        )}
        <span data-tree-heading="">
          <span data-tree-label="">{label}</span>
          {badge === undefined ? null : <span data-tree-badge="">{badge}</span>}
        </span>
        {warning ? <Icon name="warning" size="sm" label="Needs attention" /> : null}
        {actions === undefined || disabled ? null : <span data-tree-actions="">{actions}</span>}
        {pinnedAction === undefined || disabled ? null : (
          <span data-tree-pinned-action="">{pinnedAction}</span>
        )}
      </div>
    </TreeItemContent>
    {children}
  </AriaTreeItem>
);
