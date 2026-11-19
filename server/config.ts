// Runtime configuration from environment variables (spec/delivery/deployment.md).
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { parseEnv } from "node:util";
import { clientDistDir } from "./runtimePaths";

export type ServerConfig = Readonly<{
  dataDir: string;
  host: string;
  port: number;
  basePath: string;
  production: boolean;
  clientDir: string;
  /**
   * Extra Host names accepted besides the built-in ones (DNS-rebinding guard, spec/delivery/deployment.md):
   * `"*"` accepts any; absent means "not configured".
   */
  allowedHosts?: readonly string[] | "*";
  /** Origins (scheme://host[:port]) allowed to send non-GET requests from another origin (the HA dev viewer). */
  haOrigins?: readonly string[];
  /**
   * Seed the demo houses into a data directory that never held a house (persistence.md#demo-houses). On unless
   * HOMEPLAN_SEED_DEMOS is `0` or `false`; absent (programmatic configurations) means off.
   */
  seedDemoHouses?: boolean;
  /**
   * SUPERVISOR_TOKEN, set by the Home Assistant Supervisor when the server runs as an HA app: turns on app mode
   * (request guards for the Supervisor network, discovery announcement; spec/delivery/deployment.md#home-assistant-app).
   */
  supervisorToken?: string;
}>;

const normalizeBasePath = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "/") return "/";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
};

const list = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

/** HOMEPLAN_HA_ORIGINS like vite.config.ts reads it: the shell first, then an untracked .env.local (dev only). */
const haOriginsSetting = (env: NodeJS.ProcessEnv): string | undefined => {
  if (env.HOMEPLAN_HA_ORIGINS !== undefined || env.NODE_ENV === "production") return env.HOMEPLAN_HA_ORIGINS;
  try {
    return parseEnv(readFileSync(resolve(process.cwd(), ".env.local"), "utf8")).HOMEPLAN_HA_ORIGINS;
  } catch {
    return undefined;
  }
};

export const loadServerConfig = (env: NodeJS.ProcessEnv = process.env): ServerConfig => {
  const rawDataDir = env.DATA_DIR ?? ".homeplan-data";
  const port = Number(env.PORT ?? "4310");
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT must be a valid TCP port, got "${env.PORT ?? ""}"`);
  }
  return {
    dataDir: isAbsolute(rawDataDir) ? rawDataDir : resolve(process.cwd(), rawDataDir),
    host: env.HOST ?? "localhost",
    port,
    basePath: normalizeBasePath(env.HOMEPLAN_BASE_PATH ?? "/"),
    production: env.NODE_ENV === "production",
    clientDir: clientDistDir,
    allowedHosts:
      env.HOMEPLAN_ALLOWED_HOSTS === undefined
        ? undefined
        : env.HOMEPLAN_ALLOWED_HOSTS.trim() === "*"
          ? "*"
          : list(env.HOMEPLAN_ALLOWED_HOSTS).map((host) => host.toLowerCase()),
    haOrigins: list(haOriginsSetting(env)).map((origin) => origin.replace(/\/+$/, "").toLowerCase()),
    supervisorToken:
      env.SUPERVISOR_TOKEN === undefined || env.SUPERVISOR_TOKEN === "" ? undefined : env.SUPERVISOR_TOKEN,
    seedDemoHouses: !["0", "false"].includes((env.HOMEPLAN_SEED_DEMOS ?? "").trim().toLowerCase()),
  };
};
