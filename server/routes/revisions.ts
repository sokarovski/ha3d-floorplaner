// Git revision routes (spec/architecture/api.md#house-document).
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { HouseParams } from "../../shared/contracts/common";
import {
  CreateRevisionBody,
  CreatedRevisionResponse,
  NoRevisionResponse,
  RestoreRevisionBody,
  RestoreRevisionResponse,
  RevisionDiffResponse,
  RevisionListQuery,
  RevisionListResponse,
  RevisionParams,
} from "../../shared/contracts/revisions";
import type { ServiceContext } from "../services/context";
import { createRevision, diffRevision, listRevisions, restoreRevision } from "../services/revisionService";

const defaultPageSize = 50;

export const revisionRoutes: FastifyPluginAsyncTypebox<{ context: ServiceContext }> = async (
  app,
  { context },
) => {
  app.post(
    "/houses/:houseId/revisions",
    {
      schema: {
        params: HouseParams,
        body: CreateRevisionBody,
        response: { 200: NoRevisionResponse, 201: CreatedRevisionResponse },
      },
    },
    async (request, reply) => {
      const revision = await createRevision(context, request.params.houseId, request.body.message);
      if (revision === undefined) return reply.code(200).send({ created: false });
      return reply.code(201).send({ created: true, revision });
    },
  );

  app.get(
    "/houses/:houseId/revisions",
    {
      schema: {
        params: HouseParams,
        querystring: RevisionListQuery,
        response: { 200: RevisionListResponse },
      },
    },
    async (request) =>
      listRevisions(
        context,
        request.params.houseId,
        request.query.before,
        request.query.limit === undefined ? defaultPageSize : Number(request.query.limit),
      ),
  );

  app.get(
    "/houses/:houseId/revisions/:revisionId/diff",
    { schema: { params: RevisionParams, response: { 200: RevisionDiffResponse } } },
    async (request) => diffRevision(context, request.params.houseId, request.params.revisionId),
  );

  app.post(
    "/houses/:houseId/revisions/:revisionId/restore",
    {
      schema: {
        params: RevisionParams,
        body: RestoreRevisionBody,
        response: { 200: RestoreRevisionResponse },
      },
    },
    async (request) =>
      restoreRevision(
        context,
        request.params.houseId,
        request.params.revisionId,
        request.body.expectedRevision,
      ),
  );
};
