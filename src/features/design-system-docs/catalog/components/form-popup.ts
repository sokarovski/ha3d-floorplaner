import type { ComponentDoc } from "../docTypes";
import { MvpFormsExample } from "../../examples/MvpFormsExample";
import MvpFormsExampleSource from "../../examples/MvpFormsExample.tsx?raw";
import componentSource from "../../../../design-system/forms/FormPopup/FormPopup.tsx?raw";

export const formPopupDoc: ComponentDoc = {
  slug: "form-popup",
  name: "FormPopup",
  category: "Overlays",
  purpose:
    "Popup + buffered SchemaForm: values in, validated values out; server field errors map back by JSON Pointer.",
  importPath: "src/design-system/forms/FormPopup/FormPopup",
  whenToUse: "Every popup form (New house, Upload image, Export PNG\u2026).",
  props: [
    { name: "open", type: "boolean", required: true, description: "Controlled by the caller." },
    {
      name: "schema",
      type: "TSchema",
      required: true,
      description: "Form configuration; root x-homeplan sets title, submit label, size.",
    },
    {
      name: "values",
      type: "Partial<Static<S>>",
      required: true,
      description: "Initial values; defaults fill the rest.",
    },
    {
      name: "onSubmit",
      type: "(values) => Promise<void>",
      required: true,
      description: "Runs after whole-form validation; rejection keeps the draft.",
    },
    {
      name: "onCancel",
      type: "() => void",
      required: true,
      description: "Cancel, close, Escape (asks before discarding changes).",
    },
    {
      name: "registry",
      type: "PropertyEditorRegistry",
      required: false,
      defaultValue: "generic editors",
      description: "Editor registry.",
    },
    {
      name: "projectUnit",
      type: "LengthUnit",
      required: false,
      defaultValue: '"mm"',
      description: "Unit for lengths.",
    },
    { name: "footer", type: "ReactNode", required: false, description: "Custom footer." },
  ],
  examples: [
    {
      id: "form-popup-mvp",
      title: "Every MVP form",
      Example: MvpFormsExample,
      source: MvpFormsExampleSource,
      companions: [{ label: "Component source", source: componentSource }],
    },
  ],
};
