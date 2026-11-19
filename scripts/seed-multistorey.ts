// Creates the "Multi-storey test" house (scripts/fixtures/multiStoreyHouse.ts) through the running API
// (npm run seed:multistorey) and saves a revision: a new house each run; it never opens or changes an existing one.
// `npm run seed:multistorey -- --replace <houseId>` instead rewrites that existing test house in place (Phase 16.14):
// it refuses any house not named "Multi-storey test", keeps its floor IDs by floor name (so settings keyed by floor,
// such as the HA main view, survive), and saves a revision.
import { buildMultiStoreyHouse, multiStoreyHouseName } from "./fixtures/multiStoreyHouse";
import type { HouseDocument } from "../shared/domain/schemas/house";

const base = process.env.HOMEPLAN_URL ?? "http://localhost:4310";

const replaceTarget = (args: readonly string[]): string | null => {
  const index = args.indexOf("--replace");
  if (index < 0) return null;
  const id = args[index + 1];
  if (id === undefined || id.startsWith("--")) throw new Error("--replace needs a house ID");
  return id;
};

type Current = Readonly<{
  revision: number;
  name: string;
  floors: readonly Readonly<{ id: string; name: string }>[];
}>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readCurrent = async (houseId: string): Promise<Current> => {
  const response = await fetch(`${base}/api/houses/${houseId}/document`);
  if (!response.ok) throw new Error(`Read failed: ${String(response.status)} ${await response.text()}`);
  const envelope: unknown = await response.json();
  if (!isRecord(envelope) || typeof envelope.revision !== "number" || !isRecord(envelope.document))
    throw new Error("Unexpected document response");
  const document = envelope.document;
  const floors = Array.isArray(document.floors) ? document.floors : [];
  return {
    revision: envelope.revision,
    name: typeof document.name === "string" ? document.name : "",
    floors: floors.flatMap((floor: unknown) =>
      isRecord(floor) && typeof floor.id === "string" && typeof floor.name === "string"
        ? [{ id: floor.id, name: floor.name }]
        : [],
    ),
  };
};

const save = async (houseId: string, expectedRevision: number, document: HouseDocument): Promise<void> => {
  const saved = await fetch(`${base}/api/houses/${houseId}/document`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision, document }),
  });
  if (!saved.ok) throw new Error(`Save failed: ${String(saved.status)} ${await saved.text()}`);
  // An explicit Save (D09): a Git revision, so the house can be exported to Home Assistant.
  const revision = await fetch(`${base}/api/houses/${houseId}/revisions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Multi-storey test fixture" }),
  });
  if (!revision.ok) throw new Error(`Revision failed: ${String(revision.status)} ${await revision.text()}`);
};

const replace = async (houseId: string): Promise<void> => {
  const current = await readCurrent(houseId);
  if (current.name !== multiStoreyHouseName)
    throw new Error(
      `Refusing to replace “${current.name}”: only the “${multiStoreyHouseName}” house is reseeded.`,
    );
  const built = buildMultiStoreyHouse(houseId);
  const document: HouseDocument = {
    ...built,
    floors: built.floors.map((floor) => ({
      ...floor,
      id: current.floors.find((candidate) => candidate.name === floor.name)?.id ?? floor.id,
    })),
  };
  await save(houseId, current.revision, document);
  console.log(`Multi-storey test house replaced: /houses/${houseId}`);
};

const create = async (): Promise<void> => {
  const created = await fetch(`${base}/api/houses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: multiStoreyHouseName }),
  });
  if (!created.ok) throw new Error(`Create failed: ${String(created.status)} ${await created.text()}`);
  const card: unknown = await created.json();
  if (!isRecord(card) || typeof card.id !== "string") throw new Error("Unexpected create response");
  await save(card.id, 0, buildMultiStoreyHouse(card.id));
  console.log(`Multi-storey test house created: /houses/${card.id}`);
};

const target = replaceTarget(process.argv.slice(2));
await (target === null ? create() : replace(target));
