import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import type { HtmlTagDescriptor, Plugin } from "vite";

// The showcase website: four static pages (the overview, possibilities.html, install.html and developers.html) published to GitHub Pages as a project site, so every URL
// lives under the repository prefix. It does not start the builder's services, router, stores or renderer.
const basePath = "/ha3d-floorplaner/";
const siteUrl = `https://sokarovski.github.io${basePath}`;
// Extra dev-server deny globs for local-only folders (comma-separated, e.g. in .env.local).
const extraDeny = (
  { ...loadEnv("development", process.cwd(), "HOMEPLAN_"), ...process.env }.HOMEPLAN_DEV_DENY ?? ""
)
  .split(",")
  .map((glob) => glob.trim())
  .filter((glob) => glob !== "");
const socialPreviewSource = fileURLToPath(new URL("./brand/social-preview.png", import.meta.url));

// The social preview image is generated from the logo by `npm run brand:build`. When it is missing the page is
// still built, only without the og:image/twitter:image tags.
const socialPreview = (): Plugin => ({
  name: "homeplan-site-social-preview",
  apply: "build",
  transformIndexHtml(): HtmlTagDescriptor[] {
    if (!existsSync(socialPreviewSource)) {
      return [];
    }
    const image = `${siteUrl}social-preview.png`;
    return [
      { tag: "meta", attrs: { property: "og:image", content: image }, injectTo: "head" },
      { tag: "meta", attrs: { property: "og:image:width", content: "1280" }, injectTo: "head" },
      { tag: "meta", attrs: { property: "og:image:height", content: "640" }, injectTo: "head" },
      {
        tag: "meta",
        attrs: { property: "og:image:alt", content: "The HA3D logo: a 3D house" },
        injectTo: "head",
      },
      { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "twitter:image", content: image }, injectTo: "head" },
    ];
  },
  generateBundle() {
    if (!existsSync(socialPreviewSource)) {
      this.warn("brand/social-preview.png is missing; building the website without a social preview image.");
      return;
    }
    this.emitFile({
      type: "asset",
      fileName: "social-preview.png",
      source: readFileSync(socialPreviewSource),
    });
  },
});

export default defineConfig({
  root: fileURLToPath(new URL("./website", import.meta.url)),
  base: basePath,
  publicDir: fileURLToPath(new URL("./website/public", import.meta.url)),
  plugins: [react(), tailwindcss(), socialPreview()],
  server: {
    port: 5180,
    strictPort: false,
    fs: {
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.homeplan-data/**", ...extraDeny],
    },
  },
  preview: {
    port: 4180,
    strictPort: false,
  },
  build: {
    outDir: fileURLToPath(new URL("./dist/website", import.meta.url)),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("./website/index.html", import.meta.url)),
        possibilities: fileURLToPath(new URL("./website/possibilities.html", import.meta.url)),
        install: fileURLToPath(new URL("./website/install.html", import.meta.url)),
        developers: fileURLToPath(new URL("./website/developers.html", import.meta.url)),
      },
    },
  },
});
