import type { ComponentDoc } from "../docTypes";
import { IconGalleryExample } from "../../examples/IconGalleryExample";
import IconGalleryExampleSource from "../../examples/IconGalleryExample.tsx?raw";
import styleSource from "../../../../design-system/components/Icon/icon.tw.css?raw";

export const iconDoc: ComponentDoc = {
  slug: "icon",
  name: "Icon",
  category: "Feedback",
  purpose: "Inline stroke icons from one typed icon table.",
  importPath: "src/design-system/components/Icon/Icon",
  whenToUse:
    "Inside buttons, menus, and tree rows. Decorative by default; pass a label to make it an image with an accessible name.",
  props: [
    { name: "name", type: "IconName", required: true, description: "Icon key from icons.ts." },
    {
      name: "size",
      type: '"sm" | "md" | "lg"',
      required: false,
      defaultValue: '"md"',
      description: "Rendered size.",
    },
    {
      name: "label",
      type: "string",
      required: false,
      description: "When set, the icon is announced with this name; otherwise aria-hidden.",
    },
  ],
  examples: [
    {
      id: "icon-gallery",
      title: "Icon set",
      Example: IconGalleryExample,
      source: IconGalleryExampleSource,
      companions: [{ label: "Stylesheet", source: styleSource }],
    },
  ],
  related: ["icon-button"],
};
