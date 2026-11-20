import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";

/**
 * The dev harness's fake Home Assistant (ha-viewer/fakeHaHost.ts) uses real Home Assistant cards, like the live demo:
 * the dev server serves the HA cards bundle that `npm run demo:ha-cards` builds (dist/live-demo-public/ha-cards/) at
 * <base>ha-viewer/ha-cards/. Dev only; nothing outside that folder is served.
 */
const haCardsInDev = (basePath: string): Plugin => {
  const root = fileURLToPath(new URL("./dist/live-demo-public/ha-cards/", import.meta.url));
  const prefix = `${basePath.replace(/\/$/, "")}/ha-viewer/ha-cards/`;
  const types: Readonly<Record<string, string>> = {
    ".js": "text/javascript",
    ".json": "application/json",
    ".css": "text/css",
    ".txt": "text/plain",
    ".woff2": "font/woff2",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  };
  return {
    name: "homeplan-ha-cards-dev",
    apply: "serve",
    configureServer: (server) => {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? "").split("?")[0] ?? "";
        if (!path.startsWith(prefix)) {
          next();
          return;
        }
        const file = normalize(join(root, decodeURIComponent(path.slice(prefix.length))));
        if (
          !file.startsWith(root.endsWith(sep) ? root : root + sep) ||
          !existsSync(file) ||
          !statSync(file).isFile()
        ) {
          response.statusCode = 404;
          response.end();
          return;
        }
        response.setHeader("content-type", types[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(response);
      });
    },
  };
};

export default defineConfig(({ command, mode }) => {
  // HOMEPLAN_* settings come from the shell or from an untracked .env.local (for example the developer's own
  // Home Assistant origin); nothing machine-specific is hard-coded here.
  const env = { ...loadEnv(mode, process.cwd(), "HOMEPLAN_"), ...process.env };
  const serverPort = Number(env.PORT ?? "4310");
  const basePath = env.HOMEPLAN_BASE_PATH ?? "/";
  // Extra dev-server deny globs for local-only folders (comma-separated, e.g. in .env.local).
  const extraDeny = (env.HOMEPLAN_DEV_DENY ?? "")
    .split(",")
    .map((glob) => glob.trim())
    .filter((glob) => glob !== "");
  const homeAssistantOrigins = (env.HOMEPLAN_HA_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");

  return {
    // The production build uses relative URLs: the server serves index.html with a <base href> for the actual
    // prefix (HOMEPLAN_BASE_PATH, or Home Assistant ingress's per-install X-Ingress-Path), so one build runs under
    // any prefix. The dev server keeps the configured absolute base.
    base: command === "build" ? "./" : basePath,
    plugins: [react(), tailwindcss(), haCardsInDev(basePath)],
    resolve: {
      alias: {
        "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
      },
    },
    server: {
      port: Number(process.env.CLIENT_PORT ?? "5173"),
      strictPort: false,
      // The HA viewer (spec/home-assistant/viewer-mvp.md#dev-server): Home Assistant loads ha-viewer/main.ts
      // and calls /api from its own origin, so the dev server listens on the LAN and allows that origin.
      host: true,
      cors: { origin: homeAssistantOrigins },
      // Listening on the LAN must not publish local data: Vite serves files under the project root, so block the
      // house data directory (the defaults only block .env*, certificates and .git) plus any HOMEPLAN_DEV_DENY globs.
      fs: {
        deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.homeplan-data/**", ...extraDeny],
      },
      proxy: {
        [`${basePath.replace(/\/$/, "")}/api`]: {
          target: `http://localhost:${String(serverPort)}`,
        },
      },
    },
    optimizeDeps: {
      entries: ["index.html", "ha-viewer/main.ts"],
    },
    build: {
      outDir: "dist/client",
      chunkSizeWarningLimit: 2000,
    },
  };
});
