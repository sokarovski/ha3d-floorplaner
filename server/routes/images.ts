// Image library routes (spec/architecture/api.md#images).
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { FastifyReply } from "fastify";
import { HouseParams } from "../../shared/contracts/common";
import {
  ImageEntry,
  ImageListResponse,
  ImageParams,
  UpdateImageBody,
  imageUploadFields,
} from "../../shared/contracts/images";
import { validationError } from "../http/errors";
import { readMultipart } from "../http/multipart";
import { immutableCache, revalidateCache, sendBytes } from "../http/send";
import type { ServiceContext } from "../services/context";
import {
  deleteImage,
  imageMaxBytes,
  listImages,
  readImageFile,
  updateImage,
  uploadImage,
} from "../services/imageService";

/**
 * House uploads are immutable per ID. Built-in textures keep their ID across app releases, so they are cached
 * with revalidation by content hash (ETag → 304).
 */
const sendImage = (
  ifNoneMatch: string | undefined,
  reply: FastifyReply,
  bytes: Buffer,
  mediaType: string,
  etag: string | undefined,
): FastifyReply => {
  if (etag === undefined) return sendBytes(reply, bytes, mediaType, immutableCache);
  reply.header("etag", etag);
  if (ifNoneMatch === etag) return reply.header("cache-control", revalidateCache).code(304).send();
  return sendBytes(reply, bytes, mediaType, revalidateCache);
};

export const imageRoutes: FastifyPluginAsyncTypebox<{ context: ServiceContext }> = async (
  app,
  { context },
) => {
  app.get(
    "/houses/:houseId/images",
    { schema: { params: HouseParams, response: { 200: ImageListResponse } } },
    async (request) => ({
      images: await listImages(context, request.params.houseId),
    }),
  );

  app.post(
    "/houses/:houseId/images",
    { schema: { params: HouseParams, response: { 201: ImageEntry } } },
    async (request, reply) => {
      const content = await readMultipart(request, {
        fileFields: [imageUploadFields.file],
        textFields: [imageUploadFields.name],
        maxFileBytes: imageMaxBytes,
        maxFieldBytes: 4096,
      });
      const file = content.files.get(imageUploadFields.file);
      if (file === undefined) throw validationError([{ pointer: "/body/file", message: "is required" }]);
      const entry = await uploadImage(context, request.params.houseId, {
        bytes: file.bytes,
        filename: file.filename,
        name: content.fields.get(imageUploadFields.name),
      });
      return reply.code(201).send(entry);
    },
  );

  app.patch(
    "/houses/:houseId/images/:imageId",
    { schema: { params: ImageParams, body: UpdateImageBody, response: { 200: ImageEntry } } },
    async (request) => updateImage(context, request.params.houseId, request.params.imageId, request.body),
  );

  app.delete(
    "/houses/:houseId/images/:imageId",
    { schema: { params: ImageParams } },
    async (request, reply) => {
      await deleteImage(context, request.params.houseId, request.params.imageId);
      return reply.code(204).send();
    },
  );

  app.get(
    "/houses/:houseId/images/:imageId/file",
    { schema: { params: ImageParams } },
    async (request, reply) => {
      const { bytes, mediaType, etag } = await readImageFile(
        context,
        request.params.houseId,
        request.params.imageId,
        "file",
      );
      return sendImage(request.headers["if-none-match"], reply, bytes, mediaType, etag);
    },
  );

  app.get(
    "/houses/:houseId/images/:imageId/thumbnail",
    { schema: { params: ImageParams } },
    async (request, reply) => {
      const { bytes, mediaType, etag } = await readImageFile(
        context,
        request.params.houseId,
        request.params.imageId,
        "thumbnail",
      );
      return sendImage(request.headers["if-none-match"], reply, bytes, mediaType, etag);
    },
  );
};
