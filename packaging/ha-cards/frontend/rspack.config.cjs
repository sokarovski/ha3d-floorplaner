// HA's own rspack configuration (build-scripts/rspack.cjs) for one ESM entry, ha-cards.js, written to
// HOMEPLAN_HA_CARDS_OUT. Chunks load relative to the bundle (publicPath auto) and the static files from the
// "static/" folder next to it (static-path.ts).
const path = require("path");
const { createRspackConfig } = require("../build-scripts/rspack.cjs");

const outputPath = process.env.HOMEPLAN_HA_CARDS_OUT;
if (!outputPath) throw new Error("HOMEPLAN_HA_CARDS_OUT is not set.");

const config = createRspackConfig({
  name: "homeplan-cards",
  entry: { "ha-cards": path.resolve(__dirname, "entry.ts") },
  outputPath,
  publicPath: "auto",
  isProdBuild: true,
  latestBuild: true,
  // No source maps.
  isTestBuild: true,
  dontHash: new Set(["ha-cards"]),
  defineOverlay: { __STATIC_PATH__: '(globalThis.__HA_STATIC_PATH__ || "/static/")' },
});
// Keep import.meta.url at runtime in static-path.ts.
config.module.rules.push({ test: path.resolve(__dirname, "static-path.ts"), parser: { importMeta: false } });
module.exports = config;
