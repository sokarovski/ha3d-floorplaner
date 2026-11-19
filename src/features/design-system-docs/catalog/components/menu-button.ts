import type { ComponentDoc } from "../docTypes";
import { MenuButtonExample } from "../../examples/MenuButtonExample";
import MenuButtonExampleSource from "../../examples/MenuButtonExample.tsx?raw";

export const menuButtonDoc: ComponentDoc = {
  slug: "menu-button",
  name: "MenuButton",
  category: "Navigation",
  purpose: "A button (icon or text) that opens an anchored Menu whose items come from props.",
  importPath: "src/design-system/components/MenuButton/MenuButton",
  whenToUse: "The tree's Add buttons (feature code passes only the allowed child types) and action menus.",
  props: [
    {
      name: "label",
      type: "string",
      required: true,
      description: "Accessible name of the trigger and menu.",
    },
    {
      name: "items",
      type: "readonly MenuButtonItem[]",
      required: true,
      description: "Entries: id, label, icon?, shortcut?, disabled?, danger?.",
    },
    {
      name: "onAction",
      type: "(id: string) => void",
      required: true,
      description: "Called with the chosen item's ID.",
    },
    {
      name: "icon",
      type: "IconName",
      required: false,
      defaultValue: '"menu"',
      description: "Icon for the icon trigger.",
    },
    { name: "text", type: "string", required: false, description: "When set, a text Button is the trigger." },
    {
      name: "variant",
      type: '"secondary" | "ghost"',
      required: false,
      defaultValue: '"ghost"',
      description: "Trigger variant.",
    },
    {
      name: "size",
      type: '"sm" | "md"',
      required: false,
      defaultValue: '"md"',
      description: "Trigger size.",
    },
    {
      name: "disabled",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Disabled (also when items is empty).",
    },
    {
      name: "placement",
      type: "string",
      required: false,
      defaultValue: '"bottom start"',
      description: "Popover placement.",
    },
  ],
  examples: [
    {
      id: "menu-button-menu-button",
      title: "Icon and text triggers",
      Example: MenuButtonExample,
      source: MenuButtonExampleSource,
    },
  ],
  keyboard: [
    "Enter / Space / Arrow down: open",
    "Arrow keys: move",
    "Escape: close and return focus to the button",
  ],
  related: ["menu", "tree"],
};
