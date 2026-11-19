// The open roof as the shape tools and the inference engine see it (Phase 19.1, spec/builder/features/roofs.md#the-roof-editing-level).
// Inside a roof's editing level, Rectangle, Circle and Polygon draw a new outline: they run on a virtual area whose
// floor shape is the roof's outline (floor frame, unrotated), and their commit replaces the outline
// (commitNewShape). The roof tools snap through one inference scene: the floor's own (walls, room shapes, guides)
// plus the roof's points as endpoints and its outline and break lines as edges.
import { defaultFlooring } from "@shared/domain/house/defaults";
import { roofsOf } from "@shared/domain/house/roofs";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { RoofValue } from "@shared/domain/schemas/roof";
import { roofSurface } from "@shared/geometry/roofSurface";
import type { InferenceScene, SceneSegment } from "../inference/inferenceTypes";
import { inferenceSceneOf, sceneSegment } from "../inference/inferenceScene";
import type { UiState } from "../stores/uiStore";

export type OpenRoof = Readonly<{ floor: BuildingFloorValue; roof: RoofValue }>;

/** The roof open in its editing level, with its floor. */
export const openRoofOf = (
  house: HouseDocument,
  ui: Pick<UiState, "activeFloorId" | "focusRoofId">,
): OpenRoof | undefined => {
  if (ui.focusRoofId === undefined) return undefined;
  const floor = house.floors.find((candidate) => candidate.id === ui.activeFloorId);
  const roof =
    floor === undefined ? undefined : roofsOf(floor).find((candidate) => candidate.id === ui.focusRoofId);
  return floor === undefined || roof === undefined ? undefined : { floor, roof };
};

const areaCache = new WeakMap<RoofValue, AreaValue>();

/** The roof as a virtual area for the shape tools: one polygon, the outline, in the floor frame. */
export const roofAsArea = (roof: RoofValue): AreaValue => {
  const cached = areaCache.get(roof);
  if (cached !== undefined) return cached;
  const byId = new Map(roof.points.map((point) => [point.id, point]));
  const vertices = roof.outline.flatMap((id) => {
    const point = byId.get(id);
    return point === undefined ? [] : [{ id, x: point.x, y: point.y }];
  });
  const area: AreaValue = {
    id: roof.id,
    name: roof.name,
    positionMm: { x: 0, y: 0 },
    rotationDeg: 0,
    floor: {
      id: roof.id,
      material: defaultFlooring(),
      shapes:
        vertices.length < 3
          ? []
          : [{ id: roof.id, type: "polygon", positionMm: { x: 0, y: 0 }, rotationDeg: 0, vertices }],
      carpets: [],
    },
    walls: [],
    objects: [],
    lights: [],
  };
  areaCache.set(roof, area);
  return area;
};

const floorCache = new WeakMap<RoofValue, WeakMap<BuildingFloorValue, BuildingFloorValue>>();

/** The floor the shape tools snap to in a roof: the real floor plus the roof as one more (virtual) area. */
export const roofToolFloor = (floor: BuildingFloorValue, roof: RoofValue): BuildingFloorValue => {
  const byFloor = floorCache.get(roof) ?? new WeakMap<BuildingFloorValue, BuildingFloorValue>();
  floorCache.set(roof, byFloor);
  const cached = byFloor.get(floor);
  if (cached !== undefined) return cached;
  const virtual = { ...floor, areas: [...floor.areas, roofAsArea(roof)] };
  byFloor.set(floor, virtual);
  return virtual;
};

const sceneCache = new WeakMap<RoofValue, WeakMap<BuildingFloorValue, InferenceScene>>();

/** Inference for the roof tools: the floor's scene plus the roof's points, outline and break lines. */
export const roofInferenceScene = (floor: BuildingFloorValue, roof: RoofValue): InferenceScene => {
  const byFloor = sceneCache.get(roof) ?? new WeakMap<BuildingFloorValue, InferenceScene>();
  sceneCache.set(roof, byFloor);
  const cached = byFloor.get(floor);
  if (cached !== undefined) return cached;
  const base = inferenceSceneOf(floor);
  const surface = roofSurface(roof);
  const segments: SceneSegment[] = [];
  surface.outline.forEach((point, index) => {
    const next = surface.outline[(index + 1) % surface.outline.length];
    const segment = next === undefined ? undefined : sceneSegment(point, next, true);
    if (segment !== undefined) segments.push(segment);
  });
  for (const line of [...surface.breaks, ...surface.folds]) {
    const segment = sceneSegment(line.a, line.b, true);
    if (segment !== undefined) segments.push(segment);
  }
  const scene: InferenceScene = {
    ...base,
    vertices: [...roof.points.map((point) => ({ x: point.x, y: point.y })), ...base.vertices],
    segments: [...segments, ...base.segments],
  };
  byFloor.set(floor, scene);
  return scene;
};
