// Template picker list and built-in template files (spec/builder/features/object-templates.md).
import type { TemplateListItemValue } from "../../shared/contracts/templates";
import { ApiError } from "../http/errors";
import type { ServiceContext } from "./context";
import { listHouseTemplates } from "./houseTemplateService";
import { requireHouse } from "./houseService";

/** Relative to the page's <base href> (base path or ingress prefix), so it works under any prefix. */
export const builtinThumbnailUrl = (templateId: string): string =>
  `api/templates/builtin/${templateId}/thumbnail`;

/** Built-ins, then house templates with at least one saved version. */
export const listTemplates = async (
  context: ServiceContext,
  houseId: string,
): Promise<TemplateListItemValue[]> => {
  await requireHouse(context, houseId);
  const { templates, warnings } = await context.builtinTemplates.list();
  for (const warning of warnings) context.log.warn(warning, "Skipping invalid built-in template");
  const builtins: TemplateListItemValue[] = templates.map((manifest) => ({
    id: manifest.id,
    label: manifest.label,
    kind: manifest.kind,
    contract: manifest.contract,
    versions: [...manifest.versions].sort((a, b) => a - b),
    source: "builtin",
    thumbnailUrl: manifest.thumbnail === undefined ? null : builtinThumbnailUrl(manifest.id),
    ...(manifest.category === undefined ? {} : { category: manifest.category }),
    ...(manifest.tags === undefined ? {} : { tags: [...manifest.tags] }),
    ...(manifest.product === undefined ? {} : { product: { ...manifest.product } }),
  }));
  return [...builtins, ...(await listHouseTemplates(context, houseId))];
};

export const readBuiltinVersion = async (
  context: ServiceContext,
  templateId: string,
  version: number,
): Promise<Buffer> => {
  const manifest = await context.builtinTemplates.manifest(templateId);
  if (manifest?.versions.includes(version) !== true)
    throw new ApiError("notFound", `Built-in template ${templateId} v${version} does not exist.`);
  const bytes = await context.builtinTemplates.readFile(templateId, `v${version}.glb`);
  if (bytes === undefined)
    throw new ApiError("notFound", `Built-in template ${templateId} v${version} has no file.`);
  return bytes;
};

const thumbnailTypes: Readonly<Record<string, string>> = {
  svg: "image/svg+xml",
  png: "image/png",
  webp: "image/webp",
};

export const readBuiltinThumbnail = async (
  context: ServiceContext,
  templateId: string,
): Promise<{ bytes: Buffer; mediaType: string }> => {
  const manifest = await context.builtinTemplates.manifest(templateId);
  const fileName = manifest?.thumbnail;
  if (fileName === undefined)
    throw new ApiError("notFound", `Built-in template ${templateId} has no thumbnail.`);
  const mediaType = thumbnailTypes[fileName.slice(fileName.lastIndexOf(".") + 1)];
  const bytes = await context.builtinTemplates.readFile(templateId, fileName);
  if (bytes === undefined || mediaType === undefined)
    throw new ApiError("notFound", `Built-in template ${templateId} has no thumbnail.`);
  return { bytes, mediaType };
};
