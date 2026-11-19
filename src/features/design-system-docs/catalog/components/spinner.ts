import type { ComponentDoc } from "../docTypes";
import { SpinnerExample } from "../../examples/SpinnerExample";
import SpinnerExampleSource from "../../examples/SpinnerExample.tsx?raw";
import styleSource from "../../../../design-system/components/Spinner/spinner.tw.css?raw";

export const spinnerDoc: ComponentDoc = {
  slug: "spinner",
  name: "Spinner",
  category: "Feedback",
  purpose: "An indeterminate progress indicator.",
  importPath: "src/design-system/components/Spinner/Spinner",
  whenToUse: "Inside busy buttons and loading states.",
  props: [
    {
      name: "label",
      type: "string",
      required: false,
      defaultValue: '"Loading"',
      description: "Accessible status label.",
    },
  ],
  examples: [
    {
      id: "spinner-spinner",
      title: "Spinner",
      Example: SpinnerExample,
      source: SpinnerExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  related: ["button"],
};
