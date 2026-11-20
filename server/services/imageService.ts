// House image library: upload, list, rename, delete, serve (spec/builder/features/house-images.md).
// No route here reads or writes the house.json revision (D09, D14). Built-in textures (`builtinimg_…`, Phase 17.1)
// are served for every house but are not house uploads: they are not listed, renamed or deleted here.
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import type { Metadata, OutputInfo } from "sharp";
import type { ImageEntryValue, ImageMediaType, TextureHintsValue } from "../../shared/contracts/images";
import { isBuiltInImageId } from "../../shared/domain/house/builtinMaterials";
import { createId } from "../../shared/domain/ids";
import { ApiError, validationError } from "../http/errors";
import { isErrnoCode, isRecord, pointerToken } from "../lib/json";
import type { ServiceContext } from "./context";
import { houseLock } from "./context";
import { checkedName, loadDocument, requireHouse } from "./houseService";

/** D16 limits. 1 MB = 1024 × 1024 bytes. */
export const imageMaxBytes = 25 * 1024 * 1024;
export const imageMaxLongestSidePx = 8192;
export const thumbnailSizePx = 256;

const formats: Readonly<Record<string, { mediaType: ImageMediaType; extension: string }>> = {
  jpeg: { mediaType: "image/jpeg", extension: "jpg" },
  png: { mediaType: "image/png", extension: "png" },
  webp: { mediaType: "image/webp", extension: "webp" },
};

export const listImages = async (context: ServiceContext, houseId: string): Promise<ImageEntryValue[]> => {
  await requireHouse(context, houseId);
  return [...(await context.images.readIndex(houseId)).images];
};

const stripMetadata = (bytes: Buffer, format: string): Promise<{ data: Buffer; info: OutputInfo }> => {
  const upright = sharp(bytes).rotate();
  const encoded =
    format === "png"
      ? upright.png({ compressionLevel: 9 })
      : format === "webp"
        ? upright.webp({ quality: 95 })
        : upright.jpeg({ quality: 95, chromaSubsampling: "4:4:4" });
  return encoded.toBuffer({ resolveWithObject: true });
};

const defaultName = (filename: string): string => {
  const base = filename
    .replace(/\.[^.]*$/, "")
    .normalize("NFC")
    .trim();
  return (base === "" ? "Image" : base).slice(0, 120);
};

/** An image re-encoded for storage (no metadata) with its thumbnail and index entry; nothing is written. */
type PreparedImage = Readonly<{ entry: ImageEntryValue; original: Buffer; thumbnail: Buffer }>;

const prepareImage = async (
  id: string,
  upload: Readonly<{ bytes: Buffer; filename: string; name: string }>,
): Promise<PreparedImage> => {
  const name = upload.name;
  let metadata: Metadata;
  try {
    metadata = await sharp(upload.bytes).metadata();
  } catch {
    throw new ApiError("unsupportedMedia", "The file is not a JPEG, PNG, or WebP image.");
  }
  const format = formats[metadata.format];
  if (format === undefined)
    throw new ApiError("unsupportedMedia", "The file is not a JPEG, PNG, or WebP image.");
  const { width, height } = metadata;
  if (Math.max(width, height) > imageMaxLongestSidePx) {
    throw validationError([
      {
        pointer: "/body/file",
        message: `must be at most ${imageMaxLongestSidePx} px on the longest side (got ${width} × ${height})`,
      },
    ]);
  }
  // The stored original is re-encoded without metadata (EXIF incl. GPS, XMP, IPTC, ICC), upright per its EXIF
  // orientation: same format, high quality for JPEG/WebP, lossless for PNG (house-images.md#house-owned-image-library).
  const original = await stripMetadata(upload.bytes, metadata.format);
  const thumbnail = await sharp(original.data)
    .resize(thumbnailSizePx, thumbnailSizePx, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const entry: ImageEntryValue = {
    id,
    name,
    originalFilename: upload.filename.normalize("NFC").slice(0, 255),
    mediaType: format.mediaType,
    widthPx: original.info.width,
    heightPx: original.info.height,
    byteSize: original.data.byteLength,
    file: `textures/${id}.${format.extension}`,
    thumbnail: `textures/${id}.thumb.webp`,
    createdAt: new Date().toISOString(),
  };
  return { entry, original: original.data, thumbnail };
};

/** Files first, index entry last: a crash leaves only an orphan file, removed on startup. */
const storeImage = async (
  context: ServiceContext,
  houseId: string,
  prepared: PreparedImage,
): Promise<void> => {
  const index = await context.images.readIndex(houseId);
  await context.images.writeAsset(houseId, prepared.entry.file, prepared.original);
  await context.images.writeAsset(houseId, prepared.entry.thumbnail, prepared.thumbnail);
  await context.images.writeIndex(houseId, { schemaVersion: 1, images: [...index.images, prepared.entry] });
};

export const uploadImage = async (
  context: ServiceContext,
  houseId: string,
  upload: Readonly<{ bytes: Buffer; filename: string; name: string | undefined }>,
): Promise<ImageEntryValue> => {
  await requireHouse(context, houseId);
  const name =
    upload.name === undefined ? defaultName(upload.filename) : checkedName(upload.name, "/body/name");
  const prepared = await prepareImage(createId("img"), { ...upload, name });
  return context.queue.run(houseLock(houseId), async () => {
    // Checked again under the lock: the house may have been trashed while the image was processed.
    await requireHouse(context, houseId);
    await storeImage(context, houseId, prepared);
    return prepared.entry;
  });
};

/**
 * An image from a house archive (Phase 21), keeping its ID (the house document refers to it), into a house being
 * created: the caller holds that house's lock, so this takes none.
 */
export const importArchiveImage = async (
  context: ServiceContext,
  houseId: string,
  id: string,
  bytes: Buffer,
  filename: string,
): Promise<void> => {
  await storeImage(
    context,
    houseId,
    await prepareImage(id, { bytes, filename, name: defaultName(filename) }),
  );
};

/** Rename and delete refuse built-in textures: they ship with the app and belong to no house. */
const refuseBuiltIn = (imageId: string, action: string): void => {
  if (isBuiltInImageId(imageId))
    throw new ApiError("badRequest", `Built-in texture ${imageId} is read-only and cannot be ${action}.`);
};

const findEntry = (images: readonly ImageEntryValue[], imageId: string): ImageEntryValue => {
  const entry = images.find((candidate) => candidate.id === imageId);
  if (entry === undefined) throw new ApiError("notFound", `Image ${imageId} does not exist.`);
  return entry;
};

/** Renames an image and/or sets its proposed material values (texture hints). */
export const updateImage = async (
  context: ServiceContext,
  houseId: string,
  imageId: string,
  update: Readonly<{ name?: string; texture?: TextureHintsValue }>,
): Promise<ImageEntryValue> => {
  await requireHouse(context, houseId);
  refuseBuiltIn(imageId, "changed");
  const name = update.name === undefined ? undefined : checkedName(update.name, "/body/name");
  return context.queue.run(houseLock(houseId), async () => {
    await requireHouse(context, houseId);
    const index = await context.images.readIndex(houseId);
    const renamed = {
      ...findEntry(index.images, imageId),
      ...(name === undefined ? {} : { name }),
      ...(update.texture === undefined ? {} : { texture: update.texture }),
    };
    await context.images.writeIndex(houseId, {
      schemaVersion: 1,
      images: index.images.map((entry) => (entry.id === imageId ? renamed : entry)),
    });
    return renamed;
  });
};

/** JSON Pointers of every `imageId` property equal to `imageId` anywhere in the document. */
export const findImageReferences = (document: unknown, imageId: string): readonly string[] => {
  const references: string[] = [];
  const visit = (value: unknown, pointer: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${pointer}/${index}`));
    } else if (isRecord(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (key === "imageId" && child === imageId) references.push(`${pointer}/${pointerToken(key)}`);
        else visit(child, `${pointer}/${pointerToken(key)}`);
      }
    }
  };
  visit(document, "");
  return references;
};

export const deleteImage = async (
  context: ServiceContext,
  houseId: string,
  imageId: string,
): Promise<void> => {
  await requireHouse(context, houseId);
  refuseBuiltIn(imageId, "deleted");
  return context.queue.run(houseLock(houseId), async () => {
    await requireHouse(context, houseId);
    const index = await context.images.readIndex(houseId);
    const entry = findEntry(index.images, imageId);
    const { document } = await loadDocument(context, houseId);
    const references = findImageReferences(document, imageId);
    if (references.length > 0) {
      throw new ApiError("referenced", "The image is used by the house.", { references });
    }
    // Index entry first, files last: a crash leaves an orphan file, removed on startup.
    await context.images.writeIndex(houseId, {
      schemaVersion: 1,
      images: index.images.filter((candidate) => candidate.id !== imageId),
    });
    await context.images.removeAsset(houseId, entry.file);
    await context.images.removeAsset(houseId, entry.thumbnail);
  });
};

export const readImageFile = async (
  context: ServiceContext,
  houseId: string,
  imageId: string,
  which: "file" | "thumbnail",
): Promise<{ bytes: Buffer; mediaType: string; etag?: string }> => {
  await requireHouse(context, houseId);
  if (isBuiltInImageId(imageId)) {
    const builtIn = await context.builtinImages.read(imageId, which);
    if (builtIn === undefined) throw new ApiError("notFound", `Built-in texture ${imageId} does not exist.`);
    return builtIn;
  }
  const entry = findEntry((await context.images.readIndex(houseId)).images, imageId);
  const path = which === "file" ? entry.file : entry.thumbnail;
  try {
    return {
      bytes: await readFile(await context.images.assetPath(houseId, path)),
      mediaType: which === "file" ? entry.mediaType : "image/webp",
    };
  } catch (error: unknown) {
    if (isErrnoCode(error, "ENOENT"))
      throw new ApiError("notFound", `The file of image ${imageId} is missing.`);
    throw error;
  }
};
