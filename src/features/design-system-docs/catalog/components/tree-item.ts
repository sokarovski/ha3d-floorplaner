import type { ComponentDoc } from "../docTypes";
import { TreeExample } from "../../examples/TreeExample";
import TreeExampleSource from "../../examples/TreeExample.tsx?raw";
import styleSource from "../../../../design-system/components/TreeItem/treeitem.tw.css?raw";

export const treeItemDoc: ComponentDoc = {
  slug: "tree-item",
  name: "TreeItem",
  category: "Navigation",
  purpose:
    "One tree row: a disclosure triangle, its type icon, the name with an optional count, then action icons on the right, revealed on hover, selection, or focus.",
  importPath: "src/design-system/components/TreeItem/TreeItem",
  whenToUse: "Only inside Tree.",
  props: [
    { name: "id", type: "string", required: true, description: "Stable row ID (the object ID)." },
    { name: "label", type: "string", required: true, description: "Row text." },
    {
      name: "icon",
      type: "IconName",
      required: false,
      description: "Type icon, always shown before the name (it describes the row; it is not an action).",
    },
    {
      name: "badge",
      type: "ReactNode",
      required: false,
      description: "Short info shown right after the label, before the actions (for example a count: `(4)`).",
    },
    {
      name: "actions",
      type: "ReactNode",
      required: false,
      description:
        "Trailing row actions, visible on hover, selection, or focus. Their width never compresses the disclosure triangle.",
    },
    {
      name: "pinnedAction",
      type: "ReactNode",
      required: false,
      description:
        "One action that stays visible after the hover actions, for a state the row must show at all times (the builder's eye-off on a hidden row, which shows it again).",
    },
    {
      name: "warning",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Shows a warning marker (e.g. needs repair).",
    },
    {
      name: "muted",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Muted label (e.g. hidden guides, lights switched off, saved-Hidden items).",
    },
    {
      name: "faded",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description:
        "What the row stands for is not shown (e.g. hidden in the view): label and icon at half strength; the row stays selectable and keeps its actions.",
    },
    {
      name: "disabled",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description:
        "Greyed row without actions; list its ID in the Tree's disabledIds so it cannot be selected.",
    },
    {
      name: "containsSelection",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description:
        "A row above a selected row (Phase 7.4): its label turns strong and its icon takes the accent, so the path to the selection reads at a glance.",
    },
    {
      name: "children",
      type: "ReactNode",
      required: false,
      description: "Child rows; adds a fixed-width expand chevron immediately before the name.",
    },
  ],
  examples: [
    {
      id: "tree-item-tree",
      title: "Inside a Tree",
      Example: TreeExample,
      source: TreeExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  related: ["tree"],
};
