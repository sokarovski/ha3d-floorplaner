import type { ComponentDoc } from "../docTypes";
import { PropertyGroupExample } from "../../examples/PropertyGroupExample";
import PropertyGroupExampleSource from "../../examples/PropertyGroupExample.tsx?raw";
import componentSource from "../../../../design-system/forms/PropertyGroup/PropertyGroup.tsx?raw";

export const propertyGroupDoc: ComponentDoc = {
  slug: "property-group",
  name: "PropertyGroup",
  category: "Forms",
  purpose: "A collapsible titled section of fields.",
  importPath: "src/design-system/forms/PropertyGroup/PropertyGroup",
  whenToUse: "Groups declared by x-homeplan groups.",
  props: [
    { name: "title", type: "string", required: true, description: "Heading." },
    { name: "children", type: "ReactNode", required: true, description: "Fields." },
    {
      name: "defaultExpanded",
      type: "boolean",
      required: false,
      defaultValue: "true",
      description: "Initial state (groups without a groupId).",
    },
    {
      name: "groupId",
      type: "string",
      required: false,
      description:
        "A catalog group ID (Phase 5.7). Collapsing is remembered for the session by this ID, across object types.",
    },
  ],
  examples: [
    {
      id: "property-group-groups",
      title: "Expanded and collapsed",
      Example: PropertyGroupExample,
      source: PropertyGroupExampleSource,
      companions: [{ label: "Component source", source: componentSource }],
    },
  ],
};
