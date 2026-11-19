import type { ComponentDoc } from "../docTypes";
import { ToolboxExample } from "../../examples/ToolboxExample";
import ToolboxExampleSource from "../../examples/ToolboxExample.tsx?raw";
import styleSource from "../../../../design-system/components/ToolButton/toolbutton.tw.css?raw";

export const toolButtonDoc: ComponentDoc = {
  slug: "tool-button",
  name: "ToolButton",
  category: "Actions",
  purpose: "An icon tool with a visible active state, tooltip, and shortcut hint.",
  importPath: "src/design-system/components/ToolButton/ToolButton",
  whenToUse: "Inside Toolbox.",
  props: [
    { name: "icon", type: "IconName", required: true, description: "Tool icon." },
    { name: "label", type: "string", required: true, description: "Accessible name and tooltip." },
    {
      name: "active",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Active tool (aria-pressed and data-tool-button-active).",
    },
    { name: "shortcut", type: "string", required: false, description: "Shortcut hint in the tooltip." },
    { name: "disabled", type: "boolean", required: false, defaultValue: "false", description: "Disabled." },
    {
      name: "temporary",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description:
        "The shown state holds only while a key is down (dashed ring; data-tool-button-temporary). Used when Shift flips Auto-select in Nudge and Rotate.",
    },
    {
      name: "badge",
      type: "string",
      required: false,
      description: "A small decorative mark in the corner, such as ⇧. Put its meaning in label too.",
    },
    { name: "onPress", type: "() => void", required: true, description: "Activate the tool." },
  ],
  examples: [
    {
      id: "tool-button-toolbox",
      title: "Inside a Toolbox",
      Example: ToolboxExample,
      source: ToolboxExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  related: ["toolbox", "tooltip"],
};
