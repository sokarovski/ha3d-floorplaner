// The house document, house.json (spec/builder/model.md, spec/builder/object-models.md#house-housejson).
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "./annotations";
import { propertyGroups } from "./propertyGroups";
import { BuildingFloor } from "./floor";
import { Angle, Choice, Id, Length, SurfaceMaterial } from "./values";

/** 6 (Phase 19.2): floors lose `roofCuts` (converted into roofs); roofs gain `cutsWalls` and `wallsRise`. */
export const currentHouseSchemaVersion = 6;

export const lengthUnits = ["mm", "cm", "m", "in", "ft"] as const;
export type LengthUnit = (typeof lengthUnits)[number];

export const MaterialPreset = Type.Object(
  {
    id: Id,
    name: Type.String({ title: "Name", minLength: 1, maxLength: 120, ...hp({ editor: "text" }) }),
    material: SurfaceMaterial(),
  },
  { additionalProperties: false },
);

export const HouseLocation = Type.Object(
  {
    /** Legacy labels from the removed city picker (before 2026-11-17): kept when present, never written. */
    countryCode: Type.Optional(Type.String({ pattern: "^[A-Z]{2}$" })),
    city: Type.Optional(Type.String()),
    latitudeDeg: Type.Number({ minimum: -90, maximum: 90 }),
    longitudeDeg: Type.Number({ minimum: -180, maximum: 180 }),
    timeZone: Type.String({ minLength: 1 }),
  },
  {
    additionalProperties: false,
    title: "Location",
    ...hp({ editor: "location", group: "environment", order: 1 }),
  },
);

export const HouseEnvironment = Type.Object(
  {
    location: HouseLocation,
    northRotationDeg: Angle({ title: "North", minimum: 0, maximum: 360, default: 0, order: 2 }),
    sun: Type.Object(
      {
        timeMode: Choice(
          [
            ["fixed", "Fixed time"],
            ["current", "Current time"],
          ],
          { title: "Sun time", default: "fixed", order: 1 },
        ),
        fixedLocalDateTime: Type.String({
          title: "Date and time",
          pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2})?$",
          default: "2020-06-01T12:00:00",
          ...hp({ editor: "dateTime", order: 2, visibleWhen: { property: "timeMode", equals: "fixed" } }),
        }),
      },
      { additionalProperties: false, title: "Sun", ...hp({ order: 3 }) },
    ),
  },
  { additionalProperties: false, title: "Environment", ...hp({ group: "environment" }) },
);

export const House = Type.Object(
  {
    schemaVersion: Type.Literal(currentHouseSchemaVersion, { ...hp({ hidden: true }) }),
    revision: Type.Integer({ minimum: 0, ...hp({ hidden: true }) }),
    id: Id,
    name: Type.String({
      title: "Name",
      minLength: 1,
      maxLength: 120,
      ...hp({ editor: "text", group: "general", order: 0 }),
    }),
    units: Choice(
      [
        ["mm", "Millimeters (mm)"],
        ["cm", "Centimeters (cm)"],
        ["m", "Meters (m)"],
        ["in", "Inches (in)"],
        ["ft", "Feet (ft)"],
      ],
      { title: "Units", default: "mm", group: "general", order: 1 },
    ),
    /** Height new walls start at (Phase 4.4); absent means the 2400 mm fallback (`effectiveWallHeightMm`). */
    defaultWallHeightMm: Type.Optional(
      Length({
        title: "Default wall height",
        minimum: 100,
        maximum: 10000,
        group: "general",
        order: 2,
        description: "New walls start at this height. Empty: 2.40 m.",
      }),
    ),
    capMaterial: SurfaceMaterial({ title: "Cap material", group: "appearance", order: 1 }),
    environment: HouseEnvironment,
    materialPresets: Type.Array(MaterialPreset, { ...hp({ hidden: true }) }),
    floors: Type.Array(BuildingFloor, { minItems: 1, ...hp({ hidden: true }) }),
  },
  {
    additionalProperties: false,
    title: "House",
    ...hp({
      groups: propertyGroups("general", "environment", "appearance").groups,
    }),
  },
);

export type HouseDocument = Static<typeof House>;
export type MaterialPresetValue = Static<typeof MaterialPreset>;
export type HouseEnvironmentValue = Static<typeof HouseEnvironment>;
