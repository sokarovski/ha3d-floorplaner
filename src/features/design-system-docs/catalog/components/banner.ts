import type { ComponentDoc } from "../docTypes";
import { BannerExample } from "../../examples/BannerExample";
import BannerExampleSource from "../../examples/BannerExample.tsx?raw";
import styleSource from "../../../../design-system/components/Banner/banner.tw.css?raw";

export const bannerDoc: ComponentDoc = {
  slug: "banner",
  name: "Banner",
  category: "Feedback",
  purpose: "Inline status message with info, success, warning, and danger tones.",
  importPath: "src/design-system/components/Banner/Banner",
  whenToUse: "Form errors above a popup footer, save failures, repair warnings.",
  props: [
    {
      name: "tone",
      type: '"info" | "success" | "warning" | "danger"',
      required: false,
      defaultValue: '"info"',
      description: "Tone; danger uses role=alert, others role=status.",
    },
    { name: "children", type: "ReactNode", required: true, description: "Message." },
    { name: "actions", type: "ReactNode", required: false, description: "Optional buttons such as Retry." },
  ],
  examples: [
    {
      id: "banner-tones",
      title: "Tones",
      Example: BannerExample,
      source: BannerExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  related: ["form-popup"],
};
