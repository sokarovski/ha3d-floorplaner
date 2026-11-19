// Sky light indoors (Phase 15.5, owner decision 2026-11-18: "make sun patches real"; spec/builder/features/
// lighting.md#sky-light-through-windows-phase-155). Evaluates the shader's rules on the CPU: the portal radiance
// and indoor fill of src/renderer/skyLight.ts, the rectangle form factor of src/renderer/linearStrip.ts (the GLSL
// in rectLightShading.ts), the portal room box and the indoor mask of src/renderer/skyShading.ts.
//   A. Indoor/outdoor fill and the sun patch against shade, at a fixed morning sun (21 June 09:00, house location).
//   B. A synthetic 4 × 5 m room with a north and a west window: irradiance in front of each window and in the far
//      corner, morning and afternoon, the three blind states, night, and confinement (outside, the next room).
//   C. A demo house (read only): the indoor mask's classification of floor and wall vertices, and each
//      opening's portal (exterior or not, blind, radiance, floor irradiance 0.5 m in front).
// Run: npm run sky:check [-- <houseId>]  (default: the demo house "Demo: City apartment"; reads DATA_DIR or .homeplan-data,
// never writes). Units: the preview's scene units with the exposure removed (daylit look; gain 1), Lambertian.
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Color } from "three";
import type { Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { localDataDir, localHouseId } from "./lib/localHouse";
import { environmentSun, sunDirectionPlan } from "@shared/domain/environment/sun";
import type { HouseEnvironmentValue } from "@shared/domain/schemas/house";
import { isMaterialPresetChoice } from "@shared/domain/schemas/values";
import {
  defaultInstanceParameters,
  homeplanExtras,
  templateMaterialSlots,
  validateTemplateMetadata,
} from "@shared/domain/templates/metadata";
import { openingSizeFromParameters } from "@shared/domain/templates/openingSize";
import { computeAreaFloorGeometry } from "@shared/geometry/areaGeometry";
import { buildRealAllWalls } from "@shared/geometry/realAllWalls";
import type { Region } from "@shared/geometry/region";
import { pointInRegion, regionBounds, regionRings } from "@shared/geometry/region";
import { templateResize } from "@shared/geometry/templateResize";
import { mergedDepthAt } from "@shared/geometry/wallOpenings";
import { realWallInFloor } from "@shared/geometry/wallFaces";
import { decodeHouseText } from "../server/repositories/houseRepository";
import type { StripVec } from "../src/renderer/linearStrip";
import { rectFormFactor } from "../src/renderer/linearStrip";
import { defaultSun } from "../src/renderer/lighting";
import { glassTransmission, seeThrough } from "../src/renderer/shadowCasting";
import {
  blindFactor,
  closedSlatsFactor,
  horizontalSkyIrradiance,
  indoorBounce,
  indoorSunGain,
  verticalSkyIrradiance,
  indoorFill,
  openSlatsFactor,
  portalRadiance,
} from "../src/renderer/skyLight";
import { indoorMask, maskIndoor } from "../src/renderer/skyShading";
import { flattenTemplate } from "../src/renderer/templateCache";
import type { TemplateAsset } from "../src/renderer/templateCache";

let failures = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `  (${detail})`}`);
};
const fmt = (value: number, digits = 3): string => value.toFixed(digits);
const v = (x: number, y: number, z: number): StripVec => ({ x, y, z });
const luminance = (rgb: readonly [number, number, number]): number =>
  0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

const houseId = await localHouseId(
  process.argv.slice(2).find((arg) => !arg.startsWith("--")),
  "Demo: City apartment",
);
const dataDir = localDataDir();
const decoded = decodeHouseText(
  await readFile(join(dataDir, "data", houseId, "house.json"), "utf8"),
  houseId,
);
if (decoded.kind !== "ok") throw new Error(`House ${houseId}: ${decoded.message}`);
const house = decoded.document;
const north = house.environment.northRotationDeg;

const sunAt = (localDateTime: string | null): ReturnType<typeof environmentSun> => {
  const environment: HouseEnvironmentValue =
    localDateTime === null
      ? house.environment
      : { ...house.environment, sun: { timeMode: "fixed", fixedLocalDateTime: localDateTime } };
  return environmentSun(environment, new Date());
};
const morningResult = sunAt("2026-06-21T09:00:00");
if (!morningResult.ok) throw new Error(morningResult.message);
const morning = morningResult.sun;
const afternoonResult = sunAt("2026-06-21T16:00:00");
if (!afternoonResult.ok) throw new Error(afternoonResult.message);
const afternoon = afternoonResult.sun;
console.log(
  `House ${house.name} (${houseId}), north ${String(north)}°; morning sun ${morning.instant.toISOString()} azimuth ` +
    `${fmt(morning.azimuthDeg, 1)}°, elevation ${fmt(morning.elevationDeg, 1)}°; afternoon 16:00 azimuth ` +
    `${fmt(afternoon.azimuthDeg, 1)}°, elevation ${fmt(afternoon.elevationDeg, 1)}°`,
);

// ---- A. fill ----------------------------------------------------------------------------------------

console.log("\nA. Indoor fill (daylight sky fill inside rooms) and the sun patch");
const sunColor = new Color(0xfff6e8);
const sunLuminance = luminance([sunColor.r, sunColor.g, sunColor.b]);
const sunOnFloor = (elevationDeg: number): number =>
  defaultSun.intensity * sunLuminance * Math.sin((elevationDeg * Math.PI) / 180);
// "Before" is the look before 15.5: the full sky fill everywhere, the sun at gain 1.
const shade = horizontalSkyIrradiance * indoorFill(1);
const shadeBefore = horizontalSkyIrradiance;
const patch = indoorSunGain(1) * sunOnFloor(morning.elevationDeg) + shade;
const patchBefore = sunOnFloor(morning.elevationDeg) + shadeBefore;
check(
  "night: the indoor fill and the indoor sun are unchanged (factor 1)",
  indoorFill(0) === 1 && indoorSunGain(0) === 1,
);
check(
  `full daylight: the indoor fill is the bounce floor ${String(indoorBounce)}`,
  Math.abs(indoorFill(1) - indoorBounce) < 1e-12,
);
check(
  "daytime shade indoors still reads as day: at most about a stop under before (≥ 0.5×)",
  shade >= 0.5 * shadeBefore,
  `shade ${fmt(shade)} vs before ${fmt(shadeBefore)}: ${fmt(Math.log2(shade / shadeBefore), 2)} stops`,
);
check(
  "morning: a sun patch indoors is brighter than before",
  patch > patchBefore,
  `patch ${fmt(patch)} vs before ${fmt(patchBefore)} (${fmt(Math.log2(patch / patchBefore), 2)} stops); ` +
    `patch/shade ${fmt(patch / shade, 1)} (before ${fmt(patchBefore / shadeBefore, 1)}); outdoors unchanged`,
);

// ---- B. synthetic room ------------------------------------------------------------------------------

console.log("\nB. Synthetic room 4 × 5 m, ceiling 2.6 m (plan mm; walls x = 0 / 4000, y = 0 / 5000)");
/** The plan direction of a compass azimuth (house north). */
const compass = (azimuthDeg: number): StripVec => {
  const d = sunDirectionPlan(azimuthDeg, 0, north);
  return v(d.x, d.y, 0);
};
type Window = Readonly<{
  label: string;
  /** Glass centre (mm), half width vector, half height vector (mm), outward unit (plan). */
  center: StripVec;
  halfAlong: StripVec;
  halfAcross: StripVec;
  outward: StripVec;
}>;
const room = { minX: 0, maxX: 4000, minY: 0, maxY: 5000, ceiling: 2600 };
const northOut = compass(0);
const westOut = compass(270);
// Place the windows in the walls whose outward normal is closest to north / west.
const wallFor = (out: StripVec): Readonly<{ center: StripVec; along: StripVec }> => {
  const candidates = [
    { n: v(0, 1, 0), center: v(2000, 5000, 0), along: v(1, 0, 0) },
    { n: v(0, -1, 0), center: v(2000, 0, 0), along: v(1, 0, 0) },
    { n: v(1, 0, 0), center: v(4000, 2500, 0), along: v(0, 1, 0) },
    { n: v(-1, 0, 0), center: v(0, 2500, 0), along: v(0, 1, 0) },
  ];
  const best = candidates.reduce((a, b) =>
    b.n.x * out.x + b.n.y * out.y > a.n.x * out.x + a.n.y * out.y ? b : a,
  );
  return { center: best.center, along: best.along };
};
const makeWindow = (
  label: string,
  out: StripVec,
  widthMm: number,
  heightMm: number,
  sillMm: number,
): Window => {
  const wall = wallFor(out);
  const outward = v(Math.round(out.x), Math.round(out.y), 0);
  const halfAlong = v((wall.along.x * widthMm) / 2, (wall.along.y * widthMm) / 2, 0);
  let halfAcross = v(0, 0, heightMm / 2);
  // cross(across, along) points into the room (−outward).
  const facing = v(
    halfAcross.y * halfAlong.z - halfAcross.z * halfAlong.y,
    halfAcross.z * halfAlong.x - halfAcross.x * halfAlong.z,
    halfAcross.x * halfAlong.y - halfAcross.y * halfAlong.x,
  );
  if (facing.x * outward.x + facing.y * outward.y > 0) halfAcross = v(0, 0, -heightMm / 2);
  return {
    label,
    center: v(wall.center.x, wall.center.y, sillMm + heightMm / 2),
    halfAlong,
    halfAcross,
    outward,
  };
};
const northWindow = makeWindow("north window 0.80 × 1.20 m", northOut, 800, 1200, 950);
const westWindow = makeWindow("west window 1.60 × 1.20 m", westOut, 1600, 1200, 950);
const corners = (w: Window): readonly [StripVec, StripVec, StripVec, StripVec] => {
  const at = (s: number, t: number): StripVec =>
    v(
      w.center.x + w.halfAlong.x * s + w.halfAcross.x * t,
      w.center.y + w.halfAlong.y * s + w.halfAcross.y * t,
      w.center.z + w.halfAlong.z * s + w.halfAcross.z * t,
    );
  return [at(1, -1), at(-1, -1), at(-1, 1), at(1, 1)];
};
/** The shader's room box: the outline's bounds + 20 mm, floor to ceiling + 20 mm. */
const inRoomBox = (p: StripVec): boolean =>
  p.x >= room.minX - 20 &&
  p.x <= room.maxX + 20 &&
  p.y >= room.minY - 20 &&
  p.y <= room.maxY + 20 &&
  p.z >= -100 &&
  p.z <= room.ceiling + 20;
type Sun = Readonly<{ directionPlan: Readonly<{ x: number; y: number; h: number }> }>;
const radianceOf = (w: Window, sun: Sun, blind: number, daylight = 1): readonly [number, number, number] =>
  portalRadiance({
    sunSide: w.outward.x * sun.directionPlan.x + w.outward.y * sun.directionPlan.y,
    daylight,
    gain: 1,
    transmission: 0.8,
    blind,
    glassShare: 0.85,
  });
/** Irradiance (luminance) from one window at a receiver: π · L · form factor, inside its room box only. */
const portalAt = (w: Window, sun: Sun, blind: number, p: StripVec, n: StripVec, daylight = 1): number =>
  inRoomBox(p)
    ? Math.PI * luminance(radianceOf(w, sun, blind, daylight)) * rectFormFactor(n, p, corners(w))
    : 0;
const up = v(0, 0, 1);
const inFront = (w: Window, mm: number): StripVec =>
  v(w.center.x - w.outward.x * mm, w.center.y - w.outward.y * mm, 0);
const farCorner = v(
  northWindow.outward.x > 0 || westWindow.outward.x > 0 ? 300 : 3700,
  northWindow.outward.y > 0 || westWindow.outward.y > 0 ? 300 : 4700,
  0,
);
const roomAt = (sun: Sun, blind: number, p: StripVec, n: StripVec = up): number =>
  shade + portalAt(northWindow, sun, blind, p, n) + portalAt(westWindow, sun, blind, p, n);

const nMorning = radianceOf(northWindow, morning, 1);
const wMorning = radianceOf(westWindow, morning, 1);
const wAfternoon = radianceOf(westWindow, afternoon, 1);
console.log(
  `INFO  radiance (linear RGB) morning: north ${nMorning.map((c) => fmt(c)).join(", ")}; west ` +
    `${wMorning.map((c) => fmt(c)).join(", ")}; west at 16:00 ${wAfternoon.map((c) => fmt(c)).join(", ")}`,
);
check("north window light is cool (blue above red)", nMorning[2] > nMorning[0] * 1.15);
check(
  "west window is brighter in the afternoon than in the morning (the sun's side of the sky)",
  luminance(wAfternoon) > luminance(wMorning) * 1.3,
  `${fmt(luminance(wAfternoon))} vs ${fmt(luminance(wMorning))}`,
);
for (const [label, sun] of [
  ["morning", morning],
  ["16:00", afternoon],
] as const) {
  const corner = roomAt(sun, 1, farCorner);
  const rows = [northWindow, westWindow].map((w) => {
    const values = [300, 500, 1000, 2000].map((mm) => roomAt(sun, 1, inFront(w, mm)));
    return `${w.label}: floor 0.3/0.5/1/2 m in front ${values.map((x) => fmt(x)).join(" / ")}`;
  });
  console.log(
    `INFO  ${label}, no blinds: ${rows.join("; ")}; far corner ${fmt(corner)} (shade alone ${fmt(shade)})`,
  );
}
// What a viewer sees lit in front of a window: a vertical surface facing it (a sofa back, a cupboard) 1 m
// in, at 1.2 m, against a wall in the far corner (vertical shade: the sky fill's vertical value × the bounce).
const verticalShade = verticalSkyIrradiance * indoorFill(1);
const facingNorth = v(northWindow.outward.x, northWindow.outward.y, 0);
const litFace = v(
  northWindow.center.x - northWindow.outward.x * 1000,
  northWindow.center.y - northWindow.outward.y * 1000,
  1200,
);
for (const [label, blind] of [
  ["no blind", 1],
  ["open slats", openSlatsFactor],
] as const) {
  const lit =
    verticalShade +
    portalAt(northWindow, morning, blind, litFace, facingNorth) +
    portalAt(westWindow, morning, blind, litFace, facingNorth);
  const cornerFace = v(farCorner.x, farCorner.y, 1200);
  const away = v(-facingNorth.x, -facingNorth.y, 0);
  const dark =
    verticalShade +
    portalAt(northWindow, morning, blind, cornerFace, away) +
    portalAt(westWindow, morning, blind, cornerFace, away);
  check(
    `morning, ${label}: a surface 1 m in front of the north window, facing it, is clearly brighter than a far-corner wall (≥ ${blind === 1 ? "1.5" : "1.3"}×)`,
    lit >= (blind === 1 ? 1.5 : 1.3) * dark,
    `${fmt(lit)} vs ${fmt(dark)}, ratio ${fmt(lit / dark, 2)}`,
  );
  if (blind === 1)
    check(
      "morning, no blind: that window-lit surface is brighter than before (window light adds, not shade removes)",
      lit > verticalSkyIrradiance,
      `${fmt(lit)} vs before ${fmt(verticalSkyIrradiance)}`,
    );
}
// Average indoor luminance (owner, 2026-11-18): the room's floor and walls on a 100 mm grid, against before.
for (const [label, blind] of [
  ["no blinds", 1],
  ["open slats", openSlatsFactor],
] as const) {
  let now = 0;
  let before = 0;
  let count = 0;
  const add = (p: StripVec, n: StripVec, fillNow: number, fillBefore: number): void => {
    now += fillNow + portalAt(northWindow, morning, blind, p, n) + portalAt(westWindow, morning, blind, p, n);
    before += fillBefore;
    count += 1;
  };
  for (let x = 50; x < room.maxX; x += 100)
    for (let y = 50; y < room.maxY; y += 100) add(v(x, y, 0), up, shade, shadeBefore);
  const vertical = verticalSkyIrradiance;
  for (let h = 50; h < room.ceiling; h += 100) {
    for (let x = 50; x < room.maxX; x += 100) {
      add(v(x, 1, h), v(0, 1, 0), vertical * indoorFill(1), vertical);
      add(v(x, room.maxY - 1, h), v(0, -1, 0), vertical * indoorFill(1), vertical);
    }
    for (let y = 50; y < room.maxY; y += 100) {
      add(v(1, y, h), v(1, 0, 0), vertical * indoorFill(1), vertical);
      add(v(room.maxX - 1, y, h), v(-1, 0, 0), vertical * indoorFill(1), vertical);
    }
  }
  const ratio = now / before;
  check(
    `morning, ${label}: average indoor luminance (floor and walls) within a stop of before (0.5–1.5×)`,
    ratio >= 0.5 && ratio <= 1.5,
    `${fmt(now / count)} vs before ${fmt(before / count)}: × ${fmt(ratio, 2)} (${fmt(Math.log2(ratio), 2)} stops; ` +
      "no sun patch in this room at 10:18, so this is the shade-and-window case)",
  );
}
const nearNorth = roomAt(morning, 1, inFront(northWindow, 500));
const corner = roomAt(morning, 1, farCorner);
console.log(
  `INFO  morning, no blinds: floor 0.5 m in front of the north window ${fmt(nearNorth)} vs the far corner's floor ` +
    `${fmt(corner)} (× ${fmt(nearNorth / corner, 2)}: a window with a 0.95 m sill sees the floor near it at a grazing angle)`,
);
const wallBelow = v(
  northWindow.center.x - northWindow.outward.x * 10,
  northWindow.center.y - northWindow.outward.y * 10,
  1800,
);
console.log(
  `INFO  morning, no blinds: north window's own reveal 10 mm inside the glass at 1.8 m ${fmt(
    shade +
      portalAt(
        northWindow,
        morning,
        1,
        wallBelow,
        v(northWindow.halfAlong.x / 400, northWindow.halfAlong.y / 400, 0),
      ),
  )} (shade alone ${fmt(shade)})`,
);
for (const [label, factor] of [
  ["open slats", blindFactor({ blind: true, blindsClosed: false })],
  ["closed slats", blindFactor({ blind: true, blindsClosed: true })],
  ["shade 80 % lowered", blindFactor({ shade: true, shadeLoweredPct: 80 })],
] as const) {
  const ratio =
    portalAt(northWindow, morning, factor, inFront(northWindow, 500), up) /
    portalAt(northWindow, morning, 1, inFront(northWindow, 500), up);
  console.log(`INFO  ${label}: north window light 0.5 m in front × ${fmt(ratio, 2)} of no blind`);
}
check("open slats pass 0.4 of the sky light", blindFactor({ blinds: true }) === openSlatsFactor);
check(
  "closed slats pass almost none (≤ 0.05)",
  blindFactor({ blind: true, blindsClosed: true }) <= 0.05,
  `factor ${String(closedSlatsFactor)}`,
);
check(
  "night: portals give nothing",
  portalAt(northWindow, morning, 1, inFront(northWindow, 500), up, 0) === 0,
);
const outside = v(
  northWindow.center.x + northWindow.outward.x * 300,
  northWindow.center.y + northWindow.outward.y * 300,
  0,
);
check(
  "confinement: nothing outside the window (one-sided)",
  Math.PI * rectFormFactor(up, outside, corners(northWindow)) === 0,
);
// The next room beside this one, in front of the north window's plane: a floor point 0.5 m past the side wall.
const nextRoom =
  northWindow.outward.y !== 0
    ? v(room.maxX + 500, northWindow.center.y - northWindow.outward.y * 500, 0)
    : v(northWindow.center.x - northWindow.outward.x * 500, room.maxY + 500, 0);
const unconfined = Math.PI * luminance(nMorning) * rectFormFactor(up, nextRoom, corners(northWindow));
check(
  "confinement: the next room beside it gets nothing (room box)",
  portalAt(northWindow, morning, 1, nextRoom, up) === 0,
  `without the box it would get ${fmt(unconfined, 4)}`,
);

// ---- C. demo house ----------------------------------------------------------------------------------

console.log(`\nC. ${house.name}: indoor mask and portals`);
const floor = house.floors[0];
if (floor === undefined) throw new Error("The house has no floor.");
const rooms = floor.areas.flatMap((area) => {
  const ceilingMm = Math.max(0, ...area.walls.map((wall) => wall.heightMm));
  const outline = computeAreaFloorGeometry(area).floorShape;
  return ceilingMm >= 2000 && outline.polygons.length > 0 ? [{ areaId: area.id, outline, ceilingMm }] : [];
});
const mask = indoorMask(rooms);
if (mask === null) throw new Error("No indoor rooms.");
console.log(
  `INFO  ${String(rooms.length)} indoor rooms; mask ${String(mask.width)} × ${String(mask.height)} at ${fmt(mask.texelMm, 1)} mm, ` +
    `vertex offset ${fmt(mask.offsetMm, 0)} mm`,
);
const truthIndoor = (p: StripVec): boolean =>
  rooms.some((r) => p.z <= r.ceilingMm + 1 && p.z > -100 && pointInRegion({ x: p.x, y: p.y }, r.outline));
let floorVertices = 0;
let floorIndoor = 0;
for (const r of rooms)
  for (const ring of regionRings(r.outline))
    for (const point of ring) {
      floorVertices += 1;
      if (maskIndoor(mask, v(point.x, point.y, 0), up)) floorIndoor += 1;
    }
check(
  "every floor-outline vertex is indoor (floors never flip to the outdoor fill)",
  floorIndoor === floorVertices,
  `${String(floorIndoor)} / ${String(floorVertices)}`,
);
const walls = buildRealAllWalls(floor, openingSizeFromParameters);
const positions = walls.mesh.positions;
const indices = walls.mesh.indices;
let triangles = 0;
let wrong = 0;
let wallIndoor = 0;
let reveals = 0;
let revealsIndoor = 0;
const corner3 = (index: number): StripVec =>
  v(positions[index * 3] ?? 0, positions[index * 3 + 1] ?? 0, positions[index * 3 + 2] ?? 0);
for (let t = 0; t + 2 < indices.length; t += 3) {
  const a = corner3(indices[t] ?? 0);
  const b = corner3(indices[t + 1] ?? 0);
  const c = corner3(indices[t + 2] ?? 0);
  const e1 = v(b.x - a.x, b.y - a.y, b.z - a.z);
  const e2 = v(c.x - a.x, c.y - a.y, c.z - a.z);
  const n0 = v(e1.y * e2.z - e1.z * e2.y, e1.z * e2.x - e1.x * e2.z, e1.x * e2.y - e1.y * e2.x);
  const length = Math.hypot(n0.x, n0.y, n0.z);
  if (length < 1e-6) continue;
  const n = v(n0.x / length, n0.y / length, n0.z / length);
  // Truth, well clear of the face (300 mm from its centroid): the space it looks into and the one behind it.
  const centroid = v((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3);
  const at = (k: number): StripVec => v(centroid.x + n.x * k, centroid.y + n.y * k, centroid.z + n.z * k);
  const front = truthIndoor(at(300));
  const back = truthIndoor(at(-300));
  // The shader takes the last (provoking) vertex.
  const got = maskIndoor(mask, c, n);
  if (!front && !back) {
    // Inside the wall's own band on both sides: an opening's reveal or lintel (ambiguous by this test).
    reveals += 1;
    if (got) revealsIndoor += 1;
    continue;
  }
  triangles += 1;
  if (got) wallIndoor += 1;
  if (got !== front) wrong += 1;
}
check(
  "wall faces between a room and anything else: the mask agrees with the side each face looks into (≥ 97 %)",
  wrong <= triangles * 0.03,
  `${String(triangles - wrong)} / ${String(triangles)} agree, ${String(wallIndoor)} indoor`,
);
console.log(
  `INFO  ${String(reveals)} reveal and lintel triangles (wall band on both sides): ${String(revealsIndoor)} indoor`,
);

// Portals of the house's openings, as skyShading.ts finds them (template glass via templateResize).
const loader = new GLTFLoader();
const assetOf = async (templateId: string, version: number): Promise<TemplateAsset | null> => {
  let bytes: Buffer;
  try {
    bytes = await readFile(resolve("server/builtin-templates", templateId, `v${String(version)}.glb`));
  } catch {
    return null;
  }
  const gltf = await loader.parseAsync(new Uint8Array(bytes).buffer, "");
  const validation = validateTemplateMetadata(homeplanExtras(gltf.scene.userData));
  if (validation.metadata === null) return null;
  return { metadata: validation.metadata, ...flattenTemplate(gltf) };
};
const roomOf = new Map<string, Readonly<{ outline: Region; ceilingMm: number }>>(
  rooms.map((r) => [r.areaId, r]),
);
const portalLines: string[] = [];
/** Floor light 0.5 m in front of each exterior opening (any house; no room or opening names assumed). */
const exteriorNear: number[] = [];
let interiorGlazing = 0;
for (const area of floor.areas)
  for (const wall of area.walls) {
    const realWall = realWallInFloor(area, wall.id);
    if (realWall?.arc !== null) continue;
    for (const opening of wall.objects) {
      const asset = await assetOf(opening.templateId, opening.templateVersion);
      if (asset === null) continue;
      const along = realWall.spanMm.fromMm + opening.placement.distanceAlongWallMm;
      const widthMm = opening.parameters.widthMm;
      const half = (typeof widthMm === "number" ? widthMm : 1000) / 2;
      const depth = mergedDepthAt(realWall, along - half, along + half, walls.bands);
      const centerDepth = (depth.lo + depth.hi) / 2;
      const edge = realWall.edge;
      const front = v(-edge.outwardNormal.x, -edge.outwardNormal.y, 0);
      const right = v(-front.y, front.x, 0);
      const origin = v(
        edge.start.x + edge.direction.x * along + edge.outwardNormal.x * centerDepth,
        edge.start.y + edge.direction.y * along + edge.outwardNormal.y * centerDepth,
        opening.placement.bottomMm,
      );
      /** Contact frame (m) → plan mm. */
      const toPlan = (x: number, y: number, z: number): StripVec =>
        v(
          origin.x + (x * right.x + z * front.x) * 1000,
          origin.y + (x * right.y + z * front.y) * 1000,
          origin.z + y * 1000,
        );
      const parameters = { ...defaultInstanceParameters(asset.metadata), ...opening.parameters };
      const result = templateResize(asset.input, asset.metadata, {
        parameters: opening.parameters,
        hostDepthMm: depth.hi - depth.lo,
        flip: opening.flip,
      });
      if (!result.ok) continue;
      const slotByMaterial = new Map(
        Object.entries(templateMaterialSlots(asset.metadata)).map(([slot, name]): [string, string] => [
          name,
          slot,
        ]),
      );
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let midZ = 0;
      let glassArea = 0;
      let transmitted = 0;
      for (const resized of result.meshes) {
        const slot = resized.materialName === null ? undefined : slotByMaterial.get(resized.materialName);
        const chosen = slot === undefined ? undefined : opening.materialOverrides[slot];
        if (chosen !== undefined && !isMaterialPresetChoice(chosen)) continue;
        const preset = chosen === undefined ? undefined : chosen.preset;
        const base: Material | null =
          (preset === undefined ? undefined : asset.materials.get(preset)) ??
          (resized.materialName === null ? null : (asset.materials.get(resized.materialName) ?? null));
        if (!seeThrough(base)) continue;
        const transmission = glassTransmission(base);
        const p = resized.positions;
        const lo = [Infinity, Infinity, Infinity];
        const hi = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i + 2 < p.length; i += 3)
          for (let axis = 0; axis < 3; axis += 1) {
            const value = p[i + axis] ?? 0;
            lo[axis] = Math.min(lo[axis] ?? Infinity, value);
            hi[axis] = Math.max(hi[axis] ?? -Infinity, value);
          }
        const [x0 = 0, y0 = 0, z0 = 0] = lo;
        const [x1 = 0, y1 = 0, z1 = 0] = hi;
        const area = (x1 - x0) * (y1 - y0);
        if (!(area > 0)) continue;
        minX = Math.min(minX, x0);
        maxX = Math.max(maxX, x1);
        minY = Math.min(minY, y0);
        maxY = Math.max(maxY, y1);
        midZ += ((z0 + z1) / 2) * area;
        glassArea += area;
        transmitted += transmission * area;
      }
      const label = `${area.name} / ${opening.name}`;
      if (!(glassArea > 0)) continue;
      const host = roomOf.get(area.id);
      const zMid = midZ / glassArea;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const probe = toPlan(cx, cy, zMid - 0.4);
      const exterior = !truthIndoor(probe);
      const outward = v(-front.x, -front.y, 0);
      const azimuth = (() => {
        const r = (north * Math.PI) / 180;
        const n = outward.x * Math.sin(r) + outward.y * Math.cos(r);
        const e = outward.x * Math.cos(r) - outward.y * Math.sin(r);
        return ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360;
      })();
      if (host === undefined || !exterior) {
        portalLines.push(
          `      ${label}: no portal (${host === undefined ? "room without a ceiling" : "interior glazing: a room behind it"})`,
        );
        if (host !== undefined) interiorGlazing += 1;
        continue;
      }
      const blind = blindFactor(parameters);
      const radiance = portalRadiance({
        sunSide: outward.x * morning.directionPlan.x + outward.y * morning.directionPlan.y,
        daylight: 1,
        gain: 1,
        transmission: transmitted / glassArea,
        blind,
        glassShare: Math.min(1, glassArea / ((maxX - minX) * (maxY - minY))),
      });
      const rect: readonly [StripVec, StripVec, StripVec, StripVec] = [
        toPlan(maxX, minY, zMid),
        toPlan(minX, minY, zMid),
        toPlan(minX, maxY, zMid),
        toPlan(maxX, maxY, zMid),
      ];
      // RectAreaLight order with cross(c1 − c0, c3 − c0) into the room: flip when it points out.
      const e1 = v(rect[1].x - rect[0].x, rect[1].y - rect[0].y, rect[1].z - rect[0].z);
      const e3 = v(rect[3].x - rect[0].x, rect[3].y - rect[0].y, rect[3].z - rect[0].z);
      const facing = v(e1.y * e3.z - e1.z * e3.y, e1.z * e3.x - e1.x * e3.z, e1.x * e3.y - e1.y * e3.x);
      const ordered: readonly [StripVec, StripVec, StripVec, StripVec] =
        facing.x * front.x + facing.y * front.y > 0 ? rect : [rect[1], rect[0], rect[3], rect[2]];
      const center = toPlan(cx, cy, zMid);
      const ahead = v(center.x + front.x * 500, center.y + front.y * 500, 0);
      const box = regionBounds(host.outline);
      const inBox =
        ahead.x >= box.minX - 20 &&
        ahead.x <= box.maxX + 20 &&
        ahead.y >= box.minY - 20 &&
        ahead.y <= box.maxY + 20;
      const near = inBox ? Math.PI * luminance(radiance) * rectFormFactor(up, ahead, ordered) : 0;
      portalLines.push(
        `      ${label}: faces ${fmt(azimuth, 0)}°, ${fmt((maxX - minX) * 1000, 0)} × ${fmt((maxY - minY) * 1000, 0)} mm, ` +
          `τ ${fmt(transmitted / glassArea, 2)}, blind ${fmt(blind, 2)}, radiance ${fmt(luminance(radiance))}` +
          ` (rgb ${radiance.map((x) => fmt(x)).join(", ")}), floor 0.5 m in front: shade ${fmt(shade)} + ${fmt(near)}`,
      );
      exteriorNear.push(near);
    }
  }
console.log("INFO  portals at the morning sun, as placed (blinds as authored):");
for (const line of portalLines) console.log(line);
console.log(
  `INFO  ${String(exteriorNear.length)} exterior portals, ${String(interiorGlazing)} interior glazings`,
);
check(
  "the house has exterior windows that are sky portals, and each lights the floor in front (≥ 0)",
  exteriorNear.length > 0 && exteriorNear.some((near) => near > 0) && exteriorNear.every((near) => near >= 0),
  exteriorNear.map((near) => fmt(near)).join(", "),
);

console.log(failures === 0 ? "\nAll sky-light checks passed." : `\n${String(failures)} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
