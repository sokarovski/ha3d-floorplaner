import type { ComponentDoc } from "../docTypes";
import { EditorLayoutExample } from "../../examples/EditorLayoutExample";
import EditorLayoutExampleSource from "../../examples/EditorLayoutExample.tsx?raw";
import styleSource from "../../../../design-system/components/EditorLayout/dataeditorlayout.tw.css?raw";

export const editorLayoutDoc: ComponentDoc = {
  slug: "editor-layout",
  name: "EditorLayout",
  category: "Layout",
  purpose:
    "Header, left toolbox, central viewport, upper-right overview, lower-right properties, and a status bar.",
  importPath: "src/design-system/components/EditorLayout/EditorLayout",
  whenToUse: "The Floor Builder and the Object Editor.",
  props: [
    { name: "header", type: "ReactNode", required: true, description: "Top bar." },
    { name: "toolbox", type: "ReactNode", required: true, description: "Left column." },
    { name: "viewport", type: "ReactNode", required: true, description: "Central content." },
    { name: "overview", type: "ReactNode", required: true, description: "Upper-right panel." },
    { name: "properties", type: "ReactNode", required: true, description: "Lower-right panel." },
    { name: "status", type: "ReactNode", required: false, description: "Bottom status bar." },
    {
      name: "sideSplit",
      type: "number",
      required: false,
      defaultValue: "0.4",
      description: "The overview's share of the right column, 0.15–0.85 (Phase 7.4).",
    },
    {
      name: "onSideSplitChange",
      type: "(share: number) => void",
      required: false,
      description:
        "Shows a splitter between the overview and the properties; called with the new share when a drag ends or an arrow key moves it (5% per press). The builder stores it in the editor preferences.",
    },
  ],
  examples: [
    {
      id: "editor-layout-layout",
      title: "Layout regions",
      Example: EditorLayoutExample,
      source: EditorLayoutExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  related: ["panel", "toolbox"],
};
