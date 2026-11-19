import type { ReactElement, ReactNode } from "react";
import { Tooltip as AriaTooltip, TooltipTrigger } from "react-aria-components";

type TooltipProps = Readonly<{
  content: string;
  shortcut?: string;
  placement?: "right" | "top" | "bottom" | "left";
  children: ReactNode;
}>;

export const Tooltip = ({ content, shortcut, placement = "right", children }: TooltipProps): ReactElement => (
  <TooltipTrigger delay={500} closeDelay={0}>
    {children}
    <AriaTooltip placement={placement} offset={8} data-tooltip="">
      {content}
      {shortcut === undefined ? null : <kbd data-tooltip-shortcut="">{shortcut}</kbd>}
    </AriaTooltip>
  </TooltipTrigger>
);
