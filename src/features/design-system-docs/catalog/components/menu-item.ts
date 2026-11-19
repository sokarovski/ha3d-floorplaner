import type { ComponentDoc } from "../docTypes";
import { MenuExample } from "../../examples/MenuExample";
import MenuExampleSource from "../../examples/MenuExample.tsx?raw";
import styleSource from "../../../../design-system/components/MenuItem/menuitem.tw.css?raw";

export const menuItemDoc: ComponentDoc = {
  slug: "menu-item",
  name: "MenuItem",
  category: "Navigation",
  purpose: "One menu action with an optional icon, shortcut hint, disabled and danger states.",
  importPath: "src/design-system/components/MenuItem/MenuItem",
  whenToUse: "Only inside Menu.",
  props: [
    { name: "id", type: "string", required: true, description: "Action ID passed to onAction." },
    { name: "label", type: "string", required: true, description: "Text and type-ahead value." },
    { name: "icon", type: "IconName", required: false, description: "Leading icon." },
    { name: "shortcut", type: "string", required: false, description: "Displayed shortcut hint." },
    {
      name: "disabled",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Not selectable.",
    },
    {
      name: "danger",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Destructive styling.",
    },
  ],
  examples: [
    {
      id: "menu-item-menu",
      title: "Inside a Menu",
      Example: MenuExample,
      source: MenuExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  related: ["menu"],
};
