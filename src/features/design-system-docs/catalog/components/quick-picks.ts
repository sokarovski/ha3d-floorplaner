import type { ComponentDoc } from "../docTypes";
import { QuickPicksExample } from "../../examples/QuickPicksExample";
import QuickPicksExampleSource from "../../examples/QuickPicksExample.tsx?raw";
import componentSource from "../../../../design-system/property-editors/QuickPicks/QuickPicks.tsx?raw";

export const quickPicksDoc: ComponentDoc = {
  slug: "quick-picks",
  name: "QuickPicks",
  category: "Forms",
  purpose:
    "Suggested values as a compact chip row under a number, length, or angle field (Phase 9.1, template quickPicks such as standard bed widths); one click commits.",
  importPath: "src/design-system/property-editors/QuickPicks/QuickPicks",
  whenToUse:
    'Inside editors: the length, number, and angle editors show it when the schema\'s x-homeplan has "quickPicks". Any other value can still be typed.',
  props: [
    { name: "label", type: "string", required: true, description: "Accessible name of the row." },
    {
      name: "picks",
      type: "{ value: number; text: string }[]",
      required: true,
      description: "Values and their display text, formatted by the editor (project unit, °).",
    },
    {
      name: "value",
      type: "number | undefined",
      required: true,
      description: "Committed value; the matching chip is selected (none when mixed or between picks).",
    },
    { name: "disabled", type: "boolean", required: true, description: "Disabled or read-only." },
    { name: "onPick", type: "(value) => void", required: true, description: "Commits the chosen value." },
  ],
  examples: [
    {
      id: "quick-picks-states",
      title: "Bed widths in cm, disabled",
      Example: QuickPicksExample,
      source: QuickPicksExampleSource,
      companions: [{ label: "Component source", source: componentSource }],
    },
  ],
  keyboard: ["Tab moves to the row; arrow keys move between chips; Space or Enter picks."],
  accessibility: "A React Aria ToggleButtonGroup with single selection; the chosen chip is pressed.",
  related: ["length-input"],
};
