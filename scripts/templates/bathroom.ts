// Bathroom family (Phase 9.5): bathtub, pedestal basin, toilet, shower rail, shower curtain, wall-mounted
// water heater. Shapes, sizes, and finishes follow the owner's Phase 9 house templates; settings are
// generated from the metadata (D26).
import {
  box,
  boxes,
  cylinder,
  floorAreable,
  frustum,
  prism,
  prismBuilder,
  vertex,
  wallAreable,
} from "./helpers";
import type { Geo, MaterialSpec, TemplateSpec, V3 } from "./helpers";

// ---------------------------------------------------------------------------------------------
// Shared builders and settings.

type Point = readonly [number, number];

/** Ellipse (semi-axes a along x, b along z) around (cx, cz), extruded along y from y0 to y1. */
export const ellipseY =
  (cx: number, cz: number, a: number, b: number, y0: number, y1: number, segments = 32) =>
  (g: Geo): void => {
    const polygon: Point[] = Array.from({ length: segments }, (_, i): Point => {
      const angle = (i / segments) * Math.PI * 2;
      return [cx + a * Math.cos(angle), cz + b * Math.sin(angle)];
    });
    prism(g, polygon, "x", "z", "y", y0, y1);
  };

/** Rounded rectangle (half sizes a, b; corner radius r) around (cx, cz), extruded along y. */
export const roundedRectY =
  (cx: number, cz: number, a: number, b: number, r: number, y0: number, y1: number) =>
  (g: Geo): void => {
    const polygon: Point[] = [];
    const corners: readonly (readonly [number, number, number])[] = [
      [1, 1, 0],
      [-1, 1, 0.5],
      [-1, -1, 1],
      [1, -1, 1.5],
    ];
    for (const [sx, sz, turn] of corners) {
      for (let i = 0; i <= 6; i += 1) {
        const angle = (turn + (i / 6) * 0.5) * Math.PI;
        polygon.push([cx + sx * (a - r) + r * Math.cos(angle), cz + sz * (b - r) + r * Math.sin(angle)]);
      }
    }
    prism(g, polygon, "x", "z", "y", y0, y1);
  };

/** Box from min to max with every edge rounded to radius r (smooth corners, `steps` segments per arc). */
export const roundedBox =
  (min: V3, max: V3, r: number, steps = 4) =>
  (g: Geo): void => {
    const half: V3 = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
    const mid: V3 = [(max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2];
    // Samples along one axis of a face: the corner arc (offsets r * tan), then the flat, then the far arc.
    const samples = (h: number): number[] => {
      const arc = Array.from(
        { length: steps + 1 },
        (_, k) => r * Math.tan(((steps - k) / steps) * (Math.PI / 4)),
      );
      return [...arc.map((o) => -(h - r) - o), ...arc.reverse().map((o) => h - r + o)];
    };
    for (const [axis, ua, va] of [
      [0, 1, 2],
      [1, 2, 0],
      [2, 0, 1],
    ] as const) {
      for (const side of [-1, 1] as const) {
        const us = samples(half[ua]);
        const vs = samples(half[va]);
        const ids: number[][] = us.map((u) =>
          vs.map((v) => {
            const cube: [number, number, number] = [0, 0, 0];
            cube[axis] = side * half[axis];
            cube[ua] = u;
            cube[va] = v;
            const clampTo = (value: number, index: 0 | 1 | 2): number => {
              const h = half[index] - r;
              return Math.max(-h, Math.min(h, value));
            };
            const inner: V3 = [clampTo(cube[0], 0), clampTo(cube[1], 1), clampTo(cube[2], 2)];
            const dir: V3 = [cube[0] - inner[0], cube[1] - inner[1], cube[2] - inner[2]];
            const length = Math.hypot(dir[0], dir[1], dir[2]) || 1;
            const n: V3 = [dir[0] / length, dir[1] / length, dir[2] / length];
            const point: V3 = [
              mid[0] + inner[0] + r * n[0],
              mid[1] + inner[1] + r * n[1],
              mid[2] + inner[2] + r * n[2],
            ];
            return vertex(g, point, n, point[ua], point[va]);
          }),
        );
        for (let i = 0; i + 1 < ids.length; i += 1) {
          for (let j = 0; j + 1 < (ids[i]?.length ?? 0); j += 1) {
            const a = ids[i]?.[j];
            const b = ids[i + 1]?.[j];
            const c = ids[i + 1]?.[j + 1];
            const d = ids[i]?.[j + 1];
            if (a === undefined || b === undefined || c === undefined || d === undefined) continue;
            g.indices.push(a, b, c, a, c, d);
          }
        }
      }
    }
  };

/** A choosable material slot offering shipped finishes, optionally a colour and the house's own texture. */
export const finishes = (
  material: string,
  title: string,
  presets: readonly string[],
  allowTexture = false,
): {
  material: string;
  title: string;
  choosable: true;
  presets: string[];
  allowColor: true;
  allowTexture: boolean;
} => ({ material, title, choosable: true, presets: [...presets], allowColor: true, allowTexture });

const toggle = (title: string, description: string, value: boolean, state = false) => ({
  type: "boolean",
  title,
  description,
  default: value,
  "x-homeplan": state ? { editor: "toggle", state: true } : { editor: "toggle" },
});

const circle = (cx: number, cy: number, r: number, n = 12): Point[] =>
  Array.from({ length: n }, (_, i): Point => {
    const angle = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });

const warmWhite: MaterialSpec = { color: [0.888, 0.871, 0.815], roughness: 0.25 };
const pureWhite: MaterialSpec = { color: [0.93, 0.93, 0.93], roughness: 0.25 };
const paleGrey: MaterialSpec = { color: [0.62, 0.64, 0.65], roughness: 0.3 };
const chrome: MaterialSpec = { color: [0.36, 0.4, 0.42], roughness: 0.2, metallic: 1 };
const brushedNickel: MaterialSpec = { color: [0.3, 0.3, 0.29], roughness: 0.45, metallic: 1 };
const matteBlack: MaterialSpec = { color: [0.02, 0.02, 0.022], roughness: 0.5, metallic: 0.4 };
const brass: MaterialSpec = { color: [0.55, 0.38, 0.12], roughness: 0.3, metallic: 1 };

const ceramicMaterials: Readonly<Record<string, MaterialSpec>> = {
  "Warm white": warmWhite,
  "Pure white": pureWhite,
  "Pale grey": paleGrey,
};
const ceramicPresets = ["Warm white", "Pure white", "Pale grey"] as const;
const metalMaterials: Readonly<Record<string, MaterialSpec>> = {
  Chrome: chrome,
  "Brushed nickel": brushedNickel,
  "Matt black": matteBlack,
  Brass: brass,
};
const metalPresets = ["Chrome", "Brushed nickel", "Matt black", "Brass"] as const;

// ---------------------------------------------------------------------------------------------
// Bathtub: apron of four tile-clad walls, a ceramic rim and well (default 1700 x 700 x 550).

const bathtub: TemplateSpec = {
  id: "bathtub",
  view: "plan",
  metadata: {
    ...floorAreable,
    kind: "bathtub",
    label: "Bathtub",
    category: "Bathroom",
    tags: ["bath", "tub", "tiled", "apron", "wet room"],
    product: {
      description:
        "Free-standing-size white bathtub with a tile-clad apron on all four sides; the apron takes tiles of your choice.",
    },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description: "Overall width of the tub.",
        startMm: 120,
        endMm: 120,
        minMm: 600,
        maxMm: 900,
        defaultMm: 700,
        quickPicks: [700, 750, 800],
      },
      y: { mode: "fixed" },
      z: {
        mode: "slice",
        title: "Length",
        description:
          "Overall length of the tub; the rim, well, and apron lengthen, the ends keep their shape.",
        startMm: 300,
        endMm: 300,
        minMm: 1200,
        maxMm: 2000,
        defaultMm: 1700,
        quickPicks: [1500, 1600, 1700, 1800],
      },
    },
    materialSlots: {
      ceramic: finishes("Warm white", "Tub", ceramicPresets),
      apron: finishes(
        "Apron tile",
        "Apron tiles",
        ["Apron tile", "White tile", "Grey tile", "Terracotta tile", "Sage tile"],
        true,
      ),
      fittings: finishes("Chrome", "Drain", metalPresets),
    },
  },
  materials: {
    ...ceramicMaterials,
    "Apron tile": { color: [0.658, 0.61, 0.497], roughness: 0.58 },
    "White tile": { color: [0.85, 0.85, 0.84], roughness: 0.4 },
    "Grey tile": { color: [0.45, 0.46, 0.47], roughness: 0.45 },
    "Terracotta tile": { color: [0.55, 0.25, 0.15], roughness: 0.55 },
    "Sage tile": { color: [0.4, 0.5, 0.4], roughness: 0.5 },
    ...metalMaterials,
  },
  parts: [
    {
      name: "Apron",
      material: "Apron tile",
      build: boxes(
        [
          [-350, 0, -850],
          [-330, 530, 850],
        ],
        [
          [330, 0, -850],
          [350, 530, 850],
        ],
        [
          [-330, 0, -850],
          [330, 530, -830],
        ],
        [
          [-330, 0, 830],
          [330, 530, 850],
        ],
      ),
    },
    {
      name: "Rim",
      material: "Warm white",
      build: boxes(
        [
          [-350, 530, -850],
          [-280, 550, 850],
        ],
        [
          [280, 530, -850],
          [350, 550, 850],
        ],
        [
          [-280, 530, -850],
          [280, 550, -780],
        ],
        [
          [-280, 530, 780],
          [280, 550, 850],
        ],
      ),
    },
    {
      name: "Well",
      material: "Warm white",
      build: boxes(
        [
          [-280, 140, -780],
          [-255, 530, 780],
        ],
        [
          [255, 140, -780],
          [280, 530, 780],
        ],
        [
          [-255, 140, -780],
          [255, 530, -755],
        ],
        [
          [-255, 140, 755],
          [255, 530, 780],
        ],
        [
          [-255, 140, -755],
          [255, 165, 755],
        ],
      ),
    },
    { name: "Drain", material: "Chrome", build: (g) => cylinder(g, [0, 640], 165, 169, 28) },
  ],
};

// ---------------------------------------------------------------------------------------------
// Pedestal basin: ceramic basin on a column, wall mixer above (default 550 wide, 978 high).

const pedestalBasin: TemplateSpec = {
  id: "basin-pedestal",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "basin",
    label: "Pedestal Basin",
    category: "Bathroom",
    tags: ["basin", "washbasin", "sink", "pedestal", "mixer"],
    product: { description: "Ceramic washbasin on a pedestal column, with a wall-mounted mixer and spout." },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description: "Width of the basin bowl; the pedestal and mixer stay centred.",
        startMm: 120,
        endMm: 120,
        minMm: 450,
        maxMm: 700,
        defaultMm: 550,
        quickPicks: [450, 500, 550, 600],
      },
      y: { mode: "fixed" },
      z: { mode: "fixed" },
    },
    materialSlots: {
      ceramic: finishes("Warm white", "Basin and pedestal", ceramicPresets),
      tap: finishes("Chrome", "Mixer and waste", metalPresets),
    },
  },
  materials: { ...ceramicMaterials, ...metalMaterials },
  parts: [
    {
      name: "Pedestal",
      material: "Warm white",
      rule: { pin: { x: "center" } },
      build: (g) => frustum(g, [0, -25], 25, 690, 95, 80, { capStart: true, capEnd: true }),
    },
    {
      name: "Foot",
      material: "Warm white",
      rule: { pin: { x: "center" } },
      build: ellipseY(0, -25, 132, 120, 0, 60),
    },
    {
      name: "Basin",
      material: "Warm white",
      build: boxes(
        [
          [-275, 710, -230],
          [-230, 815, 230],
        ],
        [
          [230, 710, -230],
          [275, 815, 230],
        ],
        [
          [-230, 710, -230],
          [230, 815, -185],
        ],
        [
          [-230, 710, 185],
          [230, 815, 230],
        ],
        [
          [-230, 710, -185],
          [230, 740, 185],
        ],
      ),
    },
    {
      name: "Waste",
      material: "Chrome",
      rule: { pin: { x: "center" } },
      build: (g) => cylinder(g, [0, -35], 650, 725, 25),
    },
    {
      name: "WallMixer",
      material: "Chrome",
      rule: { pin: { x: "center" } },
      build: boxes([
        [-80, 942, -188],
        [80, 978, -152],
      ]),
    },
    {
      name: "Spout",
      material: "Chrome",
      rule: { pin: { x: "center" } },
      build: (g) => cylinder(g, [0, 960], -170, -70, 14, "z"),
    },
    {
      name: "TapOutlet",
      material: "Chrome",
      rule: { pin: { x: "center" } },
      build: (g) => cylinder(g, [0, -70], 935, 960, 14),
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Toilet with a high cistern (back at -z), raised or closed lid.

const toilet: TemplateSpec = {
  id: "toilet-high-cistern",
  view: "side",
  metadata: {
    ...floorAreable,
    kind: "toilet",
    label: "Toilet with High Cistern",
    category: "Bathroom",
    tags: ["toilet", "wc", "cistern", "high-level", "old style"],
    product: {
      description: "Floor-standing toilet with a wall-high cistern, a flush pipe, and a pull chain.",
    },
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: {
      ceramic: finishes("Warm white", "Bowl and cistern", ceramicPresets),
      seat: finishes("Seat white", "Seat and lid", ["Seat white", "Seat black", "Seat oak"]),
      interior: "Bowl interior",
      fittings: finishes("Chrome", "Chain and handle", metalPresets),
    },
    properties: {
      lidUp: toggle("Lid raised", "Shows the seat lid raised; off shows it closed.", true, true),
    },
    formulas: { lidAngleDeg: "lidUp ? -90 : 0" },
  },
  materials: {
    ...ceramicMaterials,
    "Seat white": warmWhite,
    "Seat black": { color: [0.02, 0.02, 0.022], roughness: 0.4 },
    "Seat oak": { color: [0.52, 0.34, 0.18], roughness: 0.5 },
    "Bowl interior": { color: [0.509, 0.617, 0.631], roughness: 0.3 },
    ...metalMaterials,
  },
  parts: [
    { name: "Foot", material: "Warm white", build: ellipseY(0, 45, 145, 145, 0, 220) },
    { name: "Bowl", material: "Warm white", build: ellipseY(0, 0, 195, 310, 215, 415) },
    { name: "Seat", material: "Seat white", build: ellipseY(0, 25, 195, 285, 406, 434) },
    { name: "Opening", material: "Bowl interior", build: ellipseY(0, 40, 125, 215, 405, 436) },
    {
      name: "Lid",
      material: "Seat white",
      rule: { rotate: { axis: "x", angleDeg: "lidAngleDeg", pivot: { y: "start", z: "start" } } },
      build: ellipseY(0, 25, 195, 285, 434, 450),
    },
    {
      name: "Cistern",
      material: "Warm white",
      build: boxes(
        [
          [-215, 1510, -355],
          [215, 1910, -185],
        ],
        [
          [-215, 1910, -355],
          [215, 1930, -185],
        ],
      ),
    },
    { name: "FlushPipe", material: "Warm white", build: (g) => cylinder(g, [0, -300], 450, 1510, 24) },
    {
      name: "Chain",
      material: "Chrome",
      build: (g) => {
        cylinder(g, [120, -170], 1230, 1510, 4);
        box(g, [100, 1200, -182], [140, 1230, -158]);
      },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Shower rail with mixer, rain arm and head, handset and hose (wall at z 0).

const showerRail: TemplateSpec = {
  id: "shower-rail",
  view: "side",
  metadata: {
    ...wallAreable,
    kind: "shower",
    label: "Shower Rail with Rain Head",
    category: "Bathroom",
    tags: ["shower", "rail", "mixer", "rain head", "handset"],
    product: {
      description: "Wall rail with a lower mixer, a rain arm and square head at the top, and a hose handset.",
    },
    attachment: {
      hosts: ["wall"],
      contact: "back",
      defaultHostSide: "interior",
      defaultPlacement: { horizontalAlign: "center", elevationMm: 700 },
    },
    resize: {
      x: { mode: "fixed" },
      y: {
        mode: "slice",
        title: "Height",
        description:
          "Overall height from the bottom of the hose loop to the top of the rain arm; the rail stretches between the mixer and the head (rail length = height - 420 mm).",
        startMm: 428,
        endMm: 112,
        minMm: 1000,
        maxMm: 2200,
        defaultMm: 1490,
        quickPicks: [1200, 1490, 1800, 2100],
      },
      z: { mode: "fixed" },
    },
    materialSlots: {
      fittings: finishes("Chrome", "Rail and head", metalPresets),
    },
  },
  materials: metalMaterials,
  parts: [
    {
      name: "Rail",
      material: "Chrome",
      rule: { stretch: { y: true } },
      build: (g) => cylinder(g, [0, 30], 130, 1200, 12),
    },
    {
      name: "RainArm",
      material: "Chrome",
      rule: { pin: { y: "end" } },
      build: (g) => cylinder(g, [0, 1200], 30, 200, 12, "z"),
    },
    {
      name: "RainHead",
      material: "Chrome",
      rule: { pin: { y: "end" } },
      build: boxes([
        [-95, 1173, 115],
        [95, 1197, 295],
      ]),
    },
    {
      name: "Mixer",
      material: "Chrome",
      rule: { pin: { y: "start" } },
      build: boxes([
        [-95, 55, 35],
        [95, 95, 75],
      ]),
    },
    {
      name: "Hose",
      material: "Chrome",
      rule: { pin: { y: "start" } },
      build: (g) => {
        cylinder(g, [-30, 75], -278, 95, 12);
        cylinder(g, [109, 75], -278, 480, 12);
        box(g, [-42, -278, 63], [121, -254, 87]);
      },
    },
    {
      name: "Handset",
      material: "Chrome",
      rule: { pin: { y: "start" } },
      build: (g) => cylinder(g, [109, 75], 480, 601, 22),
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Gathered shower curtain on a rod; folds are a formula-counted repeat (default 600 x 2000).

const showerCurtain: TemplateSpec = {
  id: "shower-curtain",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "curtain",
    label: "Shower Curtain",
    category: "Bathroom",
    tags: ["curtain", "shower", "fabric", "gathered", "rod"],
    product: {
      description: "Gathered fabric shower curtain on a rod, with hooks; the folds follow the width.",
    },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description: "Width of the drawn curtain; the number of folds follows it.",
        startMm: 10,
        endMm: 10,
        minMm: 300,
        maxMm: 2000,
        defaultMm: 600,
        quickPicks: [600, 900, 1200, 1800],
      },
      y: {
        mode: "slice",
        title: "Height",
        description: "Height from the hem to the top of the rod.",
        startMm: 30,
        endMm: 60,
        minMm: 1200,
        maxMm: 2600,
        defaultMm: 2028,
        quickPicks: [1800, 2028, 2200],
      },
      z: { mode: "fixed" },
    },
    materialSlots: {
      fabric: finishes(
        "Rose fabric",
        "Fabric",
        ["Rose fabric", "White fabric", "Sage fabric", "Grey fabric", "Blue fabric"],
        true,
      ),
      rod: finishes("Chrome", "Rod and hooks", metalPresets),
    },
    properties: {
      foldPitchMm: {
        type: "number",
        title: "Fold spacing",
        description:
          "Target distance between folds (each fold is 44 mm wide); a smaller value gives a fuller gathered curtain.",
        minimum: 45,
        maximum: 120,
        default: 50,
        "x-homeplan": { editor: "length", quantity: "length", quickPicks: [45, 50, 70, 100] },
      },
      foldDepthMm: {
        type: "number",
        title: "Fold depth",
        description: "How far the folds stand out front to back.",
        minimum: 10,
        maximum: 80,
        default: 32,
        "x-homeplan": { editor: "length", quantity: "length", quickPicks: [20, 32, 50] },
      },
    },
    formulas: {
      foldCount: "max(2, floor(widthMm / foldPitchMm))",
      foldCell: "widthMm / foldCount",
      hookCount: "max(2, round(widthMm / 150) + 1)",
      hookStep: "(widthMm - 40) / (hookCount - 1)",
    },
  },
  materials: {
    "Rose fabric": { color: [0.546, 0.262, 0.27], roughness: 0.9 },
    "White fabric": { color: [0.82, 0.8, 0.76], roughness: 0.9 },
    "Sage fabric": { color: [0.34, 0.42, 0.33], roughness: 0.9 },
    "Grey fabric": { color: [0.34, 0.35, 0.37], roughness: 0.9 },
    "Blue fabric": { color: [0.18, 0.27, 0.45], roughness: 0.9 },
    ...metalMaterials,
  },
  parts: [
    {
      name: "Backing",
      material: "Rose fabric",
      rule: { extendsWith: "Fold", stretch: { x: true, y: true } },
      build: boxes([
        [-300, 0, -3],
        [300, 2000, 3],
      ]),
    },
    {
      // Default: 12 folds, one per 50 mm cell, each 44 mm wide, centred in its cell across the whole width.
      name: "Fold",
      material: "Rose fabric",
      rule: {
        pin: { x: "start" },
        stretch: { y: true },
        repeat: { offsetMm: { x: "foldCell" }, count: "foldCount" },
        size: { z: "foldDepthMm" },
        translate: { x: "(foldCell - 44) / 2" },
      },
      build: ellipseY(-278, 0, 22, 16, 0, 2000),
    },
    {
      name: "Rod",
      material: "Chrome",
      rule: { extendsWith: "Fold", stretch: { x: true }, pin: { y: "end" } },
      build: prismBuilder(circle(0, 2020, 8), "z", "y", "x", -300, 300),
    },
    {
      name: "Hook",
      material: "Chrome",
      rule: {
        pin: { x: "start", y: "end" },
        repeat: { offsetMm: { x: "hookStep" }, count: "hookCount" },
      },
      build: boxes([
        [-290, 1980, -10],
        [-280, 2018, 10],
      ]),
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Wall-mounted water heater, after the owner's: a fully rounded casing (radius 90) with the small LCD
// panel low on the front and two water connections underneath (default 450 x 1250 x 432).

const waterHeaterWall: TemplateSpec = {
  id: "water-heater-wall",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "waterHeater",
    label: "Wall-Mounted Water Heater",
    category: "Bathroom",
    tags: ["water heater", "boiler", "tank", "wall", "hot water", "lcd"],
    product: {
      description:
        "Rounded wall-mounted electric water heater with a small LCD panel low on the front and two connections below.",
    },
    attachment: {
      hosts: ["wall"],
      contact: "back",
      defaultHostSide: "interior",
      defaultPlacement: { horizontalAlign: "center", elevationMm: 1100 },
    },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description:
          "Width of the casing; the rounded edges keep their radius and the connections stay centred.",
        startMm: 90,
        endMm: 90,
        minMm: 300,
        maxMm: 800,
        defaultMm: 450,
        quickPicks: [450, 550, 600],
      },
      y: { mode: "fixed" },
      z: {
        mode: "slice",
        title: "Depth",
        description: "Overall depth from the wall including the LCD panel; the casing is 12 mm less.",
        startMm: 90,
        endMm: 102,
        minMm: 250,
        maxMm: 600,
        defaultMm: 432,
        quickPicks: [362, 432, 500],
      },
    },
    materialSlots: {
      casing: finishes("Silver casing", "Casing", ["Silver casing", "White casing", "Graphite casing"]),
      connections: "Metal",
      panel: "Panel",
      display: "Display",
    },
    formulas: { panelWidth: "widthMm * 145 / 450" },
  },
  materials: {
    "Silver casing": { color: [0.539, 0.571, 0.578], roughness: 0.5 },
    "White casing": { color: [0.9, 0.9, 0.88], roughness: 0.5 },
    "Graphite casing": { color: [0.1, 0.11, 0.12], roughness: 0.5 },
    Metal: { color: [0.091, 0.107, 0.117], roughness: 0.5, metallic: 0.5 },
    Panel: { color: [0.0144, 0.0168, 0.0194], roughness: 0.6 },
    Display: { color: [0.05, 0.05, 0.05], roughness: 0.2, emissive: [1, 0.35, 0.2] },
  },
  parts: [
    {
      name: "Casing",
      material: "Silver casing",
      build: roundedBox([-225, 0, 0], [225, 1250, 420], 90),
    },
    {
      // The LCD panel: 145 x 120 mm at 50..170 mm above the bottom, standing 12 mm proud of the casing.
      name: "ControlPanel",
      material: "Panel",
      rule: { pin: { x: "center", z: "end" }, size: { x: "panelWidth" } },
      build: roundedBox([-72.5, 50, 418], [72.5, 170, 432], 6, 3),
    },
    {
      name: "Display",
      material: "Display",
      rule: { pin: { x: "center", z: "end" }, size: { x: "panelWidth * 0.76" } },
      build: boxes([
        [-55, 75, 432],
        [55, 145, 432.5],
      ]),
    },
    {
      name: "ConnectionLeft",
      material: "Metal",
      rule: { pin: { x: "center", z: "start" }, translate: { x: "-(widthMm / 450 - 1) * 90" } },
      build: (g) => cylinder(g, [-90, 100], -80, 0, 12),
    },
    {
      name: "ConnectionRight",
      material: "Metal",
      rule: { pin: { x: "center", z: "start" }, translate: { x: "(widthMm / 450 - 1) * 90" } },
      build: (g) => cylinder(g, [90, 100], -80, 0, 12),
    },
  ],
};

export const templates: readonly TemplateSpec[] = [
  bathtub,
  pedestalBasin,
  toilet,
  showerRail,
  showerCurtain,
  waterHeaterWall,
];
