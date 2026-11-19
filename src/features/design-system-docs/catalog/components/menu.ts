import type { ComponentDoc } from "../docTypes";
import { MenuExample } from "../../examples/MenuExample";
import MenuExampleSource from "../../examples/MenuExample.tsx?raw";
import styleSource from "../../../../design-system/components/Menu/datamenu.tw.css?raw";

export const menuDoc: ComponentDoc = {
  slug: "menu",
  name: "Menu",
  category: "Navigation",
  purpose: "A keyboard-navigable list of actions.",
  importPath: "src/design-system/components/Menu/Menu",
  whenToUse: "Inside MenuButton popovers; standalone for inline action lists.",
  props: [
    { name: "label", type: "string", required: true, description: "Accessible name." },
    { name: "children", type: "ReactNode", required: true, description: "MenuItem elements." },
    {
      name: "onAction",
      type: "(id: string) => void",
      required: true,
      description: "Called with the chosen item's ID.",
    },
  ],
  examples: [
    {
      id: "menu-menu",
      title: "Menu",
      Example: MenuExample,
      source: MenuExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  keyboard: ["Arrow keys: move", "Enter: choose", "Type-ahead by label"],
  related: ["menu-item", "menu-button"],
};
