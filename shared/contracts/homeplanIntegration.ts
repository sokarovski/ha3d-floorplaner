// D27: authoritative boundary schemas for the source, HA integration, loader and Python validator.
import Type from "typebox";
import type { Static } from "typebox";
import { GitRevisionId, IdString, RevisionNumber, Timestamp } from "./common";
import { HaBindings, HaDashboard, HaHouseBindings } from "../domain/schemas/homeAssistant";
import { HouseCard } from "./houses";
import { Preferences } from "../domain/schemas/preferences";

const strict = { additionalProperties: false };
export const ArtifactId = Type.String({ pattern: "^[0-9a-f]{64}$" });
export const ArtifactPath = Type.String({ minLength: 1, maxLength: 512 });
export const ArtifactFile = Type.Object(
  {
    path: ArtifactPath,
    byteSize: Type.Integer({ minimum: 0, maximum: 134217728 }),
    sha256: ArtifactId,
    mediaType: Type.String({ minLength: 1, maxLength: 100 }),
  },
  strict,
);
export const ViewerSetupSchema = Preferences.properties.homeAssistant.properties.viewer;
/**
 * The dashboard setting a snapshot captured for the one-time import. Snapshots are immutable (hashed), so ones made
 * before 2026-11-17 keep the old house-wide `panelColumns` (ignored on import) and have no per-room `areaColumns`;
 * ones made before 13.7 have no floor widgets (`floorTabs`, `floorColumns`, `floorPositions`, optional), and ones
 * made before 14.4 no room titles (`areaTitles`, optional), ones made before 14.6 no viewer navigation
 * (`navigation`, optional), and ones made before 16.1 no main views (`mainViews`, optional).
 */
export const SnapshotDashboard = Type.Object(
  {
    urlPath: HaDashboard.properties.urlPath,
    areaTabs: HaDashboard.properties.areaTabs,
    areaViews: HaDashboard.properties.areaViews,
    areaColumns: Type.Optional(HaDashboard.properties.areaColumns),
    areaTitles: HaDashboard.properties.areaTitles,
    floorTabs: HaDashboard.properties.floorTabs,
    floorColumns: HaDashboard.properties.floorColumns,
    floorPositions: HaDashboard.properties.floorPositions,
    navigation: HaDashboard.properties.navigation,
    mainViews: HaDashboard.properties.mainViews,
    panelColumns: Type.Optional(Type.Union([Type.Literal(1), Type.Literal(2)])),
  },
  strict,
);
export const SnapshotManifest = Type.Object(
  {
    formatVersion: Type.Literal(1),
    snapshotId: ArtifactId,
    houseId: IdString,
    houseSchemaVersion: Type.Integer({ minimum: 1 }),
    producerVersion: Type.String(),
    requiredViewerProtocol: Type.Literal(1),
    sourceRevisionId: GitRevisionId,
    documentRevision: RevisionNumber,
    savedAt: Timestamp,
    createdAt: Timestamp,
    migration: Type.Object(
      { preferencesRevision: RevisionNumber, viewer: ViewerSetupSchema, dashboard: SnapshotDashboard },
      strict,
    ),
    files: Type.Array(ArtifactFile, { maxItems: 10000 }),
    resources: Type.Object(
      {
        images: Type.Array(Type.Object({ id: IdString, path: ArtifactPath }, strict)),
        templates: Type.Array(
          Type.Object(
            {
              id: Type.String(),
              version: Type.Integer({ minimum: 1 }),
              path: ArtifactPath,
              dependencies: Type.Array(ArtifactPath),
            },
            strict,
          ),
        ),
      },
      strict,
    ),
  },
  strict,
);
export type SnapshotManifestValue = Static<typeof SnapshotManifest>;
export const BindingSeed = Type.Object(
  { preferencesRevision: RevisionNumber, bindings: HaHouseBindings },
  strict,
);
export const SnapshotSource = Type.Object(
  {
    houseId: IdString,
    sourceRevisionId: GitRevisionId,
    documentRevision: RevisionNumber,
    savedAt: Timestamp,
    producerVersion: Type.String(),
    relation: Type.Union([
      Type.Null(),
      Type.Literal("same"),
      Type.Literal("newer"),
      Type.Literal("different"),
    ]),
  },
  strict,
);
export const SourceStatus = Type.Object({ ...SnapshotSource.properties, checkedAt: Timestamp }, strict);
export type SourceStatusValue = Static<typeof SourceStatus>;
export const SnapshotExport = Type.Object(
  { snapshotId: ArtifactId, sourceRevisionId: GitRevisionId, expiresAt: Timestamp },
  strict,
);
export const SnapshotCreate = Type.Object({ expectedSourceRevisionId: Type.Optional(GitRevisionId) }, strict);
export const FrontendManifest = Type.Object(
  {
    formatVersion: Type.Literal(1),
    bundleId: ArtifactId,
    version: Type.String(),
    createdAt: Timestamp,
    entry: ArtifactPath,
    loaderProtocol: Type.Literal(1),
    apiProtocol: Type.Literal(1),
    minimumIntegrationVersion: Type.String(),
    files: Type.Array(ArtifactFile, { maxItems: 5000 }),
  },
  strict,
);
export type FrontendManifestValue = Static<typeof FrontendManifest>;
/** The most floor planners kept besides the default (implementation convention). */
export const maxFloorPlanners = 16;
export const Connection = Type.Object(
  {
    builderUrl: Type.Union([Type.String({ maxLength: 2048 }), Type.Null()]),
    devMode: Type.Boolean(),
    generation: RevisionNumber,
    /** How `builderUrl` was set: typed in House setup/recovery, or adopted from a Homeplan app's Supervisor discovery. Null while no URL is saved. */
    origin: Type.Union([Type.Literal("manual"), Type.Literal("discovered"), Type.Null()]),
    /**
     * Other floor planners (builders) besides the default `builderUrl`, normalised, never the default itself (Phase 21,
     * Settings → Floor planners). Making one the default moves the previous default into this list.
     */
    servers: Type.Array(Type.String({ maxLength: 2048 }), { maxItems: maxFloorPlanners }),
  },
  strict,
);
export type ConnectionValue = Static<typeof Connection>;
export const CopyMetadata = Type.Object(
  {
    houseId: IdString,
    snapshotId: ArtifactId,
    sourceRevisionId: GitRevisionId,
    documentRevision: RevisionNumber,
    savedAt: Timestamp,
    importedAt: Timestamp,
    producerVersion: Type.String(),
    fileCount: RevisionNumber,
    byteSize: RevisionNumber,
    sourceUrl: Type.String(),
    previousSnapshotId: Type.Union([ArtifactId, Type.Null()]),
  },
  strict,
);
export type CopyMetadataValue = Static<typeof CopyMetadata>;
export const IntegrationConfiguration = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    revision: RevisionNumber,
    viewer: ViewerSetupSchema,
    connection: Connection,
    dashboard: HaDashboard,
    bindings: HaBindings,
    imports: Type.Object({ global: Type.Boolean(), houses: Type.Record(IdString, Type.Boolean()) }, strict),
    houses: Type.Record(IdString, CopyMetadata),
    houseSources: Type.Record(IdString, Type.String({ maxLength: 2048 })),
    frontend: Type.Object(
      {
        active: Type.Union([FrontendManifest, Type.Null()]),
        previous: Type.Union([FrontendManifest, Type.Null()]),
      },
      strict,
    ),
  },
  strict,
);
export type IntegrationConfigurationValue = Static<typeof IntegrationConfiguration>;
export const IntegrationConfigResponse = Type.Object(
  { revision: RevisionNumber, configuration: IntegrationConfiguration },
  strict,
);
export const ConnectionResponse = Type.Object(
  {
    revision: RevisionNumber,
    connection: Connection,
    /** The Homeplan app's address while its discovery is known (Phase 21: that floor planner cannot be deleted). */
    discoveredUrl: Type.Union([Type.String({ maxLength: 2048 }), Type.Null()]),
  },
  strict,
);
/** A house archive uploaded in Settings → Houses (Phase 21) and what became of it. */
export const ArchiveImportResponse = Type.Object(
  {
    houseId: IdString,
    outcome: Type.Union([Type.Literal("imported"), Type.Literal("upgraded"), Type.Literal("unchanged")]),
    revision: RevisionNumber,
  },
  strict,
);
/** Another floor planner's houses, read only (Phase 21, Settings → Houses). */
export const PeekRequest = Type.Object({ url: Type.String({ maxLength: 2048 }) }, strict);
export const PeekResponse = Type.Object(
  { url: Type.String({ maxLength: 2048 }), houses: Type.Array(HouseCard, { maxItems: 1000 }) },
  strict,
);
/** The requesting browser's IP as HA sees it (House setup proposes it as the builder address); null if unusable. */
export const ClientAddressResponse = Type.Object(
  { address: Type.Union([Type.String({ minLength: 2, maxLength: 64 }), Type.Null()]) },
  strict,
);
export const IntegrationJob = Type.Object(
  {
    id: IdString,
    kind: Type.Union([Type.Literal("houseUpgrade"), Type.Literal("panelUpgrade")]),
    snapshotId: Type.Union([ArtifactId, Type.Null()]),
    bundleId: Type.Union([ArtifactId, Type.Null()]),
    houseId: Type.Union([IdString, Type.Null()]),
    status: Type.Union([
      Type.Literal("pending"),
      Type.Literal("running"),
      Type.Literal("completed"),
      Type.Literal("failed"),
      Type.Literal("canceled"),
    ]),
    stage: Type.Union([
      Type.Null(),
      Type.Literal("checking"),
      Type.Literal("downloading"),
      Type.Literal("verifying"),
      Type.Literal("activating"),
    ]),
    filesDone: RevisionNumber,
    filesTotal: RevisionNumber,
    bytesDone: RevisionNumber,
    bytesTotal: RevisionNumber,
    createdAt: Timestamp,
    updatedAt: Timestamp,
    finishedAt: Type.Union([Timestamp, Type.Null()]),
    error: Type.Union([Type.Object({ code: Type.String(), message: Type.String() }, strict), Type.Null()]),
    outcome: Type.Union([
      Type.Null(),
      Type.Literal("imported"),
      Type.Literal("upgraded"),
      Type.Literal("unchanged"),
    ]),
  },
  strict,
);
export type IntegrationJobValue = Static<typeof IntegrationJob>;
export const IntegrationJobResponse = Type.Object({ job: IntegrationJob }, strict);
export const IntegrationJobsResponse = Type.Object({ jobs: Type.Array(IntegrationJob) }, strict);
export const FrontendStatus = Type.Object(
  {
    shipped: FrontendManifest,
    active: Type.Union([FrontendManifest, Type.Null()]),
    previous: Type.Union([FrontendManifest, Type.Null()]),
  },
  strict,
);
export const Bootstrap = Type.Object(
  {
    recovery: Type.Union([Type.String(), Type.Null()]),
    revision: RevisionNumber,
    connection: Connection,
    viewer: ViewerSetupSchema,
    frontend: FrontendStatus,
    protocols: Type.Object({ loader: Type.Literal(1), api: Type.Literal(1) }, strict),
  },
  strict,
);
export type BootstrapValue = Static<typeof Bootstrap>;
export const ConnectionPatch = Type.Object(
  {
    expectedRevision: RevisionNumber,
    patch: Type.Object(
      {
        builderUrl: Type.Optional(Type.Union([Type.String({ maxLength: 2048 }), Type.Null()])),
        devMode: Type.Optional(Type.Boolean()),
        servers: Type.Optional(Type.Array(Type.String({ maxLength: 2048 }), { maxItems: maxFloorPlanners })),
      },
      strict,
    ),
  },
  strict,
);
export const RevisionRequest = Type.Object({ expectedRevision: RevisionNumber }, strict);
export const UseHouseRequest = Type.Object(
  { expectedRevision: RevisionNumber, generation: RevisionNumber },
  strict,
);
export const UpgradeRequest = Type.Object(
  {
    generation: RevisionNumber,
    expectedSourceRevisionId: Type.Optional(GitRevisionId),
    expectedBundleId: Type.Optional(ArtifactId),
  },
  strict,
);

export const ConnectResponse = Type.Object(
  {
    generation: RevisionNumber,
    connectedAt: Timestamp,
    houses: Type.Array(HouseCard),
    frontendOffer: Type.Union([FrontendManifest, Type.Null()]),
  },
  strict,
);
export type ConnectResponseValue = Static<typeof ConnectResponse>;
export const UseHouseResponse = Type.Union([IntegrationConfigResponse, IntegrationJobResponse]);
