// Schema-version migrations for house.json (spec/architecture/persistence.md#document-contract).
// Each migration upgrades a document from `fromVersion` to `fromVersion + 1` in memory; the result is
// validated against the current House schema afterwards.
// v1 → v2 (Phase 3): wall spans attach to edge corners (migrateV1Spans.ts).
// v2 → v3 (Phase 3): staircases gain a direction, "up" for existing ones (migrateV2Staircases.ts).
// v3 → v4 (wall relief groups): a relief becomes a feature holding its rectangle as a shape (migrateV3Reliefs.ts).
// v4 → v5 (Phase 16.14): staircase areas become stair objects and floor openings; areas lose `kind` and
// `staircase` (migrateV4Stairs.ts).
// v5 → v6 (Phase 19.2): roof cuts become a roof; roofs gain `cutsWalls` and `wallsRise` (migrateV5RoofCuts.ts).
// Same-version defaults (Phase 16): absent floor placement and slab fields are filled (floorDefaults.ts).
import { currentHouseSchemaVersion } from "../schemas/house";
import { fillFloorDefaults } from "./floorDefaults";
import { migrateWallSpansV1 } from "./migrateV1Spans";
import { migrateStaircaseDirectionV2 } from "./migrateV2Staircases";
import { migrateWallReliefsV3 } from "./migrateV3Reliefs";
import { migrateStairsV4 } from "./migrateV4Stairs";
import { migrateRoofCutsV5 } from "./migrateV5RoofCuts";

export type JsonObject = Readonly<Record<string, unknown>>;

export type HouseMigration = Readonly<{ fromVersion: number; migrate: (document: JsonObject) => JsonObject }>;

/** Registry of migrations, keyed by the version they upgrade from. */
export const houseMigrations: ReadonlyMap<number, HouseMigration> = new Map<number, HouseMigration>([
  [1, { fromVersion: 1, migrate: migrateWallSpansV1 }],
  [2, { fromVersion: 2, migrate: migrateStaircaseDirectionV2 }],
  [3, { fromVersion: 3, migrate: migrateWallReliefsV3 }],
  [4, { fromVersion: 4, migrate: migrateStairsV4 }],
  [5, { fromVersion: 5, migrate: migrateRoofCutsV5 }],
]);

export type MigrationResult =
  | Readonly<{ kind: "ok"; document: JsonObject; migrated: boolean }>
  | Readonly<{ kind: "unsupportedVersion"; schemaVersion: number }>
  | Readonly<{ kind: "invalid"; message: string }>;

/** Brings a parsed house.json up to the current schema version without touching the stored file. */
export const migrateHouseDocument = (document: JsonObject): MigrationResult => {
  const version = document.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { kind: "invalid", message: "schemaVersion must be a positive integer." };
  }
  if (version > currentHouseSchemaVersion) return { kind: "unsupportedVersion", schemaVersion: version };
  let current = document;
  for (let from = version; from < currentHouseSchemaVersion; from += 1) {
    const migration = houseMigrations.get(from);
    if (migration === undefined)
      return { kind: "invalid", message: `No migration from schema version ${from}.` };
    current = { ...migration.migrate(current), schemaVersion: from + 1 };
  }
  return {
    kind: "ok",
    document: fillFloorDefaults(current),
    migrated: version !== currentHouseSchemaVersion,
  };
};
