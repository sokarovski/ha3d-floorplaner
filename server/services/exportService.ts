// Saved PNG exports (spec/delivery/rendering-and-exports.md). Exports are ignored by Git.
import sharp from "sharp";
import type { Metadata } from "sharp";
import { ExportMetadataInput } from "../../shared/contracts/exports";
import type { ExportEntryValue, ExportFileName, ExportImageFileValue } from "../../shared/contracts/exports";
import { createId } from "../../shared/domain/ids";
import { compileValidator, toIssues } from "../../shared/domain/validation/ajv";
import { ApiError, validationError } from "../http/errors";
import { parseJson } from "../lib/json";
import type { ServiceContext } from "./context";
import { houseLock } from "./context";
import { requireHouse } from "./houseService";

/** Implementation convention: one export PNG may be up to 100 MB (a 4× render of a large viewport). */
export const exportMaxBytes = 100 * 1024 * 1024;

const validateMetadata = compileValidator(ExportMetadataInput);

export type ExportUpload = Readonly<{
  preview: Buffer | undefined;
  final: Buffer | undefined;
  metadataText: string | undefined;
}>;

const measurePng = async (
  name: "preview.png" | "final.png",
  bytes: Buffer,
  field: string,
): Promise<ExportImageFileValue> => {
  let metadata: Metadata;
  try {
    metadata = await sharp(bytes).metadata();
  } catch {
    throw new ApiError("unsupportedMedia", `The ${field} part is not a PNG image.`);
  }
  if (metadata.format !== "png")
    throw new ApiError("unsupportedMedia", `The ${field} part is not a PNG image.`);
  return { name, widthPx: metadata.width, heightPx: metadata.height, byteSize: bytes.byteLength };
};

export const saveExport = async (
  context: ServiceContext,
  houseId: string,
  upload: ExportUpload,
): Promise<ExportEntryValue> => {
  await requireHouse(context, houseId);
  if (upload.metadataText === undefined)
    throw validationError([{ pointer: "/body/metadata", message: "is required" }]);
  if (upload.preview === undefined && upload.final === undefined) {
    throw validationError([{ pointer: "/body/final", message: "a preview or final PNG is required" }]);
  }
  const parsed = parseJson(upload.metadataText);
  if (!parsed.ok) throw validationError([{ pointer: "/body/metadata", message: "must be JSON" }]);
  const metadata: unknown = parsed.value;
  if (!validateMetadata(metadata)) {
    throw validationError(
      toIssues(validateMetadata.errors).map((issue) => ({
        pointer: `/body/metadata${issue.pointer}`,
        message: issue.message,
      })),
    );
  }
  const images = new Map<string, Uint8Array>();
  const files: ExportImageFileValue[] = [];
  if (upload.preview !== undefined) {
    files.push(await measurePng("preview.png", upload.preview, "preview"));
    images.set("preview.png", upload.preview);
  }
  if (upload.final !== undefined) {
    files.push(await measurePng("final.png", upload.final, "final"));
    images.set("final.png", upload.final);
  }
  const entry: ExportEntryValue = {
    schemaVersion: 1,
    id: createId("x"),
    houseId,
    createdAt: new Date().toISOString(),
    files,
    metadata,
  };
  await context.queue.run(houseLock(houseId), async () => {
    // Checked again under the lock: the house may have been trashed while the PNGs were measured.
    await requireHouse(context, houseId);
    await context.exports.write(houseId, entry, images);
  });
  return entry;
};

export const listExports = async (context: ServiceContext, houseId: string): Promise<ExportEntryValue[]> => {
  await requireHouse(context, houseId);
  return [...(await context.exports.list(houseId))];
};

export const readExportFile = async (
  context: ServiceContext,
  houseId: string,
  exportId: string,
  file: ExportFileName,
): Promise<{ bytes: Buffer; mediaType: string }> => {
  await requireHouse(context, houseId);
  if ((await context.exports.readEntry(houseId, exportId)) === undefined)
    throw new ApiError("notFound", `Export ${exportId} does not exist.`);
  const bytes = await context.exports.readFile(houseId, exportId, file);
  if (bytes === undefined) throw new ApiError("notFound", `Export ${exportId} has no ${file}.`);
  return { bytes, mediaType: file === "metadata.json" ? "application/json; charset=utf-8" : "image/png" };
};

export const deleteExport = async (
  context: ServiceContext,
  houseId: string,
  exportId: string,
): Promise<void> => {
  await requireHouse(context, houseId);
  const removed = await context.queue.run(houseLock(houseId), async () => {
    await requireHouse(context, houseId);
    return context.exports.remove(houseId, exportId);
  });
  if (!removed) throw new ApiError("notFound", `Export ${exportId} does not exist.`);
};
