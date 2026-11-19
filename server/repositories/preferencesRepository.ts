// The global preferences document config/application-preferences.json (D12).
import type { StoragePaths } from "./paths";
import { atomicWriteFile } from "./atomic";
import { readTextIfExists } from "./files";
import { toJsonText } from "../lib/json";

export class PreferencesRepository {
  constructor(private readonly paths: StoragePaths) {}

  read(): Promise<string | undefined> {
    return readTextIfExists(this.paths.preferencesFile);
  }

  write(document: unknown): Promise<void> {
    return atomicWriteFile(this.paths.preferencesFile, toJsonText(document));
  }
}
