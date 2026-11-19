import type { ComponentDoc } from "../docTypes";
import { SchemaFormBufferedExample } from "../../examples/SchemaFormBufferedExample";
import SchemaFormBufferedExampleSource from "../../examples/SchemaFormBufferedExample.tsx?raw";
import componentSource from "../../../../design-system/forms/SchemaForm/SchemaForm.tsx?raw";

export const schemaFormDoc: ComponentDoc = {
  slug: "schema-form",
  name: "SchemaForm",
  category: "Forms",
  purpose:
    "The one form builder: renders a JSON Schema with registered property editors, live (property panel) or buffered (popups).",
  importPath: "src/design-system/forms/SchemaForm/SchemaForm",
  whenToUse: "Every form. Never hand-code fields.",
  props: [
    {
      name: "schema",
      type: "object",
      required: true,
      description: "JSON Schema with x-homeplan annotations.",
    },
    { name: "value", type: "unknown", required: true, description: "Current values." },
    { name: "registry", type: "PropertyEditorRegistry", required: true, description: "Editors by name." },
    { name: "projectUnit", type: "LengthUnit", required: true, description: "Display/input unit." },
    {
      name: "mode",
      type: '"live" | "buffered"',
      required: true,
      description: "Inline labels and immediate commands, or stacked fields editing a draft.",
    },
    {
      name: "onCommit",
      type: "(path, value) => boolean",
      required: true,
      description: "One committed field.",
    },
    { name: "onPreview", type: "(path, value) => void", required: false, description: "Slider drags." },
    {
      name: "errors",
      type: "Record<pointer, string>",
      required: false,
      defaultValue: "{}",
      description: "Field errors by JSON Pointer.",
    },
    {
      name: "mixedPointers",
      type: "ReadonlySet<string>",
      required: false,
      defaultValue: "\u2205",
      description: "Pointers shown as Mixed.",
    },
    {
      name: "disabled",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Disable all fields.",
    },
  ],
  examples: [
    {
      id: "schema-form-buffered",
      title: "Buffered draft",
      Example: SchemaFormBufferedExample,
      source: SchemaFormBufferedExampleSource,
      companions: [{ label: "Component source", source: componentSource }],
    },
  ],
};
