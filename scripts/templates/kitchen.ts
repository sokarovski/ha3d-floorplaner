// Kitchen family (Phase 9.2): fitted units in the owner's pale-ash look, rebuilt from the kitchen we tested with
// templates. Base cabinet, one-door upper cabinet (stacked in pairs; the edge-handle option is the
// above-fridge cabinet), drawer unit with an optional open shelf gap, sink base, oven and hob, fridge column,
// extractor strip (under an upper cabinet), tile backsplash, and the coffee corner machines.
//
// Axes: x is the width, centred; y is up from the floor (or the mounting height); z runs from the wall (0,
// the back contact) to the front. Cabinets attach to the wall by default (owner, 2026-11-17); floor units
// also allow the floor (an island).
import { box, boxes, cylinder, frustum, vertex, wallAreable } from "./helpers";
import type { Geo, MaterialSpec, PartSpec, TemplateSpec, V3 } from "./helpers";
import type { MaterialSlot, NodeRule, TemplateMetadata } from "@shared/domain/templates/metadata";

// ---------------------------------------------------------------------------------------------
// Materials: the owner's pale-ash kitchen plus the finishes offered as presets.

const finishes: Readonly<Record<string, MaterialSpec>> = {
  "Pale ash": { color: [0.597, 0.497, 0.347], roughness: 0.65 },
  "Ash carcass": { color: [0.468, 0.397, 0.275], roughness: 0.7 },
  Oak: { color: [0.46, 0.3, 0.15], roughness: 0.6 },
  Walnut: { color: [0.19, 0.105, 0.055], roughness: 0.55 },
  "Matte white": { color: [0.86, 0.86, 0.84], roughness: 0.7 },
  Anthracite: { color: [0.055, 0.06, 0.065], roughness: 0.6 },
  "Sage green": { color: [0.29, 0.35, 0.26], roughness: 0.65 },
};
const worktops: Readonly<Record<string, MaterialSpec>> = {
  "Warm stone": { color: [0.558, 0.527, 0.445], roughness: 0.82 },
  "Oak block": { color: [0.42, 0.26, 0.12], roughness: 0.6 },
  "White quartz": { color: [0.82, 0.81, 0.78], roughness: 0.3 },
  "Black granite": { color: [0.03, 0.03, 0.035], roughness: 0.35 },
  Concrete: { color: [0.4, 0.4, 0.38], roughness: 0.85 },
};
const handles: Readonly<Record<string, MaterialSpec>> = {
  Aluminium: { color: [0.665, 0.687, 0.701], roughness: 0.72, metallic: 0.5 },
  "Black metal": { color: [0.02, 0.02, 0.022], roughness: 0.4, metallic: 0.6 },
  Brass: { color: [0.62, 0.45, 0.2], roughness: 0.35, metallic: 1 },
};
const plinth: MaterialSpec = { color: [0.03, 0.033, 0.036], roughness: 0.6, metallic: 0.1 };
const silver: MaterialSpec = { color: [0.423, 0.456, 0.474], roughness: 0.3, metallic: 0.8 };
const blackGlass: MaterialSpec = { color: [0.009, 0.013, 0.017], roughness: 0.18, metallic: 0.1 };
const steel: MaterialSpec = { color: [0.665, 0.701, 0.73], roughness: 0.34, metallic: 0.62 };

const frontPresets = ["Pale ash", "Oak", "Walnut", "Matte white", "Anthracite", "Sage green"];
const carcassPresets = ["Ash carcass", "Pale ash", "Oak", "Matte white", "Anthracite"];
const worktopPresets = Object.keys(worktops);
const handlePresets = Object.keys(handles);

const cabinetMaterials: Readonly<Record<string, MaterialSpec>> = {
  ...finishes,
  ...handles,
  Plinth: plinth,
};

const slot = (material: string, title: string, presets: string[]): MaterialSlot => ({
  material,
  title,
  choosable: true,
  presets,
  allowColor: true,
  allowTexture: true,
});
const carcassSlot = slot("Ash carcass", "Carcass", carcassPresets);
const frontsSlot = slot("Pale ash", "Doors and fronts", frontPresets);
const worktopSlot = slot("Warm stone", "Worktop", worktopPresets);
const metalSlot = (title: string): MaterialSlot => ({
  material: "Aluminium",
  title,
  choosable: true,
  presets: handlePresets,
  allowColor: true,
  allowTexture: false,
});
const handlesSlot = metalSlot("Handles");

/** Wall-first attachment (back contact); `floor` adds the floor as a host for free-standing units. */
const attach = (floor: boolean, elevationMm: number): Pick<TemplateMetadata, "attachment"> => ({
  attachment: {
    hosts: floor ? ["wall", "floor"] : ["wall"],
    contact: "back",
    defaultHostSide: "interior",
    defaultPlacement: { elevationMm },
  },
});

const lengthEditor = { editor: "length", quantity: "length" } as const;

// ---------------------------------------------------------------------------------------------
// Local geometry helpers.

/** Flat ring (annulus) facing up or down at height y, centred at (cx, cz) in plan. */
const annulus = (
  g: Geo,
  cx: number,
  cz: number,
  y: number,
  inner: number,
  outer: number,
  up: boolean,
  segments = 48,
): void => {
  const normal: V3 = [0, up ? 1 : -1, 0];
  const ring: [number, number][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    ring.push([
      vertex(g, [cx + inner * c, y, cz + inner * s], normal, cx + inner * c, cz + inner * s),
      vertex(g, [cx + outer * c, y, cz + outer * s], normal, cx + outer * c, cz + outer * s),
    ]);
  }
  for (let i = 0; i < segments; i += 1) {
    const [a0, a1] = ring[i] ?? [];
    const [b0, b1] = ring[i + 1] ?? [];
    if (a0 === undefined || a1 === undefined || b0 === undefined || b1 === undefined) continue;
    g.indices.push(a0, b0, b1, a0, b1, a1);
  }
};

/** Quad from four corners (any winding; `orient` fixes it from the normal). */
const quad = (g: Geo, corners: readonly V3[], normal: V3, uv: (p: V3) => [number, number]): void => {
  const ids = corners.map((p) => {
    const [u, v] = uv(p);
    return vertex(g, p, normal, u, v);
  });
  const [a, b, c, d] = ids;
  if (a === undefined || b === undefined || c === undefined || d === undefined) return;
  g.indices.push(a, b, c, a, c, d);
};

/** A plan rectangle slab (x0..x1, z0..z1, y0..y1) with a round cutout of radius r at (cx, cz). */
const slabWithHole = (
  g: Geo,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  cx: number,
  cz: number,
  r: number,
): void => {
  const segments = 48;
  const angles = new Set<number>();
  for (let i = 0; i < segments; i += 1) angles.add((i / segments) * Math.PI * 2);
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ] as const) {
    const angle = Math.atan2(z - cz, x - cx);
    angles.add(angle < 0 ? angle + Math.PI * 2 : angle);
  }
  const sorted = [...angles].sort((a, b) => a - b);
  const edge = (angle: number): [number, number] => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const hits = [
      c > 1e-9 ? (x1 - cx) / c : Infinity,
      c < -1e-9 ? (x0 - cx) / c : Infinity,
      s > 1e-9 ? (z1 - cz) / s : Infinity,
      s < -1e-9 ? (z0 - cz) / s : Infinity,
    ];
    const t = Math.min(...hits);
    return [cx + t * c, cz + t * s];
  };
  for (const [y, up] of [
    [y0, false],
    [y1, true],
  ] as const) {
    for (let i = 0; i < sorted.length; i += 1) {
      const a = sorted[i] ?? 0;
      const b = i + 1 < sorted.length ? (sorted[i + 1] ?? 0) : (sorted[0] ?? 0) + Math.PI * 2;
      const [oax, oaz] = edge(a);
      const [obx, obz] = edge(b);
      quad(
        g,
        [
          [cx + r * Math.cos(a), y, cz + r * Math.sin(a)],
          [cx + r * Math.cos(b), y, cz + r * Math.sin(b)],
          [obx, y, obz],
          [oax, y, oaz],
        ],
        [0, up ? 1 : -1, 0],
        (p) => [p[0], p[2]],
      );
    }
  }
  quad(
    g,
    [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
    ],
    [0, 0, -1],
    (p) => [p[0], p[1]],
  );
  quad(
    g,
    [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    [0, 0, 1],
    (p) => [p[0], p[1]],
  );
  quad(
    g,
    [
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0],
    ],
    [-1, 0, 0],
    (p) => [p[2], p[1]],
  );
  quad(
    g,
    [
      [x1, y0, z0],
      [x1, y0, z1],
      [x1, y1, z1],
      [x1, y1, z0],
    ],
    [1, 0, 0],
    (p) => [p[2], p[1]],
  );
  frustum(g, [cx, cz], y0, y1, r, r, { inward: true, segments });
};

/** A part made of boxes, with an optional node rule. */
const part = (
  name: string,
  material: string,
  list: readonly (readonly [V3, V3])[],
  rule?: NodeRule,
): PartSpec => ({
  name,
  material,
  build: boxes(...list),
  ...(rule === undefined ? {} : { rule }),
});

// ---------------------------------------------------------------------------------------------
// Base cabinet: plinth (90) and worktop (40) bands fixed, channel-rail handles, front layout choice.
// Measured from the owner's "Kitchen base — stretch width": 900 high, worktop 600 deep, fronts 20 mm
// with 14 mm aluminium channel rails in front (614 overall), door 630 + drawer front 90.

const baseCabinet: TemplateSpec = {
  id: "kitchen-base-cabinet",
  view: "front",
  metadata: {
    ...wallAreable,
    ...attach(true, 0),
    kind: "kitchen",
    label: "Base Cabinet",
    category: "Kitchen",
    tags: ["kitchen", "cabinet", "base unit", "worktop", "door", "drawer"],
    product: {
      description:
        "Fitted kitchen base unit with plinth, worktop, and aluminium channel-rail handles; one door with a top drawer, two doors with a drawer, or one tall door.",
    },
    resize: {
      x: {
        mode: "slice",
        startMm: 20,
        endMm: 20,
        minMm: 300,
        maxMm: 1200,
        defaultMm: 600,
        description: "Cabinet width; doors and drawer front follow it.",
        quickPicks: [300, 400, 450, 500, 600, 800, 900, 1000, 1200],
      },
      y: {
        mode: "slice",
        startMm: 108,
        endMm: 162,
        minMm: 700,
        maxMm: 1100,
        defaultMm: 900,
        description: "Height to the top of the worktop; the plinth, drawer, and worktop keep their size.",
        quickPicks: [850, 870, 900, 920],
      },
      z: {
        mode: "slice",
        startMm: 8,
        endMm: 98,
        minMm: 350,
        maxMm: 750,
        defaultMm: 614,
        description: "Overall depth including the 14 mm handle rails (a 600 mm worktop is 614 mm).",
        quickPicks: [414, 514, 614, 664],
      },
    },
    materialSlots: {
      carcass: carcassSlot,
      fronts: frontsSlot,
      worktop: worktopSlot,
      handles: handlesSlot,
      plinth: "Plinth",
    },
    properties: {
      layout: {
        type: "string",
        title: "Fronts",
        description: "Door and drawer layout of the front.",
        anyOf: [
          { const: "door-drawer", title: "Door and top drawer" },
          { const: "two-doors-drawer", title: "Two doors and top drawer" },
          { const: "door", title: "One tall door" },
        ],
        default: "door-drawer",
        "x-homeplan": { editor: "select" },
      },
    },
  },
  materials: { ...cabinetMaterials, ...worktops },
  parts: [
    part("Plinth", "Plinth", [
      [
        [-288, 0, 36],
        [288, 90, 516],
      ],
    ]),
    part("Carcass", "Ash carcass", [
      [
        [-296, 90, 8],
        [296, 860, 576],
      ],
    ]),
    part(
      "Door",
      "Pale ash",
      [
        [
          [-297, 108, 580],
          [297, 738, 600],
        ],
      ],
      { visible: "layout == 'door-drawer'" },
    ),
    part(
      "DoorPair",
      "Pale ash",
      [
        [
          [-297, 108, 580],
          [-1.5, 738, 600],
        ],
        [
          [1.5, 108, 580],
          [297, 738, 600],
        ],
      ],
      { visible: "layout == 'two-doors-drawer'" },
    ),
    part(
      "TallDoor",
      "Pale ash",
      [
        [
          [-297, 108, 580],
          [297, 843, 600],
        ],
      ],
      { visible: "layout == 'door'" },
    ),
    part(
      "DrawerFront",
      "Pale ash",
      [
        [
          [-297, 753, 580],
          [297, 843, 600],
        ],
      ],
      { visible: "layout != 'door'" },
    ),
    part(
      "DoorRail",
      "Aluminium",
      [
        [
          [-296, 732, 600],
          [296, 754, 614],
        ],
      ],
      { stretch: { x: true }, pin: { y: "end" }, visible: "layout != 'door'" },
    ),
    part("TopRail", "Aluminium", [
      [
        [-296, 841, 600],
        [296, 859, 614],
      ],
    ]),
    part("Worktop", "Warm stone", [
      [
        [-300, 860, 0],
        [300, 900, 600],
      ],
    ]),
  ],
};

// ---------------------------------------------------------------------------------------------
// Upper cabinet: one door (half of the owner's 780 mm two-door uppers), stacked in pairs. Carcass 330
// deep, door 20, channel rail 12 below the door (362 overall). The edge-handle option is the
// above-fridge cabinet (owner: 723 × 396, matte aluminium edge pull with a grip return).

const upperCabinet: TemplateSpec = {
  id: "kitchen-upper-cabinet",
  view: "front",
  metadata: {
    ...wallAreable,
    ...attach(false, 1500),
    kind: "kitchen",
    label: "Upper Cabinet",
    category: "Kitchen",
    tags: ["kitchen", "cabinet", "wall unit", "upper", "door", "above fridge"],
    product: {
      description:
        "Wall-hung kitchen cabinet with one door. Stack two (each about 390 mm) for a full-height upper; with the edge pull it is the above-fridge cabinet.",
    },
    resize: {
      x: {
        mode: "slice",
        startMm: 4,
        endMm: 4,
        minMm: 250,
        maxMm: 1200,
        defaultMm: 600,
        description: "Cabinet width.",
        quickPicks: [300, 350, 400, 450, 500, 600, 700, 800],
      },
      y: {
        mode: "slice",
        startMm: 22,
        endMm: 2,
        minMm: 200,
        maxMm: 1000,
        defaultMm: 390,
        description: "Cabinet height; two 390 mm cabinets stack to the usual 780 mm.",
        quickPicks: [300, 360, 390, 400, 600, 720, 780],
      },
      z: {
        mode: "slice",
        startMm: 0,
        endMm: 32,
        minMm: 200,
        maxMm: 650,
        defaultMm: 362,
        description: "Overall depth including the door and handle (a 330 mm carcass is 362 mm).",
        quickPicks: [312, 362, 382],
      },
    },
    materialSlots: { carcass: carcassSlot, fronts: frontsSlot, handles: handlesSlot },
    properties: {
      handle: {
        type: "string",
        title: "Handle",
        description: "Channel rail under the door, aluminium edge pull (above-fridge style), or none.",
        anyOf: [
          { const: "rail", title: "Channel rail" },
          { const: "edge", title: "Edge pull" },
          { const: "none", title: "None (push to open)" },
        ],
        default: "rail",
        "x-homeplan": { editor: "select" },
      },
    },
  },
  materials: cabinetMaterials,
  parts: [
    part("Carcass", "Ash carcass", [
      [
        [-299, 0, 0],
        [299, 390, 330],
      ],
    ]),
    part(
      "Door",
      "Pale ash",
      [
        [
          [-300, 14, 330],
          [300, 388, 350],
        ],
      ],
      { visible: "handle != 'none'" },
    ),
    part(
      "FlushDoor",
      "Pale ash",
      [
        [
          [-300, 2, 330],
          [300, 388, 350],
        ],
      ],
      { visible: "handle == 'none'" },
    ),
    part(
      "Rail",
      "Aluminium",
      [
        [
          [-299, 0, 350],
          [299, 16, 362],
        ],
      ],
      { visible: "handle == 'rail'" },
    ),
    part(
      "EdgePull",
      "Aluminium",
      [
        [
          [-298, 0, 350],
          [298, 22, 353],
        ],
        [
          [-298, 19, 353],
          [298, 22, 362],
        ],
      ],
      { visible: "handle == 'edge'" },
    ),
  ],
};

// ---------------------------------------------------------------------------------------------
// Drawer unit: the owner's 60 cm return drawers (three drawers 250 / 240 / 200 with channel rails) and
// its optional open shelf gap (owner: 170 mm with a worktop over it and a bottom shelf). The gap is the
// x end band bound to `openShelfMm`, so the overall width includes it.

const drawerUnit: TemplateSpec = {
  id: "kitchen-drawer-unit",
  view: "front",
  metadata: {
    ...wallAreable,
    ...attach(true, 0),
    kind: "kitchen",
    label: "Drawer Unit",
    category: "Kitchen",
    tags: ["kitchen", "cabinet", "base unit", "drawers", "worktop", "open shelf"],
    product: {
      description:
        "Kitchen base unit with three drawers, plinth, worktop, and channel-rail handles, with an optional open shelf gap beside it.",
    },
    resize: {
      x: {
        mode: "slice",
        startMm: 20,
        endMm: 170,
        endParameter: "openShelfMm",
        minMm: 300,
        maxMm: 1500,
        defaultMm: 600,
        title: "Overall width",
        description: "Drawers plus the open shelf gap (600 mm drawers and a 170 mm gap are 770 mm).",
        quickPicks: [400, 450, 500, 600, 800, 900],
      },
      y: {
        mode: "slice",
        startMm: 110,
        endMm: 162,
        minMm: 700,
        maxMm: 1100,
        defaultMm: 900,
        description: "Height to the top of the worktop; plinth and worktop keep their size.",
        quickPicks: [850, 870, 900, 920],
      },
      z: {
        mode: "slice",
        startMm: 8,
        endMm: 98,
        minMm: 350,
        maxMm: 750,
        defaultMm: 614,
        description: "Overall depth including the 14 mm handle rails (a 600 mm worktop is 614 mm).",
        quickPicks: [414, 514, 614, 664],
      },
    },
    materialSlots: {
      carcass: carcassSlot,
      fronts: frontsSlot,
      worktop: worktopSlot,
      handles: handlesSlot,
      plinth: "Plinth",
    },
    properties: {
      openShelfMm: {
        type: "number",
        title: "Open shelf gap",
        description:
          "Width of the open gap beside the drawers, under the same worktop, with a bottom shelf; 0 for none.",
        minimum: 0,
        maximum: 600,
        default: 0,
        "x-homeplan": { ...lengthEditor, quickPicks: [0, 150, 170, 200, 300] },
      },
    },
  },
  materials: { ...cabinetMaterials, ...worktops },
  parts: [
    part("Plinth", "Plinth", [
      [
        [-373, 0, 36],
        [203, 90, 516],
      ],
    ]),
    part("Carcass", "Ash carcass", [
      [
        [-381, 90, 8],
        [211, 860, 576],
      ],
    ]),
    part("DrawerFronts", "Pale ash", [
      [
        [-382, 110, 580],
        [212, 360, 600],
      ],
      [
        [-382, 380, 580],
        [212, 620, 600],
      ],
      [
        [-382, 637, 580],
        [212, 837, 600],
      ],
    ]),
    ...[
      [349, 371],
      [609, 631],
      [826, 848],
    ].map(([y0 = 0, y1 = 0], index) =>
      part(
        `DrawerRail${index + 1}`,
        "Aluminium",
        [
          [
            [-381, y0, 600],
            [211, y1, 614],
          ],
        ],
        { stretch: { x: true } },
      ),
    ),
    part("Worktop", "Warm stone", [
      [
        [-385, 860, 0],
        [385, 900, 600],
      ],
    ]),
    part(
      "OpenShelf",
      "Pale ash",
      [
        [
          [215, 107, 32],
          [385, 123, 567],
        ],
      ],
      { stretch: { x: true, z: true }, pin: { y: "start" }, visible: "openShelfMm > 0" },
    ),
  ],
};

// ---------------------------------------------------------------------------------------------
// Sink base (fixed): the owner's 50 cm round sink cabinet, worktop with a round cutout, steel bowl
// (390 mm, 202 deep), rim, gooseneck tap, and drain.

const sinkBase: TemplateSpec = {
  id: "kitchen-sink-base",
  view: "front",
  metadata: {
    ...wallAreable,
    ...attach(true, 0),
    kind: "kitchen",
    label: "Sink Base Cabinet",
    category: "Kitchen",
    tags: ["kitchen", "sink", "cabinet", "base unit", "tap", "round sink"],
    product: {
      description:
        "50 cm sink base unit with a round inset steel bowl, gooseneck tap, door, and false drawer front.",
    },
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: {
      carcass: carcassSlot,
      fronts: frontsSlot,
      worktop: worktopSlot,
      handles: handlesSlot,
      plinth: "Plinth",
      steel: "Steel",
    },
  },
  materials: {
    ...cabinetMaterials,
    ...worktops,
    Steel: steel,
    "Bowl wall": { color: [0.52, 0.55, 0.57], roughness: 0.32, metallic: 0.55 },
    Drain: { color: [0.025, 0.025, 0.03], roughness: 0.7, metallic: 0.1 },
  },
  parts: [
    part("Plinth", "Plinth", [
      [
        [-238, 0, 36],
        [238, 90, 516],
      ],
    ]),
    // The carcass top under the bowl sits 7 mm below the bowl floor (697): a coplanar top face at 697 would
    // z-fight with the bowl bottom and shimmer.
    part("Carcass", "Ash carcass", [
      [
        [-246, 90, 8],
        [246, 690, 576],
      ],
      [
        [-246, 690, 8],
        [-200, 860, 576],
      ],
      [
        [200, 690, 8],
        [246, 860, 576],
      ],
      [
        [-200, 690, 8],
        [200, 860, 90],
      ],
      [
        [-200, 690, 510],
        [200, 860, 576],
      ],
    ]),
    part("Door", "Pale ash", [
      [
        [-247, 108, 580],
        [247, 738, 600],
      ],
    ]),
    part("DrawerFront", "Pale ash", [
      [
        [-247, 753, 580],
        [247, 843, 600],
      ],
    ]),
    part("Rails", "Aluminium", [
      [
        [-246, 732, 600],
        [246, 754, 614],
      ],
      [
        [-246, 841, 600],
        [246, 859, 614],
      ],
    ]),
    {
      name: "Worktop",
      material: "Warm stone",
      build: (g) => slabWithHole(g, -250, 250, 0, 600, 860, 900, 0, 300, 203),
    },
    {
      name: "BowlWall",
      material: "Bowl wall",
      build: (g) => frustum(g, [0, 300], 697, 899, 185, 195, { inward: true, segments: 48 }),
    },
    {
      name: "BowlBottom",
      material: "Bowl wall",
      build: (g) => annulus(g, 0, 300, 697, 32, 185, true),
    },
    {
      name: "Rim",
      material: "Steel",
      build: (g) => {
        annulus(g, 0, 300, 911, 195, 211, true);
        frustum(g, [0, 300], 897, 911, 211, 211, { segments: 48 });
        frustum(g, [0, 300], 899, 911, 195, 195, { inward: true, segments: 48 });
      },
    },
    {
      // A recessed hole in the flat bottom: a 4 mm dark lip down from the floor (697) to a dark disc at 693.
      name: "Drain",
      material: "Drain",
      build: (g) => {
        frustum(g, [0, 300], 693, 697, 32, 32, { inward: true, segments: 48 });
        annulus(g, 0, 300, 693, 0, 32, true);
      },
    },
    {
      name: "Tap",
      material: "Steel",
      build: (g) => {
        cylinder(g, [0, 65], 901, 927, 24);
        cylinder(g, [0, 65], 927, 1200, 10);
        cylinder(g, [0, 1200], 55, 250, 10, "z");
        cylinder(g, [0, 240], 1120, 1200, 9);
      },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Oven and hob (fixed): the owner's 60 cm unit, built-in oven with black glass door and bar handle,
// control panel with two knobs and a display, induction hob with four zones.

const ovenHob: TemplateSpec = {
  id: "kitchen-oven-hob",
  view: "front",
  metadata: {
    ...wallAreable,
    ...attach(true, 0),
    kind: "kitchen",
    label: "Oven and Hob Cabinet",
    category: "Kitchen",
    tags: ["kitchen", "oven", "hob", "induction", "cooker", "appliance"],
    product: {
      description:
        "60 cm base unit with a built-in electric oven and a four-zone induction hob in the worktop.",
    },
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: {
      carcass: carcassSlot,
      fronts: frontsSlot,
      worktop: worktopSlot,
      plinth: "Plinth",
      steel: "Silver",
      glass: "Black glass",
    },
  },
  materials: {
    ...cabinetMaterials,
    ...worktops,
    Silver: silver,
    "Black glass": blackGlass,
    "Hob marks": { color: [0.35, 0.36, 0.37], roughness: 0.5, metallic: 0.3 },
  },
  parts: [
    part("Plinth", "Plinth", [
      [
        [-288, 0, 36],
        [288, 90, 516],
      ],
    ]),
    part("Carcass", "Ash carcass", [
      [
        [-296, 90, 8],
        [296, 860, 576],
      ],
    ]),
    part("BottomFront", "Pale ash", [
      [
        [-297, 95, 581],
        [297, 188, 601],
      ],
    ]),
    part("OvenFrame", "Silver", [
      [
        [-292, 190, 576],
        [292, 800, 604],
      ],
    ]),
    part("OvenDoor", "Black glass", [
      [
        [-269, 236, 604],
        [269, 680, 616],
      ],
    ]),
    part("ControlPanel", "Plinth", [
      [
        [-283, 720, 604],
        [283, 796, 618],
      ],
    ]),
    part("Display", "Black glass", [
      [
        [-47, 748, 618],
        [47, 772, 621],
      ],
    ]),
    {
      name: "Knobs",
      material: "Silver",
      build: (g) => {
        cylinder(g, [-210, 758], 618, 632, 19, "z");
        cylinder(g, [210, 758], 618, 632, 19, "z");
      },
    },
    {
      name: "Handle",
      material: "Silver",
      build: (g) => {
        box(g, [-248, 655, 630], [248, 673, 645]);
        box(g, [-236, 659, 616], [-220, 669, 630]);
        box(g, [220, 659, 616], [236, 669, 630]);
      },
    },
    part("Worktop", "Warm stone", [
      [
        [-300, 860, 0],
        [300, 900, 600],
      ],
    ]),
    part("Hob", "Black glass", [
      [
        [-276, 900, 52],
        [276, 906, 547],
      ],
    ]),
    {
      name: "HobZones",
      material: "Hob marks",
      build: (g) => {
        annulus(g, -140, 175, 906.5, 58, 64, true);
        annulus(g, 140, 175, 906.5, 58, 64, true);
        annulus(g, -140, 425, 906.5, 72, 79, true);
        annulus(g, 140, 425, 906.5, 72, 79, true);
      },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Fridge column (fixed): the owner's 70 cm silver fridge-freezer, top freezer door, lower fridge door,
// bar handles on standoffs, and a water dispenser.

const fridgeFinishes: Readonly<Record<string, MaterialSpec>> = {
  "Fridge silver": { color: [0.658, 0.694, 0.716], roughness: 0.42, metallic: 0.45 },
  "Fridge white": { color: [0.86, 0.86, 0.85], roughness: 0.35 },
  "Fridge black": { color: [0.03, 0.03, 0.035], roughness: 0.35, metallic: 0.3 },
  "Fridge stainless": { color: [0.55, 0.56, 0.57], roughness: 0.28, metallic: 0.85 },
};

const fridgeColumn: TemplateSpec = {
  id: "fridge-freezer-column",
  view: "front",
  metadata: {
    ...wallAreable,
    ...attach(true, 0),
    flip: { x: true, z: false },
    kind: "kitchen",
    label: "Fridge Freezer Column",
    category: "Kitchen",
    tags: ["kitchen", "fridge", "freezer", "appliance", "refrigerator"],
    product: {
      description:
        "70 cm freestanding fridge-freezer, 1870 mm, top freezer, water dispenser; flip for the handle side.",
    },
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: {
      body: {
        material: "Fridge silver",
        title: "Finish",
        choosable: true,
        presets: Object.keys(fridgeFinishes),
        allowColor: true,
        allowTexture: false,
      },
      trim: "Trim",
    },
  },
  materials: { ...fridgeFinishes, Trim: plinth },
  parts: [
    part("Body", "Fridge silver", [
      [
        [-350, 0, 0],
        [350, 1870, 684],
      ],
    ]),
    part("Doors", "Fridge silver", [
      [
        [-342, 1365, 680],
        [342, 1855, 704],
      ],
      [
        [-342, 140, 680],
        [342, 1350, 704],
      ],
    ]),
    part("Gasket", "Trim", [
      [
        [-342, 1352, 684],
        [342, 1363, 700],
      ],
    ]),
    part("Handles", "Fridge silver", [
      [
        [278, 1445, 719],
        [298, 1745, 739],
      ],
      [
        [280, 1455, 704],
        [296, 1475, 719],
      ],
      [
        [280, 1715, 704],
        [296, 1735, 719],
      ],
      [
        [278, 735, 719],
        [298, 1155, 739],
      ],
      [
        [280, 745, 704],
        [296, 765, 719],
      ],
      [
        [280, 1125, 704],
        [296, 1145, 719],
      ],
    ]),
    part("DispenserRecess", "Trim", [
      [
        [-100, 925, 704],
        [100, 1145, 708],
      ],
    ]),
    part("DispenserSurround", "Fridge silver", [
      [
        [-110, 910, 704],
        [110, 926, 724],
      ],
    ]),
  ],
};

// ---------------------------------------------------------------------------------------------
// Extractor strip: an integrated hood under an ordinary upper cabinet (owner's "integrated hood 60"
// bottom part): a steel body 36 mm high, an aluminium front lip, and a grease filter underneath.

const extractorStrip: TemplateSpec = {
  id: "kitchen-extractor-strip",
  view: "front",
  metadata: {
    ...wallAreable,
    ...attach(false, 1460),
    kind: "kitchen",
    label: "Extractor Strip",
    category: "Kitchen",
    tags: ["kitchen", "extractor", "hood", "cooker hood", "appliance"],
    product: {
      description:
        "Integrated cooker hood strip, 40 mm high; place it directly under an upper cabinet (1460 mm under a 1500 mm cabinet).",
    },
    resize: {
      x: {
        mode: "slice",
        startMm: 15,
        endMm: 15,
        minMm: 300,
        maxMm: 1200,
        defaultMm: 600,
        description: "Width; match the upper cabinet above it.",
        quickPicks: [500, 600, 700, 800, 900],
      },
      y: { mode: "fixed" },
      z: {
        mode: "slice",
        startMm: 0,
        endMm: 32,
        minMm: 200,
        maxMm: 650,
        defaultMm: 362,
        description: "Depth; match the upper cabinet above it (362 mm for a 330 mm carcass).",
        quickPicks: [312, 362, 382],
      },
    },
    materialSlots: {
      body: "Silver",
      lip: metalSlot("Front lip"),
      filter: "Filter",
    },
  },
  materials: {
    Silver: silver,
    ...handles,
    Filter: { color: [0.03, 0.033, 0.036], roughness: 0.6, metallic: 0.1 },
  },
  parts: [
    part("Filter", "Filter", [
      [
        [-257, 0, 40],
        [257, 2, 290],
      ],
    ]),
    part("Body", "Silver", [
      [
        [-288, 2, 0],
        [288, 38, 330],
      ],
    ]),
    part("FrontLip", "Aluminium", [
      [
        [-297, 8, 330],
        [297, 40, 362],
      ],
    ]),
  ],
};

// ---------------------------------------------------------------------------------------------
// Backsplash: a 5 mm tile panel with grout lines (fill repeats at the tile size) and the owner's warm
// tile band (130 mm, 65 mm above the worktop, 5 mm proud) as an option.

const tileFinishes: Readonly<Record<string, MaterialSpec>> = {
  "Warm tile": { color: [0.745, 0.716, 0.644], roughness: 0.85 },
  "White gloss tile": { color: [0.88, 0.88, 0.86], roughness: 0.2 },
  "Sage tile": { color: [0.42, 0.5, 0.4], roughness: 0.5 },
  "Terracotta tile": { color: [0.55, 0.25, 0.13], roughness: 0.75 },
  "Grey tile": { color: [0.35, 0.36, 0.37], roughness: 0.6 },
};
const bandFinishes: Readonly<Record<string, MaterialSpec>> = {
  "Warm band": { color: [0.552, 0.44, 0.296], roughness: 0.85 },
  "Walnut band": { color: [0.19, 0.105, 0.055], roughness: 0.55 },
  "Black band": { color: [0.03, 0.03, 0.035], roughness: 0.5 },
  "Brass band": { color: [0.62, 0.45, 0.2], roughness: 0.35, metallic: 1 },
};
const groutFinishes: Readonly<Record<string, MaterialSpec>> = {
  "Light grout": { color: [0.6, 0.58, 0.54], roughness: 0.95 },
  "White grout": { color: [0.85, 0.85, 0.83], roughness: 0.95 },
  "Dark grout": { color: [0.12, 0.12, 0.12], roughness: 0.95 },
};

const backsplash: TemplateSpec = {
  id: "tile-backsplash",
  view: "front",
  metadata: {
    ...wallAreable,
    ...attach(false, 900),
    kind: "kitchen",
    label: "Tile Backsplash",
    category: "Kitchen",
    tags: ["kitchen", "backsplash", "splashback", "tiles", "wall panel"],
    product: {
      description: "Tiled wall panel above the worktop, with grout lines and an optional decorative band.",
    },
    resize: {
      x: {
        mode: "slice",
        startMm: 2,
        endMm: 2,
        minMm: 100,
        maxMm: 5000,
        defaultMm: 1370,
        description: "Panel width.",
      },
      y: {
        mode: "slice",
        startMm: 200,
        endMm: 2,
        minMm: 250,
        maxMm: 2400,
        defaultMm: 600,
        description: "Panel height; the band keeps its place at the bottom.",
        quickPicks: [450, 500, 600, 700],
      },
      z: { mode: "fixed" },
    },
    materialSlots: {
      tiles: slot("Warm tile", "Tiles", Object.keys(tileFinishes)),
      band: slot("Warm band", "Band", Object.keys(bandFinishes)),
      grout: {
        material: "Light grout",
        title: "Grout",
        choosable: true,
        presets: Object.keys(groutFinishes),
        allowColor: true,
        allowTexture: false,
      },
    },
    properties: {
      tileWidthMm: {
        type: "number",
        title: "Tile width",
        description: "Distance between the vertical grout lines.",
        minimum: 50,
        maximum: 1200,
        default: 100,
        "x-homeplan": { ...lengthEditor, quickPicks: [75, 100, 150, 200, 300, 600] },
      },
      tileHeightMm: {
        type: "number",
        title: "Tile height",
        description: "Distance between the horizontal grout lines.",
        minimum: 50,
        maximum: 1200,
        default: 100,
        "x-homeplan": { ...lengthEditor, quickPicks: [75, 100, 150, 200, 300, 600] },
      },
      grout: {
        type: "boolean",
        title: "Grout lines",
        description: "Shows the grout lines between the tiles.",
        default: true,
        "x-homeplan": { editor: "toggle" },
      },
      band: {
        type: "boolean",
        title: "Decorative band",
        description: "Shows the 130 mm tile band 65 mm above the bottom edge.",
        default: true,
        "x-homeplan": { editor: "toggle" },
      },
    },
  },
  materials: { ...tileFinishes, ...bandFinishes, ...groutFinishes },
  parts: [
    part("Tiles", "Warm tile", [
      [
        [-685, 0, 0],
        [685, 600, 5],
      ],
    ]),
    part(
      "GroutVertical",
      "Light grout",
      [
        [
          [-685, 0, 5],
          [-683, 600, 5.6],
        ],
      ],
      { stretch: { y: true }, repeat: { offsetMm: { x: "tileWidthMm" }, count: "fill" }, visible: "grout" },
    ),
    part(
      "GroutHorizontal",
      "Light grout",
      [
        [
          [-685, 0, 5],
          [685, 2, 5.6],
        ],
      ],
      { stretch: { x: true }, repeat: { offsetMm: { y: "tileHeightMm" }, count: "fill" }, visible: "grout" },
    ),
    part(
      "Band",
      "Warm band",
      [
        [
          [-685, 65, 3],
          [685, 195, 10],
        ],
      ],
      { visible: "band" },
    ),
  ],
};

// ---------------------------------------------------------------------------------------------
// Coffee corner (fixed): Eureka Mignon grinder and Gaggia Classic Pro espresso machine side by side,
// 407 × 380 × 242, measured from the owner's coffee corner template.

const coffeeMachines: TemplateSpec = {
  id: "coffee-grinder-espresso",
  view: "front",
  metadata: {
    ...wallAreable,
    attachment: {
      hosts: ["floor", "wall"],
      contact: "bottom",
      defaultHostSide: "interior",
      defaultPlacement: { elevationMm: 900 },
    },
    kind: "kitchen",
    label: "Coffee Grinder and Espresso Machine",
    category: "Kitchen",
    tags: ["kitchen", "coffee", "espresso", "grinder", "appliance", "worktop"],
    product: {
      manufacturer: "Eureka; Gaggia",
      name: "Mignon grinder and Classic Pro espresso machine",
      description:
        "Coffee corner for the worktop: Eureka Mignon burr grinder beside a Gaggia Classic Pro (placed at 900 mm).",
    },
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: {
      grinder: "Grinder black",
      rubber: "Rubber",
      chrome: "Chrome",
      machine: "Brushed steel",
      tray: "Tray",
      switches: "Switch",
    },
  },
  materials: {
    "Grinder black": { color: [0.025, 0.025, 0.03], roughness: 0.5, metallic: 0.1 },
    Rubber: { color: [0.04, 0.04, 0.045], roughness: 0.85 },
    Chrome: { color: [0.82, 0.83, 0.85], roughness: 0.25, metallic: 0.8 },
    "Brushed steel": { color: [0.66, 0.67, 0.69], roughness: 0.4, metallic: 0.7 },
    Tray: { color: [0.1, 0.1, 0.11], roughness: 0.6, metallic: 0.2 },
    Switch: { color: [0.8, 0.8, 0.78], roughness: 0.5 },
  },
  // Owner x 0..407 → −203.5..203.5.
  parts: [
    {
      name: "GrinderBody",
      material: "Grinder black",
      build: (g) => {
        box(g, [-203.5, 0, 0], [-73.5, 22, 170]);
        box(g, [-188.5, 22, 0], [-88.5, 200, 115]);
        box(g, [-188.5, 22, 115], [-88.5, 110, 150]);
        cylinder(g, [-138.5, 58], 200, 225, 50);
        frustum(g, [-138.5, 58], 225, 255, 40, 48, { capEnd: true });
        cylinder(g, [-138.5, 58], 288, 290, 34);
        cylinder(g, [-138.5, 138], 22, 100, 36);
      },
    },
    {
      name: "GrinderRubber",
      material: "Rubber",
      build: (g) => {
        cylinder(g, [-138.5, 58], 205, 220, 52);
        cylinder(g, [-138.5, 58], 255, 288, 34);
      },
    },
    { name: "GrinderChute", material: "Chrome", build: (g) => cylinder(g, [-138.5, 138], 100, 110, 18) },
    {
      name: "GrinderButton",
      material: "Switch",
      build: boxes([
        [-145.5, 140, 150],
        [-131.5, 152, 153],
      ]),
    },
    {
      name: "MachineBody",
      material: "Brushed steel",
      build: boxes(
        [
          [-33.5, 0, 0],
          [203.5, 88, 242],
        ],
        [
          [-33.5, 88, 0],
          [203.5, 340, 170],
        ],
      ),
    },
    {
      name: "MachineTrays",
      material: "Tray",
      build: boxes(
        [
          [-19.5, 88, 150],
          [189.5, 93, 236],
        ],
        [
          [-25.5, 340, 8],
          [195.5, 346, 165],
        ],
        [
          [-3.5, 258, 170],
          [173.5, 338, 173],
        ],
      ),
    },
    {
      name: "MachineRails",
      material: "Chrome",
      build: boxes(
        [
          [-25.5, 346, 6],
          [195.5, 380, 10],
        ],
        [
          [-25.5, 346, 163],
          [195.5, 380, 167],
        ],
        [
          [-25.5, 346, 10],
          [-21.5, 380, 163],
        ],
        [
          [191.5, 346, 10],
          [195.5, 380, 163],
        ],
      ),
    },
    {
      name: "MachineSwitches",
      material: "Switch",
      build: boxes(
        [
          [12.5, 282, 173],
          [42.5, 318, 180],
        ],
        [
          [69.5, 282, 173],
          [99.5, 318, 180],
        ],
        [
          [127.5, 282, 173],
          [157.5, 318, 180],
        ],
      ),
    },
    {
      name: "GroupHead",
      material: "Chrome",
      build: (g) => {
        cylinder(g, [85, 170], 205, 258, 33);
        cylinder(g, [85, 170], 172, 205, 32);
        cylinder(g, [178.5, 178], 130, 300, 4);
      },
    },
    {
      name: "MachineRubber",
      material: "Rubber",
      build: (g) => {
        cylinder(g, [85, 185], 170, 242, 11, "z");
        cylinder(g, [178.5, 178], 124, 134, 6);
      },
    },
  ],
};

export const templates: readonly TemplateSpec[] = [
  baseCabinet,
  upperCabinet,
  drawerUnit,
  sinkBase,
  ovenHob,
  fridgeColumn,
  extractorStrip,
  backsplash,
  coffeeMachines,
];
