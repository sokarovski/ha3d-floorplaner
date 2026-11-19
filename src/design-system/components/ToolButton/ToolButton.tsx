import type { ReactElement } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Icon } from "../Icon/Icon";
import type { IconName } from "../Icon/icons";
import { Tooltip } from "../Tooltip/Tooltip";

type ToolButtonProps = Readonly<{
  icon: IconName;
  label: string;
  active?: boolean;
  shortcut?: string;
  disabled?: boolean;
  /** Shown state holds only while a key is down (dashed ring), e.g. Shift flipping Auto-select. */
  temporary?: boolean;
  /** A small mark in the corner, e.g. "⇧" for a Shift-held state. Decorative; put its meaning in `label`. */
  badge?: string;
  onPress: () => void;
}>;

export const ToolButton = ({
  icon,
  label,
  active = false,
  shortcut,
  disabled = false,
  temporary = false,
  badge,
  onPress,
}: ToolButtonProps): ReactElement => (
  <Tooltip content={label} shortcut={shortcut}>
    <AriaButton
      aria-label={label}
      aria-pressed={active}
      isDisabled={disabled}
      onPress={onPress}
      data-tool-button=""
      data-tool-button-active={active ? "" : undefined}
      data-tool-button-temporary={temporary ? "" : undefined}
    >
      <Icon name={icon} size="lg" />
      {badge === undefined ? null : (
        <span data-tool-button-badge="" aria-hidden="true">
          {badge}
        </span>
      )}
    </AriaButton>
  </Tooltip>
);
