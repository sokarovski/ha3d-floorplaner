// Nudge a floor shape in Area Editor (spec/builder/screens/floor-builder.md#nudge-and-corner-edit-tools): the
// shape moves without resizing. Where it was grabbed decides the snap: a corner snaps to other corners first,
// then to edges and inference lines; an edge snaps flush onto parallel edges (and their extensions) and
// slides along them, aligning its ends with corners on that line; the interior follows the pointer's
// inference. Shift constrains to red/green; Ctrl bypasses snapping. Typed distances remain exact.
import type { Command } from "@shared/domain/commands/command";
import { replaceShapeCommand } from "@shared/domain/commands/shapeCommands";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import { shapeOutline } from "@shared/geometry/shapeOutline";
import type { Vec2 } from "@shared/geometry/vector";
import type { RuntimePointerEvent, ScreenPoint } from "../../../renderer/runtimeTypes";
import { inferenceSceneOf } from "../inference/inferenceScene";
import type { CueLine, InferenceCue, InferenceScene } from "../inference/inferenceTypes";
import { inferenceCapturePx, inferPoint } from "../inference/inferPoint";
import { inferAlong } from "../inference/inferAlong";
import { constrainMove, moveAxis, moveAxisCue } from "./moveModifiers";
import { toAreaLocal, toFloor } from "./planGeometry";
import { distance, projectOnSegment } from "./snapping";
import { shapeSetIdOf, finishTool, floorOf, focusArea, magnetic, snapFloor, unitOf } from "./toolContext";
import type { ToolEnv } from "./toolTypes";
import { createValueInput, feedValueKey, hasTyped, readoutOf, valueOf } from "./valueInput";
import type { WallOperation } from "./wallPushPull";

/** Edges within this angle count as parallel for flush snapping. */
const parallelSine = Math.sin((1 * Math.PI) / 180);

export type ShapeGrab =
  | Readonly<{ kind: "corner"; index: number; point: Vec2 }>
  | Readonly<{ kind: "edge"; a: Vec2; b: Vec2 }>
  /** `anchor`: grabbed at the shape's centre or a circle quadrant (snaps from that point), else anywhere inside. */
  | Readonly<{ kind: "inside"; point: Vec2; anchor?: "center" | "quadrant" }>;

/** Floor-frame ring of a shape. */
export const shapeRingInFloor = (area: AreaValue, shape: ShapeValue): readonly Vec2[] =>
  shapeOutline(shape).ring.map((point) => toFloor(area, point));

/** Corners (not circle facets) of a shape in floor coordinates. */
export const shapeCorners = (area: AreaValue, shape: ShapeValue): readonly Vec2[] =>
  shape.type === "circle" ? [] : shapeRingInFloor(area, shape);

/** What a press at a floor point grabs on a shape: a corner, its centre or a quadrant, an edge, or the inside. */
export const grabOf = (area: AreaValue, shape: ShapeValue, point: Vec2, radiusMm: number): ShapeGrab => {
  const corners = shapeCorners(area, shape);
  const corner = corners.findIndex((candidate) => distance(candidate, point) <= radiusMm);
  const cornerPoint = corners[corner];
  if (cornerPoint !== undefined) return { kind: "corner", index: corner, point: cornerPoint };
  // Centre and circle quadrant grabs (Phase 4.2) anchor the move at that point, so it snaps centre to
  // centre, quadrant to edge, and so on, through the same point inference as an inside grab.
  if (shape.type !== "polygon") {
    const center = toFloor(area, shape.positionMm);
    const anchors =
      shape.type === "circle"
        ? [
            center,
            ...[
              { x: 1, y: 0 },
              { x: 0, y: 1 },
              { x: -1, y: 0 },
              { x: 0, y: -1 },
            ].map((axis) => ({
              x: center.x + axis.x * shape.radiusMm,
              y: center.y + axis.y * shape.radiusMm,
            })),
          ]
        : [center];
    const index = anchors.findIndex((candidate) => distance(candidate, point) <= radiusMm);
    const anchor = anchors[index];
    if (anchor !== undefined)
      return { kind: "inside", point: anchor, anchor: index === 0 ? "center" : "quadrant" };
  }
  if (shape.type !== "circle") {
    for (let i = 0; i < corners.length; i += 1) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      if (a !== undefined && b !== undefined && distance(projectOnSegment(point, a, b), point) <= radiusMm)
        return { kind: "edge", a, b };
    }
  }
  return { kind: "inside", point };
};

/** The floor without one shape (and the walls on it), so a moving shape never snaps to itself. */
const floorWithout = (floor: BuildingFloorValue, areaId: string, shapeId: string): BuildingFloorValue => ({
  ...floor,
  areas: floor.areas.map((area) =>
    area.id !== areaId
      ? area
      : {
          ...area,
          floor: { ...area.floor, shapes: area.floor.shapes.filter((shape) => shape.id !== shapeId) },
          walls: area.walls.filter((wall) => wall.sourceEdge.shapeId !== shapeId),
        },
  ),
});

const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** Edge grab: flush onto the nearest parallel edge line, then align the ends with corners on that line. */
const flushOffset = (
  scene: InferenceScene,
  grab: Extract<ShapeGrab, { kind: "edge" }>,
  raw: Vec2,
  radius: number,
): Readonly<{ offset: Vec2; cue: InferenceCue }> | undefined => {
  const length = distance(grab.a, grab.b);
  if (length === 0) return undefined;
  const d = { x: (grab.b.x - grab.a.x) / length, y: (grab.b.y - grab.a.y) / length };
  const n = { x: -d.y, y: d.x };
  const a1 = add(grab.a, raw);
  let best: Readonly<{ delta: number; source: Vec2; target: Vec2 }> | undefined;
  for (const segment of scene.segments) {
    if (!segment.straight) continue;
    if (Math.abs(d.x * segment.direction.y - d.y * segment.direction.x) > parallelSine) continue;
    const delta = dot(sub(segment.a, a1), n);
    if (Math.abs(delta) > radius || (best !== undefined && Math.abs(delta) >= Math.abs(best.delta))) continue;
    best = { delta, source: segment.a, target: segment.b };
  }
  if (best === undefined) return undefined;
  let offset = add(raw, { x: n.x * best.delta, y: n.y * best.delta });
  let label = "Flush with edge";
  const moved = [add(grab.a, offset), add(grab.b, offset)];
  let slide: number | undefined;
  for (const vertex of scene.vertices) {
    if (Math.abs(dot(sub(vertex, add(grab.a, offset)), n)) > 1) continue;
    for (const end of moved) {
      const along = dot(sub(vertex, end), d);
      if (Math.abs(along) <= radius && (slide === undefined || Math.abs(along) < Math.abs(slide)))
        slide = along;
    }
  }
  if (slide !== undefined) {
    offset = add(offset, { x: d.x * slide, y: d.y * slide });
    label = "Flush with edge · corners aligned";
  }
  const lines: CueLine[] = [
    { from: { ...best.source, h: 0 }, to: { ...add(grab.a, offset), h: 0 }, color: "edge" },
    { from: { ...best.target, h: 0 }, to: { ...add(grab.b, offset), h: 0 }, color: "edge" },
  ];
  return { offset, cue: { lines, marker: { ...add(grab.a, offset), h: 0 }, label } };
};

export const startShapeNudge = (
  env: ToolEnv,
  shape: ShapeValue,
  grab: ShapeGrab,
  event: RuntimePointerEvent,
  carpetId: string | undefined,
  onDone: () => void,
): WallOperation | undefined => {
  const area = focusArea(env);
  const floor = floorOf(env);
  if (area === undefined || floor === undefined || event.plan === null) return undefined;
  const scene = inferenceSceneOf(floorWithout(snapFloor(env, floor), area.id, shape.id));
  const origin = event.plan;
  const ring = shapeRingInFloor(area, shape);
  const input = createValueInput("length");
  let screen: ScreenPoint = event.screen;
  let raw: Vec2 = { x: 0, y: 0 };
  let modifiers = { shiftKey: event.shiftKey, ctrlKey: event.ctrlKey };

  const snapOffset = (raw: Vec2): Vec2 => {
    if (!magnetic(env) || hasTyped(input)) {
      env.setCue(undefined);
      return raw;
    }
    const radius = inferenceCapturePx * env.runtime.worldUnitsPerPixel();
    if (grab.kind === "edge") {
      const flush = flushOffset(scene, grab, raw, radius);
      if (flush !== undefined) {
        env.setCue(flush.cue);
        return flush.offset;
      }
    }
    const anchor = grab.kind === "corner" ? grab.point : grab.kind === "inside" ? grab.point : grab.a;
    const inferred = inferPoint(scene, add(anchor, raw), env.runtime.worldUnitsPerPixel(), { from: anchor });
    env.setCue(inferred?.cue);
    return inferred === undefined ? raw : sub(inferred.point, anchor);
  };

  const effective = (): Vec2 => {
    let offset = constrainMove(raw, modifiers);
    if (modifiers.ctrlKey) env.setCue(undefined);
    else if (modifiers.shiftKey) {
      const axis = moveAxis(raw);
      const anchor = grab.kind === "edge" ? grab.a : grab.point;
      const inferred =
        magnetic(env) && !hasTyped(input)
          ? inferAlong(
              scene,
              { origin: anchor, direction: axis },
              offset.x + offset.y,
              env.runtime.worldUnitsPerPixel(),
              { stops: [], hMm: 0 },
            )
          : undefined;
      if (inferred !== undefined) offset = { x: axis.x * inferred.alongMm, y: axis.y * inferred.alongMm };
      env.setCue(moveAxisCue(origin, offset));
    } else offset = snapOffset(raw);
    if (!hasTyped(input)) return offset;
    const length = Math.hypot(offset.x, offset.y);
    if (length === 0) return offset;
    const typed = valueOf(input, length, unitOf(env));
    return { x: (offset.x / length) * typed, y: (offset.y / length) * typed };
  };

  /** The shape moved by an offset (floor mm), as one command. */
  const moveCommand = (moved: Vec2): Command | undefined => {
    const current = focusArea(env);
    if (current === undefined || Math.hypot(moved.x, moved.y) < 0.5) return undefined;
    const a = toAreaLocal(current, origin);
    const b = toAreaLocal(current, add(origin, moved));
    return replaceShapeCommand(
      env.session.ui.getState().activeFloorId,
      current.id,
      { ...shape, positionMm: { x: shape.positionMm.x + b.x - a.x, y: shape.positionMm.y + b.y - a.y } },
      carpetId === undefined && shapeSetIdOf(env) === undefined ? "Nudge shape" : "Nudge carpet",
      carpetId ?? shapeSetIdOf(env),
    );
  };

  const preview = (): void => {
    const moved = effective();
    // The shape moves live (owner, Phase 5 follow-up).
    env.session.preview(moveCommand(moved));
    env.setOverlay([
      {
        kind: "polygon",
        points: ring.map((point) => add(point, moved)),
        fillOpacity: 0.15,
        outline: true,
        tone: "accent",
      },
      { kind: "segment", from: origin, to: add(origin, moved), dashed: true, tone: "neutral" },
    ]);
    env.setReadout({ text: readoutOf(input, Math.hypot(moved.x, moved.y), unitOf(env)), screen });
  };

  const finish = (): void => {
    input.typed = "";
    finishTool(env);
    onDone();
  };

  const commit = (): void => {
    const command = moveCommand(effective());
    finish();
    if (command !== undefined) env.session.execute(command);
  };

  env.setCursor("move");
  return {
    pointer: (next) => {
      if (next.phase === "move" && next.plan !== null) {
        screen = next.screen;
        raw = sub(next.plan, origin);
        modifiers = { shiftKey: next.shiftKey, ctrlKey: next.ctrlKey };
        preview();
      } else if (next.phase === "down" && next.button === 0) commit();
    },
    key: (keyEvent) => {
      const action = feedValueKey(input, keyEvent.key);
      if (action === "cancel") finish();
      else if (action === "commit") commit();
      else if (action === "consumed") preview();
      return action !== "none";
    },
    cancel: finish,
  };
};
