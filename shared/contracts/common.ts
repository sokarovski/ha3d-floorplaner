// Shared building blocks for the HTTP contracts (spec/architecture/api.md#conventions).
// Browser-safe: these modules import only TypeBox and other shared/ code.
import Type from "typebox";
import type { Static } from "typebox";
import { idPattern } from "../domain/schemas/values";

export { idPattern };

/** A stable entity ID such as `h_7f3k2q` (never a filesystem path). */
export const IdString = Type.String({ pattern: idPattern });

/** A Git commit hash, used as the revision ID in the history routes. */
export const gitRevisionPattern = "^[0-9a-f]{40}$";
export const GitRevisionId = Type.String({ pattern: gitRevisionPattern });

/** The integer document revision counter stored in `house.json` and the preferences document. */
export const RevisionNumber = Type.Integer({ minimum: 0 });

/** An ISO 8601 timestamp produced by the server. */
export const Timestamp = Type.String({ format: "date-time" });

/** A trimmed display name (houses, images). The server trims and NFC-normalizes before storing. */
export const DisplayName = Type.String({ minLength: 1, maxLength: 120 });

export const HouseParams = Type.Object({ houseId: IdString });
export type HouseParamsValue = Static<typeof HouseParams>;

export const apiErrorCodes = [
  "validation",
  "badRequest",
  "notFound",
  "staleRevision",
  "referenced",
  "nameTaken",
  "tooLarge",
  "unsupportedMedia",
  "unsupportedVersion",
  "invalidDocument",
  "internal",
  "unavailable",
  "sourceRevisionChanged",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const ApiErrorCodeSchema = Type.Union([
  Type.Literal("validation"),
  Type.Literal("badRequest"),
  Type.Literal("notFound"),
  Type.Literal("staleRevision"),
  Type.Literal("referenced"),
  Type.Literal("nameTaken"),
  Type.Literal("tooLarge"),
  Type.Literal("unsupportedMedia"),
  Type.Literal("unsupportedVersion"),
  Type.Literal("invalidDocument"),
  Type.Literal("internal"),
  Type.Literal("unavailable"),
  Type.Literal("sourceRevisionChanged"),
]);

/** One field problem: a JSON Pointer into the request (`/body/...`, `/params/...`, `/querystring/...`) plus a message. */
export const ValidationIssue = Type.Object(
  { pointer: Type.String(), message: Type.String() },
  { additionalProperties: false },
);
export type ValidationIssueValue = Static<typeof ValidationIssue>;

/**
 * The single error envelope of every non-2xx response. `details` depends on the code:
 * `validation` → `{ errors: ValidationIssue[] }`, `staleRevision` → `{ currentRevision }`,
 * `referenced` → `{ references: string[] }` (JSON Pointers into house.json).
 */
export const ErrorEnvelope = Type.Object(
  {
    error: Type.Object(
      {
        code: ApiErrorCodeSchema,
        message: Type.String(),
        details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type ErrorEnvelopeValue = Static<typeof ErrorEnvelope>;
