import type { ReactElement } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Icon } from "../Icon/Icon";
import type { IconName } from "../Icon/icons";

type IconButtonProps = Readonly<{
  icon: IconName;
  label: string;
  variant?: "ghost" | "secondary" | "danger";
  size?: "sm" | "md";
  disabled?: boolean;
  onPress?: () => void;
  slot?: string;
}>;

export const IconButton = ({
  icon,
  label,
  variant = "ghost",
  size = "md",
  disabled = false,
  onPress,
  slot,
}: IconButtonProps): ReactElement => (
  <AriaButton
    aria-label={label}
    isDisabled={disabled}
    onPress={onPress}
    slot={slot}
    data-icon-button=""
    data-icon-button-secondary={variant === "secondary" ? "" : undefined}
    data-icon-button-danger={variant === "danger" ? "" : undefined}
    data-icon-button-sm={size === "sm" ? "" : undefined}
  >
    <Icon name={icon} size={size === "sm" ? "sm" : "md"} />
  </AriaButton>
);
