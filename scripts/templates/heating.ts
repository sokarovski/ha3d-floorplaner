// Heating family (Phase 9.2): sectional (ribbed) radiator and panel radiator, rebuilt from the owner's
// white radiators. Both count their repeated sections by formula from the width; the x axis scales, so the
// sections keep their own width and spread evenly, while the header rails and the top grille span the width.
// Heights slice with the rails and grille fixed. Wall-mounted by default (back contact), floor allowed.
import { boxes, prism, wallAreable } from "./helpers";
import type { MaterialSlot, TemplateMetadata } from "@shared/domain/templates/metadata";
import type { Geo, MaterialSpec, TemplateSpec } from "./helpers";

const finishes: Readonly<Record<string, MaterialSpec>> = {
  "Radiator white": { color: [0.88, 0.88, 0.855], roughness: 0.5 },
  "Warm white": { color: [0.888, 0.871, 0.815], roughness: 0.6 },
  Anthracite: { color: [0.06, 0.065, 0.07], roughness: 0.55 },
  "Satin black": { color: [0.02, 0.02, 0.022], roughness: 0.45 },
  Silver: { color: [0.6, 0.61, 0.62], roughness: 0.35, metallic: 0.8 },
};

const finishSlot = (material: string): MaterialSlot => ({
  material,
  title: "Finish",
  choosable: true,
  presets: Object.keys(finishes),
  allowColor: true,
  allowTexture: false,
});

const attachment: Pick<TemplateMetadata, "attachment"> = {
  attachment: {
    hosts: ["wall", "floor"],
    contact: "back",
    defaultHostSide: "interior",
    defaultPlacement: { elevationMm: 100 },
  },
};

/** Octagonal section column (plan: width × depth with chamfered corners), extruded from y0 to y1. */
const column = (
  g: Geo,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  chamfer: number,
  y0: number,
  y1: number,
) =>
  prism(
    g,
    [
      [x0 + chamfer, z0],
      [x1 - chamfer, z0],
      [x1, z0 + chamfer],
      [x1, z1 - chamfer],
      [x1 - chamfer, z1],
      [x0 + chamfer, z1],
      [x0, z1 - chamfer],
      [x0, z0 + chamfer],
    ],
    "x",
    "z",
    "y",
    y0,
    y1,
  );

// Ribbed radiator: sections every 50 mm (38 wide, 60 deep), header rails 20 × 70 at the bottom and top.
// At the default 600 mm: 12 sections; 400 mm gives 8 and 1650 mm gives 33.
const ribbedRadiator: TemplateSpec = {
  id: "radiator-ribbed",
  view: "front",
  metadata: {
    ...wallAreable,
    ...attachment,
    kind: "radiator",
    label: "Ribbed Radiator",
    category: "Heating and cooling",
    tags: ["radiator", "heating", "sectional", "column", "ribbed"],
    product: {
      description: "Sectional column radiator; the number of 50 mm sections follows the width.",
    },
    resize: {
      x: {
        mode: "scale",
        minMm: 200,
        maxMm: 3000,
        defaultMm: 600,
        description: "Overall width; one section per 50 mm.",
        quickPicks: [400, 600, 800, 1000, 1200, 1650],
      },
      y: {
        mode: "slice",
        startMm: 30,
        endMm: 20,
        minMm: 200,
        maxMm: 2000,
        defaultMm: 600,
        description: "Overall height; the header rails keep their size.",
        quickPicks: [300, 450, 600, 900, 1800],
      },
      z: { mode: "fixed" },
    },
    materialSlots: { body: finishSlot("Radiator white") },
    formulas: { sectionCount: "max(1, floor(widthMm / 50))" },
  },
  materials: finishes,
  parts: [
    {
      name: "Section",
      material: "Radiator white",
      rule: { stretch: { y: true }, repeat: { offsetMm: { x: 50 }, count: "sectionCount" } },
      build: (g) => column(g, -294, -256, -30, 30, 9, 0, 585),
    },
    {
      name: "Rails",
      material: "Radiator white",
      rule: { extendsWith: "Section" },
      build: boxes(
        [
          [-300, 10, -35],
          [300, 30, 35],
        ],
        [
          [-300, 580, -35],
          [300, 600, 35],
        ],
      ),
    },
  ],
};

// Panel radiator: the owner's "White radiator": vertical panels every 100 mm (90 wide, 100 deep) under a
// 20 mm top grille 110 deep. At the default 910 mm: 9 panels.
const panelRadiator: TemplateSpec = {
  id: "radiator-panel",
  view: "front",
  metadata: {
    ...wallAreable,
    ...attachment,
    kind: "radiator",
    label: "Panel Radiator",
    category: "Heating and cooling",
    tags: ["radiator", "heating", "panel", "convector"],
    product: {
      description:
        "Vertical-panel radiator with a top grille; the number of 100 mm panels follows the width.",
    },
    resize: {
      x: {
        mode: "scale",
        minMm: 200,
        maxMm: 3000,
        defaultMm: 910,
        description: "Overall width; one panel per 100 mm.",
        quickPicks: [400, 600, 800, 910, 1000, 1200],
      },
      y: {
        mode: "slice",
        startMm: 0,
        endMm: 20,
        minMm: 200,
        maxMm: 2000,
        defaultMm: 615,
        description: "Overall height; the top grille keeps its size.",
        quickPicks: [300, 450, 615, 900],
      },
      z: { mode: "fixed" },
    },
    materialSlots: { body: finishSlot("Warm white") },
    formulas: { panelCount: "max(1, floor(widthMm / 100))" },
  },
  materials: finishes,
  parts: [
    {
      name: "Panel",
      material: "Warm white",
      rule: { stretch: { y: true }, repeat: { offsetMm: { x: 100 }, count: "panelCount" } },
      build: (g) => column(g, -450, -360, -50, 50, 6, 0, 595),
    },
    {
      name: "Grille",
      material: "Warm white",
      rule: { extendsWith: "Panel" },
      build: boxes([
        [-455, 595, -55],
        [455, 615, 55],
      ]),
    },
  ],
};

export const templates: readonly TemplateSpec[] = [ribbedRadiator, panelRadiator];
