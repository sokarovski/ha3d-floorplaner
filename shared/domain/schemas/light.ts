// Light (spec/builder/object-models.md#light, D08).
import Type from "typebox";
import type { Static } from "typebox";
import { lampTypeChoices } from "../lighting/lampTypes";
import { hp } from "./annotations";
import { propertyGroups } from "./propertyGroups";
import { Angle, Choice, ColorRgb, Hidden, Id, Length, Name, TemplateRef, Vector2Length } from "./values";

export const colorModes = ["fixedWhite", "colorTemperature", "rgb"] as const;
export type ColorMode = (typeof colorModes)[number];

const colorModeChoices: readonly (readonly [ColorMode, string])[] = [
  ["fixedWhite", "Fixed white"],
  ["colorTemperature", "Color temperature"],
  ["rgb", "RGB"],
];

export const Light = Type.Object(
  {
    id: Id,
    name: Name(),
    fixture: Type.Union([TemplateRef, Type.Null()], {
      title: "Fixture",
      ...hp({ editor: "templateVersion", group: "general", order: 1 }),
    }),
    fixtureVisible: Type.Boolean({
      title: "Show fixture",
      default: true,
      ...hp({ editor: "toggle", group: "general", order: 2 }),
    }),
    geometry: Type.Object(
      {
        type: Choice(
          [
            ["point", "Point"],
            ["spot", "Spot"],
            ["linear", "Linear"],
          ],
          { title: "Type", default: "point", order: 1 },
        ),
        lengthMm: Length({ title: "Length", exclusiveMinimum: 0, default: 1000, order: 2, inlineLabel: "L" }),
        widthMm: Length({ title: "Width", exclusiveMinimum: 0, default: 12, order: 3, inlineLabel: "W" }),
        // Phase 13.3: where a linear light shines, turned about its own long axis (right-hand rule about the
        // heading): 0 straight down (absent = 0, the look before 13.3), 90 horizontal to the left of the
        // heading, 180 straight up, 270 to the right.
        facingDeg: Type.Optional(
          Type.Integer({
            title: "Facing",
            description: "0° shines down, 90° left of the heading, 180° up, 270° right",
            minimum: 0,
            maximum: 360,
            default: 0,
            ...hp({
              editor: "angle",
              quantity: "angle",
              order: 4,
              visibleWhen: { property: "type", equals: "linear" },
            }),
          }),
        ),
      },
      { additionalProperties: false, title: "Emitter", ...hp({ group: "emitter", order: 1 }) },
    ),
    positionMm: Vector2Length({ title: "Position", group: "placement", order: 1 }),
    elevationMm: Length({ title: "Elevation", group: "placement", order: 2 }),
    rotationDeg: Angle({ title: "Heading", group: "placement", order: 3 }),
    // Phase 17.3 (wall-mounted lights, spec/builder/features/lighting.md#wall-mounted-lights-phase-173): a light
    // mounted on one face of one of its area's walls (an outdoor lantern on the exterior face). Absent = free. The
    // position stays the stored truth: the renderer and the handles project it onto the face at its height.
    mount: Type.Optional(
      Choice(
        [
          ["free", "Free"],
          ["wall", "Wall"],
        ],
        { title: "Mount", default: "free", group: "placement", order: 0.1 },
      ),
    ),
    wallId: Type.Optional(
      Type.String({
        title: "Wall",
        ...hp({
          editor: "reference",
          referenceKind: "wall",
          group: "placement",
          order: 0.2,
          visibleWhen: { property: "mount", equals: "wall" },
        }),
      }),
    ),
    wallSide: Type.Optional(
      Choice(
        [
          ["interior", "Interior"],
          ["exterior", "Exterior"],
        ],
        {
          title: "Wall side",
          default: "interior",
          group: "placement",
          order: 0.3,
          visibleWhen: { property: "mount", equals: "wall" },
        },
      ),
    ),
    spot: Type.Object(
      {
        tiltDeg: Angle({ title: "Tilt", minimum: 0, maximum: 180, default: 0, order: 1 }),
        beamAngleDeg: Type.Number({
          title: "Beam angle",
          minimum: 1,
          maximum: 160,
          default: 40,
          ...hp({ editor: "slider", quantity: "angle", unitSuffix: "°", order: 2 }),
        }),
        softEdge: Type.Number({
          title: "Soft edge",
          minimum: 0,
          maximum: 1,
          default: 0.3,
          ...hp({ editor: "slider", step: 0.01, order: 3 }),
        }),
      },
      { additionalProperties: false, title: "Spot", ...hp({ group: "emitter", order: 2 }) },
    ),
    // Phase 8.9: what lamp the light holds (optional; absent = untyped, drawn as before). Choosing it sets the
    // white and snaps the output to a preset; the power is the real lamp's watts (lampTypes.ts).
    lampType: Type.Optional(
      Choice(lampTypeChoices, { title: "Lamp type", group: "light", order: 0, editor: "select" }),
    ),
    lampWatts: Type.Optional(
      Type.Number({
        title: "Lamp power",
        exclusiveMinimum: 0,
        maximum: 5000,
        ...hp({ editor: "lampPower", unitSuffix: "W", group: "light", order: 0.5 }),
      }),
    ),
    renderCapabilities: Type.Object(
      {
        colorModes: Type.Array(Choice(colorModeChoices), {
          title: "Color modes",
          minItems: 1,
          uniqueItems: true,
          ...hp({ editor: "multiSelect", order: 1 }),
        }),
      },
      { additionalProperties: false, title: "Capabilities", ...hp({ group: "light", order: 1 }) },
    ),
    defaults: Type.Object(
      {
        enabled: Type.Boolean({ title: "Enabled", default: true, ...hp({ editor: "toggle", order: 1 }) }),
        brightness: Type.Number({
          title: "Brightness",
          minimum: 0,
          maximum: 1,
          default: 1,
          ...hp({ editor: "slider", step: 0.01, order: 2 }),
        }),
        outputLumens: Type.Number({
          title: "Output",
          exclusiveMinimum: 0,
          maximum: 200000,
          default: 800,
          ...hp({ editor: "number", quantity: "luminousFlux", unitSuffix: "lm", order: 3 }),
        }),
        color: Type.Object(
          {
            mode: Choice(colorModeChoices, {
              title: "Color mode",
              default: "fixedWhite",
              order: 1,
              editor: "select",
            }),
            kelvin: Type.Number({
              title: "Temperature",
              minimum: 1500,
              maximum: 9000,
              default: 3000,
              ...hp({
                editor: "slider",
                quantity: "colorTemperature",
                unitSuffix: "K",
                step: 50,
                order: 2,
                visibleWhen: { property: "mode", equals: "colorTemperature" },
              }),
            }),
            rgb: ColorRgb({ title: "Color", order: 3, visibleWhen: { property: "mode", equals: "rgb" } }),
          },
          { additionalProperties: false, title: "Color", ...hp({ order: 4 }) },
        ),
      },
      { additionalProperties: false, title: "Defaults", ...hp({ group: "light", order: 2 }) },
    ),
    hidden: Hidden,
  },
  {
    additionalProperties: false,
    title: "Light",
    ...hp({
      groups: propertyGroups("general", "emitter", "placement", "light").groups,
    }),
  },
);

export type LightValue = Static<typeof Light>;

export const LightGroup = Type.Object(
  {
    id: Id,
    name: Name(),
    memberIds: Type.Array(Type.String(), {
      title: "Members",
      uniqueItems: true,
      ...hp({ editor: "reference", referenceKind: "light", multiple: true, group: "general", order: 1 }),
    }),
  },
  {
    additionalProperties: false,
    title: "Light group",
    ...hp({ groups: propertyGroups("general").groups }),
  },
);

export type LightGroupValue = Static<typeof LightGroup>;
