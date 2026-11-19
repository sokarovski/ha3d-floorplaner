// Plants family (Phase 9.5): four houseplants with one Height parameter. Height scales the y axis; every
// part's x and z extent follows it through `size` and `translate` formulas, so the plant stays in proportion
// (uniform scale from a single parameter). Each plant has a choosable pot.
import { box, cylinder, floorAreable, frustum, newGeo, normalize, vertex } from "./helpers";
import type { Geo, MaterialSpec, PartSpec, TemplateSpec, V3 } from "./helpers";

// ---------------------------------------------------------------------------------------------
// Small vector helpers.

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const up: V3 = [0, 1, 0];
const radial = (angleDeg: number): V3 => [
  Math.cos((angleDeg * Math.PI) / 180),
  0,
  Math.sin((angleDeg * Math.PI) / 180),
];

/** A quadratic Bezier point. */
const bezier = (p0: V3, p1: V3, p2: V3, t: number): V3 =>
  add(add(mul(p0, (1 - t) * (1 - t)), mul(p1, 2 * (1 - t) * t)), mul(p2, t * t));

/** Unit tangent of the quadratic Bezier. */
const bezierTangent = (p0: V3, p1: V3, p2: V3, t: number): V3 =>
  normalize(add(mul(add(p1, mul(p0, -1)), 2 * (1 - t)), mul(add(p2, mul(p1, -1)), 2 * t)));

// ---------------------------------------------------------------------------------------------
// Geometry: tapered tube along a path, flat leaf outlines.

const tube = (g: Geo, path: readonly V3[], radii: readonly number[], sides = 8): void => {
  const rings: number[][] = [];
  path.forEach((point, i) => {
    const before = path[Math.max(0, i - 1)] ?? point;
    const after = path[Math.min(path.length - 1, i + 1)] ?? point;
    const tangent = normalize(add(after, mul(before, -1)));
    const reference: V3 = Math.abs(tangent[1]) > 0.9 ? [1, 0, 0] : up;
    const u = normalize(cross(tangent, reference));
    const v = cross(tangent, u);
    const radius = radii[i] ?? radii[radii.length - 1] ?? 5;
    const ring: number[] = [];
    for (let s = 0; s <= sides; s += 1) {
      const angle = (s / sides) * Math.PI * 2;
      const n = add(mul(u, Math.cos(angle)), mul(v, Math.sin(angle)));
      ring.push(vertex(g, add(point, mul(n, radius)), n, s * radius, i * 40));
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

type Outline = readonly (readonly [number, number])[];

/** A flat blade lying in the plane of `along` and `across`, filled as a fan from its middle. */
const blade = (
  g: Geo,
  origin: V3,
  along: V3,
  across: V3,
  outline: Outline,
  length: number,
  droop = 0,
): void => {
  const normal = normalize(cross(along, across));
  const place = (a: number, b: number): V3 =>
    add(add(add(origin, mul(along, a)), mul(across, b)), mul(up, -droop * (a / length) * (a / length)));
  const middle = vertex(g, place(length * 0.45, 0), normal, length * 0.45, 0);
  const ids = outline.map(([a, b]) => vertex(g, place(a, b), normal, a, b));
  for (let i = 0; i < ids.length; i += 1)
    g.indices.push(middle, ids[i] ?? middle, ids[(i + 1) % ids.length] ?? middle);
};

/** Pointed blade: `shoulder` is where it is widest (0..1), `taper` how sharply it narrows after it. */
const pointedOutline = (length: number, width: number, shoulder: number, steps = 8): Outline => {
  const half = (t: number): number =>
    t < shoulder
      ? width * 0.5 * (0.5 + 0.5 * Math.sin((t / shoulder) * (Math.PI / 2)))
      : width * 0.5 * Math.pow(Math.cos(((t - shoulder) / (1 - shoulder)) * (Math.PI / 2)), 0.8);
  const side: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    side.push([t * length, half(t)]);
  }
  const back = side
    .slice(1, -1)
    .reverse()
    .map(([a, b]): [number, number] => [a, -b]);
  return [...side, ...back];
};

/** Rounded leaf outline: an ellipse with an optional heart-shaped base and slits (monstera). */
const broadOutline = (length: number, width: number, slits: number, heart: boolean): Outline => {
  const points: [number, number][] = [];
  const steps = 40;
  for (let i = 0; i < steps; i += 1) {
    const phi = (i / steps) * Math.PI * 2;
    let scale = 1;
    // Slits: narrow notches cut towards the middle on both sides, away from the tip and the base.
    if (slits > 0) {
      const side = Math.abs(Math.sin(phi));
      const notch = Math.max(0, Math.cos(phi * slits * 1.0 * 2));
      if (side > 0.35) scale -= 0.42 * Math.pow(notch, 6);
    }
    let a = length * 0.5 + length * 0.5 * Math.cos(phi) * scale;
    const b = width * 0.5 * Math.sin(phi) * scale;
    // Heart-shaped base: pull the base towards the middle between the two lobes.
    if (heart && Math.cos(phi) < -0.85) a += length * 0.09 * ((-Math.cos(phi) - 0.85) / 0.15);
    points.push([a, b]);
  }
  return points;
};

// ---------------------------------------------------------------------------------------------
// Parametric part: scales about the plant's own axis from the height parameter.

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

/**
 * A part whose x and z extent follow `scaleFactor` (height / natural height) about the plant axis: `size` sets
 * the extent about the part's centre and `translate` moves that centre outwards by the same factor.
 */
const scaled = (name: string, material: string, build: (g: Geo) => void): PartSpec => {
  const { min, max } = measure(build);
  const rule = (axis: 0 | 2): { size: string; translate: string } => {
    const extent = round2(max[axis] - min[axis]);
    const centre = round2((max[axis] + min[axis]) / 2);
    return { size: `${Math.max(extent, 0.01)} * scaleFactor`, translate: `${centre} * (scaleFactor - 1)` };
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

// ---------------------------------------------------------------------------------------------
// Pots, shared by every plant.

const potMaterial = (r: number, g: number, b: number, roughness: number): MaterialSpec => ({
  color: [r, g, b],
  roughness,
});

const potMaterials: Readonly<Record<string, MaterialSpec>> = {
  "Pot black": potMaterial(0.012, 0.012, 0.012, 0.45),
  "Pot cream": potMaterial(0.58, 0.56, 0.42, 0.6),
  "Pot sage": potMaterial(0.35, 0.46, 0.4, 0.6),
  "Pot green": potMaterial(0.17, 0.34, 0.26, 0.5),
  "Pot terracotta": potMaterial(0.5, 0.2, 0.1, 0.85),
};

type PotShape = Readonly<{ height: number; bottomRadius: number; topRadius: number }>;

const potBody = (pot: PotShape) => (g: Geo) => {
  frustum(g, [0, 0], 0, pot.height - 8, pot.bottomRadius, pot.topRadius - 2, {
    segments: 32,
    capStart: true,
  });
  frustum(g, [0, 0], pot.height - 8, pot.height + 4, pot.topRadius, pot.topRadius, {
    segments: 32,
    capEnd: true,
  });
};

const soilBody = (pot: PotShape) => (g: Geo) =>
  cylinder(g, [0, 0], pot.height - 6, pot.height + 2, pot.topRadius - 10);

// ---------------------------------------------------------------------------------------------
// Plant shapes.

type Cane = Readonly<{ angle: number; reach: number; peak: number }>;

const arecaPot: PotShape = { height: 300, bottomRadius: 125, topRadius: 156 };

const arecaCanes: readonly Cane[] = [
  { angle: 10, reach: 260, peak: 1550 },
  { angle: 60, reach: 230, peak: 1250 },
  { angle: 115, reach: 250, peak: 1750 },
  { angle: 170, reach: 240, peak: 1400 },
  { angle: 225, reach: 270, peak: 1650 },
  { angle: 280, reach: 210, peak: 1150 },
  { angle: 335, reach: 250, peak: 1450 },
];

const arecaPath = (cane: Cane) => {
  const direction = radial(cane.angle);
  const p0: V3 = add([0, arecaPot.height + 4, 0], mul(direction, 12));
  const p1: V3 = add([0, cane.peak * 1.02, 0], mul(direction, cane.reach * 0.1));
  const p2: V3 = add([0, cane.peak * 0.84, 0], mul(direction, cane.reach));
  return { p0, p1, p2 };
};

const arecaStems = (g: Geo): void => {
  for (const cane of arecaCanes) {
    const { p0, p1, p2 } = arecaPath(cane);
    const steps = 12;
    const path: V3[] = [];
    const radii: number[] = [];
    for (let i = 0; i <= steps; i += 1) {
      path.push(bezier(p0, p1, p2, i / steps));
      radii.push(9 - 6 * (i / steps));
    }
    tube(g, path, radii, 6);
  }
};

const arecaLeaves = (g: Geo): void => {
  for (const cane of arecaCanes) {
    const { p0, p1, p2 } = arecaPath(cane);
    const pairs = 13;
    for (let i = 0; i < pairs; i += 1) {
      const t = 0.42 + (0.58 * i) / (pairs - 1);
      const point = bezier(p0, p1, p2, t);
      const tangent = bezierTangent(p0, p1, p2, t);
      const side = normalize(cross(tangent, up));
      const length = 190 - 70 * ((t - 0.42) / 0.58);
      for (const sign of [1, -1] as const) {
        const direction = normalize(add(add(mul(tangent, 0.45), mul(side, 0.9 * sign)), [0, -0.3, 0]));
        const across = normalize(add(tangent, mul(direction, -dot(tangent, direction))));
        blade(g, point, direction, across, pointedOutline(length, 26, 0.35, 5), length, 18);
      }
    }
  }
};

const snakeLeaf = (
  g: Geo,
  angle: number,
  lean: number,
  height: number,
  width: number,
  bend: number,
): void => {
  const direction = radial(angle);
  const tangentAcross = cross(up, direction);
  const steps = 8;
  const base: V3 = add([0, 200, 0], mul(direction, 18));
  const length = height - 200;
  const along = normalize(add(up, mul(direction, Math.tan((lean * Math.PI) / 180))));
  const outline = pointedOutline(length, width, 0.38, steps);
  // A curve outwards: lean the whole blade and bend it a little more near the tip.
  const normal = normalize(cross(along, tangentAcross));
  const middle = vertex(g, add(base, mul(along, length * 0.4)), normal, 0, 0);
  const place = (a: number, b: number): V3 =>
    add(
      add(add(base, mul(along, a)), mul(tangentAcross, b)),
      mul(direction, bend * (a / length) * (a / length)),
    );
  const ids = outline.map(([a, b]) => vertex(g, place(a, b), normal, a, b));
  for (let i = 0; i < ids.length; i += 1)
    g.indices.push(middle, ids[i] ?? middle, ids[(i + 1) % ids.length] ?? middle);
};

const snakePot: PotShape = { height: 205, bottomRadius: 70, topRadius: 100 };

type LeafSpec = readonly [angle: number, lean: number, height: number, width: number, bend: number];

const snakeDark: readonly LeafSpec[] = [
  [100, 4, 650, 62, 40],
  [255, 6, 980, 56, 35],
  [330, 3, 860, 60, 30],
  [190, 8, 560, 54, 30],
];
const snakeLight: readonly LeafSpec[] = [
  [40, 7, 700, 60, 45],
  [150, 5, 800, 54, 30],
  [295, 9, 600, 56, 30],
  [220, 4, 700, 52, 25],
];

const snakeLeaves = (list: readonly LeafSpec[]) => (g: Geo) => {
  for (const [angle, lean, height, width, bend] of list) snakeLeaf(g, angle, lean, height, width, bend);
};

type Broad = Readonly<{
  angle: number;
  reach: number;
  lift: number;
  length: number;
  width: number;
  /** 0 = stem leaves, 1 = young leaf. */
  young?: boolean;
}>;

const broadPot = (
  pot: PotShape,
  plants: readonly Broad[],
  leafLengthScale: number,
  slits: number,
  heart: boolean,
) => {
  const stemPath = (leaf: Broad) => {
    const direction = radial(leaf.angle);
    const p0: V3 = add([0, pot.height + 2, 0], mul(direction, 8));
    const p2: V3 = add([0, pot.height + leaf.lift, 0], mul(direction, leaf.reach));
    const p1: V3 = add([0, pot.height + leaf.lift * 0.95, 0], mul(direction, leaf.reach * 0.12));
    return { p0, p1, p2, direction };
  };
  const stems = (g: Geo): void => {
    for (const leaf of plants) {
      const { p0, p1, p2 } = stemPath(leaf);
      const path: V3[] = [];
      const radii: number[] = [];
      for (let i = 0; i <= 8; i += 1) {
        path.push(bezier(p0, p1, p2, i / 8));
        radii.push(5.5 - 2 * (i / 8));
      }
      tube(g, path, radii, 6);
    }
  };
  const leaves =
    (young: boolean) =>
    (g: Geo): void => {
      for (const leaf of plants) {
        if ((leaf.young === true) !== young) continue;
        const { p2, direction } = stemPath(leaf);
        const length = leaf.length * leafLengthScale;
        const along = normalize(add(mul(direction, 0.6), [0, 0.55, 0]));
        const across = cross(up, direction);
        blade(
          g,
          p2,
          along,
          across,
          broadOutline(length, leaf.width * leafLengthScale, slits, heart),
          length,
          length * 0.12,
        );
      }
    };
  return { stems, leaves };
};

const monsteraPot: PotShape = { height: 225, bottomRadius: 90, topRadius: 115 };
const monsteraLeaves: readonly Broad[] = [
  { angle: 190, reach: 70, lift: 330, length: 300, width: 270 },
  { angle: 20, reach: 70, lift: 470, length: 300, width: 270 },
  { angle: 235, reach: 60, lift: 380, length: 230, width: 200 },
  { angle: 70, reach: 50, lift: 260, length: 230, width: 200 },
  { angle: 150, reach: 40, lift: 620, length: 280, width: 240, young: true },
  { angle: 275, reach: 50, lift: 520, length: 250, width: 220 },
  { angle: 330, reach: 30, lift: 200, length: 180, width: 160 },
];

const leafyPot: PotShape = { height: 220, bottomRadius: 85, topRadius: 110 };
const leafyLeaves: readonly Broad[] = [
  { angle: 190, reach: 55, lift: 150, length: 230, width: 160, young: true },
  { angle: 150, reach: 35, lift: 250, length: 210, width: 125 },
  { angle: 285, reach: 20, lift: 340, length: 200, width: 125 },
  { angle: 40, reach: 45, lift: 130, length: 220, width: 160, young: true },
  { angle: 330, reach: 35, lift: 250, length: 190, width: 115 },
  { angle: 95, reach: 30, lift: 380, length: 200, width: 125 },
  { angle: 245, reach: 35, lift: 290, length: 180, width: 105 },
];

// ---------------------------------------------------------------------------------------------
// Templates.

type PlantOptions = Readonly<{
  id: string;
  label: string;
  tags: readonly string[];
  description: string;
  pot: string;
  heightMm: Readonly<{ min: number; max: number; default: number; picks: readonly number[] }>;
  materials: Readonly<Record<string, MaterialSpec>>;
  slots: Readonly<Record<string, string>>;
  parts: readonly (readonly [name: string, material: string, build: (g: Geo) => void])[];
  shape: PotShape;
}>;

const plant = (options: PlantOptions): TemplateSpec => {
  // The foliage is drawn roughly to size, then scaled about the pot top so the plant reaches its default height.
  const potTop = options.shape.height;
  const foliageTop = Math.max(...options.parts.map(([, , build]) => measure(build).max[1]));
  const fit = (options.heightMm.default - potTop) / (foliageTop - potTop);
  const fitted =
    (build: (g: Geo) => void) =>
    (g: Geo): void => {
      build(g);
      for (let i = 0; i < g.positions.length; i += 3) {
        g.positions[i] = (g.positions[i] ?? 0) * fit;
        g.positions[i + 1] = potTop + ((g.positions[i + 1] ?? 0) - potTop) * fit;
        g.positions[i + 2] = (g.positions[i + 2] ?? 0) * fit;
      }
    };
  const bodies: PartSpec[] = [
    scaled("Pot", options.pot, potBody(options.shape)),
    scaled("Soil", "Soil", soilBody(options.shape)),
    ...options.parts.map(([name, material, build]) => scaled(name, material, fitted(build))),
  ];
  // A hidden footprint keeps the object's bounds symmetric about the pot, so the pot sits on the placement point.
  let reachX = 0;
  let reachZ = 0;
  for (const part of bodies) {
    if (part.build === undefined) continue;
    const { min, max } = measure(part.build);
    reachX = Math.max(reachX, Math.abs(min[0]), Math.abs(max[0]));
    reachZ = Math.max(reachZ, Math.abs(min[2]), Math.abs(max[2]));
  }
  const footprint = scaled("Footprint", "Soil", (g) => box(g, [-reachX, 0, -reachZ], [reachX, 1, reachZ]));
  const parts: PartSpec[] = [...bodies, { ...footprint, rule: { ...footprint.rule, visible: false } }];
  const natural = round2(
    Math.max(...bodies.map((part) => (part.build === undefined ? 0 : measure(part.build).max[1]))),
  );
  return {
    id: options.id,
    view: "front",
    metadata: {
      ...floorAreable,
      kind: "plant",
      label: options.label,
      category: "Plants",
      tags: [...options.tags],
      product: { name: options.label, description: options.description },
      resize: {
        x: { mode: "fixed" },
        y: {
          mode: "scale",
          title: "Height",
          description: "Overall height with the pot; width and depth grow in proportion.",
          minMm: options.heightMm.min,
          maxMm: options.heightMm.max,
          defaultMm: options.heightMm.default,
          quickPicks: [...options.heightMm.picks],
        },
        z: { mode: "fixed" },
      },
      materialSlots: {
        pot: {
          material: options.pot,
          title: "Pot",
          choosable: true,
          presets: Object.keys(potMaterials),
          allowColor: true,
          allowTexture: false,
        },
        soil: "Soil",
        ...options.slots,
      },
      formulas: { scaleFactor: `heightMm / ${natural}` },
    },
    materials: { ...potMaterials, Soil: { color: [0.04, 0.03, 0.02], roughness: 1 }, ...options.materials },
    parts,
  };
};

const leafMaterial = (r: number, g: number, b: number): MaterialSpec => ({
  color: [r, g, b],
  roughness: 0.55,
  doubleSided: true,
});

const arecaPalm = plant({
  id: "plant-areca-palm",
  label: "Areca Palm",
  tags: ["plant", "palm", "areca", "tall"],
  description: "A tall feathery palm in a pot. One height setting scales the whole plant.",
  pot: "Pot black",
  heightMm: { min: 800, max: 2400, default: 1650, picks: [1000, 1300, 1650, 2000] },
  shape: arecaPot,
  materials: {
    "Palm stem": leafMaterial(0.15, 0.25, 0.05),
    "Palm leaf": leafMaterial(0.03, 0.15, 0.03),
  },
  slots: { stems: "Palm stem", leaves: "Palm leaf" },
  parts: [
    ["Stems", "Palm stem", arecaStems],
    ["Leaflets", "Palm leaf", arecaLeaves],
  ],
});

const snake = plant({
  id: "plant-snake",
  label: "Snake Plant",
  tags: ["plant", "snake plant", "sansevieria", "upright"],
  description: "Upright sword-shaped leaves in a pot. One height setting scales the whole plant.",
  pot: "Pot sage",
  heightMm: { min: 400, max: 1400, default: 980, picks: [600, 800, 980, 1200] },
  shape: snakePot,
  materials: {
    "Sword leaves": leafMaterial(0.05, 0.12, 0.04),
    "Light leaves": leafMaterial(0.2, 0.26, 0.06),
  },
  slots: { leaves: "Sword leaves", youngLeaves: "Light leaves" },
  parts: [
    ["Leaves", "Sword leaves", snakeLeaves(snakeDark)],
    ["LightLeaves", "Light leaves", snakeLeaves(snakeLight)],
  ],
});

const monsteraStems = broadPot(monsteraPot, monsteraLeaves, 1, 4, true);
const monstera = plant({
  id: "plant-monstera",
  label: "Monstera",
  tags: ["plant", "monstera", "swiss cheese plant", "broad leaf"],
  description: "Large split leaves on long stems in a pot. One height setting scales the whole plant.",
  pot: "Pot green",
  heightMm: { min: 500, max: 1600, default: 990, picks: [700, 990, 1300] },
  shape: monsteraPot,
  materials: {
    "Monstera leaves": leafMaterial(0.03, 0.1, 0.06),
    "New leaf": leafMaterial(0.1, 0.21, 0.08),
  },
  slots: { leaves: "Monstera leaves", newLeaf: "New leaf" },
  parts: [
    ["Stems", "Monstera leaves", monsteraStems.stems],
    ["Leaves", "Monstera leaves", monsteraStems.leaves(false)],
    ["NewLeaf", "New leaf", monsteraStems.leaves(true)],
  ],
});

const leafyStems = broadPot(leafyPot, leafyLeaves, 1, 0, false);
const leafy = plant({
  id: "plant-leafy",
  label: "Leafy Plant",
  tags: ["plant", "leafy", "broad leaf", "houseplant"],
  description: "A bushy plant with broad leaves in a pot. One height setting scales the whole plant.",
  pot: "Pot cream",
  heightMm: { min: 400, max: 1200, default: 690, picks: [500, 690, 900] },
  shape: leafyPot,
  materials: {
    Leaves: leafMaterial(0.04, 0.13, 0.08),
    "Young leaves": leafMaterial(0.15, 0.25, 0.1),
  },
  slots: { leaves: "Leaves", youngLeaves: "Young leaves" },
  parts: [
    ["Stems", "Leaves", leafyStems.stems],
    ["Leaves", "Leaves", leafyStems.leaves(false)],
    ["YoungLeaves", "Young leaves", leafyStems.leaves(true)],
  ],
});

export const templates: readonly TemplateSpec[] = [arecaPalm, snake, monstera, leafy];
