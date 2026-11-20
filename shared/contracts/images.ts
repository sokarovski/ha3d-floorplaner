// House image library routes (spec/architecture/api.md#images, spec/builder/features/house-images.md).
import Type from "typebox";
import type { Static } from "typebox";
import { DisplayName, IdString, Timestamp } from "./common";

export const imageMediaTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMediaType = (typeof imageMediaTypes)[number];

export const ImageParams = Type.Object({ houseId: IdString, imageId: IdString });
export type ImageParamsValue = Static<typeof ImageParams>;

/**
 * A texture image's proposed material values (owner, 2026-11-20): the real size of one repeat, shininess (stored as
 * glTF roughness) and metallic. Choosing the texture in a material applies them; the material can then be adjusted.
 */
export const TextureHints = Type.Object(
  {
    tileSizeMm: Type.Object(
      {
        x: Type.Number({ exclusiveMinimum: 0, maximum: 100000 }),
        y: Type.Number({ exclusiveMinimum: 0, maximum: 100000 }),
      },
      { additionalProperties: false },
    ),
    roughness: Type.Number({ minimum: 0, maximum: 1 }),
    metallic: Type.Number({ minimum: 0, maximum: 1 }),
  },
  { additionalProperties: false },
);
export type TextureHintsValue = Static<typeof TextureHints>;

/** One entry of the server-owned index `textures/images.json`. `file`/`thumbnail` are house-relative paths. */
export const ImageEntry = Type.Object(
  {
    id: IdString,
    name: Type.String(),
    originalFilename: Type.String(),
    mediaType: Type.Union([
      Type.Literal("image/jpeg"),
      Type.Literal("image/png"),
      Type.Literal("image/webp"),
    ]),
    widthPx: Type.Integer({ minimum: 1 }),
    heightPx: Type.Integer({ minimum: 1 }),
    byteSize: Type.Integer({ minimum: 1 }),
    file: Type.String(),
    thumbnail: Type.String(),
    createdAt: Timestamp,
    /** Proposed material values (optional; images uploaded before 2026-11-20 have none). */
    texture: Type.Optional(TextureHints),
  },
  { additionalProperties: false },
);
export type ImageEntryValue = Static<typeof ImageEntry>;

/** The on-disk index document. */
export const ImageIndexDocument = Type.Object(
  { schemaVersion: Type.Literal(1), images: Type.Array(ImageEntry) },
  { additionalProperties: false },
);
export type ImageIndexDocumentValue = Static<typeof ImageIndexDocument>;

/** GET /api/houses/:houseId/images: upload order, oldest first. */
export const ImageListResponse = Type.Object(
  { images: Type.Array(ImageEntry) },
  { additionalProperties: false },
);
export type ImageListResponseValue = Static<typeof ImageListResponse>;

/**
 * POST /api/houses/:houseId/images is multipart/form-data: one `file` part (JPEG/PNG/WebP, sniffed from
 * the bytes) and an optional `name` text field (defaults to the filename without extension).
 * Returns 201 with the ImageEntry.
 */
export const imageUploadFields = { file: "file", name: "name" } as const;

/** PATCH /api/houses/:houseId/images/:imageId */
/** PATCH an image: its name, its proposed material values, or both. */
export const UpdateImageBody = Type.Object(
  { name: Type.Optional(DisplayName), texture: Type.Optional(TextureHints) },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateImageBodyValue = Static<typeof UpdateImageBody>;
