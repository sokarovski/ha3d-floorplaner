import type { IconName } from "../Icon/icons";

/** One entry of a MenuButton dropdown. Feature code decides which entries appear. */
export type MenuButtonItem = Readonly<{
  id: string;
  label: string;
  icon?: IconName;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
}>;
