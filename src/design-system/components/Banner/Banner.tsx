import type { ReactElement, ReactNode } from "react";
import { Icon } from "../Icon/Icon";

type BannerProps = Readonly<{
  tone?: "info" | "success" | "warning" | "danger";
  children: ReactNode;
  actions?: ReactNode;
}>;

export const Banner = ({ tone = "info", children, actions }: BannerProps): ReactElement => (
  <div
    data-banner=""
    role={tone === "danger" ? "alert" : "status"}
    data-banner-info={tone === "info" ? "" : undefined}
    data-banner-success={tone === "success" ? "" : undefined}
    data-banner-warning={tone === "warning" ? "" : undefined}
    data-banner-danger={tone === "danger" ? "" : undefined}
  >
    <Icon name={tone === "info" || tone === "success" ? "info" : "warning"} />
    <div data-banner-message="">{children}</div>
    {actions === undefined ? null : <div data-banner-actions="">{actions}</div>}
  </div>
);
