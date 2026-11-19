// Outdoor family (Phase 17.3): garden trees, shrubs and a planter in the Garden category, plus outdoor wall lights
// (lantern, up/down sconce, bulkhead) for the exterior face of outside walls.
//
// Trees and shrubs are low-poly: faceted canopy blobs (a geodesic sphere, 80 triangles, its vertices pushed in or
// out by a seeded random so every blob is irregular) on a tapered trunk. Everything is seeded, so the build is
// deterministic. Height (the y axis, `scale`) stretches the whole tree; Canopy width (`canopyMm`) widens the
// canopy blobs and moves them outwards about the trunk (the plants' `size` + `translate` rule pair), while the
// trunk's thickness follows the height. The canopy slot offers season presets. A hidden footprint keeps the
// object's bounds centred on the trunk. Triangle counts stay below about 1,000 per tree, since a garden repeats
// them; template meshes cast shadows (fixture meshes do not).
//
// The lights mount on a wall (`hosts: ["wall"]`, back contact) on its exterior face by default; their bulb is the
// KHR_lights_punctual node, so the emitter sits in front of the wall (spec/builder/features/lighting.md#wall-mounted-lights-phase-173).
import {
  box,
  boxes,
  cylinder,
  floorAreable,
  frustum,
  glass,
  newGeo,
  normalize,
  sphere,
  vertex,
  wallAreable,
} from "./helpers";
import type { Geo, MaterialSpec, PartSpec, TemplateSpec, V3 } from "./helpers";
import type { MaterialSlot } from "@shared/domain/templates/metadata";

// ---------------------------------------------------------------------------------------------
// Vectors and a seeded random.

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Mulberry32: a small seeded generator in [0, 1). */
const seeded = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------------------------------------------------------------------------------------------
// Geometry: flat triangles, faceted blobs, tapered tubes, jagged cones.

/** One flat-shaded triangle whose normal points away from `inside`. */
const facet = (g: Geo, a: V3, b: V3, c: V3, inside: V3): void => {
  let n = normalize(cross(sub(b, a), sub(c, a)));
  const centroid = mul(add(add(a, b), c), 1 / 3);
  if (dot(n, sub(centroid, inside)) < 0) n = mul(n, -1);
  const ids = [a, b, c].map((p) => vertex(g, p, n, p[0] + p[2], p[1]));
  g.indices.push(ids[0] ?? 0, ids[1] ?? 0, ids[2] ?? 0);
};

type Mesh = Readonly<{ vertices: readonly V3[]; faces: readonly (readonly [number, number, number])[] }>;

const icosahedron = (): Mesh => {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: V3[] = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ];
  return {
    vertices: raw.map(normalize),
    faces: [
      [0, 11, 5],
      [0, 5, 1],
      [0, 1, 7],
      [0, 7, 10],
      [0, 10, 11],
      [1, 5, 9],
      [5, 11, 4],
      [11, 10, 2],
      [10, 7, 6],
      [7, 1, 8],
      [3, 9, 4],
      [3, 4, 2],
      [3, 2, 6],
      [3, 6, 8],
      [3, 8, 9],
      [4, 9, 5],
      [2, 4, 11],
      [6, 2, 10],
      [8, 6, 7],
      [9, 8, 1],
    ],
  };
};

/** One loop subdivision onto the unit sphere (20 → 80 faces). */
const subdivide = (mesh: Mesh): Mesh => {
  const vertices = [...mesh.vertices];
  const middles = new Map<string, number>();
  const middle = (a: number, b: number): number => {
    const key = a < b ? `${String(a)}:${String(b)}` : `${String(b)}:${String(a)}`;
    const known = middles.get(key);
    if (known !== undefined) return known;
    const pa = vertices[a] ?? [0, 1, 0];
    const pb = vertices[b] ?? [0, 1, 0];
    vertices.push(normalize(mul(add(pa, pb), 0.5)));
    middles.set(key, vertices.length - 1);
    return vertices.length - 1;
  };
  const faces: [number, number, number][] = [];
  for (const [a, b, c] of mesh.faces) {
    const ab = middle(a, b);
    const bc = middle(b, c);
    const ca = middle(c, a);
    faces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  return { vertices, faces };
};

const coarseSphere = icosahedron();
const geodesicSphere = subdivide(coarseSphere);

type Blob = readonly [center: V3, radii: V3];

/**
 * A faceted, irregular blob: every vertex of the sphere moves in or out by up to `jitter` of its radius (seeded),
 * and the underside is flattened a little, as a canopy clump is.
 */
const blob = (
  g: Geo,
  [center, radii]: Blob,
  seed: number,
  jitter = 0.2,
  sphereMesh = geodesicSphere,
): void => {
  const random = seeded(seed);
  const points = sphereMesh.vertices.map((unit): V3 => {
    const scale = 1 + jitter * (random() * 2 - 1);
    const y = unit[1] < 0 ? unit[1] * 0.72 : unit[1];
    return [
      center[0] + unit[0] * radii[0] * scale,
      center[1] + y * radii[1] * scale,
      center[2] + unit[2] * radii[2] * scale,
    ];
  });
  for (const [a, b, c] of sphereMesh.faces) {
    const pa = points[a];
    const pb = points[b];
    const pc = points[c];
    if (pa === undefined || pb === undefined || pc === undefined) continue;
    facet(g, pa, pb, pc, center);
  }
};

const blobs =
  (list: readonly Blob[], seed: number, jitter = 0.2) =>
  (g: Geo): void =>
    list.forEach((item, index) => blob(g, item, seed + index * 97, jitter));

/** A tapered tube along a path (smooth sides, open ends hidden in the ground or the canopy). */
const tube = (g: Geo, path: readonly V3[], radii: readonly number[], sides = 7): void => {
  const rings: number[][] = [];
  path.forEach((point, i) => {
    const before = path[Math.max(0, i - 1)] ?? point;
    const after = path[Math.min(path.length - 1, i + 1)] ?? point;
    const tangent = normalize(sub(after, before));
    const reference: V3 = Math.abs(tangent[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = normalize(cross(tangent, reference));
    const v = cross(tangent, u);
    const radius = radii[i] ?? radii[radii.length - 1] ?? 20;
    const ring: number[] = [];
    for (let s = 0; s <= sides; s += 1) {
      const angle = (s / sides) * Math.PI * 2;
      const n = add(mul(u, Math.cos(angle)), mul(v, Math.sin(angle)));
      ring.push(vertex(g, add(point, mul(n, radius)), n, s * radius, point[1]));
    }
    rings.push(ring);
  });
  for (let i = 0; i + 1 < rings.length; i += 1)
    for (let s = 0; s < sides; s += 1) {
      const a = rings[i]?.[s];
      const b = rings[i]?.[s + 1];
      const c = rings[i + 1]?.[s + 1];
      const d = rings[i + 1]?.[s];
      if (a === undefined || b === undefined || c === undefined || d === undefined) continue;
      g.indices.push(a, b, c, a, c, d);
    }
};

type Limb = readonly [path: readonly V3[], radii: readonly number[]];

const limbs =
  (list: readonly Limb[], sides = 7) =>
  (g: Geo): void => {
    for (const [path, radii] of list) tube(g, path, radii, sides);
  };

/** A conifer tier: a jagged skirt of `points` tips (alternating long and short) under an apex, with a flat underside. */
const tier = (
  g: Geo,
  baseY: number,
  apexY: number,
  radius: number,
  points: number,
  turnDeg: number,
  seed: number,
): void => {
  const random = seeded(seed);
  const ring: V3[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const angle = radians(turnDeg) + (i / (points * 2)) * Math.PI * 2;
    const long = i % 2 === 0;
    const r = radius * (long ? 0.92 + 0.16 * random() : 0.68 + 0.08 * random());
    const droop = long ? radius * 0.1 : 0;
    ring.push([Math.cos(angle) * r, baseY - droop, Math.sin(angle) * r]);
  }
  const apex: V3 = [0, apexY, 0];
  const under: V3 = [0, baseY + (apexY - baseY) * 0.18, 0];
  const inside: V3 = [0, baseY + (apexY - baseY) * 0.3, 0];
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i] ?? apex;
    const b = ring[(i + 1) % ring.length] ?? apex;
    facet(g, apex, a, b, inside);
    facet(g, under, b, a, [0, apexY + 1000, 0]);
  }
};

/** Linear interpolation of a trunk path's centre and radius at height y (for bark bands). */
const along = (
  path: readonly V3[],
  radii: readonly number[],
  y: number,
): Readonly<{ center: V3; radius: number }> => {
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    if (a === undefined || b === undefined || y < a[1] || y > b[1]) continue;
    const t = (y - a[1]) / Math.max(b[1] - a[1], 1);
    const ra = radii[i] ?? 50;
    const rb = radii[i + 1] ?? ra;
    return { center: add(a, mul(sub(b, a), t)), radius: ra + (rb - ra) * t };
  }
  return { center: path[path.length - 1] ?? [0, y, 0], radius: radii[radii.length - 1] ?? 30 };
};

// ---------------------------------------------------------------------------------------------
// Parametric parts (as in plants.ts): `size` scales a part about its own centre, `translate` moves that centre
// outwards by the same factor, so the canopy widens about the trunk.

const measure = (build: (g: Geo) => void): { min: V3; max: V3 } => {
  const g = newGeo();
  build(g);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < g.positions.length; i += 3)
    for (const axis of [0, 1, 2] as const) {
      const value = g.positions[i + axis] ?? 0;
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  return { min, max };
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const scaled = (name: string, material: string, build: (g: Geo) => void, factor: string): PartSpec => {
  const { min, max } = measure(build);
  const rule = (axis: 0 | 2): { size: string; translate: string } => {
    const extent = round2(max[axis] - min[axis]);
    const centre = round2((max[axis] + min[axis]) / 2);
    return { size: `${Math.max(extent, 0.01)} * ${factor}`, translate: `${centre} * (${factor} - 1)` };
  };
  const x = rule(0);
  const z = rule(2);
  return {
    name,
    material,
    rule: { size: { x: x.size, z: z.size }, translate: { x: x.translate, z: z.translate } },
    build,
  };
};

const lengthProperty = (
  title: string,
  description: string,
  range: Readonly<{ min: number; max: number; default: number; picks: readonly number[] }>,
) => ({
  type: "number",
  title,
  description,
  minimum: range.min,
  maximum: range.max,
  default: range.default,
  "x-homeplan": { editor: "length", quantity: "length", quickPicks: [...range.picks] },
});

// ---------------------------------------------------------------------------------------------
// Materials.

const matte = (r: number, g: number, b: number, roughness = 0.85): MaterialSpec => ({
  color: [r, g, b],
  roughness,
});

const bark = matte(0.11, 0.075, 0.05, 0.95);
const deciduousSeasons: Readonly<Record<string, MaterialSpec>> = {
  "Summer leaves": matte(0.06, 0.16, 0.035),
  "Spring leaves": matte(0.17, 0.33, 0.06),
  "Autumn gold": matte(0.5, 0.3, 0.035),
  "Autumn red": matte(0.4, 0.075, 0.025),
};

type Range = Readonly<{ min: number; max: number; default: number; picks: readonly number[] }>;

type TreeOptions = Readonly<{
  id: string;
  label: string;
  tags: readonly string[];
  description: string;
  height: Range;
  canopy: Range;
  /** Canopy title in the panel ("Canopy width", "Width"). */
  canopyTitle?: string;
  materials: Readonly<Record<string, MaterialSpec>>;
  /** The canopy slot: its default material and season (or colour) presets. */
  canopySlot: Readonly<{ material: string; presets: readonly string[]; title?: string }>;
  /** Other slots by name. */
  slots?: Readonly<
    Record<string, string | Readonly<{ material: string; presets: readonly string[]; title: string }>>
  >;
  /** Parts that keep their place and thicken with the height (trunks). */
  trunk: readonly (readonly [name: string, material: string, build: (g: Geo) => void])[];
  /** Parts that widen with the canopy (branches, foliage, flowers). */
  crown: readonly (readonly [name: string, material: string, build: (g: Geo) => void])[];
}>;

const choosable = (material: string, presets: readonly string[], title: string) => ({
  material,
  title,
  choosable: true,
  presets: [...presets],
  allowColor: true,
  allowTexture: false,
});

const tree = (options: TreeOptions): TemplateSpec => {
  const trunk = options.trunk.map(([name, material, build]) => scaled(name, material, build, "trunkFactor"));
  const crown = options.crown.map(([name, material, build]) => scaled(name, material, build, "canopyFactor"));
  const bodies = [...trunk, ...crown];
  let reach = 0;
  for (const part of bodies) {
    if (part.build === undefined) continue;
    const { min, max } = measure(part.build);
    reach = Math.max(reach, Math.abs(min[0]), Math.abs(max[0]), Math.abs(min[2]), Math.abs(max[2]));
  }
  // The footprint is the canopy circle's square: the object's bounds, centred on the trunk.
  const footprint = scaled(
    "Footprint",
    options.canopySlot.material,
    (g) => box(g, [-reach, 0, -reach], [reach, 1, reach]),
    "canopyFactor",
  );
  const natural = round2(
    Math.max(...bodies.map((part) => (part.build === undefined ? 0 : measure(part.build).max[1]))),
  );
  const slots: Record<string, MaterialSlot> = {};
  for (const [name, slot] of Object.entries(options.slots ?? {}))
    slots[name] = typeof slot === "string" ? slot : choosable(slot.material, slot.presets, slot.title);
  return {
    id: options.id,
    view: "front",
    metadata: {
      ...floorAreable,
      kind: "plant",
      label: options.label,
      category: "Garden",
      tags: ["outdoor", "garden", ...options.tags],
      product: { name: options.label, description: options.description },
      resize: {
        x: { mode: "fixed" },
        y: {
          mode: "scale",
          title: "Height",
          description: "Overall height; the trunk thickens in proportion.",
          minMm: options.height.min,
          maxMm: options.height.max,
          defaultMm: options.height.default,
          quickPicks: [...options.height.picks],
        },
        z: { mode: "fixed" },
      },
      properties: {
        canopyMm: lengthProperty(
          options.canopyTitle ?? "Canopy width",
          "Width of the crown; the branches spread with it.",
          options.canopy,
        ),
      },
      materialSlots: {
        canopy: choosable(
          options.canopySlot.material,
          options.canopySlot.presets,
          options.canopySlot.title ?? "Foliage",
        ),
        ...slots,
      },
      formulas: {
        canopyFactor: `canopyMm / ${String(round2(reach * 2))}`,
        trunkFactor: `heightMm / ${String(natural)}`,
      },
    },
    materials: options.materials,
    parts: [...bodies, { ...footprint, rule: { ...footprint.rule, visible: false } }],
  };
};

// ---------------------------------------------------------------------------------------------
// Trees.

const radial = (angleDeg: number, distance: number, y: number): V3 => [
  Math.cos(radians(angleDeg)) * distance,
  y,
  Math.sin(radians(angleDeg)) * distance,
];

const deciduousTrunk: Limb = [
  [
    [0, -50, 0],
    [30, 800, 10],
    [10, 1600, -20],
    [-20, 2300, 0],
  ],
  [200, 165, 145, 125],
];
const deciduousBranches: readonly Limb[] = [30, 150, 270].map((angle, i) => [
  [[-20, 2150, 0], radial(angle, 450, 2800 + i * 120), radial(angle + 12, 950, 3500 + i * 150)],
  [95, 65, 35],
]);
const deciduousCanopy: readonly Blob[] = [
  [
    [0, 4250, 0],
    [1500, 1250, 1500],
  ],
  [
    [900, 3700, 300],
    [1100, 950, 1100],
  ],
  [
    [-850, 3800, 450],
    [1100, 950, 1000],
  ],
  [
    [200, 3600, -950],
    [1050, 900, 1050],
  ],
  [
    [-450, 4850, -300],
    [1000, 850, 1000],
  ],
  [
    [600, 4950, 400],
    [900, 780, 900],
  ],
  [
    [-1100, 3450, -500],
    [850, 750, 850],
  ],
  [
    [1150, 4450, -500],
    [850, 780, 850],
  ],
];

const deciduous = tree({
  id: "tree-deciduous",
  label: "Deciduous Tree",
  tags: ["tree", "deciduous", "oak", "lime", "shade tree"],
  description:
    "A broad round-crowned garden tree (oak, lime, maple). Height and canopy width are adjustable.",
  height: { min: 2500, max: 15000, default: 6000, picks: [4000, 6000, 8000, 12000] },
  canopy: { min: 1500, max: 12000, default: 4800, picks: [3000, 4800, 7000] },
  materials: { ...deciduousSeasons, Bark: bark },
  canopySlot: { material: "Summer leaves", presets: Object.keys(deciduousSeasons) },
  slots: { trunk: "Bark" },
  trunk: [["Trunk", "Bark", limbs([deciduousTrunk])]],
  crown: [
    ["Branches", "Bark", limbs(deciduousBranches, 5)],
    ["Canopy", "Summer leaves", blobs(deciduousCanopy, 11)],
  ],
});

const coniferSeasons: Readonly<Record<string, MaterialSpec>> = {
  "Fir green": matte(0.025, 0.08, 0.035),
  "Spruce blue": matte(0.06, 0.12, 0.11),
  "Pine green": matte(0.05, 0.12, 0.03),
  Snowy: matte(0.55, 0.6, 0.62),
};

const coniferTiers = (g: Geo): void => {
  const count = 7;
  for (let i = 0; i < count; i += 1) {
    const base = 700 + i * 800;
    const radius = 1600 * (1 - i * 0.125);
    tier(g, base, Math.min(7000, base + 1800 - i * 60), radius, 9 - Math.floor(i / 3), i * 23, 300 + i);
  }
};

const conifer = tree({
  id: "tree-conifer",
  label: "Fir Tree",
  tags: ["tree", "conifer", "fir", "spruce", "pine", "evergreen", "christmas tree"],
  description: "A slender evergreen conifer of tiered, jagged branches. Height and spread are adjustable.",
  height: { min: 1500, max: 20000, default: 7000, picks: [3000, 5000, 7000, 12000] },
  canopy: { min: 1000, max: 8000, default: 3200, picks: [2000, 3200, 4500] },
  canopyTitle: "Spread",
  materials: { ...coniferSeasons, Bark: matte(0.13, 0.07, 0.04, 0.95) },
  canopySlot: { material: "Fir green", presets: Object.keys(coniferSeasons), title: "Needles" },
  slots: { trunk: "Bark" },
  trunk: [
    [
      "Trunk",
      "Bark",
      limbs([
        [
          [
            [0, -50, 0],
            [0, 1200, 0],
            [0, 5500, 0],
          ],
          [170, 130, 50],
        ],
      ]),
    ],
  ],
  crown: [["Needles", "Fir green", coniferTiers]],
});

const birchPath: readonly V3[] = [
  [0, -50, 0],
  [60, 1500, 20],
  [20, 3000, -10],
  [-40, 4500, 10],
  [0, 6300, 0],
];
const birchRadii = [135, 112, 95, 72, 40];
const birchBands = (g: Geo): void => {
  const random = seeded(77);
  for (const y of [500, 950, 1600, 2150, 2700, 3350, 3900, 4600]) {
    const { center, radius } = along(birchPath, birchRadii, y);
    const height = 50 + random() * 70;
    frustum(g, [center[0], center[2]], y, y + height, radius + 4, radius + 4, { segments: 7 });
  }
};
const birchCanopy: readonly Blob[] = Array.from({ length: 10 }, (_, i): Blob => {
  const angle = i * 137.5;
  const distance = 350 + (i % 3) * 300;
  const y = 3700 + i * 380;
  const r = 820 - i * 30;
  return [radial(angle, distance * (1 - i * 0.05), y), [r * 0.85, r * 1.15, r * 0.85]];
});

const birchLeaves: Readonly<Record<string, MaterialSpec>> = {
  "Birch summer": matte(0.1, 0.24, 0.05),
  "Birch spring": matte(0.24, 0.4, 0.08),
  "Birch autumn": matte(0.6, 0.45, 0.06),
};

const birch = tree({
  id: "tree-birch",
  label: "Birch",
  tags: ["tree", "birch", "silver birch", "deciduous", "slender"],
  description: "A slender silver birch: white bark with dark bands, an airy upright crown.",
  height: { min: 2500, max: 18000, default: 8000, picks: [5000, 8000, 12000] },
  canopy: { min: 1200, max: 8000, default: 3200, picks: [2000, 3200, 4500] },
  materials: {
    ...birchLeaves,
    "Birch bark": matte(0.72, 0.7, 0.64, 0.8),
    "Bark bands": matte(0.03, 0.028, 0.025, 0.9),
  },
  canopySlot: { material: "Birch summer", presets: Object.keys(birchLeaves) },
  slots: { trunk: "Birch bark", bands: "Bark bands" },
  trunk: [
    ["Trunk", "Birch bark", limbs([[birchPath, birchRadii]])],
    ["Bands", "Bark bands", birchBands],
  ],
  crown: [
    [
      "Branches",
      "Birch bark",
      limbs(
        [0, 120, 240].map((angle, i): Limb => [
          [along(birchPath, birchRadii, 3300 + i * 600).center, radial(angle, 700, 4300 + i * 600)],
          [50, 20],
        ]),
        5,
      ),
    ],
    ["Canopy", "Birch summer", blobs(birchCanopy, 41, 0.24)],
  ],
});

const oliveTrunks: readonly Limb[] = [
  [
    [
      [0, -50, 0],
      [120, 500, 40],
      [330, 1100, 100],
      [480, 1700, 60],
      [600, 2300, 0],
    ],
    [210, 175, 140, 110, 70],
  ],
  [
    [
      [0, -50, 0],
      [-110, 600, -60],
      [-360, 1200, -150],
      [-520, 1800, -100],
      [-620, 2300, -60],
    ],
    [195, 160, 130, 100, 65],
  ],
];
const oliveCanopy: readonly Blob[] = [
  [
    [0, 3050, 0],
    [1050, 620, 1050],
  ],
  [
    [850, 2650, 300],
    [950, 560, 900],
  ],
  [
    [-850, 2700, -250],
    [950, 560, 950],
  ],
  [
    [250, 2550, -900],
    [850, 520, 850],
  ],
  [
    [-300, 2600, 900],
    [900, 540, 850],
  ],
  [
    [500, 3350, -350],
    [750, 450, 750],
  ],
  [
    [-500, 3300, 350],
    [750, 450, 750],
  ],
];
const oliveLeaves: Readonly<Record<string, MaterialSpec>> = {
  "Olive silver": matte(0.16, 0.21, 0.13),
  "Olive dark": matte(0.07, 0.11, 0.06),
};

const olive = tree({
  id: "tree-olive",
  label: "Olive Tree",
  tags: ["tree", "olive", "mediterranean", "evergreen"],
  description: "A Mediterranean olive tree: a gnarled twin trunk under a wide, flat silver-green crown.",
  height: { min: 1500, max: 8000, default: 4000, picks: [2500, 4000, 6000] },
  canopy: { min: 1200, max: 8000, default: 3800, picks: [2500, 3800, 5000] },
  materials: { ...oliveLeaves, "Olive bark": matte(0.2, 0.17, 0.13, 0.95) },
  canopySlot: { material: "Olive silver", presets: Object.keys(oliveLeaves) },
  slots: { trunk: "Olive bark" },
  trunk: [
    [
      "Trunk",
      "Olive bark",
      (g) => {
        frustum(g, [0, 0], -50, 350, 290, 200, { segments: 8 });
        limbs(oliveTrunks, 7)(g);
      },
    ],
  ],
  crown: [
    [
      "Branches",
      "Olive bark",
      limbs(
        [
          [
            [
              [480, 1700, 60],
              [900, 2400, 400],
            ],
            [70, 35],
          ],
          [
            [
              [-520, 1800, -100],
              [-900, 2450, -450],
            ],
            [70, 35],
          ],
          [
            [
              [330, 1100, 100],
              [200, 2300, -800],
            ],
            [60, 30],
          ],
        ],
        5,
      ),
    ],
    ["Canopy", "Olive silver", blobs(oliveCanopy, 61, 0.22)],
  ],
});

const ornamentalCanopy: readonly Blob[] = [
  [
    [0, 2450, 0],
    [1000, 480, 1000],
  ],
  [
    [800, 2100, 250],
    [800, 420, 750],
  ],
  [
    [-750, 2150, -300],
    [800, 420, 800],
  ],
  [
    [250, 2050, -800],
    [750, 400, 700],
  ],
  [
    [-300, 2100, 800],
    [750, 400, 700],
  ],
  [
    [350, 2700, 300],
    [650, 330, 650],
  ],
  [
    [-350, 2650, -250],
    [600, 320, 600],
  ],
];
const ornamentalColours: Readonly<Record<string, MaterialSpec>> = {
  "Maple red": matte(0.3, 0.025, 0.02),
  "Cherry blossom": matte(0.78, 0.4, 0.48),
  "Maple green": matte(0.12, 0.25, 0.04),
  "Autumn orange": matte(0.62, 0.17, 0.02),
};

const ornamental = tree({
  id: "tree-ornamental",
  label: "Ornamental Tree",
  tags: ["tree", "ornamental", "japanese maple", "cherry", "blossom", "small tree"],
  description: "A small ornamental tree with a layered umbrella crown: Japanese maple or flowering cherry.",
  height: { min: 1200, max: 6000, default: 3000, picks: [2000, 3000, 4500] },
  canopy: { min: 1000, max: 6000, default: 3200, picks: [2000, 3200, 4500] },
  materials: { ...ornamentalColours, "Smooth bark": matte(0.09, 0.06, 0.05, 0.8) },
  canopySlot: { material: "Maple red", presets: Object.keys(ornamentalColours) },
  slots: { trunk: "Smooth bark" },
  trunk: [
    [
      "Trunk",
      "Smooth bark",
      limbs([
        [
          [
            [0, -50, 0],
            [50, 600, 0],
            [0, 1100, 20],
          ],
          [115, 95, 80],
        ],
      ]),
    ],
  ],
  crown: [
    [
      "Branches",
      "Smooth bark",
      limbs(
        [20, 110, 200, 290].map((angle, i): Limb => [
          [[0, 1050, 20], radial(angle, 500, 1500 + i * 60), radial(angle + 15, 900, 1950)],
          [65, 40, 20],
        ]),
        5,
      ),
    ],
    ["Canopy", "Maple red", blobs(ornamentalCanopy, 81, 0.22)],
  ],
});

// ---------------------------------------------------------------------------------------------
// Shrubs and a planter.

const shrubColours: Readonly<Record<string, MaterialSpec>> = {
  "Shrub green": matte(0.05, 0.14, 0.035),
  "Box green": matte(0.04, 0.1, 0.03),
  "Copper beech": matte(0.16, 0.04, 0.03),
  "Lime green": matte(0.2, 0.33, 0.04),
};

const roundShrubBlobs: readonly Blob[] = [
  [
    [0, 520, 0],
    [560, 480, 560],
  ],
  [
    [340, 380, 160],
    [400, 360, 400],
  ],
  [
    [-330, 400, -120],
    [420, 370, 400],
  ],
  [
    [60, 360, -360],
    [380, 330, 380],
  ],
  [
    [-120, 340, 360],
    [380, 330, 380],
  ],
];

const roundShrub = tree({
  id: "shrub-round",
  label: "Round Shrub",
  tags: ["shrub", "bush", "boxwood", "hedge plant"],
  description: "A dense, rounded garden shrub (boxwood, laurel, beech). Height and width are adjustable.",
  height: { min: 300, max: 3000, default: 1000, picks: [600, 1000, 1500] },
  canopy: { min: 300, max: 4000, default: 1300, picks: [800, 1300, 2000] },
  canopyTitle: "Width",
  materials: shrubColours,
  canopySlot: { material: "Shrub green", presets: Object.keys(shrubColours) },
  trunk: [],
  crown: [["Foliage", "Shrub green", blobs(roundShrubBlobs, 101, 0.18)]],
});

const flowerColours: Readonly<Record<string, MaterialSpec>> = {
  "Flowers pink": matte(0.85, 0.3, 0.45, 0.7),
  "Flowers white": matte(0.85, 0.84, 0.8, 0.7),
  "Flowers purple": matte(0.35, 0.12, 0.55, 0.7),
  "Flowers yellow": matte(0.85, 0.6, 0.05, 0.7),
};

const flowerShrubBlobs: readonly Blob[] = [
  [
    [0, 760, 0],
    [620, 560, 620],
  ],
  [
    [420, 520, 200],
    [480, 430, 460],
  ],
  [
    [-400, 540, -160],
    [480, 430, 470],
  ],
  [
    [80, 500, -430],
    [440, 400, 440],
  ],
  [
    [-150, 480, 430],
    [440, 390, 440],
  ],
];

/** Small flower clusters on the leaf blobs' upper surfaces (seeded). */
const flowerHeads = (g: Geo): void => {
  const random = seeded(131);
  for (let i = 0; i < 16; i += 1) {
    const host = flowerShrubBlobs[i % flowerShrubBlobs.length];
    if (host === undefined) continue;
    const [center, radii] = host;
    const theta = random() * Math.PI * 2;
    const phi = 0.25 + random() * 0.9;
    const direction: V3 = [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
    const at: V3 = [
      center[0] + direction[0] * radii[0] * 0.95,
      center[1] + direction[1] * radii[1] * 0.95,
      center[2] + direction[2] * radii[2] * 0.95,
    ];
    const size = 75 + random() * 45;
    blob(g, [at, [size, size * 0.8, size]], 500 + i, 0.15, coarseSphere);
  }
};

const floweringShrub = tree({
  id: "shrub-flowering",
  label: "Flowering Shrub",
  tags: ["shrub", "bush", "flowers", "hydrangea", "rhododendron", "azalea"],
  description: "A rounded flowering shrub (hydrangea, rhododendron); the flowers' colour is choosable.",
  height: { min: 400, max: 3000, default: 1300, picks: [800, 1300, 1800] },
  canopy: { min: 400, max: 4000, default: 1600, picks: [1000, 1600, 2400] },
  canopyTitle: "Width",
  materials: { ...shrubColours, ...flowerColours },
  canopySlot: { material: "Shrub green", presets: Object.keys(shrubColours), title: "Leaves" },
  slots: { flowers: { material: "Flowers pink", presets: Object.keys(flowerColours), title: "Flowers" } },
  trunk: [],
  crown: [
    ["Foliage", "Shrub green", blobs(flowerShrubBlobs, 121, 0.18)],
    ["Flowers", "Flowers pink", flowerHeads],
  ],
});

const planterFinishes: Readonly<Record<string, MaterialSpec>> = {
  "Planter corten": { color: [0.3, 0.09, 0.03], roughness: 0.8, metallic: 0.3 },
  "Planter concrete": matte(0.42, 0.41, 0.39, 0.9),
  "Planter anthracite": matte(0.04, 0.045, 0.05, 0.6),
  "Planter cedar": matte(0.42, 0.22, 0.1, 0.75),
};

const planterBlobs: readonly Blob[] = [-330, -110, 110, 330].map((x, i): Blob => [
  [x, 560 + (i % 2) * 40, i % 2 === 0 ? 30 : -30],
  [190, 210 + (i % 2) * 30, 170],
]);

const planter: TemplateSpec = {
  id: "planter-garden",
  view: "front",
  metadata: {
    ...floorAreable,
    kind: "planter",
    label: "Garden Planter",
    category: "Garden",
    tags: ["outdoor", "garden", "planter", "trough", "box", "terrace", "balcony"],
    product: {
      name: "Garden planter",
      description:
        "A rectangular outdoor planter with low shrubs. The length is adjustable; the finish is choosable.",
    },
    resize: {
      x: {
        mode: "slice",
        title: "Length",
        description: "Outer length of the planter; the end walls keep their thickness.",
        startMm: 40,
        endMm: 40,
        minMm: 400,
        maxMm: 4000,
        defaultMm: 1200,
        quickPicks: [800, 1200, 2000, 3000],
      },
      y: { mode: "fixed" },
      z: { mode: "fixed" },
    },
    materialSlots: {
      planter: choosable("Planter corten", Object.keys(planterFinishes), "Planter"),
      soil: "Soil",
      plants: choosable("Shrub green", Object.keys(shrubColours), "Plants"),
    },
  },
  materials: { ...planterFinishes, ...shrubColours, Soil: matte(0.04, 0.03, 0.02, 1) },
  parts: [
    {
      name: "Planter",
      material: "Planter corten",
      build: boxes(
        [
          [-600, 0, -225],
          [600, 450, -195],
        ],
        [
          [-600, 0, 195],
          [600, 450, 225],
        ],
        [
          [-600, 0, -195],
          [-560, 450, 195],
        ],
        [
          [560, 0, -195],
          [600, 450, 195],
        ],
        [
          [-560, 0, -195],
          [560, 30, 195],
        ],
      ),
    },
    {
      name: "Soil",
      material: "Soil",
      build: boxes([
        [-560, 380, -195],
        [560, 410, 195],
      ]),
    },
    { name: "Plants", material: "Shrub green", build: blobs(planterBlobs, 141, 0.2) },
  ],
};

// ---------------------------------------------------------------------------------------------
// Outdoor wall lights (Phase 17.3): wall-hosted, exterior face by default, bulb = the light node.

const outdoorFinishes: Readonly<Record<string, MaterialSpec>> = {
  "Lamp black": { color: [0.015, 0.015, 0.015], roughness: 0.45, metallic: 0.6 },
  "Lamp anthracite": { color: [0.05, 0.055, 0.06], roughness: 0.5, metallic: 0.5 },
  "Lamp bronze": { color: [0.2, 0.11, 0.05], roughness: 0.4, metallic: 0.8 },
  "Lamp white": matte(0.85, 0.85, 0.82, 0.5),
};
const finishSlot = (title: string) => choosable("Lamp black", Object.keys(outdoorFinishes), title);
const warmBulb: MaterialSpec = {
  color: [1, 0.95, 0.85],
  roughness: 0.2,
  emissive: [1, 0.8, 0.55],
  emissiveStrength: 6,
};
const outdoorLight = (lumens: number, kelvin: number): NonNullable<TemplateSpec["metadata"]["light"]> => ({
  shape: "point",
  outputLumens: lumens,
  colorModes: ["fixedWhite", "colorTemperature"],
  kelvin,
  minKelvin: 2200,
  maxKelvin: 5000,
});
const exteriorWall = (elevationMm: number) => ({
  hosts: ["wall" as const],
  contact: "back",
  defaultHostSide: "exterior" as const,
  defaultPlacement: { elevationMm },
});

/** A square pyramid roof (flat facets) over the square of half-size `half` at `y0`, apex at `y1`, centred at (0, z). */
const pyramid = (g: Geo, z: number, half: number, y0: number, y1: number): void => {
  const corners: V3[] = [
    [-half, y0, z - half],
    [half, y0, z - half],
    [half, y0, z + half],
    [-half, y0, z + half],
  ];
  const apex: V3 = [0, y1, z];
  const inside: V3 = [0, y0, z];
  for (let i = 0; i < 4; i += 1) facet(g, corners[i] ?? apex, corners[(i + 1) % 4] ?? apex, apex, inside);
  facet(g, corners[0] ?? apex, corners[1] ?? apex, corners[2] ?? apex, [0, y1, z]);
  facet(g, corners[0] ?? apex, corners[2] ?? apex, corners[3] ?? apex, [0, y1, z]);
};

const lanternZ = 150;
const wallLantern: TemplateSpec = {
  id: "wall-lantern",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "light",
    label: "Wall Lantern",
    category: "Lighting",
    tags: ["outdoor", "exterior", "wall", "lantern", "coach light", "porch", "light"],
    product: {
      name: "Outdoor wall lantern",
      description:
        "A classic glazed coach lantern on a wall arm, for porches and entrances. Mounts on the outside of a wall.",
    },
    attachment: exteriorWall(1800),
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: { frame: finishSlot("Frame"), glass: "Lantern glass", bulb: "Bulb" },
    light: outdoorLight(600, 2700),
  },
  materials: { ...outdoorFinishes, "Lantern glass": { ...glass, alpha: 0.18 }, Bulb: warmBulb },
  parts: [
    {
      name: "Frame",
      material: "Lamp black",
      build: (g) => {
        boxes(
          // Wall plate and arm.
          [
            [-45, 150, 0],
            [45, 330, 14],
          ],
          [
            [-12, 225, 14],
            [12, 250, lanternZ - 70],
          ],
          // Base, top ring, corner posts.
          [
            [-85, 20, lanternZ - 85],
            [85, 45, lanternZ + 85],
          ],
          [
            [-80, 300, lanternZ - 80],
            [80, 315, lanternZ + 80],
          ],
          ...[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz): readonly [V3, V3] => [
              [sx * 80 - 6, 45, lanternZ + sz * 80 - 6],
              [sx * 80 + 6, 300, lanternZ + sz * 80 + 6],
            ]),
          ),
        )(g);
        // Bottom finial, roof, top finial.
        frustum(g, [0, lanternZ], 0, 20, 25, 60, { segments: 8, capStart: true });
        pyramid(g, lanternZ, 92, 315, 390);
        cylinder(g, [0, lanternZ], 385, 420, 10);
      },
    },
    {
      name: "Glass",
      material: "Lantern glass",
      build: boxes([
        [-76, 45, lanternZ - 76],
        [76, 300, lanternZ + 76],
      ]),
    },
    { name: "Bulb", material: "Bulb", build: (g) => sphere(g, [0, 150, lanternZ], 26, 12, 8) },
    { name: "BulbLight", origin: [0, 150, lanternZ], light: { lumens: 600, kelvin: 2700 } },
  ],
};

const sconceZ = 75;
const upDownSconce: TemplateSpec = {
  id: "wall-up-down",
  view: "side",
  metadata: {
    ...wallAreable,
    kind: "light",
    label: "Up-Down Wall Light",
    category: "Lighting",
    tags: ["outdoor", "exterior", "wall", "sconce", "up down", "cylinder", "facade", "light"],
    product: {
      name: "Outdoor up/down wall light",
      description:
        "A metal cylinder that washes the facade above and below it. Mounts on the outside of a wall.",
    },
    attachment: exteriorWall(2000),
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: { body: finishSlot("Body"), lens: "Lens glow" },
    light: outdoorLight(700, 3000),
  },
  materials: {
    ...outdoorFinishes,
    "Lens glow": { color: [1, 0.95, 0.85], roughness: 0.3, emissive: [1, 0.85, 0.62], emissiveStrength: 4 },
  },
  parts: [
    {
      name: "Body",
      material: "Lamp black",
      build: (g) => {
        boxes([
          [-25, 70, 0],
          [25, 150, sconceZ - 40],
        ])(g);
        frustum(g, [0, sconceZ], 0, 220, 48, 48, { segments: 20 });
        frustum(g, [0, sconceZ], 4, 216, 44, 44, { segments: 20, inward: true });
      },
    },
    {
      name: "Lenses",
      material: "Lens glow",
      build: (g) => {
        cylinder(g, [0, sconceZ], 14, 18, 42);
        cylinder(g, [0, sconceZ], 202, 206, 42);
      },
    },
    { name: "BulbLight", origin: [0, 110, sconceZ], light: { lumens: 700, kelvin: 3000 } },
  ],
};

/** Scales a build's x (positions and normals), for oval shapes from round ones. */
const stretchX =
  (factor: number, build: (g: Geo) => void) =>
  (g: Geo): void => {
    const start = g.positions.length;
    build(g);
    for (let i = start; i < g.positions.length; i += 3) {
      g.positions[i] = (g.positions[i] ?? 0) * factor;
      const n = normalize([(g.normals[i] ?? 0) / factor, g.normals[i + 1] ?? 0, g.normals[i + 2] ?? 0]);
      g.normals[i] = n[0];
      g.normals[i + 1] = n[1];
      g.normals[i + 2] = n[2];
    }
  };

const bulkhead: TemplateSpec = {
  id: "bulkhead-light",
  view: "front",
  metadata: {
    ...wallAreable,
    kind: "light",
    label: "Bulkhead Light",
    category: "Lighting",
    tags: ["outdoor", "exterior", "wall", "bulkhead", "oval", "porch", "garage", "light"],
    product: {
      name: "Outdoor bulkhead light",
      description:
        "A robust oval bulkhead with an opal diffuser behind an eyelid grille. Mounts on the outside of a wall.",
    },
    attachment: exteriorWall(2000),
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: { housing: finishSlot("Housing"), diffuser: "Opal" },
    light: outdoorLight(800, 4000),
  },
  materials: {
    ...outdoorFinishes,
    Opal: { color: [0.95, 0.93, 0.86], roughness: 0.4, emissive: [1, 0.95, 0.85], emissiveStrength: 1.5 },
  },
  parts: [
    {
      name: "Housing",
      material: "Lamp black",
      build: (g) => {
        stretchX(1.5, (inner) =>
          frustum(inner, [0, 90], 0, 40, 92, 90, { axis: "z", segments: 24, capStart: true, capEnd: true }),
        )(g);
        boxes(
          ...[55, 90, 125].map((y): readonly [V3, V3] => [
            [-118, y - 6, 78],
            [118, y + 6, 86],
          ]),
        )(g);
      },
    },
    {
      name: "Diffuser",
      material: "Opal",
      build: stretchX(1.5, (g) =>
        frustum(g, [0, 90], 40, 80, 80, 66, { axis: "z", segments: 24, capEnd: true }),
      ),
    },
    { name: "BulbLight", origin: [0, 90, 55], light: { lumens: 800, kelvin: 4000 } },
  ],
};

export const templates: readonly TemplateSpec[] = [
  deciduous,
  conifer,
  birch,
  olive,
  ornamental,
  roundShrub,
  floweringShrub,
  planter,
  wallLantern,
  upDownSconce,
  bulkhead,
];
