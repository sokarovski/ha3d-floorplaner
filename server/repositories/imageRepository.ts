// The server-owned image index textures/images.json and the image files beside it (D14).
import { readdir, rm } from "node:fs/promises";
import { ImageIndexDocument } from "../../shared/contracts/images";
import type { ImageIndexDocumentValue } from "../../shared/contracts/images";
import { compileValidator } from "../../shared/domain/validation/ajv";
import { ApiError } from "../http/errors";
import { isErrnoCode, parseJson, toJsonText } from "../lib/json";
import { atomicWriteFile } from "./atomic";
import { readTextIfExists } from "./files";
import type { StoragePaths } from "./paths";

const validateIndex = compileValidator(ImageIndexDocument);

const imageFilePattern = /^(img_[a-z0-9]{6,})(?:\.(?:jpg|png|webp)|\.thumb\.webp)$/;

export class ImageRepository {
  constructor(private readonly paths: StoragePaths) {}

  /** The index; an absent file is an empty library. A corrupt index is reported, never replaced. */
  async readIndex(houseId: string): Promise<ImageIndexDocumentValue> {
    const text = await readTextIfExists(await this.paths.contained(this.paths.imageIndexFile(houseId)));
    if (text === undefined) return { schemaVersion: 1, images: [] };
    return this.decode(text);
  }

  decode(text: string): ImageIndexDocumentValue {
    const parsed = parseJson(text);
    const value = parsed.ok ? parsed.value : undefined;
    if (!validateIndex(value)) throw new ApiError("invalidDocument", "textures/images.json is corrupt.");
    return value;
  }

  async writeIndex(houseId: string, index: ImageIndexDocumentValue): Promise<void> {
    await atomicWriteFile(await this.paths.contained(this.paths.imageIndexFile(houseId)), toJsonText(index), {
      parentsBelow: this.paths.houseDir(houseId),
    });
  }

  /** Absolute path of a house-relative asset path from the index (`textures/<file>`), contained. */
  async assetPath(houseId: string, relativePath: string): Promise<string> {
    return this.paths.contained(this.paths.inside(this.paths.houseDir(houseId), relativePath));
  }

  async writeAsset(houseId: string, relativePath: string, data: Uint8Array): Promise<void> {
    await atomicWriteFile(await this.assetPath(houseId, relativePath), data, {
      parentsBelow: this.paths.houseDir(houseId),
    });
  }

  async removeAsset(houseId: string, relativePath: string): Promise<void> {
    await rm(await this.assetPath(houseId, relativePath), { force: true });
  }

  /** Removes image files and thumbnails without an index entry (left by a crash). Skips corrupt indexes. */
  async removeOrphans(houseId: string): Promise<readonly string[]> {
    let index: ImageIndexDocumentValue;
    try {
      index = await this.readIndex(houseId);
    } catch (error: unknown) {
      if (error instanceof ApiError) return [];
      throw error;
    }
    const known = new Set<string>();
    for (const entry of index.images) {
      known.add(entry.file);
      known.add(entry.thumbnail);
    }
    const directory = await this.paths.contained(this.paths.texturesDir(houseId));
    let names: readonly string[];
    try {
      names = await readdir(directory);
    } catch (error: unknown) {
      if (isErrnoCode(error, "ENOENT")) return [];
      throw error;
    }
    const removed: string[] = [];
    for (const name of names) {
      if (!imageFilePattern.test(name) || known.has(`textures/${name}`)) continue;
      await rm(this.paths.inside(directory, name), { force: true });
      removed.push(`textures/${name}`);
    }
    return removed;
  }
}
