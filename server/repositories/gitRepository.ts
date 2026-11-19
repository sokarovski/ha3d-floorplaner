// Per-house Git history with isomorphic-git (spec/architecture/persistence.md#revision-history).
import * as fs from "node:fs";
import { createHash } from "node:crypto";
import {
  Errors,
  TREE,
  add,
  commit,
  init,
  log,
  readBlob,
  readCommit,
  remove,
  statusMatrix,
  walk,
} from "isomorphic-git";
import type { ReadCommitResult } from "isomorphic-git";
import { ApiError } from "../http/errors";
import { tempSuffix } from "./atomic";

/** The fixed installation identity: there are no users (D12). */
export const gitAuthor = { name: "Homeplan", email: "homeplan@localhost" } as const;

export const gitignoreText = `# Managed by Homeplan.\nexports/\n*${tempSuffix}\n`;

/** Files that belong to a revision: house.json, the image library, templates, and .gitignore. */
export const isTrackedPath = (path: string): boolean =>
  !path.endsWith(tempSuffix) &&
  (path === "house.json" ||
    path === ".gitignore" ||
    path.startsWith("textures/") ||
    path.startsWith("assets/"));

/** Files that a restore and a diff consider (everything tracked except Git's own .gitignore). */
export const isContentPath = (path: string): boolean => isTrackedPath(path) && path !== ".gitignore";

export type CommitInfo = Readonly<{
  id: string;
  time: string;
  subject: string;
  changedFiles: readonly string[];
}>;

const subjectOf = (message: string): string => message.split("\n", 1)[0]?.trim() ?? "";

const toInfo = (entry: ReadCommitResult, changedFiles: readonly string[]): CommitInfo => ({
  id: entry.oid,
  time: new Date(entry.commit.committer.timestamp * 1000).toISOString(),
  subject: subjectOf(entry.commit.message),
  changedFiles,
});

const changedPaths = (entry: ReadCommitResult): readonly string[] => {
  const paths = new Set<string>();
  for (const change of entry.commit.changes ?? []) {
    const path = change[2];
    if (typeof path === "string") paths.add(path);
  }
  return [...paths].sort();
};

const notFound = (error: unknown): boolean => error instanceof Errors.NotFoundError;

export const initRepository = async (dir: string): Promise<void> => {
  await init({ fs, dir, defaultBranch: "main" });
};

/**
 * Stages every tracked change and commits it. Returns undefined (and commits nothing) when the working
 * state equals HEAD. The message is the subject plus the list of changed files.
 */
export const commitAll = async (dir: string, subject: string): Promise<CommitInfo | undefined> => {
  const rows = await statusMatrix({ fs, dir, filter: isTrackedPath });
  const changed = rows.filter(([, head, workdir]) => !(head === 1 && workdir === 1));
  if (changed.length === 0) return undefined;
  const changedFiles: string[] = [];
  for (const [filepath, , workdir] of changed) {
    if (workdir === 0) await remove({ fs, dir, filepath });
    else await add({ fs, dir, filepath });
    changedFiles.push(filepath);
  }
  changedFiles.sort();
  const message = `${subject}\n\nChanged files:\n${changedFiles.map((path) => `- ${path}`).join("\n")}\n`;
  const oid = await commit({ fs, dir, message, author: gitAuthor });
  const entry = await readCommit({ fs, dir, oid });
  return toInfo(entry, changedFiles);
};

/** Newest first, starting at `before`'s parent (or HEAD). Returns one extra entry to detect a next page. */
export const listCommits = async (
  dir: string,
  before: string | undefined,
  limit: number,
): Promise<{ commits: readonly CommitInfo[]; nextBefore: string | null }> => {
  let entries: readonly ReadCommitResult[];
  try {
    entries = await log({
      fs,
      dir,
      ref: before ?? "HEAD",
      depth: limit + (before === undefined ? 1 : 2),
      includeChanges: true,
    });
  } catch (error: unknown) {
    if (notFound(error)) throw new ApiError("notFound", "The revision does not exist.");
    throw error;
  }
  const page = before === undefined ? entries : entries.slice(1);
  const visible = page.slice(0, limit);
  const last = visible.at(-1);
  return {
    commits: visible.map((entry) => toInfo(entry, changedPaths(entry))),
    nextBefore: page.length > limit && last !== undefined ? last.oid : null,
  };
};

export const readCommitInfo = async (dir: string, oid: string): Promise<CommitInfo> => {
  try {
    const entries = await log({ fs, dir, ref: oid, depth: 1, includeChanges: true });
    const entry = entries[0];
    if (entry?.oid !== oid) throw new ApiError("notFound", "The revision does not exist.");
    return toInfo(entry, changedPaths(entry));
  } catch (error: unknown) {
    if (notFound(error)) throw new ApiError("notFound", "The revision does not exist.");
    throw error;
  }
};

/** Every content file of a commit's tree, as house-relative path → bytes. */
export const readCommitFiles = async (dir: string, oid: string): Promise<ReadonlyMap<string, Uint8Array>> => {
  const files = new Map<string, Uint8Array>();
  try {
    await readCommit({ fs, dir, oid });
    await walk({
      fs,
      dir,
      trees: [TREE({ ref: oid })],
      map: async (filepath, entries) => {
        const entry = entries[0];
        if (entry === null || entry === undefined || filepath === ".") return true;
        if ((await entry.type()) !== "blob" || !isContentPath(filepath)) return true;
        const content = await entry.content();
        if (content instanceof Uint8Array) files.set(filepath, content);
        return true;
      },
    });
  } catch (error: unknown) {
    if (notFound(error)) throw new ApiError("notFound", "The revision does not exist.");
    throw error;
  }
  return files;
};

/** Git's object ID of a blob with these bytes (SHA-1 of `blob <length>\0<bytes>`). */
export const blobOid = (bytes: Uint8Array): string =>
  createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");

/** Every content file of a commit's tree as house-relative path → blob ID, without reading any content. */
export const readCommitBlobIds = async (dir: string, oid: string): Promise<ReadonlyMap<string, string>> => {
  const blobs = new Map<string, string>();
  try {
    await readCommit({ fs, dir, oid });
    await walk({
      fs,
      dir,
      trees: [TREE({ ref: oid })],
      map: async (filepath, entries) => {
        const entry = entries[0];
        if (entry === null || entry === undefined || filepath === ".") return true;
        if ((await entry.type()) !== "blob" || !isContentPath(filepath)) return true;
        blobs.set(filepath, await entry.oid());
        return true;
      },
    });
  } catch (error: unknown) {
    if (notFound(error)) throw new ApiError("notFound", "The revision does not exist.");
    throw error;
  }
  return blobs;
};

/** The bytes of one blob by its ID. */
export const readBlobBytes = async (dir: string, oid: string): Promise<Uint8Array> =>
  (await readBlob({ fs, dir, oid })).blob;
