// The box of a placed thing (carpet, floor or overhead object, light) in the floor plan, with the points a
// Move or Rotate can grab: its corners, edge midpoints, and centre, as rooms have (owner, Phase 5 follow-up).
import type { EntityRef } from "@shared/domain/house/entityIndex";
import type { Vec2 } from "@shared/geometry/vector";
import type { OverlayPrimitive } from "../../../renderer/runtimeTypes";
import { hoveredHandle } from "../services/handleHover";
import { carpetOutlineInFloor } from "./carpetEditing";
import { toFloor } from "./planGeometry";
import { areaById } from "./toolContext";
import type { ToolEnv } from "./toolTypes";

/** Half the side of a point or spot light's box (mm). */
const lightHalfMm = 150;

export type BoxPointKind = "corner" | "edge" | "centre";
export type BoxPoint = Readonly<{ kind: BoxPointKind; at: Vec2 }>;

export type ElementBox = Readonly<{
  /** Corners in order around the box. */
  corners: readonly Vec2[];
  /** Side midpoints, in the same order (between corner i and i + 1). */
  mids: readonly Vec2[];
  center: Vec2;
  /** Height the box is drawn at. */
  hMm: number;
  /** The box's own axes in the floor, degrees. */
  frameDeg: number;
}>;

export const rotateAbout = (point: Vec2, pivot: Vec2, degrees: number): Vec2 => {
  const r = (degrees * Math.PI) / 180;
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: pivot.x + dx * Math.cos(r) - dy * Math.sin(r),
    y: pivot.y + dx * Math.sin(r) + dy * Math.cos(r),
  };
};

/** The box of floor points in a frame turned by `frameDeg`. */
export const boxOf = (points: readonly Vec2[], frameDeg: number, hMm: number): ElementBox => {
  const origin = { x: 0, y: 0 };
  const local = points.map((point) => rotateAbout(point, origin, -frameDeg));
  const xs = local.map((point) => point.x);
  const ys = local.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const back = (point: Vec2): Vec2 => rotateAbout(point, origin, frameDeg);
  return {
    corners: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ].map(back),
    mids: [
      { x: cx, y: minY },
      { x: maxX, y: cy },
      { x: cx, y: maxY },
      { x: minX, y: cy },
    ].map(back),
    center: back({ x: cx, y: cy }),
    hMm,
    frameDeg,
  };
};

/** The box of a carpet, a floor or overhead object, or a light; undefined for anything else. */
export const elementBoxOf = (env: ToolEnv, ref: EntityRef): ElementBox | undefined => {
  if (ref.kind !== "carpet" && ref.kind !== "object" && ref.kind !== "light" && ref.kind !== "objectGroup")
    return undefined;
  const area = areaById(env, ref.areaId);
  if (area === undefined) return undefined;
  if (ref.kind === "objectGroup") {
    // One box around every member's box.
    const boxes = ref.value.memberIds.flatMap((id) => env.runtime.instanceBounds(id) ?? []);
    return boxes.length === 0 ? undefined : boxOf(boxes, area.rotationDeg, 0);
  }
  if (ref.kind === "carpet") {
    const points = carpetOutlineInFloor(area, ref.value).polygons.flatMap((polygon) => polygon.outer);
    return points.length === 0 ? undefined : boxOf(points, area.rotationDeg + ref.value.rotationDeg, 0);
  }
  if (ref.kind === "object") {
    if (ref.value.attachment.host === "wall") return undefined;
    const corners = env.runtime.instanceBounds(ref.id);
    if (corners === null) return undefined;
    return boxOf(corners.slice(0, 4), area.rotationDeg + ref.value.rotationDeg, corners[0]?.h ?? 0);
  }
  const light = ref.value;
  const center = toFloor(area, light.positionMm);
  const frameDeg = area.rotationDeg + light.rotationDeg;
  const half = light.geometry.type === "linear" ? light.geometry.lengthMm / 2 : lightHalfMm;
  const points = [
    { x: center.x - half, y: center.y - lightHalfMm },
    { x: center.x + half, y: center.y + lightHalfMm },
  ].map((point) => rotateAbout(point, center, frameDeg));
  // Drawn on the floor under the light, where Move's pointer works.
  return boxOf(points, frameDeg, 0);
};

/** Every grab point of a box: corners first (they win), then edge midpoints, then the centre. */
export const boxPoints = (box: ElementBox): readonly BoxPoint[] => [
  ...box.corners.map((at): BoxPoint => ({ kind: "corner", at })),
  ...box.mids.map((at): BoxPoint => ({ kind: "edge", at })),
  { kind: "centre", at: box.center },
];

export const boxPointLabel = (kind: BoxPointKind): string =>
  kind === "corner" ? "Corner" : kind === "edge" ? "Edge midpoint" : "Centre";

/** The grab point within `radiusPx` of a screen point; corners beat midpoints beat the centre. */
export const boxPointAt = (
  env: ToolEnv,
  box: ElementBox,
  screen: Readonly<{ x: number; y: number }>,
  radiusPx: number,
): BoxPoint | undefined => {
  for (const kind of ["corner", "edge", "centre"] as const) {
    let best: { point: BoxPoint; distance: number } | undefined;
    for (const point of boxPoints(box)) {
      if (point.kind !== kind) continue;
      const s = env.runtime.screenPointOf({ ...point.at, h: box.hMm });
      if (s === null) continue;
      const distance = Math.hypot(s.x - screen.x, s.y - screen.y);
      if (distance <= radiusPx && (best === undefined || distance < best.distance))
        best = { point, distance };
    }
    if (best !== undefined) return best.point;
  }
  return undefined;
};

/** The box outline with its grab points; the hot point is drawn with the shared hover look. */
export const boxOverlay = (box: ElementBox, hot: BoxPoint | undefined): OverlayPrimitive[] => {
  const h = box.hMm;
  return [
    { kind: "polyline", points: box.corners.map((at) => ({ ...at, h })), closed: true, tone: "accent" },
    ...boxPoints(box).map((point): OverlayPrimitive => {
      const shape = point.kind === "centre" ? "cross" : "dot";
      const size = point.kind === "centre" ? 12 : 8;
      return hot?.kind === point.kind && hot.at.x === point.at.x && hot.at.y === point.at.y
        ? hoveredHandle({ ...point.at, h }, shape, size)
        : { kind: "point", at: { ...point.at, h }, marker: shape, sizePx: size, tone: "accent" };
    }),
  ];
};
