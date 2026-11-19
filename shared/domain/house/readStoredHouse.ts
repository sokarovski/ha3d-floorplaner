// Reading a stored house document (Phase 16.14, 19.2): an HA copy may hold an older schema version (4 or 5), so the
// HA viewer brings every loaded document to the current version with the shared migrations (migrateHouseDocument:
// v4 → v5 turns staircase areas into stair objects and floor openings, v5 → v6 turns roof cuts into roofs) and
// validates the result before rendering.
import { House } from "../schemas/house";
import type { HouseDocument } from "../schemas/house";
import { compileValidator } from "../validation/ajv";
import { migrateHouseDocument } from "./migrations";

export type StoredHouseRead =
  | Readonly<{ kind: "ok"; revision: number; document: HouseDocument; migrated: boolean }>
  | Readonly<{ kind: "invalid"; message: string }>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `{ revision, document }` of any supported version → the current document, or why it cannot be read. */
export const readStoredHouseEnvelope = (envelope: unknown): StoredHouseRead => {
  if (!isRecord(envelope) || typeof envelope.revision !== "number" || !isRecord(envelope.document))
    return { kind: "invalid", message: "The house response has no document." };
  const migrated = migrateHouseDocument(envelope.document);
  if (migrated.kind === "unsupportedVersion")
    return {
      kind: "invalid",
      message: `The house has schema version ${String(migrated.schemaVersion)}, newer than this viewer supports.`,
    };
  if (migrated.kind === "invalid") return { kind: "invalid", message: migrated.message };
  const candidate: unknown = migrated.document;
  if (!compileValidator(House)(candidate))
    return { kind: "invalid", message: "The house document is invalid." };
  return { kind: "ok", revision: envelope.revision, document: candidate, migrated: migrated.migrated };
};
