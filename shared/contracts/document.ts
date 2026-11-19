// House document routes (spec/architecture/api.md#house-document).
import Type from "typebox";
import type { Static } from "typebox";
import { House } from "../domain/schemas/house";
import { StoredHouse } from "../domain/schemas/storedHouse";
import { RevisionNumber } from "./common";

/** GET /api/houses/:houseId/document. `revision` always equals `document.revision`. */
export const HouseDocumentEnvelope = Type.Object(
  { revision: RevisionNumber, document: House },
  { additionalProperties: false },
);
export type HouseDocumentEnvelopeValue = Static<typeof HouseDocumentEnvelope>;

/**
 * The document route of a Home Assistant copy (Phase 16.14): a stored copy may still be house schema version 4.
 * The HA integration validates with it; the HA viewer migrates it (readStoredHouseEnvelope) before rendering.
 */
export const StoredHouseDocumentEnvelope = Type.Object(
  { revision: RevisionNumber, document: StoredHouse },
  { additionalProperties: false },
);

/**
 * PUT /api/houses/:houseId/document: the full document, never a patch. `document.id` must equal the
 * route's house ID. The server ignores `document.revision`, stores `expectedRevision + 1`, and returns it.
 */
export const SaveDocumentBody = Type.Object(
  { expectedRevision: RevisionNumber, document: House },
  { additionalProperties: false },
);
export type SaveDocumentBodyValue = Static<typeof SaveDocumentBody>;

export const SaveDocumentResponse = Type.Object(
  { revision: RevisionNumber },
  { additionalProperties: false },
);
export type SaveDocumentResponseValue = Static<typeof SaveDocumentResponse>;
