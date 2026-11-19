// CPU mirror of the rectangle light's glossy highlight (rectLightShading.ts `hpRectSpecular`, Phase 15.4) and a
// brute-force reference, for the check script (scripts/check-strip-light.ts). Three.js r187's BRDF_GGX: Schlick
// Fresnel, height-correlated Smith visibility, GGX distribution; α = roughness² with roughness at least 0.045.
import type { StripVec } from "./linearStrip";

const dot = (a: StripVec, b: StripVec): number => a.x * b.x + a.y * b.y + a.z * b.z;
const add = (a: StripVec, b: StripVec): StripVec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: StripVec, b: StripVec): StripVec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: StripVec, s: number): StripVec => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const cross = (a: StripVec, b: StripVec): StripVec => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const normalize = (a: StripVec): StripVec => scale(a, 1 / Math.sqrt(dot(a, a)));
const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

/**
 * Largest widening of α per rectangle axis (rectLightShading.ts). Without a cap a strip much longer than its
 * distance (2.7 m at 0.6 m) widened α to 1 and its streak kept only 44–75 % of the reference energy; 0.45 keeps
 * 83–94 % for roughness 0.1–0.5 (75 % at 0.8) and leaves windows (half extents below the distance) unchanged
 * (scripts/check-strip-light.ts).
 */
export const rectGlossWidenCap = 0.45;

export type GlossMaterial = Readonly<{ roughness: number; f0: number; f90: number }>;

/** Three.js r187 `BRDF_GGX` (scalar Fresnel). */
export const brdfGgx = (l: StripVec, v: StripVec, n: StripVec, material: GlossMaterial): number => {
  const roughness = Math.max(material.roughness, 0.045);
  const alpha = roughness * roughness;
  const a2 = alpha * alpha;
  const h = normalize(add(l, v));
  const nl = clamp(dot(n, l), 0, 1);
  const nv = clamp(dot(n, v), 0, 1);
  const nh = clamp(dot(n, h), 0, 1);
  const vh = clamp(dot(v, h), 0, 1);
  const fresnel = material.f0 + (material.f90 - material.f0) * Math.pow(1 - vh, 5);
  const gv = nl * Math.sqrt(a2 + (1 - a2) * nv * nv);
  const gl = nv * Math.sqrt(a2 + (1 - a2) * nl * nl);
  const visibility = 0.5 / Math.max(gv + gl, 1e-12);
  const denom = nh * nh * (a2 - 1) + 1;
  const distribution = a2 / (Math.PI * denom * denom);
  return fresnel * visibility * distribution;
};

/** A rectangle light C ± A ± W shining along cross(W, A). */
export type RectLight = Readonly<{ center: StripVec; halfAlong: StripVec; halfAcross: StripVec }>;

/** `hpRectSpecular`: BRDF × normalization at the representative point (multiply by π · L · form factor). */
export const rectSpecular = (
  n: StripVec,
  v: StripVec,
  p: StripVec,
  light: RectLight,
  material: GlossMaterial,
): number => {
  const { center: c, halfAlong: a, halfAcross: w } = light;
  const r = sub(scale(n, 2 * dot(n, v)), v);
  const facing = normalize(cross(w, a));
  const toward = dot(r, facing);
  const toC = sub(c, p);
  const hit =
    toward < -1e-4 ? add(p, scale(r, dot(toC, facing) / toward)) : add(p, scale(r, Math.max(dot(toC, r), 0)));
  const a2 = Math.max(dot(a, a), 1e-12);
  const w2 = Math.max(dot(w, w), 1e-12);
  const off = sub(hit, c);
  const q = add(add(c, scale(a, clamp(dot(off, a) / a2, -1, 1))), scale(w, clamp(dot(off, w) / w2, -1, 1)));
  const toQ = sub(q, p);
  const d = Math.max(Math.sqrt(dot(toQ, toQ)), 1e-6);
  const l = scale(toQ, 1 / d);
  if (dot(n, l) <= 0) return 0;
  const roughness = Math.max(material.roughness, 0.045);
  const alpha = roughness * roughness;
  const alphaA = Math.min(alpha + Math.min(Math.sqrt(a2) / (Math.sqrt(Math.PI) * d), rectGlossWidenCap), 1);
  const alphaW = Math.min(alpha + Math.min(Math.sqrt(w2) / (Math.sqrt(Math.PI) * d), rectGlossWidenCap), 1);
  return brdfGgx(l, v, n, material) * (alpha / alphaA) * (alpha / alphaW);
};

/**
 * Reference: reflected radiance per unit emitter radiance, ∫ BRDF · cos θ dω over the rectangle (midpoint rule on
 * `cells` × `cells` sub-rectangles, each as a small Lambertian patch). Only the front of the rectangle emits.
 */
export const rectSpecularReference = (
  n: StripVec,
  v: StripVec,
  p: StripVec,
  light: RectLight,
  material: GlossMaterial,
  cellsAlong: number,
  cellsAcross: number,
): number => {
  const { center: c, halfAlong: a, halfAcross: w } = light;
  const facing = normalize(cross(w, a));
  const cellArea = (4 * Math.sqrt(dot(a, a)) * Math.sqrt(dot(w, w))) / (cellsAlong * cellsAcross);
  let sum = 0;
  for (let i = 0; i < cellsAlong; i += 1)
    for (let j = 0; j < cellsAcross; j += 1) {
      const u = -1 + (2 * (i + 0.5)) / cellsAlong;
      const t = -1 + (2 * (j + 0.5)) / cellsAcross;
      const q = add(add(c, scale(a, u)), scale(w, t));
      const toQ = sub(q, p);
      const d2 = dot(toQ, toQ);
      const l = scale(toQ, 1 / Math.sqrt(d2));
      const cosReceiver = dot(n, l);
      const cosEmitter = -dot(facing, l);
      if (cosReceiver <= 0 || cosEmitter <= 0) continue;
      sum += brdfGgx(l, v, n, material) * cosReceiver * ((cosEmitter * cellArea) / d2);
    }
  return sum;
};
