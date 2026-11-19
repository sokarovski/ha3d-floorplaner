// Carpet (Floorable), a flat shape-built surface on the area's floor.
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "./annotations";
import { propertyGroups } from "./propertyGroups";
import { Shape } from "./shapes";
import { Angle, Hidden, Id, Name, SurfaceMaterial, Vector2Length } from "./values";

export const Carpet = Type.Object(
  {
    id: Id,
    name: Name(),
    positionMm: Vector2Length({ title: "Position", group: "placement", order: 1 }),
    rotationDeg: Angle({ title: "Rotation", group: "placement", order: 2 }),
    material: SurfaceMaterial({ title: "Material", group: "appearance", order: 1 }),
    shapes: Type.Array(Shape, { minItems: 1, ...hp({ hidden: true }) }),
    hidden: Hidden,
  },
  {
    additionalProperties: false,
    title: "Carpet",
    ...hp({
      groups: propertyGroups("general", "placement", "appearance").groups,
    }),
  },
);

export type CarpetValue = Static<typeof Carpet>;
