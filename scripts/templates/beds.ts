// Beds family.
import { boxes, floorAreable, oak } from "./helpers";
import type { MaterialSpec, TemplateSpec } from "./helpers";
import { bx, withPresets, woodSlot } from "./storage";
import type { MaterialSlot, NodeRule } from "@shared/domain/templates/metadata";

const bedDouble: TemplateSpec = {
  id: "bed-double",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "bed",
    label: "Double Bed",
    resize: {
      x: { mode: "slice", startMm: 50, endMm: 50, minMm: 1300, maxMm: 2100, defaultMm: 1700 },
      y: { mode: "fixed" },
      // Headboard at the back (−z) and footboard at the front.
      z: { mode: "slice", startMm: 80, endMm: 50, minMm: 2000, maxMm: 2400, defaultMm: 2130 },
    },
    materialSlots: { frame: "Frame", mattress: "Mattress", bedding: "Bedding" },
  },
  materials: {
    Frame: oak,
    Mattress: { color: [0.86, 0.86, 0.84], roughness: 0.9 },
    Bedding: { color: [0.62, 0.68, 0.62], roughness: 0.95 },
  },
  parts: [
    {
      name: "Frame",
      material: "Frame",
      build: boxes(
        [
          [-850, 0, -1065],
          [850, 1000, -985],
        ],
        [
          [-850, 0, 1015],
          [850, 450, 1065],
        ],
        [
          [-850, 120, -985],
          [-800, 330, 1015],
        ],
        [
          [800, 120, -985],
          [850, 330, 1015],
        ],
        [
          [-800, 200, -985],
          [800, 230, 1015],
        ],
      ),
    },
    {
      name: "Mattress",
      material: "Mattress",
      build: boxes([
        [-795, 230, -980],
        [795, 450, 1010],
      ]),
    },
    {
      name: "Duvet",
      material: "Bedding",
      build: boxes([
        [-800, 440, -300],
        [800, 480, 1012],
      ]),
    },
    {
      name: "Pillows",
      material: "Bedding",
      build: boxes(
        [
          [-760, 450, -960],
          [-40, 580, -560],
        ],
        [
          [40, 450, -960],
          [760, 580, -560],
        ],
      ),
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Phase 9.3 beds (D26): slat beds that take any width and length within limits. The width and length are the
// overall footprint (the mattress is 60 mm narrower than the width and 2 x 55 mm shorter than the length);
// legs and headboard posts stay in the corner bands, the side rails, platform, mattress, blanket, and
// headboard slats stretch, and the pillows narrow with the width so both fit side by side.

const fabric = (color: readonly [number, number, number]): MaterialSpec => ({ color, roughness: 0.95 });

const bedding: Readonly<Record<string, MaterialSpec>> = {
  Sage: fabric([0.45, 0.57, 0.45]),
  "Sage pillow": fabric([0.55, 0.67, 0.54]),
  "Pink pillow": fabric([0.69, 0.4, 0.48]),
  "Ivory quilt": fabric([0.85, 0.85, 0.75]),
  Cream: fabric([0.85, 0.8, 0.68]),
  Grey: fabric([0.5, 0.5, 0.5]),
  Navy: fabric([0.1, 0.14, 0.3]),
  Terracotta: fabric([0.62, 0.3, 0.2]),
};

const beddingSlot = (material: string, title: string, others: readonly string[]): MaterialSlot => ({
  material,
  title,
  choosable: true,
  presets: [material, ...others],
  allowColor: true,
  allowTexture: false,
});

const bedFinishes = ["Oak", "Walnut", "Birch", "White"] as const;

const bedMaterials = (
  own: Readonly<Record<string, MaterialSpec>>,
  slots: Readonly<Record<string, MaterialSlot>>,
): Readonly<Record<string, MaterialSpec>> => {
  const materials: Record<string, MaterialSpec> = { ...withPresets(own, slots) };
  for (const slot of Object.values(slots)) {
    if (typeof slot === "string") continue;
    for (const name of slot.presets ?? []) {
      const preset = bedding[name];
      if (materials[name] === undefined && preset !== undefined) materials[name] = preset;
    }
  }
  return materials;
};

const woodPart = (rule: NodeRule | undefined, material: string, ...list: ReturnType<typeof bx>[]) => ({
  material,
  ...(rule === undefined ? {} : { rule }),
  build: boxes(...list),
});

const doubleSlots: Readonly<Record<string, MaterialSlot>> = {
  wood: woodSlot("Pine", "Wood", bedFinishes, true),
  blanket: beddingSlot("Sage", "Blanket", ["Ivory quilt", "Cream", "Grey", "Navy", "Terracotta"]),
  pillow: beddingSlot("Sage pillow", "Pillow", ["Pink pillow", "Cream", "Grey", "Navy", "Terracotta"]),
  mattress: "Mattress",
};

const bedSlat: TemplateSpec = {
  id: "bed-slat-double",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "bed",
    label: "Slat Bed",
    category: "Beds",
    tags: ["bed", "double", "slat", "bedroom", "mattress"],
    product: {
      name: "Slat bed with headboard",
      description:
        "A wooden slat bed with headboard slats, a mattress, a blanket, and two pillows. Standard sizes 120, 140, 160, and 180 cm wide.",
    },
    resize: {
      x: {
        mode: "slice",
        startMm: 60,
        endMm: 60,
        minMm: 1260,
        maxMm: 1890,
        defaultMm: 1860,
        description:
          "Overall width including the frame. Quick picks fit 120, 140, 160, and 180 cm mattresses.",
        quickPicks: [1260, 1460, 1660, 1860],
      },
      y: { mode: "fixed" },
      z: {
        mode: "slice",
        startMm: 60,
        endMm: 60,
        minMm: 2020,
        maxMm: 2340,
        defaultMm: 2120,
        description:
          "Overall length including the headboard. Quick picks fit 190, 200, 210, and 220 cm mattresses.",
        quickPicks: [2020, 2120, 2220, 2320],
      },
    },
    materialSlots: doubleSlots,
  },
  materials: bedMaterials(
    {
      Pine: { color: [0.69, 0.39, 0.12], roughness: 0.55 },
      Mattress: { color: [0.84, 0.81, 0.74], roughness: 0.9 },
    },
    doubleSlots,
  ),
  parts: [
    {
      name: "Wood",
      ...woodPart(
        undefined,
        "Pine",
        // Headboard posts (also the back legs) and front legs in the corner bands.
        bx(-900, 0, -1050, -840, 880, -990),
        bx(840, 0, -1050, 900, 880, -990),
        bx(-900, 0, 990, -840, 250, 1050),
        bx(840, 0, 990, 900, 250, 1050),
        // Side rails and the slat platform.
        bx(-900, 200, -990, -870, 380, 990),
        bx(870, 200, -990, 900, 380, 990),
        bx(-870, 320, -990, 870, 340, 990),
        // Headboard slats between the posts.
        bx(-840, 460, -1045, 840, 570, -1015),
        bx(-840, 600, -1045, 840, 710, -1015),
        bx(-840, 740, -1045, 840, 850, -1015),
      ),
    },
    { name: "Mattress", ...woodPart(undefined, "Mattress", bx(-870, 340, -990, 870, 640, 990)) },
    // The blanket covers the foot two thirds of the mattress and hangs 20 mm over the foot end.
    { name: "Blanket", ...woodPart(undefined, "Sage", bx(-878, 640, -320, 878, 684, 1010)) },
    {
      name: "PillowLeft",
      ...woodPart(
        {
          pin: { z: "start" },
          size: { x: "min(700, sizeX / 2 - 90)" },
        },
        "Sage pillow",
        bx(-800, 640, -980, -100, 740, -560),
      ),
    },
    {
      name: "PillowRight",
      ...woodPart(
        {
          pin: { z: "start" },
          size: { x: "min(700, sizeX / 2 - 90)" },
        },
        "Sage pillow",
        bx(100, 640, -980, 800, 740, -560),
      ),
    },
  ],
};

const singleSlots: Readonly<Record<string, MaterialSlot>> = {
  wood: woodSlot("Sage wood", "Wood", ["Pine", ...bedFinishes], true),
  blanket: beddingSlot("Ivory quilt", "Blanket", ["Sage", "Cream", "Grey", "Navy", "Terracotta"]),
  pillow: beddingSlot("Pink pillow", "Pillow", ["Sage pillow", "Cream", "Grey", "Navy", "Terracotta"]),
  mattress: "Mattress",
};

const bedSingle: TemplateSpec = {
  id: "bed-slat-single",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "bed",
    label: "Single Bed",
    category: "Beds",
    tags: ["bed", "single", "children", "bedroom", "mattress"],
    product: {
      name: "Single bed with slatted headboard",
      description:
        "A low single bed on short legs with a slatted headboard, a mattress, a folded blanket, and a pillow. Standard widths 80, 90, and 100 cm.",
    },
    resize: {
      x: {
        mode: "slice",
        startMm: 65,
        endMm: 65,
        minMm: 850,
        maxMm: 1060,
        defaultMm: 960,
        description: "Overall width including the frame. Quick picks fit 80, 90, and 100 cm mattresses.",
        quickPicks: [860, 960, 1060],
      },
      y: { mode: "fixed" },
      z: {
        mode: "slice",
        startMm: 105,
        endMm: 60,
        minMm: 1940,
        maxMm: 2140,
        defaultMm: 2040,
        description:
          "Overall length including the headboard slats. Quick picks fit 190, 200, and 210 cm mattresses.",
        quickPicks: [1940, 2040, 2140],
      },
    },
    materialSlots: singleSlots,
  },
  materials: bedMaterials(
    {
      "Sage wood": { color: [0.48, 0.47, 0.3], roughness: 0.55 },
      Pine: { color: [0.69, 0.39, 0.12], roughness: 0.55 },
      Mattress: { color: [0.84, 0.81, 0.74], roughness: 0.9 },
    },
    singleSlots,
  ),
  parts: [
    {
      name: "Wood",
      ...woodPart(
        undefined,
        "Sage wood",
        // Legs in the corner bands, the solid base, and the three headboard slats behind it.
        bx(-440, 0, -1000, -385, 735, -945),
        bx(385, 0, -1000, 440, 735, -945),
        bx(-440, 0, 940, -385, 210, 995),
        bx(385, 0, 940, 440, 210, 995),
        bx(-450, 210, -970, 450, 390, 1000),
        bx(-440, 387, -1000, 440, 433, -970),
        bx(-440, 527, -1000, 440, 572, -970),
        bx(-440, 668, -1000, 440, 712, -970),
      ),
    },
    { name: "Mattress", ...woodPart(undefined, "Mattress", bx(-420, 340, -965, 420, 540, 995)) },
    {
      name: "Pillow",
      ...woodPart(
        { pin: { x: "center", z: "start" }, size: { x: "min(650, sizeX - 250)" } },
        "Pink pillow",
        bx(-325, 515, -940, 325, 635, -530),
      ),
    },
    {
      name: "FoldedBlanket",
      ...woodPart(
        { pin: { x: "center", z: "start" }, size: { x: "sizeX - 80" } },
        "Ivory quilt",
        bx(-410, 522, -530, 410, 598, -140),
      ),
    },
  ],
};

export const templates: readonly TemplateSpec[] = [bedDouble, bedSlat, bedSingle];
