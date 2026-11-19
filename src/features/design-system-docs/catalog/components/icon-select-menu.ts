import type { ComponentDoc } from "../docTypes";
import { IconSelectMenuExample } from "../../examples/IconSelectMenuExample";
import IconSelectMenuExampleSource from "../../examples/IconSelectMenuExample.tsx?raw";

export const iconSelectMenuDoc: ComponentDoc = {
  slug: "icon-select-menu",
  name: "IconSelectMenu",
  category: "Navigation",
  purpose:
    "Groups several mutually exclusive icon choices into one icon trigger: the trigger shows the current choice's icon and a chevron; its menu lists the choices with a check, then optional commands after a separator.",
  importPath: "src/design-system/components/IconSelectMenu/IconSelectMenu",
  whenToUse:
    "To save space where a row of icon toggles picks one of several states (the builder's Sun view and Lights controls; later, grouped tools in the toolbox). Use MenuButton for plain commands.",
  props: [
    {
      name: "label",
      type: "string",
      required: true,
      description: "Accessible name of the trigger and menu.",
    },
    {
      name: "options",
      type: "readonly IconSelectOption[]",
      required: true,
      description: "The choices: id, label, icon. Exactly one is current.",
    },
    { name: "selectedId", type: "string", required: true, description: "ID of the current choice." },
    {
      name: "onSelect",
      type: "(id: string) => void",
      required: true,
      description: "Called with the chosen ID.",
    },
    {
      name: "actions",
      type: "readonly IconSelectAction[]",
      required: false,
      defaultValue: "[]",
      description: "Commands listed after a separator (id, label, icon).",
    },
    {
      name: "onAction",
      type: "(id: string) => void",
      required: false,
      description: "Called with a command's ID.",
    },
    { name: "tooltip", type: "string", required: false, description: "Tooltip shown on the trigger." },
    {
      name: "active",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Tonal fill, like a secondary IconButton (a toggle that is on).",
    },
    {
      name: "placement",
      type: "string",
      required: false,
      defaultValue: '"bottom end"',
      description: "Popover placement.",
    },
  ],
  examples: [
    {
      id: "icon-select-menu-lights-and-sun",
      title: "Lights controls with an on/off command, and Sun view",
      Example: IconSelectMenuExample,
      source: IconSelectMenuExampleSource,
    },
  ],
  keyboard: [
    "Enter / Space / Arrow down: open",
    "Arrow keys: move",
    "Enter: choose (the menu closes)",
    "Escape: close and return focus to the trigger",
  ],
  related: ["menu-button", "icon-button", "menu"],
};
