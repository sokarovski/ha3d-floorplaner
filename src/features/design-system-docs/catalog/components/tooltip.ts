import type { ComponentDoc } from "../docTypes";
import { TooltipExample } from "../../examples/TooltipExample";
import TooltipExampleSource from "../../examples/TooltipExample.tsx?raw";
import styleSource from "../../../../design-system/components/Tooltip/tooltip.tw.css?raw";

export const tooltipDoc: ComponentDoc = {
  slug: "tooltip",
  name: "Tooltip",
  category: "Overlays",
  purpose: "A delayed hover/focus label with an optional shortcut.",
  importPath: "src/design-system/components/Tooltip/Tooltip",
  whenToUse: "Icon-only controls such as tool buttons.",
  props: [
    { name: "content", type: "string", required: true, description: "Tooltip text." },
    { name: "shortcut", type: "string", required: false, description: "Shortcut hint." },
    {
      name: "placement",
      type: '"right" | "top" | "bottom" | "left"',
      required: false,
      defaultValue: '"right"',
      description: "Placement.",
    },
    {
      name: "children",
      type: "ReactNode",
      required: true,
      description: "A focusable React Aria trigger (Button, IconButton).",
    },
  ],
  examples: [
    {
      id: "tooltip-tooltip",
      title: "Tooltip",
      Example: TooltipExample,
      source: TooltipExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  related: ["tool-button"],
};
