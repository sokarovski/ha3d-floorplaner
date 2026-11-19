import type { ComponentDoc } from "../docTypes";
import { SwatchPickerExample } from "../../examples/SwatchPickerExample";
import SwatchPickerExampleSource from "../../examples/SwatchPickerExample.tsx?raw";
import componentSource from "../../../../design-system/components/SwatchPicker/SwatchPicker.tsx?raw";

export const swatchPickerDoc: ComponentDoc = {
  slug: "swatch-picker",
  name: "SwatchPicker",
  category: "Forms",
  purpose:
    "One choice among named finishes shown as round colour swatches with their names (Phase 9.1, template material presets). A textured finish shows fine lines over its colour; a custom choice (own colour or texture) shows a colour wheel.",
  importPath: "src/design-system/components/SwatchPicker/SwatchPicker",
  whenToUse: "Inside the materialChoice editor; anywhere a few named finishes are picked by look.",
  props: [
    { name: "label", type: "string", required: true, description: "Accessible name of the group." },
    {
      name: "options",
      type: "SwatchOption[]",
      required: true,
      description: "id, label, color (sRGB 0–255, null = custom), textured.",
    },
    { name: "value", type: "string | null", required: true, description: "Chosen ID; null when mixed." },
    { name: "disabled", type: "boolean", required: false, defaultValue: "false", description: "Disabled." },
    { name: "describedBy", type: "string", required: false, description: "aria-describedby IDs." },
    { name: "onChange", type: "(id) => void", required: true, description: "A swatch was chosen." },
  ],
  examples: [
    {
      id: "swatch-picker-states",
      title: "Finishes, mixed, disabled",
      Example: SwatchPickerExample,
      source: SwatchPickerExampleSource,
      companions: [{ label: "Component source", source: componentSource }],
    },
  ],
  keyboard: ["Tab moves into the group; arrow keys move and choose."],
  accessibility: "A React Aria RadioGroup (RadioField + RadioButton); each swatch is named by its label.",
};
