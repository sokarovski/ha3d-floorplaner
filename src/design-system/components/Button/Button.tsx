import type { ReactElement, ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Spinner } from "../Spinner/Spinner";

type ButtonProps = Readonly<{
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  type?: "button" | "submit";
  disabled?: boolean;
  busy?: boolean;
  onPress?: () => void;
  "aria-label"?: string;
  autoFocus?: boolean;
}>;

export const Button = ({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  disabled = false,
  busy = false,
  onPress,
  "aria-label": ariaLabel,
  autoFocus,
}: ButtonProps): ReactElement => (
  <AriaButton
    type={type}
    isDisabled={disabled || busy}
    isPending={busy}
    onPress={onPress}
    aria-label={ariaLabel}
    autoFocus={autoFocus}
    data-button=""
    data-button-primary={variant === "primary" ? "" : undefined}
    data-button-secondary={variant === "secondary" ? "" : undefined}
    data-button-danger={variant === "danger" ? "" : undefined}
    data-button-ghost={variant === "ghost" ? "" : undefined}
    data-button-sm={size === "sm" ? "" : undefined}
  >
    {busy ? <Spinner label="Working" /> : null}
    {children}
  </AriaButton>
);
