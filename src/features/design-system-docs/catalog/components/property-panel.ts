import type { ComponentDoc } from "../docTypes";
import { PropertyPanelPlaygroundExample } from "../../examples/PropertyPanelPlaygroundExample";
import PropertyPanelPlaygroundExampleSource from "../../examples/PropertyPanelPlaygroundExample.tsx?raw";
import { TemplateSettingsPanelExample } from "../../examples/TemplateSettingsPanelExample";
import TemplateSettingsPanelExampleSource from "../../examples/TemplateSettingsPanelExample.tsx?raw";
import templateSettingsFixturesSource from "../templateSettingsFixtures.ts?raw";
import { StackedSectionsExample } from "../../examples/StackedSectionsExample";
import StackedSectionsExampleSource from "../../examples/StackedSectionsExample.tsx?raw";
import panelFixturesSource from "../panelFixtures.ts?raw";
import formFieldStyleSource from "../../../../design-system/components/FormField/dataformfield.tw.css?raw";
import componentSource from "../../../../design-system/forms/PropertyPanel/PropertyPanel.tsx?raw";

export const propertyPanelDoc: ComponentDoc = {
  slug: "property-panel",
  name: "PropertyPanel",
  category: "Forms",
  purpose: "The live use of SchemaForm for the selection; no per-type code.",
  importPath: "src/design-system/forms/PropertyPanel/PropertyPanel",
  whenToUse: "The Floor Builder and Object Editor properties.",
  props: [
    { name: "title", type: "string", required: true, description: "Panel title." },
    { name: "subtitle", type: "string", required: false, description: "Selection description." },
    {
      name: "schema",
      type: "object | undefined",
      required: true,
      description: "Undefined shows the empty message.",
    },
    { name: "value", type: "unknown", required: true, description: "Selected object." },
    { name: "registry", type: "PropertyEditorRegistry", required: true, description: "Editors." },
    { name: "projectUnit", type: "LengthUnit", required: true, description: "Unit." },
    {
      name: "onCommit",
      type: "(path, value) => boolean",
      required: true,
      description: "One undoable command per field.",
    },
    {
      name: "mixedPointers",
      type: "ReadonlySet<string>",
      required: false,
      description: "Mixed values in a multi-selection.",
    },
    {
      name: "before / after",
      type: "ReactNode",
      required: false,
      description: "Feature sections (warnings, actions).",
    },
  ],
  examples: [
    {
      id: "property-panel-playground",
      title: "Wall, Light, window template",
      Example: PropertyPanelPlaygroundExample,
      source: PropertyPanelPlaygroundExampleSource,
      companions: [{ label: "Component source", source: componentSource }],
    },
    {
      id: "property-panel-template-settings",
      title: "Template settings (Phase 9.1)",
      description:
        "A placed object's panel generated from its template metadata: Size (axis parameters with quick picks), Settings (integer with quick picks, on/off, titled choice, bare enum shown as a segmented control), State (an angle with quick picks), and Materials (a choosable slot with preset swatches, own colour, and own texture). Help texts come from the parameters' descriptions.",
      Example: TemplateSettingsPanelExample,
      source: TemplateSettingsPanelExampleSource,
      companions: [
        { label: "Template fixture", source: templateSettingsFixturesSource },
        { label: "Component source", source: componentSource },
      ],
    },
    {
      id: "property-panel-sections",
      title: "Stacked sections (Phase 19.7)",
      description:
        "Composite editors (material, material choice, location) are sections: their title is a 13 px semibold sentence-case heading in foreground with space above, so a roof's Top, Underside and Sides materials (or a wall's Interior and Exterior) read as separate blocks inside the Materials group. The group header (14 px, with its chevron) stays above the section titles; sections are separated by space, not lines. A material that is its group's only field (a room's Flooring) keeps the group title and shows no section title.",
      Example: StackedSectionsExample,
      source: StackedSectionsExampleSource,
      companions: [
        { label: "Fixtures", source: panelFixturesSource },
        { label: "FormField stylesheet", source: formFieldStyleSource },
        { label: "Component source", source: componentSource },
      ],
    },
  ],
};
