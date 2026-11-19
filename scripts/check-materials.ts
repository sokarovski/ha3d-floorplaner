// Built-in textured materials (Phase 17.1): the catalog and presets are valid, every built-in texture is
// generated and served for any house (file and thumbnail, cached by ETag), a house snapshot freezes a used
// built-in texture beside its own uploads, and built-ins are never listed, renamed or deleted as house images.
// Uses a temporary storage root under dist/; never reads or writes installation houses.
// Run: npm run materials:check (after npm run materials:build)
import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import Fastify from "fastify";
import sharp from "sharp";
import { SnapshotManifest } from "../shared/contracts/homeplanIntegration";
import { builtInImages, isBuiltInImageId } from "../shared/domain/house/builtinMaterials";
import { builtInPresets, createArea, createHouseDocument } from "../shared/domain/house/defaults";
import { createId } from "../shared/domain/ids";
import { House, MaterialPreset } from "../shared/domain/schemas/house";
import { idPattern } from "../shared/domain/schemas/values";
import { compileValidator } from "../shared/domain/validation/ajv";
import { registerErrorHandling } from "../server/http/errors";
import { registerSchemaCompilers } from "../server/http/schemaCompilers";
import { defaultBuiltinMaterialsDir } from "../server/repositories/builtinImages";
import { StoragePaths } from "../server/repositories/paths";
import { imageRoutes } from "../server/routes/images";
import { createServiceContext } from "../server/services/context";
import { createHouse } from "../server/services/houseService";
import { uploadImage } from "../server/services/imageService";
import { createRevision } from "../server/services/revisionService";
import { readArtifactFile } from "../server/snapshots/artifacts";
import { createSnapshot, snapshotRoot } from "../server/snapshots/houseSnapshots";
import { texturePng } from "./materials/textures";

let checks = 0;
const check = (condition: unknown, label: string): void => {
  assert.ok(condition, label);
  checks += 1;
};

// ---- catalog and presets --------------------------------------------------------------------------

const validatePreset = compileValidator(MaterialPreset);
const ids = new RegExp(idPattern);
check(new Set(builtInImages.map((image) => image.id)).size === builtInImages.length, "unique image IDs");
check(new Set(builtInPresets.map((preset) => preset.id)).size === builtInPresets.length, "unique preset IDs");
check(new Set(builtInPresets.map((preset) => preset.name)).size === builtInPresets.length, "unique names");
for (const preset of builtInPresets) {
  check(validatePreset(preset), `${preset.id}: valid MaterialPreset`);
  check(preset.id.startsWith("builtin_"), `${preset.id}: reserved preset prefix`);
}
for (const image of builtInImages) {
  check(ids.test(image.id) && isBuiltInImageId(image.id), `${image.id}: matches the ID pattern, reserved`);
  const preset = builtInPresets.find((candidate) => candidate.id === image.presetId);
  check(
    preset?.material.pbrMetallicRoughness.baseColorTexture?.imageId === image.id,
    `${image.id}: its preset references it`,
  );
  const bytes = await readFile(join(defaultBuiltinMaterialsDir, image.file));
  check(bytes.equals(texturePng(image.id)), `${image.id}: generated file is current (run materials:build)`);
  const metadata = await sharp(bytes).metadata();
  check(metadata.width === image.widthPx && metadata.height === image.heightPx, `${image.id}: catalog size`);
}

// Roof coverings (Phase 19.1): terracotta and slate tiles, and the light-metal aluminium (metallic, standing seams).
const aluminium = builtInPresets.find((preset) => preset.name === "Aluminium roofing");
check(
  aluminium?.id === "builtin_aluminium" &&
    aluminium.material.pbrMetallicRoughness.baseColorTexture?.imageId === "builtinimg_aluminium" &&
    aluminium.material.pbrMetallicRoughness.metallicFactor > 0,
  "Aluminium roofing: a metallic built-in preset with its texture",
);
for (const name of ["Terracotta tiles", "Slate tiles"])
  check(
    builtInPresets.some((preset) => preset.name === name),
    `${name}: a built-in roof covering`,
  );

// ---- served for any house; read-only -------------------------------------------------------------

const output = resolve("dist/materials-check");
await rm(output, { recursive: true, force: true });
const storage = join(output, "storage");
await mkdir(join(storage, "data"), { recursive: true });
const app = Fastify({ logger: false });
const context = createServiceContext(new StoragePaths(storage), "/", app.log);
registerSchemaCompilers(app);
registerErrorHandling(app, { apiPrefix: "/api", spa: null });
await app.register(imageRoutes, { context, prefix: "/api" });

try {
  const card = await createHouse(context, "Built-in materials fixture");
  const oak = builtInImages[0];
  assert.ok(oak);
  for (const image of builtInImages) {
    const file = await app.inject({ method: "GET", url: `/api/houses/${card.id}/images/${image.id}/file` });
    check(
      file.statusCode === 200 && file.headers["content-type"] === "image/png",
      `${image.id}: file served`,
    );
    const etag = file.headers.etag;
    check(typeof etag === "string" && file.headers["cache-control"] === "no-cache", `${image.id}: ETag`);
    const again = await app.inject({
      method: "GET",
      url: `/api/houses/${card.id}/images/${image.id}/file`,
      headers: { "if-none-match": typeof etag === "string" ? etag : "" },
    });
    check(again.statusCode === 304, `${image.id}: revalidates (304)`);
    const thumb = await app.inject({
      method: "GET",
      url: `/api/houses/${card.id}/images/${image.id}/thumbnail`,
    });
    check(
      thumb.statusCode === 200 && thumb.headers["content-type"] === "image/webp",
      `${image.id}: thumbnail`,
    );
  }
  const unknown = await app.inject({
    method: "GET",
    url: `/api/houses/${card.id}/images/builtinimg_nosuchtexture/file`,
  });
  check(unknown.statusCode === 404, "unknown built-in ID is 404");
  const noHouse = await app.inject({ method: "GET", url: `/api/houses/h_nosuchhouse/images/${oak.id}/file` });
  check(noHouse.statusCode === 404, "built-ins need an existing house");
  const removed = await app.inject({ method: "DELETE", url: `/api/houses/${card.id}/images/${oak.id}` });
  check(removed.statusCode === 400, "delete refuses a built-in");
  const renamed = await app.inject({
    method: "PATCH",
    url: `/api/houses/${card.id}/images/${oak.id}`,
    payload: { name: "Mine" },
  });
  check(renamed.statusCode === 400, "rename refuses a built-in");
  check(
    (await readFile(join(defaultBuiltinMaterialsDir, oak.file))).byteLength > 0,
    "built-in file still present after refused delete",
  );

  // ---- a house using a built-in preset and an upload: snapshot carries both ------------------------

  const upload = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 200, g: 180, b: 160 } },
  })
    .png()
    .toBuffer();
  const ownId = (await uploadImage(context, card.id, { bytes: upload, filename: "own.png", name: undefined }))
    .id;
  const listed = await app.inject({ method: "GET", url: `/api/houses/${card.id}/images` });
  const listing = listed.json<{ images: readonly { id: string }[] }>().images;
  check(
    listing.length === 1 && listing.every((entry) => !isBuiltInImageId(entry.id)),
    "the house list holds only uploads",
  );

  const document = createHouseDocument(card.id, "Built-in materials fixture");
  const floor = document.floors[0];
  assert.ok(floor);
  const area = createArea("Kitchen", { x: 0, y: 0 });
  area.floor.shapes.push({
    id: createId("s"),
    type: "rectangle",
    positionMm: { x: 0, y: 0 },
    rotationDeg: 0,
    widthMm: 4000,
    heightMm: 3000,
  });
  const granite = builtInPresets.find((preset) => preset.id === "builtin_granite");
  assert.ok(granite);
  area.floor.material = structuredClone(granite.material);
  const hall = createArea("Hall", { x: 5000, y: 0 });
  hall.floor.shapes.push({
    id: createId("s"),
    type: "rectangle",
    positionMm: { x: 0, y: 0 },
    rotationDeg: 0,
    widthMm: 2000,
    heightMm: 3000,
  });
  hall.floor.material.pbrMetallicRoughness.baseColorTexture = { imageId: ownId };
  floor.areas.push(hall);
  floor.areas.push(area);
  check(compileValidator(House)(document), "a house referencing a built-in texture is valid");
  await context.houses.write(card.id, document);
  await createRevision(context, card.id, "Built-in materials fixture");
  const manifest = await createSnapshot(context, card.id);
  check(compileValidator(SnapshotManifest)(manifest), "snapshot manifest valid");
  const graniteImage = builtInImages.find((image) => image.id === "builtinimg_granite");
  assert.ok(graniteImage);
  const resource = manifest.resources.images.find((item) => item.id === graniteImage.id);
  check(resource?.path === `images/${graniteImage.id}/${graniteImage.file}`, "snapshot lists the built-in");
  check(
    manifest.resources.images.some((item) => item.id === ownId),
    "snapshot lists the upload",
  );
  check(manifest.resources.images.length === 2, "only used images are frozen");
  const frozen = await readArtifactFile(
    join(snapshotRoot(context, card.id), manifest.snapshotId),
    resource?.path ?? "",
  );
  check(
    Buffer.from(frozen).equals(await readFile(join(defaultBuiltinMaterialsDir, graniteImage.file))),
    "snapshot carries the built-in bytes",
  );
  check(
    manifest.files.some((file) => file.path === resource?.path && file.mediaType === "image/png"),
    "snapshot file entry is a PNG",
  );
  const referenced = await app.inject({ method: "DELETE", url: `/api/houses/${card.id}/images/${ownId}` });
  check(referenced.statusCode === 409, "a used house upload still refuses delete");
} finally {
  await app.close();
}
console.log(`Built-in materials: ${String(checks)} checks passed`);
