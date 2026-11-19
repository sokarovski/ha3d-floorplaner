// Stored house documents (Phase 16.14, Phase 19.2): what a Home Assistant copy may hold. Copies made before house
// schema version 6 keep version 5, whose floors carried `roofCuts` and whose roofs had no mode (`cutsWalls`,
// `wallsRise`); copies made before version 5 keep version 4, whose areas also carried `kind` and `staircase` (the
// staircase area). The HA integration accepts all three (custom_components/homeplan/schemas.json is generated from
// StoredHouse), and the HA viewer migrates every loaded document to the current version (readStoredHouseEnvelope)
// before it renders; the builder's exports always send the current version.
import Type from "typebox";
import { Area } from "./area";
import { BuildingFloor } from "./floor";
import { House } from "./house";
import { Roof } from "./roof";

/** A roof cut of a version-5 (or older) floor (kept loose: it is migrated into a roof). */
const RoofCutV5 = Type.Record(Type.String(), Type.Unknown());

/** A version-5 roof: today's fields without the mode (filled by the migration). */
const RoofV5 = Type.Object(
  {
    ...Roof.properties,
    cutsWalls: Type.Optional(Type.Boolean()),
    wallsRise: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const BuildingFloorV5 = Type.Object(
  {
    ...BuildingFloor.properties,
    roofCuts: Type.Array(RoofCutV5),
    roofs: Type.Optional(Type.Array(RoofV5)),
  },
  { additionalProperties: false },
);

/** A house document of schema version 5 (before roof cuts became roofs). */
export const HouseV5 = Type.Object(
  {
    ...House.properties,
    schemaVersion: Type.Literal(5),
    floors: Type.Array(BuildingFloorV5, { minItems: 1 }),
  },
  { additionalProperties: false },
);

/** A version-4 area: today's fields plus the staircase area's `kind` and instance (kept loose: it is migrated). */
const AreaV4 = Type.Object(
  {
    ...Area.properties,
    kind: Type.Optional(Type.Union([Type.Literal("room"), Type.Literal("staircase")])),
    staircase: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

const BuildingFloorV4 = Type.Object(
  { ...BuildingFloorV5.properties, areas: Type.Array(AreaV4) },
  { additionalProperties: false },
);

/** A house document of schema version 4 (before stairs became objects). */
export const HouseV4 = Type.Object(
  {
    ...House.properties,
    schemaVersion: Type.Literal(4),
    floors: Type.Array(BuildingFloorV4, { minItems: 1 }),
  },
  { additionalProperties: false },
);

/** A house document an HA copy may store: the current version, version 5 or version 4. */
export const StoredHouse = Type.Union([House, HouseV5, HouseV4]);
