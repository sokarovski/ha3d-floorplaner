// Roof (Phase 19.1, owner 2026-11-18; spec/builder/features/roofs.md): a flat sheet with fold lines on a building
// floor. Its outline (a ring of roof points) is divided by break lines (segments between roof points) into faces;
// every point has a height above the roof's eave height, and each face is a plane through its points. The 3D roof
// (faces, auto-folds, thickness, ribs) is derived from this by shared/geometry/roofSurface.ts and never stored.
//
// Coordinates: points are in the floor's local plan frame (mm), like the floor's guides and roof cuts. Heights:
// `eaveHeightMm` is the roof's base above the floor's finished floor; a point's `heightMm` (≥ 0, the guard rail)
// is measured from it, so changing the eave height moves the whole roof. The authored sheet is the roof's
// underside; the top is `thicknessMm` above it (measured vertically).
//
// A floor holds its roofs in an optional `roofs` list (absent = none). Phase 19.1 allows one roof, on the top floor;
// the list leaves room for attached canopies on any floor (19.3) as further entries.
//
// Mode (Phase 19.2, schema version 6): `cutsWalls` (Cuts walls, the top floor's roof) makes the underside the height
// limit of the floor's walls; `wallsRise` (Walls rise to the roof, default on) extends the walls up to the underside
// where it is above them. Attached canopies (19.3) are roofs with Cuts walls off: they cut nothing.
//
// Phase 19.3 (spec/builder/features/roofs.md): a line may be a step line (its two sides have their own heights: the
// raised side is `stepMm` higher along it, and the roof makes a vertical face there); holes and roof windows are
// stored on the 2D roof sheet (plan, floor frame), never in 3D, so their height always comes from the surface under
// them (owner, phase-19.md "When a hole or roof window no longer fits").
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "./annotations";
import { propertyGroups } from "./propertyGroups";
import { Choice, Id, Length, Name, SurfaceMaterial, idPattern } from "./values";

/** Limits (implementation conventions): point heights, eave height, thickness and rib sizes. */
export const maxRoofPointHeightMm = 30000;
export const maxRoofEaveHeightMm = 30000;
export const minRoofThicknessMm = 10;
export const maxRoofThicknessMm = 1000;
export const maxRoofPoints = 400;

const PointRef = Type.String({ pattern: idPattern, ...hp({ hidden: true }) });

/** A pullable roof point: an outline corner, a break-line end, or where break lines cross or meet the outline. */
export const RoofPoint = Type.Object(
  {
    id: Id,
    x: Type.Number({ ...hp({ hidden: true }) }),
    y: Type.Number({ ...hp({ hidden: true }) }),
    heightMm: Length({
      title: "Height",
      minimum: 0,
      maximum: maxRoofPointHeightMm,
      group: "general",
      order: 1,
      description: "Above the roof's eave height.",
    }),
  },
  {
    additionalProperties: false,
    title: "Roof point",
    ...hp({ groups: propertyGroups("general").groups }),
  },
);

const step = { property: "kind", equals: "step" } as const;

/** Step lines (19.3): the highest step (mm, implementation convention). */
export const maxRoofStepMm = 10000;

/**
 * A break line (fold) between two roof points, or (19.3) a step line: its raised side (left or right, seen from `a`
 * toward `b`) is `stepMm` higher along it, and the roof makes a vertical face there in the roof's side material (or
 * the plain wall material). Absent `kind` reads as a break line.
 */
export const RoofLine = Type.Object(
  {
    id: Id,
    a: PointRef,
    b: PointRef,
    kind: Type.Optional(
      Choice(
        [
          ["break", "Break line"],
          ["step", "Step line"],
        ],
        { title: "Kind", default: "break", group: "general", order: 1 },
      ),
    ),
    stepMm: Type.Optional(
      Length({
        title: "Step height",
        minimum: 10,
        maximum: maxRoofStepMm,
        default: 500,
        group: "general",
        order: 2,
        visibleWhen: step,
        description: "How much higher the raised side is along the line.",
      }),
    ),
    raisedSide: Type.Optional(
      Choice(
        [
          ["left", "Left"],
          ["right", "Right"],
        ],
        {
          title: "Raised side",
          default: "left",
          group: "general",
          order: 3,
          visibleWhen: step,
        },
      ),
    ),
    stepFace: Type.Optional(
      Choice(
        [
          ["side", "Roof sides"],
          ["wall", "Wall"],
        ],
        { title: "Step face", default: "side", group: "general", order: 4, visibleWhen: step },
      ),
    ),
  },
  {
    additionalProperties: false,
    title: "Break line",
    ...hp({ groups: propertyGroups("general").groups }),
  },
);

const SheetPoint = Type.Object({ x: Type.Number(), y: Type.Number() }, { additionalProperties: false });

/** Limits of holes and roof windows (implementation conventions). */
export const maxRoofHolePoints = 256;
export const minRoofWindowMm = 300;
export const maxRoofWindowMm = 4000;

/**
 * A hole (19.3): a closed shape on the roof sheet (plan, floor frame), cut through the roof along its outline
 * projected onto the faces under it.
 */
export const RoofHole = Type.Object(
  {
    id: Id,
    name: Name(),
    points: Type.Array(SheetPoint, { minItems: 3, maxItems: maxRoofHolePoints, ...hp({ hidden: true }) }),
  },
  { additionalProperties: false, title: "Roof hole", ...hp({ groups: propertyGroups("general").groups }) },
);

/**
 * A roof window (19.3): a roof-window template (D17) on one flat face, oriented to its plane. `positionMm` is the
 * window's centre on the roof sheet (plan); its width runs level along the face, its length up the slope. The
 * template's pitch limits are copied in when it is placed (like a fixture's light defaults, D08), so the no-fit rules
 * read the instance alone.
 */
export const RoofWindow = Type.Object(
  {
    id: Id,
    name: Name(),
    templateId: Type.String({ minLength: 1, ...hp({ hidden: true }) }),
    templateVersion: Type.Integer({ minimum: 1, ...hp({ hidden: true }) }),
    positionMm: Type.Object(
      { x: Type.Number(), y: Type.Number() },
      { additionalProperties: false, ...hp({ hidden: true }) },
    ),
    widthMm: Length({
      title: "Width",
      minimum: minRoofWindowMm,
      maximum: maxRoofWindowMm,
      group: "general",
      order: 1,
      inlineLabel: "W",
    }),
    lengthMm: Length({
      title: "Length",
      minimum: minRoofWindowMm,
      maximum: maxRoofWindowMm,
      group: "general",
      order: 2,
      inlineLabel: "L",
      description: "Up the slope.",
    }),
    minPitchDeg: Type.Number({ minimum: 0, maximum: 90, ...hp({ hidden: true }) }),
    maxPitchDeg: Type.Number({ minimum: 0, maximum: 90, ...hp({ hidden: true }) }),
  },
  { additionalProperties: false, title: "Roof window", ...hp({ groups: propertyGroups("general").groups }) },
);

const ribs = { property: "design", equals: "open" } as const;
const closed = { property: "design", equals: "closed" } as const;

export const Roof = Type.Object(
  {
    id: Id,
    name: Name(),
    design: Choice(
      [
        ["closed", "Closed"],
        ["open", "Open"],
      ],
      { title: "Design", default: "closed", group: "general", order: 1 },
    ),
    cutsWalls: Type.Boolean({
      title: "Cuts walls",
      default: true,
      description: "The roof's underside is the height limit of this floor's walls.",
      ...hp({ editor: "toggle", group: "general", order: 1.5 }),
    }),
    wallsRise: Type.Boolean({
      title: "Walls rise",
      default: true,
      description: "Walls under the roof extend up to its underside (gable ends fill to the ridge).",
      ...hp({
        editor: "toggle",
        group: "general",
        order: 1.6,
        visibleWhen: { property: "cutsWalls", equals: true },
      }),
    }),
    eaveHeightMm: Length({
      title: "Eave height",
      minimum: 0,
      maximum: maxRoofEaveHeightMm,
      group: "general",
      order: 2,
      description: "The roof's base above the floor; point heights are measured from it.",
    }),
    thicknessMm: Length({
      title: "Thickness",
      minimum: minRoofThicknessMm,
      maximum: maxRoofThicknessMm,
      group: "general",
      order: 3,
      description: "Top to underside (measured vertically).",
    }),
    topMaterial: SurfaceMaterial({ title: "Top", group: "materials", order: 1 }),
    bottomMaterial: SurfaceMaterial({ title: "Underside", group: "materials", order: 2 }),
    sideMaterial: SurfaceMaterial({ title: "Sides", group: "materials", order: 3, visibleWhen: closed }),
    ribHeightMm: Length({
      title: "Rib height",
      minimum: 10,
      maximum: 600,
      group: "ribs",
      order: 1,
      inlineLabel: "H",
      visibleWhen: ribs,
    }),
    ribWidthMm: Length({
      title: "Rib width",
      minimum: 10,
      maximum: 400,
      group: "ribs",
      order: 2,
      inlineLabel: "W",
      visibleWhen: ribs,
    }),
    ribSpacingMm: Length({
      title: "Rib spacing",
      minimum: 100,
      maximum: 5000,
      group: "ribs",
      order: 3,
      visibleWhen: ribs,
    }),
    ribMaterial: Choice(
      [
        ["wood", "Wood"],
        ["metal", "Metal"],
      ],
      { title: "Rib material", default: "wood", group: "ribs", order: 4, visibleWhen: ribs },
    ),
    points: Type.Array(RoofPoint, { minItems: 3, maxItems: maxRoofPoints, ...hp({ hidden: true }) }),
    /** The outline: point IDs counterclockwise in plan (a simple ring). */
    outline: Type.Array(PointRef, { minItems: 3, ...hp({ hidden: true }) }),
    lines: Type.Array(RoofLine, { ...hp({ hidden: true }) }),
    /** Holes (19.3), absent = none. */
    holes: Type.Optional(Type.Array(RoofHole, { maxItems: 200, ...hp({ hidden: true }) })),
    /** Roof windows (19.3), absent = none. */
    windows: Type.Optional(Type.Array(RoofWindow, { maxItems: 200, ...hp({ hidden: true }) })),
  },
  {
    additionalProperties: false,
    title: "Roof",
    ...hp({ groups: propertyGroups("general", "materials", "ribs").groups }),
  },
);

export type RoofValue = Static<typeof Roof>;
export type RoofPointValue = Static<typeof RoofPoint>;
export type RoofLineValue = Static<typeof RoofLine>;
export type RoofDesign = RoofValue["design"];
export type RoofHoleValue = Static<typeof RoofHole>;
export type RoofWindowValue = Static<typeof RoofWindow>;
