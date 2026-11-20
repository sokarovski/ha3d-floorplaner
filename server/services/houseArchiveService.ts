// House archives (Phase 21): a house archive (.zip) is a house snapshot as Home Assistant stores it, its manifest and
// files (manifest.json, house.json, bindings.json, templates/, images/), so the archive Home Assistant's Settings →
// Houses downloads uploads here as a new house. Every file is checked against the manifest (size and SHA-256) and
// unlisted files are refused, before anything is written. The house gets a new ID; a name already in use is refused
// with a suggested free name, which the client offers to keep or change. Its own images keep their IDs, its own
// templates (t_…) are restored as saved versions (they render; without their source draft they are not listed in
// the Object Editor), and built-in templates and textures come from the app. Home Assistant bindings stay with Home
// Assistant.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, posix } from "node:path";
import { unzipSync } from "fflate";
import type { ValidHouseCardValue } from "../../shared/contracts/houses";
import { SnapshotManifest } from "../../shared/contracts/homeplanIntegration";
import { isBuiltInImageId } from "../../shared/domain/house/builtinMaterials";
import { compileValidator } from "../../shared/domain/validation/ajv";
import { safeArtifactPath } from "../../shared/domain/validation/artifact";
import { ApiError } from "../http/errors";
import { decodeHouseText } from "../repositories/houseRepository";
import type { ServiceContext } from "./context";
import { checkedName, createHouseFromArchive, listHouses } from "./houseService";
import { importArchiveImage } from "./imageService";

/** Limits (as the snapshot export's): files, bytes per file, bytes in all. */
const maxFiles = 10001;
const maxFileBytes = 134217728;
const maxTotalBytes = 1073741824;

const validManifest = compileValidator(SnapshotManifest);
const decoder = new TextDecoder();

const invalid = (message: string): ApiError => new ApiError("invalidDocument", message);

/** The archive's files by path, within the limits; unsafe paths are refused. */
const unpack = (bytes: Uint8Array): Map<string, Uint8Array> => {
  let count = 0;
  let total = 0;
  let unpacked: Record<string, Uint8Array>;
  try {
    unpacked = unzipSync(bytes, {
      filter: (file) => {
        count += 1;
        total += file.originalSize;
        if (count > maxFiles || file.originalSize > maxFileBytes || total > maxTotalBytes)
          throw new ApiError("tooLarge", "The house archive exceeds the transfer limits.");
        return !file.name.endsWith("/");
      },
    });
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    throw invalid("This is not a house archive (.zip).");
  }
  const files = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(unpacked)) {
    if (path !== "manifest.json" && !safeArtifactPath(path))
      throw invalid("The house archive has a file outside it.");
    files.set(path, data);
  }
  return files;
};

/** A free name: the name with the next " (2)", " (3)", … suffix not in use. */
const freeName = (name: string, taken: ReadonlySet<string>): string => {
  const base = name.replace(/\s\(\d+\)$/, "");
  for (let index = 2; ; index += 1) {
    const candidate = `${base} (${String(index)})`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
};

/**
 * Creates a house from a house archive. Without `rawName` the archive's house name is used, and a name in use is
 * refused (409 `nameTaken`, `details.suggestion`: a free name with a suffix).
 */
export const importHouseArchive = async (
  context: ServiceContext,
  bytes: Uint8Array,
  rawName: string | undefined,
): Promise<ValidHouseCardValue> => {
  const files = unpack(bytes);
  const manifestBytes = files.get("manifest.json");
  if (manifestBytes === undefined) throw invalid("The house archive has no manifest.");
  let manifest: unknown;
  try {
    manifest = JSON.parse(decoder.decode(manifestBytes));
  } catch {
    throw invalid("The house archive's manifest is not valid JSON.");
  }
  if (!validManifest(manifest)) throw invalid("This is not a Homeplan house archive.");
  const listed = new Set<string>();
  for (const entry of manifest.files) {
    const data = files.get(entry.path);
    if (
      data?.byteLength !== entry.byteSize ||
      createHash("sha256").update(data).digest("hex") !== entry.sha256
    )
      throw invalid(`The house archive's ${entry.path} is missing or changed.`);
    listed.add(entry.path);
  }
  for (const path of files.keys())
    if (path !== "manifest.json" && !listed.has(path))
      throw invalid(`The house archive has a file its manifest does not list (${path}).`);
  const houseBytes = files.get("house.json");
  if (houseBytes === undefined) throw invalid("The house archive has no house.json.");
  const decoded = decodeHouseText(decoder.decode(houseBytes), manifest.houseId);
  if (decoded.kind !== "ok") throw new ApiError(decoded.code, decoded.message);
  const document = decoded.document;
  const name = checkedName(rawName ?? document.name, "/body/name");
  if (rawName === undefined) {
    const taken = new Set(
      (await listHouses(context)).flatMap((house) =>
        house.status === "ok" ? [house.name.toLocaleLowerCase()] : [],
      ),
    );
    if (taken.has(name.toLocaleLowerCase()))
      throw new ApiError("nameTaken", `A house named “${name}” already exists.`, {
        suggestion: freeName(name, taken),
      });
  }
  const read = (path: string): Uint8Array => {
    const data = files.get(path);
    if (data === undefined) throw invalid(`The house archive's ${path} is missing.`);
    return data;
  };
  return createHouseFromArchive(context, document, name, `Uploaded from a house archive`, async (houseId) => {
    for (const image of manifest.resources.images) {
      if (isBuiltInImageId(image.id)) continue;
      await importArchiveImage(
        context,
        houseId,
        image.id,
        Buffer.from(read(image.path)),
        posix.basename(image.path),
      );
    }
    for (const template of manifest.resources.templates) {
      if (!template.id.startsWith("t_")) continue;
      const directory = await context.paths.contained(context.paths.templateDir(houseId, template.id));
      const base = `templates/${template.id}/${String(template.version)}/`;
      const write = async (relative: string, data: Uint8Array): Promise<void> => {
        if (!safeArtifactPath(relative)) throw invalid("A template file path is invalid.");
        const target = await context.paths.contained(context.paths.inside(directory, relative));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, data);
      };
      await write(`v${String(template.version)}.gltf`, read(template.path));
      for (const dependency of template.dependencies) {
        if (!dependency.startsWith(base)) throw invalid("A template file is outside its template.");
        await write(dependency.slice(base.length), read(dependency));
      }
    }
  });
};
