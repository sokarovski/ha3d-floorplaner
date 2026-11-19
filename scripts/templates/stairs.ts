// Stairs family: straight and L-shaped staircases (Staircasable) and floor openings (Phase 16.14,
// spec/builder/features/staircase-areas.md). A stair is an area object standing on the floor; its plan size is
// widthMm × depthMm and its rise totalRiseMm (the names the floor cut reads), so x, y and z all have those size
// parameters. Floor openings are Areables of kind floorOpening with `floorCut` metadata and an edge trim.
import { boxes, floorAreable, frustum, oak, prismBuilder, rectFrameXZ } from "./helpers";
import type { MaterialSpec, TemplateSpec } from "./helpers";

// Staircases: modelled with 180 mm risers and 280 mm goings at the default 15 steps (2700 mm rise); open treads
// between stringers. Each tread top sits at (k + 1) × riser, so the last tread is flush with the upper floor. The
// rise and run scale the model (the goings stretch with the run).
const riser = 180;
const going = 280;
const treadThickness = 40;
const stringer = 40;

const stepCountProperty = {
  type: "integer",
  title: "Steps",
  minimum: 3,
  maximum: 30,
  default: 15,
  "x-homeplan": { editor: "number", group: "template", order: 3 },
};

const staircaseMaterials: Readonly<Record<string, MaterialSpec>> = {
  Tread: oak,
  Stringer: { color: [0.88, 0.88, 0.86], roughness: 0.55 },
  Landing: oak,
};

/** Stringer side profile (going axis, rise axis) for a flight of `steps` treads starting at (0, 0). */
const stringerProfile = (steps: number, rise0: number): (readonly [number, number])[] => {
  const slope = riser / going;
  const run = steps * going;
  const top = rise0 + steps * riser;
  const upperAt0 = rise0 + riser + 20;
  const depth = 260;
  const foot = depth / slope;
  return [
    [0, rise0],
    [foot, rise0],
    [run, rise0 + (run - foot) * slope],
    [run, top],
    [(top - upperAt0) / slope, top],
    [0, upperAt0],
  ];
};

const totalRise = {
  mode: "scale",
  parameter: "totalRiseMm",
  title: "Total rise",
  description: "Height the stair climbs; a new stair takes the gap to the floor above",
  minMm: 1000,
  maxMm: 6000,
  defaultMm: 15 * riser,
} as const;

const staircaseStraight: TemplateSpec = {
  id: "staircase-straight",
  view: "side",
  metadata: {
    schemaVersion: 1,
    kind: "staircase",
    label: "Straight Staircase",
    contract: "Staircasable",
    attachment: { hosts: ["floor"], contact: "bottom" },
    category: "Stairs",
    resize: {
      x: { mode: "slice", startMm: stringer, endMm: stringer, minMm: 600, maxMm: 2000, defaultMm: 1000 },
      y: totalRise,
      z: {
        mode: "scale",
        title: "Run",
        description: "Length of the flight in plan; the steps stretch with it",
        minMm: 1000,
        maxMm: 8000,
        defaultMm: 2800,
      },
    },
    flip: { x: false, z: false },
    opening: null,
    materialSlots: { treads: "Tread", stringers: "Stringer" },
    properties: { stepCount: stepCountProperty },
  },
  materials: staircaseMaterials,
  parts: [
    {
      name: "Step",
      material: "Tread",
      rule: {
        repeat: { offsetMm: { y: riser, z: going }, count: { parameter: "stepCount" } },
        stretch: { x: true, y: true, z: true },
      },
      build: boxes([
        [-450 + stringer, riser - treadThickness, 0],
        [450 - stringer, riser, going],
      ]),
    },
    {
      name: "StringerLeft",
      material: "Stringer",
      rule: { stretch: { y: true, z: true }, extendsWith: "Step" },
      build: prismBuilder(stringerProfile(15, 0), "z", "y", "x", -450, -450 + stringer),
    },
    {
      name: "StringerRight",
      material: "Stringer",
      rule: { stretch: { y: true, z: true }, extendsWith: "Step" },
      build: prismBuilder(stringerProfile(15, 0), "z", "y", "x", 450 - stringer, 450),
    },
  ],
};

// L-shaped: lower flight climbs +z (x 0..900), a landing (one riser), then the upper flight climbs +x
// along z 1960..2860. The stair width is bound to the x start band and the z end band (widthMm).
const lowerSteps = 7;
const upperSteps = 7;
const width = 900;
const lowerRun = lowerSteps * going;
const landingTop = (lowerSteps + 1) * riser;
/** The L's plan extent at the defaults: one flight width plus seven goings on each side. */
const lSize = width + upperSteps * going;

const staircaseL: TemplateSpec = {
  id: "staircase-l",
  view: "plan",
  metadata: {
    schemaVersion: 1,
    kind: "staircase",
    label: "L-Shaped Staircase",
    contract: "Staircasable",
    attachment: { hosts: ["floor"], contact: "bottom" },
    category: "Stairs",
    resize: {
      x: {
        mode: "slice",
        startMm: width,
        endMm: 0,
        startParameter: "flightWidthMm",
        minMm: 1500,
        maxMm: 6000,
        defaultMm: lSize,
      },
      y: totalRise,
      z: {
        mode: "slice",
        title: "Depth",
        startMm: 0,
        endMm: width,
        endParameter: "flightWidthMm",
        minMm: 1500,
        maxMm: 6000,
        defaultMm: lSize,
      },
    },
    flip: { x: true, z: false },
    opening: null,
    materialSlots: { treads: "Tread", stringers: "Stringer", landing: "Landing" },
    properties: {
      flightWidthMm: {
        type: "number",
        title: "Flight width",
        minimum: 600,
        maximum: 2000,
        default: width,
        "x-homeplan": { editor: "length", quantity: "length", group: "template", order: 1 },
      },
      stepCount: stepCountProperty,
    },
  },
  materials: staircaseMaterials,
  parts: [
    {
      name: "LowerStep",
      material: "Tread",
      rule: {
        repeat: { offsetMm: { y: riser, z: going }, count: { parameter: "stepCount", factor: 0.5 } },
        stretch: { x: true, y: true },
      },
      build: boxes([
        [stringer, riser - treadThickness, 0],
        [width - stringer, riser, going],
      ]),
    },
    {
      name: "LowerStringerLeft",
      material: "Stringer",
      rule: { stretch: { x: true, y: true, z: true }, extendsWith: "LowerStep" },
      build: prismBuilder(stringerProfile(lowerSteps, 0), "z", "y", "x", 0, stringer),
    },
    {
      name: "LowerStringerRight",
      material: "Stringer",
      rule: { stretch: { x: true, y: true, z: true }, extendsWith: "LowerStep" },
      build: prismBuilder(stringerProfile(lowerSteps, 0), "z", "y", "x", width - stringer, width),
    },
    {
      name: "Landing",
      material: "Landing",
      rule: { follows: "LowerStep" },
      build: boxes([
        [0, landingTop - 200, lowerRun],
        [width, landingTop, lowerRun + width],
      ]),
    },
    {
      name: "UpperStep",
      material: "Tread",
      rule: {
        repeat: {
          offsetMm: { x: going, y: riser },
          count: { parameter: "stepCount", factor: 0.5, add: -0.5 },
        },
        stretch: { y: true, z: true },
        follows: "LowerStep",
      },
      build: boxes([
        [width, landingTop + riser - treadThickness, lowerRun + stringer],
        [width + going, landingTop + riser, lowerRun + width - stringer],
      ]),
    },
    {
      name: "UpperStringerInner",
      material: "Stringer",
      rule: { stretch: { x: true, y: true, z: true }, follows: "LowerStep", extendsWith: "UpperStep" },
      build: prismBuilder(
        stringerProfile(upperSteps, landingTop).map(([a, b]): readonly [number, number] => [a + width, b]),
        "x",
        "y",
        "z",
        lowerRun,
        lowerRun + stringer,
      ),
    },
    {
      name: "UpperStringerOuter",
      material: "Stringer",
      rule: { stretch: { x: true, y: true, z: true }, follows: "LowerStep", extendsWith: "UpperStep" },
      build: prismBuilder(
        stringerProfile(upperSteps, landingTop).map(([a, b]): readonly [number, number] => [a + width, b]),
        "x",
        "y",
        "z",
        lowerRun + width - stringer,
        lowerRun + width,
      ),
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Floor openings (Phase 16.14): the hole is the `floorCut` footprint; the model is only a 30 × 15 mm edge trim
// just inside the outline, so the opening can be seen and picked.

const trimWidth = 30;
const trimHeight = 15;
const trimMaterials: Readonly<Record<string, MaterialSpec>> = { Trim: oak };

const floorOpening: TemplateSpec = {
  id: "floor-opening",
  view: "plan",
  metadata: {
    ...floorAreable,
    kind: "floorOpening",
    label: "Floor Opening",
    category: "Stairs",
    floorCut: { shape: "rectangle" },
    resize: {
      x: { mode: "slice", startMm: trimWidth, endMm: trimWidth, minMm: 200, maxMm: 8000, defaultMm: 1000 },
      y: { mode: "fixed" },
      z: {
        mode: "slice",
        title: "Depth",
        startMm: trimWidth,
        endMm: trimWidth,
        minMm: 200,
        maxMm: 8000,
        defaultMm: 1000,
      },
    },
    materialSlots: { trim: "Trim" },
  },
  materials: trimMaterials,
  parts: [
    { name: "Trim", material: "Trim", build: rectFrameXZ(-500, 500, -500, 500, trimWidth, 0, trimHeight) },
  ],
};

const floorOpeningRound: TemplateSpec = {
  id: "floor-opening-round",
  view: "plan",
  metadata: {
    ...floorAreable,
    kind: "floorOpening",
    label: "Round Floor Opening",
    category: "Stairs",
    floorCut: { shape: "ellipse" },
    resize: {
      x: { mode: "scale", minMm: 200, maxMm: 8000, defaultMm: 1000 },
      y: { mode: "fixed" },
      z: { mode: "scale", title: "Depth", minMm: 200, maxMm: 8000, defaultMm: 1000 },
    },
    materialSlots: { trim: "Trim" },
  },
  materials: trimMaterials,
  parts: [
    {
      name: "Trim",
      material: "Trim",
      build: (g) => {
        const outer = 500;
        const inner = outer - trimWidth;
        const segments = 48;
        frustum(g, [0, 0], 0, trimHeight, outer, outer, { segments });
        frustum(g, [0, 0], 0, trimHeight, inner, inner, { segments, inward: true });
        // The flat top ring: a frustum of no height from the outer to the inner radius faces up.
        frustum(g, [0, 0], trimHeight, trimHeight, outer, inner, { segments });
      },
    },
  ],
};

export const templates: readonly TemplateSpec[] = [
  staircaseStraight,
  staircaseL,
  floorOpening,
  floorOpeningRound,
];
