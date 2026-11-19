import type { ComponentDoc } from "../docTypes";
import { EditorMessageExample } from "../../examples/EditorMessageExample";
import EditorMessageExampleSource from "../../examples/EditorMessageExample.tsx?raw";
import componentSource from "../../../../design-system/property-editors/EditorMessage/EditorMessage.tsx?raw";

export const editorMessageDoc: ComponentDoc = {
  slug: "editor-message",
  name: "EditorMessage",
  category: "Feedback",
  purpose: "Inline validation message under an editor (role=alert).",
  importPath: "src/design-system/property-editors/EditorMessage/EditorMessage",
  whenToUse: "Inside editors.",
  props: [
    { name: "message", type: "string | undefined", required: true, description: "Hidden when undefined." },
    { name: "id", type: "string", required: false, description: "For aria-describedby." },
  ],
  examples: [
    {
      id: "editor-message-message",
      title: "Message",
      Example: EditorMessageExample,
      source: EditorMessageExampleSource,
      companions: [{ label: "Component source", source: componentSource }],
    },
  ],
};
