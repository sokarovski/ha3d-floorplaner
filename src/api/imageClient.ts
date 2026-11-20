// House image library (spec/architecture/api.md#images).
import { ImageEntry, ImageListResponse } from "@shared/contracts/images";
import type { ImageEntryValue, TextureHintsValue } from "@shared/contracts/images";
import type { HttpClient } from "./httpClient";

export type ImageClient = ReturnType<typeof createImageClient>;

export const createImageClient = (http: HttpClient) => ({
  list: async (houseId: string, signal?: AbortSignal): Promise<readonly ImageEntryValue[]> =>
    (await http.request({ method: "GET", path: ["houses", houseId, "images"], signal }, ImageListResponse))
      .images,
  upload: async (houseId: string, file: File, name?: string): Promise<ImageEntryValue> => {
    const form = new FormData();
    if (name !== undefined && name.trim() !== "") form.append("name", name.trim());
    form.append("file", file, file.name);
    return http.request({ method: "POST", path: ["houses", houseId, "images"], form }, ImageEntry);
  },
  rename: async (houseId: string, imageId: string, name: string): Promise<ImageEntryValue> =>
    http.request(
      { method: "PATCH", path: ["houses", houseId, "images", imageId], body: { name } },
      ImageEntry,
    ),
  /** Sets an image's proposed material values (texture hints). */
  setTexture: async (
    houseId: string,
    imageId: string,
    texture: TextureHintsValue,
  ): Promise<ImageEntryValue> =>
    http.request(
      { method: "PATCH", path: ["houses", houseId, "images", imageId], body: { texture } },
      ImageEntry,
    ),
  remove: async (houseId: string, imageId: string): Promise<void> =>
    http.requestEmpty({ method: "DELETE", path: ["houses", houseId, "images", imageId] }),
  fileUrl: (houseId: string, imageId: string): string =>
    http.url(["houses", houseId, "images", imageId, "file"]),
  thumbnailUrl: (houseId: string, imageId: string): string =>
    http.url(["houses", houseId, "images", imageId, "thumbnail"]),
});
