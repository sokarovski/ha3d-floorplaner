// house.json reads and writes, house folder moves (spec/architecture/persistence.md).
import { mkdir, rename, rm, utimes } from "node:fs/promises";
import { House } from "../../shared/domain/schemas/house";
import type { HouseDocument } from "../../shared/domain/schemas/house";
import { migrateHouseDocument } from "../../shared/domain/house/migrations";
import { documentIntegrityProblems, newIntegrityProblems } from "../../shared/domain/house/integrity";
import { validateHouseDocument } from "../../shared/domain/commands/houseRules";
import { compileValidator, toIssues } from "../../shared/domain/validation/ajv";
import type { ValidationIssue } from "../../shared/domain/validation/ajv";
import { validationError } from "../http/errors";
import { isRecord, parseJson, toJsonText } from "../lib/json";
import { atomicWriteFile } from "./atomic";
import { isDirectory, modifiedTime, readTextIfExists } from "./files";
import type { StoragePaths } from "./paths";

const validateHouse = compileValidator(House);

export type HouseReadResult =
  | Readonly<{ kind: "ok"; document: HouseDocument; problems: readonly ValidationIssue[]; modifiedAt: Date }>
  | Readonly<{ kind: "missing" }>
  | Readonly<{
      kind: "invalid";
      code: "invalidDocument" | "unsupportedVersion";
      message: string;
      issues: readonly ValidationIssue[];
      modifiedAt: Date;
    }>;

/**
 * Parses, migrates (in memory), and validates house.json text. `houseId` must equal `document.id`. Integrity faults
 * (duplicate IDs, references into another area; spec/builder/model.md) are reported in `problems`, never refused on
 * read, so a house saved with one stays openable; writes refuse new ones (`HouseRepository.write`).
 */
export const decodeHouseText = (
  text: string,
  houseId: string,
):
  | Readonly<{ kind: "ok"; document: HouseDocument; problems: readonly ValidationIssue[] }>
  | Readonly<{
      kind: "invalid";
      code: "invalidDocument" | "unsupportedVersion";
      message: string;
      issues: readonly ValidationIssue[];
    }> => {
  const parsed = parseJson(text);
  if (!parsed.ok)
    return {
      kind: "invalid",
      code: "invalidDocument",
      message: `house.json is not valid JSON: ${parsed.message}`,
      issues: [],
    };
  if (!isRecord(parsed.value))
    return {
      kind: "invalid",
      code: "invalidDocument",
      message: "house.json is not a JSON object.",
      issues: [],
    };
  const migrated = migrateHouseDocument(parsed.value);
  if (migrated.kind === "unsupportedVersion") {
    return {
      kind: "invalid",
      code: "unsupportedVersion",
      message: `house.json has schema version ${migrated.schemaVersion}, newer than this server supports.`,
      issues: [],
    };
  }
  if (migrated.kind === "invalid")
    return { kind: "invalid", code: "invalidDocument", message: migrated.message, issues: [] };
  const candidate: unknown = migrated.document;
  if (!validateHouse(candidate)) {
    return {
      kind: "invalid",
      code: "invalidDocument",
      message: "house.json does not match the house schema.",
      issues: toIssues(validateHouse.errors),
    };
  }
  if (candidate.id !== houseId) {
    return {
      kind: "invalid",
      code: "invalidDocument",
      message: "house.json id does not match its folder.",
      issues: [{ pointer: "/id", message: "must equal the folder name" }],
    };
  }
  return { kind: "ok", document: candidate, problems: documentIntegrityProblems(candidate) };
};

export class HouseRepository {
  constructor(private readonly paths: StoragePaths) {}

  async exists(houseId: string): Promise<boolean> {
    return isDirectory(await this.paths.contained(this.paths.houseDir(houseId)));
  }

  async isTrashed(houseId: string): Promise<boolean> {
    return isDirectory(await this.paths.contained(this.paths.trashedHouseDir(houseId)));
  }

  /** Reads house.json from `directory` (a data or trash folder). Never writes. */
  async readFrom(directory: string, houseId: string): Promise<HouseReadResult> {
    const file = await this.paths.contained(this.paths.inside(directory, "house.json"));
    const text = await readTextIfExists(file);
    const modifiedAt = (await modifiedTime(file)) ?? (await modifiedTime(directory)) ?? new Date(0);
    if (text === undefined) {
      return (await isDirectory(directory))
        ? {
            kind: "invalid",
            code: "invalidDocument",
            message: "house.json is missing.",
            issues: [],
            modifiedAt,
          }
        : { kind: "missing" };
    }
    const decoded = decodeHouseText(text, houseId);
    return decoded.kind === "ok"
      ? { kind: "ok", document: decoded.document, problems: decoded.problems, modifiedAt }
      : { ...decoded, modifiedAt };
  }

  read(houseId: string): Promise<HouseReadResult> {
    return this.readFrom(this.paths.houseDir(houseId), houseId);
  }

  /**
   * Writes house.json after the document rules beyond the JSON Schema (validateHouseDocument: floor names, roof sheets,
   * integrity). A fault the stored house already has is kept (it must not lock the house); a new one is a `400
   * validation` error and nothing is written. `tolerated` names the document whose existing faults are kept when the
   * folder holds no readable house yet (a clone keeps its source's faults).
   */
  async write(houseId: string, document: HouseDocument, tolerated?: HouseDocument): Promise<void> {
    const stored = await this.readFrom(this.paths.houseDir(houseId), houseId);
    const previous = stored.kind === "ok" ? stored.document : tolerated;
    const problem = validateHouseDocument(document, previous);
    const inherited = previous !== undefined && validateHouseDocument(previous, previous) === problem;
    if (problem !== undefined && !inherited) {
      const integrity = newIntegrityProblems(document, previous);
      throw validationError(
        integrity.length > 0 ? integrity : [{ pointer: "", message: problem }],
        "The house document breaks a house rule.",
      );
    }
    await atomicWriteFile(await this.paths.contained(this.paths.houseFile(houseId)), toJsonText(document));
  }

  async createFolder(houseId: string): Promise<string> {
    const directory = await this.paths.contained(this.paths.houseDir(houseId));
    await mkdir(directory, { recursive: false });
    return directory;
  }

  async removeFolder(directory: string): Promise<void> {
    await rm(await this.paths.contained(directory), { recursive: true, force: true });
  }

  async moveToTrash(houseId: string): Promise<void> {
    const from = await this.paths.contained(this.paths.houseDir(houseId));
    const to = await this.paths.contained(this.paths.trashedHouseDir(houseId));
    await mkdir(this.paths.trashDir, { recursive: true });
    await rename(from, to);
    const now = new Date();
    await utimes(to, now, now);
  }

  async restoreFromTrash(houseId: string): Promise<void> {
    const from = await this.paths.contained(this.paths.trashedHouseDir(houseId));
    const to = await this.paths.contained(this.paths.houseDir(houseId));
    await rename(from, to);
  }
}
