// Photorealistic render jobs (spec/architecture/api.md#exports-and-renders, D11).
import Type from "typebox";
import type { Static } from "typebox";
import { IdString, RevisionNumber, Timestamp } from "./common";

export const RenderJobParams = Type.Object({ houseId: IdString, jobId: IdString });
export type RenderJobParamsValue = Static<typeof RenderJobParams>;

/** A point or vector in Three.js world meters (x = plan x, y = up, z = −plan y). */
export const WorldVec3 = Type.Object(
  { x: Type.Number(), y: Type.Number(), z: Type.Number() },
  { additionalProperties: false },
);

/** The viewport camera (src/renderer CameraSnapshot). `fovDeg` is the vertical FOV in 3D; `orthoHeightM` the visible height in Top. */
export const CameraSnapshotSchema = Type.Object(
  {
    mode: Type.Union([Type.Literal("top"), Type.Literal("3d")]),
    position: WorldVec3,
    target: WorldVec3,
    up: WorldVec3,
    fovDeg: Type.Union([Type.Number({ exclusiveMinimum: 0, exclusiveMaximum: 180 }), Type.Null()]),
    orthoHeightM: Type.Union([Type.Number({ exclusiveMinimum: 0 }), Type.Null()]),
    aspect: Type.Number({ exclusiveMinimum: 0 }),
  },
  { additionalProperties: false },
);
export type CameraSnapshotValue = Static<typeof CameraSnapshotSchema>;

/** Shared house environment frozen at submission. `sunDirectionWorld` points toward the sun (Three axes). */
export const RenderEnvironment = Type.Object(
  {
    sunDirectionWorld: Type.Array(Type.Number(), { minItems: 3, maxItems: 3 }),
    /** Three.js DirectionalLight intensity; used as the Blender sun strength (W/m²). 0 = no sun. */
    sunIntensity: Type.Number({ minimum: 0 }),
    /** The depicted instant (ISO), or null. */
    timeInstant: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);
export type RenderEnvironmentValue = Static<typeof RenderEnvironment>;

export const renderMaxSidePx = 8192;

/**
 * The `snapshot` multipart field (JSON text) of POST /api/houses/:houseId/renders. The `scene` file part
 * is the active floor exported as GLB (GLTFExporter, lights as KHR_lights_punctual), ≤ 256 MB.
 */
export const RenderSnapshot = Type.Object(
  {
    houseRevision: RevisionNumber,
    floorId: IdString,
    camera: CameraSnapshotSchema,
    widthPx: Type.Integer({ minimum: 16, maximum: renderMaxSidePx }),
    heightPx: Type.Integer({ minimum: 16, maximum: renderMaxSidePx }),
    environment: RenderEnvironment,
    /** Path-tracing samples; default from BLENDER_SAMPLES or 64. */
    samples: Type.Optional(Type.Integer({ minimum: 1, maximum: 4096 })),
    /** Asset versions the scene was built from, recorded in the export metadata. */
    assetVersions: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);
export type RenderSnapshotValue = Static<typeof RenderSnapshot>;

export const renderUploadFields = { scene: "scene", snapshot: "snapshot" } as const;

export const RenderJobStatus = Type.Union([
  Type.Literal("pending"),
  Type.Literal("running"),
  Type.Literal("completed"),
  Type.Literal("failed"),
  Type.Literal("canceled"),
]);
export type RenderJobStatusValue = Static<typeof RenderJobStatus>;

/** GET/DELETE …/renders/:jobId. `progress` is 0–1; `resultExportId` names the saved export when completed. */
export const RenderJobResponse = Type.Object(
  {
    id: IdString,
    houseId: IdString,
    floorId: IdString,
    status: RenderJobStatus,
    progress: Type.Number({ minimum: 0, maximum: 1 }),
    /** Human-readable stage, for example "Rendering sample 12/64". */
    stage: Type.String(),
    createdAt: Timestamp,
    startedAt: Type.Union([Timestamp, Type.Null()]),
    finishedAt: Type.Union([Timestamp, Type.Null()]),
    error: Type.Union([Type.String(), Type.Null()]),
    resultExportId: Type.Union([IdString, Type.Null()]),
  },
  { additionalProperties: false },
);
export type RenderJobResponseValue = Static<typeof RenderJobResponse>;

/** `202` from POST …/renders. */
export const SubmitRenderResponse = Type.Object({ jobId: IdString }, { additionalProperties: false });
export type SubmitRenderResponseValue = Static<typeof SubmitRenderResponse>;

/** `exports/renders/<jobId>/job.json` on disk. */
export const RenderJobDocument = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    job: RenderJobResponse,
    snapshot: RenderSnapshot,
  },
  { additionalProperties: false },
);
export type RenderJobDocumentValue = Static<typeof RenderJobDocument>;
