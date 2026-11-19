import * as fs from "node:fs";
import { producerVersion } from "../runtimePaths";
import { posix } from "node:path";
import { isDescendent, readBlob, resolveRef, readCommit } from "isomorphic-git";
import type { SnapshotManifestValue } from "../../shared/contracts/homeplanIntegration";
import { SnapshotManifest } from "../../shared/contracts/homeplanIntegration";
import { compileValidator } from "../../shared/domain/validation/ajv";
import { isBuiltInImageId } from "../../shared/domain/house/builtinMaterials";
import { emptyHouseBindings } from "../../shared/domain/schemas/homeAssistant";
import { safeArtifactPath } from "../../shared/domain/validation/artifact";
import { readGlbJson } from "../../shared/domain/templates/glbJson";
import { validateTemplateMetadata, parseNodeRule } from "../../shared/domain/templates/metadata";
import type { NodeRule } from "../../shared/domain/templates/metadata";
import {
  defaultScene,
  homeplanOf,
  gltfNodes,
  gltfMaterials,
  nameOf,
  stringArray,
} from "../templates/gltfJson";
import { supportedRequiredExtensions } from "../templates/normalize";
import { ApiError } from "../http/errors";
import { isRecord } from "../lib/json";
import { decodeHouseText } from "../repositories/houseRepository";
import type { ServiceContext } from "../services/context";
import { houseLock } from "../services/context";
import { requireHouse } from "../services/houseService";
import { getPreferences } from "../services/preferencesService";
import { checkedPath, cleanupArtifacts, fileEntry, identity, storeArtifact } from "./artifacts";

const checkTemplate = (value: unknown): void => {
  if (!isRecord(value) || !isRecord(value.asset) || value.asset.version !== "2.0")
    throw new ApiError("invalidDocument", "A saved template is not glTF 2.0.");
  if (stringArray(value.extensionsRequired).some((extension) => !supportedRequiredExtensions.has(extension)))
    throw new ApiError("invalidDocument", "A saved template needs an unsupported extension.");
  const nodeRules: Record<string, NodeRule> = {};
  for (const node of gltfNodes(value)) {
    const result = parseNodeRule(homeplanOf(node));
    if (result.issues.length > 0)
      throw new ApiError("invalidDocument", "A saved template has invalid node metadata.");
    if (result.rule !== undefined) nodeRules[nameOf(node)] = result.rule;
  }
  const scene = defaultScene(value);
  const result = validateTemplateMetadata(scene === undefined ? undefined : homeplanOf(scene), {
    nodeNames: gltfNodes(value).map(nameOf),
    materialNames: gltfMaterials(value).map(nameOf),
    nodeRules,
  });
  if (result.metadata === null)
    throw new ApiError("invalidDocument", "A saved template has invalid Homeplan metadata.");
};
const encoder = new TextEncoder();
const validator = compileValidator(SnapshotManifest);
export const snapshotRoot = (context: ServiceContext, houseId: string): string =>
  context.paths.houseTransfersDir(houseId);

const sourceInfo = async (context: ServiceContext, houseId: string, base?: string) => {
  await requireHouse(context, houseId);
  const dir = context.paths.houseDir(houseId);
  const oid = await resolveRef({ fs, dir, ref: "HEAD" });
  const commit = await readCommit({ fs, dir, oid });
  const bytes = (await readBlob({ fs, dir, oid, filepath: "house.json" })).blob;
  const decoded = decodeHouseText(new TextDecoder().decode(bytes), houseId);
  if (decoded.kind !== "ok") throw new ApiError("invalidDocument", "The saved house is invalid.");
  let relation: "same" | "newer" | "different" | null = null;
  if (base !== undefined) {
    relation = base === oid ? "same" : "different";
    if (relation === "different") {
      try {
        if (await isDescendent({ fs, dir, oid, ancestor: base })) relation = "newer";
      } catch {
        /* Unknown ancestry stays different. */
      }
    }
  }
  return {
    dir,
    document: decoded.document,
    metadata: {
      houseId,
      sourceRevisionId: oid,
      documentRevision: decoded.document.revision,
      savedAt: new Date(commit.commit.committer.timestamp * 1000).toISOString(),
      producerVersion,
      relation,
    },
  };
};
export const readSnapshotSource = async (context: ServiceContext, houseId: string, base?: string) =>
  (await sourceInfo(context, houseId, base)).metadata;

export const createSnapshot = (
  context: ServiceContext,
  houseId: string,
  expected?: string,
): Promise<SnapshotManifestValue> =>
  context.queue.run(houseLock(houseId), async () => {
    const source = await sourceInfo(context, houseId);
    if (expected !== undefined && source.metadata.sourceRevisionId !== expected)
      throw new ApiError("sourceRevisionChanged", "The saved house changed. Check again.");
    const { revision, preferences } = await getPreferences(context);
    const images = new Set<string>();
    const templates = new Map<string, { id: string; version: number }>();
    const discover = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) discover(item);
        return;
      }
      if (!isRecord(value)) return;
      if (typeof value.imageId === "string") images.add(value.imageId);
      if (typeof value.templateId === "string" && typeof value.templateVersion === "number")
        templates.set(`${value.templateId}@${String(value.templateVersion)}`, {
          id: value.templateId,
          version: value.templateVersion,
        });
      for (const item of Object.values(value)) discover(item);
    };
    discover(source.document);
    const files = new Map<string, Uint8Array>();
    let total = 0;
    const add = (path: string, data: Uint8Array): void => {
      if (!safeArtifactPath(path)) throw new ApiError("invalidDocument", "An asset path is invalid.");
      if (files.has(path)) return;
      total += data.byteLength;
      if (data.byteLength > 134217728 || total > 1073741824 || files.size >= 10000)
        throw new ApiError("tooLarge", "The house snapshot exceeds transfer limits.");
      files.set(path, data);
    };
    const saved = async (path: string): Promise<Uint8Array> => {
      if (!safeArtifactPath(path)) throw new ApiError("invalidDocument", "An asset path is invalid.");
      try {
        return (
          await readBlob({ fs, dir: source.dir, oid: source.metadata.sourceRevisionId, filepath: path })
        ).blob;
      } catch {
        throw new ApiError("invalidDocument", `Saved asset ${path} is missing.`);
      }
    };
    add("house.json", encoder.encode(JSON.stringify(source.document)));
    add(
      "bindings.json",
      encoder.encode(
        JSON.stringify({
          preferencesRevision: revision,
          bindings: preferences.homeAssistant.bindings[houseId] ?? emptyHouseBindings(),
        }),
      ),
    );
    const resources: SnapshotManifestValue["resources"] = { images: [], templates: [] };
    for (const { id, version } of [...templates.values()].sort((a, b) =>
      `${a.id}@${a.version}`.localeCompare(`${b.id}@${b.version}`),
    )) {
      if (!/^(?:t_[a-z0-9]{6,}|[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(id))
        throw new ApiError("invalidDocument", "Invalid template ID.");
      const base = `templates/${id}/${String(version)}`;
      if (!id.startsWith("t_")) {
        const bytes = await context.builtinTemplates.readFile(id, `v${String(version)}.glb`);
        if (bytes === undefined)
          throw new ApiError("invalidDocument", `Built-in ${id} version ${String(version)} is missing.`);
        checkTemplate(readGlbJson(Uint8Array.from(bytes).buffer));
        const path = `${base}/model.glb`;
        add(path, bytes);
        resources.templates.push({ id, version, path, dependencies: [] });
        continue;
      }
      const origin = `assets/templates/${id}`;
      const parsed: unknown = JSON.parse(
        new TextDecoder().decode(await saved(`${origin}/v${String(version)}.gltf`)),
      );
      if (!isRecord(parsed)) throw new ApiError("invalidDocument", "Saved template glTF is invalid.");
      checkTemplate(parsed);
      const dependencies: string[] = [];
      const visit = async (value: unknown): Promise<void> => {
        if (Array.isArray(value)) {
          for (const item of value) await visit(item);
          return;
        }
        if (!isRecord(value)) return;
        if (typeof value.uri === "string" && !value.uri.startsWith("data:")) {
          const uri = value.uri;
          if (!safeArtifactPath(uri))
            throw new ApiError("invalidDocument", "A template has a non-local dependency.");
          const path = `${base}/${uri}`;
          add(path, await saved(`${origin}/${uri}`));
          dependencies.push(path);
        }
        for (const item of Object.values(value)) await visit(item);
      };
      await visit(parsed);
      discover(parsed);
      const path = `${base}/model.gltf`;
      add(path, encoder.encode(JSON.stringify(parsed)));
      resources.templates.push({ id, version, path, dependencies: [...new Set(dependencies)].sort() });
    }
    // Built-in textures (Phase 17.1) are frozen from the app's server/builtin-materials/ like built-in templates.
    const houseImages = [...images].filter((id) => !isBuiltInImageId(id));
    for (const id of [...images].filter(isBuiltInImageId).sort()) {
      const builtIn = await context.builtinImages.read(id, "file");
      const name = context.builtinImages.fileName(id, "file");
      if (builtIn === undefined || name === undefined)
        throw new ApiError("invalidDocument", `Built-in texture ${id} is missing.`);
      const path = `images/${id}/${name}`;
      add(path, builtIn.bytes);
      resources.images.push({ id, path });
    }
    if (houseImages.length > 0) {
      const index = context.images.decode(new TextDecoder().decode(await saved("textures/images.json")));
      for (const id of houseImages.sort()) {
        const entry = index.images.find((image) => image.id === id);
        if (entry === undefined) throw new ApiError("invalidDocument", `Saved image ${id} is missing.`);
        const path = `images/${id}/${posix.basename(entry.file)}`;
        add(path, await saved(entry.file));
        resources.images.push({ id, path });
      }
    }
    const { relation: _relation, ...metadata } = source.metadata;
    const manifest: SnapshotManifestValue = {
      formatVersion: 1,
      snapshotId: "0".repeat(64),
      ...metadata,
      houseSchemaVersion: source.document.schemaVersion,
      requiredViewerProtocol: 1,
      createdAt: new Date().toISOString(),
      migration: {
        preferencesRevision: revision,
        viewer: preferences.homeAssistant.viewer,
        dashboard: preferences.homeAssistant.dashboard,
      },
      files: [...files].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, bytes]) => fileEntry(path, bytes)),
      resources,
    };
    manifest.snapshotId = identity(manifest, "snapshotId");
    if (!validator(manifest) || JSON.stringify(manifest).length > 262144)
      throw new ApiError("tooLarge", "The transfer manifest exceeds its limits.");
    const root = snapshotRoot(context, houseId);
    checkedPath(root, manifest.snapshotId);
    await cleanupArtifacts(root);
    await storeArtifact(root, manifest.snapshotId, manifest, files);
    return manifest;
  });
