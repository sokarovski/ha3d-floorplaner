import { useState } from "react";
import type { ReactElement } from "react";
import { Menu } from "../../../design-system/components/Menu/Menu";
import { MenuItem } from "../../../design-system/components/MenuItem/MenuItem";

export const MenuExample = (): ReactElement => {
  const [last, setLast] = useState("nothing yet");
  return (
    <div data-ds-example-box="">
      <Menu label="Edit" onAction={setLast}>
        <MenuItem id="undo" label="Undo" icon="undo" shortcut="⌘Z" />
        <MenuItem id="redo" label="Redo" icon="redo" shortcut="⇧⌘Z" />
        <MenuItem id="delete" label="Delete" icon="trash" danger />
        <MenuItem id="disabled" label="Unavailable" disabled />
      </Menu>
      <p>Last action: {last}</p>
    </div>
  );
};
