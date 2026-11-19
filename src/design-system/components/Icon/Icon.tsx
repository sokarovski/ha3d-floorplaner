import type { ReactElement } from "react";
import { iconPaths } from "./icons";
import type { IconName } from "./icons";

type IconProps = Readonly<{
  name: IconName;
  size?: "sm" | "md" | "lg";
  label?: string;
}>;

export const Icon = ({ name, size = "md", label }: IconProps): ReactElement => (
  <svg
    data-icon=""
    data-icon-sm={size === "sm" ? "" : undefined}
    data-icon-lg={size === "lg" ? "" : undefined}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    role={label === undefined ? undefined : "img"}
    aria-label={label}
    aria-hidden={label === undefined ? true : undefined}
  >
    <path d={iconPaths[name]} />
  </svg>
);
