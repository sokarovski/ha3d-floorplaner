// Inference candidates from the whole active floor (every area, also faded or hidden ones): shape vertices
// and edges (floor shapes and carpets), shape centres and circle quadrants, wall band corners and faces,
// guides, and every wall height. Memoized by floor identity.
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import { applyAffine, composeAffine, placementAffine } from "@shared/geometry/affine";
import type { Affine2 } from "@shared/geometry/affine";
import { computeAreaFloorGeometry } from "@shared/geometry/areaGeometry";
import { shapeOutline } from "@shared/geometry/shapeOutline";
import { wallPointAt } from "@shared/geometry/wallBands";
import type { Vec2 } from "@shared/geometry/vector";
import { wallLabel } from "../services/labels";
import { toFloor } from "../tools/planGeometry";
import type { InferenceScene, NamedPoint, SceneHeight, SceneSegment } from "./inferenceTypes";

const cache = new WeakMap<BuildingFloorValue, InferenceScene>();

export const sceneSegment = (a: Vec2, b: Vec2, straight: boolean): SceneSegment | undefined => {
  const lengthMm = Math.hypot(b.x - a.x, b.y - a.y);
  if (lengthMm < 1e-6) return undefined;
  return { a, b, direction: { x: (b.x - a.x) / lengthMm, y: (b.y - a.y) / lengthMm }, lengthMm, straight };
};

const pointKey = (point: Vec2): string => `${point.x.toFixed(1)},${point.y.toFixed(1)}`;

export const inferenceSceneOf = (floor: BuildingFloorValue): InferenceScene => {
  const cached = cache.get(floor);
  if (cached !== undefined) return cached;
  const vertices = new Map<string, Vec2>();
  const segments: SceneSegment[] = [];
  const heights: SceneHeight[] = [];
  const namedPoints: NamedPoint[] = [];
  /** Centre (rectangles, circles) and quadrants on the floor's red/green axes (circles), in floor mm. */
  const addNamedPoints = (shape: ShapeValue, toFloorPoint: (point: Vec2) => Vec2): void => {
    if (shape.type === "polygon") return;
    const center = toFloorPoint(shape.positionMm);
    namedPoints.push({ point: center, kind: "center", label: "Centre" });
    if (shape.type !== "circle") return;
    for (const direction of [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
    ])
      namedPoints.push({
        point: { x: center.x + direction.x * shape.radiusMm, y: center.y + direction.y * shape.radiusMm },
        kind: "quadrant",
        label: "Quadrant",
      });
  };
  const addShape = (shape: ShapeValue, toFloorPoint: (point: Vec2) => Vec2): void => {
    for (const edge of shapeOutline(shape).edges) {
      const a = toFloorPoint(edge.start);
      const b = toFloorPoint(edge.end);
      if (edge.provenance.wallable) {
        addVertex(a);
        addVertex(b);
      }
      addSegment(a, b, edge.provenance.wallable);
    }
    addNamedPoints(shape, toFloorPoint);
  };
  const addVertex = (point: Vec2): void => {
    vertices.set(pointKey(point), point);
  };
  const addSegment = (a: Vec2, b: Vec2, straight: boolean): void => {
    const segment = sceneSegment(a, b, straight);
    if (segment !== undefined) segments.push(segment);
  };
  for (const area of floor.areas) {
    for (const shape of area.floor.shapes) addShape(shape, (point) => toFloor(area, point));
    const geometry = computeAreaFloorGeometry(area);
    for (const carpet of area.floor.carpets) {
      const carpetToFloor: Affine2 = composeAffine(
        geometry.areaToFloor,
        placementAffine(carpet.positionMm, carpet.rotationDeg),
      );
      for (const shape of carpet.shapes) addShape(shape, (point) => applyAffine(carpetToFloor, point));
    }
    for (const realWall of geometry.realWalls) {
      const index = area.walls.findIndex((wall) => wall.id === realWall.wallId);
      const wall = area.walls[index];
      const curved = realWall.arc !== null;
      for (const piece of realWall.pieces) {
        // Arc walls: only their end corners are endpoints, and their facets never project extensions.
        if (curved)
          for (const face of piece.faces.filter((candidate) => candidate.ref.side === "end")) {
            addVertex(face.start);
            addVertex(face.end);
          }
        else for (const point of piece.ring) addVertex(point);
        // Interior/exterior faces project extensions; end faces (often mitred) only take on-edge snaps.
        for (const face of piece.faces) addSegment(face.start, face.end, face.ref.side !== "end" && !curved);
      }
      if (wall !== undefined) {
        heights.push({
          heightMm: realWall.heightMm,
          wallId: realWall.wallId,
          areaId: area.id,
          wallLabel: `${area.name}: ${wallLabel(area, wall, index)}`,
          at: wallPointAt(realWall, (realWall.spanMm.fromMm + realWall.spanMm.toMm) / 2).point,
        });
      }
    }
  }
  const guideLines: SceneSegment[] = [];
  const guidePoints: Vec2[] = [];
  for (const guide of floor.guides) {
    if (!guide.visible) continue;
    if (guide.kind === "line") {
      const line = sceneSegment(guide.aMm, guide.bMm, true);
      if (line !== undefined) guideLines.push(line);
    } else guidePoints.push(guide.bMm);
  }
  const scene: InferenceScene = {
    vertices: [...vertices.values()],
    segments,
    guideLines,
    guidePoints,
    namedPoints,
    heights,
  };
  cache.set(floor, scene);
  return scene;
};
