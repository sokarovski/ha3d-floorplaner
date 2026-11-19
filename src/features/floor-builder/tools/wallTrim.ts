// Trim / extend (spec/builder/screens/floor-builder.md#trim-extend-remove-and-split-walls-with-their-vertical-lines):
// drag a wall's highlighted vertical end line along its edge. The pointer is read on the horizontal plane at
// the height where the line was grabbed, so pointing at the wall itself works in 3D. Stops: corners, other
// wall ends, points in line, extensions, guides. Pushing onto the other end removes the wall; past a corner
// continues onto the next edge. Release after a drag, a second click, or a typed distance and Enter commits.
import {
  extendPastCornerCommand,
  minWallSpanMm,
  setWallSpanCommand,
} from "@shared/domain/commands/wallCommands";
import type { Vec2 } from "@shared/geometry/vector";
import type { OverlayPrimitive, RuntimePointerEvent, ScreenPoint } from "../../../renderer/runtimeTypes";
import type { AlongStop } from "../inference/inferAlong";
import { inferAlong } from "../inference/inferAlong";
import { inferenceCapturePx } from "../inference/inferPoint";
import { inferenceSceneOf } from "../inference/inferenceScene";
import type { WallEndLine } from "./planGeometry";
import { alongEdge, boundaryPieces, pointOnEdge, wallById, wallEndLines } from "./planGeometry";
import { distance } from "./snapping";
import { finishTool, floorOf, focusArea, magnetic, snapFloor, unitOf } from "./toolContext";
import type { ToolEnv } from "./toolTypes";
import { createValueInput, feedValueKey, hasTyped, readoutOf, valueOf } from "./valueInput";
import type { WallHandle } from "./wallHandles";
import type { WallOperation } from "./wallPushPull";

const along = (line: WallEndLine, point: Vec2): number => alongEdge(line, point);

const pointAt = (line: WallEndLine, mm: number): Vec2 => pointOnEdge(line, mm);

/** Arc positions wrap at the full turn: pick the copy nearest the previous value so drags stay continuous. */
const unwrap = (line: WallEndLine, value: number, previous: number): number => {
  if (line.arc === null) return value;
  const turn = line.edgeLengthMm;
  return value + Math.round((previous - value) / turn) * turn;
};

export const startTrim = (
  env: ToolEnv,
  handle: Extract<WallHandle, { kind: "end" }>,
  event: RuntimePointerEvent,
  onDone: () => void,
): WallOperation | undefined => {
  const area = focusArea(env);
  if (area === undefined) return undefined;
  let line = handle.line;
  let heightMm = handle.heightMm;
  const grabH = Math.max(
    0,
    Math.min(heightMm, env.runtime.heightOnVertical(event.screen.x, event.screen.y, line.point) ?? 0),
  );
  const original = line.alongMm;
  const ends = wallEndLines(area);
  const sameEdge = (candidate: WallEndLine): boolean =>
    line.arc !== null || candidate.arc !== null
      ? line.arc !== null &&
        candidate.arc !== null &&
        distance(candidate.arc.centerMm, line.arc.centerMm) < 1 &&
        Math.abs(candidate.arc.radiusMm - line.arc.radiusMm) < 1
      : distance(candidate.edgeStart, line.edgeStart) < 1 && distance(candidate.edgeEnd, line.edgeEnd) < 1;
  /** At a seam (after a split) the neighbour's end line coincides; the drag direction picks the wall. */
  const seamPartner = ends.find(
    (candidate) =>
      candidate.wallId !== line.wallId &&
      candidate.end !== line.end &&
      sameEdge(candidate) &&
      distance(candidate.point, line.point) < 1,
  );
  let sideDecided = seamPartner === undefined;
  let otherPosition = 0;
  let stops: AlongStop[] = [];
  const selectLine = (next: WallEndLine): void => {
    line = next;
    heightMm = area.walls.find((wall) => wall.id === next.wallId)?.heightMm ?? heightMm;
    const other = ends.find((candidate) => candidate.wallId === next.wallId && candidate.end !== next.end);
    otherPosition = other === undefined ? (next.end === "start" ? next.edgeLengthMm : 0) : other.alongMm;
    stops = [
      { alongMm: 0, label: "Corner" },
      { alongMm: next.edgeLengthMm, label: "Corner" },
      { alongMm: otherPosition, label: "Other end: removes the wall" },
      ...ends
        .filter((candidate) => candidate.wallId !== next.wallId && sameEdge(candidate))
        .map((candidate) => ({ alongMm: candidate.alongMm, label: "Wall end" })),
    ];
  };
  selectLine(line);
  const decideSide = (moved: number): void => {
    if (sideDecided || seamPartner === undefined || Math.abs(moved) < minWallSpanMm) return;
    sideDecided = true;
    const intoNeighbour = line.end === "end" ? moved > 0 : moved < 0;
    if (intoNeighbour) selectLine(seamPartner);
  };
  const input = createValueInput("length");
  let screen: ScreenPoint = event.screen;
  let value = original;

  const target = (): number => {
    if (!hasTyped(input)) return value;
    const delta = value - original;
    return (
      original +
      Math.sign(delta || (line.end === "end" ? -1 : 1)) * valueOf(input, Math.abs(delta), unitOf(env))
    );
  };

  const pointerValue = (point: ScreenPoint): number => {
    const plan = env.runtime.planPointAt(point.x, point.y, grabH);
    if (plan === null) return value;
    const raw = unwrap(line, along(line, plan), value);
    const floor = floorOf(env);
    if (floor === undefined || !magnetic(env) || hasTyped(input)) {
      env.setCue(undefined);
      return raw;
    }
    if (line.arc !== null) {
      // Arcs snap to the stops (other wall ends, the start of the circle) only.
      const radius = inferenceCapturePx * env.runtime.worldUnitsPerPixel();
      const stop = stops.find((candidate) => Math.abs(unwrap(line, candidate.alongMm, raw) - raw) <= radius);
      env.setCue(
        stop === undefined
          ? undefined
          : { lines: [], marker: { ...pointAt(line, stop.alongMm), h: grabH }, label: stop.label },
      );
      return stop === undefined ? raw : unwrap(line, stop.alongMm, raw);
    }
    const inferred = inferAlong(
      inferenceSceneOf(snapFloor(env, floor)),
      {
        origin: line.edgeStart,
        direction: {
          x: (line.edgeEnd.x - line.edgeStart.x) / line.edgeLengthMm,
          y: (line.edgeEnd.y - line.edgeStart.y) / line.edgeLengthMm,
        },
      },
      raw,
      env.runtime.worldUnitsPerPixel(),
      { stops, hMm: grabH },
    );
    env.setCue(inferred?.cue);
    return inferred?.alongMm ?? raw;
  };

  const preview = (): void => {
    const next = target();
    const clamped = Math.max(0, Math.min(line.edgeLengthMm, next));
    const removes = Math.abs(clamped - otherPosition) < minWallSpanMm;
    const past = next > line.edgeLengthMm + minWallSpanMm || next < -minWallSpanMm;
    const tone = removes ? "danger" : past ? "warning" : "accent";
    const from = pointAt(line, otherPosition);
    const to = pointAt(line, clamped);
    const overlay: OverlayPrimitive[] = [
      {
        kind: "verticalLine",
        at: pointAt(line, original),
        fromHMm: 0,
        toHMm: heightMm,
        dashed: true,
        tone: "neutral",
      },
      { kind: "verticalLine", at: to, fromHMm: 0, toHMm: heightMm, tone },
      { kind: "segment", from: { ...from, h: heightMm }, to: { ...to, h: heightMm }, tone },
      { kind: "segment", from, to, tone },
      ...(past
        ? [
            {
              kind: "segment" as const,
              from: to,
              to: pointAt(line, next),
              dashed: true,
              tone: "warning" as const,
            },
          ]
        : []),
    ];
    env.setOverlay(overlay);
    env.setReadout({
      text: removes ? "Remove wall" : readoutOf(input, Math.abs(next - original), unitOf(env)),
      screen,
    });
  };

  const finish = (): void => {
    input.typed = "";
    finishTool(env);
    onDone();
  };

  const commit = (): void => {
    const current = focusArea(env);
    const next = target();
    finish();
    if (current === undefined) return;
    const wall = wallById(current, line.wallId);
    if (wall === undefined) return;
    const floorId = env.session.ui.getState().activeFloorId;
    const overshoot = line.arc !== null ? 0 : line.end === "end" ? next - line.edgeLengthMm : -next;
    if (overshoot > minWallSpanMm) {
      const corner = line.end === "end" ? line.edgeEnd : line.edgeStart;
      const neighbor = boundaryPieces(current).find((piece) =>
        line.end === "end"
          ? distance(piece.edgeStart, corner) < 1 && piece.fromMm < 1
          : distance(piece.edgeEnd, corner) < 1 && piece.toMm > piece.edgeLengthMm - 1,
      );
      if (neighbor === undefined) {
        env.session.notify("info", "There is no straight edge to continue onto at this corner.");
        return;
      }
      const length = Math.min(overshoot, neighbor.edgeLengthMm);
      const continuation =
        line.end === "end"
          ? { shapeId: neighbor.shapeId, edgeKey: neighbor.edgeKey, fromMm: 0, toMm: length }
          : {
              shapeId: neighbor.shapeId,
              edgeKey: neighbor.edgeKey,
              fromMm: neighbor.edgeLengthMm - length,
              toMm: neighbor.edgeLengthMm,
            };
      env.session.execute(
        extendPastCornerCommand(floorId, current.id, wall.id, line.end === "end", continuation).command,
      );
      return;
    }
    const startMm = line.end === "start" ? next : otherPosition;
    const endMm = line.end === "end" ? next : otherPosition;
    env.session.execute(setWallSpanCommand(floorId, current.id, wall.id, startMm, endMm));
  };

  env.setCursor("trim");
  preview();
  return {
    pointer: (next) => {
      if (next.phase === "move") {
        screen = next.screen;
        value = pointerValue(next.screen);
        decideSide(value - original);
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
