import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The website's live demo page (spec/product/showcase-website.md#live-demo): the HA panel (ha-viewer/liveDemo.ts)
// built into dist/website/live-demo/ after the website. Its public folder, dist/live-demo-public/, holds the HA
// cards bundle (ha-cards/, from `npm run demo:ha-cards`) and the demo data (data/, from `npm run demo:data`).
export default defineConfig({
  root: fileURLToPath(new URL("./website/live-demo", import.meta.url)),
  base: "/ha3d-floorplaner/live-demo/",
  publicDir: fileURLToPath(new URL("./dist/live-demo-public", import.meta.url)),
  resolve: { alias: { "@shared": fileURLToPath(new URL("./shared", import.meta.url)) } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: fileURLToPath(new URL("./dist/website/live-demo", import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
