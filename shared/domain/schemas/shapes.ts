// Source shapes of a floor shape or carpet (spec/builder/object-models.md#shapes-in-area-editor-and-carpets).
// Conventions (spec/builder/features/geometry-groups.md#coordinate-conventions): rectangle and circle
// positions are their centers; rectangles rotate about their center; polygon vertices are local to
// positionMm and stored counterclockwise.
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "./annotations";
import { propertyGroups } from "./propertyGroups";
import { Angle, Id, Length, Vector2Length } from "./values";

export const RectangleShape = Type.Object(
  {
    id: Id,
    type: Type.Literal("rectangle", { readOnly: true, ...hp({ hidden: true }) }),
    positionMm: Vector2Length({ title: "Position", group: "placement", order: 1 }),
    rotationDeg: Angle({ title: "Rotation", group: "placement", order: 2 }),
    widthMm: Length({
      title: "Width",
      exclusiveMinimum: 0,
      maximum: 200000,
      group: "size",
      order: 3,
      inlineLabel: "W",
    }),
    heightMm: Length({
      title: "Depth",
      exclusiveMinimum: 0,
      maximum: 200000,
      group: "size",
      order: 4,
      inlineLabel: "D",
    }),
  },
  {
    additionalProperties: false,
    title: "Rectangle",
    ...hp({ groups: propertyGroups("placement", "size").groups }),
  },
);

export const CircleShape = Type.Object(
  {
    id: Id,
    type: Type.Literal("circle", { readOnly: true, ...hp({ hidden: true }) }),
    positionMm: Vector2Length({ title: "Center", group: "placement", order: 1 }),
    radiusMm: Length({ title: "Radius", exclusiveMinimum: 0, maximum: 100000, group: "size", order: 3 }),
  },
  {
    additionalProperties: false,
    title: "Circle",
    ...hp({ groups: propertyGroups("placement", "size").groups }),
  },
);

export const PolygonVertex = Type.Object(
  { id: Id, x: Type.Number(), y: Type.Number() },
  { additionalProperties: false },
);

export const PolygonShape = Type.Object(
  {
    id: Id,
    type: Type.Literal("polygon", { readOnly: true, ...hp({ hidden: true }) }),
    positionMm: Vector2Length({ title: "Position", group: "placement", order: 1 }),
    rotationDeg: Angle({ title: "Rotation", group: "placement", order: 2 }),
    vertices: Type.Array(PolygonVertex, { minItems: 3, ...hp({ hidden: true }) }),
  },
  {
    additionalProperties: false,
    title: "Polygon",
    ...hp({ groups: propertyGroups("placement", "size").groups }),
  },
);

export const Shape = Type.Union([RectangleShape, CircleShape, PolygonShape]);

export type RectangleShapeValue = Static<typeof RectangleShape>;
export type CircleShapeValue = Static<typeof CircleShape>;
export type PolygonShapeValue = Static<typeof PolygonShape>;
export type PolygonVertexValue = Static<typeof PolygonVertex>;
export type ShapeValue = Static<typeof Shape>;

/** Fixed edge names of a rectangle, in counterclockwise order. */
export const rectangleEdgeNames = ["bottom", "right", "top", "left"] as const;
export type RectangleEdgeName = (typeof rectangleEdgeNames)[number];
