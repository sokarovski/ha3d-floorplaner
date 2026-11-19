// Migration v4 → v5 (Phase 16.14, spec/builder/features/staircase-areas.md#migration-of-staircase-areas): staircase
// areas become stair objects and floor openings, and areas lose `kind` and `staircase`.
// - The opening's box is its floor-shape bounds in the area frame: the stair's width is the short side (at most
//   2000 mm), its run the long side, its heading the old fit's climb (Run, else the nearer of the two directions to
//   the old rotation); side-by-side Up and down uses the up lane (half the short side, on the climber's right).
// - Up / Up and down: a stair object (the instance's ID, template, version and parameters, Cut floor above on).
// - Down / the down part of Up and down / an opening without a stair: dropped when a migrated stair on another floor
//   crosses this floor's slab band and covers at least half the opening; otherwise a floor opening of the box.
// - Host: the staircase area itself when it holds walls, objects, lights or carpets (it stays an ordinary room), else
//   the other area overlapping the opening most, else the nearest one; with no other area it stays as a room.
// IDs are deterministic (a floor opening is `o_` + the area ID's suffix) so repeated loads give the same document.
import { applyAffine, invertAffine, placementAffine } from "../../geometry/affine";
import type { Affine2 } from "../../geometry/affine";
import { floorShapeUnionOf } from "../../geometry/areaGeometry";
import { intersectRegions } from "../../geometry/polygonKernel";
import type { Region } from "../../geometry/region";
import { regionArea, regionBounds, transformRegion } from "../../geometry/region";
import type { Vec2 } from "../../geometry/vector";
import { Shape } from "../schemas/shapes";
import type { ShapeValue } from "../schemas/shapes";
import { compileValidator } from "../validation/ajv";

type JsonObject = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const num = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const vec = (value: unknown): Vec2 =>
  isObject(value) ? { x: num(value.x), y: num(value.y) } : { x: 0, y: 0 };

const str = (value: unknown, fallback: string): string => (typeof value === "string" ? value : fallback);

/** Built-in stair width limit (the old fit clamped the width to the template maximum). */
const maxStairWidthMm = 2000;
/** The rise assumed for an instance without one (the built-ins' default). */
const defaultRiseMm = 2700;
/** Default slab thickness of a floor without one (Phase 16.2). */
const defaultSlabMm = 200;
/** Share of a down opening a stair below must cover to replace it. */
const coverShare = 0.5;
const toleranceMm = 1;

/** Heading front (0° faces −y, counterclockwise), as the renderer's placement. */
const front = (degrees: number): Vec2 => {
  const radians = (degrees * Math.PI) / 180;
  return { x: Math.sin(radians), y: -Math.cos(radians) };
};

const normalizeDeg = (degrees: number): number => {
  const value = ((degrees % 360) + 360) % 360;
  return Math.round(value * 1000) / 1000;
};

const round = (value: number): number => Math.round(value * 10) / 10;

type StairPlan = Readonly<{
  /** Centre in the staircase area's frame, heading relative to it, and the plan size (width × run). */
  center: Vec2;
  headingDeg: number;
  widthMm: number;
  depthMm: number;
}>;

type Converted = {
  floorIndex: number;
  areaIndex: number;
  area: JsonObject;
  areaAffine: Affine2;
  /** Opening in the floor frame. */
  opening: Region;
  openingArea: number;
  box: Readonly<{ center: Vec2; sizeX: number; sizeY: number }>;
  instance: JsonObject | null;
  up: StairPlan | null;
  needsHole: boolean;
};

const isShape = compileValidator(Shape);

const shapesOf = (area: JsonObject): readonly ShapeValue[] =>
  isObject(area.floor) ? list(area.floor.shapes).filter((shape): shape is ShapeValue => isShape(shape)) : [];

const areaAffineOf = (area: JsonObject): Affine2 =>
  placementAffine(vec(area.positionMm), num(area.rotationDeg));

const floorRegionOf = (area: JsonObject): Region => {
  const shapes = shapesOf(area);
  return shapes.length === 0
    ? { polygons: [] }
    : transformRegion(floorShapeUnionOf(shapes).region, areaAffineOf(area));
};

/** The old fit (Phase 3–5.2): which way the up flight climbs along the box's long side, and its lane. */
const upPlan = (instance: JsonObject, box: Converted["box"]): StairPlan => {
  const runAlongX = box.sizeX >= box.sizeY;
  const shortSide = runAlongX ? box.sizeY : box.sizeX;
  const lanes = instance.direction === "both" && instance.layout === "sideBySide";
  const candidates = runAlongX ? [90, 270] : [180, 0];
  const wanted = front(num(instance.rotationDeg));
  const nearer = candidates.reduce((best, candidate) => {
    const a = front(candidate);
    const b = front(best);
    return a.x * wanted.x + a.y * wanted.y > b.x * wanted.x + b.y * wanted.y ? candidate : best;
  });
  const headingDeg =
    instance.run === "leftToRight"
      ? (candidates[0] ?? 90)
      : instance.run === "rightToLeft"
        ? (candidates[1] ?? 270)
        : nearer;
  const climb = front(headingDeg);
  const right = { x: climb.y, y: -climb.x };
  const center = lanes
    ? { x: box.center.x + right.x * (shortSide / 4), y: box.center.y + right.y * (shortSide / 4) }
    : box.center;
  return {
    center,
    headingDeg,
    widthMm: Math.min(lanes ? shortSide / 2 : shortSide, maxStairWidthMm),
    depthMm: runAlongX ? box.sizeX : box.sizeY,
  };
};

const convert = (area: JsonObject, floorIndex: number, areaIndex: number): Converted | null => {
  const shapes = shapesOf(area);
  if (shapes.length === 0) return null;
  const local = floorShapeUnionOf(shapes).region;
  if (local.polygons.length === 0) return null;
  const bounds = regionBounds(local);
  const box = {
    center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
    sizeX: bounds.maxX - bounds.minX,
    sizeY: bounds.maxY - bounds.minY,
  };
  const areaAffine = areaAffineOf(area);
  const opening = transformRegion(local, areaAffine);
  const instance = isObject(area.staircase) ? area.staircase : null;
  const direction = instance === null ? null : str(instance.direction, "up");
  return {
    floorIndex,
    areaIndex,
    area,
    areaAffine,
    opening,
    openingArea: regionArea(opening),
    box,
    instance,
    up: instance !== null && direction !== "down" ? upPlan(instance, box) : null,
    needsHole: direction === null || direction === "down" || direction === "both",
  };
};

type FloorInfo = Readonly<{ offset: Vec2; elevationMm: number; slabMm: number }>;

const floorInfo = (floor: JsonObject): FloorInfo => ({
  offset: vec(floor.positionMm),
  elevationMm: num(floor.elevationMm),
  slabMm: Math.max(0, num(floor.slabThicknessMm, defaultSlabMm)),
});

/** The up stair's footprint in the house frame and its height span. */
const stairInHouse = (
  item: Converted,
  info: FloorInfo,
): Readonly<{ footprint: Region; bottomMm: number; topMm: number }> | null => {
  if (item.up === null || item.instance === null) return null;
  const { center, headingDeg, widthMm, depthMm } = item.up;
  const local = placementAffine(center, headingDeg);
  const ring = [
    { x: -widthMm / 2, y: -depthMm / 2 },
    { x: widthMm / 2, y: -depthMm / 2 },
    { x: widthMm / 2, y: depthMm / 2 },
    { x: -widthMm / 2, y: depthMm / 2 },
  ].map((point) => {
    const floorPoint = applyAffine(item.areaAffine, applyAffine(local, point));
    return { x: floorPoint.x + info.offset.x, y: floorPoint.y + info.offset.y };
  });
  const parameters = isObject(item.instance.parameters) ? item.instance.parameters : {};
  const rise = num(parameters.totalRiseMm, defaultRiseMm);
  return {
    footprint: { polygons: [{ outer: ring, holes: [] }] },
    bottomMm: info.elevationMm,
    topMm: info.elevationMm + rise,
  };
};

const translated = (region: Region, offset: Vec2): Region =>
  transformRegion(region, { a: 1, b: 0, c: 0, d: 1, tx: offset.x, ty: offset.y });

const hasContent = (area: JsonObject): boolean =>
  list(area.walls).length > 0 ||
  list(area.objects).length > 0 ||
  list(area.lights).length > 0 ||
  (isObject(area.floor) && list(area.floor.carpets).length > 0);

const plainArea = (area: JsonObject): JsonObject => {
  const { kind: _kind, staircase: _staircase, ...rest } = area;
  return rest;
};

/** Floor point and floor-frame heading → the host's frame. */
const inHost = (
  host: JsonObject,
  floorPoint: Vec2,
  floorHeadingDeg: number,
): Readonly<{ positionMm: Vec2; rotationDeg: number }> => {
  const point = applyAffine(invertAffine(areaAffineOf(host)), floorPoint);
  return {
    positionMm: { x: round(point.x), y: round(point.y) },
    rotationDeg: normalizeDeg(floorHeadingDeg - num(host.rotationDeg)),
  };
};

const suffixOf = (id: string): string => id.replace(/^[a-z]+_/, "");

/** The new objects of one staircase area, placed in `host`. */
const newObjects = (item: Converted, host: JsonObject, coveredBelow: boolean): JsonObject[] => {
  const areaRotation = num(item.area.rotationDeg);
  const hidden = item.area.hidden === true ? { hidden: true } : {};
  const objects: JsonObject[] = [];
  if (item.up !== null && item.instance !== null) {
    const parameters = isObject(item.instance.parameters) ? item.instance.parameters : {};
    const templateId = str(item.instance.templateId, "staircase-straight");
    const placed = inHost(
      host,
      applyAffine(item.areaAffine, item.up.center),
      areaRotation + item.up.headingDeg,
    );
    objects.push({
      id: str(item.instance.id, `st_${suffixOf(str(item.area.id, "a_stairs0000"))}`),
      name: str(item.area.name, "Staircase"),
      templateId,
      templateVersion: num(item.instance.templateVersion, 1),
      parameters: {
        ...parameters,
        ...(templateId === "staircase-l" ? { flightWidthMm: num(parameters.widthMm, 900) } : {}),
        widthMm: round(item.up.widthMm),
        depthMm: round(item.up.depthMm),
      },
      flip: { x: false, z: false },
      materialOverrides: {},
      attachment: { host: "floor" },
      ...placed,
      elevationMm: 0,
      floorCut: "stair",
      cutFloorAbove: true,
      cutFloorBelow: false,
      ...hidden,
    });
  }
  if (item.needsHole && !coveredBelow) {
    const placed = inHost(host, applyAffine(item.areaAffine, item.box.center), areaRotation);
    objects.push({
      id: `o_${suffixOf(str(item.area.id, "a_hole000000"))}`,
      name: `${str(item.area.name, "Staircase")} opening`,
      templateId: "floor-opening",
      templateVersion: 1,
      parameters: { widthMm: round(item.box.sizeX), depthMm: round(item.box.sizeY) },
      flip: { x: false, z: false },
      materialOverrides: {},
      attachment: { host: "floor" },
      ...placed,
      elevationMm: 0,
      floorCut: "opening",
      ...hidden,
    });
  }
  return objects;
};

/** The host of a staircase area's objects: itself (kept as a room) or another area's index. */
const hostIndex = (item: Converted, areas: readonly unknown[]): number => {
  if (hasContent(item.area)) return item.areaIndex;
  let best = -1;
  let bestOverlap = 0;
  let nearest = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const centre = applyAffine(item.areaAffine, item.box.center);
  areas.forEach((candidate, index) => {
    if (index === item.areaIndex || !isObject(candidate) || candidate.kind === "staircase") return;
    const region = floorRegionOf(candidate);
    if (region.polygons.length === 0) return;
    const overlap = regionArea(intersectRegions(region, item.opening));
    if (overlap > bestOverlap + toleranceMm) {
      best = index;
      bestOverlap = overlap;
    }
    const bounds = regionBounds(region);
    const distance = Math.hypot(
      (bounds.minX + bounds.maxX) / 2 - centre.x,
      (bounds.minY + bounds.maxY) / 2 - centre.y,
    );
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  return best >= 0 ? best : nearest >= 0 ? nearest : item.areaIndex;
};

export const migrateStairsV4 = (document: JsonObject): JsonObject => {
  const floors = list(document.floors);
  const infos = floors.map((floor) => (isObject(floor) ? floorInfo(floor) : null));
  const converted: Converted[] = [];
  floors.forEach((floor, floorIndex) => {
    if (!isObject(floor)) return;
    list(floor.areas).forEach((area, areaIndex) => {
      if (!isObject(area) || area.kind !== "staircase") return;
      const item = convert(area, floorIndex, areaIndex);
      if (item !== null) converted.push(item);
    });
  });
  const stairs = converted.flatMap((item) => {
    const info = infos[item.floorIndex];
    const stair = info === null || info === undefined ? null : stairInHouse(item, info);
    return stair === null ? [] : [{ floorIndex: item.floorIndex, ...stair }];
  });
  /** A down opening is replaced by a migrated stair of another floor that crosses this floor's band and covers it. */
  const coveredBelow = (item: Converted): boolean => {
    const info = infos[item.floorIndex];
    if (info === null || info === undefined || item.openingArea <= 0) return false;
    const opening = translated(item.opening, info.offset);
    const bandBottom = info.elevationMm - info.slabMm;
    return stairs.some(
      (stair) =>
        stair.floorIndex !== item.floorIndex &&
        stair.bottomMm < info.elevationMm - toleranceMm &&
        stair.topMm >= bandBottom - toleranceMm &&
        regionArea(intersectRegions(stair.footprint, opening)) >= coverShare * item.openingArea,
    );
  };
  return {
    ...document,
    floors: floors.map((floor, floorIndex) => {
      if (!isObject(floor)) return floor;
      const areas = list(floor.areas);
      const added = new Map<number, JsonObject[]>();
      const kept = new Set<number>();
      const removed = new Set<number>();
      for (const item of converted.filter((candidate) => candidate.floorIndex === floorIndex)) {
        const host = hostIndex(item, areas);
        const hostArea = areas[host];
        if (!isObject(hostArea)) continue;
        added.set(host, [...(added.get(host) ?? []), ...newObjects(item, hostArea, coveredBelow(item))]);
        if (host === item.areaIndex) kept.add(item.areaIndex);
        else removed.add(item.areaIndex);
      }
      // A staircase area without a usable footprint goes too, unless it holds something.
      areas.forEach((area, index) => {
        if (isObject(area) && area.kind === "staircase" && !kept.has(index) && !hasContent(area))
          if (!converted.some((item) => item.floorIndex === floorIndex && item.areaIndex === index))
            removed.add(index);
      });
      return {
        ...floor,
        areas: areas.flatMap((area, index) => {
          if (!isObject(area)) return [area];
          if (removed.has(index) && !added.has(index)) return [];
          const extra = added.get(index) ?? [];
          const plain = plainArea(area);
          return [extra.length === 0 ? plain : { ...plain, objects: [...list(area.objects), ...extra] }];
        }),
      };
    }),
  };
};
