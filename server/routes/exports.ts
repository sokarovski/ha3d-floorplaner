// Saved export routes (spec/architecture/api.md#exports-and-renders).
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { HouseParams } from "../../shared/contracts/common";
import {
  ExportEntry,
  ExportFileParams,
  ExportListResponse,
  ExportParams,
  exportUploadFields,
} from "../../shared/contracts/exports";
import { readMultipart } from "../http/multipart";
import { revalidateCache, sendBytes } from "../http/send";
import type { ServiceContext } from "../services/context";
import {
  deleteExport,
  exportMaxBytes,
  listExports,
  readExportFile,
  saveExport,
} from "../services/exportService";

export const exportRoutes: FastifyPluginAsyncTypebox<{ context: ServiceContext }> = async (
  app,
  { context },
) => {
  app.post(
    "/houses/:houseId/exports",
    { schema: { params: HouseParams, response: { 201: ExportEntry } } },
    async (request, reply) => {
      const content = await readMultipart(request, {
        fileFields: [exportUploadFields.preview, exportUploadFields.final],
        textFields: [exportUploadFields.metadata],
        maxFileBytes: exportMaxBytes,
        maxFieldBytes: 1024 * 1024,
      });
      const entry = await saveExport(context, request.params.houseId, {
        preview: content.files.get(exportUploadFields.preview)?.bytes,
        final: content.files.get(exportUploadFields.final)?.bytes,
        metadataText: content.fields.get(exportUploadFields.metadata),
      });
      return reply.code(201).send(entry);
    },
  );

  app.get(
    "/houses/:houseId/exports",
    { schema: { params: HouseParams, response: { 200: ExportListResponse } } },
    async (request) => ({
      exports: await listExports(context, request.params.houseId),
    }),
  );

  app.get(
    "/houses/:houseId/exports/:exportId/:file",
    { schema: { params: ExportFileParams } },
    async (request, reply) => {
      const { bytes, mediaType } = await readExportFile(
        context,
        request.params.houseId,
        request.params.exportId,
        request.params.file,
      );
      return sendBytes(reply, bytes, mediaType, revalidateCache);
    },
  );

  app.delete(
    "/houses/:houseId/exports/:exportId",
    { schema: { params: ExportParams } },
    async (request, reply) => {
      await deleteExport(context, request.params.houseId, request.params.exportId);
      return reply.code(204).send();
    },
  );
};
