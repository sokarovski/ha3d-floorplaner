// The analytic strip light (spec/builder/features/lighting.md#strip-light-phase-154): evaluates the shader's term on the CPU (src/renderer/linearStrip.ts mirrors
// stripShading.ts) for synthetic cases and checks the targets. Run: npm run strips:check
//
// Units: metres and lumens (irradiance in lux). Receivers are Lambertian; no exposure or tone mapping.
import { lumensToConeCandela } from "../src/renderer/lightColor";
import type { Rounding, StripPlan, StripShape, StripVec } from "../src/renderer/linearStrip";
import type { RectLight } from "../src/renderer/rectSpecular";
import { rectSpecular, rectSpecularReference } from "../src/renderer/rectSpecular";
import {
  linearStripPlan,
  rectFormFactor,
  stripCorners,
  stripFrontRampMm,
  stripIrradiance,
  stripMinWidthMm,
  stripPlaneFadeMm,
  stripRadiance,
} from "../src/renderer/linearStrip";

let failures = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `  (${detail})`}`);
};
const fmt = (value: number, digits = 3): string => value.toFixed(digits);

const v = (x: number, y: number, z: number): StripVec => ({ x, y, z });
const mm = 0.001;

/** The strip as the shader sees it (world metres), from the plan the renderer derives (floor-frame mm). */
const shapeOf = (
  centerMm: StripVec,
  along: StripVec,
  facing: StripVec,
  lengthMm: number,
  widthMm: number,
  plan: StripPlan,
): StripShape => {
  const width = Math.max(widthMm, stripMinWidthMm);
  // across = along × facing, so cross(across, along) = facing.
  const across = v(
    along.y * facing.z - along.z * facing.y,
    along.z * facing.x - along.x * facing.z,
    along.x * facing.y - along.y * facing.x,
  );
  return {
    center: v(centerMm.x * mm, centerMm.y * mm, centerMm.z * mm),
    halfAlong: v((along.x * lengthMm * mm) / 2, (along.y * lengthMm * mm) / 2, (along.z * lengthMm * mm) / 2),
    halfAcross: v((across.x * width * mm) / 2, (across.y * width * mm) / 2, (across.z * width * mm) / 2),
    reach: plan.reachMm * mm,
    plane: plan.plane === null ? null : { normal: plan.plane.normal, offset: plan.plane.offsetMm * mm },
    planeFade: stripPlaneFadeMm * mm,
    frontRamp: stripFrontRampMm * mm,
  };
};

const radianceOf = (lumens: number, lengthMm: number, widthMm: number): number =>
  stripRadiance(lumens, lengthMm * mm * Math.max(widthMm, stripMinWidthMm) * mm);

/** Ideal one-sided line: dense Lambertian points along the segment, no reach or plane. */
const idealLine = (
  shape: StripShape,
  facing: StripVec,
  lumens: number,
  point: StripVec,
  normal: StripVec,
): number => {
  const samples = 4000;
  let sum = 0;
  for (let index = 0; index < samples; index += 1) {
    const t = ((index + 0.5) / samples) * 2 - 1;
    const s = v(
      shape.center.x + shape.halfAlong.x * t,
      shape.center.y + shape.halfAlong.y * t,
      shape.center.z + shape.halfAlong.z * t,
    );
    const d = v(point.x - s.x, point.y - s.y, point.z - s.z);
    const r2 = d.x * d.x + d.y * d.y + d.z * d.z;
    const r = Math.sqrt(r2);
    const cosE = (d.x * facing.x + d.y * facing.y + d.z * facing.z) / r;
    const cosR = -(d.x * normal.x + d.y * normal.y + d.z * normal.z) / r;
    if (cosE <= 0 || cosR <= 0) continue;
    sum += ((lumens / samples / Math.PI) * cosE * cosR) / r2;
  }
  return sum;
};

/** Brute-force cosine form factor of the rectangle seen from a receiver (validates the sign and the fit). */
const bruteFormFactor = (shape: StripShape, point: StripVec, normal: StripVec): number => {
  const [c0, c1, , c3] = stripCorners(shape);
  const u = v(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z);
  const w = v(c3.x - c0.x, c3.y - c0.y, c3.z - c0.z);
  const facing = (() => {
    const n = v(
      shape.halfAcross.y * shape.halfAlong.z - shape.halfAcross.z * shape.halfAlong.y,
      shape.halfAcross.z * shape.halfAlong.x - shape.halfAcross.x * shape.halfAlong.z,
      shape.halfAcross.x * shape.halfAlong.y - shape.halfAcross.y * shape.halfAlong.x,
    );
    const l = Math.hypot(n.x, n.y, n.z);
    return v(n.x / l, n.y / l, n.z / l);
  })();
  const nu = 3000;
  const nw = 8;
  const dA = (Math.hypot(u.x, u.y, u.z) * Math.hypot(w.x, w.y, w.z)) / (nu * nw);
  let sum = 0;
  for (let i = 0; i < nu; i += 1)
    for (let j = 0; j < nw; j += 1) {
      const a = (i + 0.5) / nu;
      const b = (j + 0.5) / nw;
      const s = v(c0.x + u.x * a + w.x * b, c0.y + u.y * a + w.y * b, c0.z + u.z * a + w.z * b);
      const d = v(s.x - point.x, s.y - point.y, s.z - point.z);
      const r2 = d.x * d.x + d.y * d.y + d.z * d.z;
      const r = Math.sqrt(r2);
      const cosR = (d.x * normal.x + d.y * normal.y + d.z * normal.z) / r;
      const cosE = -(d.x * facing.x + d.y * facing.y + d.z * facing.z) / r;
      if (cosR > 0 && cosE > 0) sum += (cosR * cosE * dA) / (Math.PI * r2);
    }
  return sum;
};

/** Today's (Phase 8.9/13.3) spot sample, as Three.js shades it: smoothstep cone, decay 2, 0.1 m clamp, window. */
const spotIrradiance = (
  at: StripVec,
  aim: StripVec,
  lumens: number,
  reach: number,
  point: StripVec,
  normal: StripVec,
): number => {
  const d = v(point.x - at.x, point.y - at.y, point.z - at.z);
  const r = Math.hypot(d.x, d.y, d.z);
  const cosR = -(d.x * normal.x + d.y * normal.y + d.z * normal.z) / r;
  if (cosR <= 0) return 0;
  const cosE = (d.x * aim.x + d.y * aim.y + d.z * aim.z) / r;
  const half = (75 * Math.PI) / 180;
  const t = Math.min(1, Math.max(0, (cosE - Math.cos(half)) / (1 - Math.cos(half))));
  const cone = t * t * (3 - 2 * t);
  const window = reach > 0 ? Math.max(0, 1 - (r / reach) ** 4) ** 2 : 1;
  return ((lumensToConeCandela(lumens, half, 1) * cone * window) / Math.max(r * r, 0.01)) * cosR;
};

const stats = (values: readonly number[]): Readonly<{ max: number; min: number }> => ({
  max: Math.max(...values),
  min: Math.min(...values),
});

// ---- 0. The shader maths: sign, fit and float32 precision -------------------------------------------

{
  const facing = v(0, 1, 0);
  const plan: StripPlan = { share: 1, reachMm: 1e6, plane: null };
  const shape = shapeOf(v(0, 0, 1000), v(1, 0, 0), facing, 2000, 12, plan);
  const points: readonly (readonly [StripVec, StripVec])[] = [
    [v(0, 0.05, 1), v(0, -1, 0)],
    [v(0.7, 0.1, 1.03), v(0, -1, 0)],
    [v(0.95, 0.2, 0.9), v(0, -1, 0)],
    [v(-1.2, 0.3, 1.4), v(0, -0.6, -0.8)],
    [v(0.2, 0.6, 0.2), v(0, 0, 1)],
  ];
  const errors = points.map(([point, normal]) => {
    const exact = rectFormFactor(normal, point, stripCorners(shape));
    const brute = bruteFormFactor(shape, point, normal);
    return Math.abs(exact - brute) / brute;
  });
  check(
    "form factor matches a brute-force integral (sign, fit) within 1 %",
    Math.max(...errors) < 0.01,
    `worst ${fmt(Math.max(...errors) * 100, 2)} %`,
  );
  const behind = rectFormFactor(v(0, -1, 0), v(0, -0.05, 1), stripCorners(shape));
  check("nothing behind the emitting face", behind === 0);

  // Float32 at the narrowest evaluated width, 1–3 m away, in view space far from the origin (camera 10 m off).
  const f32: Rounding = Math.fround;
  const offset = v(7.3, -3.1, -11.7);
  const moved = (p: StripVec): StripVec => v(p.x + offset.x, p.y + offset.y, p.z + offset.z);
  const thin = shapeOf(v(0, 0, 1000), v(1, 0, 0), facing, 2000, stripMinWidthMm, plan);
  const thinMoved: StripShape = { ...thin, center: moved(thin.center) };
  let worst = 0;
  for (const distance of [0.03, 0.3, 1, 2, 3])
    for (const x of [0, 0.5, 0.99, 1.4]) {
      const point = v(x, distance, 1 + distance * 0.3);
      const normal = v(0, -1, 0);
      const reference = rectFormFactor(normal, point, stripCorners(thin));
      const single = rectFormFactor(normal, moved(point), stripCorners(thinMoved, f32), f32);
      if (reference > 0) worst = Math.max(worst, Math.abs(single - reference) / reference);
    }
  check(
    `float32 error at ${String(stripMinWidthMm)} mm width, 0.03–3 m, view space 14 m from the camera, below 2 %`,
    worst < 0.02,
    `worst ${fmt(worst * 100, 3)} %`,
  );
}

// ---- 1. A 2 m strip facing a wall at 30/50/100/200 mm (headboard, cove) --------------------------------

const wallCase = (distanceMm: number, thicknessMm: number): void => {
  const lumens = 1000;
  const heightMm = 1000;
  const lengthMm = 2000;
  const widthMm = 12;
  const facing = v(0, 1, 0);
  const along = v(1, 0, 0);
  const walls = [-0.833, -0.5, -0.167, 0.167, 0.5, 0.833].map((t) => ({
    distanceMm,
    point: v(t * lengthMm, distanceMm, heightMm),
    normal: v(0, -1, 0),
  }));
  const plan = linearStripPlan(heightMm, 90, facing, walls);
  const shape = shapeOf(v(0, 0, heightMm), along, facing, lengthMm, widthMm, plan);
  const termLumens = lumens * plan.share;
  const radiance = radianceOf(termLumens, lengthMm, widthMm);
  const d = distanceMm * mm;
  const wallNormal = v(0, -1, 0);
  const at = (x: number, z: number): StripVec => v(x, d, z);
  const analytic = (x: number, z: number): number => stripIrradiance(shape, radiance, at(x, z), wallNormal);
  const ideal = (x: number, z: number): number => idealLine(shape, facing, termLumens, at(x, z), wallNormal);
  const label = `${String(distanceMm)} mm`;

  // Along the band's centre line, middle 80 %.
  const xs = Array.from({ length: 81 }, (_, index) => -0.8 + (index / 80) * 1.6);
  const line = xs.map((x) => analytic(x, 1));
  const idealRow = xs.map((x) => ideal(x, 1));
  const lineStats = stats(line);
  const idealStats = stats(idealRow);
  const relative = stats(line.map((value, index) => value / (idealRow[index] ?? 1)));
  check(
    `${label}: even band (max/min along the middle 80 %) within 1.1× of the ideal line's`,
    relative.max / relative.min <= 1.1,
    `term ${fmt(lineStats.max / lineStats.min)}, ideal ${fmt(idealStats.max / idealStats.min)}, ` +
      `term/ideal ${fmt(relative.max / relative.min)}`,
  );

  // Band half-height at half maximum, at the middle.
  const halfHeight = (f: (z: number) => number): number => {
    const peak = f(1);
    let z = 1;
    while (z < 1.5 && f(z) > peak / 2) z += 0.0002;
    return z - 1;
  };
  const bandTerm = halfHeight((z) => analytic(0, z));
  const bandIdeal = halfHeight((z) => ideal(0, z));
  check(
    `${label}: band half-height within ±20 % of the ideal line`,
    Math.abs(bandTerm / bandIdeal - 1) <= 0.2,
    `${fmt(bandTerm * 1000, 1)} mm vs ${fmt(bandIdeal * 1000, 1)} mm`,
  );
  check(
    `${label}: brightness at the band's middle within ±5 % of the ideal line`,
    Math.abs(analytic(0, 1) / ideal(0, 1) - 1) <= 0.05,
    `${fmt(analytic(0, 1), 0)} lx vs ${fmt(ideal(0, 1), 0)} lx`,
  );

  // Total flux on the wall face (6 m wide, floor to 2.6 m), against the fill share.
  const steps = 360;
  const columns = 900;
  let flux = 0;
  const low = Math.atan(-1 / d);
  const high = Math.atan(1.6 / d);
  for (let i = 0; i < steps; i += 1) {
    const phi = low + ((i + 0.5) / steps) * (high - low);
    const z = 1 + d * Math.tan(phi);
    const dz = (d / Math.cos(phi) ** 2) * ((high - low) / steps);
    for (let j = 0; j < columns; j += 1) {
      const x = -3 + ((j + 0.5) / columns) * 6;
      flux += analytic(x, z) * dz * (6 / columns);
    }
  }
  check(
    `${label}: total flux on the wall within ±5 % of the term's share (${fmt(plan.share * 100, 0)} % of ${String(lumens)} lm)`,
    Math.abs(flux / termLumens - 1) <= 0.05,
    `${fmt(flux, 0)} lm of ${fmt(termLumens, 0)} lm`,
  );

  // Behind the wall: its back face, the next room's floor and an object facing the wall there.
  const back = d + thicknessMm * mm;
  const behind: readonly (readonly [StripVec, StripVec])[] = [
    ...[-0.9, 0, 0.9].map((x): readonly [StripVec, StripVec] => [v(x, back, 1), v(0, 1, 0)]),
    ...[0.1, 0.5, 1].map((y): readonly [StripVec, StripVec] => [v(0, back + y, 0.001), v(0, 0, 1)]),
    ...[0.05, 0.3].map((y): readonly [StripVec, StripVec] => [v(0.3, back + y, 1.05), v(0, -1, 0)]),
  ];
  const leak = Math.max(...behind.map(([point, normal]) => stripIrradiance(shape, radiance, point, normal)));
  check(`${label}: no light behind a ${String(thicknessMm)} mm wall`, leak === 0, `max ${fmt(leak, 6)} lx`);
};

for (const distance of [30, 50, 100, 200]) wallCase(distance, 100);
wallCase(50, 75);

// ---- 2. A strip facing down over a counter (the owner's 2.7 m kitchen strip is 0.6 m above it) ----------

const counterCase = (lengthMm: number, belowMm: number, sideWallProbe: boolean): void => {
  const lumens = 1120;
  const heightMm = 1450;
  const widthMm = 12;
  const label = `counter ${fmt(belowMm / 1000, 1)} m below a ${fmt(lengthMm / 1000, 1)} m strip`;
  const facing = v(0, 0, -1);
  const along = v(1, 0, 0);
  const plan = linearStripPlan(heightMm, 0, facing, null);
  const shape = shapeOf(v(0, 0, heightMm), along, facing, lengthMm, widthMm, plan);
  const termLumens = lumens * plan.share;
  const radiance = radianceOf(termLumens, lengthMm, widthMm);
  const counter = (heightMm - belowMm) * mm;
  const up = v(0, 0, 1);
  const carriers = Math.min(3, Math.max(1, Math.round(lengthMm / 1500)));
  const carrierAt = (index: number): StripVec =>
    v(((index + 0.5) / carriers - 0.5) * lengthMm * mm, 0, heightMm * mm);
  const carriersAt = (point: StripVec, share: number): number =>
    Array.from({ length: carriers }, (_, index) =>
      spotIrradiance(carrierAt(index), facing, (lumens * (1 - share)) / carriers, 0, point, up),
    ).reduce((sum, value) => sum + value, 0);
  // Today (Phase 8.9): the same carriers with 25 % plus 8 fill spots of 75 %, reach min(1.4, h − 0.1).
  const fills = Math.min(12, Math.max(2, Math.ceil(lengthMm / 350)));
  const todayAt = (point: StripVec): number =>
    carriersAt(point, 0.75) +
    Array.from({ length: fills }, (_, index) =>
      spotIrradiance(
        v(((index + 0.5) / fills - 0.5) * lengthMm * mm, 0, heightMm * mm),
        facing,
        (lumens * 0.75) / fills,
        Math.min(1.4, heightMm * mm - 0.1),
        point,
        up,
      ),
    ).reduce((sum, value) => sum + value, 0);
  const newAt = (point: StripVec): number =>
    carriersAt(point, plan.share) + stripIrradiance(shape, radiance, point, up);
  const idealAt = (point: StripVec): number => idealLine(shape, facing, lumens, point, up);

  const xs = Array.from({ length: 81 }, (_, index) => (-0.4 + (index / 80) * 0.8) * lengthMm * mm);
  const row = (f: (point: StripVec) => number): readonly number[] => xs.map((x) => f(v(x, 0, counter)));
  const ratio = (values: readonly number[]): number => {
    const s = stats(values);
    return s.max / s.min;
  };
  const idealRow = row(idealAt);
  const today = ratio(row(todayAt));
  const next = ratio(row(newAt));
  const ideal = ratio(idealRow);
  // Ripple: max/min of the band divided by the ideal line, so the strip's natural end falloff does not count.
  const ripple = (values: readonly number[]): number =>
    ratio(values.map((value, index) => value / (idealRow[index] ?? 1)));
  check(
    `${label}: band along the strip at least as even as today (ripple against the ideal line, carriers + term vs carriers + fill row)`,
    ripple(row(newAt)) <= ripple(row(todayAt)) + 1e-9,
    `max/min new ${fmt(next)}, today ${fmt(today)}, ideal line ${fmt(ideal)}; ` +
      `ripple vs ideal new ${fmt(ripple(row(newAt)))}, today ${fmt(ripple(row(todayAt)))}`,
  );
  const middle = v(0, 0, counter);
  check(
    `${label}: brightness under the middle within ±15 % of today's, or nearer the ideal line than today's`,
    Math.abs(newAt(middle) / todayAt(middle) - 1) <= 0.15 ||
      Math.abs(newAt(middle) / idealAt(middle) - 1) <= Math.abs(todayAt(middle) / idealAt(middle) - 1),
    `new ${fmt(newAt(middle), 0)} lx, today ${fmt(todayAt(middle), 0)} lx, ideal ${fmt(idealAt(middle), 0)} lx`,
  );
  const front = v(0, 0.3, counter);
  console.log(
    `INFO  ${label}, 0.3 m in front of the strip: new ${fmt(newAt(front), 0)} lx, today ${fmt(todayAt(front), 0)} lx`,
  );
  const floorPoint = v(0, 0.2, 0);
  check(`${label}: the term never reaches the floor`, stripIrradiance(shape, radiance, floorPoint, up) === 0);

  if (!sideWallProbe) return;
  // A thin side wall 0.15 m past the strip's end, the next room behind it: an object there at strip height.
  const sideWall = lengthMm * mm * 0.5 + 0.15;
  const probes: readonly (readonly [StripVec, StripVec])[] = [
    [v(sideWall + 0.1, 0, 1.2), v(-1, 0, 0)],
    [v(sideWall + 0.4, 0.2, 0.9), v(0, 0, 1)],
    [v(sideWall + 0.1, 0, 0.001), v(0, 0, 1)],
  ];
  const leaks = probes.map(([point, normal]) => stripIrradiance(shape, radiance, point, normal));
  const todayLeaks = probes.map(([point, normal]) =>
    Array.from({ length: fills }, (_, index) =>
      spotIrradiance(
        v(((index + 0.5) / fills - 0.5) * lengthMm * mm, 0, heightMm * mm),
        facing,
        (lumens * 0.75) / fills,
        Math.min(1.4, heightMm * mm - 0.1),
        point,
        normal,
      ),
    ).reduce((sum, value) => sum + value, 0),
  );
  console.log(
    `INFO  next room behind a side wall (known limit, as today's fill): new ${leaks.map((x) => fmt(x, 1)).join(" / ")} lx, ` +
      `today ${todayLeaks.map((x) => fmt(x, 1)).join(" / ")} lx`,
  );
  check(`${label}: next room's floor behind a side wall stays dark`, (leaks[2] ?? 1) === 0);
};

counterCase(2700, 600, true);
counterCase(2700, 300, false);
counterCase(2700, 1000, false);
counterCase(2000, 600, false);

// ---- Glossy highlight (Phase 15.4, rectLightShading.ts; CPU mirror rectSpecular.ts) ----------------------
// The representative-point highlight against a brute-force integral of Three.js's GGX over the rectangle, both
// per unit radiance: at one receiver the shader adds π · form factor · hpRectSpecular, the reference is
// ∫ BRDF · cos θ dω. "Streak energy" sums both over a grid of receivers seen from one camera; "peak" compares
// the brightest receiver. Dielectric (F0 0.04).
const glossCase = (
  label: string,
  light: RectLight,
  eye: StripVec,
  normal: StripVec,
  points: readonly StripVec[],
  cells: readonly [number, number],
  roughnesses: readonly number[],
  bounds: readonly [number, number],
): void => {
  const corners = stripCornersOf(light);
  for (const roughness of roughnesses) {
    const material = { roughness, f0: 0.04, f90: 1 };
    let shader = 0;
    let reference = 0;
    let shaderPeak = 0;
    let referencePeak = 0;
    for (const p of points) {
      const view = unit(v(eye.x - p.x, eye.y - p.y, eye.z - p.z));
      const a = Math.PI * rectFormFactor(normal, p, corners) * rectSpecular(normal, view, p, light, material);
      const b = rectSpecularReference(normal, view, p, light, material, cells[0], cells[1]);
      shader += a;
      reference += b;
      shaderPeak = Math.max(shaderPeak, a);
      referencePeak = Math.max(referencePeak, b);
    }
    const energy = shader / reference;
    check(
      `gloss, ${label}, roughness ${String(roughness)}: streak energy within ${String(bounds[0])}–${String(bounds[1])} of the reference`,
      energy >= bounds[0] && energy <= bounds[1],
      `energy ${fmt(energy)}, peak ${fmt(shaderPeak / referencePeak)}`,
    );
  }
};
const unit = (a: StripVec): StripVec => {
  const length = Math.hypot(a.x, a.y, a.z);
  return v(a.x / length, a.y / length, a.z / length);
};
const stripCornersOf = (light: RectLight): readonly [StripVec, StripVec, StripVec, StripVec] => {
  const { center: c, halfAlong: a, halfAcross: w } = light;
  const at = (s: number, t: number): StripVec =>
    v(c.x + a.x * s + w.x * t, c.y + a.y * s + w.y * t, c.z + a.z * s + w.z * t);
  return [at(1, -1), at(-1, -1), at(-1, 1), at(1, 1)];
};
const grid = (
  xs: readonly [number, number, number],
  ys: readonly [number, number, number],
  z: number,
): StripVec[] =>
  Array.from({ length: xs[2] }, (_, i) =>
    Array.from({ length: ys[2] }, (_, j) =>
      v(xs[0] + ((xs[1] - xs[0]) * i) / (xs[2] - 1), ys[0] + ((ys[1] - ys[0]) * j) / (ys[2] - 1), z),
    ),
  ).flat();
// The kitchen strip: 2.7 m × 12 mm, 0.6 m over a glossy counter, seen from 1.6 m up, 1.6 m back.
glossCase(
  "2.7 m strip 0.6 m over a counter",
  { center: v(0, 0, 0.6), halfAlong: v(1.35, 0, 0), halfAcross: v(0, 0.006, 0) },
  v(0.3, 1.6, 1.6),
  v(0, 0, 1),
  grid([-1.6, 1.6, 41], [-0.6, 0.6, 61], 0),
  [400, 4],
  [0.1, 0.3, 0.5, 0.8],
  [0.7, 1.1],
);
// A 2 m strip 0.3 m over a glossy counter.
glossCase(
  "2.0 m strip 0.3 m over a counter",
  { center: v(0, 0, 0.3), halfAlong: v(1, 0, 0), halfAcross: v(0, 0.006, 0) },
  v(0.2, 1.4, 1.2),
  v(0, 0, 1),
  grid([-1.3, 1.3, 41], [-0.5, 0.8, 61], 0),
  [400, 4],
  [0.1, 0.3, 0.5],
  [0.7, 1.1],
);
// A window-sized rectangle (a sky portal, 0.9 × 1.2 m, sill 0.9 m) reflected in a glossy floor.
glossCase(
  "0.9 × 1.2 m window over a glossy floor",
  { center: v(0, 0, 1.5), halfAlong: v(0.45, 0, 0), halfAcross: v(0, 0, 0.6) },
  v(0.5, 4, 1.6),
  v(0, 0, 1),
  grid([-1.5, 1.5, 31], [0.05, 3.05, 61], 0),
  [60, 80],
  [0.1, 0.2, 0.4],
  [0.8, 1.3],
);

console.log(failures === 0 ? "\nAll strip-light checks passed." : `\n${String(failures)} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
