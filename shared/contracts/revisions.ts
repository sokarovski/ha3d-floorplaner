// Git revision history routes (spec/architecture/api.md#house-document, spec/architecture/persistence.md#revision-history).
import Type from "typebox";
import type { Static } from "typebox";
import { House } from "../domain/schemas/house";
import { GitRevisionId, IdString, RevisionNumber, Timestamp } from "./common";

export const RevisionParams = Type.Object({ houseId: IdString, revisionId: GitRevisionId });
export type RevisionParamsValue = Static<typeof RevisionParams>;

/**
 * One Git revision. `message` is the subject line (the user's note, "Save", "Create house", or
 * "Restore to …"); `changedFiles` are house-relative paths changed against the parent commit.
 */
export const RevisionSummary = Type.Object(
  {
    id: GitRevisionId,
    time: Timestamp,
    message: Type.String(),
    changedFiles: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type RevisionSummaryValue = Static<typeof RevisionSummary>;

/** POST /api/houses/:houseId/revisions. Send `{}` when there is no note. */
export const CreateRevisionBody = Type.Object(
  { message: Type.Optional(Type.String({ maxLength: 500 })) },
  { additionalProperties: false },
);
export type CreateRevisionBodyValue = Static<typeof CreateRevisionBody>;

/** `201 { created: true, revision }`, or `200 { created: false }` when nothing changed since the last commit. */
export const CreatedRevisionResponse = Type.Object(
  { created: Type.Literal(true), revision: RevisionSummary },
  { additionalProperties: false },
);
export const NoRevisionResponse = Type.Object(
  { created: Type.Literal(false) },
  { additionalProperties: false },
);
export const CreateRevisionResponse = Type.Union([CreatedRevisionResponse, NoRevisionResponse]);
export type CreateRevisionResponseValue = Static<typeof CreateRevisionResponse>;

/** GET /api/houses/:houseId/revisions?before=<id>&limit=<1..200, default 50>. */
export const RevisionListQuery = Type.Object(
  {
    before: Type.Optional(GitRevisionId),
    limit: Type.Optional(Type.String({ pattern: "^(?:[1-9]|[1-9][0-9]|1[0-9][0-9]|200)$" })),
  },
  { additionalProperties: false },
);
export type RevisionListQueryValue = Static<typeof RevisionListQuery>;

/** Newest first. `nextBefore` is the `before` value for the next page, or null at the first commit. */
export const RevisionListResponse = Type.Object(
  { revisions: Type.Array(RevisionSummary), nextBefore: Type.Union([GitRevisionId, Type.Null()]) },
  { additionalProperties: false },
);
export type RevisionListResponseValue = Static<typeof RevisionListResponse>;

/** One structured change in a JSON file: `before` is the revision's value, `after` the working value. */
export const JsonChange = Type.Object(
  {
    pointer: Type.String(),
    kind: Type.Union([Type.Literal("added"), Type.Literal("removed"), Type.Literal("changed")]),
    before: Type.Optional(Type.Unknown()),
    after: Type.Optional(Type.Unknown()),
  },
  { additionalProperties: false },
);
export type JsonChangeValue = Static<typeof JsonChange>;

/**
 * One changed file, comparing the revision (old) with the working state (new). `status: "added"` means
 * the file exists only in the working state. JSON files carry `changes` (capped, see `truncated`);
 * text and JSON files carry a unified line `patch`; binary files carry neither.
 */
export const FileDiff = Type.Object(
  {
    path: Type.String(),
    status: Type.Union([Type.Literal("added"), Type.Literal("removed"), Type.Literal("modified")]),
    format: Type.Union([Type.Literal("json"), Type.Literal("text"), Type.Literal("binary")]),
    changes: Type.Optional(Type.Array(JsonChange)),
    truncated: Type.Optional(Type.Boolean()),
    patch: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type FileDiffValue = Static<typeof FileDiff>;

/** GET /api/houses/:houseId/revisions/:revisionId/diff */
export const RevisionDiffResponse = Type.Object(
  { revisionId: GitRevisionId, files: Type.Array(FileDiff) },
  { additionalProperties: false },
);
export type RevisionDiffResponseValue = Static<typeof RevisionDiffResponse>;

/** POST /api/houses/:houseId/revisions/:revisionId/restore */
export const RestoreRevisionBody = Type.Object(
  { expectedRevision: RevisionNumber },
  { additionalProperties: false },
);
export type RestoreRevisionBodyValue = Static<typeof RestoreRevisionBody>;

/** The restored document carries a new, higher revision counter; `commit` is the "Restore to …" revision. */
export const RestoreRevisionResponse = Type.Object(
  { revision: RevisionNumber, document: House, commit: RevisionSummary },
  { additionalProperties: false },
);
export type RestoreRevisionResponseValue = Static<typeof RestoreRevisionResponse>;
