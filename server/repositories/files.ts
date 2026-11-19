// Small filesystem helpers used by repositories.
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { isErrnoCode } from "../lib/json";
import { tempSuffix } from "./atomic";

export const readTextIfExists = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, "utf8");
  } catch (error: unknown) {
    if (isErrnoCode(error, "ENOENT")) return undefined;
    throw error;
  }
};

export const isDirectory = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isDirectory();
  } catch (error: unknown) {
    if (isErrnoCode(error, "ENOENT") || isErrnoCode(error, "ENOTDIR")) return false;
    throw error;
  }
};

export const modifiedTime = async (path: string): Promise<Date | undefined> => {
  try {
    return (await stat(path)).mtime;
  } catch (error: unknown) {
    if (isErrnoCode(error, "ENOENT")) return undefined;
    throw error;
  }
};

/** Names of the direct child directories of `directory` (empty when it does not exist). */
export const listChildDirectories = async (directory: string): Promise<readonly string[]> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error: unknown) {
    if (isErrnoCode(error, "ENOENT")) return [];
    throw error;
  }
};

/** House-relative POSIX paths of every regular file under `directory`, skipping temp files. */
export const listFilesRecursive = async (base: string, directory: string): Promise<readonly string[]> => {
  const files: string[] = [];
  const visit = async (current: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error: unknown) {
      if (isErrnoCode(error, "ENOENT")) return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && !entry.name.endsWith(tempSuffix))
        files.push(relative(base, path).split(sep).join("/"));
    }
  };
  await visit(directory);
  return files.sort();
};
