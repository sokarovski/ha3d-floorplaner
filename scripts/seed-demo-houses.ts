// Developer command: creates or rebuilds the three demo houses through a running API (npm run seed:demo-houses;
// HOMEPLAN_URL, default http://localhost:4310) and saves each as a Git revision. The documents are the same ones
// `npm run demo:build` writes for first-start seeding (scripts/fixtures/demoHouses/build.ts): built-in templates
// and materials only, checked before anything is written. A fresh install needs neither command; the server
// seeds an empty data directory itself (spec/architecture/persistence.md#demo-houses).
//
// - Without options it creates each demo house that does not exist yet (matched by name) and leaves existing ones
//   alone. `--replace` rewrites every existing demo house in place; `--replace <houseId>` only that one, refusing
//   any house whose name is not a demo name. Floor IDs are kept by floor name. `--dry-run` builds and checks the
//   documents without writing anything.
// - A rebuilt house's leftovers from older versions of this command are deleted: house templates the document no
//   longer references, and uploaded floor textures named "Demo — …" (now built-in materials).
import type { HouseDocument } from "../shared/domain/schemas/house";
import { buildDemoHouse, demoHouses, loadBuildContext, templateIdsOf } from "./fixtures/demoHouses/build";
import type { DemoHouse } from "./fixtures/demoHouses/build";
import type { BuildContext } from "./fixtures/demoHouses/kit";

const base = process.env.HOMEPLAN_URL ?? "http://localhost:4310";

// ---- HTTP ---------------------------------------------------------------------------------------

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const response = await fetch(`${base}/api${path}`, init);
  if (!response.ok)
    throw new Error(`${init.method ?? "GET"} ${path}: ${String(response.status)} ${await response.text()}`);
  return response;
};

const json = async (path: string, init: RequestInit = {}): Promise<Readonly<Record<string, unknown>>> => {
  const body: unknown = await (await request(path, init)).json();
  if (!isRecord(body)) throw new Error(`${path}: unexpected response`);
  return body;
};

const sendJson = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const records = (value: unknown): readonly Readonly<Record<string, unknown>>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const text = (value: unknown): string => (typeof value === "string" ? value : "");

type HouseCard = Readonly<{ id: string; name: string }>;

const listHouses = async (): Promise<readonly HouseCard[]> =>
  records((await json("/houses")).houses).flatMap((card) =>
    card.status === "ok" && typeof card.id === "string" && typeof card.name === "string"
      ? [{ id: card.id, name: card.name }]
      : [],
  );

// ---- cleanup of older seeds ---------------------------------------------------------------------

const remove = async (path: string, what: string): Promise<void> => {
  const response = await fetch(`${base}/api${path}`, { method: "DELETE" });
  console.log(response.ok ? `  removed ${what}` : `  kept ${what} (${String(response.status)})`);
};

/** Deletes the house templates of `houseId` that `document` does not reference. */
const removeUnusedHouseTemplates = async (houseId: string, document: HouseDocument): Promise<void> => {
  const used = new Set(templateIdsOf(document));
  for (const template of records((await json(`/houses/${houseId}/templates`)).templates)) {
    const id = text(template.id);
    if (template.source !== "house" || used.has(id)) continue;
    await remove(`/houses/${houseId}/templates/${id}`, `unused house template “${text(template.label)}”`);
  }
};

/** Deletes the floor textures older versions of this command uploaded ("Demo — …"), now built-ins. */
const removeOldTextures = async (houseId: string): Promise<void> => {
  for (const image of records((await json(`/houses/${houseId}/images`)).images))
    if (text(image.name).startsWith("Demo — "))
      await remove(`/houses/${houseId}/images/${text(image.id)}`, `uploaded texture “${text(image.name)}”`);
};

// ---- save ---------------------------------------------------------------------------------------

const save = async (houseId: string, built: HouseDocument, replaced: boolean): Promise<HouseDocument> => {
  const current = await json(`/houses/${houseId}/document`);
  const revision = typeof current.revision === "number" ? current.revision : 0;
  const stored = isRecord(current.document) ? current.document : {};
  const floorIds = new Map(
    records(stored.floors).map((floor): [string, string] => [text(floor.name), text(floor.id)]),
  );
  const document: HouseDocument = {
    ...built,
    id: houseId,
    floors: built.floors.map((floor) => {
      const id = floorIds.get(floor.name);
      return id === undefined || id === "" ? floor : { ...floor, id };
    }),
  };
  await json(`/houses/${houseId}/document`, sendJson("PUT", { expectedRevision: revision, document }));
  await json(
    `/houses/${houseId}/revisions`,
    sendJson("POST", { message: replaced ? "Demo house fixture (reseeded)" : "Demo house fixture" }),
  );
  return document;
};

const seed = async (
  demo: DemoHouse,
  context: BuildContext,
  houseId: string | null,
  dryRun: boolean,
): Promise<void> => {
  const built = await buildDemoHouse(demo, context);
  if (dryRun) {
    console.log(`${demo.name}: checked (dry run)`);
    return;
  }
  const id = houseId ?? text((await json("/houses", sendJson("POST", { name: demo.name }))).id);
  const document = await save(id, built, houseId !== null);
  if (houseId !== null) {
    await removeUnusedHouseTemplates(id, document);
    await removeOldTextures(id);
  }
  console.log(`${demo.name}: ${houseId === null ? "created" : "replaced"} /houses/${id}`);
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const replaceIndex = args.indexOf("--replace");
const replaceTarget = replaceIndex < 0 ? undefined : args[replaceIndex + 1];
const replaceOne = replaceTarget !== undefined && !replaceTarget.startsWith("--") ? replaceTarget : null;

const context = await loadBuildContext();
const houses = await listHouses();
if (replaceOne !== null) {
  const card = houses.find((house) => house.id === replaceOne);
  const demo = demoHouses.find((candidate) => candidate.name === card?.name);
  if (card === undefined) throw new Error(`No house ${replaceOne}`);
  if (demo === undefined)
    throw new Error(`Refusing to replace “${card.name}”: only the demo houses are reseeded.`);
  await seed(demo, context, card.id, dryRun);
} else {
  for (const demo of demoHouses) {
    const existing = houses.filter((house) => house.name === demo.name);
    if (existing.length > 1)
      throw new Error(`Several houses are named “${demo.name}”; replace one with --replace <houseId>.`);
    const found = existing[0];
    if (found !== undefined && replaceIndex < 0) {
      console.log(`${demo.name}: exists (/houses/${found.id}); use --replace to rebuild it`);
      if (dryRun) await seed(demo, context, found.id, true);
      continue;
    }
    await seed(demo, context, found?.id ?? null, dryRun);
  }
}
