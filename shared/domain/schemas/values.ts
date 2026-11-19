// Shared value types (spec/builder/object-models.md#shared-value-types).
// Embeddable sub-schemas carry no $id, so they can appear many times in the composed house schema.
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "./annotations";

/** Stable IDs: lowercase prefix, underscore, at least 6 lowercase alphanumerics (spec/architecture/api.md). */
export const idPattern = "^[a-z]+_[a-z0-9]{6,}$";

export const Id = Type.String({ pattern: idPattern, readOnly: true, ...hp({ hidden: true }) });

export const Length = (
  options: {
    title?: string;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    default?: number;
    group?: string;
    order?: number;
    hidden?: boolean;
    readOnly?: boolean;
    /** Help text shown under the field. */
    description?: string;
    /** A short label inside the field (Phase 5.8), e.g. "W"; consecutive ones share a row. */
    inlineLabel?: string;
    /** Suggested values (mm) offered next to the field (Phase 9, template parameters). */
    quickPicks?: readonly number[];
    /** Shown only while a sibling property has this value (Phase 19.1: roof designs). */
    visibleWhen?: { property: string; equals: unknown };
  } = {},
) =>
  Type.Number({
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.minimum === undefined ? {} : { minimum: options.minimum }),
    ...(options.maximum === undefined ? {} : { maximum: options.maximum }),
    ...(options.exclusiveMinimum === undefined ? {} : { exclusiveMinimum: options.exclusiveMinimum }),
    ...(options.default === undefined ? {} : { default: options.default }),
    ...(options.readOnly === true ? { readOnly: true } : {}),
    ...hp({
      editor: "length",
      quantity: "length",
      ...(options.inlineLabel === undefined ? {} : { inlineLabel: options.inlineLabel }),
      ...(options.group === undefined ? {} : { group: options.group }),
      ...(options.order === undefined ? {} : { order: options.order }),
      ...(options.hidden === true ? { hidden: true } : {}),
      ...(options.quickPicks === undefined ? {} : { quickPicks: [...options.quickPicks] }),
      ...(options.visibleWhen === undefined ? {} : { visibleWhen: options.visibleWhen }),
    }),
  });

export const Angle = (
  options: {
    title?: string;
    minimum?: number;
    maximum?: number;
    default?: number;
    group?: string;
    order?: number;
    hidden?: boolean;
  } = {},
) =>
  Type.Number({
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.minimum === undefined ? {} : { minimum: options.minimum }),
    ...(options.maximum === undefined ? {} : { maximum: options.maximum }),
    ...(options.default === undefined ? {} : { default: options.default }),
    ...hp({
      editor: "angle",
      quantity: "angle",
      ...(options.group === undefined ? {} : { group: options.group }),
      ...(options.order === undefined ? {} : { order: options.order }),
      ...(options.hidden === true ? { hidden: true } : {}),
    }),
  });

export const Vector2Length = (
  options: { title?: string; group?: string; order?: number; hidden?: boolean } = {},
) =>
  Type.Object(
    { x: Type.Number(), y: Type.Number() },
    {
      additionalProperties: false,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...hp({
        editor: "vector2Length",
        quantity: "length",
        ...(options.group === undefined ? {} : { group: options.group }),
        ...(options.order === undefined ? {} : { order: options.order }),
        ...(options.hidden === true ? { hidden: true } : {}),
      }),
    },
  );

export type Vector2 = Readonly<{ x: number; y: number }>;

export const ColorRgb = (
  options: {
    title?: string;
    group?: string;
    order?: number;
    visibleWhen?: { property: string; equals: unknown };
  } = {},
) =>
  Type.Array(Type.Integer({ minimum: 0, maximum: 255 }), {
    minItems: 3,
    maxItems: 3,
    ...(options.title === undefined ? {} : { title: options.title }),
    ...hp({
      editor: "color",
      ...(options.group === undefined ? {} : { group: options.group }),
      ...(options.order === undefined ? {} : { order: options.order }),
      ...(options.visibleWhen === undefined ? {} : { visibleWhen: options.visibleWhen }),
    }),
  });

/** Choice list rendered by the `select` editor; emitted as anyOf of {const, title}. */
export const Choice = <const T extends string>(
  choices: readonly (readonly [T, string])[],
  options: {
    title?: string;
    default?: T;
    group?: string;
    order?: number;
    hidden?: boolean;
    readOnly?: boolean;
    visibleWhen?: { property: string; equals: unknown };
    searchable?: boolean;
    /** Force the editor; by default 2–3 choices are a segmented control and more a dropdown (Phase 5.9). */
    editor?: "select" | "segmented";
    /** Icon names per choice value for the segmented control. */
    icons?: Readonly<Record<string, string>>;
  } = {},
) =>
  Type.Unsafe<T>(
    Type.Union(
      choices.map(([value, title]) => Type.Literal(value, { title })),
      {
        ...(options.title === undefined ? {} : { title: options.title }),
        ...(options.default === undefined ? {} : { default: options.default }),
        ...(options.readOnly === true ? { readOnly: true } : {}),
        ...hp({
          editor:
            options.readOnly === true
              ? "readOnly"
              : (options.editor ??
                (choices.length <= 3 && options.searchable !== true ? "segmented" : "select")),
          ...(options.icons === undefined ? {} : { optionIcons: { ...options.icons } }),
          ...(options.group === undefined ? {} : { group: options.group }),
          ...(options.order === undefined ? {} : { order: options.order }),
          ...(options.hidden === true ? { hidden: true } : {}),
          ...(options.visibleWhen === undefined ? {} : { visibleWhen: options.visibleWhen }),
          ...(options.searchable === true ? { searchable: true } : {}),
        }),
      },
    ),
  );

/** Default longest entity name (characters). */
export const defaultNameMaxLength = 120;

export const Name = (
  options: { maxLength?: number; default?: string; group?: string; order?: number } = {},
) =>
  Type.String({
    title: "Name",
    minLength: 1,
    maxLength: options.maxLength ?? defaultNameMaxLength,
    ...(options.default === undefined ? {} : { default: options.default }),
    ...hp({ editor: "text", group: options.group ?? "general", order: options.order ?? 0 }),
  });

/**
 * Saved Hidden (Phase 7.5, P4): not drawn in the builder unless Show hidden is on (then ghosted), never drawn in
 * the HA viewer or exports. Optional, so older houses stay valid (no schema version change).
 */
export const Hidden = Type.Optional(
  Type.Boolean({ title: "Hidden", default: false, ...hp({ editor: "toggle", group: "general", order: 90 }) }),
);

export const TextureRef = Type.Object(
  { imageId: Type.String({ pattern: idPattern }) },
  { additionalProperties: false },
);

/** Texture placement in extras.homeplan (rendered as KHR_texture_transform). */
export const TexturePlacement = Type.Object(
  {
    tileSizeMm: Vector2Length({ title: "Tile size", order: 5 }),
    rotationDeg: Angle({ title: "Texture rotation", order: 6 }),
    offsetMm: Vector2Length({ title: "Texture offset", order: 7 }),
  },
  { additionalProperties: false },
);

/** A surface material in the glTF 2.0 material format (D19). */
export const SurfaceMaterial = (
  options: {
    title?: string;
    group?: string;
    order?: number;
    /** Shown only while a sibling property has this value (Phase 19.1: roof designs). */
    visibleWhen?: { property: string; equals: unknown };
  } = {},
) =>
  Type.Object(
    {
      pbrMetallicRoughness: Type.Object(
        {
          baseColorTexture: Type.Optional(TextureRef),
          baseColorFactor: Type.Array(Type.Number({ minimum: 0, maximum: 1 }), { minItems: 4, maxItems: 4 }),
          roughnessFactor: Type.Number({ minimum: 0, maximum: 1 }),
          metallicFactor: Type.Number({ minimum: 0, maximum: 1 }),
        },
        { additionalProperties: false },
      ),
      extras: Type.Optional(Type.Object({ homeplan: TexturePlacement }, { additionalProperties: false })),
    },
    {
      additionalProperties: false,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...hp({
        editor: "material",
        ...(options.group === undefined ? {} : { group: options.group }),
        ...(options.order === undefined ? {} : { order: options.order }),
        ...(options.visibleWhen === undefined ? {} : { visibleWhen: options.visibleWhen }),
      }),
    },
  );

export const SurfaceMaterialSchema = SurfaceMaterial();
export type SurfaceMaterialValue = Static<typeof SurfaceMaterialSchema>;

export const Flip = Type.Object(
  {
    x: Type.Boolean({ title: "Left/right", ...hp({ editor: "toggle", order: 1 }) }),
    z: Type.Boolean({ title: "Front/back", ...hp({ editor: "toggle", order: 2 }) }),
  },
  { additionalProperties: false, title: "Flip", ...hp({ group: "template", order: 20 }) },
);

export const TemplateRef = Type.Object(
  {
    templateId: Type.String({ minLength: 1 }),
    templateVersion: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

/** Template parameters: numbers (lengths in mm, counts), booleans, or strings, keyed by parameter name. */
export const TemplateParameters = Type.Record(
  Type.String({ pattern: "^[A-Za-z][A-Za-z0-9]*$" }),
  Type.Union([Type.Number(), Type.Boolean(), Type.String()]),
  { title: "Parameters", ...hp({ group: "template", order: 10 }) },
);

/**
 * A template slot set to one of its offered presets (Phase 9.1): `preset` names a glTF material bundled in the
 * template asset (spec/builder/features/object-templates.md#material-choices). Drawn with that material and its
 * authored UVs; an unknown name falls back to the slot's own material.
 */
export const MaterialPresetChoice = Type.Object(
  { preset: Type.String({ minLength: 1, maxLength: 120 }) },
  { additionalProperties: false },
);
export type MaterialPresetChoiceValue = Static<typeof MaterialPresetChoice>;

/** One slot override: an own surface material (D19), or a bundled preset (Phase 9.1). */
export const MaterialOverride = Type.Union([SurfaceMaterial(), MaterialPresetChoice]);
export type MaterialOverrideValue = Static<typeof MaterialOverride>;

export const isMaterialPresetChoice = (value: MaterialOverrideValue): value is MaterialPresetChoiceValue =>
  "preset" in value;

export const MaterialOverrides = Type.Record(Type.String({ minLength: 1 }), MaterialOverride, {
  title: "Materials",
  ...hp({ group: "appearance", order: 30 }),
});
