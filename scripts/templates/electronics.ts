// Electronics family: wall TV with a screen slot (Phase 8.8; legacy), and the Phase 9.5 sliced wall TV, curved
// monitor, and electronic keyboard.
import { boxes, floorAreable, vertex, wallAreable } from "./helpers";
import type { Geo, MaterialSpec, TemplateSpec } from "./helpers";

const tvWall: TemplateSpec = {
  id: "tv-wall",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "tv",
    label: "Wall TV",
    attachment: {
      hosts: ["wall"],
      contact: "back",
      defaultHostSide: "interior",
      defaultPlacement: { horizontalAlign: "center", elevationMm: 1000 },
    },
    resize: {
      x: { mode: "slice", startMm: 12, endMm: 12, minMm: 700, maxMm: 2000, defaultMm: 1230 },
      y: { mode: "slice", startMm: 12, endMm: 12, minMm: 400, maxMm: 1200, defaultMm: 710 },
      z: { mode: "fixed" },
    },
    materialSlots: { body: "Bezel", screen: "Screen" },
    // Phase 8.8: the HA viewer shows a bound media_player's running app on this slot.
    screen: { materialSlot: "screen" },
  },
  materials: {
    Bezel: { color: [0.02, 0.02, 0.02], roughness: 0.4 },
    Screen: { color: [0.01, 0.01, 0.015], roughness: 0.08 },
  },
  parts: [
    {
      name: "Body",
      material: "Bezel",
      build: boxes([
        [-615, 0, 0],
        [615, 710, 30],
      ]),
    },
    {
      name: "Screen",
      material: "Screen",
      rule: { stretch: { x: true, y: true } },
      build: boxes([
        [-603, 12, 30],
        [603, 698, 31],
      ]),
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Phase 9.5.

const finish = (r: number, g: number, b: number, roughness: number, metallic = 0): MaterialSpec => ({
  color: [r, g, b],
  roughness,
  ...(metallic > 0 ? { metallic } : {}),
});

const bodyPresets: Readonly<Record<string, MaterialSpec>> = {
  "Body black": finish(0.015, 0.015, 0.015, 0.4),
  "Body white": finish(0.85, 0.85, 0.83, 0.45),
  "Body silver": finish(0.62, 0.62, 0.64, 0.3, 1),
};

const screenMaterial: MaterialSpec = { color: [0.005, 0.006, 0.01], roughness: 0.08 };

// One wall TV for every size: width and height sliced with a bezel band that keeps its width.
const wallTv: TemplateSpec = {
  id: "wall-tv",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "tv",
    label: "Wall TV",
    category: "Electronics",
    tags: ["tv", "television", "screen", "display", "wall"],
    product: {
      name: "Flat wall-mounted television",
      description:
        "A slim flat-panel TV for the wall. Any width and height; the screen shows the bound app in Home Assistant.",
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
        description: "Overall width of the panel including the bezel.",
        startMm: 10,
        endMm: 10,
        startParameter: "bezelMm",
        endParameter: "bezelMm",
        minMm: 400,
        maxMm: 2200,
        defaultMm: 880,
        quickPicks: [560, 880, 1230, 1450],
      },
      y: {
        mode: "slice",
        title: "Height",
        description: "Overall height of the panel including the bezel.",
        startMm: 10,
        endMm: 10,
        startParameter: "bezelMm",
        endParameter: "bezelMm",
        minMm: 250,
        maxMm: 1300,
        defaultMm: 520,
        quickPicks: [340, 520, 710, 820],
      },
      z: { mode: "fixed" },
    },
    materialSlots: {
      body: {
        material: "Body black",
        title: "Bezel",
        choosable: true,
        presets: ["Body black", "Body white", "Body silver"],
        allowColor: true,
        allowTexture: false,
      },
      screen: "Screen",
    },
    screen: { materialSlot: "screen" },
    properties: {
      bezelMm: {
        type: "number",
        title: "Bezel width",
        description: "Width of the frame around the screen.",
        minimum: 3,
        maximum: 40,
        default: 10,
        "x-homeplan": { editor: "length", quantity: "length", quickPicks: [5, 10, 20] },
      },
    },
  },
  materials: { ...bodyPresets, Screen: screenMaterial },
  parts: [
    {
      name: "Body",
      material: "Body black",
      build: boxes([
        [-440, 0, 0],
        [440, 520, 40],
      ]),
    },
    {
      name: "Screen",
      material: "Screen",
      rule: { stretch: { x: true, y: true } },
      build: boxes([
        [-430, 10, 40],
        [430, 510, 41.5],
      ]),
    },
  ],
};

// Curved ultrawide monitor: the screen is an arc (1200R at 810 mm); the width stretches the arc.
const monitorRadius = 1200;
const curvedStrip = (
  g: Geo,
  halfWidth: number,
  y0: number,
  y1: number,
  zFront: number,
  zBack: number,
): void => {
  const steps = 24;
  const zAt = (x: number): number => zFront + monitorRadius - Math.sqrt(monitorRadius ** 2 - x * x);
  const thickness = zFront - zBack;
  for (const layer of [0, 1] as const) {
    const shift = layer === 0 ? 0 : -thickness;
    const rows: number[][] = [];
    for (let i = 0; i <= steps; i += 1) {
      const x = -halfWidth + (2 * halfWidth * i) / steps;
      const slope = x / Math.sqrt(monitorRadius ** 2 - x * x);
      const normal: readonly [number, number, number] = layer === 0 ? [-slope, 0, 1] : [slope, 0, -1];
      rows.push([
        vertex(g, [x, y0, zAt(x) + shift], normal, x, y0),
        vertex(g, [x, y1, zAt(x) + shift], normal, x, y1),
      ]);
    }
    for (let i = 0; i < steps; i += 1) {
      const [a0, a1] = rows[i] ?? [];
      const [b0, b1] = rows[i + 1] ?? [];
      if (a0 === undefined || a1 === undefined || b0 === undefined || b1 === undefined) continue;
      g.indices.push(a0, b0, b1, a0, b1, a1);
    }
  }
  // Top, bottom and the two ends close the panel.
  for (const x of [-halfWidth, halfWidth]) {
    const front = zAt(x);
    boxes([
      [x - 0.5, y0, front - thickness],
      [x + 0.5, y1, front],
    ])(g);
  }
  for (const [y, sign] of [
    [y0, -1],
    [y1, 1],
  ] as const) {
    const ids: number[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const x = -halfWidth + (2 * halfWidth * i) / steps;
      ids.push(
        vertex(g, [x, y, zAt(x)], [0, sign, 0], x, 0),
        vertex(g, [x, y, zAt(x) - thickness], [0, sign, 0], x, 1),
      );
    }
    for (let i = 0; i < steps; i += 1) {
      const [a0, a1, b0, b1] = [ids[2 * i], ids[2 * i + 1], ids[2 * i + 2], ids[2 * i + 3]];
      if (a0 === undefined || a1 === undefined || b0 === undefined || b1 === undefined) continue;
      g.indices.push(a0, b0, b1, a0, b1, a1);
    }
  }
};

const monitor: TemplateSpec = {
  id: "monitor-curved",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "monitor",
    label: "Curved Monitor",
    category: "Electronics",
    tags: ["monitor", "ultrawide", "curved", "computer", "screen", "desk"],
    product: {
      name: "Curved ultrawide monitor",
      description: "A curved ultrawide monitor on a stand. The width stretches the panel.",
    },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description: "Width of the panel; the stand stays in the middle.",
        startMm: 0,
        endMm: 0,
        minMm: 500,
        maxMm: 1300,
        defaultMm: 810,
        quickPicks: [600, 810, 1200],
      },
      y: { mode: "fixed" },
      z: { mode: "fixed" },
    },
    materialSlots: {
      body: {
        material: "Body black",
        title: "Body",
        choosable: true,
        presets: ["Body black", "Body white", "Body silver"],
        allowColor: true,
        allowTexture: false,
      },
      screen: "Screen",
    },
  },
  materials: { ...bodyPresets, Screen: screenMaterial },
  parts: [
    {
      name: "Base",
      material: "Body black",
      rule: { pin: { x: "center" } },
      build: boxes([
        [-120, 0, -90],
        [120, 20, 90],
      ]),
    },
    {
      name: "Stand",
      material: "Body black",
      rule: { pin: { x: "center" } },
      build: boxes([
        [-18, 20, -53],
        [18, 230, -17],
      ]),
    },
    {
      name: "PanelBack",
      material: "Body black",
      rule: { stretch: { x: true } },
      build: (g) => curvedStrip(g, 405.5, 190, 545, -0.4, -16.9),
    },
    {
      name: "Screen",
      material: "Screen",
      rule: { stretch: { x: true } },
      build: (g) => curvedStrip(g, 405, 195, 540, 0.1, 0),
    },
  ],
};

// Electronic keyboard: white keys follow the width, black keys repeat per octave.
const whiteKeyMm = 28.07;
const keyboardBodyEnd = 60;

const keyboard: TemplateSpec = {
  id: "keyboard-electronic",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "instrument",
    label: "Electronic Keyboard",
    category: "Electronics",
    tags: ["keyboard", "piano", "synth", "music", "instrument"],
    product: {
      name: "Electronic keyboard",
      description:
        "A keyboard instrument whose number of keys follows the width: 49 keys 935 mm, 61 keys 1130 mm, 76 keys 1355 mm, 88 keys 1580 mm.",
    },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description: "Overall width; white keys are added or removed to fit.",
        startMm: keyboardBodyEnd,
        endMm: keyboardBodyEnd,
        minMm: 700,
        maxMm: 1700,
        defaultMm: 1130,
        quickPicks: [935, 1130, 1355, 1580],
      },
      y: { mode: "fixed" },
      z: { mode: "fixed" },
    },
    materialSlots: {
      body: {
        material: "Keyboard body",
        title: "Body",
        choosable: true,
        presets: ["Keyboard body", "Body white", "Body silver", "Keyboard walnut"],
        allowColor: true,
        allowTexture: false,
      },
      whiteKeys: "Ivory keys",
      blackKeys: "Black keys",
    },
    formulas: { whiteKeys: `round((widthMm - ${2 * keyboardBodyEnd}) / ${whiteKeyMm})` },
  },
  materials: {
    "Keyboard body": finish(0.05, 0.06, 0.07, 0.45),
    "Body white": bodyPresets["Body white"] ?? finish(0.85, 0.85, 0.83, 0.45),
    "Body silver": bodyPresets["Body silver"] ?? finish(0.62, 0.62, 0.64, 0.3, 1),
    "Keyboard walnut": finish(0.2, 0.1, 0.04, 0.5),
    "Ivory keys": finish(0.9, 0.88, 0.81, 0.4),
    "Black keys": finish(0.012, 0.012, 0.012, 0.35),
    Display: { color: [0.01, 0.03, 0.04], roughness: 0.1, emissive: [0.2, 0.5, 0.6], emissiveStrength: 0.6 },
  },
  parts: [
    {
      name: "Body",
      material: "Keyboard body",
      rule: { extendsWith: "Divider" },
      build: boxes([
        [-565, 0, -150],
        [565, 90, 150],
      ]),
    },
    {
      name: "KeyBed",
      material: "Ivory keys",
      rule: { extendsWith: "Divider" },
      build: boxes([
        [-505, 85, -40],
        [505, 103, 130],
      ]),
    },
    {
      // 35 dividers between 36 white keys at the default width.
      name: "Divider",
      material: "Keyboard body",
      rule: { repeat: { offsetMm: { x: whiteKeyMm }, count: "max(1, whiteKeys - 1)" } },
      build: boxes([
        [-505 + whiteKeyMm - 0.5, 103, -40],
        [-505 + whiteKeyMm + 0.5, 104.5, 130],
      ]),
    },
    {
      // Five black keys per octave (C#, D#, F#, G#, A#): 5 octaves at 36 white keys.
      name: "BlackKeys",
      material: "Black keys",
      rule: {
        repeat: { offsetMm: { x: 7 * whiteKeyMm }, count: "max(1, floor(whiteKeys / 7))" },
      },
      build: boxes(
        ...[1, 2, 4, 5, 6].map((boundary): [[number, number, number], [number, number, number]] => [
          [-505 + boundary * whiteKeyMm - 7.5, 101, -38.5],
          [-505 + boundary * whiteKeyMm + 7.5, 129, 54.5],
        ]),
      ),
    },
    {
      name: "Display",
      material: "Display",
      // The key rows grow to the right in natural space, so the display is moved back to the middle.
      rule: { translate: { x: `(whiteKeys - 36) * ${whiteKeyMm} / 2` } },
      build: boxes([
        [-45, 90, -110],
        [45, 94, -70],
      ]),
    },
  ],
};

export const templates: readonly TemplateSpec[] = [tvWall, wallTv, monitor, keyboard];
