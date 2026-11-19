// Serves the built SPA's index.html with the <base href> of the request (spec/home-assistant/publishing.md#app-packaging-and-ingress).
// The production build uses relative URLs, so the one tag decides where assets, routes and /api resolve:
// HOMEPLAN_BASE_PATH normally, or Home Assistant ingress's per-install prefix, which the Supervisor sends as
// X-Ingress-Path (it strips the prefix before proxying, so the server itself still runs at its base path).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";

/** Only the Supervisor's own form is honoured; anything else is ignored (never echoed into HTML). */
const ingressPathPattern = /^\/api\/hassio_ingress\/[A-Za-z0-9_-]+$/;

export const requestBase = (request: FastifyRequest, basePath: string): string => {
  const header = request.headers["x-ingress-path"];
  const ingress = typeof header === "string" && ingressPathPattern.test(header) ? header : "";
  return `${ingress}${basePath}`;
};

export type SpaIndex = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>;

export const createSpaIndex = (clientDir: string, basePath: string): SpaIndex => {
  let template: Promise<string> | undefined;
  return async (request, reply) => {
    template ??= readFile(join(clientDir, "index.html"), "utf8");
    const html = (await template).replace(
      /<base href="[^"]*"\s*\/?>/,
      `<base href="${requestBase(request, basePath)}" />`,
    );
    return reply.type("text/html").header("Cache-Control", "no-cache").send(html);
  };
};
