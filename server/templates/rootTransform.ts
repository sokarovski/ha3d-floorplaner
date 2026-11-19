// The normalization root transform (spec/builder/features/object-templates.md#importing-phase-2):
// a uniform scale and the source axes that become glTF +Y (up) and +Z (front).
import type {
  AxisDirectionValue,
  RootTransformValue,
  SourceLengthUnitValue,
} from "../../shared/contracts/templates";

export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [Vec3, Vec3, Vec3];

export const identityRootTransform: RootTransformValue = { scale: 1, upAxis: "+y", frontAxis: "+z" };

/** Meters per source unit. */
export const unitScale: Readonly<Record<SourceLengthUnitValue, number>> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  in: 0.0254,
  ft: 0.3048,
};

const axisVector = (direction: AxisDirectionValue): Vec3 => {
  const sign = direction.startsWith("-") ? -1 : 1;
  if (direction.endsWith("x")) return [sign, 0, 0];
  if (direction.endsWith("y")) return [0, sign, 0];
  return [0, 0, sign];
};

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const axesArePerpendicular = (up: AxisDirectionValue, front: AxisDirectionValue): boolean =>
  up.slice(1) !== front.slice(1);

/** Rotation rows: R·up = +Y, R·front = +Z, R·(up × front) = +X. A signed permutation with det +1. */
export const rotationRows = (transform: RootTransformValue): Mat3 => {
  const up = axisVector(transform.upAxis);
  const front = axisVector(transform.frontAxis);
  return [cross(up, front), up, front];
};

/** Applies scale · R to a point. */
export const applyRoot = (transform: RootTransformValue, point: Vec3): Vec3 => {
  const rows = rotationRows(transform);
  const dot = (row: Vec3): number =>
    (row[0] * point[0] + row[1] * point[1] + row[2] * point[2]) * transform.scale;
  return [dot(rows[0]), dot(rows[1]), dot(rows[2])];
};

/** Column-major 4 × 4 matrix of the root transform. */
export const rootMatrix = (transform: RootTransformValue): number[] => {
  const rows = rotationRows(transform);
  const m: number[] = new Array<number>(16).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) m[col * 4 + row] = (rows[row]?.[col] ?? 0) * transform.scale;
  }
  m[15] = 1;
  return m;
};

export const isIdentityMatrix = (m: readonly number[]): boolean =>
  m.every((value, index) => Math.abs(value - (index % 5 === 0 ? 1 : 0)) < 1e-12);

export type SourceBounds = Readonly<{ min: Vec3; max: Vec3 }>;

/** Bounds after the root transform, in millimeters. */
export const transformedBoundsMm = (transform: RootTransformValue, bounds: SourceBounds) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const p = applyRoot(transform, [x, y, z]);
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis] ?? 0, (p[axis] ?? 0) * 1000);
          max[axis] = Math.max(max[axis] ?? 0, (p[axis] ?? 0) * 1000);
        }
      }
    }
  }
  const round = (value: number | undefined): number => Math.round((value ?? 0) * 1000) / 1000;
  const vec = (values: readonly number[]) => ({
    x: round(values[0]),
    y: round(values[1]),
    z: round(values[2]),
  });
  return {
    min: vec(min),
    max: vec(max),
    size: vec([0, 1, 2].map((axis) => (max[axis] ?? 0) - (min[axis] ?? 0))),
  };
};
