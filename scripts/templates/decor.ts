// Decor family: picture frame (legacy), the parametric frame for pictures and mirrors, sheer curtains, bamboo ladder.
import { boxes, darkWood, floorAreable, prismBuilder, rectFrame, vertex, wallAreable } from "./helpers";
import type { Geo, MaterialSpec, TemplateSpec } from "./helpers";

const pictureFrame: TemplateSpec = {
  id: "picture-frame",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "picture",
    label: "Picture Frame",
    attachment: {
      hosts: ["wall"],
      contact: "back",
      defaultHostSide: "interior",
      defaultPlacement: { horizontalAlign: "center", elevationMm: 1100 },
    },
    resize: {
      x: { mode: "slice", startMm: 40, endMm: 40, minMm: 200, maxMm: 1800, defaultMm: 600 },
      y: { mode: "slice", startMm: 40, endMm: 40, minMm: 200, maxMm: 1800, defaultMm: 800 },
      z: { mode: "fixed" },
    },
    materialSlots: { frame: "Frame", picture: "Picture" },
  },
  materials: { Frame: darkWood, Picture: { color: [0.82, 0.8, 0.74], roughness: 0.8 } },
  parts: [
    { name: "Frame", material: "Frame", build: rectFrame(-300, 300, 0, 800, 40, 40, 40, 0, 25) },
    {
      name: "Picture",
      material: "Picture",
      rule: { stretch: { x: true, y: true } },
      build: boxes([
        [-260, 40, 0],
        [260, 760, 12],
      ]),
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Phase 9.5: frame for pictures and mirrors (replaces the owner's single mirrors and every grouped frame).

type PropertyOptions = Readonly<{
  title: string;
  description: string;
  minimum: number;
  maximum: number;
  default: number;
  quickPicks?: readonly number[];
}>;

const lengthProperty = (o: PropertyOptions): object => ({
  type: "number",
  title: o.title,
  description: o.description,
  minimum: o.minimum,
  maximum: o.maximum,
  default: o.default,
  "x-homeplan": {
    editor: "length",
    quantity: "length",
    ...(o.quickPicks === undefined ? {} : { quickPicks: o.quickPicks }),
  },
});

const finish = (r: number, g: number, b: number, roughness: number, metallic = 0): MaterialSpec => ({
  color: [r, g, b],
  roughness,
  ...(metallic > 0 ? { metallic } : {}),
});

const frameFinishes: Readonly<Record<string, MaterialSpec>> = {
  Black: finish(0.015, 0.015, 0.015, 0.45),
  White: finish(0.88, 0.86, 0.81, 0.5),
  Oak: finish(0.52, 0.34, 0.18, 0.55),
  Walnut: finish(0.2, 0.1, 0.04, 0.5),
  Gold: finish(0.72, 0.55, 0.2, 0.35, 1),
  Silver: finish(0.72, 0.73, 0.75, 0.3, 1),
};

const matFinishes: Readonly<Record<string, MaterialSpec>> = {
  "Mat white": finish(0.86, 0.84, 0.78, 0.9),
  "Mat cream": finish(0.8, 0.74, 0.6, 0.9),
  "Mat grey": finish(0.4, 0.4, 0.4, 0.9),
  "Mat black": finish(0.03, 0.03, 0.03, 0.9),
};

// Inner area of the default 600 x 800 frame with a 40 mm frame band; everything inside is bound to the bands.
const innerWidth = "max(widthMm - 2 * (frameWidthMm + matWidthMm), 20)";
const innerHeight = "max(heightMm - 2 * (frameWidthMm + matWidthMm), 20)";

const frame: TemplateSpec = {
  id: "frame",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "picture",
    label: "Frame",
    category: "Decor",
    tags: ["picture", "mirror", "frame", "print", "wall"],
    product: {
      name: "Picture or mirror frame",
      description:
        "A flat frame with an optional mat around a picture or a mirror. Pictures take any uploaded image; mirrors shine.",
    },
    attachment: {
      hosts: ["wall"],
      contact: "back",
      defaultHostSide: "interior",
      defaultPlacement: { horizontalAlign: "center", elevationMm: 1400 },
    },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description: "Outer width of the frame.",
        startMm: 40,
        endMm: 40,
        startParameter: "frameWidthMm",
        endParameter: "frameWidthMm",
        minMm: 80,
        maxMm: 2000,
        defaultMm: 600,
        quickPicks: [100, 210, 300, 420, 600, 900],
      },
      y: {
        mode: "slice",
        title: "Height",
        description: "Outer height of the frame.",
        startMm: 40,
        endMm: 40,
        startParameter: "frameWidthMm",
        endParameter: "frameWidthMm",
        minMm: 80,
        maxMm: 2000,
        defaultMm: 800,
        quickPicks: [140, 210, 300, 600, 800, 1450],
      },
      z: { mode: "fixed" },
    },
    materialSlots: {
      frame: {
        material: "Black",
        title: "Frame",
        choosable: true,
        presets: ["Black", "White", "Oak", "Walnut", "Gold", "Silver"],
        allowColor: true,
        allowTexture: true,
      },
      mat: {
        material: "Mat white",
        title: "Mat",
        choosable: true,
        presets: ["Mat white", "Mat cream", "Mat grey", "Mat black"],
        allowColor: true,
        allowTexture: false,
      },
      picture: {
        material: "Picture",
        title: "Picture",
        choosable: true,
        allowColor: true,
        allowTexture: true,
      },
      mirror: "Mirror",
      lightBar: "Light bar",
    },
    mirror: { materialSlot: "mirror" },
    properties: {
      surface: {
        type: "string",
        title: "Inside",
        description: "A picture (any uploaded image) or a mirror.",
        enum: ["Picture", "Mirror"],
        default: "Picture",
        "x-homeplan": { editor: "segmented" },
      },
      frameWidthMm: lengthProperty({
        title: "Frame width",
        description:
          "Width of the frame band on every side; twice the frame width must stay below the frame size.",
        minimum: 5,
        maximum: 120,
        default: 40,
        quickPicks: [10, 20, 40, 60],
      }),
      matWidthMm: lengthProperty({
        title: "Mat width",
        description:
          "Width of the mat (passe-partout) inside the frame; 0 shows no mat. The picture keeps at least 20 mm.",
        minimum: 0,
        maximum: 250,
        default: 30,
        quickPicks: [0, 30, 60, 100],
      }),
      lightBar: {
        type: "boolean",
        title: "Light bar",
        description: "A light bar across the top of the frame, as over a bathroom mirror.",
        default: false,
        "x-homeplan": { editor: "toggle" },
      },
    },
  },
  materials: {
    ...frameFinishes,
    ...matFinishes,
    Picture: { color: [0.82, 0.8, 0.74], roughness: 0.8 },
    Mirror: { color: [0.8, 0.85, 0.87], roughness: 0.03, metallic: 1 },
    "Light bar": {
      color: [0.9, 0.95, 1],
      roughness: 0.4,
      emissive: [0.85, 0.92, 1],
      emissiveStrength: 3,
    },
  },
  parts: [
    { name: "Frame", material: "Black", build: rectFrame(-300, 300, 0, 800, 40, 40, 40, 0, 24) },
    {
      name: "Backing",
      material: "Black",
      rule: { stretch: { x: true, y: true } },
      build: boxes([
        [-260, 40, 0],
        [260, 760, 16],
      ]),
    },
    {
      name: "Mat",
      material: "Mat white",
      rule: { stretch: { x: true, y: true }, visible: "matWidthMm > 0" },
      build: boxes([
        [-260, 40, 16],
        [260, 760, 19],
      ]),
    },
    {
      name: "Picture",
      material: "Picture",
      rule: {
        stretch: { x: true, y: true },
        size: { x: innerWidth, y: innerHeight },
        visible: "surface == 'Picture'",
      },
      build: boxes([
        [-260, 40, 19],
        [260, 760, 21],
      ]),
    },
    {
      name: "MirrorFace",
      material: "Mirror",
      rule: {
        stretch: { x: true, y: true },
        size: { x: innerWidth, y: innerHeight },
        visible: "surface == 'Mirror'",
      },
      build: boxes([
        [-260, 40, 19],
        [260, 760, 21],
      ]),
    },
    {
      name: "LightBar",
      material: "Light bar",
      rule: { pin: { y: "end" }, size: { x: "widthMm" }, visible: "lightBar" },
      build: boxes([
        [-300, 760, 4],
        [300, 800, 30],
      ]),
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Sheer curtains: folds repeat with the width.

const foldPeriodMm = 127;
const foldDepthMm = 15;

/** One zigzag period of a hanging sheet (x 0..127, y 0..2240), double-sided. */
const foldSheet = (g: Geo): void => {
  const stations = [0, 1, 2];
  const offsets = [foldDepthMm, -foldDepthMm, foldDepthMm];
  const ids: number[][] = [];
  stations.forEach((i) => {
    const z = offsets[i] ?? 0;
    const next = offsets[i + 1] ?? z;
    const prev = offsets[i - 1] ?? z;
    // Normal from the local slope of the zigzag.
    const slope = (next - prev) / (i === 1 ? 127 : 63.5);
    const n: readonly [number, number, number] = [-slope, 0, 1];
    const x = (i * foldPeriodMm) / 2;
    ids.push([vertex(g, [x, 0, z], n, x, 0), vertex(g, [x, 2240, z], n, x, 2240)]);
  });
  for (let i = 0; i < 2; i += 1) {
    const [a0, a1] = ids[i] ?? [];
    const [b0, b1] = ids[i + 1] ?? [];
    if (a0 === undefined || a1 === undefined || b0 === undefined || b1 === undefined) continue;
    g.indices.push(a0, b0, b1, a0, b1, a1);
  }
};

const sheerFinish = (r: number, g: number, b: number): MaterialSpec => ({
  color: [r, g, b],
  alpha: 0.76,
  roughness: 0.9,
  doubleSided: true,
});

const curtains: TemplateSpec = {
  id: "curtain-sheer",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "curtain",
    label: "Sheer Curtain",
    category: "Decor",
    tags: ["curtain", "sheer", "drape", "window"],
    product: {
      name: "Sheer curtain on a rail",
      description: "A gathered sheer curtain on a ceiling rail. Folds follow the width.",
    },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description: "Rail length; the number of folds follows it.",
        startMm: 0,
        endMm: 0,
        minMm: 600,
        maxMm: 6000,
        defaultMm: 2540,
        quickPicks: [1200, 1800, 2540, 3000],
      },
      y: {
        mode: "slice",
        title: "Height",
        description: "Floor to rail.",
        startMm: 0,
        endMm: 24,
        minMm: 800,
        maxMm: 3200,
        defaultMm: 2264,
        quickPicks: [2000, 2264, 2600],
      },
      z: { mode: "fixed" },
    },
    materialSlots: {
      sheer: {
        material: "Sheer white",
        title: "Fabric",
        choosable: true,
        presets: ["Sheer white", "Sheer cream", "Sheer grey", "Sheer sage"],
        allowColor: true,
        allowTexture: false,
      },
      rail: {
        material: "Rail white",
        title: "Rail",
        choosable: true,
        presets: ["Rail white", "Rail black", "Rail brass"],
        allowColor: true,
        allowTexture: false,
      },
    },
  },
  materials: {
    "Sheer white": sheerFinish(0.89, 0.87, 0.78),
    "Sheer cream": sheerFinish(0.82, 0.74, 0.58),
    "Sheer grey": sheerFinish(0.55, 0.56, 0.57),
    "Sheer sage": sheerFinish(0.45, 0.55, 0.42),
    "Rail white": finish(0.87, 0.85, 0.81, 0.5),
    "Rail black": finish(0.02, 0.02, 0.02, 0.4, 0.6),
    "Rail brass": finish(0.7, 0.5, 0.2, 0.35, 1),
  },
  parts: [
    {
      // At 2540 mm: round(2540 / 127) = 20 pleats (two folds each) side by side.
      name: "Folds",
      material: "Sheer white",
      rule: {
        repeat: { offsetMm: { x: foldPeriodMm }, count: "max(1, round(widthMm / 127))" },
        stretch: { y: true },
      },
      build: (g) => {
        foldSheet(g);
        for (let i = 0; i < g.positions.length; i += 3) g.positions[i] = (g.positions[i] ?? 0) - 1270;
      },
    },
    {
      name: "Rail",
      material: "Rail white",
      rule: { extendsWith: "Folds" },
      build: boxes([
        [-1270, 2240, -12],
        [1270, 2264, 12],
      ]),
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Decorative ladder leaning on the wall: bamboo rails and rungs.

const ladderLean = 280;
const ladderPitch = 250;

const octagon = (z: number, y: number, r: number): [number, number][] =>
  Array.from({ length: 8 }, (_, i): [number, number] => [
    z + r * Math.cos(((i + 0.5) / 8) * Math.PI * 2),
    y + r * Math.sin(((i + 0.5) / 8) * Math.PI * 2),
  ]);

const bambooFinish = (r: number, g: number, b: number): MaterialSpec => finish(r, g, b, 0.55);

const ladder: TemplateSpec = {
  id: "ladder-decorative",
  view: "side",
  metadata: {
    ...floorAreable,
    kind: "decor",
    label: "Decorative Ladder",
    category: "Decor",
    tags: ["ladder", "bamboo", "leaning", "towels"],
    product: {
      name: "Leaning bamboo ladder",
      description: "A decorative ladder that leans on the wall; the rungs follow the height.",
    },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description: "Outer width across both rails.",
        startMm: 35,
        endMm: 35,
        minMm: 250,
        maxMm: 700,
        defaultMm: 415,
        quickPicks: [350, 415, 500],
      },
      y: {
        mode: "scale",
        title: "Height",
        description: "Height of the ladder; rungs are added with the height.",
        minMm: 700,
        maxMm: 2400,
        defaultMm: 1600,
        quickPicks: [1200, 1600, 2000],
      },
      z: { mode: "fixed" },
    },
    materialSlots: {
      bamboo: {
        material: "Bamboo",
        title: "Bamboo",
        choosable: true,
        presets: ["Bamboo", "Bamboo dark", "Whitewash", "Black"],
        allowColor: true,
        allowTexture: false,
      },
    },
  },
  materials: {
    Bamboo: bambooFinish(0.46, 0.25, 0.08),
    "Bamboo dark": bambooFinish(0.25, 0.12, 0.05),
    Whitewash: bambooFinish(0.78, 0.74, 0.66),
    Black: bambooFinish(0.03, 0.03, 0.03),
  },
  parts: [
    {
      name: "RailLeft",
      material: "Bamboo",
      rule: { extendsWith: "Rung" },
      build: prismBuilder(
        [
          [140 + 17.5, 0],
          [140 - 17.5, 0],
          [-140 - 17.5, 1600],
          [-140 + 17.5, 1600],
        ],
        "z",
        "y",
        "x",
        -207.5,
        -172.5,
      ),
    },
    {
      name: "RailRight",
      material: "Bamboo",
      rule: { extendsWith: "Rung" },
      build: prismBuilder(
        [
          [140 + 17.5, 0],
          [140 - 17.5, 0],
          [-140 - 17.5, 1600],
          [-140 + 17.5, 1600],
        ],
        "z",
        "y",
        "x",
        172.5,
        207.5,
      ),
    },
    {
      // 6 rungs at 1600 mm: floor((1600 - 100) / 250); each 250 mm higher and 43.75 mm further back.
      name: "Rung",
      material: "Bamboo",
      rule: {
        stretch: { x: true },
        repeat: {
          offsetMm: { y: ladderPitch, z: -(ladderLean / 1600) * ladderPitch },
          count: "floor((heightMm - 100) / 250)",
        },
      },
      build: prismBuilder(octagon(140 - (ladderLean / 1600) * 225, 225, 12), "z", "y", "x", -190, 190),
    },
  ],
};

export const templates: readonly TemplateSpec[] = [pictureFrame, frame, curtains, ladder];
