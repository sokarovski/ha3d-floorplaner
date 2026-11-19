import type { ComponentDoc } from "../docTypes";
import { FormFieldExample } from "../../examples/FormFieldExample";
import FormFieldExampleSource from "../../examples/FormFieldExample.tsx?raw";
import styleSource from "../../../../design-system/components/FormField/dataformfield.tw.css?raw";

export const formFieldDoc: ComponentDoc = {
  slug: "form-field",
  name: "FormField",
  category: "Forms",
  purpose: "Label, control association, description, hint, and validation feedback around one control.",
  importPath: "src/design-system/components/FormField/FormField",
  whenToUse:
    "Wraps every editor control. Stacked in popups, inline in the property panel; composite editors are sections in both.",
  props: [
    { name: "label", type: "string", required: true, description: "Visible label." },
    { name: "htmlFor", type: "string", required: false, description: "ID of the labelled control." },
    {
      name: "labelId",
      type: "string",
      required: false,
      description: "ID for aria-labelledby on composite controls.",
    },
    {
      name: "description / descriptionId",
      type: "string",
      required: false,
      description: "Help text and its ID for aria-describedby.",
    },
    {
      name: "error / errorId",
      type: "string",
      required: false,
      description: "Validation message (role=alert) and its ID.",
    },
    {
      name: "required",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Shows a required marker.",
    },
    {
      name: "hint",
      type: "ReactNode",
      required: false,
      description: "Live readout, e.g. a converted length.",
    },
    {
      name: "layout",
      type: '"stacked" | "inline" | "section"',
      required: false,
      defaultValue: '"stacked"',
      description:
        'Label above or beside the control; "section" (Phase 19.7) makes the label a semibold section title (13 px, foreground) with space above, for composite editors (materials, location).',
    },
    { name: "children", type: "ReactNode", required: true, description: "The control." },
  ],
  examples: [
    {
      id: "form-field-field",
      title: "Field with validation and hint; inline; sections",
      Example: FormFieldExample,
      source: FormFieldExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  related: ["input"],
};
