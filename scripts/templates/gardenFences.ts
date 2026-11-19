// Additional yard fence styles. Each two-metre panel is one repeated mesh per finish; posts/caps travel with
// it and an end post follows the repeat. The existing generic template renderer handles every style.
import { box, boxes, floorAreable, prism } from "./helpers";
import type { Geo, MaterialSpec, PartSpec, TemplateSpec } from "./helpers";

const timber: MaterialSpec = { color: [0.34, 0.16, 0.065], roughness: 0.78 };
const lightTimber: MaterialSpec = { color: [0.46, 0.245, 0.11], roughness: 0.78 };
const endGrain: MaterialSpec = { color: [0.235, 0.105, 0.04], roughness: 0.85 };
const hardware: MaterialSpec = { color: [0.065, 0.07, 0.075], roughness: 0.43, metallic: 0.7 };
const greenWire: MaterialSpec = { color: [0.028, 0.095, 0.055], roughness: 0.53, metallic: 0.35 };

type PanelOptions = Readonly<{
  id: string;
  label: string;
  description: string;
  tags: readonly string[];
  height: number;
  minHeight: number;
  maxHeight: number;
  postMaterial: string;
  postWidth: number;
  materials: Readonly<Record<string, MaterialSpec>>;
  parts: readonly PartSpec[];
}>;

const panel = (options: PanelOptions): TemplateSpec => {
  const half = options.postWidth / 2;
  const repeat = { offsetMm: { x: 2000 }, count: "panels" };
  return {
    id: options.id,
    view: "front",
    metadata: {
      ...floorAreable,
      kind: "fence",
      category: "Garden",
      label: options.label,
      tags: ["fence", "yard", "garden", ...options.tags],
      product: { description: options.description },
      resize: {
        x: { mode: "scale", minMm: 50, maxMm: 100000, defaultMm: 2000 },
        y: { mode: "scale", minMm: options.minHeight, maxMm: options.maxHeight, defaultMm: options.height },
        z: { mode: "fixed" },
      },
      materialSlots: Object.fromEntries(Object.keys(options.materials).map((name) => [name, name])),
      formulas: { panels: "max(1, floor(widthMm / 2000 + 0.5))" },
    },
    materials: options.materials,
    parts: [
      {
        name: "Posts",
        material: options.postMaterial,
        rule: { repeat, stretch: { x: true, y: true } },
        build: boxes([
          [-1000, 0, -half],
          [-1000 + options.postWidth, options.height, half],
        ]),
      },
      ...options.parts.map((part) => ({
        ...part,
        rule: {
          ...(part.rule?.follows === undefined ? { repeat } : part.rule),
          stretch: { x: true, y: true },
        },
      })),
      {
        name: "EndPost",
        material: options.postMaterial,
        rule: { follows: "Posts", stretch: { x: true, y: true } },
        build: boxes([
          [1000 - options.postWidth, 0, -half],
          [1000, options.height, half],
        ]),
      },
    ],
  };
};

const slats =
  (parity: number): ((g: Geo) => void) =>
  (g) => {
    for (let row = parity; row < 15; row += 2) {
      const bottom = 75 + row * 104;
      // Eased board edges: a narrow bevel catches sunlight without a texture or a glossy plastic finish.
      prism(
        g,
        [
          [bottom, 24],
          [bottom + 3, 21],
          [bottom + 91, 21],
          [bottom + 94, 24],
          [bottom + 94, 42],
          [bottom, 42],
        ],
        "y",
        "z",
        "x",
        -910,
        910,
      );
    }
  };

const slatted = panel({
  id: "fence-slatted",
  label: "Horizontal Timber Fence",
  description:
    "Warm timber privacy slats with narrow shadow gaps, bevelled board edges, dark posts and visible fixings.",
  tags: ["timber", "slats", "privacy", "horizontal", "cedar"],
  height: 1700,
  minHeight: 600,
  maxHeight: 2500,
  postWidth: 80,
  postMaterial: "Hardware",
  materials: { Timber: timber, "Light timber": lightTimber, Hardware: hardware },
  parts: [
    { name: "Slats", material: "Timber", build: slats(0) },
    { name: "AlternateSlats", material: "Light timber", build: slats(1) },
    {
      name: "Supports",
      material: "Hardware",
      build: boxes(
        [
          [-930, 65, -26],
          [-905, 1640, 22],
        ],
        [
          [905, 65, -26],
          [930, 1640, 22],
        ],
      ),
    },
    {
      name: "Fixings",
      material: "Hardware",
      build: (g) => {
        for (let row = 0; row < 15; row += 1)
          for (const x of [-887, 887]) box(g, [x - 3, 110 + row * 104, 42], [x + 3, 116 + row * 104, 44]);
      },
    },
  ],
});

/** A diagonal strip clipped against the frame's interior rectangle, so no lattice protrudes through posts. */
const latticeStrip = (g: Geo, slope: number, intercept: number, depth: number): void => {
  const minX = -908;
  const maxX = 908;
  const minY = 115;
  const maxY = 1490;
  const half = 13 * Math.SQRT2;
  let polygon: [number, number][] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
  for (const side of [-1, 1]) {
    const input = polygon;
    polygon = [];
    for (let index = 0; index < input.length; index += 1) {
      const a = input[index];
      const b = input[(index + 1) % input.length];
      if (a === undefined || b === undefined) continue;
      const da = side * (a[1] - slope * a[0] - intercept) - half;
      const db = side * (b[1] - slope * b[0] - intercept) - half;
      if (da <= 0) polygon.push(a);
      if (da <= 0 !== db <= 0) {
        const ratio = da / (da - db);
        polygon.push([a[0] + ratio * (b[0] - a[0]), a[1] + ratio * (b[1] - a[1])]);
      }
    }
  }
  if (polygon.length >= 3) prism(g, polygon, "x", "y", "z", depth, depth + 12);
};

const trellis = panel({
  id: "fence-trellis",
  label: "Diamond Timber Trellis",
  description:
    "Open diamond lattice in a substantial timber frame, with layered crossing battens and capped posts.",
  tags: ["wood", "timber", "trellis", "lattice", "diamond"],
  height: 1600,
  minHeight: 600,
  maxHeight: 2400,
  postWidth: 90,
  postMaterial: "Timber frame",
  materials: { "Timber frame": timber, Battens: lightTimber, Caps: endGrain },
  parts: [
    {
      name: "Frame",
      material: "Timber frame",
      build: boxes(
        [
          [-910, 65, -24],
          [910, 115, 24],
        ],
        [
          [-910, 1490, -24],
          [910, 1540, 24],
        ],
      ),
    },
    {
      name: "Lattice",
      material: "Battens",
      build: (g) => {
        for (let intercept = -720; intercept <= 2520; intercept += 180) {
          latticeStrip(g, 1, intercept, -12);
          latticeStrip(g, -1, intercept, 0);
        }
      },
    },
    {
      name: "PostCap",
      material: "Caps",
      build: boxes([
        [-1000, 1600, -50],
        [-910, 1630, 50],
      ]),
    },
    {
      name: "EndCap",
      material: "Caps",
      rule: { follows: "Posts" },
      build: boxes([
        [910, 1600, -50],
        [1000, 1630, 50],
      ]),
    },
  ],
});

const wire = panel({
  id: "fence-wire",
  label: "Wire Mesh Fence",
  description:
    "Green welded garden mesh with 100 × 150 mm openings, tension rails and slender square steel posts.",
  tags: ["wire", "mesh", "green", "steel", "welded"],
  height: 1300,
  minHeight: 500,
  maxHeight: 2500,
  postWidth: 45,
  postMaterial: "Coated steel",
  materials: { "Coated steel": greenWire, Fixings: hardware },
  parts: [
    {
      name: "Mesh",
      material: "Coated steel",
      build: (g) => {
        for (let x = -900; x <= 900; x += 100) box(g, [x - 2, 75, 10], [x + 2, 1225, 14]);
        for (let y = 75; y <= 1225; y += 150) box(g, [-955, y - 2, 14], [955, y + 2, 18]);
      },
    },
    {
      name: "Rails",
      material: "Coated steel",
      build: boxes(
        [
          [-955, 55, -12],
          [955, 75, 12],
        ],
        [
          [-955, 1225, -12],
          [955, 1245, 12],
        ],
      ),
    },
    {
      name: "Clips",
      material: "Fixings",
      build: (g) => {
        for (const x of [-960, 950])
          for (const y of [160, 650, 1140]) box(g, [x, y, 12], [x + 10, y + 22, 22]);
      },
    },
  ],
});

export const templates: readonly TemplateSpec[] = [slatted, trellis, wire];
