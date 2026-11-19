// Saved PNG exports (spec/architecture/api.md#exports-and-renders).
import { ExportEntry, ExportListResponse } from "@shared/contracts/exports";
import type { ExportEntryValue, ExportMetadataInputValue } from "@shared/contracts/exports";
import type { HttpClient } from "./httpClient";

export type ExportClient = ReturnType<typeof createExportClient>;

export const createExportClient = (http: HttpClient) => ({
  save: async (
    houseId: string,
    preview: Blob,
    final: Blob,
    metadata: ExportMetadataInputValue,
  ): Promise<ExportEntryValue> => {
    const form = new FormData();
    form.append("metadata", JSON.stringify(metadata));
    form.append("preview", preview, "preview.png");
    form.append("final", final, "final.png");
    return http.request({ method: "POST", path: ["houses", houseId, "exports"], form }, ExportEntry);
  },
  list: async (houseId: string, signal?: AbortSignal): Promise<readonly ExportEntryValue[]> =>
    (await http.request({ method: "GET", path: ["houses", houseId, "exports"], signal }, ExportListResponse))
      .exports,
  fileUrl: (houseId: string, exportId: string, file: "preview.png" | "final.png" | "metadata.json"): string =>
    http.url(["houses", houseId, "exports", exportId, file]),
});
