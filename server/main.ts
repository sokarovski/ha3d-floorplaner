import { buildApp } from "./app";
import { loadServerConfig } from "./config";
import { startSupervisorDiscovery } from "./services/supervisorDiscovery";
import type { SupervisorDiscovery } from "./services/supervisorDiscovery";

const config = loadServerConfig();
const app = await buildApp(config);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error: unknown) {
  app.log.error(error);
  process.exit(1);
}

// As a Home Assistant app, announce the internal address to the integration (Supervisor discovery).
const discovery: SupervisorDiscovery | undefined =
  config.supervisorToken === undefined
    ? undefined
    : startSupervisorDiscovery({ token: config.supervisorToken, port: config.port, log: app.log });

// Graceful shutdown: as a container's main process (Docker stop, app restart) or on Ctrl+C. Fastify finishes
// in-flight requests; writes are atomic, so a forced exit after the timeout still leaves recoverable data.
let closing = false;
const shutdown = (signal: NodeJS.Signals): void => {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, "Shutting down");
  setTimeout(() => process.exit(1), 10_000).unref();
  Promise.all([discovery?.stop(), app.close()]).then(
    () => process.exit(0),
    (error: unknown) => {
      app.log.error(error);
      process.exit(1);
    },
  );
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
