import type { ReactElement } from "react";
import { MenuItem as AriaMenuItem } from "react-aria-components";
import { Icon } from "../Icon/Icon";
import type { IconName } from "../Icon/icons";

type MenuItemProps = Readonly<{
  id: string;
  label: string;
  icon?: IconName;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
}>;

export const MenuItem = ({
  id,
  label,
  icon,
  shortcut,
  disabled = false,
  danger = false,
}: MenuItemProps): ReactElement => (
  <AriaMenuItem
    id={id}
    textValue={label}
    isDisabled={disabled}
    data-menu-item=""
    data-menu-item-danger={danger ? "" : undefined}
  >
    {icon === undefined ? <span data-menu-item-icon-space="" /> : <Icon name={icon} />}
    <span data-menu-item-label="">{label}</span>
    {shortcut === undefined ? null : <kbd data-menu-item-shortcut="">{shortcut}</kbd>}
  </AriaMenuItem>
);
