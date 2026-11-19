import type { ComponentDoc } from "../docTypes";
import { LengthInputExample } from "../../examples/LengthInputExample";
import LengthInputExampleSource from "../../examples/LengthInputExample.tsx?raw";
import componentSource from "../../../../design-system/property-editors/LengthInput/LengthInput.tsx?raw";

export const lengthInputDoc: ComponentDoc = {
  slug: "length-input",
  name: "LengthInput",
  category: "Forms",
  purpose:
    "Mixed-unit length field with live conversion; the building block of length and 2D-length editors.",
  importPath: "src/design-system/property-editors/LengthInput/LengthInput",
  whenToUse: "Inside editors; for forms use the length editor via SchemaForm.",
  props: [
    { name: "id", type: "string", required: true, description: "Control ID." },
    { name: "value", type: "number | undefined", required: true, description: "Millimeters." },
    { name: "unit", type: "LengthUnit", required: true, description: "Project unit." },
    { name: "limits", type: "NumericLimits", required: true, description: "Minimum/maximum in mm." },
    { name: "mixed / disabled", type: "boolean", required: true, description: "States." },
    {
      name: "onCommit",
      type: "(mm) => boolean",
      required: true,
      description: "Enter/blur commit; false keeps the draft.",
    },
  ],
  examples: [
    {
      id: "length-input-length",
      title: "Mixed-unit entry",
      Example: LengthInputExample,
      source: LengthInputExampleSource,
      companions: [{ label: "Component source", source: componentSource }],
    },
  ],
};
