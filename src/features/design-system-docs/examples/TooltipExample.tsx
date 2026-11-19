import type { ReactElement } from "react";
import { IconButton } from "../../../design-system/components/IconButton/IconButton";
import { Tooltip } from "../../../design-system/components/Tooltip/Tooltip";

export const TooltipExample = (): ReactElement => (
  <Tooltip content="Undo" shortcut="⌘Z" placement="bottom">
    <IconButton icon="undo" label="Undo" />
  </Tooltip>
);
