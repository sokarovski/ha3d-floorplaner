import { join, resolve } from "node:path";
import Type from "typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { HouseParams, GitRevisionId } from "../../shared/contracts/common";
import {
  ArtifactId,
  FrontendManifest,
  SnapshotCreate,
  SnapshotExport,
  SnapshotManifest,
  SnapshotSource,
} from "../../shared/contracts/homeplanIntegration";
import { compileValidator } from "../../shared/domain/validation/ajv";
import type { ServiceContext } from "../services/context";
import { ApiError } from "../http/errors";
import { readArtifactFile } from "../snapshots/artifacts";
import { requireHouse } from "../services/houseService";
import { createSnapshot, readSnapshotSource, snapshotRoot } from "../snapshots/houseSnapshots";
import { haArtifactsDistDir, haViewerDistDir } from "../runtimePaths";

const snapshotParams = Type.Object({ ...HouseParams.properties, snapshotId: ArtifactId });
const snapshotFileParams = Type.Object({ ...snapshotParams.properties, "*": Type.String() });
const frontendParams = Type.Object({ bundleId: ArtifactId });
const frontendFileParams = Type.Object({ ...frontendParams.properties, "*": Type.String() });
const validateSnapshot = compileValidator(SnapshotManifest);
const validateFrontend = compileValidator(FrontendManifest);
const frontendRoot = haViewerDistDir;

export const snapshotRoutes: FastifyPluginAsyncTypebox<{ context: ServiceContext }> = async (
  app,
  { context },
) => {
  app.get(
    "/houses/:houseId/snapshot-source",
    {
      schema: {
        params: HouseParams,
        querystring: Type.Object({ baseRevisionId: Type.Optional(GitRevisionId) }),
        response: { 200: SnapshotSource },
      },
    },
    async (request) => readSnapshotSource(context, request.params.houseId, request.query.baseRevisionId),
  );
  app.post(
    "/houses/:houseId/snapshots",
    { schema: { params: HouseParams, body: SnapshotCreate, response: { 201: SnapshotExport } } },
    async (request, reply) => {
      const manifest = await createSnapshot(
        context,
        request.params.houseId,
        request.body.expectedSourceRevisionId,
      );
      return reply.code(201).send({
        snapshotId: manifest.snapshotId,
        sourceRevisionId: manifest.sourceRevisionId,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
    },
  );
  const manifestFor = async (houseId: string, snapshotId: string) => {
    // A trashed or purged house serves no snapshot, even while its frozen files are still on disk.
    await requireHouse(context, houseId);
    const parsed: unknown = JSON.parse(
      (await readArtifactFile(join(snapshotRoot(context, houseId), snapshotId), "manifest.json")).toString(),
    );
    if (!validateSnapshot(parsed) || parsed.houseId !== houseId || parsed.snapshotId !== snapshotId)
      throw new ApiError("invalidDocument", "The snapshot manifest is invalid.");
    return parsed;
  };
  app.get(
    "/houses/:houseId/snapshots/:snapshotId/manifest",
    { schema: { params: snapshotParams, response: { 200: SnapshotManifest } } },
    async (request) => manifestFor(request.params.houseId, request.params.snapshotId),
  );
  app.get(
    "/houses/:houseId/snapshots/:snapshotId/files/*",
    { schema: { params: snapshotFileParams } },
    async (request, reply) => {
      const { houseId, snapshotId } = request.params;
      const manifest = await manifestFor(houseId, snapshotId);
      const file = manifest.files.find((entry) => entry.path === request.params["*"]);
      if (file === undefined) throw new ApiError("notFound", "This file is not listed by the manifest.");
      return reply
        .header("cache-control", "private, no-store")
        .type(file.mediaType)
        .send(await readArtifactFile(join(snapshotRoot(context, houseId), snapshotId), file.path));
    },
  );
  const frontend = async () => {
    const parsed: unknown = JSON.parse((await readArtifactFile(frontendRoot, "manifest.json")).toString());
    if (!validateFrontend(parsed))
      throw new ApiError("invalidDocument", "Build the production viewer before exporting it.");
    return parsed;
  };
  app.get("/viewer/frontend", { schema: { response: { 200: FrontendManifest } } }, async () => frontend());
  const frozenFrontend = async (id: string) => {
    const parsed: unknown = JSON.parse(
      (await readArtifactFile(resolve(haArtifactsDistDir, id), "manifest.json")).toString(),
    );
    if (!validateFrontend(parsed) || parsed.bundleId !== id)
      throw new ApiError("invalidDocument", "Invalid frontend artifact.");
    return parsed;
  };
  app.get(
    "/viewer/frontend/:bundleId/manifest",
    { schema: { params: frontendParams, response: { 200: FrontendManifest } } },
    async (request) => {
      return frozenFrontend(request.params.bundleId);
    },
  );
  app.get(
    "/viewer/frontend/:bundleId/files/*",
    { schema: { params: frontendFileParams } },
    async (request, reply) => {
      const manifest = await frozenFrontend(request.params.bundleId);
      const file = manifest.files.find((entry) => entry.path === request.params["*"]);
      if (file === undefined) throw new ApiError("notFound", "The frontend file is not listed.");
      return reply
        .header("cache-control", "no-store")
        .type(file.mediaType)
        .send(await readArtifactFile(resolve(haArtifactsDistDir, manifest.bundleId), file.path));
    },
  );
};
