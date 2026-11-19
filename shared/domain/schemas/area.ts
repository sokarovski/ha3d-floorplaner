// Area and its floor-shape group (spec/builder/object-models.md#area). Stairs are objects (house schema version 5,
// Phase 16.14). An area is a room unless `kind` is "yard" (Phase 17.2, spec/builder/features/yards.md): set when
// Add yard creates it and never edited; its walls are drawn as fences of the yard's `fence` style.
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "./annotations";
import { propertyGroups } from "./propertyGroups";
import { Carpet } from "./carpet";
import { AreableInstance } from "./instances";
import { Light } from "./light";
import { ObjectGroup } from "./objectGroup";
import { Shape } from "./shapes";
import { Wall } from "./wall";
import { Angle, Choice, Hidden, Id, Name, SurfaceMaterial, Vector2Length } from "./values";

export const FloorSurface = Type.Object(
  {
    id: Id,
    material: SurfaceMaterial({ title: "Flooring", group: "appearance", order: 1 }),
    shapes: Type.Array(Shape, { ...hp({ hidden: true }) }),
    carpets: Type.Array(Carpet, { ...hp({ hidden: true }) }),
  },
  {
    additionalProperties: false,
    title: "Floor",
    ...hp({ groups: propertyGroups("appearance").groups }),
  },
);

/** Fence styles of a yard (Phase 17.2): each draws one built-in fence template along the yard's walls. */
export const fenceStyles = ["picket", "panel", "hedge", "slatted", "trellis", "wire"] as const;
export type FenceStyle = (typeof fenceStyles)[number];

export const Area = Type.Object(
  {
    id: Id,
    /** Absent: a room. "yard" (Phase 17.2): outdoors, lawn, fences instead of walls, no slab, no ceiling. */
    kind: Type.Optional(Type.Literal("yard", { readOnly: true, ...hp({ hidden: true }) })),
    name: Name(),
    /** A yard's fence style (Phase 17.2); absent reads as picket. Shown for yards only. */
    fence: Type.Optional(
      Choice(
        [
          ["picket", "Wooden picket"],
          ["panel", "Metal panel"],
          ["hedge", "Hedge"],
          ["slatted", "Horizontal timber"],
          ["trellis", "Diamond trellis"],
          ["wire", "Wire mesh"],
        ],
        {
          title: "Fence",
          default: "picket",
          group: "appearance",
          order: 1,
          editor: "select",
          visibleWhen: { property: "kind", equals: "yard" },
        },
      ),
    ),
    positionMm: Vector2Length({ title: "Position", group: "placement", order: 1 }),
    rotationDeg: Angle({ title: "Rotation", group: "placement", order: 2 }),
    floor: FloorSurface,
    walls: Type.Array(Wall, { ...hp({ hidden: true }) }),
    objects: Type.Array(AreableInstance, { ...hp({ hidden: true }) }),
    /** Named sets of this area's objects that move together (optional, so older houses stay valid). */
    objectGroups: Type.Optional(Type.Array(ObjectGroup, { ...hp({ hidden: true }) })),
    lights: Type.Array(Light, { ...hp({ hidden: true }) }),
    hidden: Hidden,
  },
  {
    additionalProperties: false,
    title: "Area",
    ...hp({
      groups: propertyGroups("general", "placement", "appearance").groups,
    }),
  },
);

export type AreaValue = Static<typeof Area>;
export type FloorSurfaceValue = Static<typeof FloorSurface>;
