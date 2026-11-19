// Atomic file replacement: temp file in the same directory, fsync, rename, fsync the directory
// (spec/architecture/persistence.md#save-and-concurrency-contract).
import { randomBytes } from "node:crypto";
import { mkdir, open, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

/** Every temporary file the server writes ends with this suffix; `.gitignore` and startup cleanup use it. */
export const tempSuffix = ".homeplan-tmp";

export const fsyncDirectory = async (directory: string): Promise<void> => {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

/** Thrown when the directory a write must land in (or below) no longer exists, for example a trashed house. */
export class MissingDirectoryError extends Error {
  constructor(readonly directory: string) {
    super(`The directory ${directory} does not exist.`);
    this.name = "MissingDirectoryError";
  }
}

export type AtomicWriteOptions = Readonly<{
  /**
   * An existing ancestor of `target` (normally a house folder). Missing directories between it and the target
   * are created; `parentsBelow` itself never is, so a write cannot recreate a trashed or purged house.
   * Without it the target's directory must already exist.
   */
  parentsBelow?: string;
}>;

const isDirectory = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
};

const ensureDirectory = async (directory: string, parentsBelow: string | undefined): Promise<void> => {
  if (parentsBelow === undefined) {
    if (!(await isDirectory(directory))) throw new MissingDirectoryError(directory);
    return;
  }
  const rest = relative(parentsBelow, directory);
  if (rest === ".." || rest.startsWith(`..${sep}`) || isAbsolute(rest))
    throw new Error(`${directory} is not inside ${parentsBelow}.`);
  if (!(await isDirectory(parentsBelow))) throw new MissingDirectoryError(parentsBelow);
  if (rest !== "") await mkdir(directory, { recursive: true });
};

export const atomicWriteFile = async (
  target: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> => {
  const directory = dirname(target);
  await ensureDirectory(directory, options.parentsBelow);
  const temp = join(directory, `.${basename(target)}.${randomBytes(6).toString("hex")}${tempSuffix}`);
  const handle = await open(temp, "wx");
  try {
    await handle.writeFile(data);
    await handle.sync();
  } catch (error: unknown) {
    await handle.close();
    await rm(temp, { force: true });
    throw error;
  }
  await handle.close();
  try {
    await rename(temp, target);
  } catch (error: unknown) {
    await rm(temp, { force: true });
    throw error;
  }
  await fsyncDirectory(directory);
};

/** Removes stale temporary files under `root`, skipping `.git` directories. Returns the removed paths. */
export const removeStaleTempFiles = async (root: string): Promise<readonly string[]> => {
  const removed: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== ".git") await visit(path);
      } else if (entry.isFile() && entry.name.endsWith(tempSuffix)) {
        await rm(path, { force: true });
        removed.push(path);
      }
    }
  };
  await visit(root);
  return removed;
};
