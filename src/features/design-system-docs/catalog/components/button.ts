import type { ComponentDoc } from "../docTypes";
import { ButtonVariantsExample } from "../../examples/ButtonVariantsExample";
import ButtonVariantsExampleSource from "../../examples/ButtonVariantsExample.tsx?raw";
import { ButtonStatesExample } from "../../examples/ButtonStatesExample";
import ButtonStatesExampleSource from "../../examples/ButtonStatesExample.tsx?raw";
import styleSource from "../../../../design-system/components/Button/button.tw.css?raw";

export const buttonDoc: ComponentDoc = {
  slug: "button",
  name: "Button",
  category: "Actions",
  purpose: "The native action control with typed variants.",
  importPath: "src/design-system/components/Button/Button",
  whenToUse:
    "Any text action. Use primary for the main action of a context, secondary for alternatives, danger for destructive confirmation, ghost inside toolbars.",
  props: [
    { name: "children", type: "ReactNode", required: true, description: "Button text and optional icon." },
    {
      name: "variant",
      type: '"primary" | "secondary" | "danger" | "ghost"',
      required: false,
      defaultValue: '"primary"',
      description: "Visual variant, emitted as one data-button-* attribute.",
    },
    {
      name: "size",
      type: '"sm" | "md"',
      required: false,
      defaultValue: '"md"',
      description: "Control height.",
    },
    {
      name: "type",
      type: '"button" | "submit"',
      required: false,
      defaultValue: '"button"',
      description: "Native button type.",
    },
    {
      name: "disabled",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Disables the button natively.",
    },
    {
      name: "busy",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Shows a spinner and disables the button while an action runs.",
    },
    {
      name: "onPress",
      type: "() => void",
      required: false,
      description: "Called on mouse, touch, or keyboard activation (React Aria press events).",
    },
    {
      name: "aria-label",
      type: "string",
      required: false,
      description: "Accessible name when the text alone is not descriptive.",
    },
    { name: "autoFocus", type: "boolean", required: false, description: "Focus on mount." },
  ],
  examples: [
    {
      id: "button-variants",
      title: "Variants",
      Example: ButtonVariantsExample,
      source: ButtonVariantsExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
    {
      id: "button-states",
      title: "States and sizes",
      Example: ButtonStatesExample,
      source: ButtonStatesExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  keyboard: ["Enter / Space: activate"],
  related: ["icon-button", "spinner"],
};
