// Builds and checks the three demo houses ("Demo: City apartment", "Demo: Garden bungalow", "Demo: Family house")
// from their fixtures, shared by `npm run demo:build` (scripts/build-demo-houses.ts, the documents the server seeds
// on first start) and `npm run seed:demo-houses` (scripts/seed-demo-houses.ts, a running server).
//
// - Furniture, fixtures and openings are built-in templates only (server/builtin-templates/); floor textures are
//   built-in textured materials (Phase 17.1). A demo document needs no house assets.
// - Every document is validated with the House schema and the house rules, its walls and openings with
//   RealAllWalls (no orphan walls, intrusions, misfitting or conflicting openings), nothing above a roof (Phase
//   19.2), every hole and roof window fitting its roof (19.3), and its furnishing with the layout check (objects
//   inside their rooms, not overlapping, doors kept clear, wall objects on their walls).
// - IDs are deterministic: every entity ID is renumbered from the house's slug, so the same fixtures always give
//   the same document.
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { validateHouseDocument } from "../../../shared/domain/commands/houseRules";
import { documentIntegrityProblems } from "../../../shared/domain/house/integrity";
import { House } from "../../../shared/domain/schemas/house";
import type { HouseDocument } from "../../../shared/domain/schemas/house";
import { compileValidator } from "../../../shared/domain/validation/ajv";
import { homeplanExtras, validateTemplateMetadata } from "../../../shared/domain/templates/metadata";
import { openingSizeFromParameters } from "../../../shared/domain/templates/openingSize";
import { buildRealAllWalls } from "../../../shared/geometry/realAllWalls";
import { itemsAboveRoof } from "../../../shared/geometry/roofItems";
import { roofItemIssues } from "../../../shared/geometry/roofOpenings";
import { templateFootprint } from "../../../shared/geometry/templateResize";
import { flattenTemplate } from "../../../src/renderer/templateCache";
import type { TemplateAsset } from "../../../src/renderer/templateCache";
import { buildCityApartment, cityApartmentName } from "./cityApartment";
import { reidentified } from "./familyAttic";
import { buildFamilyHouse, familyHouseName } from "./familyHouse";
import { buildGardenBungalow, gardenBungalowName } from "./gardenBungalow";
import type { BuildContext, FloorPlan, Params, Size } from "./kit";
import { checkFloorLayout } from "./kit";

type Builder = (id: string, context: BuildContext) => { house: HouseDocument; plans: FloorPlan[] };

export type DemoHouse = Readonly<{ name: string; slug: string; build: Builder }>;

/** The demo houses, in seeding order. `slug` names the generated file, server/demo-houses/<slug>.json. */
export const demoHouses: readonly DemoHouse[] = [
  { name: cityApartmentName, slug: "city-apartment", build: buildCityApartment },
  { name: gardenBungalowName, slug: "garden-bungalow", build: buildGardenBungalow },
  { name: familyHouseName, slug: "family-house", build: buildFamilyHouse },
];

const repositoryRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const builtinTemplatesDir = resolve(repositoryRoot, "server/builtin-templates");

/** Where `npm run demo:build` writes the documents the server seeds (server/services/demoSeedService.ts). */
export const demoHousesDir = resolve(repositoryRoot, "server/demo-houses");

// ---- built-in template footprints ---------------------------------------------------------------

/** Loads every built-in template's metadata and geometry, so the fixtures can size their furniture. */
export const loadBuildContext = async (): Promise<BuildContext> => {
  const loader = new GLTFLoader();
  const assets = new Map<string, TemplateAsset>();
  for (const id of (await readdir(builtinTemplatesDir)).sort()) {
    const bytes = await readFile(resolve(builtinTemplatesDir, id, "v1.glb")).catch(() => null);
    if (bytes === null) continue;
    const gltf = await loader.parseAsync(new Uint8Array(bytes).buffer, "");
    const validation = validateTemplateMetadata(homeplanExtras(gltf.scene.userData));
    if (validation.metadata === null) throw new Error(`${id}: invalid Homeplan metadata`);
    assets.set(id, { metadata: validation.metadata, ...flattenTemplate(gltf) });
  }
  const size = (templateId: string, parameters: Params): Size => {
    const asset = assets.get(templateId);
    if (asset === undefined) throw new Error(`Unknown built-in template ${templateId}`);
    const footprint = templateFootprint(asset.input, asset.metadata, { parameters: { ...parameters } });
    if (!footprint.ok)
      throw new Error(`${templateId}: ${footprint.issues.map((issue) => issue.message).join("; ")}`);
    return {
      w: footprint.boundsMm.max.x - footprint.boundsMm.min.x,
      d: footprint.boundsMm.max.z - footprint.boundsMm.min.z,
    };
  };
  return { size };
};

// ---- checks -------------------------------------------------------------------------------------

const validateHouse = compileValidator(House);

const builtinIds = async (): Promise<ReadonlySet<string>> => new Set(await readdir(builtinTemplatesDir));

/** Every template a house references: floor and wall objects, openings and light fixtures. */
export const templateIdsOf = (house: HouseDocument): readonly string[] =>
  house.floors.flatMap((floor) =>
    floor.areas.flatMap((area) => [
      ...area.objects.map((object) => object.templateId),
      ...area.walls.flatMap((wall) => wall.objects.map((object) => object.templateId)),
      ...area.lights.flatMap((light) => (light.fixture === null ? [] : [light.fixture.templateId])),
    ]),
  );

const problemsOf = (
  house: HouseDocument,
  plans: readonly FloorPlan[],
  builtins: ReadonlySet<string>,
): string[] => {
  const problems: string[] = [];
  if (!validateHouse(house))
    for (const error of validateHouse.errors ?? [])
      problems.push(`schema ${error.instancePath}: ${String(error.message)}`);
  const rule = validateHouseDocument(house);
  if (rule !== undefined) problems.push(`house rule: ${rule}`);
  for (const issue of documentIntegrityProblems(house))
    problems.push(`integrity ${issue.pointer}: ${issue.message}`);
  for (const templateId of new Set(templateIdsOf(house)))
    if (!builtins.has(templateId)) problems.push(`${templateId} is not a built-in template`);
  for (const floor of house.floors) {
    for (const issue of buildRealAllWalls(floor, openingSizeFromParameters).issues)
      problems.push(`${floor.name}: wall issue ${JSON.stringify(issue)}`);
    // Phase 19.2: nothing above the roof (doors, windows, objects, lights).
    for (const id of itemsAboveRoof(floor, openingSizeFromParameters))
      problems.push(`${floor.name}: ${id} reaches above the roof`);
    // Phase 19.3: every hole and roof window fits its roof.
    for (const roof of floor.roofs ?? [])
      for (const issue of roofItemIssues(roof)) problems.push(`${floor.name}: ${issue.message}`);
  }
  plans.forEach((plan, index) => {
    for (const problem of checkFloorLayout(plan))
      problems.push(`${house.floors[index]?.name ?? "?"}: ${problem}`);
  });
  return problems;
};

// ---- deterministic IDs --------------------------------------------------------------------------

const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

/** "<prefix>_<10 characters>" from a hash of the house slug and the ID's position in the document. */
const deterministicId = (slug: string, prefix: string, position: number): string => {
  const digest = createHash("sha256")
    .update(`${slug}/${String(position)}`)
    .digest();
  let suffix = "";
  for (const byte of digest.subarray(0, 10)) suffix += alphabet.charAt(byte % alphabet.length);
  return `${prefix}_${suffix}`;
};

const renumbered = (house: HouseDocument, slug: string): HouseDocument => {
  let position = 0;
  const used = new Set<string>();
  return reidentified(house, (old) => {
    const id = deterministicId(slug, old.slice(0, old.indexOf("_")), position);
    position += 1;
    if (used.has(id)) throw new Error(`${slug}: deterministic ID ${id} repeats`);
    used.add(id);
    return id;
  });
};

// ---- build --------------------------------------------------------------------------------------

/**
 * Builds and checks one demo house; throws with every problem found. The document's IDs are deterministic,
 * its own ID included; callers that store it under another house ID replace `id`.
 */
export const buildDemoHouse = async (demo: DemoHouse, context: BuildContext): Promise<HouseDocument> => {
  const { house, plans } = demo.build("h_demohouse0", context);
  const builtins = await builtinIds();
  const problems = problemsOf(house, plans, builtins);
  const document = renumbered(house, demo.slug);
  if (problems.length === 0 && !validateHouse(document))
    problems.push("renumbered document fails the schema");
  if (problems.length > 0) throw new Error(`${demo.name} has problems:\n  ${problems.join("\n  ")}`);
  return document;
};
