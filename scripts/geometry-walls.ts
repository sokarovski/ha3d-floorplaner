// Wall-merge experiment (spec/builder/features/geometry-groups.md): fixed RealAllWalls
// scenarios with PASS/FAIL checks, plus one debug SVG per scenario in .homeplan-data/debug/.
// Run: npx tsx scripts/geometry-walls.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultFlooring, defaultWallPaint } from "@shared/domain/house/defaults";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { AreableInstanceValue, WallableInstanceValue } from "@shared/domain/schemas/instances";
import type { RoofValue } from "@shared/domain/schemas/roof";
import type { RectangleEdgeName } from "@shared/domain/schemas/shapes";
import type { WallAlignment, WallValue } from "@shared/domain/schemas/wall";
import type { WallRef } from "@shared/geometry/detents";
import { computePushDetents } from "@shared/geometry/detents";
import { buildRealAllWalls, buildRealAllWallsWithOpenings } from "@shared/geometry/realAllWalls";
import type {
  HeightSlice,
  OpeningSizeResolver,
  RealAllWalls,
  WallGeometryIssue,
} from "@shared/geometry/realAllWallsTypes";
import { buildRealFloor, buildRealFloors } from "@shared/geometry/realFloor";
import { floorCutsOf } from "@shared/geometry/floorCuts";
import { flagsAboveRoof, floorRoofLimit, roofUndersideAt } from "@shared/geometry/roofLimit";
import type { Linear2 } from "@shared/geometry/roofLimit";
import {
  fitUnderRoof,
  itemsAboveRoof,
  lightTopLimitMm,
  wallFaceTopProfile,
  wallItemTopLimitMm,
} from "@shared/geometry/roofItems";
import { stepFaces } from "@shared/geometry/roofClip";
import { createLight } from "@shared/domain/commands/furnishingCommands";
import { envelopeAt, envelopeSheet, roofCutPlane } from "@shared/domain/house/migrateV5RoofCuts";
import { migrateHouseDocument } from "@shared/domain/house/migrations";
import { createHouseDocument } from "@shared/domain/house/defaults";
import { createRoof } from "@shared/domain/house/roofs";
import { House } from "@shared/domain/schemas/house";
import { compileValidator } from "@shared/domain/validation/ajv";
import type { Bounds } from "@shared/geometry/region";
import type { Region, Ring } from "@shared/geometry/region";
import { pointInRegion, regionArea, regionBounds, regionRings } from "@shared/geometry/region";
import { openingsInAreaBoundary } from "@shared/geometry/sharedOpenings";
import { minPieceLengthMm } from "@shared/geometry/tolerances";
import type { Vec2 } from "@shared/geometry/vector";
import { addVec, distance, dotVec, normalizeVec, rotateVec, scaleVec, subVec } from "@shared/geometry/vector";

// ---------------------------------------------------------------------------------------------
// Document fixtures (real AreaValue-shaped data with deterministic IDs).

let idCounter = 0;
const nextId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}_${idCounter.toString().padStart(8, "0")}`;
};

type WallSpec = Readonly<{
  edge: RectangleEdgeName;
  thicknessMm: number;
  alignment?: WallAlignment;
  heightMm?: number;
  openings?: readonly OpeningSpec[];
}>;
type OpeningSpec = Readonly<{
  id: string;
  distanceAlongWallMm: number;
  bottomMm: number;
  widthMm: number;
  heightMm: number;
}>;

const openingSizes = new Map<string, { widthMm: number; heightMm: number }>();
const resolveOpeningSize: OpeningSizeResolver = (opening) => openingSizes.get(opening.id) ?? null;

const opening = (spec: OpeningSpec): WallableInstanceValue => {
  openingSizes.set(spec.id, { widthMm: spec.widthMm, heightMm: spec.heightMm });
  return {
    id: spec.id,
    name: "Opening",
    templateId: "builtin_window",
    templateVersion: 1,
    parameters: {},
    flip: { x: false, z: false },
    materialOverrides: {},
    placement: { distanceAlongWallMm: spec.distanceAlongWallMm, bottomMm: spec.bottomMm },
  };
};

const rectangleArea = (
  name: string,
  widthMm: number,
  depthMm: number,
  positionMm: Vec2,
  rotationDeg: number,
  walls: readonly WallSpec[],
): AreaValue => {
  const shapeId = nextId("s");
  return {
    id: nextId("a"),
    name,
    positionMm,
    rotationDeg,
    floor: {
      id: nextId("fs"),
      material: defaultFlooring(),
      shapes: [
        {
          id: shapeId,
          type: "rectangle",
          positionMm: { x: 0, y: 0 },
          rotationDeg: 0,
          widthMm,
          heightMm: depthMm,
        },
      ],
      carpets: [],
    },
    walls: walls.map((spec): WallValue => ({
      id: nextId("w"),
      sourceEdge: { shapeId, edge: spec.edge },
      spanMm: { start: { anchor: "start", offsetMm: 0 }, end: { anchor: "end", offsetMm: 0 } },
      heightMm: spec.heightMm ?? 2500,
      thicknessMm: spec.thicknessMm,
      alignment: spec.alignment ?? "outside",
      materials: { interior: defaultWallPaint(), exterior: defaultWallPaint() },
      objects: (spec.openings ?? []).map(opening),
    })),
    objects: [],
    lights: [],
  };
};

const buildingFloor = (areas: readonly AreaValue[], roofs?: readonly RoofValue[]): BuildingFloorValue => ({
  id: nextId("f"),
  name: "Scenario",
  areas: [...areas],
  lightGroups: [],
  guides: [],
  ...(roofs === undefined ? {} : { roofs: [...roofs] }),
});

/** A v5 roof cut (Phase 2; converted into a roof since schema version 6) whose profile runs through the origin. */
const legacyRoofCut = (
  sectionDirectionDeg: number,
  low: { runMm: number; heightMm: number },
  high: { runMm: number; heightMm: number },
): Readonly<Record<string, unknown>> => ({
  id: nextId("rc"),
  name: "Cut",
  active: true,
  originMm: { x: 0, y: 0 },
  sectionDirectionDeg,
  low,
  high,
  keptSide: "below",
});

const planeOf = (cut: Readonly<Record<string, unknown>>): Linear2 => {
  const plane = roofCutPlane(cut);
  if (plane === null) throw new Error("vertical cut");
  return plane;
};

/**
 * A roof whose underside is the lower envelope of the planes over the rectangle (the migration's construction, Phase
 * 19.2), in Cuts walls mode; wallsRise as given.
 */
const roofOver = (
  areas: readonly AreaValue[],
  planes: readonly Linear2[],
  bounds: Bounds,
  wallsRise: boolean,
): RoofValue => {
  const base = createRoof(buildingFloor(areas), { defaultWallHeightMm: 2500 }, "Roof");
  const sheet = envelopeSheet(planes, bounds, (prefix) => nextId(prefix));
  if (base === null || sheet === null) throw new Error("no roof");
  return { ...base, ...sheet, cutsWalls: true, wallsRise };
};

const wallOf = (area: AreaValue, edge: RectangleEdgeName): WallRef => {
  const wall = area.walls.find((candidate) => candidate.sourceEdge.edge === edge);
  if (wall === undefined) throw new Error(`Area ${area.name} has no ${edge} wall`);
  return { area, wallId: wall.id };
};

const wallId = (area: AreaValue, edge: RectangleEdgeName): string => wallOf(area, edge).wallId;

// ---------------------------------------------------------------------------------------------
// Measurements.

type Check = Readonly<{ label: string; pass: boolean; detail: string }>;

const check = (label: string, pass: boolean, detail: string): Check => ({ label, pass, detail });

const approx = (value: number, expected: number, toleranceMm = 0.05): boolean =>
  Math.abs(value - expected) <= toleranceMm;

/** Intervals (parameter along the line) where the line origin + t·direction lies inside the region. */
const lineCrossings = (region: Region, origin: Vec2, direction: Vec2): { fromMm: number; toMm: number }[] => {
  const unit = normalizeVec(direction);
  const normal = { x: -unit.y, y: unit.x };
  const ts: number[] = [];
  for (const ring of regionRings(region)) {
    ring.forEach((a, index) => {
      const b = ring[(index + 1) % ring.length];
      if (b === undefined) return;
      const da = dotVec(subVec(a, origin), normal);
      const db = dotVec(subVec(b, origin), normal);
      if (da > 0 === db > 0) return;
      const t = da / (da - db);
      ts.push(dotVec(subVec(addVec(a, scaleVec(subVec(b, a), t)), origin), unit));
    });
  }
  ts.sort((left, right) => left - right);
  const intervals: { fromMm: number; toMm: number }[] = [];
  for (let index = 0; index + 1 < ts.length; index += 2) {
    const fromMm = ts[index];
    const toMm = ts[index + 1];
    if (fromMm !== undefined && toMm !== undefined) intervals.push({ fromMm, toMm });
  }
  return intervals;
};

const sliceAt = (walls: RealAllWalls, heightMm: number): HeightSlice => {
  const slice = walls.slices.find(
    (candidate) => candidate.bottomMm <= heightMm && heightMm < candidate.topMm,
  );
  if (slice === undefined) throw new Error(`No slice at ${heightMm} mm`);
  return slice;
};

/** Owner of the outline edge crossed by the line at parameter t (within 0.05 mm). */
const ownerAt = (slice: HeightSlice, origin: Vec2, direction: Vec2, t: number): string => {
  const point = addVec(origin, scaleVec(normalizeVec(direction), t));
  for (const edge of slice.edges) {
    const length = distance(edge.start, edge.end);
    if (length === 0) continue;
    const unit = scaleVec(subVec(edge.end, edge.start), 1 / length);
    const along = dotVec(subVec(point, edge.start), unit);
    const off = Math.abs(dotVec(subVec(point, edge.start), { x: -unit.y, y: unit.x }));
    if (off <= 0.05 && along >= -0.05 && along <= length + 0.05) {
      return edge.owner === null ? "cap" : `${edge.owner.wallId}:${edge.owner.side}`;
    }
  }
  return "none";
};

const sliverEdges = (region: Region): number =>
  regionRings(region).reduce(
    (count, ring) =>
      count +
      ring.filter(
        (point, index) => distance(point, ring[(index + 1) % ring.length] ?? point) < minPieceLengthMm,
      ).length,
    0,
  );

/**
 * Joint-local sliver check radius: covers the mitred region of 200 mm walls. Off-centre faceted circles
 * still leave a few sub-0.5 mm steps elsewhere on their faces (pre-existing merge artifact, Phase 4 notes).
 */
const jointRadiusMm = 250;
/** Sliver edges with an end within `radiusMm` of any of the given points (joint-local check). */
const sliverEdgesNear = (region: Region, points: readonly Vec2[], radiusMm: number): number =>
  regionRings(region).reduce(
    (count, ring) =>
      count +
      ring.filter((point, index) => {
        const next = ring[(index + 1) % ring.length] ?? point;
        return (
          distance(point, next) < minPieceLengthMm &&
          points.some((center) => distance(center, point) <= radiusMm)
        );
      }).length,
    0,
  );

const issueKinds = (issues: readonly WallGeometryIssue[]): string =>
  issues.length === 0 ? "none" : issues.map((issue) => issue.kind).join(", ");

// ---------------------------------------------------------------------------------------------
// SVG output.

const areaColors = ["#1f77b4", "#d62728", "#2ca02c", "#9467bd"];

const ringPath = (ring: Ring): string =>
  ring
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${(-point.y).toFixed(2)}`)
    .join(" ") + " Z";

const writeSvg = (name: string, areas: readonly AreaValue[], walls: RealAllWalls): string => {
  const footprints = walls.slices.map((slice) => slice.footprint);
  const floors = areas.map((area) => buildRealFloor(area).region);
  const all = [...footprints, ...floors].filter((region) => region.polygons.length > 0);
  const bounds = all.map(regionBounds);
  const minX = Math.min(...bounds.map((b) => b.minX)) - 300;
  const maxX = Math.max(...bounds.map((b) => b.maxX)) + 300;
  const minY = Math.min(...bounds.map((b) => b.minY)) - 300;
  const maxY = Math.max(...bounds.map((b) => b.maxY)) + 300;
  const colorOf = (areaId: string): string =>
    areaColors[areas.findIndex((area) => area.id === areaId) % areaColors.length] ?? "#000";
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${-maxY} ${maxX - minX} ${maxY - minY}" width="1000">`,
  );
  parts.push(`<rect x="${minX}" y="${-maxY}" width="${maxX - minX}" height="${maxY - minY}" fill="#fff"/>`);
  parts.push(`<title>${name}</title>`);
  areas.forEach((area, index) => {
    const floor = floors[index];
    if (floor !== undefined)
      parts.push(
        `<path d="${regionRings(floor).map(ringPath).join(" ")}" fill="${colorOf(area.id)}" fill-opacity="0.08" fill-rule="evenodd"/>`,
      );
  });
  for (const band of walls.bands)
    parts.push(
      `<path d="${ringPath(band.ring)}" fill="none" stroke="#999" stroke-width="4" stroke-dasharray="20 15"/>`,
    );
  for (const prism of walls.openings)
    parts.push(`<path d="${ringPath(prism.footprint)}" fill="#ffd70055" stroke="#c90" stroke-width="3"/>`);
  walls.slices.forEach((slice, index) => {
    const offset = index * 6;
    parts.push(
      `<g transform="translate(${offset} ${-offset})"><title>slice ${slice.bottomMm}–${slice.topMm} mm</title>`,
    );
    parts.push(
      `<path d="${regionRings(slice.footprint).map(ringPath).join(" ")}" fill="#000" fill-opacity="0.05" fill-rule="evenodd" stroke="none"/>`,
    );
    for (const edge of slice.edges) {
      const owner = edge.owner;
      const color = owner === null || owner.side === "end" ? "#888" : colorOf(owner.areaId);
      const dash = owner?.side === "exterior" ? ` stroke-dasharray="40 20"` : "";
      parts.push(
        `<line x1="${edge.start.x.toFixed(2)}" y1="${(-edge.start.y).toFixed(2)}" x2="${edge.end.x.toFixed(2)}" y2="${(-edge.end.y).toFixed(2)}" stroke="${color}" stroke-width="${owner?.side === "interior" ? 14 : 8}"${dash}><title>${owner === null ? "cap" : `${owner.wallId} ${owner.side}`}</title></line>`,
      );
    }
    parts.push(`</g>`);
  });
  parts.push(`</svg>`);
  const directory = join(process.cwd(), ".homeplan-data", "debug");
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `${name}.svg`);
  writeFileSync(file, parts.join("\n"));
  return file;
};

/** Front elevation (x, h) of all mesh triangles, for roof scenarios. */
const writeElevationSvg = (name: string, walls: RealAllWalls): string => {
  const p = walls.mesh.positions;
  const xs: number[] = [];
  const hs: number[] = [];
  for (let index = 0; index + 2 < p.length; index += 3) {
    xs.push(p[index] ?? 0);
    hs.push(p[index + 2] ?? 0);
  }
  const minX = Math.min(...xs) - 300;
  const maxX = Math.max(...xs) + 300;
  const maxH = Math.max(...hs) + 300;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${-maxH} ${maxX - minX} ${maxH + 300}" width="1000">`,
    `<rect x="${minX}" y="${-maxH}" width="${maxX - minX}" height="${maxH + 300}" fill="#fff"/>`,
  ];
  for (const group of walls.mesh.groups) {
    const fill =
      group.material.kind === "cap" ? "#bbb" : group.material.side === "interior" ? "#1f77b4" : "#d62728";
    for (let index = group.start; index + 2 < group.start + group.count; index += 3) {
      const corners = [0, 1, 2].map((k) => walls.mesh.indices[index + k] ?? 0);
      const points = corners
        .map((vertex) => `${(p[vertex * 3] ?? 0).toFixed(1)},${(-(p[vertex * 3 + 2] ?? 0)).toFixed(1)}`)
        .join(" ");
      parts.push(
        `<polygon points="${points}" fill="${fill}" fill-opacity="0.15" stroke="${fill}" stroke-width="3"/>`,
      );
    }
  }
  parts.push("</svg>");
  const file = join(process.cwd(), ".homeplan-data", "debug", `${name}-elevation.svg`);
  writeFileSync(file, parts.join("\n"));
  return file;
};

// ---------------------------------------------------------------------------------------------
// Scenarios.

type Scenario = Readonly<{
  name: string;
  areas: readonly AreaValue[];
  roofs?: readonly RoofValue[];
  checks: (walls: RealAllWalls, floor: BuildingFloorValue) => Check[];
}>;

const roomSize = 3000;
const rightX = roomSize / 2;
const horizontal: Vec2 = { x: 1, y: 0 };

/** Two rooms side by side; B's left wall is pushed onto A's right wall at a detent or a fixed separation. */
const pair = (
  tA: number,
  tB: number,
  placement: "touching" | "fullClash" | { overlapMm: number } | { gapMm: number } | { separationMm: number },
  rotationDeg = 0,
) => {
  const radians = (rotationDeg * Math.PI) / 180;
  const roomA = rectangleArea("A", roomSize, roomSize, { x: 0, y: 0 }, rotationDeg, [
    { edge: "right", thicknessMm: tA },
    { edge: "left", thicknessMm: tA },
  ]);
  const far = rotateVec({ x: 8000, y: 0 }, radians);
  const roomBFar = rectangleArea("B", roomSize, roomSize, far, rotationDeg, [
    { edge: "left", thicknessMm: tB },
    { edge: "right", thicknessMm: tB },
  ]);
  const result = computePushDetents(wallOf(roomBFar, "left"), wallOf(roomA, "right"));
  if (!result.ok) throw new Error(`Detent failed: ${result.failure.kind}`);
  const { detents } = result;
  const separation =
    placement === "touching"
      ? detents.touching.separationMm
      : placement === "fullClash"
        ? detents.fullClash.separationMm
        : "overlapMm" in placement
          ? detents.touching.separationMm - placement.overlapMm
          : "gapMm" in placement
            ? detents.touching.separationMm + placement.gapMm
            : placement.separationMm;
  // B's left contour sits at A's right contour + separation (along A's right wall normal).
  const position = addVec(rotateVec({ x: rightX + separation + roomSize / 2, y: 0 }, radians), {
    x: 0,
    y: 0,
  });
  const roomB: AreaValue = { ...roomBFar, positionMm: position };
  return { roomA, roomB, detents, direction: rotateVec(horizontal, radians), contourX: rightX };
};

/** Checks the merged band across the shared wall: thickness and the owners of both outer faces. */
const sharedWallChecks = (
  label: string,
  walls: RealAllWalls,
  setup: ReturnType<typeof pair>,
  expectedMm: number,
  expectedOwners: { left: string; right: string },
): Check[] => {
  const slice = sliceAt(walls, 1000);
  const origin = { x: 0, y: 0 };
  const crossings = lineCrossings(slice.footprint, origin, setup.direction).filter(
    (interval) => interval.toMm > setup.contourX - 1 && interval.fromMm < setup.contourX + 1000,
  );
  const first = crossings[0];
  const measured = first === undefined ? NaN : first.toMm - first.fromMm;
  const left = first === undefined ? "none" : ownerAt(slice, origin, setup.direction, first.fromMm);
  const right = first === undefined ? "none" : ownerAt(slice, origin, setup.direction, first.toMm);
  return [
    check(
      `${label}: one merged band`,
      crossings.length === 1,
      `${crossings.length} band(s) across the shared line`,
    ),
    check(
      `${label}: merged thickness ${expectedMm} mm`,
      approx(measured, expectedMm),
      `measured ${measured.toFixed(3)} mm`,
    ),
    check(`${label}: room-A side owned by A`, left === expectedOwners.left, `owner ${left}`),
    check(`${label}: room-B side owned by B`, right === expectedOwners.right, `owner ${right}`),
  ];
};

const pairScenario = (
  name: string,
  tA: number,
  tB: number,
  placement: Parameters<typeof pair>[2],
  expectedMm: number,
  rotationDeg = 0,
): Scenario => {
  const setup = pair(tA, tB, placement, rotationDeg);
  return {
    name,
    areas: [setup.roomA, setup.roomB],
    checks: (walls) => [
      ...sharedWallChecks(name, walls, setup, expectedMm, {
        left: `${wallId(setup.roomA, "right")}:interior`,
        right: `${wallId(setup.roomB, "left")}:interior`,
      }),
      check(
        `${name}: no intrusion`,
        !walls.issues.some((issue) => issue.kind === "intrusion"),
        `issues: ${issueKinds(walls.issues)}`,
      ),
    ],
  };
};

const touching200 = pairScenario("touching-200-200", 200, 200, "touching", 400);
const touching200400 = pairScenario("touching-200-400", 200, 400, "touching", 600);
const fullClash200 = pairScenario("full-clash-200-200", 200, 200, "fullClash", 200);
const fullClash200400 = pairScenario("full-clash-200-400", 200, 400, "fullClash", 400);
const fullClash400200 = pairScenario("full-clash-400-200", 400, 200, "fullClash", 400);
const partial = pairScenario("partial-100-200-400", 200, 400, { overlapMm: 100 }, 500);
const rotatedTouching = pairScenario("touching-200-400-rotated-30", 200, 400, "touching", 600, 30);
const rotatedFullClash = pairScenario("full-clash-200-400-rotated-30", 200, 400, "fullClash", 400, 30);

const gapSetup = pair(200, 200, { gapMm: 1 });
const gap: Scenario = {
  name: "gap-1mm",
  areas: [gapSetup.roomA, gapSetup.roomB],
  checks: (walls) => {
    const slice = sliceAt(walls, 1000);
    const crossings = lineCrossings(slice.footprint, { x: 0, y: 0 }, horizontal).filter(
      (interval) => interval.fromMm > 1000 && interval.toMm < 3000,
    );
    const widths = crossings.map((interval) => (interval.toMm - interval.fromMm).toFixed(3)).join(" / ");
    const gapMm = crossings.length === 2 ? (crossings[1]?.fromMm ?? 0) - (crossings[0]?.toMm ?? 0) : NaN;
    return [
      check(
        "gap-1mm: two separate walls",
        crossings.length === 2,
        `${crossings.length} band(s), widths ${widths} mm`,
      ),
      check("gap-1mm: gap stays 1 mm", approx(gapMm, 1), `gap ${gapMm.toFixed(3)} mm`),
    ];
  },
};

const pushedSetup = pair(200, 400, { separationMm: 300 });
const pushedPast: Scenario = {
  name: "pushed-past-full-clash",
  areas: [pushedSetup.roomA, pushedSetup.roomB],
  checks: (walls) => [
    check(
      "pushed past Full clash: intrusion flagged",
      walls.issues.some(
        (issue) => issue.kind === "intrusion" && issue.wallId === wallId(pushedSetup.roomB, "left"),
      ),
      `issues: ${issueKinds(walls.issues)}`,
    ),
  ],
};

// L-corner from two areas: A's top wall and B's left wall meet at A's top-right corner.
const lA = rectangleArea("A", 3000, 3000, { x: 0, y: 0 }, 0, [{ edge: "top", thicknessMm: 200 }]);
const lB = rectangleArea("B", 3000, 3000, { x: 1700 + 1500, y: 1500 + 1500 }, 0, [
  { edge: "left", thicknessMm: 200 },
]);
const lCorner: Scenario = {
  name: "l-corner",
  areas: [lA, lB],
  checks: (walls) => {
    const slice = sliceAt(walls, 1000);
    const rings = regionRings(slice.footprint);
    return [
      check(
        "L-corner: one outline",
        slice.footprint.polygons.length === 1,
        `${slice.footprint.polygons.length} polygon(s)`,
      ),
      check(
        "L-corner: six vertices (clean L)",
        rings.length === 1 && rings[0]?.length === 6,
        `ring sizes ${rings.map((ring) => ring.length).join(",")}`,
      ),
      check(
        "L-corner: no sliver edges",
        sliverEdges(slice.footprint) === 0,
        `${sliverEdges(slice.footprint)} edge(s) < ${minPieceLengthMm} mm`,
      ),
      check(
        "L-corner: area = both bands",
        approx(regionArea(slice.footprint), 3000 * 200 + 3000 * 200, 1),
        `${regionArea(slice.footprint).toFixed(1)} mm²`,
      ),
    ];
  },
};

// T-junction: B sits on A's top wall at Full clash; B's left wall is the stem.
const allEdges = (thicknessMm: number): WallSpec[] =>
  (["bottom", "right", "top", "left"] as const).map((edge) => ({ edge, thicknessMm }));
const tA = rectangleArea("A", 6000, 3000, { x: 0, y: 0 }, 0, allEdges(200));
const tB = rectangleArea("B", 3000, 3000, { x: 1500, y: 1700 + 1500 }, 0, allEdges(200));
const tJunction: Scenario = {
  name: "t-junction",
  areas: [tA, tB],
  checks: (walls) => {
    const slice = sliceAt(walls, 1000);
    const barTop = ownerAt(slice, { x: 1500, y: 0 }, { x: 0, y: 1 }, 1700);
    const barBottom = ownerAt(slice, { x: 1500, y: 0 }, { x: 0, y: 1 }, 1500);
    const barOutside = ownerAt(slice, { x: -1500, y: 0 }, { x: 0, y: 1 }, 1700);
    return [
      check(
        "T-junction: one outline component",
        slice.footprint.polygons.length === 1,
        `${slice.footprint.polygons.length} polygon(s)`,
      ),
      check(
        "T-junction: no sliver edges",
        sliverEdges(slice.footprint) === 0,
        `${sliverEdges(slice.footprint)} edge(s) < ${minPieceLengthMm} mm`,
      ),
      check(
        "T-junction: bar faces room B with B's interior",
        barTop === `${wallId(tB, "bottom")}:interior`,
        `owner ${barTop}`,
      ),
      check(
        "T-junction: bar faces room A with A's interior",
        barBottom === `${wallId(tA, "top")}:interior`,
        `owner ${barBottom}`,
      ),
      check(
        "T-junction: bar outside B keeps A's exterior",
        barOutside === `${wallId(tA, "top")}:exterior`,
        `owner ${barOutside}`,
      ),
      check(
        "T-junction: no intrusion",
        !walls.issues.some((issue) => issue.kind === "intrusion"),
        `issues: ${issueKinds(walls.issues)}`,
      ),
    ];
  },
};

// One room, four outside walls, one window on the bottom wall.
const windowRoom = rectangleArea("Room", 4000, 3000, { x: 0, y: 0 }, 0, [
  {
    edge: "bottom",
    thicknessMm: 200,
    openings: [
      { id: "o_window0001", distanceAlongWallMm: 2000, bottomMm: 900, widthMm: 1200, heightMm: 1200 },
    ],
  },
  { edge: "right", thicknessMm: 200 },
  { edge: "top", thicknessMm: 200 },
  { edge: "left", thicknessMm: 200 },
]);
const windowScenario: Scenario = {
  name: "room-with-window",
  areas: [windowRoom],
  checks: (walls) => {
    const base = sliceAt(walls, 100);
    const middle = sliceAt(walls, 1500);
    const rings = regionRings(base.footprint);
    const throughWindow = lineCrossings(middle.footprint, { x: 0, y: -3000 }, { x: 0, y: 1 }).filter(
      (interval) => interval.fromMm < 1600,
    );
    const reveals = middle.edges.filter(
      (edge) => edge.owner === null && approx(distance(edge.start, edge.end), 200),
    ).length;
    const floor = buildRealFloor(windowRoom);
    return [
      check(
        "window room: mitered frame (4 + 4 vertices)",
        rings.length === 2 && rings.every((ring) => ring.length === 4),
        `ring sizes ${rings.map((ring) => ring.length).join(",")}`,
      ),
      check(
        "window room: corners have no sliver edges",
        sliverEdges(base.footprint) === 0,
        `${sliverEdges(base.footprint)} edge(s)`,
      ),
      check(
        "window room: slices 0/900/2100/2500",
        walls.slices.map((slice) => slice.bottomMm).join(",") === "0,900,2100",
        walls.slices.map((slice) => `${slice.bottomMm}-${slice.topMm}`).join(" "),
      ),
      check(
        "window room: window cuts the bottom wall",
        throughWindow.length === 0,
        `${throughWindow.length} band(s) crossed at x = 0`,
      ),
      check("window room: two cap reveals", reveals === 2, `${reveals} reveal edge(s)`),
      check(
        "window room: RealFloor grows to outer faces",
        approx(regionArea(floor.region), 4400 * 3400, 1),
        `${regionArea(floor.region).toFixed(0)} mm²`,
      ),
      check(
        "window room: mesh has groups",
        walls.mesh.groups.length === 9 && walls.mesh.indices.length > 0,
        `${walls.mesh.groups.length} groups, ${walls.mesh.indices.length / 3} triangles`,
      ),
    ];
  },
};

// A door through a Touching shared wall: the neighbour's band must not refill it; a duplicate is flagged.
const doorSetup = pair(200, 200, "touching");
const doorA: AreaValue = {
  ...doorSetup.roomA,
  walls: doorSetup.roomA.walls.map((wall) =>
    wall.sourceEdge.edge === "right"
      ? {
          ...wall,
          objects: [
            opening({
              id: "o_door000001",
              distanceAlongWallMm: 1500,
              bottomMm: 0,
              widthMm: 900,
              heightMm: 2100,
            }),
          ],
        }
      : wall,
  ),
};
const doorB: AreaValue = {
  ...doorSetup.roomB,
  walls: doorSetup.roomB.walls.map((wall) =>
    wall.sourceEdge.edge === "left"
      ? {
          ...wall,
          objects: [
            opening({
              id: "o_door000002",
              distanceAlongWallMm: 1500,
              bottomMm: 0,
              widthMm: 900,
              heightMm: 2100,
            }),
          ],
        }
      : wall,
  ),
};
const doorScenario: Scenario = {
  name: "door-through-shared-wall",
  areas: [doorA, doorB],
  checks: (walls) => {
    const low = sliceAt(walls, 1000);
    const crossings = lineCrossings(low.footprint, { x: 0, y: 0 }, horizontal).filter(
      (interval) => interval.toMm > 1000 && interval.fromMm < 2500,
    );
    return [
      check(
        "door: aperture through full merged depth",
        crossings.length === 0,
        `${crossings.length} band(s) left in the doorway`,
      ),
      check(
        "door: duplicate opening flagged",
        walls.issues.some((issue) => issue.kind === "openingConflict"),
        `issues: ${issueKinds(walls.issues)}`,
      ),
    ];
  },
};

// Phase 15.7: a door stored on the neighbour's wall belongs to a room too when the wall runs along the room's
// boundary (shared/geometry/sharedOpenings.ts), and the room drawn alone (isolation) keeps that doorway open.
const sharedSetup = pair(100, 100, "touching");
const sharedB: AreaValue = {
  ...sharedSetup.roomB,
  walls: sharedSetup.roomB.walls.map((wall) =>
    wall.sourceEdge.edge === "left"
      ? {
          ...wall,
          objects: [
            opening({
              id: "o_shared0001",
              distanceAlongWallMm: 1500,
              bottomMm: 0,
              widthMm: 900,
              heightMm: 2100,
            }),
          ],
        }
      : wall.sourceEdge.edge === "right"
        ? {
            ...wall,
            objects: [
              opening({
                id: "o_outer00001",
                distanceAlongWallMm: 1500,
                bottomMm: 900,
                widthMm: 800,
                heightMm: 1000,
              }),
            ],
          }
        : wall,
  ),
};
// A with no wall of its own on the shared side: B's wall (outside-aligned, on B's contour) still bounds A when
// A's contour sits on B's wall's far face.
const bareA = rectangleArea("Bare A", roomSize, roomSize, { x: 100, y: 0 }, 0, [
  { edge: "left", thicknessMm: 100 },
]);
const sharedOpeningScenario: Scenario = {
  name: "shared-wall-opening",
  areas: [sharedSetup.roomA, sharedB],
  checks: (walls, floor) => {
    const roomA = sharedSetup.roomA;
    const shared = openingsInAreaBoundary(walls, roomA);
    const ofB = openingsInAreaBoundary(walls, sharedB);
    const cuts = walls.openings.filter((prism) => shared.has(prism.openingId));
    const alone = buildRealAllWalls({ ...floor, areas: [roomA] }, resolveOpeningSize);
    const cut = buildRealAllWallsWithOpenings({ ...floor, areas: [roomA] }, resolveOpeningSize, cuts);
    const doorway = (part: RealAllWalls): number =>
      lineCrossings(sliceAt(part, 1000).footprint, { x: 0, y: 0 }, horizontal).filter(
        (interval) => interval.toMm > 1000 && interval.fromMm < 2500,
      ).length;
    const bareFloor = buildingFloor([bareA, sharedB]);
    const bareWalls = buildRealAllWalls(bareFloor, resolveOpeningSize);
    const bare = openingsInAreaBoundary(bareWalls, bareA);
    return [
      check(
        "shared: B's door in the shared wall belongs to A, with A's right wall",
        shared.get("o_shared0001") === wallId(roomA, "right"),
        JSON.stringify([...shared]),
      ),
      check(
        "shared: B's window on its far wall does not",
        !shared.has("o_outer00001"),
        JSON.stringify([...shared]),
      ),
      check("shared: a room's own openings are not listed for it", ofB.size === 0, JSON.stringify([...ofB])),
      check(
        "shared: A drawn alone closes the doorway (the bug)",
        doorway(alone) > 0,
        `${doorway(alone)} band(s)`,
      ),
      check(
        "shared: A drawn alone with the shared cut keeps it open",
        doorway(cut) === 0,
        `${doorway(cut)} band(s) left in the doorway`,
      ),
      check(
        "shared: A without its own wall there still shares the door (no wall of A)",
        bare.has("o_shared0001") && bare.get("o_shared0001") === null,
        JSON.stringify([...bare]),
      ),
    ];
  },
};

// Roofs cut walls (Phase 19.2): a roof in Cuts walls mode limits the walls by its underside, each planar piece over
// its own plan region. The gable is the lower envelope of two opposing legacy cuts along x over a 6000 × 4000 room
// with 200 mm walls (outer faces at x = ±3200, y = ±2200): 2700 − 0.375·|x|, ridge 2700 at x = 0, 1575 at the
// contour (x = ±3000), eaves 1500 at the outer faces. The roof's outline is the walls' box grown by 400 mm, as the
// migration of such cuts makes it (the envelope is the same function over any outline containing the walls).
const gableCuts = [
  legacyRoofCut(0, { runMm: -3200, heightMm: 1500 }, { runMm: 0, heightMm: 2700 }),
  legacyRoofCut(180, { runMm: -3200, heightMm: 1500 }, { runMm: 0, heightMm: 2700 }),
];
const gablePlanes = gableCuts.map(planeOf);
const gableBounds: Bounds = { minX: -3600, minY: -2600, maxX: 3600, maxY: 2600 };
const gableEnvelope = (point: Vec2): number => 2700 - 0.375 * Math.abs(point.x);
const gableRoomOf = (heightMm: number, openings: readonly OpeningSpec[], name = "Attic"): AreaValue =>
  rectangleArea(
    name,
    6000,
    4000,
    { x: 0, y: 0 },
    0,
    (["bottom", "right", "top", "left"] as const).map((edge) => ({
      edge,
      thicknessMm: 200,
      heightMm,
      openings: edge === "bottom" ? openings : [],
    })),
  );
// Window centered at x = −2400 (bottom edge runs from x = −3000), sill 1000, head 2200: above the roof (1650–1950).
const gableRoom = gableRoomOf(3000, [
  { id: "o_attic00001", distanceAlongWallMm: 600, bottomMm: 1000, widthMm: 800, heightMm: 1200 },
]);
const gableRoof = roofOver([gableRoom], gablePlanes, gableBounds, false);

type MeshVertex = Readonly<{ x: number; y: number; h: number }>;

const meshVertices = (walls: RealAllWalls): MeshVertex[] => {
  const vertices: MeshVertex[] = [];
  const p = walls.mesh.positions;
  for (let index = 0; index + 2 < p.length; index += 3)
    vertices.push({ x: p[index] ?? 0, y: p[index + 1] ?? 0, h: p[index + 2] ?? 0 });
  return vertices;
};

const maxHeightNear = (vertices: readonly MeshVertex[], point: Vec2): number =>
  Math.max(
    -Infinity,
    ...vertices.filter((vertex) => distance(vertex, point) < 0.5).map((vertex) => vertex.h),
  );

const capTriangles = (walls: RealAllWalls): number =>
  walls.mesh.groups
    .filter((group) => group.material.kind === "cap")
    .reduce((sum, group) => sum + group.count / 3, 0);

const gableScenario: Scenario = {
  name: "gable-roof",
  areas: [gableRoom],
  roofs: [gableRoof],
  checks: (walls, floor) => {
    const vertices = meshVertices(walls);
    const worstExcess = Math.max(...vertices.map((vertex) => vertex.h - gableEnvelope(vertex)));
    const ridge = maxHeightNear(vertices, { x: 0, y: -2200 });
    const eave = maxHeightNear(vertices, { x: -3200, y: -2200 });
    const contour = maxHeightNear(vertices, { x: 3000, y: 2000 });
    const uncut = buildRealAllWalls({ ...floor, roofs: [] }, resolveOpeningSize);
    const attached = buildRealAllWalls(
      { ...floor, roofs: [{ ...gableRoof, cutsWalls: false }] },
      resolveOpeningSize,
    );
    const uncutTop = Math.max(...meshVertices(uncut).map((vertex) => vertex.h));
    const attachedTop = Math.max(...meshVertices(attached).map((vertex) => vertex.h));
    const insideWindow = vertices.filter(
      (vertex) =>
        vertex.x > -2790 && vertex.x < -2010 && vertex.y < -1990 && vertex.y > -2210 && vertex.h > 1000.01,
    );
    const revealTop = maxHeightNear(vertices, { x: -2800, y: -2000 });
    const wallSideGroups = walls.mesh.groups.filter((group) => group.material.kind === "wallSide").length;
    const limit = floorRoofLimit(floor);
    const flagged = flagsAboveRoof(limit, [
      { id: "lamp-high", pointMm: { x: 0, y: 0 }, topMm: 2800 },
      { id: "lamp-ok", pointMm: { x: 0, y: 0 }, topMm: 2600 },
      { id: "shelf-eave", pointMm: { x: 2800, y: 0 }, topMm: 1700 },
      { id: "outside", pointMm: { x: 5000, y: 0 }, topMm: 9000 },
    ]);
    const above = itemsAboveRoof(floor, resolveOpeningSize);
    return [
      check(
        "gable: no vertex above the roof's underside",
        worstExcess <= 0.05,
        `max excess ${worstExcess.toFixed(3)} mm`,
      ),
      check("gable: ridge at 2700 mm (x = 0)", approx(ridge, 2700), `ridge ${ridge.toFixed(2)} mm`),
      check(
        "gable: eave at 1500 mm (outer face x = −3200)",
        approx(eave, 1500),
        `eave ${eave.toFixed(2)} mm`,
      ),
      check("gable: contour corner at 1575 mm", approx(contour, 1575), `corner ${contour.toFixed(2)} mm`),
      check(
        "gable: sloped caps in cap material",
        capTriangles(walls) > capTriangles(uncut),
        `${capTriangles(walls)} cap triangles vs ${capTriangles(uncut)} uncut`,
      ),
      check(
        "gable: wall-side material groups kept",
        wallSideGroups === 8,
        `${wallSideGroups} wall-side groups`,
      ),
      check(
        "gable: removing the roof restores 3000 mm walls",
        approx(uncutTop, 3000),
        `top ${uncutTop.toFixed(2)} mm`,
      ),
      check(
        "gable: a roof that does not cut walls is ignored",
        approx(attachedTop, 3000) && attached.mesh.indices.length === uncut.mesh.indices.length,
        `top ${attachedTop.toFixed(2)} mm, ${attached.mesh.indices.length / 3} vs ${uncut.mesh.indices.length / 3} triangles`,
      ),
      check(
        "gable: opening above the roof is clipped (no lintel)",
        insideWindow.length === 0,
        `${insideWindow.length} vertex/vertices above the sill inside the window`,
      ),
      check(
        "gable: window reveal trimmed to the roof (1650 mm)",
        approx(revealTop, 1650),
        `reveal top ${revealTop.toFixed(2)} mm`,
      ),
      check(
        "gable: roofUndersideAt (2325 mm at x = 1000; none outside the outline)",
        approx(roofUndersideAt(limit, { x: 1000, y: 0 }) ?? NaN, 2325) &&
          roofUndersideAt(limit, { x: 5000, y: 0 }) === null,
        `${String(roofUndersideAt(limit, { x: 1000, y: 0 }))} mm at x = 1000`,
      ),
      check(
        "gable: flagsAboveRoof (none outside the roof)",
        flagged.join(",") === "lamp-high,shelf-eave",
        `flagged ${flagged.join(",") || "none"}`,
      ),
      check(
        "gable: the window above the roof is an issue",
        above.includes("o_attic00001"),
        `above ${above.join(",") || "none"}`,
      ),
    ];
  },
};

// Walls rise to the roof: the same gable over 2000 mm walls. The gable ends (y = ±2000) rise to the ridge (2700), the
// eave walls (x = ±3000) are clipped to 1575 … 1500. A window in the risen gable above the authored top (centre x = 0,
// 1600–2400) fits and is no issue; one at x = −2000 (1200–2000, under 1800 mm there) is an issue, lowered to 1000 by
// the window limit; a 2000 mm door there is too tall for it.
const riseRoom = gableRoomOf(
  2000,
  [
    { id: "o_gable00001", distanceAlongWallMm: 3000, bottomMm: 1600, widthMm: 800, heightMm: 800 },
    { id: "o_gable00002", distanceAlongWallMm: 1000, bottomMm: 1200, widthMm: 800, heightMm: 800 },
  ],
  "Risen",
);
const gableRiseScenario: Scenario = {
  name: "gable-roof-rise",
  areas: [riseRoom],
  roofs: [roofOver([riseRoom], gablePlanes, gableBounds, true)],
  checks: (walls, floor) => {
    const vertices = meshVertices(walls);
    const worstExcess = Math.max(...vertices.map((vertex) => vertex.h - gableEnvelope(vertex)));
    const ridge = maxHeightNear(vertices, { x: 0, y: -2200 });
    const eave = maxHeightNear(vertices, { x: -3200, y: -2200 });
    const contour = maxHeightNear(vertices, { x: 3000, y: 2000 });
    const top = Math.max(...vertices.map((vertex) => vertex.h));
    const wall = wallId(riseRoom, "bottom");
    const limit = wallItemTopLimitMm(floor, riseRoom.id, wall, 1000, 800);
    const above = itemsAboveRoof(floor, resolveOpeningSize);
    const lowered = fitUnderRoof(1200, 800, limit);
    const tall = fitUnderRoof(0, 2000, limit);
    const noRise = buildRealAllWalls(
      { ...floor, roofs: (floor.roofs ?? []).map((roof) => ({ ...roof, wallsRise: false })) },
      resolveOpeningSize,
    );
    const noRiseTop = Math.max(...meshVertices(noRise).map((vertex) => vertex.h));
    return [
      check(
        "rise: no vertex above the underside",
        worstExcess <= 0.05,
        `max excess ${worstExcess.toFixed(3)} mm`,
      ),
      check(
        "rise: the gable wall rises to the ridge (2700 mm)",
        approx(ridge, 2700),
        `${ridge.toFixed(2)} mm`,
      ),
      check("rise: highest point is the ridge", approx(top, 2700), `${top.toFixed(2)} mm`),
      check("rise: wall clipped under the slope (eave 1500 mm)", approx(eave, 1500), `${eave.toFixed(2)} mm`),
      check("rise: contour corner at 1575 mm", approx(contour, 1575), `${contour.toFixed(2)} mm`),
      check(
        "rise: off, the walls keep their 2000 mm top (clipped only)",
        approx(noRiseTop, 2000),
        `${noRiseTop.toFixed(2)} mm`,
      ),
      check(
        "rise: the gable window above the authored top is cut and fits",
        walls.openings.some((prism) => prism.openingId === "o_gable00001") &&
          !walls.issues.some((issue) => "openingId" in issue && issue.openingId === "o_gable00001"),
        walls.issues.map((issue) => issue.kind).join(",") || "no issues",
      ),
      check(
        "rise: window limit at x = −2000 is 1800 mm",
        approx(limit ?? NaN, 1800, 0.5),
        `${String(limit)} mm`,
      ),
      check(
        "rise: issues: only the window above the roof",
        above.join(",") === "o_gable00002",
        above.join(",") || "none",
      ),
      check(
        "rise: placing snaps it down to 1000 mm; a 2000 mm door is refused",
        lowered.kind === "lowered" && lowered.bottomMm === 1000 && tall.kind === "tooTall",
        `${JSON.stringify(lowered)} ${tall.kind}`,
      ),
    ];
  },
};

// Per-piece regions: a shed roof over the west half only (x −3600…0), falling from 2700 at x = −3600 to 1350 at x = 0,
// over 3000 mm walls. As an infinite half-space it would cut the east walls to 150 mm at x = 3200; limited to its
// region it leaves them at 3000, and where its outline crosses the north and south walls (x = 0) the uncovered part
// shows a step face from 1350 up to 3000.
const shedPlane: Linear2 = { c: 2700 - 0.375 * 3600, ax: -0.375, ay: 0 };
const halfRoom = gableRoomOf(3000, [], "Half");
const halfRoofScenario: Scenario = {
  name: "half-roof-region",
  areas: [halfRoom],
  roofs: [roofOver([halfRoom], [shedPlane], { minX: -3600, minY: -2600, maxX: 0, maxY: 2600 }, false)],
  checks: (walls) => {
    const vertices = meshVertices(walls);
    const west = vertices.filter((vertex) => vertex.x < -0.5);
    const worstWest = Math.max(...west.map((vertex) => vertex.h - (shedPlane.c + shedPlane.ax * vertex.x)));
    const east = maxHeightNear(vertices, { x: 3200, y: -2200 });
    const step = vertices.filter(
      (vertex) => Math.abs(vertex.x) < 0.5 && vertex.y < -1999 && vertex.y > -2201,
    );
    const stepLow = step.some((vertex) => approx(vertex.h, 1350, 0.5));
    const stepHigh = step.some((vertex) => approx(vertex.h, 3000, 0.5));
    return [
      check("region: west walls under the shed", worstWest <= 0.05, `max excess ${worstWest.toFixed(3)} mm`),
      check("region: east walls outside the roof keep 3000 mm", approx(east, 3000), `${east.toFixed(2)} mm`),
      check(
        "region: a step face where the outline crosses the wall (1350 → 3000 mm)",
        stepLow && stepHigh,
        `${step.length} vertices at x = 0`,
      ),
    ];
  },
};

/** The roof-cut migration (v5 → v6) reproduces the cuts' wall heights; a floor with a roof just drops its cuts. */
const migrationChecks = (): Check[] => {
  const room = gableRoomOf(3000, []);
  const shell = createHouseDocument("h_migrate0001", "Migration");
  const roofed = createRoof(buildingFloor([room]), { defaultWallHeightMm: 2500 }, "Roof");
  if (roofed === null) throw new Error("no roof");
  const v5Roof = Object.fromEntries(
    Object.entries(roofed).filter(([key]) => key !== "cutsWalls" && key !== "wallsRise"),
  );
  const v5 = {
    ...shell,
    schemaVersion: 5,
    floors: [
      { ...buildingFloor([room]), name: "Cut", roofCuts: gableCuts },
      { ...buildingFloor([room]), name: "Roofed", roofCuts: gableCuts, roofs: [v5Roof] },
      {
        ...buildingFloor([room]),
        name: "Inactive",
        roofCuts: gableCuts.map((cut) => ({ ...cut, active: false })),
      },
    ],
  };
  const migrated = migrateHouseDocument(v5);
  const document: unknown = migrated.kind === "ok" ? migrated.document : undefined;
  if (!compileValidator(House)(document)) return [check("migration: a valid v6 house", false, migrated.kind)];
  const [cut, roofedFloor, inactive] = document.floors;
  const roof = cut?.roofs?.[0];
  const walls = cut === undefined ? null : buildRealAllWalls(cut, resolveOpeningSize);
  const vertices = walls === null ? [] : meshVertices(walls);
  const limit = cut === undefined ? null : floorRoofLimit(cut);
  // The underside equals the cuts' envelope everywhere over the walls (a 100 mm grid).
  let worstUnderside = 0;
  for (let x = -3200; x <= 3200; x += 100)
    for (let y = -2200; y <= 2200; y += 100) {
      const underside = roofUndersideAt(limit, { x, y }) ?? NaN;
      worstUnderside = Math.max(worstUnderside, Math.abs(underside - envelopeAt(gablePlanes, { x, y })));
    }
  const worstExcess = Math.max(...vertices.map((vertex) => vertex.h - gableEnvelope(vertex)));
  return [
    check("migration: a valid v6 house", true, `v${String(document.schemaVersion)}`),
    check(
      "migration: the cuts become one roof (Cuts walls, no rise), no roofCuts left",
      roof !== undefined &&
        roof.cutsWalls &&
        !roof.wallsRise &&
        !document.floors.some((floor) => "roofCuts" in floor),
      `${String(cut?.roofs?.length)} roof(s), ${String(roof?.points.length)} points, ${String(roof?.lines.length)} lines`,
    ),
    check(
      "migration: the underside is the cuts' envelope at every grid point",
      worstUnderside <= 0.05,
      `max difference ${worstUnderside.toFixed(4)} mm`,
    ),
    check(
      "migration: the same wall heights (ridge 2700, eave 1500, contour 1575, nothing above)",
      approx(maxHeightNear(vertices, { x: 0, y: -2200 }), 2700) &&
        approx(maxHeightNear(vertices, { x: -3200, y: -2200 }), 1500) &&
        approx(maxHeightNear(vertices, { x: 3000, y: 2000 }), 1575) &&
        worstExcess <= 0.05,
      `max excess ${worstExcess.toFixed(3)} mm`,
    ),
    check(
      "migration: a floor that has a roof drops its cuts and keeps its roof (mode filled)",
      roofedFloor?.roofs?.length === 1 &&
        roofedFloor.roofs[0]?.id === roofed.id &&
        roofedFloor.roofs[0].wallsRise,
      `${String(roofedFloor?.roofs?.length)} roof(s)`,
    ),
    check(
      "migration: inactive cuts are dropped (no roof)",
      inactive !== undefined && (inactive.roofs ?? []).length === 0,
      `${String(inactive?.roofs?.length)} roof(s)`,
    ),
  ];
};

// A stair (Phase 16.14) with Cut floor below, overlapping its room's right edge and the outward wall support.
const stairObject = (positionMm: Vec2, cutFloorBelow: boolean): AreableInstanceValue => ({
  id: nextId("o"),
  name: "Stairs",
  templateId: "staircase-straight",
  templateVersion: 1,
  parameters: { widthMm: 1000, depthMm: 2000, totalRiseMm: 2700 },
  flip: { x: false, z: false },
  materialOverrides: {},
  attachment: { host: "floor" },
  positionMm,
  elevationMm: 0,
  rotationDeg: 0,
  floorCut: "stair",
  cutFloorAbove: false,
  cutFloorBelow,
});
const stairRoomBase = rectangleArea("Room", 4000, 3000, { x: 0, y: 0 }, 0, allEdges(200));
const stairRoom: AreaValue = { ...stairRoomBase, objects: [stairObject({ x: 2000, y: 0 }, true)] };
const staircaseScenario: Scenario = {
  name: "stair-floor-cut",
  areas: [stairRoom],
  checks: (walls, floor) => {
    const cuts = floorCutsOf({ floors: [floor] }, floor.id);
    const room = buildRealFloors(floor, cuts).get(stairRoom.id);
    const roomRegion = room?.region ?? { polygons: [] };
    const expectedRoom = 4400 * 3400 - 700 * 2000;
    const switchedOff: AreaValue = { ...stairRoomBase, objects: [stairObject({ x: 2000, y: 0 }, false)] };
    const offFloor: BuildingFloorValue = { ...floor, areas: [switchedOff] };
    const offCuts = floorCutsOf({ floors: [offFloor] }, offFloor.id);
    return [
      check(
        "stair cut: room floor removed inside the footprint",
        !pointInRegion({ x: 1800, y: 0 }, roomRegion),
        "probe (1800, 0)",
      ),
      check(
        "stair cut: outward wall support does not refill it",
        !pointInRegion({ x: 2100, y: 0 }, roomRegion),
        "probe (2100, 0) under the room's right wall",
      ),
      check(
        "stair cut: support outside the footprint kept",
        pointInRegion({ x: 2100, y: 1300 }, roomRegion),
        "probe (2100, 1300)",
      ),
      check(
        "stair cut: room RealFloor area",
        approx(regionArea(roomRegion), expectedRoom, 1),
        `${regionArea(roomRegion).toFixed(0)} vs ${expectedRoom} mm²`,
      ),
      check(
        "stair cut: walls are not cut",
        walls.bands.some((band) => band.areaId === stairRoom.id),
        `${walls.bands.filter((band) => band.areaId === stairRoom.id).length} band(s)`,
      ),
      check(
        "stair cut: both switches off leave the floor whole",
        offCuts.region.polygons.length === 0 &&
          approx(
            regionArea(buildRealFloors(offFloor, offCuts).get(switchedOff.id)?.region ?? { polygons: [] }),
            4400 * 3400,
            1,
          ),
        "no cut",
      ),
      check(
        "stair cut: plain buildRealFloor (no house) has no hole",
        approx(regionArea(buildRealFloor(stairRoom).region), 4400 * 3400, 1),
        "standalone call",
      ),
    ];
  },
};

const scenarios: readonly Scenario[] = [
  touching200,
  touching200400,
  fullClash200,
  fullClash200400,
  fullClash400200,
  partial,
  rotatedTouching,
  rotatedFullClash,
  gap,
  pushedPast,
  lCorner,
  tJunction,
  windowScenario,
  doorScenario,
  sharedOpeningScenario,
  gableScenario,
  gableRiseScenario,
  halfRoofScenario,
  staircaseScenario,
];

// ---------------------------------------------------------------------------------------------
// Walls on circles (D20, Phase 3.5): arc length from the circle's local 0°.

const circleArea = (
  name: string,
  radiusMm: number,
  positionMm: Vec2,
  walls: readonly Readonly<{
    thicknessMm: number;
    alignment: WallAlignment;
    startMm?: number;
    endOffsetMm?: number;
  }>[],
): AreaValue => {
  const shapeId = nextId("s");
  return {
    id: nextId("a"),
    name,
    positionMm,
    rotationDeg: 0,
    floor: {
      id: nextId("fs"),
      material: defaultFlooring(),
      shapes: [{ id: shapeId, type: "circle", positionMm: { x: 0, y: 0 }, radiusMm }],
      carpets: [],
    },
    walls: walls.map((spec): WallValue => ({
      id: nextId("w"),
      sourceEdge: { shapeId, edge: "arc" },
      spanMm: {
        start: { anchor: "start", offsetMm: spec.startMm ?? 0 },
        end: { anchor: "end", offsetMm: spec.endOffsetMm ?? 0 },
      },
      heightMm: 2500,
      thicknessMm: spec.thicknessMm,
      alignment: spec.alignment,
      materials: { interior: defaultWallPaint(), exterior: defaultWallPaint() },
      objects: [],
    })),
    objects: [],
    lights: [],
  };
};

const arcScenario = (alignment: WallAlignment): Scenario => {
  const area = circleArea(`ring-${alignment}`, 2000, { x: 0, y: 0 }, [{ thicknessMm: 200, alignment }]);
  const offsets = { outside: [2000, 2200], inside: [1800, 2000], center: [1900, 2100] }[alignment];
  return {
    name: `arc-ring-${alignment}`,
    areas: [area],
    checks: (walls) => {
      const band = walls.bands.find((candidate) => candidate.areaId === area.id);
      const region = sliceAt(walls, 1000).footprint;
      const inner = offsets[0] ?? 0;
      const outer = offsets[1] ?? 0;
      const probes = [0, 37, 90, 133, 200, 271, 315].map((deg) => (deg * Math.PI) / 180);
      const inside = probes.every((angle) =>
        pointInRegion(
          { x: Math.cos(angle) * ((inner + outer) / 2), y: Math.sin(angle) * ((inner + outer) / 2) },
          region,
        ),
      );
      const outsideBand = probes.every(
        (angle) =>
          !pointInRegion({ x: Math.cos(angle) * (inner - 30), y: Math.sin(angle) * (inner - 30) }, region) &&
          !pointInRegion({ x: Math.cos(angle) * (outer + 30), y: Math.sin(angle) * (outer + 30) }, region),
      );
      return [
        check(
          `arc ${alignment}: wall built (no orphan)`,
          band !== undefined && walls.issues.length === 0,
          issueKinds(walls.issues),
        ),
        check(
          `arc ${alignment}: band follows the circle all the way round`,
          inside,
          `mid-radius ${(inner + outer) / 2} mm at 7 angles`,
        ),
        check(`arc ${alignment}: band faces at the aligned radii`, outsideBand, `${inner}..${outer} mm`),
      ];
    },
  };
};

// A gap: the ring trimmed back 1200 mm (arc length) from its end at local 0°.
const gapRing = circleArea("ring-gap", 2000, { x: 0, y: 0 }, [
  { thicknessMm: 200, alignment: "outside", endOffsetMm: 1200 },
]);
const arcGap: Scenario = {
  name: "arc-ring-trimmed-gap",
  areas: [gapRing],
  checks: (walls) => {
    const region = sliceAt(walls, 1000).footprint;
    const at = (arcMm: number): Vec2 => ({
      x: Math.cos(arcMm / 2000) * 2100,
      y: Math.sin(arcMm / 2000) * 2100,
    });
    const length = 2 * Math.PI * 2000;
    return [
      check(
        "arc gap: open just before 0°",
        !pointInRegion(at(length - 600), region),
        "probe 600 mm before 0°",
      ),
      check("arc gap: wall resumes after 0°", pointInRegion(at(300), region), "probe 300 mm after 0°"),
      check(
        "arc gap: wall before the gap",
        pointInRegion(at(length - 1300), region),
        "probe 1300 mm before 0°",
      ),
    ];
  },
};

// A circle room next to a straight-walled rectangle: the bands merge where they overlap.
const arcRoom = circleArea("round", 2000, { x: 0, y: 0 }, [{ thicknessMm: 200, alignment: "outside" }]);
const squareRoom = rectangleArea("square", 3000, 3000, { x: 2200 + 1500, y: 0 }, 0, [
  { edge: "left", thicknessMm: 200 },
  { edge: "top", thicknessMm: 200 },
]);
const arcMerge: Scenario = {
  name: "arc-meets-straight",
  areas: [arcRoom, squareRoom],
  checks: (walls) => {
    const region = sliceAt(walls, 1000).footprint;
    return [
      check(
        "arc + straight: both walls built",
        walls.bands.length >= 2,
        `${String(walls.bands.length)} bands`,
      ),
      check(
        "arc + straight: merged where they touch",
        pointInRegion({ x: 2100, y: 0 }, region) && pointInRegion({ x: 2050, y: 0 }, region),
        "probes at the shared band",
      ),
      check(
        "arc + straight: no slivers",
        sliverEdges(region) === 0,
        `${String(sliverEdges(region))} short edges`,
      ),
    ];
  },
};

// Resizing the circle keeps the ring closed (corner-attached ends, 3.0a).
const resizedRing = circleArea("ring-resized", 2600, { x: 0, y: 0 }, [
  { thicknessMm: 200, alignment: "outside" },
]);
const arcResized: Scenario = {
  name: "arc-ring-resized",
  areas: [resizedRing],
  checks: (walls) => {
    const region = sliceAt(walls, 1000).footprint;
    const closed = [0, 1, 2, 3, 4, 5].every((k) => {
      const angle = (k * Math.PI) / 3 + 0.01;
      return pointInRegion({ x: Math.cos(angle) * 2700, y: Math.sin(angle) * 2700 }, region);
    });
    return [check("arc resized: ring still closed at r = 2600", closed, "6 probes at mid-band")];
  },
};

// Corner joins on arcs (Phase 4.1): a circle bulging out of a rectangle's left side, all edges walled.
// Where the arc meets the straight wall both bands are mitred: the outer notch is filled and the arc's end
// does not poke into the room.
const bulgeArea = (
  name: string,
  alignment: WallAlignment,
  circles: readonly Readonly<{ center: Vec2; radiusMm: number }>[],
  rectangle: boolean,
): AreaValue => {
  const rectId = nextId("s");
  const circleIds = circles.map(() => nextId("s"));
  const wall = (shapeId: string, edge: string): WallValue => ({
    id: nextId("w"),
    sourceEdge: { shapeId, edge },
    spanMm: { start: { anchor: "start", offsetMm: 0 }, end: { anchor: "end", offsetMm: 0 } },
    heightMm: 2500,
    thicknessMm: 200,
    alignment,
    materials: { interior: defaultWallPaint(), exterior: defaultWallPaint() },
    objects: [],
  });
  return {
    id: nextId("a"),
    name,
    positionMm: { x: 0, y: 0 },
    rotationDeg: 0,
    floor: {
      id: nextId("fs"),
      material: defaultFlooring(),
      shapes: [
        ...(rectangle
          ? [
              {
                id: rectId,
                type: "rectangle" as const,
                positionMm: { x: 0, y: 0 },
                rotationDeg: 0,
                widthMm: 3000,
                heightMm: 3000,
              },
            ]
          : []),
        ...circles.map((circle, index) => ({
          id: circleIds[index] ?? "",
          type: "circle" as const,
          positionMm: circle.center,
          radiusMm: circle.radiusMm,
        })),
      ],
      carpets: [],
    },
    walls: [
      ...(rectangle ? (["left", "top", "right", "bottom"] as const).map((edge) => wall(rectId, edge)) : []),
      ...circleIds.map((id) => wall(id, "arc")),
    ],
    objects: [],
    lights: [],
  };
};

const bulgeCenter: Vec2 = { x: -1700, y: 0 };
const bulgeRadius = 1000;
/** The top corner where the circle leaves the rectangle's left side (x = −1500). */
const bulgeCorner: Vec2 = { x: -1500, y: bulgeCenter.y + Math.sqrt(bulgeRadius ** 2 - 200 ** 2) };
const bulgeCornerAngle = Math.atan2(bulgeCorner.y - bulgeCenter.y, bulgeCorner.x - bulgeCenter.x);

const arcJoinScenario = (alignment: WallAlignment): Scenario => {
  const area = bulgeArea(
    `bulge-${alignment}`,
    alignment,
    [{ center: bulgeCenter, radiusMm: bulgeRadius }],
    true,
  );
  const { interiorOffsetMm, exteriorOffsetMm } = {
    outside: { interiorOffsetMm: 0, exteriorOffsetMm: 200 },
    inside: { interiorOffsetMm: -200, exteriorOffsetMm: 0 },
    center: { interiorOffsetMm: -100, exteriorOffsetMm: 100 },
  }[alignment];
  return {
    name: `arc-join-${alignment}`,
    areas: [area],
    checks: (walls) => {
      const region = sliceAt(walls, 1000).footprint;
      // Outward bisector of the straight wall's normal (−x) and the arc's radial normal at the corner.
      const radial = { x: Math.cos(bulgeCornerAngle), y: Math.sin(bulgeCornerAngle) };
      const bisector = normalizeVec(addVec({ x: -1, y: 0 }, radial));
      const notch = addVec(bulgeCorner, scaleVec(bisector, exteriorOffsetMm - 30));
      // Just past the corner along the arc, in the band's radial range but on the room side of x = −1500.
      const pokeAngle = bulgeCornerAngle + (0.5 * Math.PI) / 180;
      const pokeRadius = bulgeRadius + (interiorOffsetMm + exteriorOffsetMm) / 2;
      const poke = {
        x: bulgeCenter.x + Math.cos(pokeAngle) * pokeRadius,
        y: bulgeCenter.y + Math.sin(pokeAngle) * pokeRadius,
      };
      const pokeInRoom = poke.x > -1500 + Math.max(0, -interiorOffsetMm) + 1;
      const joints = [bulgeCorner, { x: bulgeCorner.x, y: -bulgeCorner.y }];
      return [
        check(
          `arc join ${alignment}: outer notch filled`,
          pointInRegion(notch, region),
          `probe ${notch.x.toFixed(0)}, ${notch.y.toFixed(0)}`,
        ),
        check(
          `arc join ${alignment}: arc end does not poke into the room`,
          !pokeInRoom || !pointInRegion(poke, region),
          pokeInRoom
            ? `probe ${poke.x.toFixed(0)}, ${poke.y.toFixed(0)}`
            : "probe not on the room side (n/a)",
        ),
        check(
          `arc join ${alignment}: no slivers at the joints`,
          sliverEdgesNear(region, joints, jointRadiusMm) === 0,
          `${String(sliverEdgesNear(region, joints, jointRadiusMm))} short edges within ${String(jointRadiusMm)} mm`,
        ),
      ];
    },
  };
};

// Two overlapping circles in one room: arc meets arc.
const arcArcArea = bulgeArea(
  "two-circles",
  "outside",
  [
    { center: { x: 0, y: 0 }, radiusMm: 1500 },
    { center: { x: 2000, y: 0 }, radiusMm: 1500 },
  ],
  false,
);
const arcArc: Scenario = {
  name: "arc-join-arc",
  areas: [arcArcArea],
  checks: (walls) => {
    const region = sliceAt(walls, 1000).footprint;
    // The circles cross at x = 1000, y = ±√(1500² − 1000²); the outer notch lies above the top crossing.
    const crossing = { x: 1000, y: Math.sqrt(1500 ** 2 - 1000 ** 2) };
    const notch = { x: crossing.x, y: crossing.y + 120 };
    const inRoom = { x: crossing.x, y: crossing.y - 40 };
    const joints = [crossing, { x: crossing.x, y: -crossing.y }];
    return [
      check(
        "arc join arc: outer notch filled",
        pointInRegion(notch, region),
        `probe ${notch.x}, ${notch.y.toFixed(0)}`,
      ),
      check(
        "arc join arc: nothing pokes into the room",
        !pointInRegion(inRoom, region),
        `probe ${inRoom.x}, ${inRoom.y.toFixed(0)}`,
      ),
      check(
        "arc join arc: no slivers at the joints",
        sliverEdgesNear(region, joints, jointRadiusMm) === 0,
        `${String(sliverEdgesNear(region, joints, jointRadiusMm))} short edges within ${String(jointRadiusMm)} mm`,
      ),
    ];
  },
};

const arcScenarios: readonly Scenario[] = [
  arcJoinScenario("outside"),
  arcJoinScenario("center"),
  arcJoinScenario("inside"),
  arcArc,
  arcScenario("outside"),
  arcScenario("inside"),
  arcScenario("center"),
  arcGap,
  arcMerge,
  arcResized,
];

// ---------------------------------------------------------------------------------------------

// Splitting an open-plan floor must not create a wall or an ownership conflict at a butt seam.
const openPlanSplit: Scenario = {
  name: "open-plan-collinear-wall-split",
  areas: [
    rectangleArea("Open left", 2000, 2000, { x: -1000, y: 0 }, 0, [{ edge: "bottom", thicknessMm: 100 }]),
    rectangleArea("Open right", 2000, 2000, { x: 1000, y: 0 }, 0, [{ edge: "bottom", thicknessMm: 100 }]),
  ],
  checks: (walls) => {
    const region = sliceAt(walls, 1000).footprint;
    return [
      check(
        "open plan: collinear wall pieces have unambiguous owners",
        !walls.issues.some((issue) => issue.kind === "ambiguousOwnership"),
        `${walls.issues.length} geometry issue(s)`,
      ),
      check(
        "open plan: exterior wall stays continuous",
        pointInRegion({ x: 0, y: -1050 }, region) && Math.abs(regionArea(region) - 400000) < 1,
        `${regionArea(region)} mm²`,
      ),
      check(
        "open plan: no wall along the internal floor boundary",
        !pointInRegion({ x: 0, y: 0 }, region),
        "floor boundary at x = 0 stays open",
      ),
    ];
  },
};

const realOwnershipOverlap: Scenario = {
  name: "real-collinear-ownership-overlap",
  areas: [
    rectangleArea("Overlapping left", 2000, 2000, { x: 0, y: 0 }, 0, [{ edge: "bottom", thicknessMm: 100 }]),
    rectangleArea("Overlapping right", 2000, 2000, { x: 0, y: 0 }, 0, [{ edge: "bottom", thicknessMm: 100 }]),
  ],
  checks: (walls) => [
    check(
      "actual overlapping interior faces still report ambiguous ownership",
      walls.issues.some((issue) => issue.kind === "ambiguousOwnership"),
      `${walls.issues.length} geometry issue(s)`,
    ),
  ],
};

// ---------------------------------------------------------------------------------------------
// Wall reliefs (Phase 5.0, D21): boxes add a prism outside a face, niches cut one in, both from the visible
// face of the merged stack; their sides are faces owned by the host wall side and the relief.

const relief = (
  id: string,
  face: "interior" | "exterior",
  alongMm: number,
  depthMm: number,
): NonNullable<WallValue["reliefs"]>[number] => ({
  id,
  name: depthMm < 0 ? "Niche" : "Box",
  face,
  depthMm,
  material: defaultWallPaint(),
  shapes: [
    {
      id: `s_${id.slice(3)}`,
      type: "rectangle",
      positionMm: { x: alongMm + 300, y: 900 + 300 },
      rotationDeg: 0,
      widthMm: 600,
      heightMm: 600,
    },
  ],
});

/** The 4 × 3 m window room's bottom wall with reliefs (and optionally its window). */
const reliefRoom = (reliefs: NonNullable<WallValue["reliefs"]>, withWindow = false): AreaValue => {
  const room = rectangleArea("Room", 4000, 3000, { x: 0, y: 0 }, 0, [
    {
      edge: "bottom",
      thicknessMm: 200,
      openings: withWindow
        ? [{ id: nextId("o"), distanceAlongWallMm: 2000, bottomMm: 900, widthMm: 1200, heightMm: 1200 }]
        : [],
    },
    { edge: "right", thicknessMm: 200 },
    { edge: "top", thicknessMm: 200 },
    { edge: "left", thicknessMm: 200 },
  ]);
  return {
    ...room,
    walls: room.walls.map((wall) => (wall.sourceEdge.edge === "bottom" ? { ...wall, reliefs } : wall)),
  };
};

/** Wall depth crossed at x = 0 (through the bottom wall) at a height. */
const bottomWallDepthAt = (walls: RealAllWalls, heightMm: number): number =>
  lineCrossings(sliceAt(walls, heightMm).footprint, { x: 0, y: -3000 }, { x: 0, y: 1 })
    .filter((interval) => interval.fromMm < 1800)
    .reduce((sum, interval) => sum + interval.toMm - interval.fromMm, 0);

const boxScenario: Scenario = {
  name: "relief-box",
  areas: [reliefRoom([relief("wr_box0000001", "interior", 1700, 200)])],
  checks: (walls) => [
    check(
      "box: slices split at its bottom and top (0/900/1500)",
      walls.slices.map((slice) => slice.bottomMm).join(",") === "0,900,1500",
      walls.slices.map((slice) => `${slice.bottomMm}-${slice.topMm}`).join(" "),
    ),
    check(
      "box: wall 200 mm below it",
      approx(bottomWallDepthAt(walls, 500), 200),
      `${bottomWallDepthAt(walls, 500).toFixed(1)} mm`,
    ),
    check(
      "box: 400 mm through the box",
      approx(bottomWallDepthAt(walls, 1200), 400, 0.6),
      `${bottomWallDepthAt(walls, 1200).toFixed(1)} mm`,
    ),
    check(
      "box: its sides are owned by the wall's interior and the relief",
      sliceAt(walls, 1200).edges.filter((edge) => edge.owner?.reliefId === "wr_box0000001").length >= 3,
      `${sliceAt(walls, 1200).edges.filter((edge) => edge.owner?.reliefId === "wr_box0000001").length} edge(s)`,
    ),
    check(
      "box: its own material group",
      walls.mesh.groups.some(
        (group) => group.material.kind === "wallSide" && group.material.reliefId === "wr_box0000001",
      ),
      `${walls.mesh.groups.length} groups`,
    ),
    check("box: no issues", walls.issues.length === 0, `${walls.issues.length} issue(s)`),
  ],
};

const nicheScenario: Scenario = {
  name: "relief-niche",
  areas: [reliefRoom([relief("wr_niche000001", "interior", 1700, -150)])],
  checks: (walls) => [
    check(
      "niche: 50 mm of wall left behind it",
      approx(bottomWallDepthAt(walls, 1200), 50, 0.6),
      `${bottomWallDepthAt(walls, 1200).toFixed(1)} mm`,
    ),
    check(
      "niche: back and sides owned by the relief",
      sliceAt(walls, 1200).edges.filter((edge) => edge.owner?.reliefId === "wr_niche000001").length >= 3,
      `${sliceAt(walls, 1200).edges.filter((edge) => edge.owner?.reliefId === "wr_niche000001").length} edge(s)`,
    ),
    check(
      "niche: full wall above it",
      approx(bottomWallDepthAt(walls, 2000), 200),
      `${bottomWallDepthAt(walls, 2000).toFixed(1)} mm`,
    ),
  ],
};

const windowThroughBoxScenario: Scenario = {
  name: "relief-window-through-box",
  areas: [reliefRoom([relief("wr_box0000002", "interior", 1700, 200)], true)],
  checks: (walls) => [
    check(
      "window through box: the window still cuts through",
      approx(bottomWallDepthAt(walls, 1200), 0),
      `${bottomWallDepthAt(walls, 1200).toFixed(1)} mm`,
    ),
  ],
};

const tooDeepScenario: Scenario = {
  name: "relief-niche-too-deep",
  areas: [reliefRoom([relief("wr_niche000002", "exterior", 1700, -195)])],
  checks: (walls) => [
    check(
      "too deep: flagged",
      walls.issues.some((issue) => issue.kind === "reliefTooDeep" && issue.reliefId === "wr_niche000002"),
      walls.issues.map((issue) => issue.kind).join(","),
    ),
    check(
      "too deep: 20 mm left behind it",
      approx(bottomWallDepthAt(walls, 1200), 20, 0.6),
      `${bottomWallDepthAt(walls, 1200).toFixed(1)} mm`,
    ),
  ],
};

// A niche on a Full-clash shared wall is cut from the visible face of the merged stack, into both bands.
const sharedNicheSetup = pair(200, 200, "fullClash");
const sharedNicheA: AreaValue = {
  ...sharedNicheSetup.roomA,
  walls: sharedNicheSetup.roomA.walls.map((wall) =>
    wall.sourceEdge.edge === "right"
      ? { ...wall, reliefs: [relief("wr_niche000003", "interior", 1000, -100)] }
      : wall,
  ),
};
const sharedNicheScenario: Scenario = {
  name: "relief-niche-shared-wall",
  areas: [sharedNicheA, sharedNicheSetup.roomB],
  checks: (walls) => {
    const owned = sliceAt(walls, 1200).edges.filter(
      (edge) => edge.owner?.reliefId === "wr_niche000003",
    ).length;
    return [
      check("shared niche: cut from the visible face", owned >= 3, `${owned} edge(s)`),
      check(
        "shared niche: no ownership conflicts",
        !walls.issues.some((issue) => issue.kind === "ambiguousOwnership"),
        walls.issues.map((issue) => issue.kind).join(",") || "none",
      ),
    ];
  },
};

/** One wall feature of two shapes (a rectangle topped by a circle) is one arch: one outline, one material group. */
const archFeature = (): NonNullable<WallValue["reliefs"]>[number] => ({
  id: "wr_arch0000001",
  name: "Arch",
  face: "interior",
  depthMm: 100,
  material: defaultWallPaint(),
  shapes: [
    {
      id: "s_arch0000001",
      type: "rectangle",
      positionMm: { x: 2000, y: 450 },
      rotationDeg: 0,
      widthMm: 600,
      heightMm: 900,
    },
    { id: "s_arch0000002", type: "circle", positionMm: { x: 2000, y: 900 }, radiusMm: 300 },
  ],
});

const archScenario: Scenario = {
  name: "relief-group-arch",
  areas: [reliefRoom([archFeature()])],
  checks: (walls) => [
    check("arch: no geometry issues", walls.issues.length === 0, `${walls.issues.length} issue(s)`),
    check(
      "arch: 300 mm through its rectangular body",
      approx(bottomWallDepthAt(walls, 400), 300, 0.6),
      `${bottomWallDepthAt(walls, 400).toFixed(1)} mm`,
    ),
    check(
      "arch: 300 mm through the circle above the body",
      approx(bottomWallDepthAt(walls, 1100), 300, 0.6),
      `${bottomWallDepthAt(walls, 1100).toFixed(1)} mm`,
    ),
    check(
      "arch: bare wall above the circle",
      approx(bottomWallDepthAt(walls, 1300), 200),
      `${bottomWallDepthAt(walls, 1300).toFixed(1)} mm`,
    ),
    check(
      "arch: one material group for the whole feature",
      walls.mesh.groups.filter(
        (group) => group.material.kind === "wallSide" && group.material.reliefId === "wr_arch0000001",
      ).length === 1,
      `${walls.mesh.groups.length} groups`,
    ),
  ],
};

const reliefScenarios: readonly Scenario[] = [
  archScenario,
  boxScenario,
  nicheScenario,
  windowThroughBoxScenario,
  tooDeepScenario,
  sharedNicheScenario,
];

// ---------------------------------------------------------------------------------------------
// Phase 19.5 (roof gaps): a wall's own Rise to roof, the wall face's risen shape, wall-mounted objects and lights
// limited by the roof, and wall faces where a step line crosses the walls.

const roofGapChecks = (): Check[] => {
  const room = gableRoomOf(2000, [], "Gaps");
  const roof = roofOver([room], gablePlanes, gableBounds, true);
  const south = wallId(room, "bottom");
  const north = wallId(room, "top");
  const optedOut: AreaValue = {
    ...room,
    walls: room.walls.map((wall) => (wall.id === north ? { ...wall, riseToRoof: false } : wall)),
  };
  const floor = buildingFloor([optedOut], [roof]);
  const walls = buildRealAllWalls(floor, resolveOpeningSize);
  const vertices = meshVertices(walls);
  const southRidge = maxHeightNear(vertices, { x: 0, y: -2200 });
  const northRidge = maxHeightNear(vertices, { x: 0, y: 2200 });
  const worstExcess = Math.max(...vertices.map((vertex) => vertex.h - gableEnvelope(vertex)));
  const southProfile = wallFaceTopProfile(floor, room.id, south, "interior") ?? [];
  const northProfile = wallFaceTopProfile(floor, room.id, north, "interior") ?? [];
  const peak = (profile: readonly { topMm: number }[]): number =>
    Math.max(...profile.map((point) => point.topMm));
  const shelfLimit = wallItemTopLimitMm(floor, room.id, south, 1000, 800, ["interior"]);
  const lantern = {
    ...createLight("Lantern", { x: -2000, y: -1900 }),
    mount: "wall" as const,
    wallId: south,
    wallSide: "interior" as const,
    elevationMm: 2000,
  };
  const lit: AreaValue = { ...optedOut, lights: [lantern] };
  const litFloor = buildingFloor([lit], [roof]);
  const lanternLimit = lightTopLimitMm(litFloor, lit, lantern);
  const flagged = itemsAboveRoof(litFloor, resolveOpeningSize);

  // A step line across a flat roof at x = 0, the east side raised 500 mm, eave 2000 mm, over 3000 mm walls: the
  // north and south walls are cut to 2000 (west) and, east, 2500 at the step falling back to the eave (the raised side
  // keeps its far points' heights), with a vertical face at x = 0 between 2000 and 2500.
  const stepRoom = gableRoomOf(3000, [], "Step");
  const base = createRoof(buildingFloor([stepRoom]), { defaultWallHeightMm: 2500 }, "Roof");
  if (base === null) throw new Error("no roof");
  const corners: readonly Vec2[] = [
    { x: -3600, y: -2600 },
    { x: 0, y: -2600 },
    { x: 3600, y: -2600 },
    { x: 3600, y: 2600 },
    { x: 0, y: 2600 },
    { x: -3600, y: 2600 },
  ];
  const points = corners.map((corner) => ({ id: nextId("rp"), x: corner.x, y: corner.y, heightMm: 0 }));
  const stepRoof: RoofValue = {
    ...base,
    eaveHeightMm: 2000,
    cutsWalls: true,
    wallsRise: false,
    points,
    outline: points.map((point) => point.id),
    lines: [
      {
        id: nextId("rl"),
        a: points[1]?.id ?? "",
        b: points[4]?.id ?? "",
        kind: "step",
        stepMm: 500,
        raisedSide: "right",
        stepFace: "side",
      },
    ],
  };
  const stepFloor = buildingFloor([stepRoom], [stepRoof]);
  const stepWalls = buildRealAllWalls(stepFloor, resolveOpeningSize);
  const slice = sliceAt(stepWalls, 2200);
  const faces = stepFaces(slice.footprint, stepWalls.roofLimit, slice.bottomMm, slice.topMm).filter(
    (face) => Math.abs(face.start.x) < 1 && Math.abs(face.end.x) < 1,
  );
  const spans = faces.flatMap((face) => face.spans);
  const stepVertices = meshVertices(stepWalls);
  const stepTop = (x: number): number => maxHeightNear(stepVertices, { x, y: -2200 });
  return [
    check(
      "rise to roof: the south gable rises to the ridge, the opted-out north one keeps 2000 mm",
      approx(southRidge, 2700) && approx(northRidge, 2000),
      `south ${southRidge.toFixed(1)}, north ${northRidge.toFixed(1)} mm`,
    ),
    check(
      "rise to roof: nothing above the underside (the opted-out wall is still clipped)",
      worstExcess <= 0.05,
      `max excess ${worstExcess.toFixed(3)} mm`,
    ),
    check(
      "face view: the south face's top is the risen gable (ridge 2700, ends 1575); the north one stays 2000",
      approx(peak(southProfile), 2700, 0.5) &&
        approx(southProfile[0]?.topMm ?? NaN, 1575, 0.5) &&
        approx(southProfile[southProfile.length - 1]?.topMm ?? NaN, 1575, 0.5) &&
        approx(peak(northProfile), 2000, 0.5),
      `south ${peak(southProfile).toFixed(1)}, north ${peak(northProfile).toFixed(1)} mm`,
    ),
    check(
      "wall object: its limit on its own face (x = −2400…−1600: 1800 mm)",
      approx(shelfLimit ?? NaN, 1800, 0.5),
      `${String(shelfLimit)} mm`,
    ),
    check(
      "wall light: limited on its face (x = −2000: 1950 mm); at 2000 mm it is an issue",
      approx(lanternLimit ?? NaN, 1950, 0.5) && flagged.includes(lantern.id),
      `${String(lanternLimit)} mm; flagged ${flagged.join(",") || "none"}`,
    ),
    check(
      "step line: the walls cut to 2000 (west), 2500 at the step falling to its eave (east, a sawtooth)",
      approx(stepTop(-3200), 2000, 0.5) &&
        approx(stepTop(0), 2500, 0.5) &&
        approx(stepTop(3200), 2500 - (500 * 3200) / 3600, 0.5),
      `${stepTop(-3200).toFixed(1)} / ${stepTop(0).toFixed(1)} / ${stepTop(3200).toFixed(1)} mm`,
    ),
    check(
      "step line: a vertical wall face at the step from 2000 to 2500 mm (north and south walls)",
      faces.length >= 2 &&
        spans.every(
          (span) =>
            approx(span.low0, 2000, 0.5) &&
            approx(span.low1, 2000, 0.5) &&
            approx(span.high0, 2500, 0.5) &&
            approx(span.high1, 2500, 0.5),
        ),
      `${String(faces.length)} faces`,
    ),
  ];
};

let failures = 0;
for (const scenario of [
  ...scenarios,
  ...arcScenarios,
  openPlanSplit,
  realOwnershipOverlap,
  ...reliefScenarios,
]) {
  const floor = buildingFloor(scenario.areas, scenario.roofs);
  const walls = buildRealAllWalls(floor, resolveOpeningSize);
  const file = writeSvg(scenario.name, scenario.areas, walls);
  const elevation = walls.roofLimit !== null ? `, ${writeElevationSvg(scenario.name, walls)}` : "";
  console.log(`\n${scenario.name}  →  ${file}${elevation}`);
  for (const result of scenario.checks(walls, floor)) {
    if (!result.pass) failures += 1;
    console.log(`  ${result.pass ? "PASS" : "FAIL"}  ${result.label}  (${result.detail})`);
  }
}
console.log("\nroof-cut-migration");
for (const result of migrationChecks()) {
  if (!result.pass) failures += 1;
  console.log(`  ${result.pass ? "PASS" : "FAIL"}  ${result.label}  (${result.detail})`);
}
console.log("\nroof-gaps (19.5)");
for (const result of roofGapChecks()) {
  if (!result.pass) failures += 1;
  console.log(`  ${result.pass ? "PASS" : "FAIL"}  ${result.label}  (${result.detail})`);
}
console.log(failures === 0 ? "\nAll checks PASS" : `\n${failures} check(s) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
