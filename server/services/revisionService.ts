// Git revisions: Save commit, history list, diff against the working state, restore
// (spec/architecture/api.md#house-document, spec/architecture/persistence.md#revision-history).
import { readFile } from "node:fs/promises";
import { createTwoFilesPatch } from "diff";
import type { FileDiffValue, RevisionSummaryValue } from "../../shared/contracts/revisions";
import type { ImageIndexDocumentValue } from "../../shared/contracts/images";
import type { HouseDocument } from "../../shared/domain/schemas/house";
import { ApiError } from "../http/errors";
import { parseJson } from "../lib/json";
import { jsonChanges } from "../lib/jsonDiff";
import { listFilesRecursive } from "../repositories/files";
import {
  blobOid,
  commitAll,
  isContentPath,
  listCommits,
  readBlobBytes,
  readCommitBlobIds,
  readCommitFiles,
  readCommitInfo,
} from "../repositories/gitRepository";
import type { CommitInfo } from "../repositories/gitRepository";
import { decodeHouseText } from "../repositories/houseRepository";
import type { ServiceContext } from "./context";
import { houseLock } from "./context";
import { requireHouse } from "./houseService";

const toSummary = (info: CommitInfo): RevisionSummaryValue => ({
  id: info.id,
  time: info.time,
  message: info.subject,
  changedFiles: [...info.changedFiles],
});

const shortId = (oid: string): string => oid.slice(0, 7);

export const createRevision = async (
  context: ServiceContext,
  houseId: string,
  note: string | undefined,
): Promise<RevisionSummaryValue | undefined> => {
  await requireHouse(context, houseId);
  const subject = (note ?? "").replace(/\s+/g, " ").trim();
  return context.queue.run(houseLock(houseId), async () => {
    const info = await commitAll(context.paths.houseDir(houseId), subject === "" ? "Save" : subject);
    return info === undefined ? undefined : toSummary(info);
  });
};

export const listRevisions = async (
  context: ServiceContext,
  houseId: string,
  before: string | undefined,
  limit: number,
): Promise<{ revisions: RevisionSummaryValue[]; nextBefore: string | null }> => {
  await requireHouse(context, houseId);
  const { commits, nextBefore } = await listCommits(context.paths.houseDir(houseId), before, limit);
  return { revisions: commits.map(toSummary), nextBefore };
};

/**
 * Implementation conventions for the diff: a unified `patch` is produced only when both sides are at most
 * 1 MB, and is omitted when jsdiff exceeds its edit-length or time bound. Structured JSON `changes` stay.
 */
export const patchMaxBytes = 1024 * 1024;
const patchMaxEditLength = 20000;
const patchTimeoutMs = 1000;

const textDecoder = new TextDecoder("utf-8", { fatal: true });

const decodeText = (bytes: Uint8Array | undefined): string | undefined => {
  if (bytes === undefined) return "";
  try {
    return textDecoder.decode(bytes);
  } catch {
    return undefined;
  }
};

const isTextPath = (path: string): boolean => /\.(json|gltf|txt|svg)$/.test(path);

const fileDiff = (
  path: string,
  before: Uint8Array | undefined,
  after: Uint8Array | undefined,
): FileDiffValue => {
  const status = before === undefined ? "added" : after === undefined ? "removed" : "modified";
  const beforeText = isTextPath(path) ? decodeText(before) : undefined;
  const afterText = isTextPath(path) ? decodeText(after) : undefined;
  if (beforeText === undefined || afterText === undefined) return { path, status, format: "binary" };
  const small = (before?.byteLength ?? 0) <= patchMaxBytes && (after?.byteLength ?? 0) <= patchMaxBytes;
  const patch = small
    ? createTwoFilesPatch(`a/${path}`, `b/${path}`, beforeText, afterText, "revision", "working", {
        maxEditLength: patchMaxEditLength,
        timeout: patchTimeoutMs,
      })
    : undefined;
  const withPatch = patch === undefined ? {} : { patch };
  if (path.endsWith(".json")) {
    const parsedBefore =
      before === undefined ? { ok: true as const, value: undefined } : parseJson(beforeText);
    const parsedAfter = after === undefined ? { ok: true as const, value: undefined } : parseJson(afterText);
    if (parsedBefore.ok && parsedAfter.ok) {
      const { changes, truncated } = jsonChanges(parsedBefore.value, parsedAfter.value);
      return { path, status, format: "json", changes: [...changes], truncated, ...withPatch };
    }
  }
  return { path, status, format: "text", ...withPatch };
};

export const diffRevision = async (
  context: ServiceContext,
  houseId: string,
  revisionId: string,
): Promise<{ revisionId: string; files: FileDiffValue[] }> => {
  await requireHouse(context, houseId);
  const directory = context.paths.houseDir(houseId);
  // Blob IDs first: unchanged files are skipped by hash, and only changed text files are read in full.
  const revisionBlobs = await readCommitBlobIds(directory, revisionId);
  const workingPaths = new Set((await listFilesRecursive(directory, directory)).filter(isContentPath));
  const files: FileDiffValue[] = [];
  const readWorking = async (path: string): Promise<Uint8Array> =>
    readFile(await context.paths.contained(context.paths.inside(directory, path)));
  for (const path of [...new Set([...revisionBlobs.keys(), ...workingPaths])].sort()) {
    const beforeId = revisionBlobs.get(path);
    const inWorking = workingPaths.has(path);
    let after: Uint8Array | undefined;
    if (inWorking && (beforeId !== undefined || isTextPath(path))) {
      after = await readWorking(path);
      if (beforeId !== undefined && blobOid(after) === beforeId) continue;
    }
    if (!isTextPath(path)) {
      const status = beforeId === undefined ? "added" : inWorking ? "modified" : "removed";
      files.push({ path, status, format: "binary" });
      continue;
    }
    const before = beforeId === undefined ? undefined : await readBlobBytes(directory, beforeId);
    files.push(fileDiff(path, before, after));
  }
  return { revisionId, files };
};

/**
 * Keeps the image library additive across a restore: the revision's entries win, and working entries
 * the revision does not know are kept (their files stay on disk), so no upload is lost.
 */
const mergeImageIndexes = (
  restored: ImageIndexDocumentValue,
  working: ImageIndexDocumentValue,
): ImageIndexDocumentValue => {
  const known = new Set(restored.images.map((entry) => entry.id));
  return {
    schemaVersion: 1,
    images: [...restored.images, ...working.images.filter((entry) => !known.has(entry.id))],
  };
};

export const restoreRevision = async (
  context: ServiceContext,
  houseId: string,
  revisionId: string,
  expectedRevision: number,
): Promise<{ revision: number; document: HouseDocument; commit: RevisionSummaryValue }> => {
  await requireHouse(context, houseId);
  const directory = context.paths.houseDir(houseId);
  return context.queue.run(houseLock(houseId), async () => {
    const original = await readCommitInfo(directory, revisionId);
    const files = await readCommitFiles(directory, revisionId);
    const houseBytes = files.get("house.json");
    if (houseBytes === undefined) throw new ApiError("invalidDocument", "The revision has no house.json.");
    const decoded = decodeHouseText(new TextDecoder().decode(houseBytes), houseId);
    if (decoded.kind === "invalid") {
      throw new ApiError(
        decoded.code,
        `The revision's house.json cannot be restored: ${decoded.message}`,
        decoded.issues.length === 0 ? undefined : { errors: decoded.issues },
      );
    }

    // The stale check needs a readable working document; a corrupt one can always be restored over.
    const current = await context.houses.read(houseId);
    if (current.kind === "invalid" && current.code === "unsupportedVersion")
      throw new ApiError(current.code, current.message);
    if (current.kind === "ok" && current.document.revision !== expectedRevision) {
      throw new ApiError("staleRevision", "The house was changed since it was loaded.", {
        currentRevision: current.document.revision,
      });
    }
    const baseRevision = current.kind === "ok" ? current.document.revision : decoded.document.revision;
    const document: HouseDocument = {
      ...decoded.document,
      revision: Math.max(baseRevision, decoded.document.revision) + 1,
    };

    let workingIndex: ImageIndexDocumentValue = { schemaVersion: 1, images: [] };
    try {
      workingIndex = await context.images.readIndex(houseId);
    } catch (error: unknown) {
      if (!(error instanceof ApiError)) throw error;
    }
    for (const [path, bytes] of files) {
      if (path === "house.json" || path === "textures/images.json") continue;
      await context.images.writeAsset(houseId, path, bytes);
    }
    const indexBytes = files.get("textures/images.json");
    const restoredIndex =
      indexBytes === undefined
        ? { schemaVersion: 1 as const, images: [] }
        : context.images.decode(new TextDecoder().decode(indexBytes));
    await context.images.writeIndex(houseId, mergeImageIndexes(restoredIndex, workingIndex));
    await context.houses.write(houseId, document);

    const info = await commitAll(directory, `Restore to ${shortId(revisionId)}: ${original.subject}`);
    if (info === undefined) throw new ApiError("internal", "The restore produced no commit.");
    return { revision: document.revision, document, commit: toSummary(info) };
  });
};
