// Real temporary Git/source routes and portable fixture output. Never reads/writes installation houses.
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import Fastify from "fastify";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { createId } from "../shared/domain/ids";
import { createArea, createFloor, createHouseDocument } from "../shared/domain/house/defaults";
import { compileValidator } from "../shared/domain/validation/ajv";
import { House } from "../shared/domain/schemas/house";
import type { AreableInstanceValue } from "../shared/domain/schemas/instances";
import { createServiceContext } from "../server/services/context";
import { StoragePaths } from "../server/repositories/paths";
import { createHouse } from "../server/services/houseService";
import { createRevision } from "../server/services/revisionService";
import { patchPreferences } from "../server/services/preferencesService";
import { createSnapshot, readSnapshotSource, snapshotRoot } from "../server/snapshots/houseSnapshots";
import { fileEntry, identity, readArtifactFile, storeArtifact } from "../server/snapshots/artifacts";
import { StoredHouse } from "../shared/domain/schemas/storedHouse";
import { currentHouseEnvelope } from "../ha-viewer/houseSource";
import { floorCutsOf } from "../shared/geometry/floorCuts";
import { buildFloorSlab } from "../shared/geometry/floorSlab";
import { roofCutPlane } from "../shared/domain/house/migrateV5RoofCuts";
import { evaluateLinear, floorRoofLimit, roofUndersideAt } from "../shared/geometry/roofLimit";
import { registerSchemaCompilers } from "../server/http/schemaCompilers";
import { registerErrorHandling } from "../server/http/errors";
import { snapshotRoutes } from "../server/routes/snapshots";

const output = resolve("dist/ha-check-fixtures");
await rm(output, { recursive: true, force: true });
const storage = join(output, "storage");
await mkdir(join(storage, "data"), { recursive: true });
// The server creates config/ at startup (services/startup.ts); this check builds the context directly.
await mkdir(join(storage, "config"), { recursive: true });
const app = Fastify({ logger: false });
const context = createServiceContext(new StoragePaths(storage), "/", app.log);
registerSchemaCompilers(app);
registerErrorHandling(app, { apiPrefix: "/api", spa: null });
await app.register(snapshotRoutes, { context, prefix: "/api" });
let checks = 0;
const check = (condition: unknown, label: string): void => {
  assert.ok(condition, label);
  checks += 1;
};
try {
  const card = await createHouse(context, "HA integration fixture");
  const document = createHouseDocument(card.id, "Saved A");
  const floor = document.floors[0];
  assert.ok(floor);
  const area = createArea("Fixture room", { x: 0, y: 0 });
  area.floor.shapes.push({
    id: createId("s"),
    type: "rectangle",
    positionMm: { x: 0, y: 0 },
    rotationDeg: 0,
    widthMm: 5000,
    heightMm: 4000,
  });
  const imageId = createId("img");
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 180, g: 200, b: 220 } },
  })
    .png()
    .toBuffer();
  area.floor.material.pbrMetallicRoughness = {
    ...area.floor.material.pbrMetallicRoughness,
    baseColorTexture: { imageId },
  };
  const instance = (templateId: string): AreableInstanceValue => ({
    id: createId("o"),
    name: templateId,
    templateId,
    templateVersion: 1,
    parameters: {},
    flip: { x: false, z: false },
    materialOverrides: {},
    attachment: { host: "floor" },
    positionMm: { x: 0, y: 0 },
    elevationMm: 0,
    rotationDeg: 0,
  });
  const builtin = instance("dining-table");
  area.objects.push(builtin);
  const templateId = createId("t");
  area.objects.push(instance(templateId));
  floor.areas.push(area);
  const hiddenFloor = createFloor("Hidden dependency floor");
  const hiddenArea = createArea("Hidden fixture", { x: 0, y: 0 });
  hiddenArea.hidden = true;
  hiddenArea.objects.push(instance("folding-chair"));
  hiddenFloor.areas.push(hiddenArea);
  document.floors.push(hiddenFloor);
  check(compileValidator(House)(document), "fixture is a real validated house");
  const original = await context.builtinTemplates.readFile("dining-table", "v1.glb");
  assert.ok(original);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const gltf = await io.readBinary(original);
  const texture = gltf.createTexture("Fixture texture").setImage(png).setMimeType("image/png");
  gltf.getRoot().listMaterials()[0]?.setBaseColorTexture(texture);
  const json = await io.writeJSON(gltf);
  const templateDir = join(context.paths.houseDir(card.id), "assets/templates", templateId);
  await mkdir(join(templateDir, "textures"), { recursive: true });
  for (const buffer of json.json.buffers ?? []) {
    const bytes = json.resources[buffer.uri ?? ""];
    assert.ok(bytes);
    buffer.uri = "geometry.bin";
    await writeFile(join(templateDir, "geometry.bin"), bytes);
  }
  for (const [index, image] of (json.json.images ?? []).entries()) {
    const bytes = json.resources[image.uri ?? ""];
    assert.ok(bytes);
    image.uri = `textures/${String(index)}.png`;
    await writeFile(join(templateDir, image.uri), bytes);
  }
  await writeFile(join(templateDir, "v1.gltf"), JSON.stringify(json.json));
  await context.images.writeAsset(card.id, `textures/${imageId}.png`, png);
  await context.images.writeAsset(card.id, `textures/${imageId}.thumb.webp`, png);
  await context.images.writeIndex(card.id, {
    schemaVersion: 1,
    images: [
      {
        id: imageId,
        name: "Fixture image",
        originalFilename: "fixture.png",
        mediaType: "image/png",
        widthPx: 2,
        heightPx: 2,
        byteSize: png.length,
        file: `textures/${imageId}.png`,
        thumbnail: `textures/${imageId}.thumb.webp`,
        createdAt: new Date().toISOString(),
      },
    ],
  });
  await writeFile(join(templateDir, "unused.bin"), "must not be exported");
  await context.houses.write(card.id, document);
  await createRevision(context, card.id, "Fixture save A");
  const sourceA = await readSnapshotSource(context, card.id);
  await patchPreferences(context, 0, {
    homeAssistant: {
      bindings: { [card.id]: { objects: { [builtin.id]: { stateEntityId: "switch.fixture" } } } },
      dashboard: {
        urlPath: "fixture-dashboard",
        areaColumns: { [card.id]: { [area.id]: 2 } },
        areaTabs: { [card.id]: { [area.id]: "fixture-tab" } },
        areaViews: {
          [card.id]: {
            [area.id]: { target: { x: 0.1, y: 0, h: 0 }, distance: 2.5, azimuth: 0.15, polar: 0.8 },
          },
        },
      },
    },
  });
  document.name = "Working C";
  document.revision = 3;
  await context.houses.write(card.id, document);
  // Corrupt the working image as well; export must still get A's committed bytes.
  await context.images.writeAsset(card.id, `textures/${imageId}.png`, Buffer.from("working image"));
  const savedA = await createSnapshot(context, card.id);
  const manifestDir = join(snapshotRoot(context, card.id), savedA.snapshotId);
  const copied: unknown = JSON.parse((await readArtifactFile(manifestDir, "house.json")).toString());
  assert.ok(compileValidator(House)(copied));
  check(copied.name === "Saved A", "explicit Save is exported, not working C");
  check(savedA.sourceRevisionId === sourceA.sourceRevisionId, "export never creates a Git commit");
  check(
    savedA.files.every((file) => !file.path.includes("unused")),
    "unused files are excluded",
  );
  check(
    savedA.resources.templates.some((entry) => entry.id === "folding-chair"),
    "hidden second-floor template is included",
  );
  check(
    savedA.resources.templates.find((entry) => entry.id === templateId)?.dependencies.length === 2,
    "multi-file glTF buffer and texture are frozen",
  );
  const imagePath = savedA.resources.images[0]?.path;
  assert.ok(imagePath);
  check(
    (await readArtifactFile(manifestDir, imagePath)).equals(png),
    "committed image bytes survive a changed working asset",
  );
  check(
    identity(savedA, "snapshotId") === savedA.snapshotId,
    "manifest identity includes every frozen checksum",
  );
  check(
    (await createSnapshot(context, card.id)).snapshotId === savedA.snapshotId,
    "same saved resources/seed have stable identity",
  );
  const manifestResponse = await app.inject(`/api/houses/${card.id}/snapshots/${savedA.snapshotId}/manifest`);
  check(manifestResponse.statusCode === 200, "typed source manifest route works");
  const fileResponse = await app.inject(
    `/api/houses/${card.id}/snapshots/${savedA.snapshotId}/files/${imagePath}`,
  );
  check(
    fileResponse.statusCode === 200 && fileResponse.rawPayload.equals(png),
    "source file route serves listed bytes",
  );
  check(
    (await app.inject(`/api/houses/${card.id}/snapshots/${savedA.snapshotId}/files/missing.bin`))
      .statusCode === 404,
    "unlisted file rejected",
  );
  check(
    (await app.inject(`/api/houses/${card.id}/snapshots/not-an-id/manifest`)).statusCode === 400,
    "artifact IDs validated before IO",
  );
  document.name = "Saved B";
  await context.images.writeAsset(card.id, `textures/${imageId}.png`, png);
  await context.houses.write(card.id, document);
  await createRevision(context, card.id, "Fixture save B");
  const savedB = await createSnapshot(context, card.id);
  check(savedB.sourceRevisionId !== sourceA.sourceRevisionId, "next explicit Save has a different commit");
  check(
    (await readSnapshotSource(context, card.id, sourceA.sourceRevisionId)).relation === "newer",
    "Git ancestry, not counters/hash sorting, determines newer",
  );
  check(
    (
      await app.inject({
        method: "POST",
        url: `/api/houses/${card.id}/snapshots`,
        payload: { expectedSourceRevisionId: sourceA.sourceRevisionId },
      })
    ).statusCode === 409,
    "stale expected saved revision refused",
  );
  // Phase 16.14: an HA copy made before house schema version 5 (staircase areas) must still import and render.
  // The legacy snapshot is savedB with its house.json written as version 4: every area has kind "room", plus an Up
  // and a Down staircase area in the fixture room. The integration accepts it (StoredHouse); the viewer migrates it.
  const rootB = join(snapshotRoot(context, card.id), savedB.snapshotId);
  const houseB: unknown = JSON.parse((await readArtifactFile(rootB, "house.json")).toString());
  assert.ok(compileValidator(House)(houseB));
  const legacyArea = (id: string, x: number, direction: "up" | "down") => ({
    id,
    name: "Staircase",
    kind: "staircase",
    positionMm: { x, y: 0 },
    rotationDeg: 0,
    floor: {
      id: `fs_${id.slice(2)}`,
      material: area.floor.material,
      shapes: [
        {
          id: `s_${id.slice(2)}`,
          type: "rectangle",
          positionMm: { x: 0, y: 0 },
          rotationDeg: 0,
          widthMm: 900,
          heightMm: 2400,
        },
      ],
      carpets: [],
    },
    walls: [],
    objects: [],
    lights: [],
    staircase: {
      id: `st_${id.slice(2)}`,
      templateId: "staircase-straight",
      templateVersion: 1,
      direction,
      positionMm: { x: 0, y: 0 },
      rotationDeg: 0,
      parameters: { widthMm: 900, totalRiseMm: 2700, stepCount: 15 },
    },
  });
  const legacyDocument = {
    ...houseB,
    schemaVersion: 4,
    floors: houseB.floors.map((candidate, index) => ({
      ...candidate,
      roofCuts: [],
      areas: [
        ...candidate.areas.map((item) => ({ ...item, kind: "room" })),
        ...(index === 0
          ? [legacyArea("a_legacyup01", -1200, "up"), legacyArea("a_legacydn01", 1200, "down")]
          : []),
      ],
    })),
  };
  check(compileValidator(StoredHouse)(legacyDocument), "a version-4 house validates as a stored copy");
  check(!compileValidator(House)(legacyDocument), "…but not as a current house (it is migrated on load)");
  const legacyFiles = new Map<string, Uint8Array>();
  for (const file of savedB.files)
    legacyFiles.set(
      file.path,
      file.path === "house.json"
        ? new TextEncoder().encode(JSON.stringify(legacyDocument))
        : await readArtifactFile(rootB, file.path),
    );
  const legacyManifest = {
    ...savedB,
    snapshotId: "0".repeat(64),
    houseSchemaVersion: 4,
    files: savedB.files.map((file) =>
      file.path === "house.json"
        ? fileEntry(file.path, legacyFiles.get(file.path) ?? new Uint8Array())
        : file,
    ),
  };
  legacyManifest.snapshotId = identity(legacyManifest, "snapshotId");
  await storeArtifact(snapshotRoot(context, card.id), legacyManifest.snapshotId, legacyManifest, legacyFiles);
  // The viewer path: the copy's { revision, document } through the HA viewer's loader (the floor scene render of a
  // migrated copy is checked in scripts/check-stairs.mjs).
  const loaded = currentHouseEnvelope({ revision: legacyDocument.revision, document: legacyDocument });
  const loadedFloor = loaded.document.floors[0];
  assert.ok(loadedFloor);
  const loadedObjects = loadedFloor.areas.flatMap((item) => item.objects);
  check(
    loaded.document.floors.every((item) => item.areas.every((candidate) => !("kind" in candidate))) &&
      loadedFloor.areas.every((item) => item.name !== "Staircase") &&
      loadedObjects.some((object) => object.floorCut === "stair" && object.id === "st_legacyup01") &&
      loadedObjects.some((object) => object.floorCut === "opening"),
    "the viewer migrates a stored v4 copy: a stair object and a floor opening, no staircase areas",
  );
  const loadedSlab = buildFloorSlab(loadedFloor, floorCutsOf(loaded.document, loadedFloor.id));
  check(
    loadedSlab?.region.polygons.some((polygon) => polygon.holes.length === 1) === true,
    "…and its floor is cut by the migrated Down opening (no hole lost)",
  );
  check(
    JSON.stringify(currentHouseEnvelope({ revision: houseB.revision, document: houseB }).document) ===
      JSON.stringify(houseB),
    "a current (v6) copy loads through the same path unchanged",
  );
  // Phase 19.2: a copy made before house schema version 6 (floors with roof cuts) validates as a stored copy and the
  // viewer loads it with the cuts converted into a roof that cuts the walls at the same heights.
  const v5Cut = (sectionDirectionDeg: number) => ({
    id: `rc_v5cut${String(sectionDirectionDeg).padStart(5, "0")}`,
    name: "Cut",
    active: true,
    originMm: { x: 0, y: 0 },
    sectionDirectionDeg,
    low: { runMm: -3000, heightMm: 1500 },
    high: { runMm: 0, heightMm: 2600 },
    keptSide: "below",
  });
  const v5Document = {
    ...houseB,
    schemaVersion: 5,
    floors: houseB.floors.map((candidate, index) => ({
      ...candidate,
      roofCuts: index === 0 ? [v5Cut(0), v5Cut(180)] : [],
    })),
  };
  check(
    compileValidator(StoredHouse)(v5Document),
    "a version-5 house (roof cuts) validates as a stored copy",
  );
  check(!compileValidator(House)(v5Document), "…but not as a current house (it is migrated on load)");
  const v5Loaded = currentHouseEnvelope({ revision: v5Document.revision, document: v5Document }).document;
  const v5Floor = v5Loaded.floors[0];
  assert.ok(v5Floor);
  const v5Roof = v5Floor.roofs?.[0];
  const v5Planes = [v5Cut(0), v5Cut(180)].map((cut) => roofCutPlane(cut));
  const v5Limit = floorRoofLimit(v5Floor);
  const probe = { x: 400, y: 0 };
  const expected = Math.min(
    ...v5Planes.map((plane) => (plane === null ? Infinity : evaluateLinear(plane, probe))),
  );
  check(
    !v5Loaded.floors.some((candidate) => "roofCuts" in candidate) &&
      v5Roof?.cutsWalls === true &&
      !v5Roof.wallsRise &&
      Math.abs((roofUndersideAt(v5Limit, probe) ?? NaN) - expected) < 0.05,
    "the viewer migrates a stored v5 copy: its roof cuts become a roof with the same underside",
  );
  await writeFile(
    join(output, "fixture.json"),
    JSON.stringify(
      {
        houseId: card.id,
        snapshotId: savedB.snapshotId,
        sourceRevisionId: savedB.sourceRevisionId,
        previousSnapshotId: savedA.snapshotId,
        legacySnapshotId: legacyManifest.snapshotId,
        imageId,
        templateId,
        objectId: builtin.id,
        areaId: area.id,
        storage,
      },
      null,
      2,
    ),
  );
  await writeFile(join(output, "working.json"), JSON.stringify({ ...document, name: "Remote working C" }));
  process.stdout.write(`HA source checks: ${String(checks)} passed. Synthetic fixture: ${output}\n`);
} finally {
  await app.close();
}
