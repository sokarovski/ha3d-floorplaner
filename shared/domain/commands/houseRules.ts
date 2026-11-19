// Whole-document validation for commands: the House JSON Schema plus rules JSON Schema cannot express.
import { House } from "../schemas/house";
import type { HouseDocument } from "../schemas/house";
import { compileValidator, toIssues } from "../validation/ajv";
import { sheetProblem } from "../../geometry/roofSheet";
import { newIntegrityProblems } from "../house/integrity";

const normalizeName = (name: string): string => name.normalize("NFC").trim().toLocaleLowerCase();

/** Floor names: 1–64 characters, unique in the house case-insensitively (D14). */
export const floorNameProblem = (house: HouseDocument): string | undefined => {
  const seen = new Set<string>();
  for (const floor of house.floors) {
    const key = normalizeName(floor.name);
    if (seen.has(key)) return `Another floor is already named “${floor.name.trim()}”.`;
    seen.add(key);
  }
  return undefined;
};

/**
 * The first problem of `house`, or undefined. Integrity faults (duplicate IDs, references into another area or
 * floor; shared/domain/house/integrity.ts) count only when `previous` (the document the edit started from) did not
 * already have them, so a house saved with an old fault stays editable while no edit may add one.
 */
export const validateHouseDocument = (house: HouseDocument, previous?: HouseDocument): string | undefined => {
  const validate = compileValidator(House);
  if (!validate(house)) {
    const issue = toIssues(validate.errors)[0];
    return issue === undefined
      ? "The edit makes the house invalid."
      : `Invalid value at ${issue.pointer || "/"}: ${issue.message}.`;
  }
  if (house.floors.length === 0) return "A house needs at least one floor.";
  // Roofs (Phase 19.1): a sound sheet (references, a simple outline, no point below the base, lines on the roof).
  for (const floor of house.floors)
    for (const roof of floor.roofs ?? []) {
      const problem = sheetProblem(roof);
      if (problem !== undefined) return `${roof.name}: ${problem}`;
    }
  const integrity = newIntegrityProblems(house, previous)[0];
  if (integrity !== undefined) return `${integrity.message}.`;
  return floorNameProblem(house);
};
