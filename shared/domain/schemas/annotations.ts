// The `x-homeplan` annotation vocabulary (spec/builder/property-system.md#metadata-standard-keywords-first).
// Annotations are read at runtime from schema nodes through `readAnnotation`, which validates them.
import Type from "typebox";
import type { Static } from "typebox";
import { Value } from "typebox/value";

export const editorNames = [
  "text",
  "number",
  "length",
  "angle",
  "select",
  "segmented",
  "multiSelect",
  "toggle",
  "slider",
  "color",
  "vector2Length",
  "dateTime",
  "file",
  "readOnly",
  "material",
  "image",
  "templateVersion",
  "reference",
  "location",
  "nodeRef",
  "lampPower",
  "materialChoice",
] as const;

export type EditorName = (typeof editorNames)[number];

const EditorNameSchema = Type.Unsafe<EditorName>(Type.Union(editorNames.map((name) => Type.Literal(name))));

export const XHomeplanSchema = Type.Object({
  editor: Type.Optional(EditorNameSchema),
  quantity: Type.Optional(
    Type.Union([
      Type.Literal("length"),
      Type.Literal("angle"),
      Type.Literal("luminousFlux"),
      Type.Literal("colorTemperature"),
    ]),
  ),
  group: Type.Optional(Type.String()),
  order: Type.Optional(Type.Number()),
  hidden: Type.Optional(Type.Boolean()),
  visibleWhen: Type.Optional(Type.Object({ property: Type.String(), equals: Type.Unknown() })),
  /** Icon names per choice value for a segmented choice (Phase 5.9), e.g. { light: "sun" }. */
  optionIcons: Type.Optional(Type.Record(Type.String(), Type.String())),
  /** A short label shown inside the field (Phase 5.8), e.g. "W"; consecutive ones share a row. */
  inlineLabel: Type.Optional(Type.String({ minLength: 1, maxLength: 3 })),
  derived: Type.Optional(Type.Boolean()),
  /** Template parameters (Phase 9, D26): the value is live state (open angle, blinds closed), bindable to HA. */
  state: Type.Optional(Type.Boolean()),
  /** Template length/number parameters (Phase 9): suggested values offered next to the field. */
  quickPicks: Type.Optional(Type.Array(Type.Number(), { maxItems: 24 })),
  /**
   * A template material slot offered for choice (Phase 9.1, `materialChoice` editor): the slot's own glTF
   * material, the offered presets with their swatch colours (sRGB 0–255) in panel order, and whether a plain
   * colour or the house's own texture may be chosen.
   */
  materialChoice: Type.Optional(
    Type.Object({
      material: Type.String(),
      presets: Type.Array(
        Type.Object({
          name: Type.String(),
          color: Type.Array(Type.Integer({ minimum: 0, maximum: 255 }), { minItems: 3, maxItems: 3 }),
          textured: Type.Boolean(),
        }),
      ),
      allowColor: Type.Boolean(),
      allowTexture: Type.Boolean(),
    }),
  ),
  options: Type.Optional(Type.String()),
  groups: Type.Optional(Type.Array(Type.Object({ id: Type.String(), title: Type.String() }))),
  // Form-level options (root of a form schema).
  title: Type.Optional(Type.String()),
  submitLabel: Type.Optional(Type.String()),
  cancelLabel: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  size: Type.Optional(Type.Union([Type.Literal("sm"), Type.Literal("md"), Type.Literal("lg")])),
  // Editor-specific options.
  accept: Type.Optional(Type.Array(Type.String())),
  maxBytes: Type.Optional(Type.Number()),
  placeholder: Type.Optional(Type.String()),
  unitSuffix: Type.Optional(Type.String()),
  step: Type.Optional(Type.Number()),
  inverted: Type.Optional(Type.Boolean()),
  invertedTitle: Type.Optional(Type.String()),
  searchable: Type.Optional(Type.Boolean()),
  referenceKind: Type.Optional(Type.String()),
  multiple: Type.Optional(Type.Boolean()),
});

export type XHomeplan = Static<typeof XHomeplanSchema>;

/** Spread into TypeBox options: `Type.Number({ ...hp({ editor: "length" }) })`. */
export const hp = (annotation: XHomeplan): { "x-homeplan": XHomeplan } => ({ "x-homeplan": annotation });

const emptyAnnotation: XHomeplan = {};

/** Reads and validates the `x-homeplan` annotation of any schema node. */
export const readAnnotation = (node: unknown): XHomeplan => {
  if (typeof node !== "object" || node === null || !("x-homeplan" in node)) return emptyAnnotation;
  const annotation: unknown = node["x-homeplan"];
  return Value.Check(XHomeplanSchema, annotation) ? annotation : emptyAnnotation;
};
