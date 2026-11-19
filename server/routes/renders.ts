// Photorealistic render job routes (spec/architecture/api.md#exports-and-renders).
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { HouseParams } from "../../shared/contracts/common";
import {
  RenderJobParams,
  RenderJobResponse,
  SubmitRenderResponse,
  renderUploadFields,
} from "../../shared/contracts/renders";
import { readMultipart } from "../http/multipart";
import { renderSceneMaxBytes } from "../render/renderJobs";
import type { RenderJobService } from "../render/renderJobs";

export const renderRoutes: FastifyPluginAsyncTypebox<{ renders: RenderJobService }> = async (
  app,
  { renders },
) => {
  app.post(
    "/houses/:houseId/renders",
    { schema: { params: HouseParams, response: { 202: SubmitRenderResponse } } },
    async (request, reply) => {
      const content = await readMultipart(request, {
        fileFields: [renderUploadFields.scene],
        textFields: [renderUploadFields.snapshot],
        maxFileBytes: renderSceneMaxBytes,
        maxFieldBytes: 1024 * 1024,
      });
      const jobId = await renders.submit(
        request.params.houseId,
        content.files.get(renderUploadFields.scene)?.bytes,
        content.fields.get(renderUploadFields.snapshot),
      );
      return reply.code(202).send({ jobId });
    },
  );

  app.get(
    "/houses/:houseId/renders/:jobId",
    { schema: { params: RenderJobParams, response: { 200: RenderJobResponse } } },
    async (request) => renders.get(request.params.houseId, request.params.jobId),
  );

  app.delete(
    "/houses/:houseId/renders/:jobId",
    { schema: { params: RenderJobParams, response: { 200: RenderJobResponse } } },
    async (request) => renders.cancel(request.params.houseId, request.params.jobId),
  );
};
