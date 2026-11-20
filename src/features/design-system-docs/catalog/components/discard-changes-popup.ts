import type { ComponentDoc } from "../docTypes";
import { DiscardChangesPopupExample } from "../../examples/DiscardChangesPopupExample";
import DiscardChangesPopupExampleSource from "../../examples/DiscardChangesPopupExample.tsx?raw";
import { DiscardChangesPopupSaveExample } from "../../examples/DiscardChangesPopupSaveExample";
import DiscardChangesPopupSaveExampleSource from "../../examples/DiscardChangesPopupSaveExample.tsx?raw";
import componentSource from "../../../../design-system/forms/DiscardChangesPopup/DiscardChangesPopup.tsx?raw";

export const discardChangesPopupDoc: ComponentDoc = {
  slug: "discard-changes-popup",
  name: "DiscardChangesPopup",
  category: "Overlays",
  purpose: "Confirmation shown when closing a changed form.",
  importPath: "src/design-system/forms/DiscardChangesPopup/DiscardChangesPopup",
  whenToUse:
    "Used by FormPopup. With onSave it also offers Save (the material chooser: another material chosen while the edited one has unsaved changes).",
  props: [
    { name: "open", type: "boolean", required: true, description: "Visibility." },
    { name: "onKeepEditing", type: "() => void", required: true, description: "Return to the form." },
    { name: "onDiscard", type: "() => void", required: true, description: "Drop the draft." },
    {
      name: "onSave",
      type: "() => void",
      required: false,
      description: "Shows Save first: save, then continue.",
    },
    { name: "title", type: "string", required: false, description: 'Default "Discard changes?".' },
    { name: "message", type: "string", required: false, description: "The sentence in the popup." },
    {
      name: "keepLabel",
      type: "string",
      required: false,
      description: 'The keep-editing button (default "Keep editing"; "Cancel" beside Save).',
    },
  ],
  examples: [
    {
      id: "discard-changes-popup-discard",
      title: "Discard prompt",
      Example: DiscardChangesPopupExample,
      source: DiscardChangesPopupExampleSource,
      companions: [{ label: "Component source", source: componentSource }],
    },
    {
      id: "discard-changes-popup-save",
      title: "Save, Cancel or Discard",
      Example: DiscardChangesPopupSaveExample,
      source: DiscardChangesPopupSaveExampleSource,
      companions: [{ label: "Component source", source: componentSource }],
    },
  ],
};
