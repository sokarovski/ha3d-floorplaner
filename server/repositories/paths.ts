// The storage tree (spec/architecture/persistence.md#storage-ownership) and path containment checks.
import { realpath } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { isId } from "../../shared/domain/ids";
import { ApiError } from "../http/errors";
import { isErrnoCode } from "../lib/json";

const isInside = (root: string, path: string): boolean => path.startsWith(`${root}${sep}`);

/**
 * Resolves every path the server touches. `root` must already be a real (symlink-free) absolute path.
 * IDs are validated again here so no caller can turn an unchecked value into a path.
 */
export class StoragePaths {
  readonly root: string;
  readonly configDir: string;
  readonly preferencesFile: string;
  /** Written once the demo houses were seeded, or found unnecessary (persistence.md#demo-houses). */
  readonly demoSeededMarker: string;
  readonly trashDir: string;
  readonly dataDir: string;
  /** Frozen Home Assistant snapshot exports, transfers/<houseId>/<snapshotId>/ (api.md#phase-11). */
  readonly transfersDir: string;

  constructor(root: string) {
    this.root = root;
    this.configDir = resolve(root, "config");
    this.preferencesFile = resolve(this.configDir, "application-preferences.json");
    this.demoSeededMarker = resolve(this.configDir, "demo-seeded");
    this.trashDir = resolve(root, "trash");
    this.dataDir = resolve(root, "data");
    this.transfersDir = resolve(root, "transfers");
  }

  /** Lexically resolves `segments` under `base` and refuses anything that escapes it. */
  inside(base: string, ...segments: readonly string[]): string {
    const path = resolve(base, ...segments);
    if (!isInside(base, path)) throw new ApiError("badRequest", "The path is outside the storage root.");
    return path;
  }

  houseDir(houseId: string): string {
    return this.inside(this.dataDir, checkedId(houseId));
  }

  trashedHouseDir(houseId: string): string {
    return this.inside(this.trashDir, checkedId(houseId));
  }

  houseTransfersDir(houseId: string): string {
    return this.inside(this.transfersDir, checkedId(houseId));
  }

  houseFile(houseId: string): string {
    return this.inside(this.houseDir(houseId), "house.json");
  }

  texturesDir(houseId: string): string {
    return this.inside(this.houseDir(houseId), "textures");
  }

  imageIndexFile(houseId: string): string {
    return this.inside(this.texturesDir(houseId), "images.json");
  }

  exportsDir(houseId: string): string {
    return this.inside(this.houseDir(houseId), "exports");
  }

  exportDir(houseId: string, exportId: string): string {
    return this.inside(this.exportsDir(houseId), checkedId(exportId));
  }

  templatesDir(houseId: string): string {
    return this.inside(this.houseDir(houseId), "assets", "templates");
  }

  templateDir(houseId: string, templateId: string): string {
    return this.inside(this.templatesDir(houseId), checkedId(templateId));
  }

  rendersDir(houseId: string): string {
    return this.inside(this.exportsDir(houseId), "renders");
  }

  renderJobDir(houseId: string, jobId: string): string {
    return this.inside(this.rendersDir(houseId), checkedId(jobId));
  }

  /**
   * Resolves symlinks of `path` (or of its nearest existing ancestor) and verifies the real location
   * is still under the storage root. Returns `path` unchanged when it is contained.
   */
  async contained(path: string): Promise<string> {
    let probe = path;
    for (;;) {
      try {
        const real = await realpath(probe);
        if (real !== this.root && !isInside(this.root, real)) {
          throw new ApiError("badRequest", "The path resolves outside the storage root.");
        }
        return path;
      } catch (error: unknown) {
        if (!isErrnoCode(error, "ENOENT")) throw error;
        const parent = dirname(probe);
        if (parent === probe) return path;
        probe = parent;
      }
    }
  }
}

const checkedId = (id: string): string => {
  if (!isId(id)) throw new ApiError("badRequest", `"${id}" is not a valid ID.`);
  return id;
};
