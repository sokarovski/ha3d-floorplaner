// Appliances family: wall-mounted air conditioner and water heater with ambient effects (D24).
import { coolingRgb, heatingRgb } from "@shared/domain/schemas/effects";
import { finishes, roundedRectY } from "./bathroom";
import { boxes, cylinder, floorAreable, frustum, metal, prismBuilder, sphere, wallAreable } from "./helpers";
import type { MaterialSpec, TemplateSpec } from "./helpers";

const airConditioner: TemplateSpec = {
  id: "air-conditioner",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "airConditioner",
    label: "Air Conditioner",
    attachment: {
      hosts: ["wall"],
      contact: "back",
      defaultHostSide: "interior",
      defaultPlacement: { horizontalAlign: "center", verticalAlign: "top", topInsetMm: 150 },
    },
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: { body: "Body" },
    // Ambient effect (D24): a blue swirl blown forward out of the louver.
    effects: [
      {
        kind: "swirl",
        enabled: true,
        direction: "forward",
        offsetMm: { x: 0, y: 80, h: -90 },
        color: [...coolingRgb],
        sizeMm: 700,
      },
    ],
  },
  materials: {
    Body: { color: [0.9, 0.9, 0.9], roughness: 0.35 },
    Louver: { color: [0.72, 0.73, 0.74], roughness: 0.4 },
    Display: { color: [0.05, 0.05, 0.05], roughness: 0.2, emissive: [0.2, 0.6, 1], emissiveStrength: 2 },
  },
  parts: [
    {
      name: "Body",
      material: "Body",
      build: boxes(
        [
          [-400, 60, 0],
          [400, 290, 200],
        ],
        [
          [-400, 0, 0],
          [400, 60, 150],
        ],
      ),
    },
    {
      name: "Louver",
      material: "Louver",
      build: prismBuilder(
        [
          [150, 60],
          [205, 50],
          [200, 30],
          [150, 40],
        ],
        "z",
        "y",
        "x",
        -380,
        380,
      ),
    },
    {
      name: "Display",
      material: "Display",
      build: boxes([
        [250, 120, 200],
        [330, 140, 202],
      ]),
    },
  ],
};

const waterHeater: TemplateSpec = {
  id: "water-heater",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "waterHeater",
    label: "Water Heater",
    attachment: {
      hosts: ["wall"],
      contact: "back",
      defaultHostSide: "interior",
      defaultPlacement: { horizontalAlign: "center", elevationMm: 1100 },
    },
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: { body: "Body" },
    // Ambient effect (D24): a red swirl rising above the tank while it heats.
    effects: [
      {
        kind: "swirl",
        enabled: true,
        direction: "up",
        offsetMm: { x: 0, y: 0, h: 80 },
        color: [...heatingRgb],
        sizeMm: 650,
      },
    ],
  },
  materials: {
    Body: { color: [0.92, 0.92, 0.9], roughness: 0.3 },
    Fittings: metal,
    Dial: { color: [0.05, 0.05, 0.05], roughness: 0.2, emissive: [1, 0.35, 0.2], emissiveStrength: 1.5 },
  },
  parts: [
    { name: "Tank", material: "Body", build: (g) => cylinder(g, [0, 240], 0, 850, 225, "y") },
    {
      name: "Bracket",
      material: "Fittings",
      build: boxes([
        [-140, 640, 0],
        [140, 720, 20],
      ]),
    },
    {
      name: "Pipes",
      material: "Fittings",
      build: (g) => {
        cylinder(g, [-80, 240], -120, 0, 12);
        cylinder(g, [80, 240], -120, 0, 12);
      },
    },
    { name: "Dial", material: "Dial", build: (g) => sphere(g, [0, 330, 455], 28) },
  ],
};

// ---------------------------------------------------------------------------------------------
// Phase 9.5: front-loading washing machine, tumble dryer, split AC indoor unit, air purifier, boiler.
// Shapes and sizes follow the owner's Phase 9 house templates (millimetres, origin at the floor or wall back).

const doorState = {
  type: "number",
  title: "Door open",
  description: "How far the round door is swung open (0 is closed).",
  minimum: 0,
  maximum: 110,
  default: 0,
  "x-homeplan": { editor: "angle", quantity: "angle", state: true },
};

const applianceWhites = ["Machine white", "Pure white", "Silver", "Graphite"] as const;
const applianceMaterials: Readonly<Record<string, MaterialSpec>> = {
  "Machine white": { color: [0.888, 0.871, 0.815], roughness: 0.35 },
  "Pure white": { color: [0.93, 0.93, 0.93], roughness: 0.35 },
  Silver: { color: [0.55, 0.57, 0.58], roughness: 0.35, metallic: 0.6 },
  Graphite: { color: [0.06, 0.065, 0.07], roughness: 0.4 },
};

const washingMachine: TemplateSpec = {
  id: "washing-machine",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "washingMachine",
    label: "Washing Machine",
    category: "Appliances",
    tags: ["washing machine", "washer", "laundry", "front loader", "appliance"],
    product: { description: "Front-loading washing machine with a round door, a control strip, and a dial." },
    resize: {
      x: {
        mode: "slice",
        title: "Width",
        description: "Width of the cabinet; the door and dial stay centred.",
        startMm: 20,
        endMm: 20,
        minMm: 540,
        maxMm: 700,
        defaultMm: 600,
        quickPicks: [595, 600, 650],
      },
      y: {
        mode: "slice",
        title: "Height",
        description: "Height of the cabinet; 820 mm fits under a worktop.",
        startMm: 10,
        endMm: 10,
        minMm: 820,
        maxMm: 900,
        defaultMm: 850,
        quickPicks: [820, 850, 900],
      },
      z: {
        mode: "slice",
        title: "Depth",
        description: "Overall depth including the door; the cabinet gets deeper behind the door.",
        startMm: 30,
        endMm: 52,
        minMm: 480,
        maxMm: 750,
        defaultMm: 652,
        quickPicks: [500, 600, 652],
      },
    },
    materialSlots: {
      body: finishes("Machine white", "Cabinet", applianceWhites),
      bezel: finishes("Bezel", "Door bezel and dial", ["Bezel", "Chrome", "Graphite"]),
      glass: "Dark glass",
    },
    properties: { doorOpenDeg: doorState },
  },
  materials: {
    ...applianceMaterials,
    Bezel: { color: [0.5, 0.53, 0.55], roughness: 0.3, metallic: 0.8 },
    Chrome: { color: [0.62, 0.64, 0.66], roughness: 0.2, metallic: 1 },
    "Dark glass": { color: [0.0086, 0.0168, 0.0232], roughness: 0.08, metallic: 0.1 },
  },
  parts: [
    {
      name: "Body",
      material: "Machine white",
      build: boxes([
        [-300, 0, -300],
        [300, 850, 300],
      ]),
    },
    {
      name: "ControlStrip",
      material: "Machine white",
      rule: { stretch: { x: true }, pin: { y: "end", z: "end" } },
      build: boxes([
        [-282, 725, 300],
        [282, 825, 318],
      ]),
    },
    {
      name: "Dial",
      material: "Bezel",
      rule: { pin: { x: "center", y: "end", z: "end" } },
      build: (g) => cylinder(g, [-80, 780], 318, 343, 28, "z"),
    },
    {
      name: "Display",
      material: "Dark glass",
      rule: { pin: { x: "center", y: "end", z: "end" } },
      build: boxes([
        [-30, 765, 318],
        [130, 810, 320],
      ]),
    },
    {
      // The door (ring, bezel, glass) hinges on its left edge at the ring's front face.
      name: "DoorRing",
      material: "Machine white",
      rule: {
        pin: { x: "center", y: "start", z: "end" },
        rotate: { axis: "y", angleDeg: "-doorOpenDeg", pivot: { x: "start", z: "end" } },
      },
      build: (g) => cylinder(g, [0, 385], 300, 326, 229, "z"),
    },
    {
      name: "DoorBezel",
      material: "Bezel",
      rule: {
        pin: { x: "center", y: "start", z: "end" },
        rotate: {
          axis: "y",
          angleDeg: "-doorOpenDeg",
          pivot: { x: { at: "start", offsetMm: -17 }, z: { at: "end", offsetMm: -16 } },
        },
      },
      build: (g) => cylinder(g, [0, 385], 326, 342, 212, "z"),
    },
    {
      name: "DoorGlass",
      material: "Dark glass",
      rule: {
        pin: { x: "center", y: "start", z: "end" },
        rotate: {
          axis: "y",
          angleDeg: "-doorOpenDeg",
          pivot: { x: { at: "start", offsetMm: -39 }, z: { at: "end", offsetMm: -26 } },
        },
      },
      build: (g) => frustum(g, [0, 385], 342, 352, 190, 170, { axis: "z", capEnd: true }),
    },
  ],
};

const tumbleDryer: TemplateSpec = {
  id: "tumble-dryer",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "tumbleDryer",
    label: "Tumble Dryer",
    category: "Appliances",
    tags: ["tumble dryer", "dryer", "laundry", "appliance", "beko"],
    product: {
      manufacturer: "Beko",
      name: "Tumble dryer",
      code: "DSX83410",
      description:
        "Free-standing 60 cm front-loading tumble dryer with a round door and a water tank drawer.",
    },
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: {
      body: finishes("Dryer white", "Cabinet", ["Dryer white", "Silver", "Graphite"]),
      ring: finishes("Chrome ring", "Door ring and dial", ["Chrome ring", "Graphite"]),
      glass: "Porthole glass",
      panel: "Panel",
      feet: "Feet",
    },
    properties: { doorOpenDeg: doorState },
  },
  materials: {
    "Dryer white": { color: [0.871, 0.871, 0.839], roughness: 0.45 },
    Silver: { color: [0.55, 0.57, 0.58], roughness: 0.35, metallic: 0.6 },
    Graphite: { color: [0.06, 0.065, 0.07], roughness: 0.4 },
    "Porthole glass": { color: [0.011, 0.0152, 0.0203], roughness: 0.15, metallic: 0.1 },
    "Chrome ring": { color: [0.558, 0.584, 0.604], roughness: 0.3, metallic: 0.8 },
    Panel: { color: [0.0232, 0.0262, 0.0307], roughness: 0.5 },
    Feet: { color: [0.0242, 0.0242, 0.0242], roughness: 0.7 },
  },
  parts: [
    {
      name: "Feet",
      material: "Feet",
      build: (g) => {
        for (const x of [-250, 250]) for (const z of [-230, 230]) cylinder(g, [x, z], 0, 15, 18);
      },
    },
    {
      name: "Body",
      material: "Dryer white",
      build: boxes([
        [-300, 15, -292],
        [300, 845, 292],
      ]),
    },
    {
      name: "ControlPanel",
      material: "Panel",
      build: boxes([
        [-285, 745, 292],
        [285, 835, 297],
      ]),
    },
    { name: "Dial", material: "Chrome ring", build: (g) => cylinder(g, [-170, 790], 297, 322, 33, "z") },
    {
      name: "Display",
      material: "Porthole glass",
      build: boxes([
        [-20, 772, 297],
        [140, 808, 299],
      ]),
    },
    {
      name: "WaterTank",
      material: "Dryer white",
      build: boxes([
        [-275, 680, 292],
        [-105, 740, 297],
      ]),
    },
    {
      name: "DoorRing",
      material: "Chrome ring",
      rule: { rotate: { axis: "y", angleDeg: "-doorOpenDeg", pivot: { x: "start", z: "end" } } },
      build: (g) => cylinder(g, [0, 388], 292, 315, 231, "z"),
    },
    {
      name: "Porthole",
      material: "Porthole glass",
      rule: {
        rotate: {
          axis: "y",
          angleDeg: "-doorOpenDeg",
          pivot: { x: { at: "start", offsetMm: -44 }, z: { at: "end", offsetMm: -11 } },
        },
      },
      build: (g) => frustum(g, [0, 388], 315, 326, 187, 170, { axis: "z", capEnd: true }),
    },
  ],
};

const splitAirConditioner: TemplateSpec = {
  id: "split-air-conditioner",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "airConditioner",
    label: "Split Air Conditioner, Indoor Unit",
    category: "Heating and cooling",
    tags: ["air conditioner", "ac", "split", "indoor unit", "cooling", "heating", "charmo"],
    product: {
      manufacturer: "Charmo",
      name: "Arctic PRO II 18k",
      description: "Wall-mounted split air conditioner, 18,000 BTU/h class: indoor unit with a lower louver.",
    },
    attachment: {
      hosts: ["wall"],
      contact: "back",
      defaultHostSide: "interior",
      defaultPlacement: { horizontalAlign: "center", verticalAlign: "top", topInsetMm: 150 },
    },
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: {
      body: finishes("Body", "Body", ["Body", "Light grey", "Black"]),
      panel: "Panel",
      vent: "Vent",
      louver: "Louver",
      display: "Display",
      led: "LED",
    },
    properties: {
      louverAngleDeg: {
        type: "number",
        title: "Louver open",
        description: "How far the lower louver swings out and down (0 is closed).",
        minimum: 0,
        maximum: 60,
        default: 0,
        "x-homeplan": { editor: "angle", quantity: "angle", state: true },
      },
    },
    // Ambient effect (D24): a red vapour blown forward from the unit.
    effects: [
      {
        kind: "vapour",
        enabled: true,
        direction: "forward",
        offsetMm: { x: 0, y: 0, h: 100 },
        color: [226, 72, 52],
        sizeMm: 600,
      },
    ],
  },
  materials: {
    Body: { color: [0.949, 0.949, 0.941], roughness: 0.45 },
    "Light grey": { color: [0.62, 0.63, 0.64], roughness: 0.45 },
    Black: { color: [0.03, 0.03, 0.035], roughness: 0.4 },
    Panel: { color: [0.98, 0.98, 0.969], roughness: 0.25 },
    Vent: { color: [0.078, 0.078, 0.09], roughness: 0.8 },
    Louver: { color: [0.929, 0.929, 0.922], roughness: 0.4 },
    Display: { color: [0.051, 0.051, 0.059], roughness: 0.15 },
    LED: { color: [0.6, 0.851, 1], roughness: 0.3, emissive: [0.4, 0.75, 1] },
  },
  parts: [
    {
      name: "Body",
      material: "Body",
      build: (g) => {
        prismBuilder(
          [
            [0, 72],
            [246, 72],
            [246, 300],
            [222, 333],
            [0, 333],
          ],
          "z",
          "y",
          "x",
          -472,
          472,
        )(g);
        boxes(
          [
            [-472, 0, 0],
            [472, 72, 172],
          ],
          [
            [-472, 0, 172],
            [-426, 72, 246],
          ],
          [
            [426, 0, 172],
            [472, 72, 246],
          ],
        )(g);
      },
    },
    {
      name: "Panel",
      material: "Panel",
      build: boxes([
        [-460, 110, 246],
        [460, 288, 248],
      ]),
    },
    {
      name: "Vent",
      material: "Vent",
      build: boxes(
        [
          [-426, 0, 172],
          [426, 72, 178],
        ],
        [
          [-426, 66, 178],
          [426, 72, 246],
        ],
      ),
    },
    {
      // A slanted blade hinged on its top edge; opening swings its lower edge forward.
      name: "Louver",
      material: "Louver",
      rule: { rotate: { axis: "x", angleDeg: "-louverAngleDeg", pivot: { y: "end", z: "start" } } },
      build: prismBuilder(
        [
          [191, 70],
          [200, 70],
          [238, -1],
          [229, -1],
        ],
        "z",
        "y",
        "x",
        -421,
        421,
      ),
    },
    {
      name: "Display",
      material: "Display",
      build: boxes([
        [265, 219, 248],
        [335, 241, 249],
      ]),
    },
    {
      name: "LED",
      material: "LED",
      build: boxes([
        [282, 227, 249],
        [318, 233, 250],
      ]),
    },
  ],
};

const airPurifier: TemplateSpec = {
  id: "air-purifier",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "airPurifier",
    label: "Air Purifier",
    category: "Appliances",
    tags: ["air purifier", "filter", "air quality", "tower", "appliance"],
    product: { description: "Floor-standing tower air purifier with a top grille and a front indicator." },
    resize: {
      x: { mode: "fixed" },
      y: {
        mode: "slice",
        title: "Height",
        description: "Height of the tower; the grille and indicator keep their distance from the top.",
        startMm: 40,
        endMm: 40,
        minMm: 450,
        maxMm: 1000,
        defaultMm: 680,
        quickPicks: [500, 680, 800],
      },
      z: { mode: "fixed" },
    },
    materialSlots: {
      body: finishes("Machine white", "Body", ["Machine white", "Pure white", "Silver", "Graphite"]),
      grille: "Grille",
      indicator: "Indicator",
    },
    // Ambient effect (D24): cyan vapour rising from the top.
    effects: [
      {
        kind: "vapour",
        enabled: true,
        direction: "up",
        offsetMm: { x: 0, y: 0, h: 100 },
        color: [0, 199, 252],
        sizeMm: 600,
      },
    ],
  },
  materials: {
    ...applianceMaterials,
    Grille: { color: [0.05, 0.055, 0.06], roughness: 0.6 },
    Indicator: { color: [0.2, 0.8, 1], roughness: 0.3, emissive: [0.2, 0.8, 1] },
  },
  parts: [
    { name: "Body", material: "Machine white", build: roundedRectY(0, 0, 135, 135, 30, 0, 675) },
    {
      name: "Grille",
      material: "Grille",
      rule: { pin: { y: "end" } },
      build: roundedRectY(0, 0, 115, 115, 20, 675, 680),
    },
    {
      name: "Indicator",
      material: "Indicator",
      rule: { pin: { y: "end" } },
      build: boxes([
        [-35, 560, 133],
        [35, 572, 135.5],
      ]),
    },
  ],
};

const heatingBoiler: TemplateSpec = {
  id: "heating-boiler-wall",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "boiler",
    label: "Wall Heating Boiler with Plumbing",
    category: "Heating and cooling",
    tags: ["boiler", "heating", "expansion vessel", "manifold", "valves", "plumbing", "utility"],
    product: {
      description:
        "Wall-hung heating boiler with a control box, an expansion vessel, a manometer, and a copper manifold with valved circuits.",
    },
    attachment: {
      hosts: ["wall"],
      contact: "back",
      defaultHostSide: "interior",
      defaultPlacement: { elevationMm: 100 },
    },
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: {
      casing: finishes("Boiler white", "Boiler and control box", ["Boiler white", "Light grey", "Graphite"]),
      vessel: finishes("Expansion red", "Expansion vessel", [
        "Expansion red",
        "Expansion blue",
        "Expansion white",
      ]),
      pipes: finishes("Copper pipe", "Pipes", ["Copper pipe", "Chrome pipe", "White pipe"]),
      valves: "Valve grey",
      gauge: "Gauge face",
      display: "Display",
    },
    properties: {
      circuits: {
        type: "integer",
        title: "Heating circuits",
        description: "How many valved pipes run down from the boiler (1 to 4).",
        minimum: 1,
        maximum: 4,
        default: 4,
        "x-homeplan": { editor: "number" },
      },
      expansionVessel: {
        type: "boolean",
        title: "Expansion vessel",
        description: "Shows the red expansion vessel to the right of the control box.",
        default: true,
        "x-homeplan": { editor: "toggle" },
      },
    },
  },
  materials: {
    "Boiler white": { color: [0.855, 0.855, 0.823], roughness: 0.5 },
    "Light grey": { color: [0.55, 0.56, 0.57], roughness: 0.5 },
    Graphite: { color: [0.06, 0.065, 0.07], roughness: 0.45 },
    "Expansion red": { color: [0.451, 0.0194, 0.013], roughness: 0.45, metallic: 0.2 },
    "Expansion blue": { color: [0.04, 0.12, 0.4], roughness: 0.45, metallic: 0.2 },
    "Expansion white": { color: [0.85, 0.85, 0.83], roughness: 0.45, metallic: 0.2 },
    "Copper pipe": { color: [0.479, 0.171, 0.068], roughness: 0.4, metallic: 0.8 },
    "Chrome pipe": { color: [0.62, 0.64, 0.66], roughness: 0.2, metallic: 1 },
    "White pipe": { color: [0.88, 0.88, 0.86], roughness: 0.5 },
    "Valve grey": { color: [0.254, 0.279, 0.305], roughness: 0.4, metallic: 0.7 },
    "Gauge face": { color: [0.896, 0.896, 0.855], roughness: 0.5 },
    Display: { color: [0.0103, 0.0123, 0.016], roughness: 0.5 },
  },
  parts: [
    { name: "Boiler", material: "Boiler white", build: roundedRectY(-230, 160, 190, 160, 25, 240, 880) },
    {
      name: "BoilerDisplay",
      material: "Display",
      build: boxes([
        [-315, 690, 320],
        [-145, 750, 324],
      ]),
    },
    { name: "BoilerDial", material: "Valve grey", build: (g) => cylinder(g, [-290, 640], 324, 340, 26, "z") },
    {
      name: "ControlBox",
      material: "Boiler white",
      build: boxes([
        [-20, 580, 0],
        [240, 820, 180],
      ]),
    },
    {
      name: "ControlSwitch",
      material: "Display",
      build: boxes([
        [75, 680, 180],
        [145, 720, 184],
      ]),
    },
    {
      name: "ExpansionVessel",
      material: "Expansion red",
      rule: { visible: "expansionVessel" },
      build: (g) => {
        cylinder(g, [290, 100], 250, 580, 88);
        frustum(g, [290, 100], 580, 620, 88, 40, { capEnd: true });
      },
    },
    {
      name: "ExpansionCap",
      material: "Valve grey",
      rule: { visible: "expansionVessel" },
      build: (g) => cylinder(g, [290, 100], 620, 650, 39),
    },
    {
      name: "ExpansionFeed",
      material: "Copper pipe",
      rule: { visible: "expansionVessel" },
      build: (g) => cylinder(g, [290, 100], 60, 250, 11),
    },
    {
      name: "Manifold",
      material: "Copper pipe",
      build: boxes([
        [-330, 48, 88],
        [340, 72, 112],
      ]),
    },
    {
      // Four circuits 60 mm apart at the default; fewer drop the rightmost.
      name: "Pipe",
      material: "Copper pipe",
      rule: { repeat: { offsetMm: { x: 60 }, count: { parameter: "circuits" } } },
      build: (g) => cylinder(g, [-310, 100], 0, 240, 11),
    },
    {
      name: "Valve",
      material: "Valve grey",
      rule: { repeat: { offsetMm: { x: 60 }, count: { parameter: "circuits" } } },
      build: boxes([
        [-331, 100, 78],
        [-289, 140, 122],
      ]),
    },
    { name: "GaugeStem", material: "Valve grey", build: (g) => cylinder(g, [-20, 90], 100, 150, 14, "z") },
    { name: "Manometer", material: "Gauge face", build: (g) => cylinder(g, [-20, 90], 150, 162, 32, "z") },
  ],
};

export const templates: readonly TemplateSpec[] = [
  airConditioner,
  waterHeater,
  washingMachine,
  tumbleDryer,
  splitAirConditioner,
  airPurifier,
  heatingBoiler,
];
