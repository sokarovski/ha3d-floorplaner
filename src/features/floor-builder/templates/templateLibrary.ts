// Loads template metadata (from the GLB JSON chunk) for the house's templates, caches it, and registers each
// template's instance schema (base schema + declared parameters + material choices) for the property panel.
import type { TemplateListItemValue } from "@shared/contracts/templates";
import { readGlbJson, sceneExtras } from "@shared/domain/templates/glbJson";
import {
  homeplanExtras,
  templateParameterSchema,
  validateTemplateMetadata,
} from "@shared/domain/templates/metadata";
import type { TemplateMetadata } from "@shared/domain/templates/metadata";
import { withTemplateParameters } from "@shared/domain/templates/instanceSchema";
import {
  gltfMaterialSwatches,
  templateMaterialChoiceSchemas,
} from "@shared/domain/templates/materialChoices";
import { AreableInstance, WallableInstance } from "@shared/domain/schemas/instances";
import { isSchemaNode } from "@shared/domain/schemas/schemaWalk";
import type { TemplateClient } from "../../../api/templateClient";
import { registerInstanceSchema } from "../services/instanceSchemas";

type LoadedTemplate = Readonly<{ metadata: TemplateMetadata; schema: object | undefined }>;

/** Built-in templates are installation-wide; a house template (`t_…`) is keyed by its house too, because a
 * cloned house keeps the same template IDs while its versions can diverge. Failures are never cached. */
const cache = new Map<string, Promise<LoadedTemplate | undefined>>();

/** Stairs (Staircasable) and floor openings are Areable objects too (Phase 16.14). */
const baseSchemaFor = (metadata: TemplateMetadata): object =>
  metadata.contract === "Wallable" ? WallableInstance : AreableInstance;

const fetchTemplate = async (
  url: string,
  item: TemplateListItemValue,
): Promise<LoadedTemplate | undefined> => {
  const response = await fetch(url);
  if (!response.ok) return undefined;
  const buffer = await response.arrayBuffer();
  const gltf: unknown =
    item.source === "builtin" ? readGlbJson(buffer) : JSON.parse(new TextDecoder().decode(buffer));
  const extras = homeplanExtras(sceneExtras(gltf));
  const { metadata } = validateTemplateMetadata(extras);
  if (metadata === null) return undefined;
  const parameters = templateParameterSchema(metadata);
  const base = baseSchemaFor(metadata);
  const schema = isSchemaNode(base)
    ? withTemplateParameters(base, {
        parameterProperties: parameters.properties,
        required: parameters.required,
        groups: parameters.groups,
        materialChoices: templateMaterialChoiceSchemas(metadata, gltfMaterialSwatches(gltf)),
      })
    : undefined;
  return { metadata, schema };
};

export const loadTemplateMetadata = (
  client: TemplateClient,
  houseId: string,
  item: TemplateListItemValue,
  version: number,
): Promise<TemplateMetadata | undefined> => {
  const key =
    item.source === "builtin"
      ? `builtin:${item.id}@${String(version)}`
      : `house:${houseId}/${item.id}@${String(version)}`;
  let loaded = cache.get(key);
  if (loaded === undefined) {
    const url =
      item.source === "builtin"
        ? client.builtinUrl(item.id, version)
        : client.houseTemplateUrl(houseId, item.id, version);
    const promise = fetchTemplate(url, item).catch(() => undefined);
    cache.set(key, promise);
    // A failed or invalid load is retried on the next request instead of being remembered.
    void promise.then((result) => {
      if (result === undefined && cache.get(key) === promise) cache.delete(key);
    });
    loaded = promise;
  }
  return loaded.then((result) => {
    if (result === undefined) return undefined;
    if (result.schema !== undefined) registerInstanceSchema(houseId, item.id, version, result.schema);
    return result.metadata;
  });
};

export const latestVersion = (item: TemplateListItemValue): number => Math.max(...item.versions);
