import type { ComponentDoc } from "../docTypes";
import { PopupExample } from "../../examples/PopupExample";
import PopupExampleSource from "../../examples/PopupExample.tsx?raw";
import { PopupCustomFooterExample } from "../../examples/PopupCustomFooterExample";
import PopupCustomFooterExampleSource from "../../examples/PopupCustomFooterExample.tsx?raw";
import { PopupNonDismissableExample } from "../../examples/PopupNonDismissableExample";
import PopupNonDismissableExampleSource from "../../examples/PopupNonDismissableExample.tsx?raw";
import styleSource from "../../../../design-system/components/Popup/popup.tw.css?raw";

export const popupDoc: ComponentDoc = {
  slug: "popup",
  name: "Popup",
  category: "Overlays",
  purpose:
    "The one modal container: header (title, close), body, and footer (Cancel/Save or a custom footer).",
  importPath: "src/design-system/components/Popup/Popup",
  whenToUse: "Every modal in the application. Forms use FormPopup, which composes Popup.",
  props: [
    { name: "open", type: "boolean", required: true, description: "Controlled by the caller." },
    { name: "title", type: "string", required: true, description: "Header title and accessible name." },
    {
      name: "onClose",
      type: "() => void",
      required: false,
      description:
        "Close button, Escape, and Cancel call it. Omit it for a decision the user must make: there is then no close button or default Cancel, Escape does nothing, and the custom footer's buttons are the only way out.",
    },
    { name: "children", type: "ReactNode", required: true, description: "Body; scrolls when tall." },
    {
      name: "onSave",
      type: "() => void",
      required: false,
      description: "Shows the default footer's Save button.",
    },
    {
      name: "saveLabel / cancelLabel",
      type: "string",
      required: false,
      defaultValue: '"Save" / "Cancel"',
      description: "Footer labels.",
    },
    {
      name: "saveDisabled",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Disables Save.",
    },
    {
      name: "busy",
      type: "boolean",
      required: false,
      defaultValue: "false",
      description: "Shows progress on Save and blocks closing.",
    },
    { name: "footer", type: "ReactNode", required: false, description: "Replaces the default footer." },
    {
      name: "size",
      type: '"sm" | "md" | "lg" | "xl"',
      required: false,
      defaultValue: '"md"',
      description:
        "Minimum width (sm 24rem, md 32rem, lg 56rem, capped by the screen); xl is a fixed 80rem × 85% of the window for browsers such as the object picker, with the body scrolling inside. The popup widens to fit its footer buttons; the body and header never widen it, and footer buttons wrap when the screen is too narrow.",
    },
  ],
  examples: [
    {
      id: "popup-default",
      title: "Default footer",
      Example: PopupExample,
      source: PopupExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
    {
      id: "popup-custom",
      title: "Custom danger footer",
      Example: PopupCustomFooterExample,
      source: PopupCustomFooterExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
    {
      id: "popup-non-dismissable",
      title: "Non-dismissable (no onClose)",
      Example: PopupNonDismissableExample,
      source: PopupNonDismissableExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  keyboard: [
    "Escape: close (unless busy, or no onClose is given)",
    "Tab: focus stays inside the popup",
    "Focus returns to the opener on close",
    "Backdrop clicks never close it",
  ],
  related: ["form-popup", "button"],
};
