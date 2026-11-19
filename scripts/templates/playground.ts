// Playground fixture (dev only, not a built-in): one template exercising every Phase 9.0 rule (D26) in the
// template preview playground (/ds/viewport → Template preview): a formula-counted repeat (ribs), a part hidden
// by a boolean (drawer), a choice-driven part (glazing), a hinged leaf rotating with an angle, blind slats
// tilting per copy that keep to the room face, and a sliding leaf. Phase 9.1 adds what the generic UI shows: quick
// picks on a length, an integer, and an angle, a titled choice, help texts, State parameters, two choosable
// material slots with presets (one allowing an own colour, one an own texture), a mirror slot, a category, tags,
// and product information. Written to src/features/viewport/fixtures/rules-playground.glb, never to
// server/builtin-templates.
import { boxes, floorAreable } from "./helpers";
import type { MaterialSpec, TemplateSpec } from "./helpers";

const frame: MaterialSpec = { color: [0.85, 0.85, 0.83], roughness: 0.6 };
const accent: MaterialSpec = { color: [0.52, 0.34, 0.18], roughness: 0.55 };
const slat: MaterialSpec = { color: [0.9, 0.88, 0.8], roughness: 0.7 };
const glassMaterial: MaterialSpec = {
  color: [0.75, 0.86, 0.9],
  alpha: 0.35,
  roughness: 0.05,
  doubleSided: true,
};
const oakFinish: MaterialSpec = { color: [0.6, 0.42, 0.24], roughness: 0.5 };
const wengeFinish: MaterialSpec = { color: [0.12, 0.07, 0.04], roughness: 0.45 };
const whiteFinish: MaterialSpec = { color: [0.92, 0.92, 0.9], roughness: 0.35 };
const blackFinish: MaterialSpec = { color: [0.03, 0.03, 0.03], roughness: 0.4 };
const mirrorGlass: MaterialSpec = { color: [0.8, 0.83, 0.85], roughness: 0.05, metallic: 0.9 };

export const rulesPlayground: TemplateSpec = {
  id: "rules-playground",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "playground",
    label: "Rules Playground",
    category: "Playground",
    tags: ["fixture", "rules"],
    product: {
      manufacturer: "Homeplan",
      name: "Phase 9 rule fixture",
      code: "RP-9",
      description: "Exercises every template rule and the generic settings panel.",
      notes: "Dev-only fixture; not shipped as a built-in.",
    },
    resize: {
      x: {
        mode: "slice",
        startMm: 60,
        endMm: 60,
        minMm: 800,
        maxMm: 2400,
        defaultMm: 1200,
        description: "Overall width; the rib count follows it.",
        quickPicks: [800, 1200, 1650, 2400],
      },
      y: { mode: "fixed" },
      z: { mode: "fixed" },
    },
    flip: { x: true, z: true },
    materialSlots: {
      accent: {
        material: "Accent",
        title: "Leaves and drawer",
        choosable: true,
        presets: ["Accent", "Oak", "Wenge", "White"],
        allowColor: true,
        allowTexture: false,
      },
      frame: {
        material: "Frame",
        title: "Frame",
        choosable: true,
        presets: ["White", "Black"],
        allowTexture: true,
      },
      slats: "Slat",
      glass: "Glass",
      mirror: "Mirror",
    },
    mirror: { materialSlot: "mirror" },
    properties: {
      ribPitchMm: {
        type: "number",
        title: "Rib pitch",
        description: "Distance between ribs.",
        minimum: 30,
        maximum: 100,
        default: 50,
        "x-homeplan": { editor: "length", quantity: "length", quickPicks: [40, 50, 60] },
      },
      drawer: {
        type: "boolean",
        title: "Drawer",
        description: "Shows the drawer.",
        default: true,
        "x-homeplan": { editor: "toggle" },
      },
      panelStyle: {
        type: "string",
        title: "Leaf panel",
        description: "A bare enum: the panel titles the values (Flat, Glazed).",
        enum: ["flat", "glazed"],
        default: "glazed",
      },
      handleStyle: {
        type: "string",
        title: "Handle",
        description: "Titled choices from anyOf consts.",
        anyOf: [
          { const: "bar", title: "Bar handle" },
          { const: "knob", title: "Round knob" },
          { const: "edge", title: "Edge pull" },
          { const: "none", title: "No handle (push to open)" },
        ],
        default: "bar",
      },
      shelfCount: {
        type: "integer",
        title: "Shelves",
        description: "An integer with quick picks.",
        minimum: 0,
        maximum: 6,
        default: 2,
        "x-homeplan": { quickPicks: [0, 2, 4] },
      },
      openAngleDeg: {
        type: "number",
        title: "Leaf open",
        description: "Live state: how far the hinged leaf is open.",
        minimum: 0,
        maximum: 90,
        default: 0,
        "x-homeplan": { editor: "angle", quantity: "angle", state: true, quickPicks: [0, 45, 90] },
      },
      slatsClosed: {
        type: "boolean",
        title: "Slats closed",
        default: false,
        "x-homeplan": { editor: "toggle", state: true },
      },
      slideMm: {
        type: "number",
        title: "Slide open",
        minimum: 0,
        maximum: 500,
        default: 0,
        "x-homeplan": { editor: "length", quantity: "length", state: true },
      },
    },
    formulas: {
      ribCount: "floor((widthMm - 120) / ribPitchMm)",
      slatAngleDeg: "slatsClosed ? 80 : 0",
    },
  },
  materials: {
    Frame: frame,
    Accent: accent,
    Oak: oakFinish,
    Wenge: wengeFinish,
    White: whiteFinish,
    Black: blackFinish,
    Slat: slat,
    Glass: glassMaterial,
    Mirror: mirrorGlass,
  },
  parts: [
    {
      name: "Plinth",
      material: "Frame",
      rule: { extendsWith: "Rib" },
      build: boxes([
        [-600, 0, -150],
        [600, 60, 150],
      ]),
    },
    {
      // At 1200 mm: floor(1080 / 50) = 21 ribs, the first at x −540.
      name: "Rib",
      material: "Frame",
      rule: { repeat: { offsetMm: { x: "ribPitchMm" }, count: "ribCount" } },
      build: boxes([
        [-540, 60, -20],
        [-510, 300, 20],
      ]),
    },
    {
      name: "Drawer",
      material: "Accent",
      rule: { stretch: { x: true }, visible: "drawer" },
      build: boxes([
        [-300, 320, 100],
        [300, 460, 150],
      ]),
    },
    {
      // Hinged on its left edge at the front face; negative angles swing it toward the front (+z).
      name: "Leaf",
      material: "Accent",
      rule: {
        pin: { x: "start" },
        rotate: { axis: "y", angleDeg: "-openAngleDeg", pivot: { x: "start", z: "end" } },
      },
      build: boxes([
        [-600, 480, 130],
        [-100, 980, 150],
      ]),
    },
    {
      // Same hinge as the leaf: the pivot is 50 mm left of and 5 mm in front of the glazing's own bounds.
      name: "LeafGlazing",
      material: "Glass",
      rule: {
        pin: { x: "start" },
        visible: "panelStyle == 'glazed'",
        rotate: {
          axis: "y",
          angleDeg: "-openAngleDeg",
          pivot: { x: { at: "start", offsetMm: -50 }, z: { at: "end", offsetMm: 5 } },
        },
      },
      build: boxes([
        [-550, 530, 135],
        [-150, 930, 145],
      ]),
    },
    {
      // Blind slats: 16 copies 30 mm apart, each tilting about its own long axis; they stay on the front.
      name: "Slat",
      material: "Slat",
      rule: {
        stretch: { x: true },
        repeat: { offsetMm: { y: 30 }, count: 16 },
        rotate: { axis: "x", angleDeg: "slatAngleDeg", perCopy: true },
        face: "interior",
      },
      build: boxes([
        [0, 500, 115],
        [540, 502, 145],
      ]),
    },
    {
      name: "SlidingLeaf",
      material: "Accent",
      rule: { pin: { x: "end" }, follows: "Rib", translate: { x: "-slideMm" } },
      build: boxes([
        [0, 480, -150],
        [540, 980, -130],
      ]),
    },
    {
      // The mirror slot (Phase 9.1): a panel above the top rail facing the front.
      name: "Mirror",
      material: "Mirror",
      rule: { extendsWith: "Rib" },
      build: boxes([
        [-560, 1000, -150],
        [560, 1400, -140],
      ]),
    },
    {
      name: "TopRail",
      material: "Frame",
      rule: { extendsWith: "Rib" },
      build: boxes([
        [-600, 980, -150],
        [600, 1000, 150],
      ]),
    },
  ],
};

export const templates: readonly TemplateSpec[] = [rulesPlayground];
