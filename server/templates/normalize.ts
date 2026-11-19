// Import normalization (spec/builder/features/object-templates.md#importing-phase-2): reads a GLB, a
// self-contained glTF, or an STL into glTF Transform, drops unsupported features with warnings, and
// writes one shared `geometry.bin` plus `textures/<n>.<ext>` and the normalized `base.gltf` JSON.
import { Format, NodeIO, getBounds } from "@gltf-transform/core";
import type { Document, GLTF } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";
import { readGlbJson } from "../../shared/domain/templates/glbJson";
import { validationError } from "../http/errors";
import { isRecord, parseJson } from "../lib/json";
import type { JsonRecord } from "../lib/json";
import { imageMaxBytes, imageMaxLongestSidePx } from "../services/imageService";
import { recordArray, resourceUris, stringArray } from "./gltfJson";
import type { SourceBounds } from "./rootTransform";

/** Extensions an imported asset may list in `extensionsRequired`. Draco/meshopt need decoders not shipped yet. */
export const supportedRequiredExtensions: ReadonlySet<string> = new Set([
  "KHR_texture_transform",
  "KHR_lights_punctual",
  "KHR_mesh_quantization",
  "KHR_materials_emissive_strength",
  "KHR_materials_unlit",
  "KHR_materials_ior",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_volume",
  "KHR_materials_clearcoat",
  "KHR_materials_sheen",
]);

const unreadableExtensions: ReadonlySet<string> = new Set([
  "KHR_draco_mesh_compression",
  "EXT_meshopt_compression",
  "KHR_texture_basisu",
]);

export const createIO = (): NodeIO =>
  new NodeIO().registerExtensions(
    ALL_EXTENSIONS.filter((extension) => !unreadableExtensions.has(extension.EXTENSION_NAME)),
  );

/** glTF requires only `asset.version`; every other top-level property is optional. */
const isGltfJson = (value: unknown): value is GLTF.IGLTF =>
  isRecord(value) && isRecord(value.asset) && typeof value.asset.version === "string";

const fileIssue = (message: string) => validationError([{ pointer: "/body/file", message }]);

const isGlb = (bytes: Uint8Array): boolean =>
  bytes.byteLength >= 12 && new TextDecoder().decode(bytes.subarray(0, 4)) === "glTF";

/** Checks the JSON before glTF Transform reads it: required extensions and external URIs. */
const checkSourceJson = (json: JsonRecord): void => {
  const unsupported = stringArray(json.extensionsRequired).filter(
    (name) => !supportedRequiredExtensions.has(name),
  );
  if (unsupported.length > 0)
    throw fileIssue(`requires unsupported glTF extensions: ${unsupported.join(", ")}`);
  const external = resourceUris(json).filter((uri) => !uri.startsWith("data:"));
  if (external.length > 0)
    throw fileIssue(
      `references external files (${external.slice(0, 3).join(", ")}); upload a GLB or a self-contained glTF`,
    );
  const asset = json.asset;
  if (!isRecord(asset) || typeof asset.version !== "string" || !asset.version.startsWith("2."))
    throw fileIssue("is not a glTF 2.0 asset");
};

export type ReadSource = Readonly<{
  document: Document;
  sourceFormat: "glb" | "gltf";
  sourceJson: JsonRecord;
}>;

export const readGltfSource = async (bytes: Uint8Array): Promise<ReadSource> => {
  const io = createIO();
  if (isGlb(bytes)) {
    let json: unknown;
    try {
      json = readGlbJson(bytes.slice().buffer);
    } catch {
      throw fileIssue("is not a readable GLB file");
    }
    if (!isRecord(json)) throw fileIssue("is not a readable GLB file");
    checkSourceJson(json);
    try {
      return { document: await io.readBinary(bytes), sourceFormat: "glb", sourceJson: json };
    } catch (error: unknown) {
      throw fileIssue(`could not be read: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  const parsed = parseJson(new TextDecoder().decode(bytes));
  if (!parsed.ok || !isRecord(parsed.value)) throw fileIssue("is neither a GLB nor glTF JSON");
  const json = parsed.value;
  checkSourceJson(json);
  try {
    const copy: unknown = structuredClone(json);
    if (!isGltfJson(copy)) throw fileIssue("is not a glTF 2.0 asset");
    const document = await io.readJSON({ json: copy, resources: {} });
    return { document, sourceFormat: "gltf", sourceJson: json };
  } catch (error: unknown) {
    throw fileIssue(`could not be read: ${error instanceof Error ? error.message : "unknown error"}`);
  }
};

const extensionForMime: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Removes features Homeplan does not use and fixes names; returns warnings. */
export const cleanDocument = async (document: Document): Promise<string[]> => {
  const warnings: string[] = [];
  const root = document.getRoot();
  const drop = (count: number, what: string): void => {
    if (count > 0) warnings.push(`Removed ${count} ${what} (not used in Homeplan).`);
  };
  const animations = root.listAnimations();
  animations.forEach((animation) => animation.dispose());
  drop(animations.length, "animation(s)");
  const skins = root.listSkins();
  skins.forEach((skin) => skin.dispose());
  drop(skins.length, "skin(s)");
  const cameras = root.listCameras();
  cameras.forEach((camera) => camera.dispose());
  drop(cameras.length, "camera(s)");
  let targets = 0;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const target of primitive.listTargets()) {
        target.dispose();
        targets += 1;
      }
    }
    mesh.setWeights([]);
  }
  for (const node of root.listNodes()) node.setWeights([]);
  drop(targets, "morph target(s)");
  for (const extension of root.listExtensionsUsed()) {
    if (extension.extensionName === "KHR_materials_variants") {
      extension.dispose();
      warnings.push("Removed KHR_materials_variants (not used in Homeplan).");
    }
  }
  const defaultScene = root.getDefaultScene() ?? root.listScenes()[0];
  if (defaultScene === undefined) throw fileIssue("has no scene");
  root.setDefaultScene(defaultScene);
  const extraScenes = root.listScenes().filter((scene) => scene !== defaultScene);
  extraScenes.forEach((scene) => scene.dispose());
  drop(extraScenes.length, "extra scene(s)");
  if (root.listMeshes().length === 0) throw fileIssue("contains no mesh geometry");

  root.listNodes().forEach((node, index) => {
    if (node.getName().trim() === "") node.setName(`Node ${index}`);
  });
  root.listMaterials().forEach((material, index) => {
    if (material.getName().trim() === "") material.setName(`Material ${index}`);
  });

  // One shared buffer, written as geometry.bin.
  const buffers = root.listBuffers();
  const shared = buffers[0] ?? document.createBuffer();
  for (const accessor of root.listAccessors()) accessor.setBuffer(shared);
  buffers.slice(1).forEach((buffer) => buffer.dispose());
  shared.setURI("geometry.bin");

  for (const [index, texture] of root.listTextures().entries()) {
    const mime = texture.getMimeType();
    const extension = extensionForMime[mime];
    const image = texture.getImage();
    if (extension === undefined || image === null)
      throw fileIssue(`has a texture that is not PNG, JPEG, or WebP (${mime || "unknown"})`);
    if (image.byteLength > imageMaxBytes) throw fileIssue(`has a texture larger than ${imageMaxBytes} bytes`);
    const metadata = await sharp(image).metadata();
    if (Math.max(metadata.width, metadata.height) > imageMaxLongestSidePx)
      throw fileIssue(`has a texture larger than ${imageMaxLongestSidePx} px`);
    texture.setURI(`textures/${index}.${extension}`);
  }
  return warnings;
};

export type NormalizedAsset = Readonly<{
  /** The normalized glTF JSON (base.gltf): references geometry.bin and textures/ by relative URI. */
  gltf: JsonRecord;
  /** Relative path → bytes: geometry.bin and textures. */
  resources: ReadonlyMap<string, Uint8Array>;
  /** Bounds of the default scene in source units (before the root transform). */
  sourceBounds: SourceBounds;
}>;

export const writeNormalized = async (document: Document): Promise<NormalizedAsset> => {
  const scene = document.getRoot().getDefaultScene();
  if (scene === null) throw fileIssue("has no scene");
  const bounds = getBounds(scene);
  document.getRoot().getAsset().generator = "Homeplan template import";
  const written = await createIO().writeJSON(document, { format: Format.GLTF, basename: "geometry" });
  const parsed: unknown = JSON.parse(JSON.stringify(written.json));
  if (!isRecord(parsed)) throw new Error("glTF Transform wrote no JSON object");
  const resources = new Map<string, Uint8Array>(Object.entries(written.resources));
  for (const uri of resourceUris(parsed)) {
    if (!resources.has(uri)) throw new Error(`Missing normalized resource ${uri}`);
  }
  if (recordArray(parsed.buffers).length !== 1)
    throw new Error("Normalization must produce exactly one buffer");
  return {
    gltf: parsed,
    resources,
    sourceBounds: {
      min: [bounds.min[0], bounds.min[1], bounds.min[2]],
      max: [bounds.max[0], bounds.max[1], bounds.max[2]],
    },
  };
};
