// Moving rooms with Nudge in the overview (spec/builder/screens/floor-builder.md#moving-rooms). Hovering a room
// highlights what a press grabs: a wall's inner or outer top edge, a top corner, or the floor (whole room).
// Normal movement infers on the grab plane; Shift constrains to red/green, Ctrl bypasses snapping. A
// grabbed edge snaps flush onto other rooms' inner and outer edges (Touching / Full clash for outer edges,
// D05), and near another edge at a small angle the room first rotates about the grab point to align (Alt
// suppresses that). A grabbed corner snaps to corners, then edges and inference lines. One drag is one step.
import { hoveredHandle } from "../services/handleHover";
import { setAreaTransformCommand } from "@shared/domain/commands/areaCommands";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import { computeAreaFloorGeometry } from "@shared/geometry/areaGeometry";
import { shapeOutline } from "@shared/geometry/shapeOutline";
import type { Vec2 } from "@shared/geometry/vector";
import type { OverlayPrimitive, RuntimePointerEvent, ScreenPoint } from "../../../renderer/runtimeTypes";
import { inferenceSceneOf } from "../inference/inferenceScene";
import type { CueColor, CueLine, InferenceCue } from "../inference/inferenceTypes";
import { inferenceCapturePx, inferPoint } from "../inference/inferPoint";
import { toFloor } from "./planGeometry";
import { finishTool, floorOf, snapFloor, unitOf } from "./toolContext";
import { magnetic } from "./toolContext";
import { constrainMove, moveAxis } from "./moveModifiers";
import type { ToolEnv } from "./toolTypes";
import { createValueInput, feedValueKey, hasTyped, readoutOf, valueOf } from "./valueInput";
import type { WallOperation } from "./wallPushPull";

type FaceSide = "interior" | "exterior" | "floor";

/** A straight edge of a room that can be grabbed or snapped to (wall top face line or bare floor edge). */
export type RoomEdge = Readonly<{
  areaId: string;
  side: FaceSide;
  a: Vec2;
  b: Vec2;
  hMm: number;
  label: string;
}>;

export type RoomHandle =
  | Readonly<{ kind: "edge"; edge: RoomEdge }>
  | Readonly<{ kind: "corner"; areaId: string; point: Vec2; hMm: number }>
  | Readonly<{ kind: "floor"; areaId: string; point: Vec2 }>;

const handlePx = 8;
/** Corners win over the edges that meet there anywhere inside this radius (endpoint beats on-edge, as in SketchUp). */
const cornerPx = 12;
/** Alignment by dragging: largest angle the room turns to meet a nearby edge (convention, tune). */
const alignMaxDeg = 20;
/** How far (in capture radii) an edge pulls the grabbed edge into alignment. */
const alignReach = 3;
const parallelSine = Math.sin((0.5 * Math.PI) / 180);

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
const unit = (v: Vec2): Vec2 => {
  const length = Math.hypot(v.x, v.y);
  return length === 0 ? { x: 1, y: 0 } : { x: v.x / length, y: v.y / length };
};
const rotate = (v: Vec2, degrees: number): Vec2 => {
  const r = (degrees * Math.PI) / 180;
  return { x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) };
};

/**
 * Edges and top corners of one room: wall faces when it has walls, floor-shape edges where it has none.
 * `flat` (walls off, Phase 4.5): the wall faces and corners are taken at floor level, where they are traced.
 */
export const roomEdges = (
  area: AreaValue,
  flat = false,
): Readonly<{ edges: RoomEdge[]; corners: Vec2[]; cornerH: number[] }> => {
  const edges: RoomEdge[] = [];
  const corners: Vec2[] = [];
  const cornerH: number[] = [];
  const geometry = computeAreaFloorGeometry(area);
  for (const realWall of geometry.realWalls)
    for (const piece of realWall.pieces) {
      for (const face of piece.faces) {
        if (face.ref.side === "end") continue;
        edges.push({
          areaId: area.id,
          side: face.ref.side,
          a: face.start,
          b: face.end,
          hMm: flat ? 0 : realWall.heightMm,
          label: flat
            ? face.ref.side === "exterior"
              ? "Outer wall edge"
              : "Inner wall edge"
            : face.ref.side === "exterior"
              ? "Outer top edge"
              : "Inner top edge",
        });
      }
      for (const point of piece.ring) {
        corners.push(point);
        cornerH.push(flat ? 0 : realWall.heightMm);
      }
    }
  if (geometry.realWalls.length === 0)
    for (const shape of area.floor.shapes)
      for (const edge of shapeOutline(shape).edges) {
        if (!edge.provenance.wallable) continue;
        const a = toFloor(area, edge.start);
        edges.push({
          areaId: area.id,
          side: "floor",
          a,
          b: toFloor(area, edge.end),
          hMm: 0,
          label: "Floor edge",
        });
        corners.push(a);
        cornerH.push(0);
      }
  return { edges, corners, cornerH };
};

const segmentPx = (point: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number => {
  const d = sub(b, a);
  const lengthSquared = dot(d, d);
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(point, a), d) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * d.x), point.y - (a.y + t * d.y));
};

/** The room handle under the pointer: a top corner within its radius, then top edges, then the floor (whole room). */
export const roomHandleAt = (
  env: ToolEnv,
  event: RuntimePointerEvent,
  areaIds?: readonly string[],
): RoomHandle | undefined => {
  const floor = floorOf(env);
  if (floor === undefined) return undefined;
  const screen = event.screen;
  const rooms = floor.areas
    .filter((area) => areaIds === undefined || areaIds.includes(area.id))
    .map((area) => ({ area, ...roomEdges(area, !env.session.ui.getState().wallsVisible) }));
  let corner: RoomHandle | undefined;
  let cornerScore = cornerPx;
  for (const { area, corners, cornerH } of rooms) {
    corners.forEach((point, index) => {
      const h = cornerH[index] ?? 0;
      const s = env.runtime.screenPointOf({ ...point, h });
      if (s === null) return;
      const d = Math.hypot(s.x - screen.x, s.y - screen.y);
      if (d <= cornerScore) {
        corner = { kind: "corner", areaId: area.id, point, hMm: h };
        cornerScore = d;
      }
    });
  }
  if (corner !== undefined) return corner;
  let best: RoomHandle | undefined;
  let bestScore = handlePx;
  for (const { area, edges } of rooms) {
    for (const edge of edges) {
      const sa = env.runtime.screenPointOf({ ...edge.a, h: edge.hMm });
      const sb = env.runtime.screenPointOf({ ...edge.b, h: edge.hMm });
      if (sa === null || sb === null) continue;
      const pickedHere = event.hit?.kind === "wall" && event.hit.areaId === area.id ? 2 : 0;
      const d = segmentPx(screen, sa, sb) - pickedHere;
      if (d < bestScore) {
        best = { kind: "edge", edge };
        bestScore = d;
      }
    }
  }
  if (best !== undefined) return best;
  const hit = event.hit;
  if (
    (hit?.kind === "floor" || hit?.kind === "wall") &&
    event.plan !== null &&
    (areaIds === undefined || areaIds.includes(hit.areaId))
  )
    return { kind: "floor", areaId: hit.areaId, point: event.plan };
  return undefined;
};

export const roomHandleOverlay = (handle: RoomHandle): readonly OverlayPrimitive[] =>
  handle.kind === "edge"
    ? [
        {
          kind: "segment",
          from: { ...handle.edge.a, h: handle.edge.hMm },
          to: { ...handle.edge.b, h: handle.edge.hMm },
          tone: "accent",
        },
      ]
    : handle.kind === "corner"
      ? [hoveredHandle({ ...handle.point, h: handle.hMm }, "dot", 12)]
      : [];

export const roomHandleCue = (handle: RoomHandle): InferenceCue => ({
  lines: [],
  marker:
    handle.kind === "edge"
      ? {
          ...handle.edge.a,
          h: handle.edge.hMm,
          x: (handle.edge.a.x + handle.edge.b.x) / 2,
          y: (handle.edge.a.y + handle.edge.b.y) / 2,
        }
      : handle.kind === "corner"
        ? { ...handle.point, h: handle.hMm }
        : { ...handle.point, h: 0 },
  label:
    handle.kind === "edge"
      ? handle.edge.label
      : handle.kind === "corner"
        ? handle.hMm === 0
          ? "Corner"
          : "Top corner"
        : "Room",
});

const floorWithout = (floor: BuildingFloorValue, areaId: string): BuildingFloorValue => ({
  ...floor,
  areas: floor.areas.filter((area) => area.id !== areaId),
});

type Placement = Readonly<{
  offset: Vec2;
  rotationDeg: number;
  cue: InferenceCue | undefined;
  detent: string;
}>;

const colorOf = (direction: Vec2): CueColor =>
  Math.abs(direction.y) < 1e-6 ? "axisX" : Math.abs(direction.x) < 1e-6 ? "axisY" : "edge";

export const startRoomMove = (
  env: ToolEnv,
  area: AreaValue,
  handle: RoomHandle,
  event: RuntimePointerEvent,
  onDone: () => void,
): WallOperation | undefined => {
  const floor = floorOf(env);
  if (floor === undefined) return undefined;
  const grabH = handle.kind === "edge" ? handle.edge.hMm : handle.kind === "corner" ? handle.hMm : 0;
  const origin = env.runtime.planPointAt(event.screen.x, event.screen.y, grabH);
  if (origin === null) return undefined;
  const flat = !env.session.ui.getState().wallsVisible;
  const others = floor.areas
    .filter((candidate) => candidate.id !== area.id)
    .map((candidate) => roomEdges(candidate, flat));
  const otherEdges = others.flatMap((room) => room.edges);
  const scene = inferenceSceneOf(floorWithout(snapFloor(env, floor), area.id));
  const input = createValueInput("length");
  let screen: ScreenPoint = event.screen;
  let raw: Vec2 = { x: 0, y: 0 };
  let shift = event.shiftKey;
  let ctrl = event.ctrlKey;
  let alt = event.altKey;
  let placement: Placement = { offset: raw, rotationDeg: 0, cue: undefined, detent: "" };

  /** Where a point of the original room lands for a placement (rotation about the grab point, then offset). */
  const mapPoint = (point: Vec2, p: Pick<Placement, "offset" | "rotationDeg">): Vec2 =>
    add(add(origin, p.offset), rotate(sub(point, origin), p.rotationDeg));

  const axisLock = (vector: Vec2): Readonly<{ axis: Vec2; along: number }> => {
    const axis = moveAxis(vector);
    return { axis, along: dot(vector, axis) };
  };

  const edgeSnap = (edge: RoomEdge, offset: Vec2): Placement => {
    const radius = inferenceCapturePx * env.runtime.worldUnitsPerPixel();
    let rotationDeg = 0;
    let movedA = mapPoint(edge.a, { offset, rotationDeg });
    let movedB = mapPoint(edge.b, { offset, rotationDeg });
    let direction = unit(sub(movedB, movedA));
    if (!alt) {
      let bestAlign: Readonly<{ angle: number; distance: number }> | undefined;
      const pivot = add(origin, offset);
      for (const target of otherEdges) {
        const targetDirection = unit(sub(target.b, target.a));
        let angle =
          (Math.atan2(cross(direction, targetDirection), dot(direction, targetDirection)) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        if (Math.abs(angle) < 0.2 || Math.abs(angle) > alignMaxDeg) continue;
        const normal = { x: -targetDirection.y, y: targetDirection.x };
        const distance = Math.abs(dot(sub(pivot, target.a), normal));
        const along = dot(sub(pivot, target.a), targetDirection);
        const length = Math.hypot(target.b.x - target.a.x, target.b.y - target.a.y);
        if (distance > radius * alignReach || along < -length * 0.5 || along > length * 1.5) continue;
        if (bestAlign === undefined || distance < bestAlign.distance) bestAlign = { angle, distance };
      }
      if (bestAlign !== undefined) {
        rotationDeg = bestAlign.angle;
        movedA = mapPoint(edge.a, { offset, rotationDeg });
        movedB = mapPoint(edge.b, { offset, rotationDeg });
        direction = unit(sub(movedB, movedA));
      }
    }
    const normal = { x: -direction.y, y: direction.x };
    let best: Readonly<{ delta: number; target: RoomEdge }> | undefined;
    for (const target of otherEdges) {
      const targetDirection = unit(sub(target.b, target.a));
      if (Math.abs(cross(direction, targetDirection)) > parallelSine) continue;
      const delta = dot(sub(target.a, movedA), normal);
      if (Math.abs(delta) > radius || (best !== undefined && Math.abs(delta) >= Math.abs(best.delta)))
        continue;
      best = { delta, target };
    }
    if (best === undefined)
      return {
        offset,
        rotationDeg,
        detent: rotationDeg === 0 ? "" : `Aligned ${rotationDeg.toFixed(1)}°`,
        cue: undefined,
      };
    let snapped = add(offset, { x: normal.x * best.delta, y: normal.y * best.delta });
    movedA = mapPoint(edge.a, { offset: snapped, rotationDeg });
    movedB = mapPoint(edge.b, { offset: snapped, rotationDeg });
    let slide: number | undefined;
    for (const point of others.flatMap((room) => room.corners)) {
      if (Math.abs(dot(sub(point, movedA), normal)) > 1) continue;
      for (const end of [movedA, movedB]) {
        const along = dot(sub(point, end), direction);
        if (Math.abs(along) <= radius && (slide === undefined || Math.abs(along) < Math.abs(slide)))
          slide = along;
      }
    }
    if (slide !== undefined) snapped = add(snapped, { x: direction.x * slide, y: direction.y * slide });
    const detent =
      edge.side === "exterior" && best.target.side === "exterior"
        ? "Touching"
        : edge.side === "exterior" && best.target.side === "interior"
          ? "Full clash"
          : `Flush with ${best.target.label.toLowerCase()}`;
    const label = `${rotationDeg === 0 ? "" : `Aligned ${rotationDeg.toFixed(1)}° · `}${detent}${slide === undefined ? "" : " · corners aligned"}`;
    const h = edge.hMm;
    const lines: CueLine[] = [
      {
        from: { ...best.target.a, h },
        to: { ...mapPoint(edge.a, { offset: snapped, rotationDeg }), h },
        color: "edge",
      },
      {
        from: { ...best.target.b, h },
        to: { ...mapPoint(edge.b, { offset: snapped, rotationDeg }), h },
        color: "edge",
      },
    ];
    return {
      offset: snapped,
      rotationDeg,
      detent,
      cue: { lines, marker: { ...add(origin, snapped), h }, label },
    };
  };

  const pointSnap = (anchor: Vec2, offset: Vec2): Placement => {
    const inferred = inferPoint(scene, add(anchor, offset), env.runtime.worldUnitsPerPixel(), {
      from: anchor,
    });
    return inferred === undefined
      ? { offset, rotationDeg: 0, cue: undefined, detent: "" }
      : { offset: sub(inferred.point, anchor), rotationDeg: 0, cue: inferred.cue, detent: "" };
  };

  /**
   * Snapping while Shift locks an axis: the room only slides along the axis, so the snaps are the axis
   * positions where the grabbed edge lands flush on a parallel edge (Touching / Full clash), or where the
   * grabbed corner, edge end, or grab point meets an inference target.
   */
  const axisSnap = (
    axis: Vec2,
    along: number,
  ): Readonly<{ along: number; label: string; detent: string; lines: CueLine[] }> | undefined => {
    const radius = inferenceCapturePx * env.runtime.worldUnitsPerPixel();
    if (handle.kind === "edge") {
      const edge = handle.edge;
      const direction = unit(sub(edge.b, edge.a));
      const normal = { x: -direction.y, y: direction.x };
      const across = dot(axis, normal);
      let best: Readonly<{ t: number; target: RoomEdge }> | undefined;
      if (Math.abs(across) > 0.2)
        for (const target of otherEdges) {
          if (Math.abs(cross(direction, unit(sub(target.b, target.a)))) > parallelSine) continue;
          const t = dot(sub(target.a, edge.a), normal) / across;
          if (Math.abs((t - along) * across) > radius) continue;
          if (best === undefined || Math.abs(t - along) < Math.abs(best.t - along)) best = { t, target };
        }
      if (best !== undefined) {
        const detent =
          edge.side === "exterior" && best.target.side === "exterior"
            ? "Touching"
            : edge.side === "exterior" && best.target.side === "interior"
              ? "Full clash"
              : `Flush with ${best.target.label.toLowerCase()}`;
        const moved = { x: axis.x * best.t, y: axis.y * best.t };
        const h = edge.hMm;
        return {
          along: best.t,
          detent,
          label: detent,
          lines: [
            { from: { ...best.target.a, h }, to: { ...add(edge.a, moved), h }, color: "edge" },
            { from: { ...best.target.b, h }, to: { ...add(edge.b, moved), h }, color: "edge" },
          ],
        };
      }
    }
    const anchors =
      handle.kind === "edge"
        ? [handle.edge.a, handle.edge.b]
        : [handle.kind === "corner" ? handle.point : origin];
    let pick: Readonly<{ t: number; label: string; lines: CueLine[] }> | undefined;
    for (const anchor of anchors) {
      const moved = add(anchor, { x: axis.x * along, y: axis.y * along });
      const inferred = inferPoint(scene, moved, env.runtime.worldUnitsPerPixel(), {
        from: anchor,
        hMm: grabH,
      });
      if (inferred === undefined) continue;
      const t = dot(sub(inferred.point, anchor), axis);
      // Only targets that sit on the axis line through this anchor can be reached without leaving the axis.
      const off = Math.abs(cross(sub(inferred.point, anchor), axis));
      if (off > radius || inferred.kind === "axis") continue;
      if (pick === undefined || Math.abs(t - along) < Math.abs(pick.t - along))
        pick = { t, label: inferred.cue.label, lines: [...inferred.cue.lines] };
    }
    return pick === undefined
      ? undefined
      : { along: pick.t, detent: "", label: pick.label, lines: pick.lines };
  };

  const place = (): Placement => {
    const offset = constrainMove(raw, { shiftKey: shift, ctrlKey: ctrl });
    if (hasTyped(input)) {
      const direction = unit(offset);
      const typed = valueOf(input, Math.hypot(offset.x, offset.y), unitOf(env));
      return {
        offset: { x: direction.x * typed, y: direction.y * typed },
        rotationDeg: 0,
        cue: undefined,
        detent: "",
      };
    }
    if (ctrl) return { offset, rotationDeg: 0, cue: undefined, detent: "" };
    if (shift) {
      const lock = axisLock(raw);
      const snapped = magnetic(env) ? axisSnap(lock.axis, lock.along) : undefined;
      const along = snapped?.along ?? lock.along;
      const locked = { x: lock.axis.x * along, y: lock.axis.y * along };
      const h = grabH;
      return {
        offset: locked,
        rotationDeg: 0,
        detent: snapped?.detent ?? "",
        cue: {
          lines: [
            { from: { ...origin, h }, to: { ...add(origin, locked), h }, color: colorOf(lock.axis) },
            ...(snapped?.lines ?? []),
          ],
          marker: { ...add(origin, locked), h },
          label: snapped === undefined ? "Axis locked (Shift)" : `Axis locked (Shift) · ${snapped.label}`,
        },
      };
    }
    if (!magnetic(env)) return { offset, rotationDeg: 0, cue: undefined, detent: "" };
    if (handle.kind === "edge") return edgeSnap(handle.edge, offset);
    return pointSnap(handle.kind === "corner" ? handle.point : origin, offset);
  };

  const transformOf = (p: Placement): Readonly<{ positionMm: Vec2; rotationDeg: number }> => ({
    positionMm: mapPoint(area.positionMm, p),
    rotationDeg: area.rotationDeg + p.rotationDeg,
  });

  const preview = (): void => {
    placement = place();
    env.runtime.setAreaPreviewTransform(area.id, transformOf(placement));
    env.setCue(placement.cue);
    const moved = add(origin, placement.offset);
    const overlay: OverlayPrimitive[] = [
      {
        kind: "segment",
        from: { ...origin, h: grabH },
        to: { ...moved, h: grabH },
        dashed: true,
        tone: "neutral",
      },
    ];
    if (handle.kind === "edge")
      overlay.push({
        kind: "segment",
        from: { ...mapPoint(handle.edge.a, placement), h: grabH },
        to: { ...mapPoint(handle.edge.b, placement), h: grabH },
        tone: "accent",
      });
    env.setOverlay(overlay);
    env.setReadout({
      text: readoutOf(input, Math.hypot(placement.offset.x, placement.offset.y), unitOf(env)),
      screen,
    });
  };

  const finish = (): void => {
    env.runtime.setAreaPreviewTransform(area.id, null);
    input.typed = "";
    finishTool(env);
    onDone();
  };

  const commit = (): void => {
    const p = placement;
    finish();
    if (Math.hypot(p.offset.x, p.offset.y) < 0.5 && Math.abs(p.rotationDeg) < 0.01) return;
    const transform = transformOf(p);
    env.session.execute(
      setAreaTransformCommand(
        env.session.ui.getState().activeFloorId,
        area.id,
        { x: Math.round(transform.positionMm.x * 10) / 10, y: Math.round(transform.positionMm.y * 10) / 10 },
        Math.round(transform.rotationDeg * 1000) / 1000,
        p.rotationDeg === 0 ? "Move area" : "Move and align area",
      ),
    );
  };

  env.setCursor("move");
  return {
    pointer: (next) => {
      shift = next.shiftKey;
      ctrl = next.ctrlKey;
      alt = next.altKey;
      if (next.phase === "move") {
        const plan = env.runtime.planPointAt(next.screen.x, next.screen.y, grabH);
        if (plan !== null) raw = sub(plan, origin);
        screen = next.screen;
        preview();
      } else if (next.phase === "down" && next.button === 0) commit();
    },
    key: (keyEvent) => {
      if (keyEvent.key === "Shift" || keyEvent.key === "Alt") return false;
      const action = feedValueKey(input, keyEvent.key);
      if (action === "cancel") finish();
      else if (action === "commit") commit();
      else if (action === "consumed") preview();
      return action !== "none";
    },
    cancel: finish,
  };
};
