// House templates (Phase 2): import, draft, versions, files, list, delete
// (spec/builder/features/object-templates.md, spec/builder/screens/object-editor.md, D07, D17).
// Folder: assets/templates/<t_id>/ { source.glb|source.gltf|source.stl, base.gltf, geometry.bin,
// textures/, draft.json, v<N>.gltf, thumbnail.svg }.
import { readFile, readdir, rm } from "node:fs/promises";
import { validateBytes } from "gltf-validator";
import { TemplateDraft } from "../../shared/contracts/templates";
import type {
  RootTransformValue,
  SaveTemplateVersionBodyValue,
  TemplateDraftValue,
  TemplateImportOptionsValue,
  TemplateListItemValue,
} from "../../shared/contracts/templates";
import { createId, isId } from "../../shared/domain/ids";
import {
  homeplanExtras,
  parseNodeRule,
  templatePickerFields,
  validateTemplateMetadata,
} from "../../shared/domain/templates/metadata";
import type {
  NodeRule,
  TemplateAssetSummary,
  TemplateMetadata,
} from "../../shared/domain/templates/metadata";
import { compileValidator } from "../../shared/domain/validation/ajv";
import { ApiError, validationError } from "../http/errors";
import { isErrnoCode, isRecord, parseJson, pointerToken, toJsonText } from "../lib/json";
import type { JsonRecord } from "../lib/json";
import { atomicWriteFile } from "../repositories/atomic";
import { listChildDirectories, readTextIfExists } from "../repositories/files";
import {
  defaultScene,
  gltfMaterials,
  gltfNodes,
  homeplanOf,
  indexArray,
  nameOf,
  recordArray,
  setHomeplan,
} from "../templates/gltfJson";
import { cleanDocument, readGltfSource, writeNormalized } from "../templates/normalize";
import type { NormalizedAsset } from "../templates/normalize";
import {
  axesArePerpendicular,
  identityRootTransform,
  isIdentityMatrix,
  rootMatrix,
  rotationRows,
  transformedBoundsMm,
  unitScale,
} from "../templates/rootTransform";
import type { SourceBounds, Vec3 } from "../templates/rootTransform";
import { parseStl, stlBounds, stlDocument } from "../templates/stl";
import type { ServiceContext } from "./context";
import { houseLock } from "./context";
import { loadDocument, requireHouse } from "./houseService";

/** D16: model files up to 100 MB. */
export const modelMaxBytes = 100 * 1024 * 1024;
export const rootNodeName = "HomeplanRoot";

const validateDraft = compileValidator(TemplateDraft);

/** draft.json: the public draft plus the source-frame bounds needed to recompute bounds for a new root transform. */
type StoredDraft = Readonly<{ draft: TemplateDraftValue; sourceBounds: SourceBounds }>;

const isVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number");

// ---------------------------------------------------------------------------------------------
// Draft helpers

const assetSummary = (
  gltf: JsonRecord,
  nodeRules: Readonly<Record<string, NodeRule>>,
): TemplateAssetSummary => ({
  nodeNames: gltfNodes(gltf).map(nameOf),
  materialNames: gltfMaterials(gltf).map(nameOf),
  nodeRules,
});

const slotKey = (name: string, used: ReadonlySet<string>): string => {
  const words = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "");
  const camel = words
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`,
    )
    .join("");
  const base = camel === "" || !/^[a-z]/.test(camel) ? `slot${camel}` : camel;
  let key = base;
  for (let n = 2; used.has(key); n += 1) key = `${base}${n}`;
  return key;
};

/** A neutral starting point: an Areable floor object, fixed on every axis, one slot per material. */
export const defaultMetadata = (label: string, materialNames: readonly string[]): TemplateMetadata => {
  const materialSlots: Record<string, string> = {};
  const used = new Set<string>();
  for (const name of new Set(materialNames)) {
    const key = slotKey(name, used);
    used.add(key);
    materialSlots[key] = name;
  }
  return {
    schemaVersion: 1,
    kind: "object",
    label,
    contract: "Areable",
    attachment: { hosts: ["floor"], contact: "bottom" },
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    flip: { x: false, z: false },
    opening: null,
    materialSlots,
  };
};

const labelFromFilename = (filename: string): string => {
  const base = filename
    .replace(/\.[^.]*$/, "")
    .replace(/[_-]+/g, " ")
    .normalize("NFC")
    .trim();
  return (base === "" ? "Imported object" : base).slice(0, 120);
};

const buildDraft = (
  templateId: string,
  label: string,
  sourceFormat: TemplateDraftValue["sourceFormat"],
  normalized: NormalizedAsset,
  rootTransform: RootTransformValue,
  importWarnings: readonly string[],
): TemplateDraftValue => {
  const { gltf } = normalized;
  const warnings = [...importWarnings];
  const nodes = gltfNodes(gltf).map((node, index) => ({
    index,
    name: nameOf(node),
    mesh: typeof node.mesh === "number",
    children: indexArray(node.children),
  }));
  const nodeRules: Record<string, NodeRule> = {};
  for (const node of gltfNodes(gltf)) {
    const parsed = parseNodeRule(homeplanOf(node));
    if (parsed.rule !== undefined) nodeRules[nameOf(node)] = parsed.rule;
    else if (parsed.issues.length > 0)
      warnings.push(`Ignored invalid extras.homeplan on node ${nameOf(node)}.`);
  }
  const materials = gltfMaterials(gltf).map(nameOf);
  const scene = defaultScene(gltf);
  const sourceMetadata = homeplanExtras(scene?.extras);
  let prefilledMetadata = defaultMetadata(label, materials);
  let metadataSource: TemplateDraftValue["metadataSource"] = "default";
  if (sourceMetadata !== undefined) {
    const result = validateTemplateMetadata(sourceMetadata, assetSummary(gltf, nodeRules));
    if (result.metadata !== null) {
      prefilledMetadata = result.metadata;
      metadataSource = "extras";
    } else {
      warnings.push(
        `The source's extras.homeplan is invalid (${result.issues
          .slice(0, 3)
          .map((issue) => `${issue.pointer || "/"} ${issue.message}`)
          .join("; ")}); using defaults.`,
      );
    }
  }
  const hasUv =
    gltfNodes(gltf).some((node) => typeof node.mesh === "number") &&
    JSON.stringify(gltf.meshes ?? []).includes("TEXCOORD_0");
  if (!hasUv) warnings.push("The model has no texture coordinates; textures use box projection.");
  return {
    templateId,
    label: prefilledMetadata.label,
    sourceFormat,
    sourceFile: `source.${sourceFormat}`,
    nodes,
    rootNodes: indexArray(scene?.nodes),
    materials,
    prefilledMetadata,
    metadataSource,
    nodeRules,
    rootTransform,
    rootMatrix: rootMatrix(rootTransform),
    boundsMm: transformedBoundsMm(rootTransform, normalized.sourceBounds),
    warnings,
    versions: [],
    createdAt: new Date().toISOString(),
  };
};

// ---------------------------------------------------------------------------------------------
// Storage

const templateDir = (context: ServiceContext, houseId: string, templateId: string): Promise<string> =>
  context.paths.contained(context.paths.templateDir(houseId, templateId));

const fileIn = async (context: ServiceContext, directory: string, relative: string): Promise<string> =>
  context.paths.contained(context.paths.inside(directory, relative));

const readStoredDraft = async (
  context: ServiceContext,
  houseId: string,
  templateId: string,
): Promise<StoredDraft> => {
  const directory = await templateDir(context, houseId, templateId);
  const text = await readTextIfExists(await fileIn(context, directory, "draft.json"));
  if (text === undefined) throw new ApiError("notFound", `Template ${templateId} does not exist.`);
  const parsed = parseJson(text);
  const value = parsed.ok ? parsed.value : undefined;
  if (!isRecord(value) || !validateDraft(value.draft) || !isRecord(value.sourceBounds)) {
    throw new ApiError("invalidDocument", `Template ${templateId} has a corrupt draft.json.`);
  }
  const { min, max } = value.sourceBounds;
  if (!isVec3(min) || !isVec3(max))
    throw new ApiError("invalidDocument", `Template ${templateId} has a corrupt draft.json.`);
  return { draft: value.draft, sourceBounds: { min, max } };
};

/** Writes a file of a template folder; the house folder must still exist (it is never recreated). */
const writeIn = async (
  context: ServiceContext,
  houseId: string,
  directory: string,
  relative: string,
  data: string | Uint8Array,
): Promise<void> => {
  await atomicWriteFile(await fileIn(context, directory, relative), data, {
    parentsBelow: context.paths.houseDir(houseId),
  });
};

const writeStoredDraft = async (
  context: ServiceContext,
  houseId: string,
  directory: string,
  stored: StoredDraft,
): Promise<void> => {
  await writeIn(context, houseId, directory, "draft.json", toJsonText({ schemaVersion: 1, ...stored }));
};

const readBaseGltf = async (
  context: ServiceContext,
  directory: string,
  templateId: string,
): Promise<JsonRecord> => {
  const text = await readTextIfExists(await fileIn(context, directory, "base.gltf"));
  const parsed = text === undefined ? undefined : parseJson(text);
  if (parsed?.ok !== true || !isRecord(parsed.value))
    throw new ApiError("invalidDocument", `Template ${templateId} has no readable base.gltf.`);
  return parsed.value;
};

const savedVersions = async (directory: string): Promise<number[]> => {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error: unknown) {
    if (isErrnoCode(error, "ENOENT")) return [];
    throw error;
  }
  return names
    .map((name) => /^v([1-9][0-9]*)\.gltf$/.exec(name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
};

// ---------------------------------------------------------------------------------------------
// Import

const resolveStlTransform = (
  options: TemplateImportOptionsValue,
  positions: Float32Array,
): RootTransformValue => {
  const upAxis = options.upAxis ?? "+z";
  const frontAxis = options.frontAxis ?? "-y";
  if (!axesArePerpendicular(upAxis, frontAxis))
    throw validationError([{ pointer: "/body/frontAxis", message: "must be perpendicular to upAxis" }]);
  if (options.unit !== undefined) return { scale: unitScale[options.unit], upAxis, frontAxis };
  if (options.knownDimensionMm === undefined || options.knownAxis === undefined) {
    throw validationError([
      { pointer: "/body/unit", message: "an STL needs unit, or knownDimensionMm with knownAxis" },
    ]);
  }
  const bounds = stlBounds(positions);
  const rows = rotationRows({ scale: 1, upAxis, frontAxis });
  const row = rows[options.knownAxis === "x" ? 0 : options.knownAxis === "y" ? 1 : 2];
  const extent = Math.abs(
    row[0] * (bounds.max[0] - bounds.min[0]) +
      row[1] * (bounds.max[1] - bounds.min[1]) +
      row[2] * (bounds.max[2] - bounds.min[2]),
  );
  if (extent <= 0)
    throw validationError([
      { pointer: "/body/knownAxis", message: "the model has no extent along this axis" },
    ]);
  return { scale: options.knownDimensionMm / 1000 / extent, upAxis, frontAxis };
};

export const importTemplate = async (
  context: ServiceContext,
  houseId: string,
  upload: Readonly<{ bytes: Buffer; filename: string; options: TemplateImportOptionsValue }>,
): Promise<{ templateId: string; draft: TemplateDraftValue }> => {
  await requireHouse(context, houseId);
  const { options } = upload;
  const templateId = createId("t");
  const label = labelFromFilename(upload.filename);
  let normalized: NormalizedAsset;
  let draft: TemplateDraftValue;
  if (options.format === "stl") {
    const positions = parseStl(upload.bytes);
    const transform = resolveStlTransform(options, positions);
    normalized = await writeNormalized(stlDocument(positions, transform));
    draft = buildDraft(templateId, label, "stl", normalized, transform, [
      'Converted from STL: one mesh node "Body" with flat normals and box-projected UVs.',
    ]);
    draft = { ...draft, prefilledMetadata: { ...draft.prefilledMetadata, materialSlots: { body: "Body" } } };
  } else {
    const source = await readGltfSource(upload.bytes);
    const warnings = await cleanDocument(source.document);
    normalized = await writeNormalized(source.document);
    draft = buildDraft(templateId, label, source.sourceFormat, normalized, identityRootTransform, warnings);
  }
  const extension = draft.sourceFormat;
  return context.queue.run(houseLock(houseId), async () => {
    // Checked again under the lock: the house may have been trashed while the model was normalized.
    await requireHouse(context, houseId);
    const directory = await templateDir(context, houseId, templateId);
    try {
      await writeIn(context, houseId, directory, `source.${extension}`, upload.bytes);
      for (const [uri, bytes] of normalized.resources) await writeIn(context, houseId, directory, uri, bytes);
      await writeIn(context, houseId, directory, "base.gltf", toJsonText(normalized.gltf));
      await writeStoredDraft(context, houseId, directory, { draft, sourceBounds: normalized.sourceBounds });
    } catch (error: unknown) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
    return { templateId, draft };
  });
};

export const getDraft = async (
  context: ServiceContext,
  houseId: string,
  templateId: string,
): Promise<{ templateId: string; draft: TemplateDraftValue }> => {
  await requireHouse(context, houseId);
  const { draft } = await readStoredDraft(context, houseId, templateId);
  return { templateId, draft };
};

const sourceTypes: Readonly<Record<TemplateDraftValue["sourceFormat"], string>> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  stl: "model/stl",
};

export const readSource = async (
  context: ServiceContext,
  houseId: string,
  templateId: string,
): Promise<{ bytes: Buffer; mediaType: string; fileName: string }> => {
  await requireHouse(context, houseId);
  const { draft } = await readStoredDraft(context, houseId, templateId);
  const directory = await templateDir(context, houseId, templateId);
  return {
    bytes: await readFile(await fileIn(context, directory, draft.sourceFile)),
    mediaType: sourceTypes[draft.sourceFormat],
    fileName: draft.sourceFile,
  };
};

// ---------------------------------------------------------------------------------------------
// Versions

/** A 256 × 256 front-elevation silhouette (x × y bounds) for the picker. */
const thumbnailSvg = (draft: TemplateDraftValue): string => {
  const { size } = draft.boundsMm;
  const scale = 200 / Math.max(size.x, size.y, 1);
  const width = Math.max(4, size.x * scale);
  const height = Math.max(4, size.y * scale);
  const x = (256 - width) / 2;
  const y = 236 - height;
  const fmt = (value: number): string => value.toFixed(1);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">`,
    `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width)}" height="${fmt(height)}" rx="6" fill="#9aa4b2" stroke="#4b5563" stroke-width="3"/>`,
    `<line x1="16" y1="237.5" x2="240" y2="237.5" stroke="#4b5563" stroke-width="3"/>`,
    `</svg>`,
    "",
  ].join("\n");
};

/** Builds vN.gltf from base.gltf: scene metadata, node rules, and the HomeplanRoot wrapper node. */
const versionJson = (
  base: JsonRecord,
  metadata: TemplateMetadata,
  nodeRules: Readonly<Record<string, NodeRule>>,
  matrix: readonly number[],
): JsonRecord => {
  const gltf: JsonRecord = structuredClone(base);
  const nodes = gltfNodes(gltf);
  for (const node of nodes) setHomeplan(node, nodeRules[nameOf(node)]);
  const scene = defaultScene(gltf);
  if (scene === undefined) throw new ApiError("invalidDocument", "The template has no scene.");
  setHomeplan(scene, metadata);
  const root: JsonRecord = { name: rootNodeName, children: indexArray(scene.nodes) };
  if (!isIdentityMatrix(matrix)) root.matrix = [...matrix];
  gltf.nodes = [...nodes, root];
  scene.nodes = [nodes.length];
  const asset = isRecord(gltf.asset) ? gltf.asset : { version: "2.0" };
  gltf.asset = { ...asset, generator: "Homeplan Object Editor" };
  return gltf;
};

const validatorIssues = async (
  context: ServiceContext,
  directory: string,
  fileName: string,
  bytes: Uint8Array,
) => {
  const report = await validateBytes(bytes, {
    uri: fileName,
    format: "gltf",
    maxIssues: 200,
    externalResourceFunction: async (uri) =>
      readFile(await fileIn(context, directory, decodeURIComponent(uri))),
  });
  return report.issues.messages
    .filter((message) => message.severity === 0)
    .map((message) => ({
      pointer: `/gltf${message.pointer ?? ""}`,
      message: `${message.code}: ${message.message}`,
    }));
};

export const saveTemplateVersion = async (
  context: ServiceContext,
  houseId: string,
  templateId: string,
  body: SaveTemplateVersionBodyValue,
): Promise<{ version: number }> => {
  await requireHouse(context, houseId);
  if (!axesArePerpendicular(body.rootTransform.upAxis, body.rootTransform.frontAxis)) {
    throw validationError([
      { pointer: "/body/rootTransform/frontAxis", message: "must be perpendicular to upAxis" },
    ]);
  }
  return context.queue.run(houseLock(houseId), async () => {
    await requireHouse(context, houseId);
    const stored = await readStoredDraft(context, houseId, templateId);
    const directory = await templateDir(context, houseId, templateId);
    const base = await readBaseGltf(context, directory, templateId);
    const metadata: TemplateMetadata =
      body.label === undefined ? body.metadata : { ...body.metadata, label: body.label };
    const nodeRules = body.nodeRules ?? stored.draft.nodeRules;
    const result = validateTemplateMetadata(metadata, assetSummary(base, nodeRules));
    if (result.metadata === null) {
      throw validationError(
        result.issues.map((issue) => ({
          pointer: issue.pointer.startsWith("/nodes/")
            ? `/body/nodeRules/${issue.pointer.slice("/nodes/".length)}`
            : `/body/metadata${issue.pointer}`,
          message: issue.message,
        })),
        "The template metadata is invalid.",
      );
    }
    const matrix = rootMatrix(body.rootTransform);
    const version = Math.max(0, ...(await savedVersions(directory))) + 1;
    const fileName = `v${version}.gltf`;
    const text = toJsonText(versionJson(base, result.metadata, nodeRules, matrix));
    const bytes = new TextEncoder().encode(text);
    const issues = await validatorIssues(context, directory, fileName, bytes);
    if (issues.length > 0) throw validationError(issues, "The template version fails the glTF Validator.");
    await writeIn(context, houseId, directory, fileName, bytes);
    const draft: TemplateDraftValue = {
      ...stored.draft,
      label: result.metadata.label,
      prefilledMetadata: result.metadata,
      metadataSource: "version",
      nodeRules: { ...nodeRules },
      rootTransform: body.rootTransform,
      rootMatrix: matrix,
      boundsMm: transformedBoundsMm(body.rootTransform, stored.sourceBounds),
      versions: [...stored.draft.versions.filter((existing) => existing !== version), version].sort(
        (a, b) => a - b,
      ),
    };
    await writeIn(context, houseId, directory, "thumbnail.svg", thumbnailSvg(draft));
    await writeStoredDraft(context, houseId, directory, { draft, sourceBounds: stored.sourceBounds });
    return { version };
  });
};

/**
 * vN.gltf as served over HTTP: buffer and image URIs are rewritten to `../files/<uri>` so they resolve
 * against …/templates/:templateId/files/ from the …/v/:version URL. On disk the URIs stay folder-relative.
 */
/** Reads a stored glTF JSON file and rewrites its buffer/image URIs with `prefix` for HTTP serving. */
const servedGltf = async (
  context: ServiceContext,
  houseId: string,
  templateId: string,
  fileName: string,
  prefix: string,
): Promise<string> => {
  await requireHouse(context, houseId);
  const directory = await templateDir(context, houseId, templateId);
  const text = await readTextIfExists(await fileIn(context, directory, fileName));
  if (text === undefined) throw new ApiError("notFound", `Template ${templateId} has no ${fileName}.`);
  const parsed = parseJson(text);
  if (!parsed.ok || !isRecord(parsed.value))
    throw new ApiError("invalidDocument", `Template ${templateId} ${fileName} is corrupt.`);
  const gltf = parsed.value;
  for (const item of [...recordArray(gltf.buffers), ...recordArray(gltf.images)]) {
    if (typeof item.uri === "string" && !item.uri.startsWith("data:")) item.uri = `${prefix}${item.uri}`;
  }
  return JSON.stringify(gltf);
};

/** …/templates/:templateId/v/:version → URIs become `../files/<uri>` (the URL's directory is …/v/). */
export const readVersion = (
  context: ServiceContext,
  houseId: string,
  templateId: string,
  version: number,
): Promise<string> => servedGltf(context, houseId, templateId, `v${version}.gltf`, "../files/");

/**
 * …/templates/:templateId/base → the normalized base.gltf (no Homeplan metadata, no root transform), for
 * previewing a draft before any version exists. URIs become `files/<uri>` (the URL's directory is …/:templateId/).
 */
export const readBase = (context: ServiceContext, houseId: string, templateId: string): Promise<string> =>
  servedGltf(context, houseId, templateId, "base.gltf", "files/");

const fileTypes: Readonly<Record<string, string>> = {
  bin: "application/octet-stream",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

export const readTemplateFile = async (
  context: ServiceContext,
  houseId: string,
  templateId: string,
  path: string,
): Promise<{ bytes: Buffer; mediaType: string }> => {
  await requireHouse(context, houseId);
  const directory = await templateDir(context, houseId, templateId);
  const mediaType = fileTypes[path.slice(path.lastIndexOf(".") + 1)];
  if (mediaType === undefined) throw new ApiError("notFound", `No template file ${path}.`);
  try {
    return { bytes: await readFile(await fileIn(context, directory, path)), mediaType };
  } catch (error: unknown) {
    if (isErrnoCode(error, "ENOENT") || isErrnoCode(error, "EISDIR"))
      throw new ApiError("notFound", `No template file ${path}.`);
    throw error;
  }
};

export const readHouseThumbnail = async (
  context: ServiceContext,
  houseId: string,
  templateId: string,
): Promise<Buffer> => {
  await requireHouse(context, houseId);
  const directory = await templateDir(context, houseId, templateId);
  try {
    return await readFile(await fileIn(context, directory, "thumbnail.svg"));
  } catch (error: unknown) {
    if (isErrnoCode(error, "ENOENT"))
      throw new ApiError("notFound", `Template ${templateId} has no thumbnail.`);
    throw error;
  }
};

// ---------------------------------------------------------------------------------------------
// List and delete

/** Relative to the page's <base href> (base path or ingress prefix), so it works under any prefix. */
export const houseThumbnailUrl = (houseId: string, templateId: string): string =>
  `api/houses/${houseId}/templates/${templateId}/thumbnail`;

/** House templates with at least one saved version (drafts are opened by ID from the Object Editor). */
export const listHouseTemplates = async (
  context: ServiceContext,
  houseId: string,
): Promise<TemplateListItemValue[]> => {
  const items: TemplateListItemValue[] = [];
  for (const templateId of (await listChildDirectories(context.paths.templatesDir(houseId))).filter(isId)) {
    let stored: StoredDraft;
    try {
      stored = await readStoredDraft(context, houseId, templateId);
    } catch (error: unknown) {
      if (!(error instanceof ApiError)) throw error;
      context.log.warn({ houseId, templateId }, "Skipping a house template without a readable draft");
      continue;
    }
    const versions = await savedVersions(context.paths.templateDir(houseId, templateId));
    if (versions.length === 0) continue;
    const metadata = stored.draft.prefilledMetadata;
    items.push({
      id: templateId,
      label: metadata.label,
      kind: metadata.kind,
      contract: metadata.contract,
      versions,
      source: "house",
      thumbnailUrl: houseThumbnailUrl(houseId, templateId),
      ...templatePickerFields(metadata),
    });
  }
  return items.sort((a, b) => a.label.localeCompare(b.label));
};

/** JSON Pointers of every `templateId` property equal to `templateId` in the document. */
export const findTemplateReferences = (document: unknown, templateId: string): readonly string[] => {
  const references: string[] = [];
  const visit = (value: unknown, pointer: string): void => {
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${pointer}/${index}`));
    else if (isRecord(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (key === "templateId" && child === templateId) references.push(`${pointer}/${pointerToken(key)}`);
        else visit(child, `${pointer}/${pointerToken(key)}`);
      }
    }
  };
  visit(document, "");
  return references;
};

export const deleteTemplate = async (
  context: ServiceContext,
  houseId: string,
  templateId: string,
): Promise<void> => {
  await requireHouse(context, houseId);
  return context.queue.run(houseLock(houseId), async () => {
    const directory = await templateDir(context, houseId, templateId);
    if ((await readTextIfExists(await fileIn(context, directory, "draft.json"))) === undefined) {
      throw new ApiError("notFound", `Template ${templateId} does not exist.`);
    }
    const { document } = await loadDocument(context, houseId);
    const references = findTemplateReferences(document, templateId);
    if (references.length > 0)
      throw new ApiError("referenced", "The template is used by the house.", { references });
    await rm(directory, { recursive: true, force: true });
  });
};
