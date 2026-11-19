import { useState } from "react";
import type { ReactElement } from "react";
import { MenuButton } from "../../../design-system/components/MenuButton/MenuButton";

export const MenuButtonExample = (): ReactElement => {
  const [last, setLast] = useState("nothing yet");
  return (
    <>
      <MenuButton
        label="Add to area"
        icon="plus"
        items={[
          { id: "object", label: "Object", icon: "sofa" },
          { id: "light", label: "Light", icon: "light" },
          { id: "carpet", label: "Carpet", icon: "carpet", disabled: true },
        ]}
        onAction={setLast}
      />
      <MenuButton
        label="House actions"
        text="Actions"
        variant="secondary"
        items={[
          { id: "rename", label: "Rename", icon: "edit" },
          { id: "delete", label: "Delete", icon: "trash", danger: true },
        ]}
        onAction={setLast}
      />
      <span>Last action: {last}</span>
    </>
  );
};
