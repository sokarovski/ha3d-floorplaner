// Demo house documents (spec/architecture/persistence.md#demo-houses): builds the three demo houses from their
// fixtures (scripts/fixtures/demoHouses/), checks them (scripts/fixtures/demoHouses/build.ts) and writes each
// to server/demo-houses/<slug>.json, which the server seeds into an empty data directory on first start. The
// output is deterministic: the same fixtures and built-in templates give the same bytes. Files of houses that are
// no longer demo houses are removed. Exits non-zero, writing nothing, when any house has a problem.
// Run: npm run demo:build
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { HouseDocument } from "../shared/domain/schemas/house";
import { buildDemoHouse, demoHouses, demoHousesDir, loadBuildContext } from "./fixtures/demoHouses/build";

const context = await loadBuildContext();
const documents: [string, HouseDocument][] = [];
for (const demo of demoHouses) documents.push([demo.slug, await buildDemoHouse(demo, context)]);

await mkdir(demoHousesDir, { recursive: true });
const wanted = new Set(documents.map(([slug]) => `${slug}.json`));
for (const file of await readdir(demoHousesDir))
  if (file.endsWith(".json") && !wanted.has(file)) await rm(resolve(demoHousesDir, file));
for (const [slug, document] of documents) {
  const text = `${JSON.stringify(document, null, 2)}\n`;
  await writeFile(resolve(demoHousesDir, `${slug}.json`), text);
  console.log(`OK   ${slug}.json  ${String(text.length).padStart(8)} B  ${document.name}`);
}
