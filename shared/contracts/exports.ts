// Saved PNG exports (spec/architecture/api.md#exports-and-renders, spec/delivery/rendering-and-exports.md).
import Type from "typebox";
import type { Static } from "typebox";
import { IdString, RevisionNumber, Timestamp } from "./common";

export const exportFileNames = ["preview.png", "final.png", "metadata.json"] as const;
export type ExportFileName = (typeof exportFileNames)[number];

export const ExportParams = Type.Object({ houseId: IdString, exportId: IdString });
export type ExportParamsValue = Static<typeof ExportParams>;

export const ExportFileParams = Type.Object({
  houseId: IdString,
  exportId: IdString,
  file: Type.Union([Type.Literal("preview.png"), Type.Literal("final.png"), Type.Literal("metadata.json")]),
});
export type ExportFileParamsValue = Static<typeof ExportFileParams>;

const OpenObject = Type.Record(Type.String(), Type.Unknown());

/**
 * The client's `metadata` multipart field (JSON text). Camera, render settings, and asset versions are
 * open objects owned by the renderer; the server stores them verbatim.
 */
export const ExportMetadataInput = Type.Object(
  {
    houseRevision: RevisionNumber,
    floorId: IdString,
    camera: OpenObject,
    renderSettings: OpenObject,
    renderer: Type.Object(
      { name: Type.String({ minLength: 1 }), version: Type.String({ minLength: 1 }) },
      { additionalProperties: false },
    ),
    /** The depicted sun instant (house-local ISO date-time), separate from `createdAt`. */
    simulationInstant: Type.Union([Type.String(), Type.Null()]),
    assetVersions: Type.Optional(OpenObject),
  },
  { additionalProperties: false },
);
export type ExportMetadataInputValue = Static<typeof ExportMetadataInput>;

/** Pixel size and byte size of one stored PNG, measured by the server. */
export const ExportImageFile = Type.Object(
  {
    name: Type.Union([Type.Literal("preview.png"), Type.Literal("final.png")]),
    widthPx: Type.Integer({ minimum: 1 }),
    heightPx: Type.Integer({ minimum: 1 }),
    byteSize: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export type ExportImageFileValue = Static<typeof ExportImageFile>;

/** `exports/<export-id>/metadata.json`, also the list item. */
export const ExportEntry = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    id: IdString,
    houseId: IdString,
    createdAt: Timestamp,
    files: Type.Array(ExportImageFile, { minItems: 1 }),
    metadata: ExportMetadataInput,
  },
  { additionalProperties: false },
);
export type ExportEntryValue = Static<typeof ExportEntry>;

/** GET /api/houses/:houseId/exports: newest first. */
export const ExportListResponse = Type.Object(
  { exports: Type.Array(ExportEntry) },
  { additionalProperties: false },
);
export type ExportListResponseValue = Static<typeof ExportListResponse>;

/**
 * POST /api/houses/:houseId/exports is multipart/form-data: `preview` and/or `final` PNG file parts
 * (at least one) and a `metadata` text field holding ExportMetadataInput as JSON. Returns 201 ExportEntry.
 */
export const exportUploadFields = { preview: "preview", final: "final", metadata: "metadata" } as const;
