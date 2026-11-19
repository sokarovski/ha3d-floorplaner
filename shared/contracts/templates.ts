// Template picker list and built-in template files (spec/architecture/api.md#templates).
import Type from "typebox";
import type { Static } from "typebox";
import { NodeRuleSchema, TemplateMetadataSchema, TemplateProductSchema } from "../domain/templates/metadata";
import { IdString, Timestamp } from "./common";

/** Built-in template IDs are readable slugs such as `window-style-1`. */
export const builtinTemplateIdPattern = "^[a-z0-9]+(-[a-z0-9]+)*$";
export const BuiltinTemplateId = Type.String({ pattern: builtinTemplateIdPattern, maxLength: 64 });

/** The contracts a template can declare (as TemplateMetadataSchema); carpets (Floorable) are not templates. */
export const templateContracts = ["Wallable", "Areable", "Staircasable"] as const;
export type TemplateContract = (typeof templateContracts)[number];
export const TemplateContractSchema = Type.Union([
  Type.Literal("Wallable"),
  Type.Literal("Areable"),
  Type.Literal("Staircasable"),
]);

/** Template version numbers start at 1; in routes they appear as `v/<n>`. */
export const TemplateVersion = Type.Integer({ minimum: 1 });

/** Picker grouping and search (Phase 9.1): copied from the template metadata when it declares them. */
const pickerFields = {
  category: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
  tags: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 40 }), { maxItems: 32 })),
  product: Type.Optional(TemplateProductSchema),
};

/**
 * `server/builtin-templates/<templateId>/template.json`, written by the built-in template build script
 * next to `v<N>.glb` files and the thumbnail. `thumbnail` is a file name in the same folder.
 */
export const BuiltinTemplateManifest = Type.Object(
  {
    id: BuiltinTemplateId,
    label: Type.String({ minLength: 1 }),
    kind: Type.String({ minLength: 1 }),
    contract: TemplateContractSchema,
    versions: Type.Array(TemplateVersion, { minItems: 1 }),
    thumbnail: Type.Optional(Type.String({ pattern: "^[a-z0-9-]+\\.(svg|png|webp)$" })),
    ...pickerFields,
  },
  { additionalProperties: false },
);
export type BuiltinTemplateManifestValue = Static<typeof BuiltinTemplateManifest>;

/** One picker entry. `thumbnailUrl` is relative to the app's base URL (e.g. `api/templates/builtin/<id>/thumbnail`) or null. */
export const TemplateListItem = Type.Object(
  {
    id: Type.String(),
    label: Type.String(),
    kind: Type.String(),
    contract: TemplateContractSchema,
    versions: Type.Array(TemplateVersion),
    source: Type.Union([Type.Literal("builtin"), Type.Literal("house")]),
    thumbnailUrl: Type.Union([Type.String(), Type.Null()]),
    ...pickerFields,
  },
  { additionalProperties: false },
);
export type TemplateListItemValue = Static<typeof TemplateListItem>;

/** GET /api/houses/:houseId/templates: built-ins first, then house templates (Phase 2). */
export const TemplateListResponse = Type.Object(
  { templates: Type.Array(TemplateListItem) },
  { additionalProperties: false },
);
export type TemplateListResponseValue = Static<typeof TemplateListResponse>;

export const HouseTemplateListParams = Type.Object({ houseId: IdString });

/** GET /api/templates/builtin/:templateId/v/:version → model/gltf-binary */
export const BuiltinTemplateVersionParams = Type.Object({
  templateId: BuiltinTemplateId,
  version: Type.String({ pattern: "^[1-9][0-9]{0,5}$" }),
});
export type BuiltinTemplateVersionParamsValue = Static<typeof BuiltinTemplateVersionParams>;

/** GET /api/templates/builtin/:templateId/thumbnail → the manifest's thumbnail file */
export const BuiltinTemplateParams = Type.Object({ templateId: BuiltinTemplateId });
export type BuiltinTemplateParamsValue = Static<typeof BuiltinTemplateParams>;

// ---------------------------------------------------------------------------------------------
// House templates (Phase 2): import, draft, versions, files (spec/architecture/api.md#templates).

export const HouseTemplateParams = Type.Object({ houseId: IdString, templateId: IdString });
export type HouseTemplateParamsValue = Static<typeof HouseTemplateParams>;

export const HouseTemplateVersionParams = Type.Object({
  houseId: IdString,
  templateId: IdString,
  version: Type.String({ pattern: "^[1-9][0-9]{0,5}$" }),
});
export type HouseTemplateVersionParamsValue = Static<typeof HouseTemplateVersionParams>;

/** `files/*`: `geometry.bin` or `textures/<name>`; nothing else is served. */
export const templateFilePathPattern = "^(geometry\\.bin|textures/[A-Za-z0-9][A-Za-z0-9._-]{0,127})$";
export const HouseTemplateFileParams = Type.Object({
  houseId: IdString,
  templateId: IdString,
  "*": Type.String({ pattern: templateFilePathPattern }),
});
export type HouseTemplateFileParamsValue = Static<typeof HouseTemplateFileParams>;

/** A signed glTF axis of the source model, for example "+z" or "-y". */
export const AxisDirection = Type.Union([
  Type.Literal("+x"),
  Type.Literal("-x"),
  Type.Literal("+y"),
  Type.Literal("-y"),
  Type.Literal("+z"),
  Type.Literal("-z"),
]);
export type AxisDirectionValue = Static<typeof AxisDirection>;

export const SourceLengthUnit = Type.Union([
  Type.Literal("mm"),
  Type.Literal("cm"),
  Type.Literal("m"),
  Type.Literal("in"),
  Type.Literal("ft"),
]);
export type SourceLengthUnitValue = Static<typeof SourceLengthUnit>;

/**
 * The normalization root transform: a uniform scale (meters per source unit) and the source axes that
 * become glTF +Y (up) and +Z (front). Stored, not baked: each `vN.gltf` wraps the scene in a root node
 * named `HomeplanRoot` whose matrix is this transform.
 */
export const RootTransform = Type.Object(
  { scale: Type.Number({ exclusiveMinimum: 0 }), upAxis: AxisDirection, frontAxis: AxisDirection },
  { additionalProperties: false },
);
export type RootTransformValue = Static<typeof RootTransform>;

/**
 * POST /api/houses/:houseId/templates is multipart/form-data: one `file` part (≤ 100 MB) and text fields.
 * `format`: `gltf` (a .glb, or a self-contained .gltf with data: URIs only) or `stl`.
 * STL only: `unit` or `knownDimensionMm` + `knownAxis` (x/y/z after orientation), `upAxis` (default "+z"),
 * `frontAxis` (default "-y"). Numbers are decimal text.
 */
export const templateImportFields = {
  file: "file",
  format: "format",
  unit: "unit",
  knownDimensionMm: "knownDimensionMm",
  knownAxis: "knownAxis",
  upAxis: "upAxis",
  frontAxis: "frontAxis",
} as const;

export const TemplateImportOptions = Type.Object(
  {
    format: Type.Union([Type.Literal("gltf"), Type.Literal("stl")]),
    unit: Type.Optional(SourceLengthUnit),
    knownDimensionMm: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
    knownAxis: Type.Optional(Type.Union([Type.Literal("x"), Type.Literal("y"), Type.Literal("z")])),
    upAxis: Type.Optional(AxisDirection),
    frontAxis: Type.Optional(AxisDirection),
  },
  { additionalProperties: false },
);
export type TemplateImportOptionsValue = Static<typeof TemplateImportOptions>;

export const Vec3Mm = Type.Object(
  { x: Type.Number(), y: Type.Number(), z: Type.Number() },
  { additionalProperties: false },
);

/** Axis-aligned bounds of the normalized model (after the root transform), in millimeters. */
export const BoundsMm = Type.Object(
  { min: Vec3Mm, max: Vec3Mm, size: Vec3Mm },
  { additionalProperties: false },
);
export type BoundsMmValue = Static<typeof BoundsMm>;

/** One glTF node; `index` is its index in the normalized glTF, `children` are node indices. */
export const DraftNode = Type.Object(
  {
    index: Type.Integer({ minimum: 0 }),
    name: Type.String(),
    mesh: Type.Boolean(),
    children: Type.Array(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);
export type DraftNodeValue = Static<typeof DraftNode>;

/** The Object Editor's starting point for a house template; stored as `draft.json` in its folder. */
export const TemplateDraft = Type.Object(
  {
    templateId: IdString,
    label: Type.String(),
    sourceFormat: Type.Union([Type.Literal("glb"), Type.Literal("gltf"), Type.Literal("stl")]),
    sourceFile: Type.String(),
    /** Node tree as a flat list; `rootNodes` are the scene's top-level node indices. */
    nodes: Type.Array(DraftNode),
    rootNodes: Type.Array(Type.Integer({ minimum: 0 })),
    materials: Type.Array(Type.String()),
    /** The source's valid `extras.homeplan`, or a default Areable floor object (see `metadataSource`). */
    prefilledMetadata: TemplateMetadataSchema,
    metadataSource: Type.Union([Type.Literal("extras"), Type.Literal("default"), Type.Literal("version")]),
    /** Node rules by node name (from the source's node extras, or the latest saved version). */
    nodeRules: Type.Record(Type.String(), NodeRuleSchema),
    rootTransform: RootTransform,
    /** The root transform as a column-major 4 × 4 matrix (glTF convention). */
    rootMatrix: Type.Array(Type.Number(), { minItems: 16, maxItems: 16 }),
    boundsMm: BoundsMm,
    warnings: Type.Array(Type.String()),
    versions: Type.Array(TemplateVersion),
    createdAt: Timestamp,
  },
  { additionalProperties: false },
);
export type TemplateDraftValue = Static<typeof TemplateDraft>;

/** `201` from the import, and the body of GET …/templates/:templateId/draft. */
export const TemplateDraftResponse = Type.Object(
  { templateId: IdString, draft: TemplateDraft },
  { additionalProperties: false },
);
export type TemplateDraftResponseValue = Static<typeof TemplateDraftResponse>;

/**
 * POST …/templates/:templateId/versions. `metadata` is validated with validateTemplateMetadata against
 * the asset's nodes and materials; `nodeRules` (by node name) replace the node `extras.homeplan` rules
 * (omitted: the draft's rules are kept); `label`, when given, overrides `metadata.label`.
 */
export const SaveTemplateVersionBody = Type.Object(
  {
    metadata: TemplateMetadataSchema,
    rootTransform: RootTransform,
    nodeRules: Type.Optional(Type.Record(Type.String(), NodeRuleSchema)),
    label: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  },
  { additionalProperties: false },
);
export type SaveTemplateVersionBodyValue = Static<typeof SaveTemplateVersionBody>;

export const SaveTemplateVersionResponse = Type.Object(
  { version: TemplateVersion },
  { additionalProperties: false },
);
export type SaveTemplateVersionResponseValue = Static<typeof SaveTemplateVersionResponse>;
