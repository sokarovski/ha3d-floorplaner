// Houses: list, create, clone, rename, trash, restore, purge (spec/architecture/api.md#houses, D14).
import { cp, rm, writeFile } from "node:fs/promises";
import { relative, sep } from "node:path";
import type { HouseCardValue, TrashedHouseValue, ValidHouseCardValue } from "../../shared/contracts/houses";
import { createHouseDocument } from "../../shared/domain/house/defaults";
import { createId, isId } from "../../shared/domain/ids";
import type { HouseDocument } from "../../shared/domain/schemas/house";
import { ApiError, validationError } from "../http/errors";
import { normalizeName } from "../lib/json";
import { listChildDirectories, modifiedTime } from "../repositories/files";
import { commitAll, gitignoreText, initRepository } from "../repositories/gitRepository";
import type { HouseReadResult } from "../repositories/houseRepository";
import type { ServiceContext } from "./context";
import { houseLock } from "./context";
import { removeHouseBindings } from "./preferencesService";

const validCard = (document: HouseDocument, modifiedAt: Date): ValidHouseCardValue => ({
  status: "ok",
  id: document.id,
  name: document.name,
  floorCount: document.floors.length,
  revision: document.revision,
  modifiedAt: modifiedAt.toISOString(),
});

const cardFromRead = (folderName: string, result: HouseReadResult, fallbackTime: Date): HouseCardValue => {
  if (result.kind === "ok") return validCard(result.document, result.modifiedAt);
  if (result.kind === "missing") {
    return {
      status: "invalid",
      id: folderName,
      modifiedAt: fallbackTime.toISOString(),
      problem: { code: "invalidDocument", message: "house.json is missing." },
    };
  }
  return {
    status: "invalid",
    id: folderName,
    modifiedAt: result.modifiedAt.toISOString(),
    problem: { code: result.code, message: result.message },
  };
};

const invalidFolderCard = (folderName: string, modifiedAt: Date): HouseCardValue => ({
  status: "invalid",
  id: folderName,
  modifiedAt: modifiedAt.toISOString(),
  problem: { code: "invalidDocument", message: "The folder name is not a valid house ID." },
});

/** Validates and normalizes a display name, reporting `pointer` on failure. */
export const checkedName = (raw: string, pointer: string): string => {
  const name = normalizeName(raw);
  if (name.length < 1 || name.length > 120 || /\p{Cc}/u.test(name)) {
    throw validationError([{ pointer, message: "must be 1–120 characters without control characters" }]);
  }
  return name;
};

/** Throws 404 unless the house folder exists in data/. */
export const requireHouse = async (context: ServiceContext, houseId: string): Promise<void> => {
  if (!(await context.houses.exists(houseId)))
    throw new ApiError("notFound", `House ${houseId} does not exist.`);
};

/** Loads a valid, current-version document or throws 404 / 422 (never writes). */
export const loadDocument = async (
  context: ServiceContext,
  houseId: string,
): Promise<{ document: HouseDocument; modifiedAt: Date }> => {
  const result = await context.houses.read(houseId);
  if (result.kind === "missing") throw new ApiError("notFound", `House ${houseId} does not exist.`);
  if (result.kind === "invalid") {
    throw new ApiError(
      result.code,
      result.message,
      result.issues.length === 0 ? undefined : { errors: result.issues },
    );
  }
  return { document: result.document, modifiedAt: result.modifiedAt };
};

const sortByModified = <T>(items: readonly T[], time: (item: T) => string): T[] =>
  [...items].sort((a, b) => time(b).localeCompare(time(a)));

export const listHouses = async (context: ServiceContext): Promise<readonly HouseCardValue[]> => {
  const cards: HouseCardValue[] = [];
  for (const name of await listChildDirectories(context.paths.dataDir)) {
    if (name.startsWith(".")) continue;
    const folderTime = (await modifiedTime(context.paths.inside(context.paths.dataDir, name))) ?? new Date(0);
    if (!isId(name)) {
      cards.push(invalidFolderCard(name, folderTime));
      continue;
    }
    cards.push(cardFromRead(name, await context.houses.read(name), folderTime));
  }
  return sortByModified(cards, (card) => card.modifiedAt);
};

/**
 * A new house folder holding `document` (whose id is `houseId`): an empty image index, house.json, and a fresh
 * Git repository with one commit, `subject`. Nothing is left behind on failure.
 */
const writeNewHouse = async (
  context: ServiceContext,
  houseId: string,
  document: HouseDocument,
  subject: string,
): Promise<ValidHouseCardValue> =>
  context.queue.run(houseLock(houseId), async () => {
    const directory = await context.houses.createFolder(houseId);
    try {
      await writeFile(context.paths.inside(directory, ".gitignore"), gitignoreText);
      await context.images.writeIndex(houseId, { schemaVersion: 1, images: [] });
      await context.houses.write(houseId, document);
      await initRepository(directory);
      await commitAll(directory, subject);
      const { modifiedAt } = await loadDocument(context, houseId);
      return validCard(document, modifiedAt);
    } catch (error: unknown) {
      await context.houses.removeFolder(directory);
      throw error;
    }
  });

export const createHouse = async (context: ServiceContext, rawName: string): Promise<ValidHouseCardValue> => {
  const name = checkedName(rawName, "/body/name");
  const houseId = createId("h");
  return writeNewHouse(context, houseId, createHouseDocument(houseId, name), "Create house");
};

/**
 * A new house from a prepared document (the demo houses, persistence.md#demo-houses): a new ID, revision 0, and a
 * fresh history whose only commit is `subject`. The document must reference only built-in assets.
 */
export const createHouseFromDocument = async (
  context: ServiceContext,
  source: HouseDocument,
  subject: string,
): Promise<ValidHouseCardValue> => {
  const houseId = createId("h");
  return writeNewHouse(context, houseId, { ...source, id: houseId, revision: 0 }, subject);
};

/**
 * Clone house (Phase 7.13): a new house with the source's last saved state (house.json, images, textures, house
 * templates), a new ID and name, and a fresh history with one revision. Git history and exports stay with the
 * source, which is not changed. Asset IDs are house-relative, so only house.json's id and name are rewritten.
 */
export const cloneHouse = async (
  context: ServiceContext,
  sourceId: string,
  rawName: string | undefined,
): Promise<ValidHouseCardValue> => {
  const houseId = createId("h");
  return context.queue.run(houseLock(sourceId), async () => {
    const { document: source } = await loadDocument(context, sourceId);
    const name = rawName === undefined ? `${source.name} (copy)` : checkedName(rawName, "/body/name");
    const sourceDir = context.paths.houseDir(sourceId);
    const directory = await context.houses.createFolder(houseId);
    try {
      await cp(sourceDir, directory, {
        recursive: true,
        force: true,
        filter: (path) => {
          const [top] = relative(sourceDir, path).split(sep);
          return top !== ".git" && top !== "exports";
        },
      });
      const document: HouseDocument = { ...source, id: houseId, name, revision: 0 };
      await context.houses.write(houseId, document, source);
      await initRepository(directory);
      await commitAll(directory, `Cloned from ${source.name} at revision ${String(source.revision)}`);
      const { modifiedAt } = await loadDocument(context, houseId);
      return validCard(document, modifiedAt);
    } catch (error: unknown) {
      await context.houses.removeFolder(directory);
      throw error;
    }
  });
};

export const renameHouse = async (
  context: ServiceContext,
  houseId: string,
  rawName: string,
  expectedRevision: number,
): Promise<{ revision: number; house: ValidHouseCardValue }> => {
  const name = checkedName(rawName, "/body/name");
  return context.queue.run(houseLock(houseId), async () => {
    const { document } = await loadDocument(context, houseId);
    if (document.revision !== expectedRevision) {
      throw new ApiError("staleRevision", "The house was changed since it was loaded.", {
        currentRevision: document.revision,
      });
    }
    const next: HouseDocument = { ...document, name, revision: document.revision + 1 };
    await context.houses.write(houseId, next);
    const { modifiedAt } = await loadDocument(context, houseId);
    return { revision: next.revision, house: validCard(next, modifiedAt) };
  });
};

export const trashHouse = async (context: ServiceContext, houseId: string): Promise<void> =>
  context.queue.run(houseLock(houseId), async () => {
    await requireHouse(context, houseId);
    if (await context.houses.isTrashed(houseId))
      throw new ApiError("nameTaken", "A trashed house with this ID already exists.");
    // Stops this house's render jobs first, so nothing writes into the folder after the move.
    await context.houseRemoval.run(houseId);
    await context.houses.moveToTrash(houseId);
  });

const trashedCard = async (context: ServiceContext, houseId: string): Promise<TrashedHouseValue> => {
  const directory = context.paths.trashedHouseDir(houseId);
  const trashedAt = (await modifiedTime(directory)) ?? new Date(0);
  const result = await context.houses.readFrom(directory, houseId);
  return { house: cardFromRead(houseId, result, trashedAt), trashedAt: trashedAt.toISOString() };
};

export const listTrash = async (context: ServiceContext): Promise<readonly TrashedHouseValue[]> => {
  const items: TrashedHouseValue[] = [];
  for (const name of await listChildDirectories(context.paths.trashDir)) {
    if (isId(name)) items.push(await trashedCard(context, name));
  }
  return sortByModified(items, (item) => item.trashedAt);
};

export const restoreHouse = async (context: ServiceContext, houseId: string): Promise<HouseCardValue> =>
  context.queue.run(houseLock(houseId), async () => {
    if (!(await context.houses.isTrashed(houseId)))
      throw new ApiError("notFound", `House ${houseId} is not in the trash.`);
    if (await context.houses.exists(houseId))
      throw new ApiError("nameTaken", "A house with this ID already exists.");
    await context.houses.restoreFromTrash(houseId);
    const folderTime = (await modifiedTime(context.paths.houseDir(houseId))) ?? new Date(0);
    return cardFromRead(houseId, await context.houses.read(houseId), folderTime);
  });

export const purgeHouse = async (context: ServiceContext, houseId: string): Promise<void> =>
  context.queue.run(houseLock(houseId), async () => {
    if (!(await context.houses.isTrashed(houseId)))
      throw new ApiError("notFound", `House ${houseId} is not in the trash.`);
    await context.houses.removeFolder(context.paths.trashedHouseDir(houseId));
    // Nothing of a purged house stays behind: its frozen HA snapshot exports and its HA bindings.
    await rm(await context.paths.contained(context.paths.houseTransfersDir(houseId)), {
      recursive: true,
      force: true,
    });
    await removeHouseBindings(context, houseId);
  });
