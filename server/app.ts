// Fastify composition: API routes under <base>/api, and in production the built SPA with fallback.
import { existsSync } from "node:fs";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { ServerConfig } from "./config";
import { registerErrorHandling } from "./http/errors";
import { registerRequestGuards } from "./http/requestGuards";
import { createSpaIndex } from "./http/spaIndex";
import { registerSchemaCompilers } from "./http/schemaCompilers";
import { StoragePaths } from "./repositories/paths";
import { exportRoutes } from "./routes/exports";
import { houseRoutes } from "./routes/houses";
import { imageRoutes } from "./routes/images";
import { createBlenderAdapter, detectBlender } from "./render/blenderAdapter";
import { RenderJobService } from "./render/renderJobs";
import { preferencesRoutes } from "./routes/preferences";
import { renderRoutes } from "./routes/renders";
import { revisionRoutes } from "./routes/revisions";
import { snapshotRoutes } from "./routes/snapshots";
import { systemRoutes } from "./routes/system";
import { templateRoutes } from "./routes/templates";
import { immutableCache, revalidateCache } from "./http/send";
import { createServiceContext } from "./services/context";
import { seedDemoHouses } from "./services/demoSeedService";
import { prepareStorage } from "./services/startup";

export const buildApp = async (config: ServerConfig): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: { level: config.production ? "info" : "warn" },
  }).withTypeProvider<TypeBoxTypeProvider>();
  const apiPrefix = `${config.basePath}api`;
  const spa =
    config.production && existsSync(join(config.clientDir, "index.html"))
      ? createSpaIndex(config.clientDir, config.basePath)
      : null;

  await mkdir(config.dataDir, { recursive: true });
  const paths = new StoragePaths(await realpath(config.dataDir));
  const context = createServiceContext(paths, config.basePath, app.log);
  await prepareStorage(context);
  await seedDemoHouses(context, config.seedDemoHouses === true);
  const availability = await detectBlender();
  const renders = new RenderJobService(
    context,
    availability,
    availability.available ? createBlenderAdapter(availability.executable, availability.renderer) : undefined,
  );
  await renders.recoverInterrupted();
  if (!availability.available) app.log.warn(availability.reason);
  if (config.production && spa === null)
    app.log.warn(
      { clientDir: config.clientDir },
      "The built client (index.html) is missing: only the API is served. Run npm run build.",
    );

  registerSchemaCompilers(app);
  registerErrorHandling(app, { apiPrefix, spa });
  await app.register(fastifyMultipart, { throwFileSizeLimit: true });

  await app.register(
    async (api) => {
      registerRequestGuards(api, {
        host: config.host,
        allowedHosts: config.allowedHosts,
        haOrigins: config.haOrigins ?? [],
        appMode: config.supervisorToken !== undefined,
      });
      await api.register(systemRoutes, { renders });
      await api.register(houseRoutes, { context });
      await api.register(revisionRoutes, { context });
      await api.register(snapshotRoutes, { context });
      await api.register(imageRoutes, { context });
      await api.register(templateRoutes, {
        context,
        builtinCacheControl: config.production ? immutableCache : revalidateCache,
      });
      await api.register(exportRoutes, { context });
      await api.register(preferencesRoutes, { context });
      await api.register(renderRoutes, { renders });
    },
    { prefix: apiPrefix },
  );

  if (spa !== null) {
    // index.html is never served as a static file: it gets the request's <base href> (http/spaIndex.ts).
    await app.register(fastifyStatic, {
      root: config.clientDir,
      prefix: config.basePath,
      wildcard: false,
      index: false,
      globIgnore: ["**/index.html"],
    });
    app.get(config.basePath, spa);
  }

  return app;
};
