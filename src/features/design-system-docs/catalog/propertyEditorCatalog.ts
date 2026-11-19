// Generic property editor pages (/ds/property-editors/:editorSlug).
import type { ComponentDoc } from "./docTypes";
import { editorFixtures } from "./editorFixtures";
import { TextEditorExample } from "../examples/TextEditorExample";
import TextEditorExampleSource from "../examples/TextEditorExample.tsx?raw";
import { NumberEditorExample } from "../examples/NumberEditorExample";
import NumberEditorExampleSource from "../examples/NumberEditorExample.tsx?raw";
import { LengthEditorExample } from "../examples/LengthEditorExample";
import LengthEditorExampleSource from "../examples/LengthEditorExample.tsx?raw";
import { AngleEditorExample } from "../examples/AngleEditorExample";
import AngleEditorExampleSource from "../examples/AngleEditorExample.tsx?raw";
import { SegmentedEditorExample } from "../examples/SegmentedEditorExample";
import SegmentedEditorExampleSource from "../examples/SegmentedEditorExample.tsx?raw";
import { SelectEditorExample } from "../examples/SelectEditorExample";
import SelectEditorExampleSource from "../examples/SelectEditorExample.tsx?raw";
import { MultiSelectEditorExample } from "../examples/MultiSelectEditorExample";
import MultiSelectEditorExampleSource from "../examples/MultiSelectEditorExample.tsx?raw";
import { ToggleEditorExample } from "../examples/ToggleEditorExample";
import ToggleEditorExampleSource from "../examples/ToggleEditorExample.tsx?raw";
import { SliderEditorExample } from "../examples/SliderEditorExample";
import SliderEditorExampleSource from "../examples/SliderEditorExample.tsx?raw";
import { ColorEditorExample } from "../examples/ColorEditorExample";
import ColorEditorExampleSource from "../examples/ColorEditorExample.tsx?raw";
import { Vector2LengthEditorExample } from "../examples/Vector2LengthEditorExample";
import Vector2LengthEditorExampleSource from "../examples/Vector2LengthEditorExample.tsx?raw";
import { DateTimeEditorExample } from "../examples/DateTimeEditorExample";
import DateTimeEditorExampleSource from "../examples/DateTimeEditorExample.tsx?raw";
import { FileEditorExample } from "../examples/FileEditorExample";
import FileEditorExampleSource from "../examples/FileEditorExample.tsx?raw";
import { ReadOnlyEditorExample } from "../examples/ReadOnlyEditorExample";
import ReadOnlyEditorExampleSource from "../examples/ReadOnlyEditorExample.tsx?raw";
import contractSource from "../../../design-system/property-editors/editorContract.ts?raw";

export type PropertyEditorDoc = ComponentDoc &
  Readonly<{ editor: string; schemaSnippet: string; commitBehavior: string }>;

const editorProps = [
  { name: "id", type: "string", required: true, description: "DOM id; the field label points at it." },
  {
    name: "label",
    type: "string",
    required: true,
    description: "Visible label, used for composite accessible names.",
  },
  { name: "schema", type: "SchemaNode", required: true, description: "The property's JSON Schema node." },
  { name: "annotation", type: "XHomeplan", required: true, description: "The node's x-homeplan annotation." },
  {
    name: "value",
    type: "unknown",
    required: true,
    description: "Current committed value (narrowed by the editor).",
  },
  { name: "owner", type: "unknown", required: true, description: "The object that owns the property." },
  { name: "projectUnit", type: "LengthUnit", required: true, description: "Display/input unit for lengths." },
  { name: "disabled", type: "boolean", required: true, description: "Disabled or read-only." },
  {
    name: "mixed",
    type: "boolean",
    required: true,
    description: "Multi-selection values differ: shows Mixed.",
  },
  { name: "required", type: "boolean", required: true, description: "Required in the form." },
  { name: "error", type: "string", required: false, description: "Validation error from the form." },
  {
    name: "onPreview",
    type: "(value) => void",
    required: false,
    description: "Live preview while dragging; never recorded in history.",
  },
  {
    name: "onCommit",
    type: "(value) => boolean",
    required: true,
    description: "Final value; false keeps the draft (rejected).",
  },
] as const;

export const propertyEditorDocs: readonly PropertyEditorDoc[] = [
  {
    slug: "text",
    editor: "text",
    name: "TextPropEditor",
    category: "Property editors",
    purpose: "Short strings such as names. Trimmed and NFC-normalized; min/max length from the schema.",
    importPath: "src/design-system/property-editors/TextPropEditor/TextPropEditor",
    whenToUse: 'Selected by x-homeplan editor "text" or by the schema type default.',
    commitBehavior:
      "Enter or blur commits; Escape reverts the draft; invalid text stays in the field with a message.",
    schemaSnippet: JSON.stringify(editorFixtures.text, null, 2),
    props: editorProps,
    examples: [
      {
        id: "text-states",
        title: "States",
        Example: TextEditorExample,
        source: TextEditorExampleSource,
        companions: [{ label: "Editor contract", source: contractSource }],
      },
    ],
  },
  {
    slug: "number",
    editor: "number",
    name: "NumberPropEditor",
    category: "Property editors",
    purpose: "Plain numbers with an optional unit suffix (lm, K) and limits.",
    importPath: "src/design-system/property-editors/NumberPropEditor/NumberPropEditor",
    whenToUse: 'Selected by x-homeplan editor "number" or by the schema type default.',
    commitBehavior: "Enter or blur commits a valid number within limits; Escape reverts.",
    schemaSnippet: JSON.stringify(editorFixtures.number, null, 2),
    props: editorProps,
    examples: [
      {
        id: "number-states",
        title: "States",
        Example: NumberEditorExample,
        source: NumberEditorExampleSource,
        companions: [{ label: "Editor contract", source: contractSource }],
      },
    ],
  },
  {
    slug: "length",
    editor: "length",
    name: "LengthPropEditor",
    category: "Property editors",
    purpose: "Lengths with mixed-unit entry (1.5m, 3ft, 2 in) and live conversion; stored in millimeters.",
    importPath: "src/design-system/property-editors/LengthPropEditor/LengthPropEditor",
    whenToUse: 'Selected by x-homeplan editor "length" or by the schema type default.',
    commitBehavior:
      "The raw draft is kept while typing with a live converted hint; Enter/blur commits mm; Escape reverts. Switch the project unit to see display change without changing the value.",
    schemaSnippet: JSON.stringify(editorFixtures.length, null, 2),
    props: editorProps,
    examples: [
      {
        id: "length-states",
        title: "States",
        Example: LengthEditorExample,
        source: LengthEditorExampleSource,
        companions: [{ label: "Editor contract", source: contractSource }],
      },
    ],
  },
  {
    slug: "angle",
    editor: "angle",
    name: "AnglePropEditor",
    category: "Property editors",
    purpose:
      "Degrees, normalized into [0, 360) unless the schema bounds it. An absent optional value shows the schema default (a linear light's Facing, Phase 13.3).",
    importPath: "src/design-system/property-editors/AnglePropEditor/AnglePropEditor",
    whenToUse: 'Selected by x-homeplan editor "angle" or by the schema type default.',
    commitBehavior: "Accepts 90, 45\u00b0, 30deg; Enter/blur commits; Escape reverts.",
    schemaSnippet: JSON.stringify(editorFixtures.angle, null, 2),
    props: editorProps,
    examples: [
      {
        id: "angle-states",
        title: "States",
        Example: AngleEditorExample,
        source: AngleEditorExampleSource,
        companions: [{ label: "Editor contract", source: contractSource }],
      },
    ],
  },
  {
    slug: "segmented",
    editor: "segmented",
    name: "SegmentedPropEditor",
    category: "Property editors",
    purpose:
      "One choice among two or three options as a pill-shaped segmented control (Phase 5.9); optional icons per option from x-homeplan optionIcons.",
    importPath: "src/design-system/property-editors/SegmentedPropEditor/SegmentedPropEditor",
    whenToUse:
      "Chosen automatically by Choice() for 2–3 options (Theme Light/Dark/Auto, wall Alignment, light Type); force it or the dropdown with Choice's editor option, e.g. for long option titles.",
    commitBehavior: "Clicking a segment commits immediately.",
    schemaSnippet: JSON.stringify(editorFixtures.segmented, null, 2),
    props: editorProps,
    examples: [
      {
        id: "segmented-states",
        title: "States",
        Example: SegmentedEditorExample,
        source: SegmentedEditorExampleSource,
        companions: [{ label: "Editor contract", source: contractSource }],
      },
    ],
  },
  {
    slug: "select",
    editor: "select",
    name: "SelectPropEditor",
    category: "Property editors",
    purpose:
      "Dropdown from anyOf/oneOf consts with titles (or enum); searchable variant with x-homeplan searchable.",
    importPath: "src/design-system/property-editors/SelectPropEditor/SelectPropEditor",
    whenToUse: 'Selected by x-homeplan editor "select" or by the schema type default.',
    commitBehavior: "Choosing an option commits immediately.",
    schemaSnippet: JSON.stringify(editorFixtures.select, null, 2),
    props: editorProps,
    examples: [
      {
        id: "select-states",
        title: "States",
        Example: SelectEditorExample,
        source: SelectEditorExampleSource,
        companions: [{ label: "Editor contract", source: contractSource }],
      },
    ],
  },
  {
    slug: "multiSelect",
    editor: "multiSelect",
    name: "MultiSelectPropEditor",
    category: "Property editors",
    purpose: "A set of choices from an array of enumerated items.",
    importPath: "src/design-system/property-editors/MultiSelectPropEditor/MultiSelectPropEditor",
    whenToUse: 'Selected by x-homeplan editor "multiSelect" or by the schema type default.',
    commitBehavior: "Toggling a chip commits the new set in schema order; minItems is respected.",
    schemaSnippet: JSON.stringify(editorFixtures.multiSelect, null, 2),
    props: editorProps,
    examples: [
      {
        id: "multiSelect-states",
        title: "States",
        Example: MultiSelectEditorExample,
        source: MultiSelectEditorExampleSource,
        companions: [{ label: "Editor contract", source: contractSource }],
      },
    ],
  },
  {
    slug: "toggle",
    editor: "toggle",
    name: "TogglePropEditor",
    category: "Property editors",
    purpose: "Yes or no, as a compact right-aligned Yes / No segmented control.",
    importPath: "src/design-system/property-editors/TogglePropEditor/TogglePropEditor",
    whenToUse: 'Selected by x-homeplan editor "toggle" or by the schema type default.',
    commitBehavior:
      "Choosing Yes or No commits immediately; arrow keys move between them and Space or Enter chooses. Mixed selects neither.",
    schemaSnippet: JSON.stringify(editorFixtures.toggle, null, 2),
    props: editorProps,
    examples: [
      {
        id: "toggle-states",
        title: "States",
        Example: ToggleEditorExample,
        source: ToggleEditorExampleSource,
        companions: [{ label: "Editor contract", source: contractSource }],
      },
    ],
  },
  {
    slug: "slider",
    editor: "slider",
    name: "SliderPropEditor",
    category: "Property editors",
    purpose:
      "A bounded number with a slider and a number box; x-homeplan inverted shows 1 \u2212 value (Shininess).",
    importPath: "src/design-system/property-editors/SliderPropEditor/SliderPropEditor",
    whenToUse: 'Selected by x-homeplan editor "slider" or by the schema type default.',
    commitBehavior:
      "Dragging previews continuously (onPreview) and commits once on release; the number box commits on Enter/blur.",
    schemaSnippet: JSON.stringify(editorFixtures.slider, null, 2),
    props: editorProps,
    examples: [
      {
        id: "slider-states",
        title: "States",
        Example: SliderEditorExample,
        source: SliderEditorExampleSource,
        companions: [{ label: "Editor contract", source: contractSource }],
      },
    ],
  },
  {
    slug: "color",
    editor: "color",
    name: "ColorPropEditor",
    category: "Property editors",
    purpose: "sRGB 0\u2013255 with a swatch and hex entry.",
    importPath: "src/design-system/property-editors/ColorPropEditor/ColorPropEditor",
    whenToUse: 'Selected by x-homeplan editor "color" or by the schema type default.',
    commitBehavior: "Picking a swatch or entering hex commits [r, g, b].",
    schemaSnippet: JSON.stringify(editorFixtures.color, null, 2),
    props: editorProps,
    examples: [
      {
        id: "color-states",
        title: "States",
        Example: ColorEditorExample,
        source: ColorEditorExampleSource,
        companions: [{ label: "Editor contract", source: contractSource }],
      },
    ],
  },
  {
    slug: "vector2Length",
    editor: "vector2Length",
    name: "Vector2LengthPropEditor",
    category: "Property editors",
    purpose: "A pair of lengths such as a position, each with mixed-unit entry.",
    importPath: "src/design-system/property-editors/Vector2LengthPropEditor/Vector2LengthPropEditor",
    whenToUse: 'Selected by x-homeplan editor "vector2Length" or by the schema type default.',
    commitBehavior: "Each axis commits the whole {x, y} value.",
    schemaSnippet: JSON.stringify(editorFixtures.vector2Length, null, 2),
    props: editorProps,
    examples: [
      {
        id: "vector2Length-states",
        title: "States",
        Example: Vector2LengthEditorExample,
        source: Vector2LengthEditorExampleSource,
        companions: [{ label: "Editor contract", source: contractSource }],
      },
    ],
  },
  {
    slug: "dateTime",
    editor: "dateTime",
    name: "DateTimePropEditor",
    category: "Property editors",
    purpose: "A local date and time without an offset (YYYY-MM-DDTHH:mm:ss).",
    importPath: "src/design-system/property-editors/DateTimePropEditor/DateTimePropEditor",
    whenToUse: 'Selected by x-homeplan editor "dateTime" or by the schema type default.',
    commitBehavior: "Blur or Enter commits; Escape reverts.",
    schemaSnippet: JSON.stringify(editorFixtures.dateTime, null, 2),
    props: editorProps,
    examples: [
      {
        id: "dateTime-states",
        title: "States",
        Example: DateTimeEditorExample,
        source: DateTimeEditorExampleSource,
        companions: [{ label: "Editor contract", source: contractSource }],
      },
    ],
  },
  {
    slug: "file",
    editor: "file",
    name: "FilePropEditor",
    category: "Property editors",
    purpose: "Pick or drop one file; accept and maxBytes from x-homeplan. Popup forms only.",
    importPath: "src/design-system/property-editors/FilePropEditor/FilePropEditor",
    whenToUse: 'Selected by x-homeplan editor "file" or by the schema type default.',
    commitBehavior: "Choosing or dropping a file commits the File; type and size problems are shown.",
    schemaSnippet: JSON.stringify(editorFixtures.file, null, 2),
    props: editorProps,
    examples: [
      {
        id: "file-states",
        title: "States",
        Example: FileEditorExample,
        source: FileEditorExampleSource,
        companions: [{ label: "Editor contract", source: contractSource }],
      },
    ],
  },
  {
    slug: "readOnly",
    editor: "readOnly",
    name: "ReadOnlyPropEditor",
    category: "Property editors",
    purpose: "Displays a value, including derived ones and warnings, formatted by quantity.",
    importPath: "src/design-system/property-editors/ReadOnlyPropEditor/ReadOnlyPropEditor",
    whenToUse: 'Selected by x-homeplan editor "readOnly" or by the schema type default.',
    commitBehavior: "Never commits.",
    schemaSnippet: JSON.stringify(editorFixtures.readOnly, null, 2),
    props: editorProps,
    examples: [
      {
        id: "readOnly-states",
        title: "States",
        Example: ReadOnlyEditorExample,
        source: ReadOnlyEditorExampleSource,
        companions: [{ label: "Editor contract", source: contractSource }],
      },
    ],
  },
];

export const findPropertyEditorDoc = (slug: string): PropertyEditorDoc | undefined =>
  propertyEditorDocs.find((doc) => doc.slug === slug);
