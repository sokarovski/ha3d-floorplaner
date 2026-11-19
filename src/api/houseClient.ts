// Houses, the house document, and revisions (spec/architecture/api.md#houses).
import type {
  CreateRevisionResponseValue,
  RestoreRevisionResponseValue,
  RevisionDiffResponseValue,
  RevisionListResponseValue,
} from "@shared/contracts/revisions";
import {
  CreateRevisionResponse,
  RestoreRevisionResponse,
  RevisionDiffResponse,
  RevisionListResponse,
} from "@shared/contracts/revisions";
import { HouseDocumentEnvelope, SaveDocumentResponse } from "@shared/contracts/document";
import type { HouseDocumentEnvelopeValue } from "@shared/contracts/document";
import {
  HouseListResponse,
  RenameHouseResponse,
  TrashListResponse,
  ValidHouseCard,
} from "@shared/contracts/houses";
import type {
  HouseCardValue,
  RenameHouseResponseValue,
  TrashedHouseValue,
  ValidHouseCardValue,
} from "@shared/contracts/houses";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { HttpClient } from "./httpClient";

export type HouseClient = ReturnType<typeof createHouseClient>;

export const createHouseClient = (http: HttpClient) => ({
  list: async (signal?: AbortSignal): Promise<readonly HouseCardValue[]> =>
    (await http.request({ method: "GET", path: ["houses"], signal }, HouseListResponse)).houses,
  create: async (name: string): Promise<ValidHouseCardValue> =>
    http.request({ method: "POST", path: ["houses"], body: { name } }, ValidHouseCard),
  /** Clone house (Phase 7.13): a copy of the last saved state, named "<name> (copy)" unless a name is given. */
  clone: async (houseId: string, name?: string): Promise<ValidHouseCardValue> =>
    http.request(
      { method: "POST", path: ["houses", houseId, "clone"], body: name === undefined ? {} : { name } },
      ValidHouseCard,
    ),
  rename: async (
    houseId: string,
    name: string,
    expectedRevision: number,
  ): Promise<RenameHouseResponseValue> =>
    http.request(
      { method: "PATCH", path: ["houses", houseId], body: { name, expectedRevision } },
      RenameHouseResponse,
    ),
  trash: async (houseId: string): Promise<void> =>
    http.requestEmpty({ method: "DELETE", path: ["houses", houseId] }),
  listTrash: async (signal?: AbortSignal): Promise<readonly TrashedHouseValue[]> =>
    (await http.request({ method: "GET", path: ["trash", "houses"], signal }, TrashListResponse)).houses,
  restore: async (houseId: string): Promise<void> =>
    http.requestEmpty({ method: "POST", path: ["trash", "houses", houseId, "restore"] }),
  purge: async (houseId: string): Promise<void> =>
    http.requestEmpty({ method: "DELETE", path: ["trash", "houses", houseId] }),
  loadDocument: async (houseId: string, signal?: AbortSignal): Promise<HouseDocumentEnvelopeValue> =>
    http.request({ method: "GET", path: ["houses", houseId, "document"], signal }, HouseDocumentEnvelope),
  saveDocument: async (houseId: string, document: HouseDocument, expectedRevision: number): Promise<number> =>
    (
      await http.request(
        { method: "PUT", path: ["houses", houseId, "document"], body: { expectedRevision, document } },
        SaveDocumentResponse,
      )
    ).revision,
  createRevision: async (houseId: string, message?: string): Promise<CreateRevisionResponseValue> =>
    http.request(
      {
        method: "POST",
        path: ["houses", houseId, "revisions"],
        body: message === undefined || message.trim() === "" ? {} : { message },
      },
      CreateRevisionResponse,
    ),
  listRevisions: async (
    houseId: string,
    before?: string,
    limit = 50,
    signal?: AbortSignal,
  ): Promise<RevisionListResponseValue> =>
    http.request(
      {
        method: "GET",
        path: ["houses", houseId, "revisions"],
        query: { before, limit: String(limit) },
        signal,
      },
      RevisionListResponse,
    ),
  revisionDiff: async (
    houseId: string,
    revisionId: string,
    signal?: AbortSignal,
  ): Promise<RevisionDiffResponseValue> =>
    http.request(
      { method: "GET", path: ["houses", houseId, "revisions", revisionId, "diff"], signal },
      RevisionDiffResponse,
    ),
  restoreRevision: async (
    houseId: string,
    revisionId: string,
    expectedRevision: number,
  ): Promise<RestoreRevisionResponseValue> =>
    http.request(
      {
        method: "POST",
        path: ["houses", houseId, "revisions", revisionId, "restore"],
        body: { expectedRevision },
      },
      RestoreRevisionResponse,
    ),
});
