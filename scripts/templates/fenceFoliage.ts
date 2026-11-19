// Dense hedge foliage in merged meshes: overlapping irregular clumps form the volume, and small folded
// leaves break up the surface and silhouette. Seeded geometry, no box body, alpha cards, or per-leaf nodes.
import { frustum, normalize, vertex } from "./helpers";
import type { Geo, V3 } from "./helpers";

const seeded = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, value: number): V3 => [a[0] * value, a[1] * value, a[2] * value];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const subtract = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

type Clump = Readonly<{ centre: V3; radii: V3; column: number; row: number; front: number }>;
const clumps: readonly Clump[] = (() => {
  const random = seeded(6617);
  const result: Clump[] = [];
  for (let column = 0; column < 4; column += 1)
    for (let row = 0; row < 3; row += 1)
      for (const front of [-1, 1])
        result.push({
          centre: [
            -875 + column * 250 + (random() - 0.5) * 65,
            230 + row * 410 + (random() - 0.5) * 110,
            front * (90 + random() * 25),
          ],
          radii: [205 + random() * 25, 290 + random() * 25, 210 + random() * 20],
          column,
          row,
          front,
        });
  return result;
})();

const golden = (1 + Math.sqrt(5)) / 2;
const rawPoints: readonly V3[] = [
  [-1, golden, 0],
  [1, golden, 0],
  [-1, -golden, 0],
  [1, -golden, 0],
  [0, -1, golden],
  [0, 1, golden],
  [0, -1, -golden],
  [0, 1, -golden],
  [golden, 0, -1],
  [golden, 0, 1],
  [-golden, 0, -1],
  [-golden, 0, 1],
];
const points = rawPoints.map(normalize);
const faces: readonly (readonly [number, number, number])[] = [
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
];
const triangles: readonly (readonly [V3, V3, V3])[] = faces.flatMap(([ai, bi, ci]) => {
  const a = points[ai];
  const b = points[bi];
  const c = points[ci];
  if (a === undefined || b === undefined || c === undefined) return [];
  const ab = normalize(add(a, b));
  const bc = normalize(add(b, c));
  const ca = normalize(add(c, a));
  return [
    [a, ab, ca],
    [b, bc, ab],
    [c, ca, bc],
    [ab, bc, ca],
  ];
});

/** Three merged tones on the same irregular foliage volume; no long planar faces show between leaves. */
export const hedgeBody =
  (tone: number): ((g: Geo) => void) =>
  (g) => {
    const random = seeded(99731);
    for (const clump of clumps)
      for (const triangle of triangles) {
        const material = Math.floor(random() * 3);
        const positions = triangle.map((unit): V3 => {
          // Coordinate-based roughness keeps shared vertices together, including where material faces meet.
          const scale =
            1 + 0.075 * Math.sin(unit[0] * 17 + unit[1] * 23 + unit[2] * 11 + clump.column * 3 + clump.row);
          return [
            clump.centre[0] + unit[0] * clump.radii[0] * scale,
            Math.max(50, clump.centre[1] + unit[1] * clump.radii[1] * scale),
            clump.centre[2] + unit[2] * clump.radii[2] * scale,
          ];
        });
        if (material !== tone) continue;
        const [a, b, c] = positions;
        if (a === undefined || b === undefined || c === undefined) continue;
        for (const point of positions) {
          const normal = normalize([
            (point[0] - clump.centre[0]) / (clump.radii[0] * clump.radii[0]),
            (point[1] - clump.centre[1]) / (clump.radii[1] * clump.radii[1]),
            (point[2] - clump.centre[2]) / (clump.radii[2] * clump.radii[2]),
          ]);
          g.indices.push(vertex(g, point, normal, point[0], point[1]));
        }
      }
  };

/** Four triangles around a raised midrib make a small curved leaf instead of a flat green card. */
const leaf = (g: Geo, centre: V3, normal: V3, turn: number, length: number, width: number): void => {
  const tangent = normalize(cross(normal, [1, 0.12, 0.08]));
  const across = normalize(cross(normal, tangent));
  const long = add(mul(tangent, Math.cos(turn)), mul(across, Math.sin(turn)));
  const wide = add(mul(tangent, -Math.sin(turn)), mul(across, Math.cos(turn)));
  const outline: readonly V3[] = [
    add(centre, mul(long, length * -0.5)),
    add(add(centre, mul(long, length * -0.06)), mul(wide, width * -0.5)),
    add(centre, mul(long, length * 0.5)),
    add(add(centre, mul(long, length * -0.06)), mul(wide, width * 0.5)),
  ];
  const ridge = add(centre, mul(normal, width * 0.2));
  for (let side = 0; side < outline.length; side += 1) {
    const a = outline[side];
    const b = outline[(side + 1) % outline.length];
    if (a === undefined || b === undefined) continue;
    const n = normalize(cross(subtract(a, ridge), subtract(b, ridge)));
    g.indices.push(vertex(g, ridge, n, 0.5, 0.5), vertex(g, a, n, 0, 0), vertex(g, b, n, 1, 0));
  }
};

export const hedgeLeaves =
  (tone: number): ((g: Geo) => void) =>
  (g) => {
    const random = seeded(89117);
    for (let index = 0; index < 600; index += 1) {
      // Cast through the clump union to place detail on its exposed skin, rather than burying leaves in
      // overlaps. Most face the sides, with extra coverage of the top and either end of a gate stretch.
      const mode = index % 20;
      const axis = mode < 3 ? 0 : mode < 6 ? 1 : 2;
      const sign = axis === 1 ? 1 : index % 2 === 0 ? -1 : 1;
      const probe: [number, number, number] = [
        -1000 + random() * 1000,
        75 + random() * 1225,
        -290 + random() * 580,
      ];
      let nearest: Readonly<{ point: V3; normal: V3 }> | null = null;
      for (const clump of clumps) {
        let radiusSquared = 1;
        for (const other of [0, 1, 2] as const)
          if (other !== axis)
            radiusSquared -= Math.pow((probe[other] - clump.centre[other]) / clump.radii[other], 2);
        if (radiusSquared <= 0) continue;
        const point: [number, number, number] = [...probe];
        point[axis] = clump.centre[axis] + sign * clump.radii[axis] * Math.sqrt(radiusSquared);
        if (nearest !== null && sign * point[axis] <= sign * nearest.point[axis]) continue;
        nearest = {
          point,
          normal: normalize([
            (point[0] - clump.centre[0]) / Math.pow(clump.radii[0], 2),
            (point[1] - clump.centre[1]) / Math.pow(clump.radii[1], 2),
            (point[2] - clump.centre[2]) / Math.pow(clump.radii[2], 2),
          ]),
        };
      }
      const turn = random() * Math.PI * 2;
      const length = 65 + random() * 45;
      const width = length * (0.42 + random() * 0.2);
      const material = Math.floor(random() * 3);
      if (material === tone && nearest !== null)
        leaf(g, add(nearest.point, mul(nearest.normal, 24)), nearest.normal, turn, length, width);
    }
  };

export const hedgeStems = (g: Geo): void => {
  for (const x of [-850, -510, -180]) frustum(g, [x, 0], 0, 300, 13, 7, { segments: 6 });
};
