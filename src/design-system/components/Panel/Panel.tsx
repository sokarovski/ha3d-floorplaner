import type { ReactElement, ReactNode } from "react";
import { Icon } from "../Icon/Icon";
import type { IconName } from "../Icon/icons";

type PanelProps = Readonly<{
  title?: string;
  /** An icon before the title (the properties panel shows a list icon before the object's name). */
  icon?: IconName;
  actions?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  "aria-label"?: string;
}>;

export const Panel = ({
  title,
  icon,
  actions,
  children,
  scroll = true,
  padded = true,
  "aria-label": ariaLabel,
}: PanelProps): ReactElement => (
  <section data-panel="" aria-label={ariaLabel ?? title}>
    {title === undefined && actions === undefined ? null : (
      <header data-panel-header="">
        {title === undefined ? null : (
          <h2 data-panel-title="">
            {icon === undefined ? null : <Icon name={icon} size="sm" />}
            <span data-panel-title-text="">{title}</span>
          </h2>
        )}
        {actions === undefined ? null : <div data-panel-actions="">{actions}</div>}
      </header>
    )}
    <div
      data-panel-body=""
      data-panel-scroll={scroll ? "" : undefined}
      data-panel-padded={padded ? "" : undefined}
    >
      {children}
    </div>
  </section>
);
