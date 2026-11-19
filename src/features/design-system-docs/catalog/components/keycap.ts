import type { ComponentDoc } from "../docTypes";
import { KeycapExample } from "../../examples/KeycapExample";
import KeycapExampleSource from "../../examples/KeycapExample.tsx?raw";
import styleSource from "../../../../design-system/components/Keycap/keycap.tw.css?raw";

export const keycapDoc: ComponentDoc = {
  slug: "keycap",
  name: "Keycap",
  category: "Forms",
  purpose: "A keyboard key or chord shown as a hint, inside a field (Input's end slot) or next to an action.",
  importPath: "src/design-system/components/Keycap/Keycap",
  whenToUse: "To show a shortcut. Tooltips already show tool shortcuts; use this inside fields and lists.",
  props: [
    { name: "children", type: "string", required: true, description: "The key as shown, e.g. ⌘K or Esc." },
    {
      name: "aria-label",
      type: "string",
      required: false,
      description: "A spoken name when the cap is a symbol (⇧ → Shift).",
    },
  ],
  examples: [
    {
      id: "keycap-keys",
      title: "Keys",
      Example: KeycapExample,
      source: KeycapExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  related: ["input"],
};
