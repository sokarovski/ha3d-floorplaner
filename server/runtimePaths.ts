// Build output locations, resolved from the repository root so the server runs from any working directory.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository (or app image) root: the parent of `server/`. */
export const repositoryRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/** The built SPA (`npm run build`). */
export const clientDistDir = resolve(repositoryRoot, "dist/client");
/** The built production HA viewer and its manifest (`npm run build:ha-viewer`). */
export const haViewerDistDir = resolve(repositoryRoot, "dist/ha-viewer");
/** Frozen, content-addressed viewer frontend artifacts (`npm run build:ha-viewer`). */
export const haArtifactsDistDir = resolve(repositoryRoot, "dist/ha-artifacts");

/** The release version (package.json, the single version source shared with the integration and the app). */
export const producerVersion: string = ((): string => {
  const parsed: unknown = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "version" in parsed &&
    typeof parsed.version === "string"
  )
    return parsed.version;
  throw new Error("package.json has no version");
})();
