// Tables family.
import { boxes, floorAreable, oak, prism, rectFrameXZ } from "./helpers";
import type { Geo, MaterialSpec, TemplateSpec, V3 } from "./helpers";

const diningTable: TemplateSpec = {
  id: "dining-table",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "table",
    label: "Dining Table",
    resize: {
      x: { mode: "slice", startMm: 100, endMm: 100, minMm: 1000, maxMm: 2800, defaultMm: 1600 },
      y: { mode: "fixed" },
      z: { mode: "slice", startMm: 100, endMm: 100, minMm: 700, maxMm: 1200, defaultMm: 900 },
    },
    materialSlots: { top: "Top", legs: "Legs" },
  },
  materials: { Top: oak, Legs: { ...oak, color: [0.42, 0.27, 0.14] } },
  parts: [
    {
      name: "Top",
      material: "Top",
      build: boxes([
        [-800, 720, -450],
        [800, 750, 450],
      ]),
    },
    {
      name: "Apron",
      material: "Legs",
      build: rectFrameXZ(-730, 730, -380, 380, 20, 640, 720),
    },
    {
      name: "Legs",
      material: "Legs",
      build: boxes(
        ...[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz): readonly [V3, V3] => [
            [sx * 740 - 30, 0, sz * 390 - 30],
            [sx * 740 + 30, 720, sz * 390 + 30],
          ]),
        ),
      ),
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Phase 9.4: parametric tables (D26). New IDs; `dining-table` above stays as it is.

const srgb = (r: number, g: number, b: number): V3 => {
  const linear = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return [linear(r), linear(g), linear(b)];
};

type Finish = Readonly<{ name: string; color: V3; roughness: number }>;

const finishMaterials = (list: readonly Finish[]): Readonly<Record<string, MaterialSpec>> =>
  Object.fromEntries(
    list.map(({ name, color, roughness }): [string, MaterialSpec] => [name, { color, roughness }]),
  );
const finishNames = (list: readonly Finish[]): string[] => list.map(({ name }) => name);

const paleAsh: Finish = { name: "Pale ash", color: [0.77, 0.67, 0.48], roughness: 0.8 };
const lightOak: Finish = { name: "Light oak", color: [0.55, 0.43, 0.27], roughness: 0.78 };
const cremonaOak: Finish = { name: "Cremona oak", color: [0.69, 0.55, 0.35], roughness: 0.85 };
const black: Finish = { name: "Black", color: [0.01, 0.02, 0.02], roughness: 0.78 };
const white: Finish = { name: "White", color: [0.89, 0.87, 0.81], roughness: 0.78 };
const walnut: Finish = { name: "Walnut", color: [0.18, 0.1, 0.06], roughness: 0.55 };
const darkOak: Finish = { name: "Dark oak", color: [0.3, 0.19, 0.1], roughness: 0.55 };
const beech: Finish = { name: "Beech", color: [0.69, 0.39, 0.13], roughness: 0.7 };
const grey: Finish = { name: "Grey", color: srgb(128, 130, 132), roughness: 0.7 };

const woodChoices = (first: Finish): readonly Finish[] => [
  first,
  ...[paleAsh, lightOak, cremonaOak, walnut, darkOak, beech, white, black].filter(
    (finish) => finish.name !== first.name,
  ),
];

const woodSlot = (
  first: Finish,
  title: string,
  list: readonly Finish[] = woodChoices(first),
): TemplateSpec["metadata"]["materialSlots"][string] => ({
  material: first.name,
  title,
  choosable: true,
  presets: finishNames(list),
  allowColor: true,
  allowTexture: true,
});

const frameChoices = (first: Finish): readonly Finish[] => [
  first,
  ...[white, black, grey, paleAsh, lightOak].filter((finish) => finish.name !== first.name),
];

// --- Dining table -------------------------------------------------------------------------------

/** Authored 1400 × 1400 × 750: 30 mm top, 20 mm apron rails, 90 mm square legs 55 mm in from the edges. */
const tableDining: TemplateSpec = {
  id: "table-dining",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "table",
    label: "Dining Table",
    category: "Tables",
    tags: ["table", "dining", "kitchen", "square", "rectangular", "four legs"],
    product: {
      description:
        "Dining table with a thin top, an apron under it, and four square legs set in from the corners.",
    },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description: "Left to right.",
        quickPicks: [800, 1200, 1400, 1600, 1800],
        startMm: 150,
        endMm: 150,
        minMm: 700,
        maxMm: 2800,
        defaultMm: 1400,
      },
      y: {
        mode: "slice",
        title: "Height",
        description: "Table height to the top surface; 720–750 is usual for dining.",
        quickPicks: [720, 750, 760],
        startMm: 0,
        endMm: 100,
        minMm: 680,
        maxMm: 800,
        defaultMm: 750,
      },
      z: {
        mode: "slice",
        title: "Depth",
        description: "Front to back.",
        quickPicks: [800, 900, 1200, 1400],
        startMm: 150,
        endMm: 150,
        minMm: 600,
        maxMm: 1600,
        defaultMm: 1400,
      },
    },
    materialSlots: {
      top: woodSlot(paleAsh, "Top"),
      legs: woodSlot(paleAsh, "Legs and apron"),
    },
  },
  materials: finishMaterials(woodChoices(paleAsh)),
  parts: [
    {
      name: "Top",
      material: "Pale ash",
      build: boxes([
        [-700, 720, -700],
        [700, 750, 700],
      ]),
    },
    { name: "Apron", material: "Pale ash", build: rectFrameXZ(-640, 640, -640, 640, 20, 650, 720) },
    {
      name: "Legs",
      material: "Pale ash",
      build: boxes(
        ...[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz): readonly [V3, V3] => [
            [sx * 600 - 45, 0, sz * 600 - 45],
            [sx * 600 + 45, 720, sz * 600 + 45],
          ]),
        ),
      ),
    },
  ],
};

// --- Coffee table on rollers --------------------------------------------------------------------

/** A wheel with its axle along x, as a polygon in z/y. */
const wheel = (g: Geo, x0: number, x1: number, cz: number, cy: number, r: number): void => {
  const polygon = Array.from({ length: 16 }, (_, i): readonly [number, number] => {
    const a = (i / 16) * Math.PI * 2;
    return [cz + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  prism(g, polygon, "z", "y", "x", x0, x1);
};

const coffeeTable: TemplateSpec = {
  id: "coffee-table",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "table",
    label: "Coffee Table on Rollers",
    category: "Tables",
    tags: ["coffee table", "living room", "rollers", "wheels", "low table", "shelf"],
    product: {
      name: "Cremona coffee table",
      description:
        "Low open coffee table: a top board, a bottom shelf, and two end boards, standing on four small rollers.",
    },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description: "Left to right.",
        quickPicks: [900, 1000, 1200],
        startMm: 100,
        endMm: 100,
        minMm: 700,
        maxMm: 1600,
        defaultMm: 1200,
      },
      y: {
        mode: "slice",
        title: "Height",
        description: "Overall height including the rollers.",
        quickPicks: [350, 400, 450],
        startMm: 110,
        endMm: 40,
        minMm: 250,
        maxMm: 600,
        defaultMm: 350,
      },
      z: {
        mode: "slice",
        title: "Depth",
        description: "Front to back.",
        quickPicks: [600, 710, 800],
        startMm: 100,
        endMm: 100,
        minMm: 400,
        maxMm: 1000,
        defaultMm: 710,
      },
    },
    materialSlots: {
      wood: woodSlot(cremonaOak, "Boards"),
      rollers: { material: "Roller metal", title: "Roller brackets" },
      wheels: { material: "Roller wheel", title: "Wheels" },
    },
  },
  materials: {
    ...finishMaterials(woodChoices(cremonaOak)),
    "Roller metal": { color: [0.27, 0.3, 0.3], roughness: 0.5, metallic: 1 },
    "Roller wheel": { color: [0.01, 0.01, 0.01], roughness: 0.8 },
  },
  parts: [
    {
      name: "Boards",
      material: "Cremona oak",
      build: boxes(
        [
          [-600, 310, -355],
          [600, 350, 355],
        ],
        [
          [-600, 70, -355],
          [600, 110, 355],
        ],
        [
          [-600, 110, -355],
          [-560, 310, 355],
        ],
        [
          [560, 110, -355],
          [600, 310, 355],
        ],
      ),
    },
    {
      name: "RollerPlates",
      material: "Roller metal",
      build: boxes(
        ...[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz): readonly [V3, V3] => [
            [sx * 530 - 25, 64, sz * 285 - 25],
            [sx * 530 + 25, 70, sz * 285 + 25],
          ]),
        ),
        ...[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz): readonly [V3, V3] => [
            [sx * 530 - 4, 25, sz * 285 - 18],
            [sx * 530 + 4, 65, sz * 285 + 18],
          ]),
        ),
      ),
    },
    {
      name: "RollerWheels",
      material: "Roller wheel",
      build: (g) => {
        for (const sx of [-1, 1])
          for (const sz of [-1, 1]) wheel(g, sx * 530 - 6, sx * 530 + 6, sz * 285, 25, 25);
      },
    },
  ],
};

// --- Desk ---------------------------------------------------------------------------------------

const deskLegStyle = {
  type: "string",
  title: "Legs",
  description: "Solid end panels, or slim uprights on T-shaped feet.",
  enum: ["panel", "t-foot"],
  default: "panel",
  "x-homeplan": { editor: "select", group: "template", order: 4 },
};

const deskModestyRail = {
  type: "boolean",
  title: "Back rail",
  description: "A rail between the end panels at the back (panel legs only).",
  default: false,
  "x-homeplan": { editor: "toggle", group: "template", order: 5 },
};

/** Authored 1800 × 500 × 740, 32 mm top. */
const desk: TemplateSpec = {
  id: "desk",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "desk",
    label: "Desk",
    category: "Tables",
    tags: ["desk", "table", "office", "study", "work", "keyboard", "computer"],
    product: {
      description:
        "Simple desk with a choice of solid end panels (inverted U) or slim uprights on T-shaped feet, and an optional back rail.",
    },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description: "Left to right.",
        quickPicks: [1200, 1400, 1600, 1800],
        startMm: 130,
        endMm: 130,
        minMm: 800,
        maxMm: 2400,
        defaultMm: 1800,
      },
      y: {
        mode: "slice",
        title: "Height",
        description: "Height of the top surface; 720–750 is a standard desk.",
        quickPicks: [720, 740, 750],
        startMm: 50,
        endMm: 180,
        minMm: 680,
        maxMm: 800,
        defaultMm: 740,
      },
      z: {
        mode: "slice",
        title: "Depth",
        description: "Front to back.",
        quickPicks: [500, 600, 700, 800],
        startMm: 70,
        endMm: 70,
        minMm: 400,
        maxMm: 900,
        defaultMm: 500,
      },
    },
    materialSlots: {
      top: woodSlot(paleAsh, "Top"),
      legs: woodSlot(paleAsh, "Legs and rails"),
    },
    properties: { legStyle: deskLegStyle, backRail: deskModestyRail },
  },
  materials: finishMaterials(woodChoices(paleAsh)),
  parts: [
    {
      name: "Top",
      material: "Pale ash",
      build: boxes([
        [-900, 708, -250],
        [900, 740, 250],
      ]),
    },
    {
      name: "EndPanels",
      material: "Pale ash",
      rule: { visible: "legStyle == 'panel'" },
      build: boxes(
        [
          [-900, 0, -250],
          [-860, 708, 250],
        ],
        [
          [860, 0, -250],
          [900, 708, 250],
        ],
      ),
    },
    {
      name: "BackRail",
      material: "Pale ash",
      rule: { stretch: { x: true }, visible: "legStyle == 'panel' && backRail" },
      build: boxes([
        [-860, 565, -213],
        [860, 675, -188],
      ]),
    },
    {
      name: "UprightLeft",
      material: "Pale ash",
      rule: { pin: { z: "center" }, visible: "legStyle == 't-foot'" },
      build: boxes([
        [-831, 48, 9],
        [-789, 708, 51],
      ]),
    },
    {
      name: "UprightRight",
      material: "Pale ash",
      rule: { pin: { z: "center" }, visible: "legStyle == 't-foot'" },
      build: boxes([
        [789, 48, 9],
        [831, 708, 51],
      ]),
    },
    {
      name: "TFeet",
      material: "Pale ash",
      rule: { visible: "legStyle == 't-foot'" },
      build: boxes(
        ...[-1, 1].map((sx): readonly [V3, V3] => [
          [sx * 810 - 32, 10, -215],
          [sx * 810 + 32, 46, 215],
        ]),
      ),
    },
    {
      name: "CrossRail",
      material: "Pale ash",
      rule: { stretch: { x: true }, pin: { z: "center" }, visible: "legStyle == 't-foot'" },
      build: boxes([
        [-780, 647, 44],
        [780, 692, 76],
      ]),
    },
  ],
};

// --- Bar table ----------------------------------------------------------------------------------

/** Authored 1640 × 700 × 850: a top and one end panel (inverted L); flip x moves the panel. */
const barTable: TemplateSpec = {
  id: "bar-table",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "table",
    label: "Bar Table",
    category: "Tables",
    tags: ["bar table", "counter", "high table", "breakfast bar", "inverted L", "stand-up"],
    product: {
      description:
        "Tall narrow table: a top supported by one solid end panel on the right (inverted L); flip it to put the panel on the left.",
    },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description: "Left to right.",
        quickPicks: [1200, 1640, 2000],
        startMm: 40,
        endMm: 40,
        minMm: 800,
        maxMm: 2400,
        defaultMm: 1640,
      },
      y: {
        mode: "slice",
        title: "Height",
        description: "Height of the top surface; 850–1100 is bar height.",
        quickPicks: [850, 900, 1050],
        startMm: 0,
        endMm: 40,
        minMm: 700,
        maxMm: 1150,
        defaultMm: 850,
      },
      z: {
        mode: "slice",
        title: "Depth",
        description: "Front to back.",
        quickPicks: [500, 600, 700],
        startMm: 40,
        endMm: 40,
        minMm: 400,
        maxMm: 900,
        defaultMm: 700,
      },
    },
    flip: { x: true, z: false },
    materialSlots: { wood: woodSlot(paleAsh, "Wood") },
  },
  materials: finishMaterials(woodChoices(paleAsh)),
  parts: [
    {
      name: "Top",
      material: "Pale ash",
      build: boxes([
        [-820, 810, -350],
        [820, 850, 350],
      ]),
    },
    {
      name: "EndPanel",
      material: "Pale ash",
      build: boxes([
        [780, 0, -350],
        [820, 810, 350],
      ]),
    },
  ],
};

// --- Side table ---------------------------------------------------------------------------------

const sideTable: TemplateSpec = {
  id: "side-table",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "table",
    label: "Side Table",
    category: "Tables",
    tags: ["side table", "small table", "bistro", "balcony", "end table", "compact"],
    product: { description: "Compact table with a thin top on four slim legs." },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description: "Left to right.",
        quickPicks: [350, 420, 600],
        startMm: 60,
        endMm: 60,
        minMm: 300,
        maxMm: 800,
        defaultMm: 420,
      },
      y: {
        mode: "slice",
        title: "Height",
        description: "Height of the top surface.",
        quickPicks: [450, 600, 680],
        startMm: 0,
        endMm: 30,
        minMm: 350,
        maxMm: 800,
        defaultMm: 680,
      },
      z: {
        mode: "slice",
        title: "Depth",
        description: "Front to back.",
        quickPicks: [300, 330, 500],
        startMm: 65,
        endMm: 65,
        minMm: 250,
        maxMm: 700,
        defaultMm: 330,
      },
    },
    materialSlots: {
      top: woodSlot(white, "Top"),
      legs: woodSlot(white, "Legs", frameChoices(white)),
    },
  },
  materials: finishMaterials([...woodChoices(white), grey]),
  parts: [
    {
      name: "Top",
      material: "White",
      build: boxes([
        [-210, 650, -165],
        [210, 680, 165],
      ]),
    },
    {
      name: "Legs",
      material: "White",
      build: boxes(
        ...[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz): readonly [V3, V3] => [
            [sx * 170 - 15, 0, sz * 120 - 15],
            [sx * 170 + 15, 650, sz * 120 + 15],
          ]),
        ),
      ),
    },
  ],
};

export const templates: readonly TemplateSpec[] = [
  diningTable,
  tableDining,
  coffeeTable,
  desk,
  barTable,
  sideTable,
];
