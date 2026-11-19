import type { ComponentDoc } from "../docTypes";
import { DiscardChangesPopupExample } from "../../examples/DiscardChangesPopupExample";
import DiscardChangesPopupExampleSource from "../../examples/DiscardChangesPopupExample.tsx?raw";
import componentSource from "../../../../design-system/forms/DiscardChangesPopup/DiscardChangesPopup.tsx?raw";

export const discardChangesPopupDoc: ComponentDoc = {
  slug: "discard-changes-popup",
  name: "DiscardChangesPopup",
  category: "Overlays",
  purpose: "Confirmation shown when closing a changed form.",
  importPath: "src/design-system/forms/DiscardChangesPopup/DiscardChangesPopup",
  whenToUse: "Used by FormPopup.",
  props: [
    { name: "open", type: "boolean", required: true, description: "Visibility." },
    { name: "onKeepEditing", type: "() => void", required: true, description: "Return to the form." },
    { name: "onDiscard", type: "() => void", required: true, description: "Drop the draft." },
  ],
  examples: [
    {
      id: "discard-changes-popup-discard",
      title: "Discard prompt",
      Example: DiscardChangesPopupExample,
      source: DiscardChangesPopupExampleSource,
      companions: [{ label: "Component source", source: componentSource }],
    },
  ],
};
