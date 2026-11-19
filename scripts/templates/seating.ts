// Seating family: sofa and armchair.
import { boxes, cylinder, darkWood, floorAreable, normalize, prism, rectFrame, vertex } from "./helpers";
import type { Geo, MaterialSpec, PartSpec, TemplateSpec, V3 } from "./helpers";

const fabric: MaterialSpec = { color: [0.28, 0.33, 0.4], roughness: 0.9 };
const cushion: MaterialSpec = { color: [0.36, 0.42, 0.5], roughness: 0.95 };

/** Sofa/armchair with arms of `arm` width; `seats` cushions between the arms. Depth z −d/2..d/2. */
const seating = (width: number, seats: number): PartSpec[] => {
  const half = width / 2;
  const arm = 200;
  const inner = half - arm;
  const seatWidth = (2 * inner) / seats;
  const cushions = (y0: number, y1: number, z0: number, z1: number) =>
    boxes(
      ...Array.from({ length: seats }, (_, i): readonly [V3, V3] => [
        [-inner + i * seatWidth + 4, y0, z0],
        [-inner + (i + 1) * seatWidth - 4, y1, z1],
      ]),
    );
  return [
    {
      name: "Frame",
      material: "Upholstery",
      build: boxes(
        [
          [-half, 100, -425],
          [half, 400, 425],
        ],
        [
          [-half, 400, -425],
          [-inner, 640, 425],
        ],
        [
          [inner, 400, -425],
          [half, 640, 425],
        ],
        [
          [-inner, 400, -425],
          [inner, 840, -245],
        ],
      ),
    },
    { name: "SeatCushions", material: "Cushion", build: cushions(400, 560, -245, 415) },
    { name: "BackCushions", material: "Cushion", build: cushions(560, 820, -245, -95) },
    {
      name: "Legs",
      material: "Legs",
      build: boxes(
        ...[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz): readonly [V3, V3] => [
            [sx * (half - 60) - 20, 0, sz * 365 - 20],
            [sx * (half - 60) + 20, 100, sz * 365 + 20],
          ]),
        ),
      ),
    },
  ];
};

const sofa: TemplateSpec = {
  id: "sofa-3-seat",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "sofa",
    label: "Sofa, 3 Seats",
    resize: {
      x: { mode: "slice", startMm: 200, endMm: 200, minMm: 1800, maxMm: 3000, defaultMm: 2200 },
      y: { mode: "fixed" },
      z: { mode: "fixed" },
    },
    materialSlots: { upholstery: "Upholstery", cushions: "Cushion", legs: "Legs" },
  },
  materials: { Upholstery: fabric, Cushion: cushion, Legs: darkWood },
  parts: seating(2200, 3),
};

const armchair: TemplateSpec = {
  id: "armchair",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "armchair",
    label: "Armchair",
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: { upholstery: "Upholstery", cushions: "Cushion", legs: "Legs" },
  },
  materials: {
    Upholstery: { ...fabric, color: [0.45, 0.3, 0.22] },
    Cushion: { ...cushion, color: [0.52, 0.36, 0.27] },
    Legs: darkWood,
  },
  parts: seating(900, 1),
};

// ---------------------------------------------------------------------------------------------
// Phase 9.4: parametric seating (D26). New IDs; `sofa-3-seat` and `armchair` above stay as they are.

/** Linear base colour from an sRGB triple (0–255). */
const srgb = (r: number, g: number, b: number): V3 => {
  const linear = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return [linear(r), linear(g), linear(b)];
};
const lighten = (c: V3, k: number): V3 => [
  Math.min(1, c[0] * k),
  Math.min(1, c[1] * k),
  Math.min(1, c[2] * k),
];

type Swatch = Readonly<{ name: string; color: V3; roughness: number }>;

/** Materials named after their swatch, and the names (preset list; the first is the default). */
const swatches = (list: readonly Swatch[], suffix = ""): Readonly<Record<string, MaterialSpec>> =>
  Object.fromEntries(
    list.map(({ name, color, roughness }): [string, MaterialSpec] => [
      `${name}${suffix}`,
      { color, roughness },
    ]),
  );
const swatchNames = (list: readonly Swatch[], suffix = ""): string[] =>
  list.map(({ name }) => `${name}${suffix}`);

const sofaFabrics: readonly Swatch[] = [
  { name: "Cream", color: [0.66, 0.6, 0.5], roughness: 0.92 },
  { name: "Light grey", color: srgb(200, 200, 198), roughness: 0.92 },
  { name: "Graphite", color: srgb(78, 80, 84), roughness: 0.92 },
  { name: "Sage green", color: srgb(150, 166, 140), roughness: 0.92 },
  { name: "Navy", color: srgb(52, 66, 98), roughness: 0.92 },
  { name: "Terracotta", color: srgb(186, 110, 84), roughness: 0.92 },
];
const cushionFabrics: readonly Swatch[] = sofaFabrics.map((fabricSwatch, index) => ({
  ...fabricSwatch,
  color: index === 0 ? [0.72, 0.67, 0.58] : lighten(fabricSwatch.color, 1.12),
  roughness: 0.95,
}));

const woodFinishes: readonly Swatch[] = [
  { name: "Wenge", color: [0.04, 0.02, 0.02], roughness: 0.6 },
  { name: "Oak", color: [0.52, 0.34, 0.18], roughness: 0.55 },
  { name: "Beech", color: [0.69, 0.39, 0.13], roughness: 0.7 },
  { name: "Walnut", color: [0.18, 0.1, 0.06], roughness: 0.55 },
  { name: "Black", color: [0.02, 0.02, 0.02], roughness: 0.6 },
  { name: "White", color: [0.85, 0.85, 0.83], roughness: 0.6 },
];

const chairFabrics: readonly Swatch[] = [
  { name: "Brown fabric", color: [0.04, 0.02, 0.01], roughness: 0.95 },
  { name: "Light grey fabric", color: srgb(190, 190, 188), roughness: 0.95 },
  { name: "Beige fabric", color: srgb(206, 190, 160), roughness: 0.95 },
  { name: "Charcoal fabric", color: srgb(60, 62, 66), roughness: 0.95 },
  { name: "Green fabric", color: srgb(86, 112, 82), roughness: 0.95 },
  { name: "Blue fabric", color: srgb(70, 96, 140), roughness: 0.95 },
];

const blackFabrics: readonly Swatch[] = [
  { name: "Graphite", color: [0.03, 0.03, 0.04], roughness: 0.78 },
  { name: "Mid grey", color: srgb(120, 122, 126), roughness: 0.78 },
  { name: "Beige", color: srgb(208, 194, 168), roughness: 0.78 },
  { name: "Blue", color: srgb(66, 92, 138), roughness: 0.78 },
  { name: "Red", color: srgb(160, 52, 48), roughness: 0.78 },
];

const frameFinishes: readonly Swatch[] = [
  { name: "Black", color: [0.01, 0.02, 0.02], roughness: 0.78 },
  { name: "White", color: [0.85, 0.85, 0.83], roughness: 0.6 },
  { name: "Silver", color: [0.62, 0.62, 0.64], roughness: 0.3 },
  { name: "Brass", color: srgb(190, 150, 80), roughness: 0.35 },
];

const swatchPresets = (list: readonly Swatch[], suffix = ""): Readonly<Record<string, MaterialSpec>> =>
  swatches(list, suffix);

// --- Sofa ---------------------------------------------------------------------------------------

/** Authored at the default width. Arms and back are 125 mm (owner: 150 was too big). */
const sofaArm = 125;
const sofaDefault = 2100;
const sofaHalf = sofaDefault / 2;
const sofaInner = sofaHalf - sofaArm;

/** Cushion `index` (1–3) of a row: pinned at the centre, sized and moved by formulas, shown by seat count. */
const sofaCushion = (
  name: string,
  index: 1 | 2 | 3,
  material: string,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): PartSpec => ({
  name,
  material,
  rule: {
    pin: { x: "center" },
    size: { x: "cushionWidthMm - 6" },
    translate: { x: `seat${index}X` },
    visible: `seatCount >= ${index}`,
  },
  build: boxes([
    [-300, y0, z0],
    [300, y1, z1],
  ]),
});

const sofaFamily: TemplateSpec = {
  id: "sofa",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "sofa",
    label: "Sofa",
    category: "Seating",
    tags: ["sofa", "couch", "armchair", "loveseat", "two-seat", "three-seat", "living room"],
    product: {
      description:
        "Fabric sofa with slim arms and back on short legs; one model from armchair to three-seater. The cushion count follows the width and a centre leg pair appears on wide sizes.",
    },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description:
          "Overall width. About 900 is an armchair, 1600 a two-seater and 2100 a three-seater; the cushion count follows the width.",
        quickPicks: [900, 1600, 2100],
        startMm: sofaArm,
        endMm: sofaArm,
        minMm: 800,
        maxMm: 2400,
        defaultMm: sofaDefault,
      },
      y: { mode: "fixed" },
      z: { mode: "fixed" },
    },
    materialSlots: {
      upholstery: {
        material: "Cream",
        title: "Frame fabric",
        choosable: true,
        presets: swatchNames(sofaFabrics),
        allowColor: true,
        allowTexture: true,
      },
      cushions: {
        material: "Cream cushion",
        title: "Cushion fabric",
        choosable: true,
        presets: swatchNames(cushionFabrics, " cushion"),
        allowColor: true,
        allowTexture: true,
      },
      legs: {
        material: "Wenge",
        title: "Legs",
        choosable: true,
        presets: swatchNames(woodFinishes),
        allowColor: true,
        allowTexture: false,
      },
    },
    formulas: {
      innerMm: "widthMm - 250",
      seatCount: "clamp(round(innerMm / 800), 1, 3)",
      cushionWidthMm: "innerMm / seatCount",
      seat1X: "(1 - (seatCount + 1) / 2) * cushionWidthMm",
      seat2X: "(2 - (seatCount + 1) / 2) * cushionWidthMm",
      seat3X: "(3 - (seatCount + 1) / 2) * cushionWidthMm",
    },
  },
  materials: {
    ...swatchPresets(sofaFabrics),
    ...swatchPresets(cushionFabrics, " cushion"),
    ...swatchPresets(woodFinishes),
  },
  parts: [
    {
      name: "Base",
      material: "Cream",
      build: boxes([
        [-sofaHalf, 70, -450],
        [sofaHalf, 200, 450],
      ]),
    },
    {
      name: "ArmLeft",
      material: "Cream",
      build: boxes([
        [-sofaHalf, 70, -450],
        [-sofaInner, 530, 450],
      ]),
    },
    {
      name: "ArmRight",
      material: "Cream",
      build: boxes([
        [sofaInner, 70, -450],
        [sofaHalf, 530, 450],
      ]),
    },
    {
      name: "Back",
      material: "Cream",
      build: boxes([
        [-sofaInner, 200, -450],
        [sofaInner, 530, -325],
      ]),
    },
    sofaCushion("SeatCushion1", 1, "Cream cushion", 200, 400, -325, 450),
    sofaCushion("SeatCushion2", 2, "Cream cushion", 200, 400, -325, 450),
    sofaCushion("SeatCushion3", 3, "Cream cushion", 200, 400, -325, 450),
    sofaCushion("BackCushion1", 1, "Cream cushion", 400, 630, -325, -125),
    sofaCushion("BackCushion2", 2, "Cream cushion", 400, 630, -325, -125),
    sofaCushion("BackCushion3", 3, "Cream cushion", 400, 630, -325, -125),
    {
      name: "CornerLegs",
      material: "Wenge",
      build: boxes(
        ...[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz): readonly [V3, V3] => [
            [sx > 0 ? sofaHalf - 100 : -sofaHalf, 0, sz > 0 ? 350 : -450],
            [sx > 0 ? sofaHalf : -sofaHalf + 100, 70, sz > 0 ? 450 : -350],
          ]),
        ),
      ),
    },
    {
      name: "CentreLegs",
      material: "Wenge",
      rule: { pin: { x: "center" }, visible: "widthMm >= 1800" },
      build: boxes(
        ...[-1, 1].map((sz): readonly [V3, V3] => [
          [-50, 0, sz > 0 ? 350 : -450],
          [50, 70, sz > 0 ? 450 : -350],
        ]),
      ),
    },
  ],
};

// --- Ottoman ------------------------------------------------------------------------------------

const ottoman: TemplateSpec = {
  id: "ottoman",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "ottoman",
    label: "Ottoman",
    category: "Seating",
    tags: ["ottoman", "pouf", "footstool", "stool", "living room"],
    product: { description: "Square upholstered ottoman on four small feet, one in each corner." },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description: "Left to right.",
        quickPicks: [450, 600, 800],
        startMm: 55,
        endMm: 55,
        minMm: 300,
        maxMm: 1000,
        defaultMm: 450,
      },
      y: {
        mode: "slice",
        title: "Height",
        description: "Overall height including the feet.",
        quickPicks: [350, 400, 450],
        startMm: 40,
        endMm: 20,
        minMm: 250,
        maxMm: 600,
        defaultMm: 400,
      },
      z: {
        mode: "slice",
        title: "Depth",
        description: "Front to back.",
        quickPicks: [450, 600, 800],
        startMm: 55,
        endMm: 55,
        minMm: 300,
        maxMm: 1000,
        defaultMm: 450,
      },
    },
    materialSlots: {
      fabric: {
        material: "Cream",
        title: "Fabric",
        choosable: true,
        presets: swatchNames(sofaFabrics),
        allowColor: true,
        allowTexture: true,
      },
      feet: {
        material: "Black",
        title: "Feet",
        choosable: true,
        presets: ["Black", "Wenge", "Oak", "Beech", "Walnut", "White"],
        allowColor: true,
        allowTexture: false,
      },
    },
  },
  materials: { ...swatchPresets(sofaFabrics), ...swatchPresets(woodFinishes) },
  parts: [
    {
      name: "Feet",
      material: "Black",
      build: boxes(
        ...[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz): readonly [V3, V3] => [
            [sx * 185 - 15, 0, sz * 185 - 15],
            [sx * 185 + 15, 20, sz * 185 + 15],
          ]),
        ),
      ),
    },
    {
      name: "Cushion",
      material: "Cream",
      build: boxes([
        [-225, 40, -225],
        [225, 400, 225],
      ]),
    },
  ],
};

// --- Chairs -------------------------------------------------------------------------------------

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** A box whose top face is offset from the bottom face (a splayed leg): both faces are the corners in order. */
const hull = (g: Geo, bottom: readonly V3[], top: readonly V3[]): void => {
  const all = [...bottom, ...top];
  const centre: V3 = [
    all.reduce((sum, p) => sum + p[0], 0) / all.length,
    all.reduce((sum, p) => sum + p[1], 0) / all.length,
    all.reduce((sum, p) => sum + p[2], 0) / all.length,
  ];
  const face = (a: V3, b: V3, c: V3, d: V3): void => {
    let n = normalize(cross3(sub3(b, a), sub3(d, a)));
    const mid: V3 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
    const out = sub3(mid, centre);
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]];
    const ids = [a, b, c, d].map((p) => vertex(g, p, n, p[0] + p[2], p[1]));
    const [i0, i1, i2, i3] = ids;
    if (i0 === undefined || i1 === undefined || i2 === undefined || i3 === undefined) return;
    g.indices.push(i0, i1, i2, i0, i2, i3);
  };
  const [b0, b1, b2, b3] = bottom;
  const [t0, t1, t2, t3] = top;
  if (!b0 || !b1 || !b2 || !b3 || !t0 || !t1 || !t2 || !t3) return;
  face(b0, b1, b2, b3);
  face(t0, t1, t2, t3);
  face(b0, b1, t1, t0);
  face(b1, b2, t2, t1);
  face(b2, b3, t3, t2);
  face(b3, b0, t0, t3);
};

/** A slanted leg: a square foot (centre, side) joined to a square top, centres given in x/z. */
const slantedLeg =
  (foot: readonly [number, number], top: readonly [number, number], y0: number, y1: number, side: number) =>
  (g: Geo): void => {
    const h = side / 2;
    const ring = (c: readonly [number, number], y: number): V3[] => [
      [c[0] - h, y, c[1] - h],
      [c[0] + h, y, c[1] - h],
      [c[0] + h, y, c[1] + h],
      [c[0] - h, y, c[1] + h],
    ];
    hull(g, ring(foot, y0), ring(top, y1));
  };

/** Five-star swivel base at the origin: spokes in the x/z plane (one along +x), a caster at each tip. */
const fiveStar =
  (spokeY0: number, spokeY1: number, casterY0: number, casterY1: number, reach: number) =>
  (g: Geo): void => {
    for (let k = 0; k < 5; k += 1) {
      const a = (k * 2 * Math.PI) / 5;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const at = (along: number, across: number): readonly [number, number] => [
        along * c - across * s,
        along * s + across * c,
      ];
      prism(g, [at(0, -18), at(reach, -12), at(reach, 12), at(0, 18)], "x", "z", "y", spokeY0, spokeY1);
      cylinder(g, at(reach, 0), casterY0, casterY1, 25);
    }
  };

const chairHeightAxis = (
  min: number,
  max: number,
  def: number,
  startMm: number,
  seatBottom: number,
): TemplateSpec["metadata"]["resize"]["y"] => ({
  mode: "slice",
  title: "Height",
  description: "Overall height; the gas lift raises or lowers the seat, back, and arms together.",
  quickPicks: [def - 50, def, def + 50],
  startMm,
  endMm: def - seatBottom,
  minMm: min,
  maxMm: max,
  defaultMm: def,
});

const diningChair: TemplateSpec = {
  id: "dining-chair",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "chair",
    label: "Dining Chair",
    category: "Seating",
    tags: ["chair", "dining", "kitchen", "fabric", "wood"],
    product: { description: "Four-legged dining chair with an upholstered seat and back and wooden legs." },
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: {
      upholstery: {
        material: "Brown fabric",
        title: "Seat and back",
        choosable: true,
        presets: swatchNames(chairFabrics),
        allowColor: true,
        allowTexture: true,
      },
      legs: {
        material: "Beech",
        title: "Legs",
        choosable: true,
        presets: ["Beech", "Oak", "Walnut", "Wenge", "Black", "White"],
        allowColor: true,
        allowTexture: false,
      },
    },
  },
  materials: { ...swatchPresets(chairFabrics), ...swatchPresets(woodFinishes) },
  parts: [
    {
      name: "Seat",
      material: "Brown fabric",
      build: boxes([
        [-220, 380, -205],
        [220, 480, 245],
      ]),
    },
    {
      name: "Back",
      material: "Brown fabric",
      build: boxes([
        [-220, 480, -250],
        [220, 900, -180],
      ]),
    },
    {
      name: "FrontLegs",
      material: "Beech",
      build: boxes(
        ...[-1, 1].map((sx): readonly [V3, V3] => [
          [sx * 185 - 18, 0, 167],
          [sx * 185 + 18, 421, 218],
        ]),
      ),
    },
    {
      name: "BackLegs",
      material: "Beech",
      build: (g) => {
        for (const sx of [-1, 1]) {
          const x0 = sx * 185 - 18;
          const x1 = sx * 185 + 18;
          prism(
            g,
            [
              [-307, 0],
              [-271, 0],
              [-168, 424],
              [-204, 424],
            ],
            "z",
            "y",
            "x",
            x0,
            x1,
          );
        }
      },
    },
  ],
};

/** Armrest-free parts shared by the swivel chair and the mesh office chair. */
const swivelFrame = "Black";

const meshOfficeChair: TemplateSpec = {
  id: "office-chair-mesh",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "chair",
    label: "Mesh Office Chair",
    category: "Seating",
    tags: ["chair", "office", "desk", "swivel", "mesh", "armrests"],
    product: {
      description:
        "Office chair on a five-star castor base with a mesh back, lumbar pad, and padded armrests.",
    },
    resize: { x: { mode: "fixed" }, y: chairHeightAxis(935, 1035, 985, 130, 415), z: { mode: "fixed" } },
    materialSlots: {
      frame: {
        material: "Black",
        title: "Frame and base",
        choosable: true,
        presets: swatchNames(frameFinishes),
        allowColor: true,
        allowTexture: false,
      },
      upholstery: {
        material: "Graphite",
        title: "Seat, pad, and armrests",
        choosable: true,
        presets: swatchNames(blackFabrics),
        allowColor: true,
        allowTexture: true,
      },
      mesh: { material: "Mesh", title: "Mesh back" },
    },
  },
  materials: {
    ...swatchPresets(frameFinishes),
    ...swatchPresets(blackFabrics),
    Mesh: { color: [0.05, 0.05, 0.06], alpha: 0.8, roughness: 0.78 },
  },
  parts: [
    {
      name: "Seat",
      material: "Graphite",
      build: boxes([
        [-240, 417, -205],
        [240, 493, 245],
      ]),
    },
    {
      name: "GasColumn",
      material: swivelFrame,
      rule: { stretch: { y: true } },
      build: (g) => cylinder(g, [0, 0], 100, 420, 32),
    },
    { name: "Base", material: swivelFrame, build: fiveStar(47, 128, 5, 65, 290) },
    {
      name: "BackFrame",
      material: swivelFrame,
      build: rectFrame(-245, 245, 475, 985, 42, 90, 40, -218, -170),
    },
    {
      name: "MeshBack",
      material: "Mesh",
      build: boxes([
        [-203, 565, -172],
        [203, 945, -154],
      ]),
    },
    {
      name: "LumbarPad",
      material: "Graphite",
      build: boxes([
        [-155, 562, -164],
        [155, 627, -132],
      ]),
    },
    {
      name: "ArmUprights",
      material: swivelFrame,
      build: boxes(
        ...[-1, 1].map((sx): readonly [V3, V3] => [
          [sx * 280 - 14, 440, 26],
          [sx * 280 + 14, 650, 54],
        ]),
      ),
    },
    {
      name: "Armrests",
      material: "Graphite",
      build: boxes(
        ...[-1, 1].map((sx): readonly [V3, V3] => [
          [sx * 280 - 32.5, 642, -65],
          [sx * 280 + 32.5, 678, 165],
        ]),
      ),
    },
  ],
};

const swivelChair: TemplateSpec = {
  id: "swivel-chair",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "chair",
    label: "Swivel Chair",
    category: "Seating",
    tags: ["chair", "swivel", "desk", "study", "children"],
    product: {
      description: "Armless swivel chair with a padded seat and backrest on a five-star castor base.",
    },
    resize: { x: { mode: "fixed" }, y: chairHeightAxis(900, 1000, 950, 130, 410), z: { mode: "fixed" } },
    materialSlots: {
      frame: {
        material: "Black",
        title: "Frame and base",
        choosable: true,
        presets: swatchNames(frameFinishes),
        allowColor: true,
        allowTexture: false,
      },
      upholstery: {
        material: "Graphite",
        title: "Seat and back",
        choosable: true,
        presets: swatchNames(blackFabrics),
        allowColor: true,
        allowTexture: true,
      },
      column: { material: "Metal", title: "Gas lift" },
    },
  },
  materials: {
    ...swatchPresets(frameFinishes),
    ...swatchPresets(blackFabrics),
    Metal: { color: [0.09, 0.11, 0.12], roughness: 0.4, metallic: 1 },
  },
  parts: [
    {
      name: "Seat",
      material: "Graphite",
      build: boxes([
        [-228, 412, -195],
        [228, 477, 235],
      ]),
    },
    {
      name: "Backrest",
      material: "Graphite",
      build: boxes([
        [-220, 520, -200],
        [220, 950, -140],
      ]),
    },
    {
      name: "BackUpright",
      material: swivelFrame,
      build: boxes([
        [-20, 430, -185],
        [20, 680, -145],
      ]),
    },
    {
      name: "GasColumn",
      material: "Metal",
      rule: { stretch: { y: true } },
      build: (g) => cylinder(g, [0, 0], 110, 420, 25),
    },
    { name: "Base", material: swivelFrame, build: fiveStar(39, 126, 2, 54, 270) },
  ],
};

const foldingChair: TemplateSpec = {
  id: "folding-chair",
  view: "side",
  metadata: {
    ...floorAreable,
    kind: "chair",
    label: "Folded Chair",
    category: "Seating",
    tags: ["chair", "folding", "folded", "balcony", "storage"],
    product: { description: "Folding chair stored folded, leaning against a wall; frame and fabric back." },
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: {
      frame: {
        material: "Black",
        title: "Frame",
        choosable: true,
        presets: swatchNames(frameFinishes),
        allowColor: true,
        allowTexture: false,
      },
      fabric: {
        material: "Graphite",
        title: "Fabric",
        choosable: true,
        presets: swatchNames(blackFabrics),
        allowColor: true,
        allowTexture: true,
      },
    },
  },
  materials: { ...swatchPresets(frameFinishes), ...swatchPresets(blackFabrics) },
  parts: [
    {
      name: "SideRails",
      material: "Black",
      build: boxes(
        ...[-1, 1].map((sx): readonly [V3, V3] => [
          [sx * 235 - 18, 15, -38],
          [sx * 235 + 18, 1030, -2],
        ]),
      ),
    },
    {
      name: "FoldedLegs",
      material: "Black",
      build: (g) => {
        for (const sx of [-1, 1])
          prism(
            g,
            [
              [65, 14],
              [95, 14],
              [27, 721],
              [-3, 721],
            ],
            "z",
            "y",
            "x",
            sx * 235 - 15,
            sx * 235 + 15,
          );
      },
    },
    {
      name: "FabricBack",
      material: "Graphite",
      build: boxes([
        [-215, 580, -12],
        [215, 960, 12],
      ]),
    },
    {
      name: "FoldedSeat",
      material: "Black",
      build: boxes([
        [-215, 305, 25],
        [215, 535, 55],
      ]),
    },
    {
      name: "TopRail",
      material: "Black",
      build: boxes([
        [-235, 1013, -37],
        [235, 1047, -3],
      ]),
    },
  ],
};

// --- Stool --------------------------------------------------------------------------------------

const stoolGreens: readonly Swatch[] = [
  { name: "Green stained wood", color: [0.1, 0.17, 0.08], roughness: 0.62 },
  { name: "Natural birch", color: srgb(222, 196, 150), roughness: 0.6 },
  { name: "Black stained wood", color: [0.02, 0.02, 0.02], roughness: 0.6 },
  { name: "White painted wood", color: [0.85, 0.85, 0.83], roughness: 0.6 },
  { name: "Walnut stained wood", color: [0.18, 0.1, 0.06], roughness: 0.55 },
  { name: "Red painted wood", color: srgb(168, 52, 44), roughness: 0.6 },
];

const stool: TemplateSpec = {
  id: "stool-three-leg",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "stool",
    label: "Three-Leg Stool",
    category: "Seating",
    tags: ["stool", "plant stand", "side table", "plywood", "bent plywood", "KYRRE"],
    product: {
      name: "KYRRE-style stool",
      description:
        "Small stool with a rounded triangular seat and three bent plywood legs; also used as a plant stand.",
      notes: "Modelled after the look of the IKEA KYRRE stool; not an exact copy.",
    },
    resize: {
      x: {
        mode: "scale",
        title: "Width",
        description: "Left to right.",
        quickPicks: [380, 420, 480],
        minMm: 350,
        maxMm: 500,
        defaultMm: 420,
      },
      y: { mode: "fixed" },
      z: {
        mode: "scale",
        title: "Depth",
        description: "Front to back.",
        quickPicks: [440, 480, 540],
        minMm: 430,
        maxMm: 550,
        defaultMm: 480,
      },
    },
    materialSlots: {
      wood: {
        material: "Green stained wood",
        title: "Wood",
        choosable: true,
        presets: swatchNames(stoolGreens),
        allowColor: true,
        allowTexture: true,
      },
    },
  },
  materials: swatchPresets(stoolGreens),
  parts: [
    {
      name: "Seat",
      material: "Green stained wood",
      build: (g) =>
        prism(
          g,
          [
            [-150, -175],
            [150, -175],
            [170, -150],
            [170, -100],
            [30, 160],
            [0, 175],
            [-30, 160],
            [-170, -100],
            [-170, -150],
          ],
          "x",
          "z",
          "y",
          430,
          450,
        ),
    },
    {
      name: "Legs",
      material: "Green stained wood",
      build: (g) => {
        // Each leg leans from its foot out under the seat corner it carries.
        slantedLeg([-190, -220], [-140, -100], 0, 440, 40)(g);
        slantedLeg([190, -220], [140, -100], 0, 440, 40)(g);
        slantedLeg([0, 220], [0, 120], 0, 440, 36)(g);
      },
    },
  ],
};

export const templates: readonly TemplateSpec[] = [
  sofa,
  armchair,
  sofaFamily,
  ottoman,
  diningChair,
  meshOfficeChair,
  swivelChair,
  foldingChair,
  stool,
];
