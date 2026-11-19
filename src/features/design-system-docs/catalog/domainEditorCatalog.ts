// Domain editor pages, rendered with fixture house data.
import type { PropertyEditorDoc } from "./propertyEditorCatalog";
import { domainEditorFixtures } from "./domainEditorFixtures";
import { MaterialEditorExample } from "../examples/MaterialEditorExample";
import MaterialEditorExampleSource from "../examples/MaterialEditorExample.tsx?raw";
import { MaterialChoiceEditorExample } from "../examples/MaterialChoiceEditorExample";
import MaterialChoiceEditorExampleSource from "../examples/MaterialChoiceEditorExample.tsx?raw";
import { ImageEditorExample } from "../examples/ImageEditorExample";
import ImageEditorExampleSource from "../examples/ImageEditorExample.tsx?raw";
import { LocationEditorExample } from "../examples/LocationEditorExample";
import LocationEditorExampleSource from "../examples/LocationEditorExample.tsx?raw";
import { ReferenceEditorExample } from "../examples/ReferenceEditorExample";
import ReferenceEditorExampleSource from "../examples/ReferenceEditorExample.tsx?raw";
import { ReferenceMultipleEditorExample } from "../examples/ReferenceMultipleEditorExample";
import ReferenceMultipleEditorExampleSource from "../examples/ReferenceMultipleEditorExample.tsx?raw";
import { TemplateVersionEditorExample } from "../examples/TemplateVersionEditorExample";
import TemplateVersionEditorExampleSource from "../examples/TemplateVersionEditorExample.tsx?raw";
import { FixtureEditorExample } from "../examples/FixtureEditorExample";
import FixtureEditorExampleSource from "../examples/FixtureEditorExample.tsx?raw";
import { LampPowerEditorExample } from "../examples/LampPowerEditorExample";
import LampPowerEditorExampleSource from "../examples/LampPowerEditorExample.tsx?raw";
import dataSource from "../../floor-builder/domain-editors/domainEditorData.ts?raw";

export const domainEditorDocs: readonly PropertyEditorDoc[] = [
  {
    slug: "material",
    editor: "material",
    name: "MaterialPropEditor",
    category: "Property editors",
    purpose:
      "A surface material (D19): texture, tint, Shininess, metallic, and placement as one nested schema form, with a preset menu (apply copies values; Save as preset).",
    importPath: "src/features/floor-builder/domain-editors/MaterialPropEditor",
    whenToUse: "Domain editor: lives in feature code and reads house data through DomainEditorDataContext.",
    commitBehavior:
      "Each nested field commits the whole material as one command; choosing a preset copies its values.",
    schemaSnippet: JSON.stringify(domainEditorFixtures.material, null, 2),
    props: [
      {
        name: "(editor contract)",
        type: "PropertyEditorProps",
        required: true,
        description: "Same contract as every editor; see Contract and registry.",
      },
    ],
    examples: [
      {
        id: "material-states",
        title: "States (fixture data)",
        Example: MaterialEditorExample,
        source: MaterialEditorExampleSource,
        companions: [{ label: "Domain editor data", source: dataSource }],
      },
    ],
  },
  {
    slug: "materialChoice",
    editor: "materialChoice",
    name: "MaterialChoicePropEditor",
    category: "Property editors",
    purpose:
      "A template material slot offered for choice (Phase 9.1): the slot's own material and its bundled presets as swatches, then Own colour and Own texture when the template allows them, with the material fields for an own choice.",
    importPath: "src/features/floor-builder/domain-editors/MaterialChoicePropEditor",
    whenToUse:
      "Generated for every choosable slot of a placed object's template (materialOverrides.<slot>); never hand-coded per template.",
    commitBehavior:
      "The slot's own material removes the override; a preset commits { preset: name }; Own colour or Own texture commits a surface material (D19), whose fields then commit it whole.",
    schemaSnippet: JSON.stringify(domainEditorFixtures.materialChoice, null, 2),
    props: [
      {
        name: "(editor contract)",
        type: "PropertyEditorProps",
        required: true,
        description: "Same contract as every editor; the choices come from x-homeplan materialChoice.",
      },
    ],
    examples: [
      {
        id: "materialChoice-states",
        title: "States (fixture cabinet doors)",
        Example: MaterialChoiceEditorExample,
        source: MaterialChoiceEditorExampleSource,
        companions: [{ label: "Domain editor data", source: dataSource }],
      },
    ],
  },
  {
    slug: "image",
    editor: "image",
    name: "ImagePropEditor",
    category: "Property editors",
    purpose:
      "Picks a house image or a built-in texture (builtinimg_…, shown below the house images) as a texture, or uploads one (the upload is outside model history).",
    importPath: "src/features/floor-builder/domain-editors/ImagePropEditor",
    whenToUse: "Domain editor: lives in feature code and reads house data through DomainEditorDataContext.",
    commitBehavior: "Choosing an image commits its ID; No texture commits an empty value.",
    schemaSnippet: JSON.stringify(domainEditorFixtures.image, null, 2),
    props: [
      {
        name: "(editor contract)",
        type: "PropertyEditorProps",
        required: true,
        description: "Same contract as every editor; see Contract and registry.",
      },
    ],
    examples: [
      {
        id: "image-states",
        title: "States (fixture data)",
        Example: ImageEditorExample,
        source: ImageEditorExampleSource,
        companions: [{ label: "Domain editor data", source: dataSource }],
      },
    ],
  },
  {
    slug: "location",
    editor: "location",
    name: "LocationPropEditor",
    category: "Property editors",
    purpose:
      "House location: latitude, longitude, and IANA time zone. New houses start in London; anyone else pastes their own coordinates.",
    importPath: "src/features/floor-builder/domain-editors/LocationPropEditor",
    whenToUse: "Domain editor: lives in feature code and reads house data through DomainEditorDataContext.",
    commitBehavior:
      "Each field commits the full location (coordinates and time zone), without the legacy country and city labels.",
    schemaSnippet: JSON.stringify(domainEditorFixtures.location, null, 2),
    props: [
      {
        name: "(editor contract)",
        type: "PropertyEditorProps",
        required: true,
        description: "Same contract as every editor; see Contract and registry.",
      },
    ],
    examples: [
      {
        id: "location-states",
        title: "States (fixture data)",
        Example: LocationEditorExample,
        source: LocationEditorExampleSource,
        companions: [{ label: "Domain editor data", source: dataSource }],
      },
    ],
  },
  {
    slug: "reference",
    editor: "reference",
    name: "ReferencePropEditor",
    category: "Property editors",
    purpose: "A stable ID of another object (attachment wall), chosen from the house.",
    importPath: "src/features/floor-builder/domain-editors/ReferencePropEditor",
    whenToUse: "Domain editor: lives in feature code and reads house data through DomainEditorDataContext.",
    commitBehavior: "Choosing an option commits its ID.",
    schemaSnippet: JSON.stringify(domainEditorFixtures.reference, null, 2),
    props: [
      {
        name: "(editor contract)",
        type: "PropertyEditorProps",
        required: true,
        description: "Same contract as every editor; see Contract and registry.",
      },
    ],
    examples: [
      {
        id: "reference-states",
        title: "States (fixture data)",
        Example: ReferenceEditorExample,
        source: ReferenceEditorExampleSource,
        companions: [{ label: "Domain editor data", source: dataSource }],
      },
    ],
  },
  {
    slug: "reference-multiple",
    editor: "reference",
    name: "ReferencePropEditor",
    category: "Property editors",
    purpose: "A set of object IDs (light group members), via x-homeplan multiple.",
    importPath: "src/features/floor-builder/domain-editors/ReferencePropEditor",
    whenToUse: "Domain editor: lives in feature code and reads house data through DomainEditorDataContext.",
    commitBehavior: "Toggling a member commits the new ID list.",
    schemaSnippet: JSON.stringify(domainEditorFixtures.referenceMultiple, null, 2),
    props: [
      {
        name: "(editor contract)",
        type: "PropertyEditorProps",
        required: true,
        description: "Same contract as every editor; see Contract and registry.",
      },
    ],
    examples: [
      {
        id: "reference-multiple-states",
        title: "States (fixture data)",
        Example: ReferenceMultipleEditorExample,
        source: ReferenceMultipleEditorExampleSource,
        companions: [{ label: "Domain editor data", source: dataSource }],
      },
    ],
  },
  {
    slug: "templateVersion",
    editor: "templateVersion",
    name: "TemplateVersionPropEditor",
    category: "Property editors",
    purpose:
      "A template reference with its pinned version and \u201cUpdate to vN\u201d when a newer version exists (D07).",
    importPath: "src/features/floor-builder/domain-editors/TemplateVersionPropEditor",
    whenToUse: "Domain editor: lives in feature code and reads house data through DomainEditorDataContext.",
    commitBehavior: "Update to vN runs one undoable command.",
    schemaSnippet: JSON.stringify(domainEditorFixtures.templateVersion, null, 2),
    props: [
      {
        name: "(editor contract)",
        type: "PropertyEditorProps",
        required: true,
        description: "Same contract as every editor; see Contract and registry.",
      },
    ],
    examples: [
      {
        id: "templateVersion-states",
        title: "States (fixture data)",
        Example: TemplateVersionEditorExample,
        source: TemplateVersionEditorExampleSource,
        companions: [{ label: "Domain editor data", source: dataSource }],
      },
    ],
  },
  {
    slug: "fixture",
    editor: "templateVersion",
    name: "TemplateVersionPropEditor",
    category: "Property editors",
    purpose: "A light's fixture template, or none for an invisible source.",
    importPath: "src/features/floor-builder/domain-editors/TemplateVersionPropEditor",
    whenToUse: "Domain editor: lives in feature code and reads house data through DomainEditorDataContext.",
    commitBehavior: "Choose opens the fixture picker; Remove commits null.",
    schemaSnippet: JSON.stringify(domainEditorFixtures.fixture, null, 2),
    props: [
      {
        name: "(editor contract)",
        type: "PropertyEditorProps",
        required: true,
        description: "Same contract as every editor; see Contract and registry.",
      },
    ],
    examples: [
      {
        id: "fixture-states",
        title: "States (fixture data)",
        Example: FixtureEditorExample,
        source: FixtureEditorExampleSource,
        companions: [{ label: "Domain editor data", source: dataSource }],
      },
    ],
  },
  {
    slug: "lampPower",
    editor: "lampPower",
    name: "LampPowerPropEditor",
    category: "Property editors",
    purpose:
      "A light's lamp power (Phase 8.9): the presets of the owning light's lamp type, shown as “watts · lumens”.",
    importPath: "src/features/floor-builder/domain-editors/LampPowerPropEditor",
    whenToUse:
      "Domain editor: lives in feature code and reads only its owner's lampType (shared/domain/lighting/lampTypes.ts), no house data.",
    commitBehavior:
      "Choosing a preset commits its watts; the property command then sets the light's output to the preset's lumens. Disabled until the light has a lamp type.",
    schemaSnippet: JSON.stringify(domainEditorFixtures.lampPower, null, 2),
    props: [
      {
        name: "(editor contract)",
        type: "PropertyEditorProps",
        required: true,
        description: "Same contract as every editor; owner is the light, whose lampType picks the presets.",
      },
    ],
    examples: [
      {
        id: "lampPower-states",
        title: "States (LED warm white, then no lamp type)",
        Example: LampPowerEditorExample,
        source: LampPowerEditorExampleSource,
      },
    ],
  },
];
