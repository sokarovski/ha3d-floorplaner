// House lifecycle and document routes (spec/architecture/api.md#houses, #house-document).
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { HouseParams } from "../../shared/contracts/common";
import {
  HouseDocumentEnvelope,
  SaveDocumentBody,
  SaveDocumentResponse,
} from "../../shared/contracts/document";
import {
  CloneHouseBody,
  CreateHouseBody,
  HouseCard,
  HouseListResponse,
  RenameHouseBody,
  RenameHouseResponse,
  TrashListResponse,
  ValidHouseCard,
} from "../../shared/contracts/houses";
import type { ServiceContext } from "../services/context";
import { getDocument, putDocument } from "../services/documentService";
import {
  cloneHouse,
  createHouse,
  listHouses,
  listTrash,
  purgeHouse,
  renameHouse,
  restoreHouse,
  trashHouse,
} from "../services/houseService";

/** Implementation convention: a house.json body may be up to 64 MB. */
export const documentBodyLimit = 64 * 1024 * 1024;

export const houseRoutes: FastifyPluginAsyncTypebox<{ context: ServiceContext }> = async (
  app,
  { context },
) => {
  app.get("/houses", { schema: { response: { 200: HouseListResponse } } }, async () => ({
    houses: [...(await listHouses(context))],
  }));

  app.post(
    "/houses",
    { schema: { body: CreateHouseBody, response: { 201: ValidHouseCard } } },
    async (request, reply) => reply.code(201).send(await createHouse(context, request.body.name)),
  );

  app.post(
    "/houses/:houseId/clone",
    { schema: { params: HouseParams, body: CloneHouseBody, response: { 201: ValidHouseCard } } },
    async (request, reply) =>
      reply.code(201).send(await cloneHouse(context, request.params.houseId, request.body.name)),
  );

  app.patch(
    "/houses/:houseId",
    { schema: { params: HouseParams, body: RenameHouseBody, response: { 200: RenameHouseResponse } } },
    async (request) =>
      renameHouse(context, request.params.houseId, request.body.name, request.body.expectedRevision),
  );

  app.delete("/houses/:houseId", { schema: { params: HouseParams } }, async (request, reply) => {
    await trashHouse(context, request.params.houseId);
    return reply.code(204).send();
  });

  app.get("/trash/houses", { schema: { response: { 200: TrashListResponse } } }, async () => ({
    houses: [...(await listTrash(context))],
  }));

  app.post(
    "/trash/houses/:houseId/restore",
    { schema: { params: HouseParams, response: { 200: HouseCard } } },
    async (request) => restoreHouse(context, request.params.houseId),
  );

  app.delete("/trash/houses/:houseId", { schema: { params: HouseParams } }, async (request, reply) => {
    await purgeHouse(context, request.params.houseId);
    return reply.code(204).send();
  });

  app.get(
    "/houses/:houseId/document",
    { schema: { params: HouseParams, response: { 200: HouseDocumentEnvelope } } },
    async (request) => getDocument(context, request.params.houseId),
  );

  app.put(
    "/houses/:houseId/document",
    {
      bodyLimit: documentBodyLimit,
      schema: { params: HouseParams, body: SaveDocumentBody, response: { 200: SaveDocumentResponse } },
    },
    async (request) =>
      putDocument(context, request.params.houseId, request.body.expectedRevision, request.body.document),
  );
};
