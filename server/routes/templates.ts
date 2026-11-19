// Template routes (spec/architecture/api.md#templates): built-ins (Phase 1) and house templates (Phase 2).
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Value } from "typebox/value";
import {
  BuiltinTemplateParams,
  BuiltinTemplateVersionParams,
  HouseTemplateFileParams,
  HouseTemplateListParams,
  HouseTemplateParams,
  HouseTemplateVersionParams,
  SaveTemplateVersionBody,
  SaveTemplateVersionResponse,
  TemplateDraftResponse,
  TemplateImportOptions,
  TemplateListResponse,
  templateImportFields,
} from "../../shared/contracts/templates";
import type { TemplateImportOptionsValue } from "../../shared/contracts/templates";
import { toIssues } from "../../shared/domain/validation/ajv";
import { getAjv } from "../../shared/domain/validation/ajv";
import { validationError } from "../http/errors";
import { readMultipart } from "../http/multipart";
import { immutableCache, revalidateCache, sendBytes } from "../http/send";
import type { ServiceContext } from "../services/context";
import {
  deleteTemplate,
  getDraft,
  importTemplate,
  modelMaxBytes,
  readBase,
  readHouseThumbnail,
  readSource,
  readTemplateFile,
  readVersion,
  saveTemplateVersion,
} from "../services/houseTemplateService";
import { listTemplates, readBuiltinThumbnail, readBuiltinVersion } from "../services/templateService";

const validateImportOptions = getAjv().compile(TemplateImportOptions);

/** Multipart text fields → TemplateImportOptions (numbers are decimal text). */
const importOptions = (fields: ReadonlyMap<string, string>): TemplateImportOptionsValue => {
  const candidate: Record<string, unknown> = {};
  for (const [key, value] of fields) {
    candidate[key] =
      key === templateImportFields.knownDimensionMm
        ? value.trim() === ""
          ? Number.NaN
          : Number(value)
        : value.trim();
  }
  if (!validateImportOptions(candidate)) {
    throw validationError(
      toIssues(validateImportOptions.errors).map((issue) => ({
        pointer: `/body${issue.pointer}`,
        message: issue.message,
      })),
    );
  }
  return Value.Clone(candidate);
};

/**
 * `builtinCacheControl`: how built-in `.glb` versions are cached. Immutable in production, where a version never
 * changes; revalidated in development, where `npm run templates:build` rewrites a version in place.
 */
export const templateRoutes: FastifyPluginAsyncTypebox<{
  context: ServiceContext;
  builtinCacheControl: string;
}> = async (app, { context, builtinCacheControl }) => {
  app.get(
    "/houses/:houseId/templates",
    { schema: { params: HouseTemplateListParams, response: { 200: TemplateListResponse } } },
    async (request) => ({
      templates: await listTemplates(context, request.params.houseId),
    }),
  );

  app.get(
    "/templates/builtin/:templateId/v/:version",
    { schema: { params: BuiltinTemplateVersionParams } },
    async (request, reply) => {
      const bytes = await readBuiltinVersion(
        context,
        request.params.templateId,
        Number(request.params.version),
      );
      return sendBytes(reply, bytes, "model/gltf-binary", builtinCacheControl);
    },
  );

  app.get(
    "/templates/builtin/:templateId/thumbnail",
    { schema: { params: BuiltinTemplateParams } },
    async (request, reply) => {
      const { bytes, mediaType } = await readBuiltinThumbnail(context, request.params.templateId);
      return sendBytes(reply, bytes, mediaType, revalidateCache);
    },
  );

  app.post(
    "/houses/:houseId/templates",
    { schema: { params: HouseTemplateListParams, response: { 201: TemplateDraftResponse } } },
    async (request, reply) => {
      const content = await readMultipart(request, {
        fileFields: [templateImportFields.file],
        textFields: [
          templateImportFields.format,
          templateImportFields.unit,
          templateImportFields.knownDimensionMm,
          templateImportFields.knownAxis,
          templateImportFields.upAxis,
          templateImportFields.frontAxis,
        ],
        maxFileBytes: modelMaxBytes,
        maxFieldBytes: 256,
      });
      const file = content.files.get(templateImportFields.file);
      if (file === undefined) throw validationError([{ pointer: "/body/file", message: "is required" }]);
      const options = importOptions(content.fields);
      return reply.code(201).send(
        await importTemplate(context, request.params.houseId, {
          bytes: file.bytes,
          filename: file.filename,
          options,
        }),
      );
    },
  );

  app.get(
    "/houses/:houseId/templates/:templateId/draft",
    { schema: { params: HouseTemplateParams, response: { 200: TemplateDraftResponse } } },
    async (request) => getDraft(context, request.params.houseId, request.params.templateId),
  );

  app.get(
    "/houses/:houseId/templates/:templateId/source",
    { schema: { params: HouseTemplateParams } },
    async (request, reply) => {
      const { bytes, mediaType, fileName } = await readSource(
        context,
        request.params.houseId,
        request.params.templateId,
      );
      return sendBytes(
        reply.header("content-disposition", `attachment; filename="${fileName}"`),
        bytes,
        mediaType,
        immutableCache,
      );
    },
  );

  app.post(
    "/houses/:houseId/templates/:templateId/versions",
    {
      schema: {
        params: HouseTemplateParams,
        body: SaveTemplateVersionBody,
        response: { 201: SaveTemplateVersionResponse },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await saveTemplateVersion(context, request.params.houseId, request.params.templateId, request.body),
        ),
  );

  app.get(
    "/houses/:houseId/templates/:templateId/v/:version",
    { schema: { params: HouseTemplateVersionParams } },
    async (request, reply) => {
      const text = await readVersion(
        context,
        request.params.houseId,
        request.params.templateId,
        Number(request.params.version),
      );
      return sendBytes(reply, Buffer.from(text), "model/gltf+json", immutableCache);
    },
  );

  app.get(
    "/houses/:houseId/templates/:templateId/base",
    { schema: { params: HouseTemplateParams } },
    async (request, reply) => {
      const text = await readBase(context, request.params.houseId, request.params.templateId);
      return sendBytes(reply, Buffer.from(text), "model/gltf+json", immutableCache);
    },
  );

  app.get(
    "/houses/:houseId/templates/:templateId/files/*",
    { schema: { params: HouseTemplateFileParams } },
    async (request, reply) => {
      const { bytes, mediaType } = await readTemplateFile(
        context,
        request.params.houseId,
        request.params.templateId,
        request.params["*"],
      );
      return sendBytes(reply, bytes, mediaType, immutableCache);
    },
  );

  app.get(
    "/houses/:houseId/templates/:templateId/thumbnail",
    { schema: { params: HouseTemplateParams } },
    async (request, reply) =>
      sendBytes(
        reply,
        await readHouseThumbnail(context, request.params.houseId, request.params.templateId),
        "image/svg+xml",
        revalidateCache,
      ),
  );

  app.delete(
    "/houses/:houseId/templates/:templateId",
    { schema: { params: HouseTemplateParams } },
    async (request, reply) => {
      await deleteTemplate(context, request.params.houseId, request.params.templateId);
      return reply.code(204).send();
    },
  );
};
