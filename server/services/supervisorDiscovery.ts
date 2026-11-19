// Supervisor discovery for the Home Assistant app (spec/home-assistant/publishing.md#supervisor-discovery-payload).
// Only started when SUPERVISOR_TOKEN is set. It announces the app's internal host and port for the `homeplan`
// integration: once at start and again periodically, each time replacing its earlier announcement so that HA
// re-fires the config flow (an integration installed after the app otherwise never sees it). Failures are logged
// and never stop the server.
import { hostname } from "node:os";
import type { FastifyBaseLogger } from "fastify";
import { isRecord } from "../lib/json";

/** API compatibility version announced as `api` (the integration rejects versions it does not support). */
export const homeplanAppApiVersion = 1;

export type SupervisorDiscoveryOptions = Readonly<{
  token: string;
  /** The app's internal HTTP port (its ingress port). */
  port: number;
  log: FastifyBaseLogger;
  /** Re-announce interval; default 15 minutes. */
  intervalMs?: number;
  /** Supervisor API base; default `http://supervisor`. */
  supervisorUrl?: string;
}>;

export type SupervisorDiscovery = Readonly<{ stop: () => Promise<void> }>;

const requestTimeoutMs = 10_000;

/** The `data` object of a Supervisor `{ result: "ok", data }` response, or an error describing the failure. */
const supervisorData = async (response: Response): Promise<Record<string, unknown>> => {
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok || !isRecord(body) || body.result !== "ok") {
    const message = isRecord(body) && typeof body.message === "string" ? body.message : response.statusText;
    throw new Error(`Supervisor answered ${response.status}: ${message}`);
  }
  return isRecord(body.data) ? body.data : {};
};

export const startSupervisorDiscovery = (options: SupervisorDiscoveryOptions): SupervisorDiscovery => {
  const base = options.supervisorUrl ?? "http://supervisor";
  const headers = { authorization: `Bearer ${options.token}` };
  const { log } = options;
  let uuid: string | undefined;
  let stopped = false;

  const call = async (method: "GET" | "POST" | "DELETE", path: string, body?: unknown) =>
    supervisorData(
      await fetch(`${base}${path}`, {
        method,
        headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(requestTimeoutMs),
      }),
    );

  const withdraw = async (): Promise<void> => {
    if (uuid === undefined) return;
    const previous = uuid;
    uuid = undefined;
    try {
      await call("DELETE", `/discovery/${encodeURIComponent(previous)}`);
    } catch (error: unknown) {
      log.warn({ err: error, uuid: previous }, "Could not withdraw the Supervisor discovery announcement");
    }
  };

  const post = async (host: string): Promise<void> => {
    const data = await call("POST", "/discovery", {
      service: "homeplan",
      config: { host, port: options.port, api: homeplanAppApiVersion },
    });
    uuid = typeof data.uuid === "string" ? data.uuid : undefined;
  };

  // The container's host name is the app's DNS name on the Supervisor network; the Supervisor's own record wins.
  const appHostname = async (): Promise<string> => {
    try {
      const info = await call("GET", "/addons/self/info");
      if (typeof info.hostname === "string" && info.hostname !== "") return info.hostname;
    } catch (error: unknown) {
      log.warn(
        { err: error },
        "Could not read this app's info from the Supervisor; using the container name",
      );
    }
    return hostname();
  };

  // The Supervisor answers an identical announcement with the existing one and does not notify HA again, so an
  // announcement is always withdrawn and posted anew. At start the first post may return one left by a crash.
  const announce = async (): Promise<void> => {
    try {
      const host = await appHostname();
      if (uuid === undefined) await post(host);
      await withdraw();
      if (stopped) return;
      await post(host);
      log.info({ host, port: options.port, uuid }, "Announced Homeplan to Home Assistant");
    } catch (error: unknown) {
      log.warn({ err: error }, "Supervisor discovery announcement failed; retrying later");
    }
  };

  let running = announce();
  const timer = setInterval(
    () => {
      running = running.then(announce);
    },
    options.intervalMs ?? 15 * 60_000,
  );
  timer.unref();

  return {
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await running;
      await withdraw();
    },
  };
};
