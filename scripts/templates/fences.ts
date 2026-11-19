// Yard fences and gates (Phase 17.2, spec/builder/features/yards.md#fences): the built-in fence segment of each
// fence style and two gates. A fence segment is an Areable of kind "fence" that no picker offers: the renderer
// places one per stretch of a yard's wall (shared/geometry/yardFences.ts), its width the stretch length and its
// height the wall's. Each is authored at its default width with one repeat unit; the unit repeats by a count
// formula from the width (D17 counted repeat), dependent rails `extendsWith` it and the end post
// `follows` it; multi-finish panels/hedges repeat a merged mesh per finish. Every part stretches with the axes
// (a ruled node is otherwise rigid), so the grown asset maps to
// the exact width and height and a unit (posts included) keeps nearly its own size at any length. A unit holds several pickets, a whole panel or a run of hedge in one mesh, so a long fence is a
// few meshes, not hundreds. Gates are Wallables of kind "gate" (offered by the Gate picker on a yard's fences):
// the fence leaves the gate's width open, and the gate stands in that gap.
import { boxes, floorAreable, prism, wallableBase } from "./helpers";
import { hedgeBody, hedgeLeaves, hedgeStems } from "./fenceFoliage";
import { templates as gardenFences } from "./gardenFences";
import type { Geo, MaterialSpec, TemplateSpec } from "./helpers";
import type { TemplateMetadata } from "@shared/domain/templates/metadata";

const paintedWood: MaterialSpec = { color: [0.86, 0.85, 0.8], roughness: 0.7 };
const blackMetal: MaterialSpec = { color: [0.05, 0.055, 0.06], roughness: 0.45, metallic: 0.7 };

const fenceBase: Pick<
  TemplateMetadata,
  "schemaVersion" | "contract" | "attachment" | "opening" | "flip" | "kind" | "category"
> = {
  ...floorAreable,
  kind: "fence",
  category: "Garden",
};

/** A picket with a pointed top, x0..x1 wide, from the ground to `top` (the point), z0..z1 deep. */
const picket = (g: Geo, x0: number, x1: number, top: number, z0: number, z1: number): void =>
  prism(
    g,
    [
      [x0, 0],
      [x1, 0],
      [x1, top - (x1 - x0) / 2],
      [(x0 + x1) / 2, top],
      [x0, top - (x1 - x0) / 2],
    ],
    "x",
    "y",
    "z",
    z0,
    z1,
  );

// Wooden picket: units of five 90 mm pickets every 140 mm (700 mm per unit) between 70 mm posts, two rails
// behind. At the default 2100 mm: three units.
const pickets = 5;
const picketPitch = 140;
const picketUnit = pickets * picketPitch;
const picketFence: TemplateSpec = {
  id: "fence-picket",
  view: "front",
  metadata: {
    ...fenceBase,
    label: "Picket Fence",
    tags: ["fence", "picket", "wood", "yard", "garden"],
    product: { description: "White wooden picket fence; the pickets repeat along the yard's wall." },
    resize: {
      x: { mode: "scale", minMm: 50, maxMm: 100000, defaultMm: 2100 },
      y: { mode: "scale", minMm: 400, maxMm: 2000, defaultMm: 1000 },
      z: { mode: "fixed" },
    },
    materialSlots: { wood: "Painted wood" },
    formulas: { units: `max(1, floor(widthMm / ${String(picketUnit)} + 0.5))` },
  },
  materials: { "Painted wood": paintedWood },
  parts: [
    {
      name: "Pickets",
      material: "Painted wood",
      rule: { repeat: { offsetMm: { x: picketUnit }, count: "units" }, stretch: { x: true, y: true } },
      build: (g) => {
        for (let index = 0; index < pickets; index += 1) {
          const x0 = -1050 + 25 + index * picketPitch;
          picket(g, x0, x0 + 90, 980, 0, 22);
        }
      },
    },
    {
      name: "Rails",
      material: "Painted wood",
      rule: { extendsWith: "Pickets", stretch: { x: true, y: true } },
      build: boxes(
        [
          [-1050, 180, -30],
          [1050, 260, 0],
        ],
        [
          [-1050, 680, -30],
          [1050, 760, 0],
        ],
      ),
    },
    {
      name: "StartPost",
      material: "Painted wood",
      rule: { stretch: { x: true, y: true } },
      build: boxes([
        [-1050, 0, -40],
        [-980, 1000, 30],
      ]),
    },
    {
      name: "EndPost",
      material: "Painted wood",
      rule: { follows: "Pickets", stretch: { x: true, y: true } },
      build: boxes([
        [980, 0, -40],
        [1050, 1000, 30],
      ]),
    },
  ],
};

// Metal panel: welded panels 2000 mm wide (a 60 mm post, top and bottom rails, vertical bars every 125 mm), one
// panel per unit. At the default 2000 mm: one panel.
const panelUnit = 2000;
const panelFence: TemplateSpec = {
  id: "fence-panel",
  view: "front",
  metadata: {
    ...fenceBase,
    label: "Metal Panel Fence",
    tags: ["fence", "metal", "panel", "steel", "yard", "garden"],
    product: { description: "Black welded steel panels between posts; the panels repeat along the wall." },
    resize: {
      x: { mode: "scale", minMm: 50, maxMm: 100000, defaultMm: panelUnit },
      y: { mode: "scale", minMm: 600, maxMm: 2500, defaultMm: 1200 },
      z: { mode: "fixed" },
    },
    materialSlots: { metal: "Black metal" },
    formulas: { panels: `max(1, floor(widthMm / ${String(panelUnit)} + 0.5))` },
  },
  materials: { "Black metal": blackMetal },
  parts: [
    {
      name: "Panel",
      material: "Black metal",
      rule: { repeat: { offsetMm: { x: panelUnit }, count: "panels" }, stretch: { x: true, y: true } },
      build: (g) => {
        const x0 = -1000;
        boxes(
          [
            [x0, 0, -30],
            [x0 + 60, 1200, 30],
          ],
          [
            [x0 + 60, 80, -12],
            [x0 + panelUnit, 110, 12],
          ],
          [
            [x0 + 60, 1060, -12],
            [x0 + panelUnit, 1090, 12],
          ],
        )(g);
        for (let x = x0 + 60 + 62; x < x0 + panelUnit - 20; x += 125)
          boxes([
            [x - 8, 80, -8],
            [x + 8, 1160, 8],
          ])(g);
      },
    },
    {
      name: "EndPost",
      material: "Black metal",
      rule: { follows: "Panel", stretch: { x: true, y: true } },
      build: boxes([
        [940, 0, -30],
        [1000, 1200, 30],
      ]),
    },
  ],
};

// Hedge: metre runs of rounded, uneven foliage, wrapped in small folded leaves in three green tones.
// Geometry is merged per finish, opaque and seeded; there are no per-leaf objects or alpha-texture cards.
const hedgeUnit = 1000;
const hedgeFence: TemplateSpec = {
  id: "fence-hedge",
  view: "front",
  metadata: {
    ...fenceBase,
    label: "Hedge",
    tags: ["hedge", "bush", "fence", "green", "yard", "garden"],
    product: {
      description:
        "Dense evergreen hedge with rounded uneven growth, small folded leaves, shaded inner foliage and woody stems.",
    },
    resize: {
      x: { mode: "scale", minMm: 50, maxMm: 100000, defaultMm: 2 * hedgeUnit },
      y: {
        mode: "scale",
        minMm: 600,
        maxMm: 2500,
        defaultMm: 1300,
        description: "Hedge height; about 1.0–1.6 m for a garden hedge.",
        quickPicks: [1000, 1300, 1600, 2000],
      },
      z: { mode: "fixed" },
    },
    materialSlots: { leaves: "Leaves", tips: "Fresh leaves", inner: "Dark leaves", stems: "Stems" },
    formulas: { runs: `max(1, floor(widthMm / ${String(hedgeUnit)} + 0.5))` },
  },
  materials: {
    Leaves: { color: [0.038, 0.125, 0.023], roughness: 0.78, doubleSided: true },
    "Fresh leaves": { color: [0.055, 0.16, 0.032], roughness: 0.72, doubleSided: true },
    "Dark leaves": { color: [0.027, 0.095, 0.018], roughness: 0.9, doubleSided: true },
    Stems: { color: [0.11, 0.065, 0.028], roughness: 0.95 },
  },
  parts: [
    {
      name: "Run",
      material: "Dark leaves",
      build: (g: Geo) => {
        hedgeBody(2)(g);
        hedgeLeaves(2)(g);
      },
    },
    {
      name: "Leaves",
      material: "Leaves",
      build: (g: Geo) => {
        hedgeBody(0)(g);
        hedgeLeaves(0)(g);
      },
    },
    {
      name: "FreshLeaves",
      material: "Fresh leaves",
      build: (g: Geo) => {
        hedgeBody(1)(g);
        hedgeLeaves(1)(g);
      },
    },
    { name: "Stems", material: "Stems", build: hedgeStems },
  ].map((part) => ({
    ...part,
    rule: { repeat: { offsetMm: { x: hedgeUnit }, count: "runs" }, stretch: { x: true, y: true } },
  })),
};

const gateMetadata = (
  label: string,
  description: string,
  widthMm: number,
  heightMm: number,
): Pick<TemplateMetadata, "kind" | "label" | "category" | "tags" | "product" | "resize" | "flip"> => ({
  kind: "gate",
  label,
  category: "Garden",
  tags: ["gate", "fence", "yard", "garden"],
  product: { description },
  resize: {
    x: { mode: "scale", minMm: 600, maxMm: 4000, defaultMm: widthMm },
    y: { mode: "scale", minMm: 600, maxMm: 2500, defaultMm: heightMm },
    z: { mode: "fixed", wallPosition: "center" },
  },
  flip: { x: true, z: true },
});

// Picket gate: a framed leaf of seven pickets with a diagonal brace, 1000 × 1000 mm, between two posts.
const picketGate: TemplateSpec = {
  id: "gate-picket",
  view: "front",
  hostDepthMm: 100,
  metadata: {
    ...wallableBase,
    ...gateMetadata("Picket Gate", "White wooden garden gate for a picket fence or a hedge.", 1000, 1000),
    attachment: { ...wallableBase.attachment, defaultPlacement: { bottomMm: 0 } },
    materialSlots: { wood: "Painted wood", hardware: "Black metal" },
  },
  materials: { "Painted wood": paintedWood, "Black metal": blackMetal },
  parts: [
    {
      name: "Posts",
      material: "Painted wood",
      build: boxes(
        [
          [-500, 0, -40],
          [-430, 1060, 40],
        ],
        [
          [430, 0, -40],
          [500, 1060, 40],
        ],
      ),
    },
    {
      name: "Leaf",
      material: "Painted wood",
      build: (g) => {
        for (let index = 0; index < 7; index += 1) {
          const x0 = -420 + 8 + index * 120;
          picket(g, x0, x0 + 90, 980, 0, 22);
        }
        boxes(
          [
            [-420, 160, -30],
            [420, 240, 0],
          ],
          [
            [-420, 660, -30],
            [420, 740, 0],
          ],
        )(g);
        prism(
          g,
          [
            [-410, 200],
            [-350, 200],
            [410, 700],
            [350, 700],
          ],
          "x",
          "y",
          "z",
          -26,
          -4,
        );
      },
    },
    {
      name: "Latch",
      material: "Black metal",
      build: boxes([
        [330, 560, 22],
        [420, 600, 40],
      ]),
    },
  ],
};

// Metal panel gate: a welded frame with bars every 125 mm, 1200 × 1200 mm, between two posts.
const panelGate: TemplateSpec = {
  id: "gate-panel",
  view: "front",
  hostDepthMm: 100,
  metadata: {
    ...wallableBase,
    ...gateMetadata("Metal Panel Gate", "Black welded steel gate for a metal panel fence.", 1200, 1200),
    attachment: { ...wallableBase.attachment, defaultPlacement: { bottomMm: 0 } },
    materialSlots: { metal: "Black metal" },
  },
  materials: { "Black metal": blackMetal },
  parts: [
    {
      name: "Gate",
      material: "Black metal",
      build: (g) => {
        boxes(
          [
            [-600, 0, -35],
            [-530, 1250, 35],
          ],
          [
            [530, 0, -35],
            [600, 1250, 35],
          ],
          [
            [-520, 60, -15],
            [520, 100, 15],
          ],
          [
            [-520, 1110, -15],
            [520, 1150, 15],
          ],
          [
            [-520, 60, -15],
            [-490, 1150, 15],
          ],
          [
            [490, 60, -15],
            [520, 1150, 15],
          ],
        )(g);
        for (let x = -490 + 62; x < 490 - 20; x += 125)
          boxes([
            [x - 8, 100, -8],
            [x + 8, 1110, 8],
          ])(g);
      },
    },
  ],
};

export const templates: readonly TemplateSpec[] = [
  picketFence,
  panelFence,
  hedgeFence,
  ...gardenFences,
  picketGate,
  panelGate,
];
