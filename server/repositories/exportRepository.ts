// Saved exports: exports/<export-id>/{metadata.json, preview.png, final.png} (rendering-and-exports.md).
import { readFile, rm } from "node:fs/promises";
import { ExportEntry } from "../../shared/contracts/exports";
import type { ExportEntryValue, ExportFileName } from "../../shared/contracts/exports";
import { isId } from "../../shared/domain/ids";
import { compileValidator } from "../../shared/domain/validation/ajv";
import { isErrnoCode, parseJson, toJsonText } from "../lib/json";
import { atomicWriteFile } from "./atomic";
import { isDirectory, listChildDirectories, readTextIfExists } from "./files";
import type { StoragePaths } from "./paths";

const validateEntry = compileValidator(ExportEntry);

export class ExportRepository {
  constructor(private readonly paths: StoragePaths) {}

  async filePath(houseId: string, exportId: string, file: ExportFileName): Promise<string> {
    return this.paths.contained(this.paths.inside(this.paths.exportDir(houseId, exportId), file));
  }

  async readEntry(houseId: string, exportId: string): Promise<ExportEntryValue | undefined> {
    const text = await readTextIfExists(await this.filePath(houseId, exportId, "metadata.json"));
    if (text === undefined) return undefined;
    const parsed = parseJson(text);
    const value = parsed.ok ? parsed.value : undefined;
    return validateEntry(value) ? value : undefined;
  }

  async list(houseId: string): Promise<readonly ExportEntryValue[]> {
    const ids = (await listChildDirectories(this.paths.exportsDir(houseId))).filter(isId);
    const entries: ExportEntryValue[] = [];
    for (const id of ids) {
      const entry = await this.readEntry(houseId, id);
      if (entry !== undefined) entries.push(entry);
    }
    return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Writes the PNGs first and metadata.json last; metadata.json marks a complete export. */
  async write(
    houseId: string,
    entry: ExportEntryValue,
    images: ReadonlyMap<string, Uint8Array>,
  ): Promise<void> {
    const options = { parentsBelow: this.paths.houseDir(houseId) };
    for (const [name, data] of images) {
      await atomicWriteFile(
        await this.paths.contained(this.paths.inside(this.paths.exportDir(houseId, entry.id), name)),
        data,
        options,
      );
    }
    await atomicWriteFile(
      await this.filePath(houseId, entry.id, "metadata.json"),
      toJsonText(entry),
      options,
    );
  }

  async remove(houseId: string, exportId: string): Promise<boolean> {
    const directory = await this.paths.contained(this.paths.exportDir(houseId, exportId));
    if (!(await isDirectory(directory))) return false;
    await rm(directory, { recursive: true, force: true });
    return true;
  }

  async readFile(houseId: string, exportId: string, file: ExportFileName): Promise<Buffer | undefined> {
    try {
      return await readFile(await this.filePath(houseId, exportId, file));
    } catch (error: unknown) {
      if (isErrnoCode(error, "ENOENT")) return undefined;
      throw error;
    }
  }

  /** Removes export folders without a valid metadata.json (an interrupted save). */
  async removeIncomplete(houseId: string): Promise<readonly string[]> {
    const removed: string[] = [];
    for (const name of await listChildDirectories(this.paths.exportsDir(houseId))) {
      // Only export folders (named by ID) are checked; `renders/` holds render jobs.
      if (!isId(name) || (await this.readEntry(houseId, name)) !== undefined) continue;
      await rm(this.paths.inside(this.paths.exportsDir(houseId), name), { recursive: true, force: true });
      removed.push(`exports/${name}`);
    }
    return removed;
  }
}
