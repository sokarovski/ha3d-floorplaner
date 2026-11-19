import type { ReactElement } from "react";
import { MenuTrigger, Popover } from "react-aria-components";
import { Button } from "../Button/Button";
import { IconButton } from "../IconButton/IconButton";
import type { IconName } from "../Icon/icons";
import { Menu } from "../Menu/Menu";
import { MenuItem } from "../MenuItem/MenuItem";
import type { MenuButtonItem } from "./menuButtonItem";

type MenuButtonProps = Readonly<{
  label: string;
  items: readonly MenuButtonItem[];
  onAction: (id: string) => void;
  icon?: IconName;
  text?: string;
  variant?: "secondary" | "ghost";
  size?: "sm" | "md";
  disabled?: boolean;
  placement?: "bottom start" | "bottom end" | "right top";
}>;

export const MenuButton = ({
  label,
  items,
  onAction,
  icon,
  text,
  variant = "ghost",
  size = "md",
  disabled = false,
  placement = "bottom start",
}: MenuButtonProps): ReactElement => (
  <MenuTrigger>
    {text === undefined ? (
      <IconButton
        icon={icon ?? "menu"}
        label={label}
        variant={variant === "secondary" ? "secondary" : "ghost"}
        size={size}
        disabled={disabled || items.length === 0}
      />
    ) : (
      <Button variant={variant} size={size} disabled={disabled || items.length === 0} aria-label={label}>
        {text}
      </Button>
    )}
    <Popover placement={placement} data-menu-popover="">
      <Menu label={label} onAction={onAction}>
        {items.map((item) => (
          <MenuItem
            key={item.id}
            id={item.id}
            label={item.label}
            icon={item.icon}
            shortcut={item.shortcut}
            disabled={item.disabled}
            danger={item.danger}
          />
        ))}
      </Menu>
    </Popover>
  </MenuTrigger>
);
