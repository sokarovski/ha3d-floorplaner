import { StoredHouseDocumentEnvelope } from "@shared/contracts/document";
import { HouseListResponse } from "@shared/contracts/houses";
import { IntegrationConfigResponse, SnapshotManifest } from "@shared/contracts/homeplanIntegration";
import type {
  IntegrationConfigurationValue,
  SnapshotManifestValue,
} from "@shared/contracts/homeplanIntegration";
import { emptyHouseBindings } from "@shared/domain/schemas/homeAssistant";
import type { SettingsPatch, HouseSource } from "./houseSource";
import { SourceError, currentHouseEnvelope } from "./houseSource";
import type { IntegrationClient } from "./integrationClient";
import { integrationUrl } from "./integrationClient";

export const createIntegrationHouseSource = (
  client: IntegrationClient,
  remote: boolean,
  onFailure: (error: unknown) => void,
  onAssetError: () => void = () => undefined,
): HouseSource => {
  let baseline: IntegrationConfigurationValue | null = null;
  let manifest: SnapshotManifestValue | null = null;
  let generation = 0;
  const controller = new AbortController();
  const readConfig = async () => {
    baseline = (await client.config()).configuration;
    return baseline;
  };
  const current = async () => baseline ?? readConfig();
  const patch = async (value: unknown): Promise<void> => {
    const config = await current();
    const response = await client.request(
      IntegrationConfigResponse,
      ["config"],
      { expectedRevision: config.revision, patch: value },
      "PATCH",
    );
    baseline = response.configuration;
  };
  const remoteUrl = (houseId: string, ...parts: readonly string[]) =>
    `${integrationUrl("remote", "houses", houseId, ...parts)}?generation=${String(generation)}`;
  const localFile = (houseId: string, path: string) => {
    if (manifest?.houseId !== houseId)
      throw new SourceError("Load the local snapshot before its assets.", null);
    return integrationUrl("houses", houseId, "snapshots", manifest.snapshotId, "files", ...path.split("/"));
  };
  return {
    integration: true,
    acceptConfigRevision: (previous, next) => {
      if (baseline?.revision === previous && next === previous + 1)
        baseline = { ...baseline, revision: next };
    },
    dispose: () => {
      controller.abort();
    },
    // One missing texture or template must not tear down the scene: the template and texture caches already
    // show a placeholder for a failed read, so an asset failure is reported, not escalated to the loader's
    // fallback (production-integration.md: a running session keeps its current scene). A remote (DEV MODE)
    // failure additionally marks the scene stale so the panel can offer Reload using local copy.
    readAsset: async (url) => {
      try {
        return await (await client.fetchPrivate(url, { signal: controller.signal })).blob();
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("Homeplan: an asset could not be loaded", url, error);
          if (remote) onAssetError();
        }
        throw error;
      }
    },
    listHouses: async () => (await client.request(HouseListResponse, ["houses"])).houses,
    loadHouse: async (houseId) => {
      try {
        const config = await readConfig();
        generation = config.connection.generation;
        if (remote) {
          const response = await client.fetchPrivate(remoteUrl(houseId, "document"), {
            signal: controller.signal,
          });
          const raw: unknown = await response.json();
          if (typeof raw !== "object" || raw === null || !("revision" in raw) || !("document" in raw))
            throw new SourceError("Invalid remote house response.", null);
          // Strip only the protocol wrapper; validate the complete document with its authoritative schema
          // (version 4 or 5), then migrate it to the current version (Phase 16.14).
          const { compileValidator } = await import("@shared/domain/validation/ajv");
          const envelope: unknown = { revision: raw.revision, document: raw.document };
          if (!compileValidator(StoredHouseDocumentEnvelope)(envelope))
            throw new SourceError("The remote house is incompatible.", null);
          return currentHouseEnvelope(envelope);
        }
        const copy = await client.copy(houseId);
        manifest = await client.request(SnapshotManifest, [
          "houses",
          houseId,
          "snapshots",
          copy.snapshotId,
          "manifest",
        ]);
        // A stored copy may be house schema version 4: migrate it before rendering (Phase 16.14).
        return currentHouseEnvelope(
          await client.request(StoredHouseDocumentEnvelope, [
            "houses",
            houseId,
            "snapshots",
            copy.snapshotId,
            "document",
          ]),
        );
      } catch (error) {
        if (remote && !controller.signal.aborted) onFailure(error);
        throw error;
      }
    },
    templateUrl: (houseId, templateId, version) => {
      if (remote) return remoteUrl(houseId, "templates", templateId, "v", String(version));
      const resource = manifest?.resources.templates.find(
        (item) => item.id === templateId && item.version === version,
      );
      if (resource === undefined)
        throw new SourceError("A template is missing from this copied snapshot.", 404);
      return localFile(houseId, resource.path);
    },
    imageUrl: (houseId, imageId) => {
      if (remote) return remoteUrl(houseId, "images", imageId, "file");
      const resource = manifest?.resources.images.find((item) => item.id === imageId);
      if (resource === undefined)
        throw new SourceError("An image is missing from this copied snapshot.", 404);
      return localFile(houseId, resource.path);
    },
    readSetup: async () => (await readConfig()).viewer,
    saveSetup: (viewer) => patch({ viewer }),
    readBindings: async (houseId) => (await readConfig()).bindings[houseId] ?? emptyHouseBindings(),
    saveBindings: (houseId, bindings) => patch({ bindings: { [houseId]: bindings } }),
    readDashboard: async () => (await current()).dashboard,
    saveDashboard: (dashboard) => patch({ dashboard }),
    saveSettings: (value: SettingsPatch) => patch(value),
  };
};
