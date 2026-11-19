// Sun through openings (Phase 15.5, owner 2026-11-18: no sunlight entered the house through the windows).
// For one house at its environment's sun, every wall opening is resized and placed as the renderer does it
// (templateResize on the built-in glb, instanceLayer placement, the instance layer's shadow rule), and sun
// rays are cast through a grid of points on its glass: a point is lit when the ray toward the sun clears
// the walls (RealAllWalls), the shadow-only ceilings, and every opening's shadow-casting parts, and the ray
// continuing into the room clears the opening's own parts (its blind). Each opening is checked as placed and
// in its other blind states. A second figure resolves the same parts at the sun shadow map's texel size
// (lighting.ts fit: 2 × radius / 2048), point-sampled at texel centres as the depth map is.
// Run: npm run windows:sun [-- <houseId>]  (default: the demo house "Demo: City apartment"; reads DATA_DIR or
// .homeplan-data directly, never writes).
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { localDataDir, localHouseId } from "./lib/localHouse";
import { environmentSun } from "@shared/domain/environment/sun";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { WallableInstanceValue } from "@shared/domain/schemas/instances";
import { isMaterialPresetChoice } from "@shared/domain/schemas/values";
import type { TemplateParameterValue } from "@shared/domain/templates/metadata";
import {
  homeplanExtras,
  templateMaterialSlots,
  validateTemplateMetadata,
} from "@shared/domain/templates/metadata";
import { openingSizeFromParameters } from "@shared/domain/templates/openingSize";
import { computeAreaFloorGeometry } from "@shared/geometry/areaGeometry";
import { buildRealAllWalls } from "@shared/geometry/realAllWalls";
import type { Region } from "@shared/geometry/region";
import { pointInRegion, regionBounds } from "@shared/geometry/region";
import { templateResize } from "@shared/geometry/templateResize";
import { mergedDepthAt } from "@shared/geometry/wallOpenings";
import { realWallInFloor } from "@shared/geometry/wallFaces";
import { decodeHouseText } from "../server/repositories/houseRepository";
import { flattenTemplate } from "../src/renderer/templateCache";
import type { TemplateAsset } from "../src/renderer/templateCache";
import { seeThrough } from "../src/renderer/shadowCasting";

type P3 = Readonly<{ x: number; y: number; h: number }>;
/** Triangles in plan mm (9 numbers each per leaf) in a bounding-volume tree, so rays skip far parts. */
type Soup = Readonly<{ min: P3; max: P3; tris: Float64Array | null; children: readonly Soup[] }>;

// Arguments: [houseId] [--north <deg>] [--at <local date-time>]: override the house's north rotation (to test a
// suspected value) or its fixed sun time (house time zone, e.g. 2026-11-18T15:00:00).
const args = process.argv.slice(2);
const option = (name: string): string | null => {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? null) : null;
};
const optionValues = new Set([option("--north"), option("--at")]);
const northText = option("--north");
const northOverride = northText === null ? null : Number(northText);
const atOverride = option("--at");
const houseId = await localHouseId(
  args.find((arg) => !arg.startsWith("--") && !optionValues.has(arg)),
  "Demo: City apartment",
);
const dataDir = localDataDir();
/** Ceiling rule of floorScene.ts (ceilingMinWallMm). */
const ceilingMinWallMm = 2000;
/** Shadow map size of lighting.ts. */
const shadowMapSize = 2048;
const grid = 40;

const decoded = decodeHouseText(
  await readFile(join(dataDir, "data", houseId, "house.json"), "utf8"),
  houseId,
);
if (decoded.kind !== "ok") throw new Error(`House ${houseId}: ${decoded.message}`);
const house = decoded.document;
const environment = {
  ...house.environment,
  ...(northOverride === null || !Number.isFinite(northOverride) ? {} : { northRotationDeg: northOverride }),
  ...(atOverride === null ? {} : { sun: { timeMode: "fixed" as const, fixedLocalDateTime: atOverride } }),
};
const sunResult = environmentSun(environment, new Date());
if (!sunResult.ok) throw new Error(sunResult.message);
const sun = sunResult.sun;

// ---- templates -----------------------------------------------------------------------------------

const loader = new GLTFLoader();
const assets = new Map<string, TemplateAsset>();
const assetOf = async (templateId: string, version: number): Promise<TemplateAsset | null> => {
  const key = `${templateId}@${String(version)}`;
  const known = assets.get(key);
  if (known !== undefined) return known;
  let bytes: Buffer;
  try {
    bytes = await readFile(resolve("server/builtin-templates", templateId, `v${String(version)}.glb`));
  } catch {
    return null;
  }
  const gltf = await loader.parseAsync(new Uint8Array(bytes).buffer, "");
  const validation = validateTemplateMetadata(homeplanExtras(gltf.scene.userData));
  if (validation.metadata === null) throw new Error(`${key}: invalid Homeplan metadata`);
  const asset: TemplateAsset = { metadata: validation.metadata, ...flattenTemplate(gltf) };
  assets.set(key, asset);
  return asset;
};

// ---- geometry helpers ----------------------------------------------------------------------------

const soupOf = (tris: readonly number[]): Soup => {
  const count = Math.floor(tris.length / 9);
  const corner = (index: number, k: number, axis: number): number => tris[index * 9 + k * 3 + axis] ?? 0;
  const centroid = (index: number, axis: number): number =>
    (corner(index, 0, axis) + corner(index, 1, axis) + corner(index, 2, axis)) / 3;
  const node = (indices: number[]): Soup => {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const index of indices)
      for (let k = 0; k < 3; k += 1)
        for (let axis = 0; axis < 3; axis += 1) {
          const value = corner(index, k, axis);
          lo[axis] = Math.min(lo[axis] ?? Infinity, value);
          hi[axis] = Math.max(hi[axis] ?? -Infinity, value);
        }
    const min = { x: lo[0] ?? 0, y: lo[1] ?? 0, h: lo[2] ?? 0 };
    const max = { x: hi[0] ?? 0, y: hi[1] ?? 0, h: hi[2] ?? 0 };
    if (indices.length <= 8) {
      const leaf = new Float64Array(indices.length * 9);
      indices.forEach((index, at) => {
        for (let k = 0; k < 9; k += 1) leaf[at * 9 + k] = tris[index * 9 + k] ?? 0;
      });
      return { min, max, tris: leaf, children: [] };
    }
    const spans = [max.x - min.x, max.y - min.y, max.h - min.h];
    const axis = spans.indexOf(Math.max(...spans));
    const sorted = [...indices].sort((a, b) => centroid(a, axis) - centroid(b, axis));
    const half = Math.floor(sorted.length / 2);
    return { min, max, tris: null, children: [node(sorted.slice(0, half)), node(sorted.slice(half))] };
  };
  return node(Array.from({ length: count }, (_, index) => index));
};

/** Slab test of the segment o + t·d, t ∈ [t0, t1], against a box. */
const segmentHitsBox = (o: P3, d: P3, t0: number, t1: number, min: P3, max: P3): boolean => {
  let lo = t0;
  let hi = t1;
  for (const axis of ["x", "y", "h"] as const) {
    if (Math.abs(d[axis]) < 1e-12) {
      if (o[axis] < min[axis] - 1 || o[axis] > max[axis] + 1) return false;
      continue;
    }
    let a = (min[axis] - 1 - o[axis]) / d[axis];
    let b = (max[axis] + 1 - o[axis]) / d[axis];
    if (a > b) [a, b] = [b, a];
    lo = Math.max(lo, a);
    hi = Math.min(hi, b);
    if (lo > hi) return false;
  }
  return true;
};

/** Möller–Trumbore against every triangle of a soup, t ∈ (t0, t1). */
const segmentHitsSoup = (o: P3, d: P3, t0: number, t1: number, soup: Soup): boolean => {
  if (!segmentHitsBox(o, d, t0, t1, soup.min, soup.max)) return false;
  const t = soup.tris;
  if (t === null) return soup.children.some((child) => segmentHitsSoup(o, d, t0, t1, child));
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i] ?? 0;
    const ay = t[i + 1] ?? 0;
    const ah = t[i + 2] ?? 0;
    const e1x = (t[i + 3] ?? 0) - ax;
    const e1y = (t[i + 4] ?? 0) - ay;
    const e1h = (t[i + 5] ?? 0) - ah;
    const e2x = (t[i + 6] ?? 0) - ax;
    const e2y = (t[i + 7] ?? 0) - ay;
    const e2h = (t[i + 8] ?? 0) - ah;
    const px = d.y * e2h - d.h * e2y;
    const py = d.h * e2x - d.x * e2h;
    const ph = d.x * e2y - d.y * e2x;
    const det = e1x * px + e1y * py + e1h * ph;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const sx = o.x - ax;
    const sy = o.y - ay;
    const sh = o.h - ah;
    const u = (sx * px + sy * py + sh * ph) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1h - sh * e1y;
    const qy = sh * e1x - sx * e1h;
    const qh = sx * e1y - sy * e1x;
    const v = (d.x * qx + d.y * qy + d.h * qh) * inv;
    if (v < 0 || u + v > 1) continue;
    const hit = (e2x * qx + e2y * qy + e2h * qh) * inv;
    if (hit > t0 && hit < t1) return true;
  }
  return false;
};

const meshTriangles = (
  positions: ArrayLike<number>,
  indices: Uint32Array,
  out: number[],
  map: (p: P3) => P3,
): void => {
  for (const index of indices) {
    const p = map({
      x: positions[index * 3] ?? 0,
      y: positions[index * 3 + 1] ?? 0,
      h: positions[index * 3 + 2] ?? 0,
    });
    out.push(p.x, p.y, p.h);
  }
};

// ---- openings ------------------------------------------------------------------------------------

type Frame = Readonly<{
  origin: P3;
  right: Readonly<{ x: number; y: number }>;
  front: Readonly<{ x: number; y: number }>;
}>;
/** Contact frame (meters: +x right, +y up, +z room side) → plan mm, as instanceLayer's contactMatrix. */
const toPlan =
  (frame: Frame) =>
  (p: P3): P3 => ({
    x: frame.origin.x + (p.x * frame.right.x + p.h * frame.front.x) * 1000,
    y: frame.origin.y + (p.x * frame.right.y + p.h * frame.front.y) * 1000,
    h: frame.origin.h + p.y * 1000,
  });

type Built = Readonly<{
  casters: Soup;
  glass: readonly Soup[];
  glassLocal: readonly Readonly<{ min: P3; max: P3 }>[];
}>;

/** The opening's parts with `parameters`: shadow casters and glass (both in plan mm). */
const buildOpening = (
  opening: WallableInstanceValue,
  asset: TemplateAsset,
  frame: Frame,
  hostDepthMm: number,
  parameters: Readonly<Record<string, TemplateParameterValue>>,
): Built | null => {
  const result = templateResize(asset.input, asset.metadata, { parameters, hostDepthMm, flip: opening.flip });
  if (!result.ok) return null;
  const slotByMaterial = new Map(
    Object.entries(templateMaterialSlots(asset.metadata)).map(([slot, name]): [string, string] => [
      name,
      slot,
    ]),
  );
  const casters: number[] = [];
  const glass: Soup[] = [];
  const glassLocal: { min: P3; max: P3 }[] = [];
  const place = toPlan(frame);
  for (const resized of result.meshes) {
    const slot = resized.materialName === null ? undefined : slotByMaterial.get(resized.materialName);
    const chosen = slot === undefined ? undefined : opening.materialOverrides[slot];
    const preset = chosen !== undefined && isMaterialPresetChoice(chosen) ? chosen.preset : undefined;
    const custom = chosen !== undefined && !isMaterialPresetChoice(chosen);
    const base: Material | null =
      (preset === undefined ? undefined : asset.materials.get(preset)) ??
      (resized.materialName === null ? null : (asset.materials.get(resized.materialName) ?? null));
    if (!custom && seeThrough(base)) {
      const tris: number[] = [];
      meshTriangles(resized.positions, resized.indices, tris, place);
      glass.push(soupOf(tris));
      const local: number[] = [];
      meshTriangles(resized.positions, resized.indices, local, (p) => p);
      const soup = soupOf(local);
      glassLocal.push({ min: soup.min, max: soup.max });
    } else meshTriangles(resized.positions, resized.indices, casters, place);
  }
  return { casters: soupOf(casters), glass, glassLocal };
};

type Placed = Readonly<{
  area: AreaValue;
  opening: WallableInstanceValue;
  asset: TemplateAsset;
  frame: Frame;
  hostDepthMm: number;
  authored: Built;
}>;

const floor: BuildingFloorValue | undefined = house.floors[0];
if (floor === undefined) throw new Error("The house has no floor.");
const walls = buildRealAllWalls(floor, openingSizeFromParameters);
const wallTris: number[] = [];
meshTriangles(walls.mesh.positions, walls.mesh.indices, wallTris, (p) => p);
const wallSoup = soupOf(wallTris);
const ceilings: { region: Region; h: number }[] = [];
for (const area of floor.areas) {
  const ceilingMm = Math.max(0, ...area.walls.map((wall) => wall.heightMm));
  const outline = computeAreaFloorGeometry(area).floorShape;
  if (ceilingMm >= ceilingMinWallMm && outline.polygons.length > 0)
    ceilings.push({ region: outline, h: ceilingMm });
}

const placed: Placed[] = [];
for (const area of floor.areas)
  for (const wall of area.walls) {
    const realWall = realWallInFloor(area, wall.id);
    if (realWall?.arc !== null) continue;
    for (const opening of wall.objects) {
      const asset = await assetOf(opening.templateId, opening.templateVersion);
      if (asset === null) {
        console.log(`skip  ${opening.name}: template ${opening.templateId} is not built in`);
        continue;
      }
      const along = realWall.spanMm.fromMm + opening.placement.distanceAlongWallMm;
      const width = opening.parameters.widthMm;
      const half = (typeof width === "number" ? width : 1000) / 2;
      const depth = mergedDepthAt(realWall, along - half, along + half, walls.bands);
      const center = (depth.lo + depth.hi) / 2;
      const edge = realWall.edge;
      const front = { x: -edge.outwardNormal.x, y: -edge.outwardNormal.y };
      const frame: Frame = {
        origin: {
          x: edge.start.x + edge.direction.x * along + edge.outwardNormal.x * center,
          y: edge.start.y + edge.direction.y * along + edge.outwardNormal.y * center,
          h: opening.placement.bottomMm,
        },
        right: { x: -front.y, y: front.x },
        front,
      };
      const hostDepthMm = depth.hi - depth.lo;
      const authored = buildOpening(opening, asset, frame, hostDepthMm, opening.parameters);
      if (authored === null) continue;
      placed.push({ area, opening, asset, frame, hostDepthMm, authored });
    }
  }

const ceilingBlocks = (o: P3, d: P3): boolean =>
  ceilings.some((ceiling) => {
    if (Math.abs(d.h) < 1e-9) return false;
    const t = (ceiling.h - o.h) / d.h;
    if (t <= 1) return false;
    return pointInRegion({ x: o.x + d.x * t, y: o.y + d.y * t }, ceiling.region);
  });

/** A fixed pseudo-random number in [0, 1) per grid cell (deterministic runs). */
const jitter = (i: number, j: number, salt: number): number => {
  const value = Math.sin(i * 12.9898 + j * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
};

/** Outward reach of the toward-sun test (mm); the house is far smaller. */
const reach = 60000;

/** Fraction of glass points the sun (`s`, unit toward it) reaches; null without glass or below the horizon. */
const sunFraction = (target: Placed, variant: Built, s: P3, texelMm: number | null): number | null => {
  if (s.h <= 0) return null;
  const toward: P3 = s;
  // Sample points: a grid on each glass pane's mid plane (contact frame), or, at texel resolution, texel
  // centres of a sun-space lattice projected onto that plane.
  let lit = 0;
  let total = 0;
  const others = placed.filter((other) => other !== target).map((other) => other.authored.casters);
  const place = toPlan(target.frame);
  // Sun-space axes for the texel lattice: two unit vectors perpendicular to the sun direction.
  const ax = { x: -s.y, y: s.x, h: 0 };
  const axLength = Math.hypot(ax.x, ax.y) || 1;
  const u = { x: ax.x / axLength, y: ax.y / axLength, h: 0 };
  const v = { x: s.y * u.h - s.h * u.y, y: s.h * u.x - s.x * u.h, h: s.x * u.y - s.y * u.x };
  for (const pane of target.authored.glassLocal) {
    const zc = (pane.min.h + pane.max.h) / 2;
    const points: P3[] = [];
    if (texelMm === null) {
      // Stratified with a fixed jitter: a regular grid aliases with the slat pitch.
      for (let i = 0; i < grid; i += 1)
        for (let j = 0; j < grid; j += 1)
          points.push(
            place({
              x: pane.min.x + ((i + jitter(i, j, 1)) / grid) * (pane.max.x - pane.min.x),
              y: pane.min.y + ((j + jitter(i, j, 2)) / grid) * (pane.max.y - pane.min.y),
              h: zc,
            }),
          );
    } else {
      // The pane's plan corners in (u, v); lattice points inside, projected along the sun onto the pane plane.
      const corners = [
        place({ x: pane.min.x, y: pane.min.y, h: zc }),
        place({ x: pane.max.x, y: pane.min.y, h: zc }),
        place({ x: pane.min.x, y: pane.max.y, h: zc }),
        place({ x: pane.max.x, y: pane.max.y, h: zc }),
      ];
      const dot = (a: P3, b: P3): number => a.x * b.x + a.y * b.y + a.h * b.h;
      const us = corners.map((c) => dot(c, u));
      const vs = corners.map((c) => dot(c, v));
      const n = { x: target.frame.front.x, y: target.frame.front.y, h: 0 };
      const planeD = dot(corners[0] ?? { x: 0, y: 0, h: 0 }, n);
      const inside = (p: P3): boolean => {
        const local = {
          x:
            (p.x - target.frame.origin.x) * target.frame.right.x +
            (p.y - target.frame.origin.y) * target.frame.right.y,
          y: p.h - target.frame.origin.h,
        };
        return (
          local.x >= pane.min.x * 1000 &&
          local.x <= pane.max.x * 1000 &&
          local.y >= pane.min.y * 1000 &&
          local.y <= pane.max.y * 1000
        );
      };
      for (let a = Math.floor(Math.min(...us) / texelMm); a <= Math.ceil(Math.max(...us) / texelMm); a += 1)
        for (
          let b = Math.floor(Math.min(...vs) / texelMm);
          b <= Math.ceil(Math.max(...vs) / texelMm);
          b += 1
        ) {
          const q = {
            x: u.x * (a + 0.5) * texelMm + v.x * (b + 0.5) * texelMm,
            y: u.y * (a + 0.5) * texelMm + v.y * (b + 0.5) * texelMm,
            h: u.h * (a + 0.5) * texelMm + v.h * (b + 0.5) * texelMm,
          };
          const t = (planeD - dot(q, n)) / dot(s, n);
          const p = { x: q.x + s.x * t, y: q.y + s.y * t, h: q.h + s.h * t };
          if (inside(p)) points.push(p);
        }
    }
    for (const p of points) {
      total += 1;
      const away: P3 = { x: -toward.x, y: -toward.y, h: -toward.h };
      const blocked =
        segmentHitsSoup(p, toward, 1e-3, reach, wallSoup) ||
        ceilingBlocks(p, toward) ||
        segmentHitsSoup(p, toward, 1e-3, 3000, variant.casters) ||
        segmentHitsSoup(p, away, 1e-3, 3000, variant.casters) ||
        others.some((soup) => segmentHitsSoup(p, toward, 1e-3, reach, soup));
      if (!blocked) lit += 1;
    }
  }
  return total === 0 ? null : lit / total;
};

// ---- report --------------------------------------------------------------------------------------

const bounds = regionBounds({
  polygons: floor.areas.flatMap((area) => computeAreaFloorGeometry(area).floorShape.polygons),
});
const maxHeightMm = Math.max(0, ...floor.areas.flatMap((area) => area.walls.map((wall) => wall.heightMm)));
// lighting.ts fit: radius (m) = max(hypot(w, d, h) / 2000 + 1, 3); the map spans 2 radius.
const radiusM = Math.max(
  Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, maxHeightMm) / 2000 + 1,
  3,
);
const texelMm = (2 * radiusM * 1000) / shadowMapSize;
const north = environment.northRotationDeg;
/** Compass azimuth of a plan direction (clockwise from geographic north). */
const compassOf = (d: Readonly<{ x: number; y: number }>): number => {
  const r = (north * Math.PI) / 180;
  const n = d.x * Math.sin(r) + d.y * Math.cos(r);
  const e = d.x * Math.cos(r) - d.y * Math.sin(r);
  return ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360;
};
/** The sun at the actual elevation, straight in front of the opening's exterior face. */
const headOn = (target: Placed): P3 => {
  const c = Math.cos((sun.elevationDeg * Math.PI) / 180);
  return {
    x: -target.frame.front.x * c,
    y: -target.frame.front.y * c,
    h: Math.sin((sun.elevationDeg * Math.PI) / 180),
  };
};

console.log(
  `House ${house.name} (${houseId}); north ${String(north)}°${northOverride === null ? "" : " (override)"}; sun ${atOverride === null ? "" : `${atOverride} local (override), `}${sun.instant.toISOString()} azimuth ${sun.azimuthDeg.toFixed(1)}°, elevation ${sun.elevationDeg.toFixed(1)}°; shadow texel ${texelMm.toFixed(1)} mm`,
);
console.log(
  "Share of each opening's glass the sun reaches, exact rays / point-sampled at shadow-map texel centres:\n" +
    "  now = the actual sun; head-on = the same elevation straight onto the exterior face (template check).",
);
const blindKey = (parameters: Readonly<Record<string, TemplateParameterValue>>): string | null =>
  "blind" in parameters
    ? "blind"
    : "blinds" in parameters
      ? "blinds"
      : "shade" in parameters
        ? "shade"
        : null;
const share = (value: number | null): string => (value === null ? "  -  " : value.toFixed(2).padStart(5));
let checked = 0;
let failures = 0;
for (const target of placed) {
  const parameters = target.opening.parameters;
  const key = blindKey(parameters);
  const variants: [string, Readonly<Record<string, TemplateParameterValue>>][] =
    key === null
      ? [["as placed", parameters]]
      : key === "shade"
        ? [
            ["no shade", { ...parameters, shade: false }],
            ["shade", { ...parameters, shade: true }],
          ]
        : [
            ["no blind", { ...parameters, [key]: false }],
            ["open slats", { ...parameters, [key]: true, blindsClosed: false }],
            ["closed slats", { ...parameters, [key]: true, blindsClosed: true }],
          ];
  const s = sun.directionPlan;
  const outward = -(s.x * target.frame.front.x + s.y * target.frame.front.y);
  const horizontal = Math.hypot(s.x, s.y);
  const profileDeg = outward > 0 ? (Math.atan2(s.h, outward) * 180) / Math.PI : null;
  const bare = target.authored.glass.length === 0;
  // Exposed: with no blind the head-on sun reaches most of the glass (not an interior door, not frosted glass).
  const unblinded = variants[0]?.[1] ?? parameters;
  const unblindedBuilt =
    key === null
      ? target.authored
      : buildOpening(target.opening, target.asset, target.frame, target.hostDepthMm, unblinded);
  const exposedShare =
    unblindedBuilt === null ? null : sunFraction(target, unblindedBuilt, headOn(target), null);
  const exposed = exposedShare !== null && exposedShare > 0.5;
  const lines: string[] = [];
  for (const [label, values] of variants) {
    const built = buildOpening(target.opening, target.asset, target.frame, target.hostDepthMm, values);
    if (built === null) {
      lines.push(`${label}: resize failed`);
      continue;
    }
    const now = sunFraction(target, built, s, null);
    const nowTexel = sunFraction(target, built, s, texelMm);
    const front = headOn(target);
    const head = sunFraction(target, built, front, null);
    const headTexel = sunFraction(target, built, front, texelMm);
    let verdict = "";
    if (head !== null && !bare && exposed) {
      // Targets (owner, 2026-11-18) at the head-on sun: bare glass passes nearly all of it, open slats more
      // than 0.3 of what the bare opening passes (below a 35° elevation; a slid door leaf doubles the blind
      // where it overlaps), closed slats almost none, a lowered shade some.
      checked += 1;
      const ok =
        label === "open slats"
          ? sun.elevationDeg > 35 || head > 0.3 * exposedShare
          : label === "closed slats"
            ? head < 0.05
            : label === "shade"
              ? head < 0.9
              : head > 0.8;
      if (!ok) {
        failures += 1;
        verdict = "  FAIL";
      }
    }
    lines.push(
      `${label.padEnd(12)} now ${share(now)} / ${share(nowTexel)}   head-on ${share(head)} / ${share(headTexel)}${verdict}`,
    );
  }
  console.log(
    `${target.area.name} / ${target.opening.name} [${target.opening.templateId}] faces ${compassOf({
      x: -target.frame.front.x,
      y: -target.frame.front.y,
    }).toFixed(0)}°, ${
      profileDeg === null
        ? horizontal > 0
          ? "sun behind it"
          : "sun overhead"
        : `sun profile angle ${profileDeg.toFixed(1)}°`
    }${bare ? " (no glass)" : exposed ? "" : " (not exposed: interior or frosted; not checked)"}`,
  );
  for (const line of lines) console.log(`    ${line}`);
}
console.log(`${String(checked)} head-on checks, ${String(failures)} failures`);
if (failures > 0) process.exitCode = 1;
