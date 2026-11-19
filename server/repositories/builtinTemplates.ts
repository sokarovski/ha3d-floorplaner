// Read-only built-in templates shipped in server/builtin-templates/<templateId>/ (D07, D17):
// template.json (BuiltinTemplateManifest), v<N>.glb per version, and an optional thumbnail.
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BuiltinTemplateManifest, builtinTemplateIdPattern } from "../../shared/contracts/templates";
import type { BuiltinTemplateManifestValue } from "../../shared/contracts/templates";
import { compileValidator } from "../../shared/domain/validation/ajv";
import { parseJson } from "../lib/json";
import { isErrnoCode } from "../lib/json";
import { listChildDirectories, readTextIfExists } from "./files";

const validateManifest = compileValidator(BuiltinTemplateManifest);
const idPattern = new RegExp(builtinTemplateIdPattern);

export const defaultBuiltinTemplatesDir = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../builtin-templates",
);

export type BuiltinTemplateWarning = Readonly<{ templateId: string; message: string }>;

export class BuiltinTemplateRepository {
  constructor(private readonly root: string = defaultBuiltinTemplatesDir) {}

  /** Valid manifests sorted by label; invalid folders are skipped and reported. A missing root is empty. */
  async list(): Promise<{
    templates: readonly BuiltinTemplateManifestValue[];
    warnings: readonly BuiltinTemplateWarning[];
  }> {
    const templates: BuiltinTemplateManifestValue[] = [];
    const warnings: BuiltinTemplateWarning[] = [];
    for (const name of await listChildDirectories(this.root)) {
      if (!idPattern.test(name)) continue;
      const text = await readTextIfExists(join(this.root, name, "template.json"));
      if (text === undefined) {
        warnings.push({ templateId: name, message: "template.json is missing" });
        continue;
      }
      const parsed = parseJson(text);
      const value = parsed.ok ? parsed.value : undefined;
      if (!validateManifest(value) || value.id !== name) {
        warnings.push({ templateId: name, message: "template.json is invalid" });
        continue;
      }
      templates.push(value);
    }
    templates.sort((a, b) => a.label.localeCompare(b.label));
    return { templates, warnings };
  }

  async manifest(templateId: string): Promise<BuiltinTemplateManifestValue | undefined> {
    if (!idPattern.test(templateId)) return undefined;
    const text = await readTextIfExists(join(this.root, templateId, "template.json"));
    if (text === undefined) return undefined;
    const parsed = parseJson(text);
    const value = parsed.ok ? parsed.value : undefined;
    return validateManifest(value) && value.id === templateId ? value : undefined;
  }

  /** Bytes of a file inside a template folder. `fileName` must come from a validated manifest or `v<N>.glb`. */
  async readFile(templateId: string, fileName: string): Promise<Buffer | undefined> {
    try {
      return await readFile(join(this.root, templateId, fileName));
    } catch (error: unknown) {
      if (isErrnoCode(error, "ENOENT")) return undefined;
      throw error;
    }
  }
}
