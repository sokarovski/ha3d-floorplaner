// Startup tasks: create the storage tree, remove stale temp files, orphan images, and incomplete exports.
import { mkdir, rm } from "node:fs/promises";
import { isId } from "../../shared/domain/ids";
import { removeStaleTempFiles } from "../repositories/atomic";
import { listChildDirectories } from "../repositories/files";
import type { ServiceContext } from "./context";

export const prepareStorage = async (context: ServiceContext): Promise<void> => {
  const { paths, log } = context;
  await mkdir(paths.configDir, { recursive: true });
  await mkdir(paths.trashDir, { recursive: true });
  await mkdir(paths.dataDir, { recursive: true });

  const temps = await removeStaleTempFiles(paths.root);
  if (temps.length > 0) log.info({ files: temps }, "Removed stale temporary files");

  // Snapshot exports of houses that are neither in data/ nor in the trash (purged, or a crash during purge).
  // A trashed house keeps its exports until purge so a restore resumes HA imports; they are not served meanwhile.
  for (const name of await listChildDirectories(paths.transfersDir)) {
    if (!isId(name)) continue;
    if ((await context.houses.exists(name)) || (await context.houses.isTrashed(name))) continue;
    await rm(paths.houseTransfersDir(name), { recursive: true, force: true });
    log.info({ houseId: name }, "Removed snapshot exports of a house that no longer exists");
  }

  for (const houseId of (await listChildDirectories(paths.dataDir)).filter(isId)) {
    try {
      const orphans = await context.images.removeOrphans(houseId);
      const incomplete = await context.exports.removeIncomplete(houseId);
      if (orphans.length + incomplete.length > 0)
        log.info({ houseId, orphans, incomplete }, "Removed files without index entries");
    } catch (error: unknown) {
      log.warn({ houseId, err: error }, "Startup cleanup failed for a house");
    }
  }
};
