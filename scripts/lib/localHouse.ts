// Finds a house in the local data directory (DATA_DIR or .homeplan-data) for the read-only checks: by the
// command-line house ID when one is given, otherwise the demo house with the given name (npm run seed:demo-houses).
import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

export const localDataDir = (): string => {
  const raw = process.env.DATA_DIR ?? ".homeplan-data";
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
};

const nameOf = (text: string): string | null => {
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === "object" && parsed !== null && "name" in parsed && typeof parsed.name === "string"
    ? parsed.name
    : null;
};

/** The house ID to check: `requested` when given, else the ID of the local house named `defaultName`. */
export const localHouseId = async (requested: string | undefined, defaultName: string): Promise<string> => {
  if (requested !== undefined) return requested;
  const root = join(localDataDir(), "data");
  for (const id of await readdir(root)) {
    const text = await readFile(join(root, id, "house.json"), "utf8").catch(() => null);
    if (text !== null && nameOf(text) === defaultName) return id;
  }
  throw new Error(
    `No local house named "${defaultName}" in ${root}; run npm run seed:demo-houses or pass a house ID`,
  );
};
