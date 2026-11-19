// Wall guide (spec/builder/object-models.md#wall). sourceEdge.edge is a rectangle edge name
// ("bottom" | "right" | "top" | "left") or a polygon vertex-ID pair "<fromVertexId>><toVertexId>".
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "./annotations";
import { propertyGroups } from "./propertyGroups";
import { WallableInstance } from "./instances";
import { Shape } from "./shapes";
import { Choice, Hidden, Id, Length, Name, SurfaceMaterial } from "./values";

export const SourceEdge = Type.Object(
  { shapeId: Type.String(), edge: Type.String({ minLength: 1 }) },
  { additionalProperties: false, readOnly: true, ...hp({ hidden: true }) },
);

/**
 * One end of a wall's span, attached to a corner of its source edge (D04, Phase 3): measured from the edge's
 * start or end vertex. An end at a corner (offsetMm 0) follows that corner when the floor shape changes.
 */
export const SpanEnd = Type.Object(
  {
    anchor: Type.Union([Type.Literal("start"), Type.Literal("end")]),
    offsetMm: Type.Number({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export type SpanEndValue = Static<typeof SpanEnd>;

/**
 * A relief on a wall face (D21, wall relief groups): one group of 2D shapes drawn on one face and combined into
 * a single outline, with one signed depth (positive sticks out, negative goes in, zero is flat colour only) and
 * one material. The shapes live in the face frame: x along the wall from its span start, y up from the floor.
 */
export const WallRelief = Type.Object(
  {
    id: Id,
    name: Name({ group: "general", order: 1 }),
    face: Choice(
      [
        ["interior", "Interior"],
        ["exterior", "Exterior"],
      ],
      { title: "Face", default: "interior", group: "placement", order: 1 },
    ),
    depthMm: Length({
      title: "Depth",
      minimum: -2000,
      maximum: 2000,
      description: "Positive sticks out of the wall, negative goes into it, zero is flat",
      group: "size",
      order: 1,
    }),
    material: SurfaceMaterial({ title: "Material", group: "appearance", order: 1 }),
    shapes: Type.Array(Shape, { minItems: 1, ...hp({ hidden: true }) }),
    hidden: Hidden,
  },
  {
    additionalProperties: false,
    title: "Wall feature",
    ...hp({
      groups: propertyGroups("general", "placement", "size", "appearance").groups,
    }),
  },
);

export type WallReliefValue = Static<typeof WallRelief>;

export const Wall = Type.Object(
  {
    id: Id,
    sourceEdge: SourceEdge,
    spanMm: Type.Object(
      { start: SpanEnd, end: SpanEnd },
      { additionalProperties: false, ...hp({ hidden: true }) },
    ),
    heightMm: Length({
      title: "Height",
      minimum: 1,
      maximum: 20000,
      default: 2400,
      group: "size",
      order: 1,
    }),
    thicknessMm: Length({
      title: "Thickness",
      minimum: 1,
      maximum: 2000,
      default: 200,
      group: "size",
      order: 2,
    }),
    /**
     * Rise to roof (Phase 19.5, owner 2026-11-19): absent or on, the wall follows its floor roof's Walls rise; off,
     * it keeps its own height under the roof (clipping by the underside still applies). Optional, so older houses stay
     * valid.
     */
    riseToRoof: Type.Optional(
      Type.Boolean({
        title: "Rise to roof",
        default: true,
        description:
          "Under a roof whose walls rise, this wall extends up to the roof's underside. Off: it keeps its own height (the roof still cuts it).",
        ...hp({ editor: "toggle", group: "size", order: 1.5 }),
      }),
    ),
    alignment: Choice(
      [
        ["outside", "Outside"],
        ["inside", "Inside"],
        ["center", "Center"],
      ],
      { title: "Alignment", default: "outside", group: "placement", order: 1 },
    ),
    materials: Type.Object(
      {
        interior: SurfaceMaterial({ title: "Interior", order: 1 }),
        exterior: SurfaceMaterial({ title: "Exterior", order: 2 }),
      },
      { additionalProperties: false, title: "Materials", ...hp({ group: "appearance" }) },
    ),
    objects: Type.Array(WallableInstance, { ...hp({ hidden: true }) }),
    /** Boxes and niches on the wall's faces (Phase 5.0); optional, so older houses stay valid. */
    reliefs: Type.Optional(Type.Array(WallRelief, { ...hp({ hidden: true }) })),
    hidden: Hidden,
  },
  {
    additionalProperties: false,
    title: "Wall",
    ...hp({
      groups: propertyGroups("general", "placement", "size", "appearance").groups,
    }),
  },
);

export type WallValue = Static<typeof Wall>;
export type WallAlignment = WallValue["alignment"];
