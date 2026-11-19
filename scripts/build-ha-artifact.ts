// Builds the versioned component baseline and exports the one schema authority for Python.
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { FrontendManifest } from "../shared/contracts/homeplanIntegration";
import type { FrontendManifestValue } from "../shared/contracts/homeplanIntegration";
import * as integration from "../shared/contracts/homeplanIntegration";
import { StoredHouse } from "../shared/domain/schemas/storedHouse";
import { HouseListResponse } from "../shared/contracts/houses";
import { StoredHouseDocumentEnvelope } from "../shared/contracts/document";
import { PreferencesResponse, PreferencesPatch } from "../shared/contracts/preferences";
import { fileEntry, identity, storeArtifact } from "../server/snapshots/artifacts";
import { checkVersions } from "./lib/version";

const root = "dist/ha-viewer";
const component = "custom_components/homeplan";
// One release version: the bundle requires an integration of at least its own release.
const version = await checkVersions();
await mkdir(join(component, "frontend"), { recursive: true });
const bytes = await readFile(join(root, "viewer.js"));
const manifest: FrontendManifestValue = {
  formatVersion: 1,
  bundleId: "0".repeat(64),
  version,
  createdAt: new Date().toISOString(),
  entry: "viewer.js",
  loaderProtocol: 1,
  apiProtocol: 1,
  minimumIntegrationVersion: version,
  files: [fileEntry("viewer.js", bytes)],
};
manifest.bundleId = identity(manifest, "bundleId");
await storeArtifact("dist/ha-artifacts", manifest.bundleId, manifest, new Map([["viewer.js", bytes]]));
await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
await copyFile(join(root, "THIRD_PARTY_NOTICES.md"), join(component, "THIRD_PARTY_NOTICES.md"));
await copyFile(join(root, "loader.js"), join(component, "frontend/loader.js"));
await copyFile(join(root, "viewer.js"), join(component, "frontend/viewer.js"));
await writeFile(join(component, "frontend/manifest.json"), JSON.stringify(manifest, null, 2));
const schemas = {
  ...integration,
  // Phases 16.14, 19.2: stored and incoming copies may be house schema version 4, 5 or 6 (the viewer migrates them).
  House: StoredHouse,
  HouseListResponse,
  HouseDocumentEnvelope: StoredHouseDocumentEnvelope,
  PreferencesResponse,
  PreferencesPatch,
};
await writeFile(join(component, "schemas.json"), JSON.stringify(schemas));
// Validate the manifest at the same boundary used by the source routes.
const { compileValidator } = await import("../shared/domain/validation/ajv");
if (!compileValidator(FrontendManifest)(manifest)) throw new Error("Invalid frontend manifest");
process.stdout.write(
  `Viewer ${manifest.version}: ${manifest.bundleId.slice(0, 12)}, ${bytes.byteLength} bytes\n`,
);
