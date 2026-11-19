// The wall face as an edit plane for the shared 2D shape editor (wall relief groups). The shape tools work on
// an area in plan coordinates; here the "plan" is the face: x runs along the wall from its span start and y
// runs up from the floor. A virtual area holds the open feature's shapes in that frame, a virtual floor
// gives snapping the face's outline, its openings, and the other features, and the helpers below translate
// between face coordinates and the real 3D view (pointer rays in, overlays out).
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import type { WallReliefValue } from "@shared/domain/schemas/wall";
import type { Vec2 } from "@shared/geometry/vector";
import type {
  OverlayPrimitive,
  PlanPoint3,
  RuntimePointerEvent,
  ViewportRuntime,
} from "../../../renderer/runtimeTypes";
import type { ToolEnv } from "../tools/toolTypes";
import type { WallFace } from "./wallFace";

/**
 * What the face env needs of a face: face coordinates → a point on it in the 3D view. A wall face and a roof face
 * (Phase 19.3, roofFace.ts) both are one.
 */
export type FacePlane = Readonly<{ toPlan: (along: number, up: number, liftMm?: number) => PlanPoint3 }>;

/** The face's id on the virtual reference area that carries the snap geometry. */
const referenceAreaId = "face-reference";

/**
 * The open feature as a virtual area at the face origin: its shapes are the floor shapes, so shape tools and
 * overlays work in face coordinates unchanged. Commands still target the real area and the feature's ID.
 */
export const featureAsArea = (area: AreaValue, relief: WallReliefValue | undefined): AreaValue => ({
  ...area,
  positionMm: { x: 0, y: 0 },
  rotationDeg: 0,
  floor: { ...area.floor, shapes: relief?.shapes ?? [], carpets: [] },
  walls: [],
});

const rectangle = (id: string, fromX: number, toX: number, fromY: number, toY: number): ShapeValue => ({
  id,
  type: "rectangle",
  positionMm: { x: (fromX + toX) / 2, y: (fromY + toY) / 2 },
  rotationDeg: 0,
  widthMm: Math.max(1, toX - fromX),
  heightMm: Math.max(1, toY - fromY),
});

/**
 * The face's outline as a snap shape: the authored rectangle, or under a roof (Phase 19.5) the risen or clipped shape
 * (bottom edge, then its top from end to start).
 */
const faceOutline = (face: WallFace): ShapeValue => {
  const top = face.topProfile;
  if (top.length < 2 || top.every((point) => Math.abs(point.topMm - face.heightMm) < 1e-6))
    return rectangle("face-outline", 0, face.lengthMm, 0, face.heightMm);
  const ring = [
    { x: 0, y: 0 },
    { x: face.lengthMm, y: 0 },
    ...[...top].reverse().map((point) => ({ x: point.alongMm, y: Math.max(0, point.topMm) })),
  ];
  return {
    id: "face-outline",
    type: "polygon",
    positionMm: { x: 0, y: 0 },
    rotationDeg: 0,
    vertices: ring.map((point, index) => ({ id: `face-outline-${String(index)}`, x: point.x, y: point.y })),
  };
};

const floorCache = new WeakMap<WallFace, Map<string, BuildingFloorValue>>();

/**
 * A virtual floor for inference and snapping while a face is open: the open feature (or an empty host), and
 * a reference area with the face's outline, its openings, and every other feature on the face.
 */
export const faceFloorOf = (
  floor: BuildingFloorValue,
  face: WallFace,
  openReliefId: string | undefined,
): BuildingFloorValue => {
  const byRelief = floorCache.get(face) ?? new Map<string, BuildingFloorValue>();
  floorCache.set(face, byRelief);
  const key = openReliefId ?? "";
  const cached = byRelief.get(key);
  if (cached !== undefined) return cached;
  const open = face.reliefs.find((relief) => relief.id === openReliefId);
  const reference: AreaValue = {
    ...face.area,
    id: referenceAreaId,
    positionMm: { x: 0, y: 0 },
    rotationDeg: 0,
    floor: {
      ...face.area.floor,
      shapes: [
        faceOutline(face),
        ...face.openingRects.map((box, index) =>
          rectangle(`face-opening-${String(index)}`, box.fromMm, box.toMm, box.bottomMm, box.topMm),
        ),
        ...face.reliefs.filter((relief) => relief.id !== openReliefId).flatMap((relief) => relief.shapes),
      ],
      carpets: [],
    },
    walls: [],
    objects: [],
    lights: [],
  };
  const virtual: BuildingFloorValue = {
    ...floor,
    areas: [featureAsArea(face.area, open), reference],
    guides: [],
  };
  byRelief.set(key, virtual);
  return virtual;
};

/** Face coordinates (along, up) → the 3D view's plan point on the face, lifted slightly toward the viewer. */
export const faceToPlan = (face: FacePlane, point: Vec2, liftMm = 3): PlanPoint3 =>
  face.toPlan(point.x, point.y, liftMm);

/** Overlays drawn by the shape tools in face coordinates → overlays on the face in the 3D view. */
export const overlayOnFace = (
  face: FacePlane,
  overlay: readonly OverlayPrimitive[],
): readonly OverlayPrimitive[] =>
  overlay.flatMap((primitive): OverlayPrimitive[] => {
    switch (primitive.kind) {
      case "polygon":
        // A flat fill cannot lie on a vertical face: draw the outline of the ring and of each hole.
        return [primitive.points, ...(primitive.holes ?? [])].map((ring): OverlayPrimitive => ({
          kind: "polyline",
          points: ring.map((point) => faceToPlan(face, point)),
          closed: true,
          ...(primitive.tone === undefined ? {} : { tone: primitive.tone }),
        }));
      case "polyline":
        return [{ ...primitive, points: primitive.points.map((point) => faceToPlan(face, point)) }];
      case "segment":
        return [{ ...primitive, from: faceToPlan(face, primitive.from), to: faceToPlan(face, primitive.to) }];
      case "point":
        return [{ ...primitive, at: faceToPlan(face, primitive.at) }];
      case "verticalLine":
        return [];
    }
  });

/**
 * The runtime as the shape tools see it on a face: pointer rays resolve to face coordinates, and face
 * coordinates project to the screen. Picking is off; the tools pick shapes from the document.
 */
export const faceEditRuntime = (
  runtime: ViewportRuntime,
  face: () => FacePlane | undefined,
): ViewportRuntime => ({
  ...runtime,
  planPointAt: (screenX, screenY) => {
    const hit = runtime.facePointAt(screenX, screenY);
    return hit === null ? null : { x: hit.alongMm, y: hit.heightMm };
  },
  screenPointOf: (point) => {
    const current = face();
    return current === undefined ? null : runtime.screenPointOf(faceToPlan(current, point, 0));
  },
  pick: () => null,
  heightOnVertical: () => null,
});

/**
 * A tool env in face coordinates: the runtime as above, and overlays and cues drawn by the tool in face
 * coordinates mapped onto the face in the 3D view. The shape tools inside a wall face, and the face view's
 * whole-feature box handles, run through it.
 */
export const faceToolEnv = (env: ToolEnv, face: () => FacePlane | undefined): ToolEnv => ({
  ...env,
  runtime: faceEditRuntime(env.runtime, face),
  setOverlay: (overlay) => {
    const current = face();
    env.setOverlay(current === undefined ? [] : overlayOnFace(current, overlay));
  },
  setCue: (cue) => {
    const current = face();
    if (cue === undefined || current === undefined) {
      env.setCue(undefined);
      return;
    }
    env.setCue({
      ...cue,
      lines: cue.lines.map((line) => ({
        ...line,
        from: faceToPlan(current, line.from),
        to: faceToPlan(current, line.to),
      })),
      marker: cue.marker === null ? null : faceToPlan(current, cue.marker),
    });
  },
});

/** A pointer event as the shape tools see it on a face: the face point as the plan point, no 3D pick. */
export const inFaceSpace = (runtime: ViewportRuntime, event: RuntimePointerEvent): RuntimePointerEvent => {
  const point = runtime.facePointAt(event.screen.x, event.screen.y);
  return { ...event, plan: point === null ? null : { x: point.alongMm, y: point.heightMm }, hit: null };
};
