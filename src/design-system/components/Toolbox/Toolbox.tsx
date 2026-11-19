import type { ReactElement, ReactNode } from "react";

type ToolboxProps = Readonly<{
  children: ReactNode;
  label: string;
  orientation?: "vertical" | "horizontal";
  /**
   * Buttons pinned to the end of a vertical toolbox (owner, Phase 5 follow-up: the camera buttons). When the
   * toolbox is too short, the tools above scroll and the footer stays.
   */
  footer?: ReactNode;
}>;

export const Toolbox = ({
  children,
  label,
  orientation = "vertical",
  footer,
}: ToolboxProps): ReactElement => (
  <aside
    aria-label={label}
    role="toolbar"
    aria-orientation={orientation}
    data-toolbox=""
    data-toolbox-vertical={orientation === "vertical" ? "" : undefined}
    data-toolbox-horizontal={orientation === "horizontal" ? "" : undefined}
  >
    <div data-toolbox-tools="">{children}</div>
    {footer === undefined ? null : (
      <div data-toolbox-footer="">
        <span data-toolbox-separator="" />
        {footer}
      </div>
    )}
  </aside>
);
