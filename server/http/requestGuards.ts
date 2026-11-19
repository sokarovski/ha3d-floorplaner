// DNS-rebinding and cross-origin write guards for /api (spec/delivery/deployment.md#request-guards).
// There are no accounts (D12), so the API trusts whoever can reach it; these checks make sure a page on another
// site cannot reach it through the user's browser: by a rebound DNS name (Host) or by a cross-site write (Origin).
import { BlockList, isIP } from "node:net";
import { hostname } from "node:os";
import type { FastifyInstance } from "fastify";
import { ApiError } from "./errors";

export type RequestGuardOptions = Readonly<{
  /** The configured bind address (HOST). */
  host: string;
  /** HOMEPLAN_ALLOWED_HOSTS: extra accepted Host names, `"*"` for any, absent when not set. */
  allowedHosts: readonly string[] | "*" | undefined;
  /** HOMEPLAN_HA_ORIGINS: other origins allowed to send writes (the HA dev viewer through the Vite proxy). */
  haOrigins: readonly string[];
  /**
   * Running as a Home Assistant app (SUPERVISOR_TOKEN is set): only the Supervisor network may connect, and the
   * Origin check is replaced by the browser's Sec-Fetch-Site (spec/delivery/deployment.md#request-guards).
   */
  appMode?: boolean;
}>;

const wildcardBinds = new Set(["0.0.0.0", "::", "[::]"]);
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

/** The host name of a Host header value, lower case, without port or IPv6 brackets. */
const hostNameOf = (value: string): string => {
  const host = value.trim().toLowerCase();
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return host.slice(1, end === -1 ? undefined : end);
  }
  const colon = host.lastIndexOf(":");
  return colon === -1 || host.indexOf(":") !== colon ? host : host.slice(0, colon);
};

/**
 * Whether the guard is on, and the Host names it accepts. DNS rebinding needs a domain name the attacker
 * controls, so IP literals, localhost names and this machine's own names are always accepted. The guard is off
 * when HOMEPLAN_ALLOWED_HOSTS is "*", and when the server listens on every interface (HOST 0.0.0.0, for example
 * in a container reached under host names not known in advance) without HOMEPLAN_ALLOWED_HOSTS.
 */
export const hostPolicy = (
  options: RequestGuardOptions,
): Readonly<{ enabled: boolean; accepts: (hostHeader: string | undefined) => boolean }> => {
  const enabled =
    options.allowedHosts !== "*" && !(wildcardBinds.has(options.host) && options.allowedHosts === undefined);
  const machine = hostname().toLowerCase();
  const names = new Set<string>([
    "localhost",
    machine,
    machine.endsWith(".local") ? machine : `${machine}.local`,
    hostNameOf(options.host),
    ...(options.allowedHosts === "*" || options.allowedHosts === undefined
      ? []
      : options.allowedHosts.map(hostNameOf)),
  ]);
  const accepts = (hostHeader: string | undefined): boolean => {
    if (!enabled) return true;
    if (hostHeader === undefined) return false;
    const name = hostNameOf(hostHeader);
    return names.has(name) || name.endsWith(".localhost") || isIP(name) !== 0;
  };
  return { enabled, accepts };
};

/**
 * The Supervisor's own network (172.30.32.0/24: the bridge gateway that HA Core's host-network traffic arrives
 * from, 172.30.32.1, and the Supervisor with its ingress proxy, 172.30.32.2), and loopback for the container
 * itself. Other apps (172.30.33.0/24) are not in it.
 */
const supervisorNetwork = new BlockList();
supervisorNetwork.addSubnet("172.30.32.0", 24, "ipv4");
supervisorNetwork.addSubnet("127.0.0.0", 8, "ipv4");
supervisorNetwork.addAddress("::1", "ipv6");

/** Whether a socket peer address belongs to the Supervisor network (IPv4-mapped IPv6 included). */
export const isSupervisorPeer = (address: string | undefined): boolean => {
  if (address === undefined) return false;
  const mapped = address.toLowerCase().startsWith("::ffff:") ? address.slice(7) : address;
  const family = isIP(mapped);
  if (family === 0) return false;
  return supervisorNetwork.check(mapped, family === 4 ? "ipv4" : "ipv6");
};

const originOf = (value: string): string | undefined => {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return undefined;
  }
};

/** Adds the guards to the API plugin scope `api`. */
export const registerRequestGuards = (api: FastifyInstance, options: RequestGuardOptions): void => {
  if (options.appMode === true) {
    api.log.info(
      "Home Assistant app mode: the API accepts only the Supervisor network (ingress and HA Core)",
    );
    api.addHook("onRequest", async (request) => {
      if (!isSupervisorPeer(request.socket.remoteAddress))
        throw new ApiError("badRequest", "This app is reachable only through Home Assistant.");
      // Ingress rewrites Host, so Origin cannot be compared with it. HA's authenticated ingress session is the
      // boundary; a browser still marks a write from another site, which is refused.
      if (!safeMethods.has(request.method) && request.headers["sec-fetch-site"] === "cross-site")
        throw new ApiError("badRequest", "Cross-origin writes are not allowed from this origin.");
    });
    return;
  }
  const policy = hostPolicy(options);
  const haOrigins = new Set(options.haOrigins);
  if (!policy.enabled)
    api.log.warn("Host header checks are off (HOST is 0.0.0.0 or HOMEPLAN_ALLOWED_HOSTS=*)");
  api.addHook("onRequest", async (request) => {
    const host = request.headers.host;
    if (!policy.accepts(host))
      throw new ApiError(
        "badRequest",
        "This host name is not allowed. Add it to HOMEPLAN_ALLOWED_HOSTS to reach the server by that name.",
      );
    if (safeMethods.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin === undefined) return;
    const normalized = originOf(origin);
    if (normalized !== undefined) {
      if (new URL(normalized).host === host?.toLowerCase()) return;
      if (haOrigins.has(normalized)) return;
    }
    throw new ApiError("badRequest", "Cross-origin writes are not allowed from this origin.");
  });
};
