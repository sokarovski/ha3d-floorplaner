import type { ComponentDoc } from "../docTypes";
import { TreeExample } from "../../examples/TreeExample";
import TreeExampleSource from "../../examples/TreeExample.tsx?raw";
import styleSource from "../../../../design-system/components/Tree/datatree.tw.css?raw";

export const treeDoc: ComponentDoc = {
  slug: "tree",
  name: "Tree",
  category: "Navigation",
  purpose: "The house tree: expandable rows with controlled selection and expansion.",
  importPath: "src/design-system/components/Tree/Tree",
  whenToUse: "The Floor Builder overview; any hierarchical selection.",
  props: [
    { name: "label", type: "string", required: true, description: "Accessible name." },
    { name: "children", type: "ReactNode", required: true, description: "TreeItem elements." },
    { name: "selectedIds", type: "readonly string[]", required: true, description: "Controlled selection." },
    {
      name: "onSelectionChange",
      type: "(ids: readonly string[]) => void",
      required: true,
      description: "Selection changes.",
    },
    {
      name: "onAction",
      type: "(id: string) => void",
      required: false,
      description: "Activate a row with double-click or Enter; selection stays separate.",
    },
    { name: "expandedIds", type: "readonly string[]", required: true, description: "Controlled expansion." },
    {
      name: "onExpandedChange",
      type: "(ids: readonly string[]) => void",
      required: true,
      description: "Expansion changes.",
    },
    {
      name: "selectionMode",
      type: '"single" | "multiple"',
      required: false,
      defaultValue: '"single"',
      description: "Selection mode.",
    },
    {
      name: "disabledIds",
      type: "readonly string[]",
      required: false,
      defaultValue: "[]",
      description: "Rows that cannot be selected but still expand (e.g. outside the area being edited).",
    },
  ],
  examples: [
    {
      id: "tree-tree",
      title: "House tree with row actions",
      Example: TreeExample,
      source: TreeExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  keyboard: [
    "Arrow up/down: move",
    "Arrow right/left: expand/collapse",
    "Space: select",
    "Enter / double-click: activate when onAction is supplied",
  ],
  related: ["tree-item", "menu-button"],
};
