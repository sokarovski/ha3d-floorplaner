// Building floor: one entry in the house's floors list.
// Placement and slab (Phase 16, owner 2026-11-18; D03): a floor sits at one placement relative to the house (plan
// offset and finished-floor elevation, no rotation) and carries a slab extruded downward from its finished floor.
// The four fields are optional so documents saved before Phase 16 stay valid at the same schema version; reading
// a house fills them (fillFloorDefaults, shared/domain/house/floorDefaults.ts) and the accessors in
// shared/domain/house/floorPlacement.ts supply the same defaults wherever a document may still lack them.
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "./annotations";
import { propertyGroups } from "./propertyGroups";
import { Area } from "./area";
import { Guide } from "./guide";
import { LightGroup } from "./light";
import { Roof } from "./roof";
import { Id, Length, SurfaceMaterial, Vector2Length } from "./values";

/** Slab thickness when a floor sets none, and its allowed range (owner, 2026-11-18). */
export const defaultSlabThicknessMm = 200;
export const maxSlabThicknessMm = 1000;
/** Elevation limit (implementation convention): ±100 m around the house's zero. */
export const maxFloorElevationMm = 100000;

export const BuildingFloor = Type.Object(
  {
    id: Id,
    name: Type.String({
      title: "Name",
      minLength: 1,
      maxLength: 64,
      ...hp({ editor: "text", group: "general", order: 0 }),
    }),
    /** Plan offset of the floor's local frame in the house (mm); absent means { x: 0, y: 0 }. */
    positionMm: Type.Optional(Vector2Length({ title: "Position", group: "placement", order: 1 })),
    /** Finished-floor elevation above the house's zero (mm); absent means 0. Floors are ordered by it. */
    elevationMm: Type.Optional(
      Length({
        title: "Elevation",
        minimum: -maxFloorElevationMm,
        maximum: maxFloorElevationMm,
        default: 0,
        group: "placement",
        order: 2,
        description: "Height of this floor's finished floor in the house.",
      }),
    ),
    /** Slab thickness below the finished floor (mm); absent means 200; 0 draws no slab. */
    slabThicknessMm: Type.Optional(
      Length({
        title: "Slab thickness",
        minimum: 0,
        maximum: maxSlabThicknessMm,
        default: defaultSlabThicknessMm,
        group: "slab",
        order: 1,
        description: "0: no slab.",
      }),
    ),
    /** Material of the slab's edges and underside (and any slab top outside the room floors). */
    slabMaterial: Type.Optional(SurfaceMaterial({ title: "Slab material", group: "slab", order: 2 })),
    areas: Type.Array(Area, { ...hp({ hidden: true }) }),
    lightGroups: Type.Array(LightGroup, { ...hp({ hidden: true }) }),
    guides: Type.Array(Guide, { ...hp({ hidden: true }) }),
    /**
     * Roofs (Phase 19.1, spec/builder/features/roofs.md): optional, absent = none. One roof, on the top floor; attached
     * canopies (19.3) will add entries. Schema version 6 (Phase 19.2) replaced the floor's roof cuts with roofs.
     */
    roofs: Type.Optional(Type.Array(Roof, { ...hp({ hidden: true }) })),
  },
  {
    additionalProperties: false,
    title: "Floor",
    ...hp({ groups: propertyGroups("general", "placement", "slab").groups }),
  },
);

export type BuildingFloorValue = Static<typeof BuildingFloor>;
