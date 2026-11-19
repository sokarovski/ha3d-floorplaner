// Reads a small multipart/form-data request into memory: named file parts and text fields.
import type { Multipart } from "@fastify/multipart";
import type { FastifyRequest } from "fastify";
import { validationError } from "./errors";

export type MultipartFilePart = Readonly<{ bytes: Buffer; filename: string; mimetype: string }>;

export type MultipartContent = Readonly<{
  files: ReadonlyMap<string, MultipartFilePart>;
  fields: ReadonlyMap<string, string>;
}>;

export type MultipartSpec = Readonly<{
  fileFields: readonly string[];
  textFields: readonly string[];
  maxFileBytes: number;
  maxFieldBytes: number;
}>;

/**
 * Consumes every part. Oversized files fail with 413 (the multipart plugin's error); unknown or repeated
 * parts fail with 400 validation after the stream is drained.
 */
export const readMultipart = async (
  request: FastifyRequest,
  spec: MultipartSpec,
): Promise<MultipartContent> => {
  const files = new Map<string, MultipartFilePart>();
  const fields = new Map<string, string>();
  const problems: { pointer: string; message: string }[] = [];
  const parts = request.parts({
    limits: {
      fileSize: spec.maxFileBytes,
      fieldSize: spec.maxFieldBytes,
      files: spec.fileFields.length,
      fields: spec.textFields.length,
      parts: spec.fileFields.length + spec.textFields.length,
    },
  });
  try {
    await consumeParts(parts, spec, files, fields, problems);
  } catch (error: unknown) {
    if (isPartLimitError(error))
      throw validationError([{ pointer: "/body", message: "has too many parts or fields" }]);
    throw error;
  }
  if (problems.length > 0) throw validationError(problems);
  return { files, fields };
};

const partLimitCodes: readonly unknown[] = ["FST_PARTS_LIMIT", "FST_FILES_LIMIT", "FST_FIELDS_LIMIT"];

const isPartLimitError = (error: unknown): boolean =>
  error instanceof Error && "code" in error && partLimitCodes.includes(error.code);

const consumeParts = async (
  parts: AsyncIterableIterator<Multipart>,
  spec: MultipartSpec,
  files: Map<string, MultipartFilePart>,
  fields: Map<string, string>,
  problems: { pointer: string; message: string }[],
): Promise<void> => {
  for await (const part of parts) {
    const pointer = `/body/${part.fieldname}`;
    if (part.type === "file") {
      const bytes = await part.toBuffer();
      if (!spec.fileFields.includes(part.fieldname))
        problems.push({ pointer, message: "is not an accepted file part" });
      else if (files.has(part.fieldname)) problems.push({ pointer, message: "must appear once" });
      else files.set(part.fieldname, { bytes, filename: part.filename, mimetype: part.mimetype });
    } else if (!spec.textFields.includes(part.fieldname)) {
      problems.push({ pointer, message: "is not an accepted field" });
    } else if (typeof part.value !== "string" || part.valueTruncated) {
      problems.push({ pointer, message: "must be a text field within the size limit" });
    } else {
      fields.set(part.fieldname, part.value);
    }
  }
};
