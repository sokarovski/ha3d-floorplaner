import type { ComponentDoc } from "../docTypes";
import { ToolboxExample } from "../../examples/ToolboxExample";
import ToolboxExampleSource from "../../examples/ToolboxExample.tsx?raw";
import styleSource from "../../../../design-system/components/Toolbox/datatoolbox.tw.css?raw";

export const toolboxDoc: ComponentDoc = {
  slug: "toolbox",
  name: "Toolbox",
  category: "Layout",
  purpose: "The context-aware tool column (vertical) or a horizontal tool row.",
  importPath: "src/design-system/components/Toolbox/Toolbox",
  whenToUse: "The editor's left toolbox and small view toggles.",
  props: [
    {
      name: "children",
      type: "ReactNode",
      required: true,
      description: "ToolButton elements and separators.",
    },
    { name: "label", type: "string", required: true, description: "Accessible toolbar name." },
    {
      name: "orientation",
      type: '"vertical" | "horizontal"',
      required: false,
      defaultValue: '"vertical"',
      description: "Layout direction.",
    },
    {
      name: "footer",
      type: "ReactNode",
      required: false,
      description:
        "Buttons pinned to the end (the editor's camera buttons), after a separator. The tools above scroll when the toolbox is short; the footer stays.",
    },
  ],
  examples: [
    {
      id: "toolbox-toolbox",
      title: "Vertical with a pinned footer, and horizontal",
      Example: ToolboxExample,
      source: ToolboxExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  related: ["tool-button", "editor-layout"],
};
