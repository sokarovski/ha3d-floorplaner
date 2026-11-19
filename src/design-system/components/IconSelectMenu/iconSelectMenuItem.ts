import type { IconName } from "../Icon/icons";

/** One choice of an IconSelectMenu: exactly one is current, and its icon is the trigger's icon. */
export type IconSelectOption = Readonly<{
  id: string;
  label: string;
  icon: IconName;
}>;

/** A command listed after the choices, below a separator (for example a global on/off switch). */
export type IconSelectAction = Readonly<{
  id: string;
  label: string;
  icon: IconName;
}>;
