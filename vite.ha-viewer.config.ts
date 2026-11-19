import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins:
    mode === "loader"
      ? []
      : [
          {
            name: "homeplan-bundled-licenses",
            generateBundle() {
              const packages = new Set<string>();
              for (const id of this.getModuleIds()) {
                const marker = id.lastIndexOf("/node_modules/");
                if (marker < 0) continue;
                const segments = id.slice(marker + 14).split("/");
                const name = segments.slice(0, segments[0]?.startsWith("@") === true ? 2 : 1).join("/");
                packages.add(join(id.slice(0, marker), "node_modules", name));
              }
              const notices = [...packages].sort().map((directory) => {
                const files = readdirSync(directory).filter((name) =>
                  /^(?:licen[sc]e|copying|notice)(?:\.|$)/i.test(name),
                );
                if (files.length === 0)
                  throw new Error(
                    `Missing bundled dependency license: ${directory.split("/node_modules/").at(-1) ?? "unknown"}`,
                  );
                return `## ${directory.split("/node_modules/").at(-1) ?? "Dependency"}\n\n${files
                  .sort()
                  .map((name) => readFileSync(join(directory, name), "utf8"))
                  .join("\n\n")}`;
              });
              this.emitFile({
                type: "asset",
                fileName: "THIRD_PARTY_NOTICES.md",
                source: `# Bundled frontend dependencies\n\n${notices.join("\n\n")}\n`,
              });
            },
          },
        ],
  resolve: { alias: { "@shared": fileURLToPath(new URL("./shared", import.meta.url)) } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist/ha-viewer",
    emptyOutDir: mode !== "loader",
    sourcemap: false,
    lib: {
      entry: mode === "loader" ? "ha-viewer/loader.ts" : "ha-viewer/entry.ts",
      formats: ["es"],
      fileName: mode === "loader" ? "loader" : "viewer",
    },
    rollupOptions: { output: { codeSplitting: false } },
    chunkSizeWarningLimit: 4000,
  },
}));
