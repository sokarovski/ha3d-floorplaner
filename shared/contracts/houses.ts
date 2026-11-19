// House cards and lifecycle routes (spec/architecture/api.md#houses).
import Type from "typebox";
import type { Static } from "typebox";
import { DisplayName, IdString, RevisionNumber, Timestamp } from "./common";

/** A readable, valid house. `revision` is the `house.json` counter used as `expectedRevision` for rename. */
export const ValidHouseCard = Type.Object(
  {
    status: Type.Literal("ok"),
    id: IdString,
    name: Type.String(),
    floorCount: Type.Integer({ minimum: 1 }),
    revision: RevisionNumber,
    modifiedAt: Timestamp,
  },
  { additionalProperties: false },
);

/**
 * A house folder whose `house.json` is missing, unreadable, invalid, or newer than the server.
 * It is shown as a warning card and can still be moved to trash. `id` is the folder name; when the
 * folder name is not a valid ID the card cannot be addressed by any route.
 */
export const InvalidHouseCard = Type.Object(
  {
    status: Type.Literal("invalid"),
    id: Type.String(),
    modifiedAt: Timestamp,
    problem: Type.Object(
      {
        code: Type.Union([Type.Literal("invalidDocument"), Type.Literal("unsupportedVersion")]),
        message: Type.String(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const HouseCard = Type.Union([ValidHouseCard, InvalidHouseCard]);
export type HouseCardValue = Static<typeof HouseCard>;
export type ValidHouseCardValue = Static<typeof ValidHouseCard>;
export type InvalidHouseCardValue = Static<typeof InvalidHouseCard>;

/** GET /api/houses: most recently modified first. */
export const HouseListResponse = Type.Object(
  { houses: Type.Array(HouseCard) },
  { additionalProperties: false },
);
export type HouseListResponseValue = Static<typeof HouseListResponse>;

/** POST /api/houses → 201 with the new card. */
export const CreateHouseBody = Type.Object({ name: DisplayName }, { additionalProperties: false });
export type CreateHouseBodyValue = Static<typeof CreateHouseBody>;

/** POST /api/houses/:houseId/clone → 201 with the new card; without a name the clone is "<name> (copy)". */
export const CloneHouseBody = Type.Object(
  { name: Type.Optional(DisplayName) },
  { additionalProperties: false },
);
export type CloneHouseBodyValue = Static<typeof CloneHouseBody>;

/** PATCH /api/houses/:houseId */
export const RenameHouseBody = Type.Object(
  { name: DisplayName, expectedRevision: RevisionNumber },
  { additionalProperties: false },
);
export type RenameHouseBodyValue = Static<typeof RenameHouseBody>;

export const RenameHouseResponse = Type.Object(
  { revision: RevisionNumber, house: ValidHouseCard },
  { additionalProperties: false },
);
export type RenameHouseResponseValue = Static<typeof RenameHouseResponse>;

/** A trashed house: its card plus when it was moved to trash. */
export const TrashedHouse = Type.Object(
  { house: HouseCard, trashedAt: Timestamp },
  { additionalProperties: false },
);
export type TrashedHouseValue = Static<typeof TrashedHouse>;

/** GET /api/trash/houses: most recently trashed first. */
export const TrashListResponse = Type.Object(
  { houses: Type.Array(TrashedHouse) },
  { additionalProperties: false },
);
export type TrashListResponseValue = Static<typeof TrashListResponse>;
