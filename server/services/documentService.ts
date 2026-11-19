// House document GET/PUT with expectedRevision (spec/architecture/api.md#house-document, D09).
import type { HouseDocument } from "../../shared/domain/schemas/house";
import type { ValidationIssueValue } from "../../shared/contracts/common";
import { pointerToken } from "../lib/json";
import { ApiError, validationError } from "../http/errors";
import type { ServiceContext } from "./context";
import { houseLock } from "./context";
import { loadDocument } from "./houseService";

export const getDocument = async (
  context: ServiceContext,
  houseId: string,
): Promise<{ revision: number; document: HouseDocument }> => {
  const { document } = await loadDocument(context, houseId);
  return { revision: document.revision, document };
};

/** Domain rules beyond the JSON Schema (D14): floor names unique case-insensitively. */
export const documentRuleIssues = (
  document: HouseDocument,
  basePointer: string,
): readonly ValidationIssueValue[] => {
  const issues: ValidationIssueValue[] = [];
  const seen = new Set<string>();
  document.floors.forEach((floor, index) => {
    const key = floor.name.normalize("NFC").trim().toLocaleLowerCase();
    if (seen.has(key))
      issues.push({
        pointer: `${basePointer}/floors/${pointerToken(index)}/name`,
        message: "must be unique within the house",
      });
    seen.add(key);
  });
  return issues;
};

export const putDocument = async (
  context: ServiceContext,
  houseId: string,
  expectedRevision: number,
  document: HouseDocument,
): Promise<{ revision: number }> => {
  if (document.id !== houseId)
    throw validationError([
      { pointer: "/body/document/id", message: "must equal the house ID in the route" },
    ]);
  const ruleIssues = documentRuleIssues(document, "/body/document");
  if (ruleIssues.length > 0) throw validationError(ruleIssues);
  return context.queue.run(houseLock(houseId), async () => {
    const current = await loadDocument(context, houseId);
    if (current.document.revision !== expectedRevision) {
      throw new ApiError("staleRevision", "The house was changed since it was loaded.", {
        currentRevision: current.document.revision,
      });
    }
    const revision = current.document.revision + 1;
    await context.houses.write(houseId, { ...document, revision });
    return { revision };
  });
};
