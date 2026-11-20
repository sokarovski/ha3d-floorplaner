// The dithered room fade (Phase 21.3 prototype): opening a room fades everything else by skipping a fixed 4×4
// pattern of its pixels ("screen-door" transparency) instead of drawing transparent copies. Every material keeps
// its solid program; the shader decides per fragment from a few shared uniforms, so opening, closing, and orbiting
// a room change numbers only: no wall layers are split or rebuilt, no faded material copies are made, static
// batches stay, and the shadow maps are not redrawn.
//
// Per fragment, in world metres on the ground plane (x, z):
// - inside the room's outline: the room, drawn as is;
// - within `margin` outside it (the room's own walls, their doors and windows): drawn as is, or at the "faded"
//   level when the nearest outline edge is on the camera's side (±70°, as the fade variant's near walls). A wall
//   fragment on the outline itself counts as the wall, so a near wall's inner face fades too;
// - anything else: the other rooms at the "dimmed" level.
// Levels are the fraction of pixels kept (Bayer 4×4 ordered dither, stable while the camera rests); they are
// uniforms, so a renderer's fade-strength setting changes them without a recompile.
//
// Pure: no three.js objects besides the uniform values, so `ditherLevel` (the same test on the CPU, for picking)
// can be checked from a script.

/** The most outline edges the shader takes; a room with more falls back to the fade variant. */
export const maxDitherEdges = 48;

/** Fraction of pixels kept for the other rooms (`dimmed`) and for the room's near walls (`faded`). */
export type DitherLevels = Readonly<{ dimmed: number; faded: number }>;

/** The default levels (implementation conventions, as the transparent fade's opacities); a renderer may change them. */
export const defaultDitherLevels: DitherLevels = { dimmed: 0.1, faded: 0.25 };

export type GroundPoint = Readonly<{ x: number; z: number }>;

/** One outline edge on the ground (world metres) and whether it lies on the camera's side. */
export type DitherEdge = Readonly<{ a: GroundPoint; b: GroundPoint; near: boolean }>;

/** Distance from a point to a segment on the ground (m). */
export const distanceToSegment = (p: GroundPoint, a: GroundPoint, b: GroundPoint): number => {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const length2 = abx * abx + abz * abz;
  const t = length2 < 1e-12 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.z - a.z) * abz) / length2));
  return Math.hypot(p.x - a.x - abx * t, p.z - a.z - abz * t);
};

/** The fraction of pixels the shader keeps at a point (1 = drawn as is); `wall` as the patched mesh's role. */
export const ditherLevel = (
  point: GroundPoint,
  edges: readonly DitherEdge[],
  margin: number,
  wall: boolean,
  levels: DitherLevels = defaultDitherLevels,
): number => {
  let inside = false;
  let best = Number.POSITIVE_INFINITY;
  let bestNear = false;
  for (const { a, b, near } of edges) {
    if (a.z > point.z !== b.z > point.z && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x)
      inside = !inside;
    const distance = distanceToSegment(point, a, b);
    if (distance < best) {
      best = distance;
      bestNear = near;
    }
  }
  const inBand = best <= margin;
  if (inBand && bestNear && (wall || !inside)) return levels.faded;
  if (inside || inBand) return 1;
  return levels.dimmed;
};

/** Which edges face the camera: the edge's midpoint direction from the room centre within ±70° of the eye's. */
export const nearEdges = (
  edges: readonly Readonly<{ a: GroundPoint; b: GroundPoint }>[],
  center: GroundPoint,
  eye: GroundPoint,
): DitherEdge[] => {
  const nearCos = Math.cos((70 * Math.PI) / 180);
  const ex = eye.x - center.x;
  const ez = eye.z - center.z;
  const eyeLength = Math.hypot(ex, ez);
  return edges.map(({ a, b }) => {
    const mx = (a.x + b.x) / 2 - center.x;
    const mz = (a.z + b.z) / 2 - center.z;
    const length = Math.hypot(mx, mz);
    const near = eyeLength > 1e-3 && length > 1e-3 && (mx * ex + mz * ez) / (length * eyeLength) > nearCos;
    return { a, b, near };
  });
};

/**
 * The fragment-shader code: uniforms, the Bayer threshold, and `hpDitherAway(wall)`, true when the fragment is
 * skipped. Reads the world position from the varying `hpDitherWorld` the vertex patch writes.
 */
export const ditherGlsl = `
uniform float hpDitherOn;
uniform int hpDitherCount;
uniform float hpDitherMargin;
uniform vec2 hpDitherLevels;
uniform vec4 hpDitherEdges[${String(maxDitherEdges)}];
uniform vec4 hpDitherNear[${String(maxDitherEdges / 4)}];
varying vec3 hpDitherWorld;
const float hpBayer[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
float hpDitherLevel(bool wall) {
  vec2 p = hpDitherWorld.xz;
  bool inside = false;
  float best = 1e9;
  float bestNear = 0.0;
  for (int i = 0; i < ${String(maxDitherEdges)}; i++) {
    if (i >= hpDitherCount) break;
    vec4 e = hpDitherEdges[i];
    vec2 a = e.xy;
    vec2 b = e.zw;
    if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
    float d = length(p - a - ab * t);
    if (d < best) {
      best = d;
      bestNear = hpDitherNear[i / 4][i - (i / 4) * 4];
    }
  }
  bool inBand = best <= hpDitherMargin;
  if (inBand && bestNear > 0.5 && (wall || !inside)) return hpDitherLevels.y;
  if (inside || inBand) return 1.0;
  return hpDitherLevels.x;
}
bool hpDitherAway(bool wall) {
  if (hpDitherOn < 0.5) return false;
  ivec2 cell = ivec2(mod(gl_FragCoord.xy, 4.0));
  float threshold = (hpBayer[cell.x + cell.y * 4] + 0.5) / 16.0;
  return hpDitherLevel(wall) < threshold;
}
`;
