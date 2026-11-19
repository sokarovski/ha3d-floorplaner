// Template instances: Wallable (doors, windows) and Areable (objects, stairs, floor openings)
// (spec/builder/object-models.md).
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "./annotations";
import { AmbientEffect } from "./effects";
import { propertyGroups } from "./propertyGroups";
import {
  Angle,
  Choice,
  Flip,
  Hidden,
  Id,
  Length,
  MaterialOverrides,
  Name,
  TemplateParameters,
  Vector2Length,
} from "./values";

const templateFields = {
  templateId: Type.String({ minLength: 1, readOnly: true, ...hp({ hidden: true }) }),
  templateVersion: Type.Integer({
    minimum: 1,
    title: "Template",
    ...hp({ editor: "templateVersion", group: "template", order: 1 }),
  }),
  parameters: TemplateParameters,
  flip: Flip,
  materialOverrides: MaterialOverrides,
};

const instanceGroups = hp({
  groups: propertyGroups("general", "placement", "template", "appearance").groups,
});

/** Areable objects add the Staircase group (a stair's floor-cut switches, Phase 16.14). */
const areableGroups = hp({
  groups: propertyGroups("general", "placement", "staircase", "template", "appearance").groups,
});

const isStair = { property: "floorCut", equals: "stair" } as const;

/** A door or window hosted by a wall. distanceAlongWallMm is measured from the wall's start to the opening's center. */
export const WallableInstance = Type.Object(
  {
    id: Id,
    name: Name(),
    ...templateFields,
    placement: Type.Object(
      {
        distanceAlongWallMm: Length({ title: "Along wall", group: "placement", order: 1 }),
        bottomMm: Length({ title: "Bottom", minimum: 0, group: "placement", order: 2 }),
      },
      { additionalProperties: false, title: "Placement", ...hp({ group: "placement" }) },
    ),
  },
  { additionalProperties: false, title: "Opening", ...instanceGroups },
);

export const AreableInstance = Type.Object(
  {
    id: Id,
    name: Name(),
    ...templateFields,
    attachment: Type.Object(
      {
        host: Choice(
          [
            ["floor", "Floor"],
            ["wall", "Wall"],
            ["overhead", "Overhead"],
          ],
          { title: "Host", default: "floor", group: "placement", order: 1 },
        ),
        wallId: Type.Optional(
          Type.String({
            title: "Wall",
            ...hp({
              editor: "reference",
              referenceKind: "wall",
              group: "placement",
              order: 2,
              visibleWhen: { property: "host", equals: "wall" },
            }),
          }),
        ),
        hostSide: Type.Optional(
          Choice(
            [
              ["interior", "Interior"],
              ["exterior", "Exterior"],
            ],
            {
              title: "Wall side",
              default: "interior",
              group: "placement",
              order: 3,
              visibleWhen: { property: "host", equals: "wall" },
            },
          ),
        ),
      },
      { additionalProperties: false, title: "Attachment", ...hp({ group: "placement", order: 1 }) },
    ),
    positionMm: Vector2Length({ title: "Position", group: "placement", order: 2 }),
    elevationMm: Length({ title: "Elevation", group: "placement", order: 3 }),
    rotationDeg: Angle({ title: "Rotation", group: "placement", order: 4 }),
    hidden: Hidden,
    /**
     * What the object cuts out of floors (Phase 16.14, spec/builder/features/staircase-areas.md): "stair" for a
     * Staircasable template, "opening" for a template that declares `floorCut`. Set on insertion; absent for every
     * other object.
     */
    floorCut: Type.Optional(
      Choice(
        [
          ["stair", "Staircase"],
          ["opening", "Floor opening"],
        ],
        { title: "Floor cut", readOnly: true, hidden: true },
      ),
    ),
    /** A floor opening's outline (from its template's `floorCut.shape`); absent = rectangle. */
    floorCutShape: Type.Optional(
      Choice(
        [
          ["rectangle", "Rectangle"],
          ["ellipse", "Round"],
        ],
        { title: "Opening shape", readOnly: true, hidden: true },
      ),
    ),
    /** A stair's Cut floor above: every other floor its height span crosses is cut (absent = on). */
    cutFloorAbove: Type.Optional(
      Type.Boolean({
        title: "Cut floor above",
        default: true,
        description: "Cuts the floor the stair reaches, and any floor it passes through",
        ...hp({ editor: "toggle", group: "staircase", order: 1, visibleWhen: isStair }),
      }),
    ),
    /** A stair's Cut floor below: the floor it stands on is cut, for a stair going down (absent = off). */
    cutFloorBelow: Type.Optional(
      Type.Boolean({
        title: "Cut floor below",
        default: false,
        description: "Cuts the floor the stair stands on, for a stair going down",
        ...hp({ editor: "toggle", group: "staircase", order: 2, visibleWhen: isStair }),
      }),
    ),
    /** Ambient effects (D24); each is its own entity, edited when selected in the tree. */
    effects: Type.Optional(Type.Array(AmbientEffect, { maxItems: 8, ...hp({ hidden: true }) })),
  },
  { additionalProperties: false, title: "Object", ...areableGroups },
);

export type WallableInstanceValue = Static<typeof WallableInstance>;
export type AreableInstanceValue = Static<typeof AreableInstance>;
