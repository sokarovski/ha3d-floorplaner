import type { ComponentDoc } from "../docTypes";
import { PanelExample } from "../../examples/PanelExample";
import PanelExampleSource from "../../examples/PanelExample.tsx?raw";
import styleSource from "../../../../design-system/components/Panel/datapanel.tw.css?raw";

export const panelDoc: ComponentDoc = {
  slug: "panel",
  name: "Panel",
  category: "Layout",
  purpose: "A surface with a consistent heading, optional actions, and a scrolling body.",
  importPath: "src/design-system/components/Panel/Panel",
  whenToUse: "Overview tree, property panel, Images and History panels.",
  props: [
    {
      name: "title",
      type: "string",
      required: false,
      description: "Heading, also the region's accessible name.",
    },
    {
      name: "icon",
      type: "IconName",
      required: false,
      description:
        "An icon before the title, e.g. the properties panel's list icon before the object's name.",
    },
    { name: "actions", type: "ReactNode", required: false, description: "Buttons shown in the header." },
    { name: "children", type: "ReactNode", required: true, description: "Body." },
    {
      name: "scroll",
      type: "boolean",
      required: false,
      defaultValue: "true",
      description: "Body scrolls vertically.",
    },
    { name: "padded", type: "boolean", required: false, defaultValue: "true", description: "Body padding." },
    {
      name: "aria-label",
      type: "string",
      required: false,
      description: "Accessible name when there is no title.",
    },
  ],
  examples: [
    {
      id: "panel-panel",
      title: "Panel",
      Example: PanelExample,
      source: PanelExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  related: ["editor-layout"],
};
