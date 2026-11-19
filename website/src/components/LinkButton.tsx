import type { ReactElement, ReactNode } from "react";
import { Icon } from "../../../src/design-system/components/Icon/Icon";
import type { IconName } from "../../../src/design-system/components/Icon/icons";

type LinkButtonProps = Readonly<{
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  icon?: IconName;
}>;

// A real link drawn with the builder's button styling; navigation stays an <a>, never a click handler.
export const LinkButton = ({ href, children, variant = "primary", icon }: LinkButtonProps): ReactElement => (
  <a
    href={href}
    data-site-link-button=""
    data-site-link-button-primary={variant === "primary" ? "" : undefined}
    data-site-link-button-secondary={variant === "secondary" ? "" : undefined}
  >
    {icon === undefined ? null : <Icon name={icon} />}
    {children}
  </a>
);
