// Built-in texture images (Phase 17.1, shared/domain/house/builtinMaterials.ts): generates every built-in
// texture (scripts/materials/textures.ts) and writes server/builtin-materials/<imageId>.png plus its 256 px WebP
// thumbnail <imageId>.thumb.webp. The output is deterministic; files no longer in the catalog are removed.
// Run: npm run materials:build
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { builtInImages } from "../shared/domain/house/builtinMaterials";
import { defaultBuiltinMaterialsDir } from "../server/repositories/builtinImages";
import { thumbnailSizePx } from "../server/services/imageService";
import { texturePng, unpaintedImageIds } from "./materials/textures";

const missing = unpaintedImageIds();
if (missing.length > 0) throw new Error(`No painter for ${missing.join(", ")}`);

await mkdir(defaultBuiltinMaterialsDir, { recursive: true });
const written = new Set<string>();
for (const image of builtInImages) {
  const png = texturePng(image.id);
  const metadata = await sharp(png).metadata();
  if (metadata.width !== image.widthPx || metadata.height !== image.heightPx)
    throw new Error(
      `${image.id}: ${String(metadata.width)} × ${String(metadata.height)} px, catalog differs`,
    );
  const thumbnail = await sharp(png)
    .resize(thumbnailSizePx, thumbnailSizePx, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const thumbnailName = `${image.id}.thumb.webp`;
  await writeFile(join(defaultBuiltinMaterialsDir, image.file), png);
  await writeFile(join(defaultBuiltinMaterialsDir, thumbnailName), thumbnail);
  written.add(image.file);
  written.add(thumbnailName);
  console.log(
    `OK   ${image.id.padEnd(24)} ${String(png.byteLength).padStart(7)} B  “${image.presetName}”, ${String(image.tileSizeMm)} mm`,
  );
}
for (const name of await readdir(defaultBuiltinMaterialsDir)) {
  if (written.has(name)) continue;
  await rm(join(defaultBuiltinMaterialsDir, name));
  console.log(`removed ${name}`);
}
console.log(`Built-in materials: ${builtInImages.length} textures written to ${defaultBuiltinMaterialsDir}`);
