// Lights family: pendant, floor lamp, linear strip (legacy) and the Phase 9.5 fixtures: round and square ceiling
// lights, cone and shade pendants, wall spotlight.
import { boxes, cylinder, floorAreable, frustum, sphere, wallAreable } from "./helpers";
import type { MaterialSpec, TemplateSpec } from "./helpers";

const warmLight = { lumens: 800, kelvin: 2700 } as const;

const pendantLight: TemplateSpec = {
  id: "pendant-light",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "light",
    label: "Pendant Light",
    attachment: { hosts: ["overhead"], contact: "top" },
    resize: {
      x: { mode: "fixed" },
      // The drop: shade and bulb in the 300 mm start band, canopy in the 30 mm end band, the cord stretches.
      y: { mode: "slice", title: "Drop", startMm: 300, endMm: 30, minMm: 450, maxMm: 2500, defaultMm: 1000 },
      z: { mode: "fixed" },
    },
    materialSlots: { shade: "Shade", canopy: "Canopy" },
    light: {
      shape: "point",
      outputLumens: 800,
      colorModes: ["colorTemperature"],
      kelvin: 2700,
      minKelvin: 2200,
      maxKelvin: 4000,
    },
  },
  materials: {
    Shade: {
      color: [0.85, 0.78, 0.62],
      roughness: 0.85,
      emissive: [1, 0.78, 0.5],
      emissiveStrength: 0.6,
      doubleSided: true,
    },
    Canopy: { color: [0.1, 0.1, 0.1], roughness: 0.4, metallic: 0.5 },
    Bulb: { color: [1, 0.95, 0.85], roughness: 0.2, emissive: [1, 0.82, 0.6], emissiveStrength: 6 },
  },
  parts: [
    { name: "Shade", material: "Shade", build: (g) => frustum(g, [0, 0], 0, 280, 200, 70, { segments: 32 }) },
    {
      name: "ShadeInside",
      material: "Shade",
      build: (g) => frustum(g, [0, 0], 0, 280, 198, 68, { segments: 32, inward: true }),
    },
    { name: "Socket", material: "Canopy", build: (g) => cylinder(g, [0, 0], 210, 300, 22) },
    { name: "Bulb", material: "Bulb", build: (g) => sphere(g, [0, 150, 0], 45) },
    { name: "BulbLight", origin: [0, 150, 0], light: warmLight },
    { name: "Cord", material: "Canopy", build: (g) => cylinder(g, [0, 0], 300, 970, 3) },
    { name: "Canopy", material: "Canopy", build: (g) => cylinder(g, [0, 0], 970, 1000, 60) },
  ],
};

const floorLamp: TemplateSpec = {
  id: "floor-lamp",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "light",
    label: "Floor Lamp",
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: { shade: "Shade", stand: "Stand" },
    light: {
      shape: "point",
      outputLumens: 1200,
      colorModes: ["colorTemperature"],
      kelvin: 2700,
      minKelvin: 2200,
      maxKelvin: 4000,
    },
  },
  materials: {
    Shade: {
      color: [0.92, 0.9, 0.84],
      roughness: 0.85,
      emissive: [1, 0.82, 0.58],
      emissiveStrength: 0.8,
      doubleSided: true,
    },
    Stand: { color: [0.08, 0.08, 0.08], roughness: 0.35, metallic: 0.8 },
    Bulb: { color: [1, 0.95, 0.85], roughness: 0.2, emissive: [1, 0.82, 0.6], emissiveStrength: 6 },
  },
  parts: [
    { name: "Base", material: "Stand", build: (g) => cylinder(g, [0, 0], 0, 25, 160) },
    { name: "Pole", material: "Stand", build: (g) => cylinder(g, [0, 0], 25, 1400, 12) },
    {
      name: "Shade",
      material: "Shade",
      build: (g) => frustum(g, [0, 0], 1380, 1700, 220, 170, { segments: 32 }),
    },
    {
      name: "ShadeInside",
      material: "Shade",
      build: (g) => frustum(g, [0, 0], 1380, 1700, 218, 168, { segments: 32, inward: true }),
    },
    { name: "Bulb", material: "Bulb", build: (g) => sphere(g, [0, 1480, 0], 50) },
    { name: "BulbLight", origin: [0, 1480, 0], light: { lumens: 1200, kelvin: 2700 } },
  ],
};

const linearStrip: TemplateSpec = {
  id: "linear-strip",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "light",
    label: "Linear LED Strip",
    attachment: { hosts: ["wall", "overhead", "floor"], contact: "back", defaultHostSide: "interior" },
    resize: {
      x: { mode: "slice", title: "Length", startMm: 5, endMm: 5, minMm: 200, maxMm: 6000, defaultMm: 1000 },
      y: { mode: "fixed" },
      z: { mode: "fixed" },
    },
    materialSlots: { housing: "Housing", diffuser: "Diffuser" },
    light: {
      shape: "linear",
      outputLumens: 1200,
      colorModes: ["colorTemperature", "rgb"],
      kelvin: 3000,
      minKelvin: 2700,
      maxKelvin: 6500,
    },
  },
  materials: {
    Housing: { color: [0.7, 0.7, 0.72], roughness: 0.35, metallic: 1 },
    Diffuser: { color: [1, 0.97, 0.92], roughness: 0.5, emissive: [1, 0.9, 0.78], emissiveStrength: 4 },
  },
  parts: [
    {
      name: "Housing",
      material: "Housing",
      build: boxes(
        [
          [-500, 0, 0],
          [500, 17, 2],
        ],
        [
          [-500, 0, 2],
          [500, 2, 8],
        ],
        [
          [-500, 15, 2],
          [500, 17, 8],
        ],
        [
          [-500, 2, 2],
          [-495, 15, 8],
        ],
        [
          [495, 2, 2],
          [500, 15, 8],
        ],
      ),
    },
    {
      name: "Diffuser",
      material: "Diffuser",
      rule: { stretch: { x: true }, emitter: "linear" },
      build: boxes([
        [-495, 2, 6],
        [495, 15, 7.5],
      ]),
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Phase 9.5 fixtures. Light defaults match the lights we tested with; the Light object copies them on insertion.

const fixtureLight = (
  lumens: number,
  kelvin: number,
  shape: "point" | "spot" = "point",
): NonNullable<TemplateSpec["metadata"]["light"]> => ({
  shape,
  outputLumens: lumens,
  colorModes: ["fixedWhite", "colorTemperature"],
  kelvin,
  minKelvin: 2200,
  maxKelvin: 6500,
});

const matte = (r: number, g: number, b: number, roughness = 0.5, metallic = 0): MaterialSpec => ({
  color: [r, g, b],
  roughness,
  ...(metallic > 0 ? { metallic } : {}),
});

const metalPresets: Readonly<Record<string, MaterialSpec>> = {
  "Rose gold": matte(0.5841, 0.2542, 0.1812, 0.35, 0.6),
  Brass: matte(0.7, 0.5, 0.2, 0.35, 1),
  Black: matte(0.02, 0.02, 0.02, 0.4, 0.6),
  White: matte(0.87, 0.85, 0.81, 0.5),
  Chrome: matte(0.75, 0.76, 0.78, 0.15, 1),
};

const diameterProperty = (title: string, description: string, picks: readonly number[], def: number) => ({
  type: "number",
  title,
  description,
  minimum: Math.min(...picks) - 50,
  maximum: Math.max(...picks) * 2,
  default: def,
  "x-homeplan": { editor: "length", quantity: "length", quickPicks: picks },
});

const opal: MaterialSpec = {
  color: [0.95, 0.93, 0.85],
  roughness: 0.4,
  emissive: [1, 0.95, 0.85],
  emissiveStrength: 0.8,
};

// Round: rim 380 mm across (the Diameter), opal bowl 364 mm below it; x scales, z follows through `size`.
const ceilingRound: TemplateSpec = {
  id: "ceiling-light-round",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "light",
    label: "Round Ceiling Light",
    category: "Lighting",
    tags: ["ceiling", "flush", "round", "light"],
    product: {
      name: "Flush round ceiling light",
      description: "An opal flush-mounted ceiling light. The diameter sets the fixture and its emitter.",
    },
    attachment: { hosts: ["overhead"], contact: "top" },
    resize: {
      x: {
        mode: "scale",
        parameter: "diameterMm",
        title: "Diameter",
        description: "Outer diameter of the fixture.",
        minMm: 200,
        maxMm: 800,
        defaultMm: 380,
        quickPicks: [300, 380, 450, 600],
      },
      y: { mode: "fixed" },
      z: { mode: "fixed" },
    },
    materialSlots: {
      rim: {
        material: "Rim white",
        title: "Rim",
        choosable: true,
        presets: ["Rim white", "Rim black", "Rim brass", "Rim chrome"],
        allowColor: true,
        allowTexture: false,
      },
      diffuser: "Opal",
    },
    light: fixtureLight(900, 3000),
  },
  materials: {
    "Rim white": matte(0.87, 0.85, 0.81, 0.5),
    "Rim black": matte(0.02, 0.02, 0.02, 0.4, 0.6),
    "Rim brass": matte(0.7, 0.5, 0.2, 0.35, 1),
    "Rim chrome": matte(0.75, 0.76, 0.78, 0.15, 1),
    Opal: opal,
  },
  parts: [
    {
      name: "Rim",
      material: "Rim white",
      rule: { size: { z: "diameterMm" } },
      build: (g) => frustum(g, [0, 0], 66, 76, 190, 190, { segments: 48, capStart: true, capEnd: true }),
    },
    {
      name: "Shade",
      material: "Opal",
      rule: { size: { z: "diameterMm * 182 / 190" } },
      build: (g) => {
        frustum(g, [0, 0], 0, 14, 160, 182, { segments: 48, capStart: true });
        frustum(g, [0, 0], 14, 66, 182, 182, { segments: 48 });
      },
    },
  ],
};

const ceilingSquare: TemplateSpec = {
  id: "ceiling-light-square",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "light",
    label: "Square Ceiling Light",
    category: "Lighting",
    tags: ["ceiling", "flush", "square", "light"],
    product: {
      name: "Flush square ceiling light",
      description: "A square flush-mounted ceiling light with a frosted diffuser.",
    },
    attachment: { hosts: ["overhead"], contact: "top" },
    resize: {
      x: {
        mode: "scale",
        parameter: "sideMm",
        title: "Side",
        description: "Side length of the square fixture.",
        minMm: 150,
        maxMm: 800,
        defaultMm: 290,
        quickPicks: [200, 290, 400, 600],
      },
      y: { mode: "fixed" },
      z: { mode: "fixed" },
    },
    materialSlots: {
      housing: {
        material: "Housing white",
        title: "Housing",
        choosable: true,
        presets: ["Housing white", "Housing black", "Housing brass"],
        allowColor: true,
        allowTexture: false,
      },
      diffuser: "Diffuser",
    },
    light: fixtureLight(1000, 4000),
  },
  materials: {
    "Housing white": matte(0.87, 0.85, 0.81, 0.5),
    "Housing black": matte(0.02, 0.02, 0.02, 0.4, 0.6),
    "Housing brass": matte(0.7, 0.5, 0.2, 0.35, 1),
    Diffuser: { ...opal, color: [0.92, 0.92, 0.85] },
  },
  parts: [
    {
      name: "Housing",
      material: "Housing white",
      rule: { size: { z: "sideMm" } },
      build: boxes([
        [-145, 14, -145],
        [145, 50, 145],
      ]),
    },
    {
      name: "Diffuser",
      material: "Diffuser",
      rule: { size: { x: "sideMm * 270 / 290", z: "sideMm * 270 / 290" } },
      build: boxes([
        [-135, 0, -135],
        [135, 18, 135],
      ]),
    },
  ],
};

const pendantCone: TemplateSpec = {
  id: "pendant-cone",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "light",
    label: "Cone Pendant Light",
    category: "Lighting",
    tags: ["pendant", "cone", "ceiling", "light"],
    product: {
      name: "Cone pendant light",
      description: "A metal cone shade on a cord with a wooden collar. Drop and diameter are adjustable.",
    },
    attachment: { hosts: ["overhead"], contact: "top" },
    resize: {
      x: { mode: "fixed" },
      // The drop: cone and collar in the 190 mm start band, ceiling rose in the 10 mm end band, the cord stretches.
      y: {
        mode: "slice",
        title: "Drop",
        description: "Total height from the ceiling to the bottom of the shade.",
        startMm: 190,
        endMm: 10,
        minMm: 450,
        maxMm: 2500,
        defaultMm: 750,
        quickPicks: [600, 750, 1000, 1500],
      },
      z: { mode: "fixed" },
    },
    materialSlots: {
      shade: {
        material: "Rose gold",
        title: "Shade",
        choosable: true,
        presets: ["Rose gold", "Brass", "Black", "White", "Chrome"],
        allowColor: true,
        allowTexture: false,
      },
      lining: "Shade inside",
      collar: "Wood collar",
      cord: "Cord",
      canopy: "Ceiling rose",
    },
    properties: {
      diameterMm: diameterProperty("Shade diameter", "Diameter of the cone shade.", [300, 410, 500], 410),
    },
    light: fixtureLight(1200, 3000),
  },
  materials: {
    ...metalPresets,
    "Shade inside": { ...matte(0.855, 0.8228, 0.7605, 0.8), doubleSided: true },
    "Wood collar": matte(0.5841, 0.3763, 0.1441, 0.8),
    Cord: matte(0.807, 0.7758, 0.7157, 0.9),
    "Ceiling rose": matte(0.8714, 0.855, 0.807, 0.7),
  },
  parts: [
    {
      name: "Cone",
      material: "Rose gold",
      rule: { size: { x: "diameterMm", z: "diameterMm" } },
      build: (g) => frustum(g, [0, 0], 0, 130, 205, 33, { segments: 48 }),
    },
    {
      name: "ConeInside",
      material: "Shade inside",
      rule: { size: { x: "diameterMm * 396 / 410", z: "diameterMm * 396 / 410" } },
      build: (g) => frustum(g, [0, 0], 4.5, 129.5, 198, 33, { segments: 48, inward: true }),
    },
    { name: "Collar", material: "Wood collar", build: (g) => cylinder(g, [0, 0], 130, 190, 33.5) },
    { name: "Cord", material: "Cord", build: (g) => cylinder(g, [0, 0], 190, 740, 3) },
    { name: "Canopy", material: "Ceiling rose", build: (g) => cylinder(g, [0, 0], 740, 750, 45) },
  ],
};

const shadeFinish = (r: number, g: number, b: number): MaterialSpec => ({
  color: [r, g, b],
  roughness: 0.85,
  emissive: [1, 0.85, 0.62],
  emissiveStrength: 0.5,
  doubleSided: true,
});

const pendantShade: TemplateSpec = {
  id: "pendant-shade",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "light",
    label: "Shade Pendant Light",
    category: "Lighting",
    tags: ["pendant", "drum", "shade", "ceiling", "light"],
    product: {
      name: "Drum shade pendant light",
      description: "A fabric drum shade on a thin suspension. Drop and diameter are adjustable.",
    },
    attachment: { hosts: ["overhead"], contact: "top" },
    resize: {
      x: { mode: "fixed" },
      y: {
        mode: "slice",
        title: "Drop",
        description: "Total height from the ceiling to the bottom of the shade.",
        startMm: 290,
        endMm: 12,
        minMm: 450,
        maxMm: 2500,
        defaultMm: 571,
        quickPicks: [571, 800, 1200],
      },
      z: { mode: "fixed" },
    },
    materialSlots: {
      shade: {
        material: "Shade cream",
        title: "Shade",
        choosable: true,
        presets: ["Shade cream", "Shade white", "Shade grey", "Shade terracotta"],
        allowColor: true,
        allowTexture: false,
      },
      suspension: "Suspension",
      canopy: "Ceiling rose",
    },
    properties: {
      diameterMm: diameterProperty("Shade diameter", "Diameter of the drum shade.", [300, 430, 600], 430),
    },
    light: fixtureLight(1000, 3500),
  },
  materials: {
    "Shade cream": shadeFinish(0.8, 0.74, 0.47),
    "Shade white": shadeFinish(0.88, 0.86, 0.8),
    "Shade grey": shadeFinish(0.4, 0.4, 0.4),
    "Shade terracotta": shadeFinish(0.5, 0.22, 0.12),
    Suspension: matte(0.89, 0.87, 0.81, 0.6),
    "Ceiling rose": matte(0.89, 0.87, 0.81, 0.5),
  },
  parts: [
    {
      name: "Drum",
      material: "Shade cream",
      rule: { size: { x: "diameterMm", z: "diameterMm" } },
      build: (g) => {
        frustum(g, [0, 0], 0, 290, 215, 215, { segments: 48 });
        frustum(g, [0, 0], 0.5, 289.5, 213, 213, { segments: 48, inward: true });
      },
    },
    { name: "Suspension", material: "Suspension", build: (g) => cylinder(g, [0, 0], 290, 559, 2) },
    { name: "Canopy", material: "Ceiling rose", build: (g) => cylinder(g, [0, 0], 559, 571, 37.5) },
  ],
};

const wallSpotlight: TemplateSpec = {
  id: "wall-spotlight",
  view: "side",
  metadata: {
    ...wallAreable,
    kind: "light",
    label: "Wall Spotlight",
    category: "Lighting",
    tags: ["spotlight", "wall", "spot", "tube", "light"],
    product: {
      name: "Wall spotlight",
      description: "A short spot tube on a wooden back plate, aimed downwards.",
    },
    attachment: { hosts: ["overhead"], contact: "bottom" },
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: {
      tube: {
        material: "Rose gold",
        title: "Tube",
        choosable: true,
        presets: ["Rose gold", "Brass", "Black", "White", "Chrome"],
        allowColor: true,
        allowTexture: false,
      },
      plate: {
        material: "Oak plate",
        title: "Plate",
        choosable: true,
        presets: ["Oak plate", "Walnut plate", "White plate", "Black plate"],
        allowColor: true,
        allowTexture: false,
      },
      lens: "Spot inside",
    },
    light: fixtureLight(350, 2700, "spot"),
  },
  materials: {
    ...metalPresets,
    "Oak plate": matte(0.5841, 0.3763, 0.1441, 0.8),
    "Walnut plate": matte(0.25, 0.12, 0.05, 0.5),
    "White plate": matte(0.87, 0.85, 0.81, 0.5),
    "Black plate": matte(0.02, 0.02, 0.02, 0.5),
    "Spot inside": matte(0.0103, 0.0075, 0.006, 0.9),
  },
  parts: [
    {
      name: "Plate",
      material: "Oak plate",
      build: boxes([
        [-22.5, 0, -55],
        [22.5, 150, -35],
      ]),
    },
    { name: "Tube", material: "Rose gold", build: (g) => cylinder(g, [0, 0], 0, 140, 34) },
    { name: "Lens", material: "Spot inside", build: (g) => cylinder(g, [0, 0], 0, 4, 29) },
  ],
};

export const templates: readonly TemplateSpec[] = [
  pendantLight,
  floorLamp,
  linearStrip,
  ceilingRound,
  ceilingSquare,
  pendantCone,
  pendantShade,
  wallSpotlight,
];
