import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat, utimes, writeFile, readdir } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { ArtifactFile } from "../../shared/contracts/homeplanIntegration";
import type { Static } from "typebox";
import { canonicalJson, safeArtifactPath } from "../../shared/domain/validation/artifact";
import { ApiError } from "../http/errors";

export const digest = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");
export const identity = (value: Readonly<Record<string, unknown>>, key: string): string =>
  digest(
    canonicalJson(
      Object.fromEntries(Object.entries(value).filter(([name]) => name !== key && name !== "createdAt")),
    ),
  );
export const mediaType = (path: string): string => {
  if (path.endsWith(".glb")) return "model/gltf-binary";
  if (path.endsWith(".gltf")) return "model/gltf+json";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".png")) return "image/png";
  if (/\.jpe?g$/.test(path)) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".js")) return "text/javascript";
  if (path.endsWith(".css")) return "text/css";
  return "application/octet-stream";
};
export const fileEntry = (path: string, bytes: Uint8Array): Static<typeof ArtifactFile> => ({
  path,
  byteSize: bytes.byteLength,
  sha256: digest(bytes),
  mediaType: mediaType(path),
});
export const checkedPath = (root: string, path: string): string => {
  if (!safeArtifactPath(path)) throw new ApiError("validation", "Invalid artifact path.");
  const result = resolve(root, path);
  if (!result.startsWith(`${resolve(root)}${sep}`))
    throw new ApiError("validation", "Invalid artifact path.");
  return result;
};
export const readArtifactFile = async (root: string, path: string): Promise<Buffer> => {
  const target = checkedPath(root, path);
  try {
    const actual = await realpath(target);
    if (actual !== target) throw new ApiError("validation", "Artifact symlinks are not allowed.");
    return await readFile(actual);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("notFound", "The artifact file is not available.");
  }
};
/** Complete directory promotion; incomplete copies never get the content-addressed name. */
export const storeArtifact = async (
  root: string,
  id: string,
  manifest: unknown,
  files: ReadonlyMap<string, Uint8Array>,
): Promise<void> => {
  await mkdir(root, { recursive: true });
  const target = checkedPath(root, id);
  try {
    await stat(join(target, "manifest.json"));
    await utimes(target, new Date(), new Date());
    return;
  } catch {
    /* A missing complete artifact is built below. */
  }
  const staging = checkedPath(root, `staging-${crypto.randomUUID()}`);
  await mkdir(staging);
  try {
    for (const [path, bytes] of files) {
      const destination = checkedPath(staging, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }
    await writeFile(join(staging, "manifest.json"), JSON.stringify(manifest));
    await rename(staging, target);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
};
export const cleanupArtifacts = async (root: string): Promise<void> => {
  await mkdir(root, { recursive: true });
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^(?:[a-f0-9]{64}|staging-[a-f0-9-]+)$/.test(entry.name)) continue;
    const path = checkedPath(root, entry.name);
    if (Date.now() - (await stat(path)).mtimeMs > 86400000) await rm(path, { recursive: true, force: true });
  }
};
