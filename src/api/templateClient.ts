// Template list and built-in GLB URLs (spec/architecture/api.md#templates).
import {
  SaveTemplateVersionResponse,
  TemplateDraftResponse,
  TemplateListResponse,
} from "@shared/contracts/templates";
import type {
  SaveTemplateVersionBodyValue,
  TemplateDraftResponseValue,
  TemplateImportOptionsValue,
} from "@shared/contracts/templates";
import type { TemplateListItemValue } from "@shared/contracts/templates";
import type { HttpClient } from "./httpClient";

export type TemplateClient = ReturnType<typeof createTemplateClient>;

export const createTemplateClient = (http: HttpClient) => ({
  list: async (houseId: string, signal?: AbortSignal): Promise<readonly TemplateListItemValue[]> =>
    (
      await http.request(
        { method: "GET", path: ["houses", houseId, "templates"], signal },
        TemplateListResponse,
      )
    ).templates,
  builtinUrl: (templateId: string, version: number): string =>
    http.url(["templates", "builtin", templateId, "v", String(version)]),
  importModel: async (
    houseId: string,
    file: File,
    options: TemplateImportOptionsValue,
  ): Promise<TemplateDraftResponseValue> => {
    const form = new FormData();
    const fields: readonly (readonly [string, string | number | undefined])[] = [
      ["format", options.format],
      ["unit", options.unit],
      ["knownDimensionMm", options.knownDimensionMm],
      ["knownAxis", options.knownAxis],
      ["upAxis", options.upAxis],
      ["frontAxis", options.frontAxis],
    ];
    for (const [key, value] of fields) if (value !== undefined) form.append(key, String(value));
    form.append("file", file, file.name);
    return http.request(
      { method: "POST", path: ["houses", houseId, "templates"], form },
      TemplateDraftResponse,
    );
  },
  draft: async (
    houseId: string,
    templateId: string,
    signal?: AbortSignal,
  ): Promise<TemplateDraftResponseValue> =>
    http.request(
      { method: "GET", path: ["houses", houseId, "templates", templateId, "draft"], signal },
      TemplateDraftResponse,
    ),
  saveVersion: async (
    houseId: string,
    templateId: string,
    body: SaveTemplateVersionBodyValue,
  ): Promise<number> =>
    (
      await http.request(
        { method: "POST", path: ["houses", houseId, "templates", templateId, "versions"], body },
        SaveTemplateVersionResponse,
      )
    ).version,
  remove: async (houseId: string, templateId: string): Promise<void> =>
    http.requestEmpty({ method: "DELETE", path: ["houses", houseId, "templates", templateId] }),
  sourceUrl: (houseId: string, templateId: string): string =>
    http.url(["houses", houseId, "templates", templateId, "source"]),
  /** The draft's base glTF (no HomeplanRoot wrapper; apply the draft's rootMatrix). */
  baseUrl: (houseId: string, templateId: string): string =>
    http.url(["houses", houseId, "templates", templateId, "base"]),
  houseTemplateUrl: (houseId: string, templateId: string, version: number): string =>
    http.url(["houses", houseId, "templates", templateId, "v", String(version)]),
});
