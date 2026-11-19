import type { ComponentDoc } from "../docTypes";
import { IconButtonExample } from "../../examples/IconButtonExample";
import IconButtonExampleSource from "../../examples/IconButtonExample.tsx?raw";
import styleSource from "../../../../design-system/components/IconButton/iconbutton.tw.css?raw";

export const iconButtonDoc: ComponentDoc = {
  slug: "icon-button",
  name: "IconButton",
  category: "Actions",
  purpose: "A compact icon-only action with a required accessible label.",
  importPath: "src/design-system/components/IconButton/IconButton",
  whenToUse: "Toolbar and tree-row actions where an icon is clear; the label becomes the accessible name.",
  props: [
    { name: "icon", type: "IconName", required: true, description: "Icon from the shared icon set." },
    { name: "label", type: "string", required: true, description: "Accessible name (aria-label)." },
    {
      name: "variant",
      type: '"ghost" | "secondary" | "danger"',
      required: false,
      defaultValue: '"ghost"',
      description: "Visual variant.",
    },
    {
      name: "size",
      type: '"sm" | "md"',
      required: false,
      defaultValue: '"md"',
      description: "Control size.",
    },
    {
      name: "disabled",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Disables the button.",
    },
    { name: "onPress", type: "() => void", required: false, description: "Activation handler." },
    {
      name: "slot",
      type: "string",
      required: false,
      description: "React Aria slot, e.g. inside a Popup header.",
    },
  ],
  examples: [
    {
      id: "icon-button-icons",
      title: "Icon buttons",
      Example: IconButtonExample,
      source: IconButtonExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  keyboard: ["Enter / Space: activate"],
  related: ["button", "icon"],
};
