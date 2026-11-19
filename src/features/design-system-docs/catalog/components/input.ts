import type { ComponentDoc } from "../docTypes";
import { InputExample } from "../../examples/InputExample";
import InputExampleSource from "../../examples/InputExample.tsx?raw";
import styleSource from "../../../../design-system/components/Input/input.tw.css?raw";

export const inputDoc: ComponentDoc = {
  slug: "input",
  name: "Input",
  category: "Forms",
  purpose:
    "Filled text input with invalid, disabled, monospace, alignment, and suffix states, and start/end adornments (labels, icons, keycaps) inside the field.",
  importPath: "src/design-system/components/Input/Input",
  whenToUse:
    "Inside FormField and every property editor. Not a form by itself: forms are built with SchemaForm.",
  props: [
    { name: "value", type: "string", required: true, description: "Controlled text value." },
    {
      name: "onChange",
      type: "(value: string) => void",
      required: true,
      description: "Called on every keystroke with the raw text.",
    },
    {
      name: "id",
      type: "string",
      required: false,
      description: "Associates the control with its FormField label.",
    },
    {
      name: "onBlur / onFocus / onKeyDown",
      type: "event handlers",
      required: false,
      description: "Native events, used by editors to commit on blur/Enter and revert on Escape.",
    },
    {
      name: "type",
      type: '"text" | "number" | "search" | "datetime-local"',
      required: false,
      defaultValue: '"text"',
      description: "Native type.",
    },
    { name: "placeholder", type: "string", required: false, description: "Placeholder text." },
    {
      name: "disabled / readOnly",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Native states.",
    },
    {
      name: "invalid",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Error state (aria-invalid and data-input-invalid).",
    },
    {
      name: "monospace",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Tabular digits for numeric readouts.",
    },
    {
      name: "align",
      type: '"start" | "end"',
      required: false,
      defaultValue: '"start"',
      description: "Text alignment.",
    },
    { name: "suffix", type: "string", required: false, description: "A unit shown at the end, e.g. mm." },
    {
      name: "start",
      type: "ReactNode",
      required: false,
      description:
        "Decorative content inside the field before the text (Phase 5.8): a short label (X, W) or an icon. Clicking it focuses the field; give the input a full aria-label.",
    },
    {
      name: "end",
      type: "ReactNode",
      required: false,
      description: "Decorative content after the text and suffix, such as a Keycap or an icon.",
    },
    {
      name: "aria-*",
      type: "string",
      required: false,
      description: "aria-label, aria-labelledby, aria-describedby.",
    },
    {
      name: "inputRef",
      type: "Ref<HTMLInputElement>",
      required: false,
      description: "Ref to the native input.",
    },
  ],
  examples: [
    {
      id: "input-states",
      title: "States",
      Example: InputExample,
      source: InputExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  related: ["form-field", "keycap"],
};
