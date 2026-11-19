// Rotate a room by one of four grips on its bounding box (SketchUp rotation grips), about the box centre
// (spec/builder/screens/floor-builder.md#rotating-rooms). Normal: free, but the dragged grip locks onto
// each quarter turn (0/90/180/270°) while it is within a screen capture of that mark ("smart lock");
// Shift: quarter turns only; Ctrl (or Magnetic off): no snapping. Typed degrees are exact.
import { setAreaTransformCommand } from "@shared/domain/commands/areaCommands";
import { computeAreaLocalGeometry } from "@shared/geometry/areaGeometry";
import { regionRings } from "@shared/geometry/region";
import type { Vec2 } from "@shared/geometry/vector";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { OverlayPrimitive, RuntimePointerEvent, ScreenPoint } from "../../../renderer/runtimeTypes";
import { hoveredHandle } from "../services/handleHover";
import { toFloor } from "./planGeometry";
import { autoSelectFor, finishTool, floorOf, magnetic, unitOf } from "./toolContext";
import type { ToolFactory } from "./toolTypes";
import { createValueInput, feedValueKey, hasTyped, readoutOf, valueOf } from "./valueInput";

/** Screen radius for grabbing a grip (implementation convention). */
const gripPx = 12;
/** Screen capture within which the dragged grip locks onto a quarter-turn mark (implementation convention). */
const quarterLockPx = 16;

type Grips = Readonly<{
  area: AreaValue;
  /** Box centre (floor mm), the pivot. */
  pivot: Vec2;
  /** Side midpoints of the room's local bounding box (floor mm): +x, +y, −x, −y in the room's axes. */
  points: readonly Vec2[];
  /** Height the grips are drawn and dragged at: the room's tallest wall (0 without walls). */
  hMm: number;
}>;

const rotateAbout = (point: Vec2, pivot: Vec2, degrees: number): Vec2 => {
  const r = (degrees * Math.PI) / 180;
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: pivot.x + dx * Math.cos(r) - dy * Math.sin(r),
    y: pivot.y + dx * Math.sin(r) + dy * Math.cos(r),
  };
};

const angleOf = (from: Vec2, to: Vec2): number => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

/** Signed −180…180. */
const wrap = (degrees: number): number => ((((degrees + 180) % 360) + 360) % 360) - 180;

/** Grips from the room's footprint and walls (area frame), placed in the floor. */
const gripsOf = (area: AreaValue): Grips | undefined => {
  const local = computeAreaLocalGeometry(area);
  const points = [
    ...regionRings(local.union.region).flat(),
    ...local.realWalls.flatMap((wall) => wall.pieces.flatMap((piece) => piece.ring)),
  ];
  if (points.length === 0) return undefined;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  return {
    area,
    pivot: toFloor(area, center),
    points: [
      { x: maxX, y: center.y },
      { x: center.x, y: maxY },
      { x: minX, y: center.y },
      { x: center.x, y: minY },
    ].map((point) => toFloor(area, point)),
    hMm: Math.max(0, ...local.realWalls.map((wall) => wall.heightMm)),
  };
};

const idleHint =
  "Drag a grip of the selected room to rotate it. Shift-click flips Auto-select for one click (select another room, or keep the selection).";

export const createRotateAreaTool = (): ToolFactory => (env) => {
  const input = createValueInput("angle");
  let lock:
    | {
        grips: Grips;
        grip: Vec2;
        startAngle: number;
        /** Raw pointer turn, degrees. */
        raw: number;
        screen: ScreenPoint;
        shift: boolean;
        ctrl: boolean;
      }
    | undefined;

  const screenOf = (point: Vec2, hMm: number): ScreenPoint | null =>
    env.runtime.screenPointOf({ ...point, h: hMm });

  const hoveredArea = (event: RuntimePointerEvent | undefined): string | undefined =>
    event?.hit !== null && event?.hit !== undefined && "areaId" in event.hit ? event.hit.areaId : undefined;

  /**
   * Rooms whose grips show (3.13: hover never selects): the selected rooms, plus with Auto-select the room
   * under the pointer, whose first click then selects it (pointer adapter) before a grip can rotate it.
   */
  const candidates = (event: RuntimePointerEvent | undefined, selectedOnly = false): Grips[] => {
    const floor = floorOf(env);
    if (floor === undefined) return [];
    const { selection } = env.session.ui.getState();
    const autoSelect = event !== undefined && autoSelectFor(env, event);
    const hovered = selectedOnly || !autoSelect ? undefined : hoveredArea(event);
    return floor.areas
      .filter((area) => selection.includes(area.id) || area.id === hovered)
      .map(gripsOf)
      .filter((grips): grips is Grips => grips !== undefined);
  };

  const gripAt = (
    event: RuntimePointerEvent,
    selectedOnly = false,
  ): { grips: Grips; grip: Vec2 } | undefined => {
    let best: { grips: Grips; grip: Vec2 } | undefined;
    let bestPx = gripPx;
    for (const grips of candidates(event, selectedOnly))
      for (const grip of grips.points) {
        const s = screenOf(grip, grips.hMm);
        if (s === null) continue;
        const d = Math.hypot(s.x - event.screen.x, s.y - event.screen.y);
        if (d <= bestPx) {
          best = { grips, grip };
          bestPx = d;
        }
      }
    return best;
  };

  const gripOverlay = (grips: Grips, hot: Vec2 | undefined): OverlayPrimitive[] =>
    grips.points.map((point): OverlayPrimitive =>
      point === hot
        ? hoveredHandle({ ...point, h: grips.hMm }, "dot", 10)
        : { kind: "point", at: { ...point, h: grips.hMm }, marker: "dot", sizePx: 10, tone: "accent" },
    );

  /** The turn to apply and how it was reached. */
  const turnOf = (
    state: NonNullable<typeof lock>,
  ): { degrees: number; locked: number | undefined; label: string } => {
    if (hasTyped(input))
      return { degrees: valueOf(input, state.raw, unitOf(env)), locked: undefined, label: "" };
    if (state.ctrl || !magnetic(env)) return { degrees: state.raw, locked: undefined, label: "Free (Ctrl)" };
    const quarter = Math.round(state.raw / 90) * 90;
    if (state.shift) return { degrees: quarter, locked: quarter, label: "Quarter turn (Shift)" };
    const { grips } = state;
    const dragged = screenOf(rotateAbout(state.grip, grips.pivot, state.raw), grips.hMm);
    const mark = screenOf(rotateAbout(state.grip, grips.pivot, quarter), grips.hMm);
    if (
      dragged !== null &&
      mark !== null &&
      Math.hypot(dragged.x - mark.x, dragged.y - mark.y) <= quarterLockPx
    )
      return { degrees: quarter, locked: quarter, label: "Quarter turn" };
    return { degrees: state.raw, locked: undefined, label: "" };
  };

  const preview = (): void => {
    if (lock === undefined) return;
    const { grips } = lock;
    const turn = turnOf(lock);
    env.runtime.setAreaPreviewTransform(grips.area.id, {
      positionMm: rotateAbout(grips.area.positionMm, grips.pivot, turn.degrees),
      rotationDeg: grips.area.rotationDeg + turn.degrees,
    });
    const h = grips.hMm;
    const current = rotateAbout(lock.grip, grips.pivot, turn.degrees);
    const marks: OverlayPrimitive[] = [0, 90, 180, 270].map((quarter) => {
      const at = rotateAbout(lock?.grip ?? current, grips.pivot, quarter);
      const hot = turn.locked !== undefined && ((turn.locked % 360) + 360) % 360 === quarter;
      return {
        kind: "point",
        at: { ...at, h },
        marker: "dot",
        sizePx: hot ? 14 : 8,
        tone: hot ? "accent" : "neutral",
      };
    });
    env.setOverlay([
      { kind: "point", at: { ...grips.pivot, h }, marker: "cross", tone: "accent" },
      ...marks,
      { kind: "segment", from: { ...grips.pivot, h }, to: { ...current, h }, dashed: true, tone: "accent" },
    ]);
    env.setCue(turn.label === "" ? undefined : { lines: [], marker: { ...current, h }, label: turn.label });
    env.setReadout({ text: readoutOf(input, wrap(turn.degrees), unitOf(env)), screen: lock.screen });
  };

  const reset = (): void => {
    if (lock !== undefined) env.runtime.setAreaPreviewTransform(lock.grips.area.id, null);
    lock = undefined;
    input.typed = "";
    finishTool(env);
    env.setHint(idleHint);
  };

  const commit = (): void => {
    if (lock === undefined) return;
    const { grips } = lock;
    const degrees = turnOf(lock).degrees;
    reset();
    if (Math.abs(wrap(degrees)) < 0.001 && degrees % 360 === 0) return;
    const position = rotateAbout(grips.area.positionMm, grips.pivot, degrees);
    env.session.execute(
      setAreaTransformCommand(
        env.session.ui.getState().activeFloorId,
        grips.area.id,
        { x: Math.round(position.x * 10) / 10, y: Math.round(position.y * 10) / 10 },
        Math.round((grips.area.rotationDeg + degrees) * 1000) / 1000,
        "Rotate area",
      ),
    );
  };

  env.setHint(idleHint);
  return {
    isActive: () => lock !== undefined,
    // The room a press would act on (grip or body); the pointer adapter's Auto-select uses it (3.13).
    target: (event) =>
      lock === undefined ? (gripAt(event)?.grips.area.id ?? hoveredArea(event)) : lock.grips.area.id,
    pointer: (event) => {
      if (lock !== undefined) {
        if (event.phase === "move") {
          lock.shift = event.shiftKey;
          lock.ctrl = event.ctrlKey;
          lock.screen = event.screen;
          const plan = env.runtime.planPointAt(event.screen.x, event.screen.y, lock.grips.hMm);
          if (plan !== null) lock.raw = wrap(angleOf(lock.grips.pivot, plan) - lock.startAngle);
          preview();
        } else if (event.phase === "down" && event.button === 0) commit();
        return;
      }
      if (event.phase === "move" || event.phase === "leave") {
        const hot = event.phase === "move" ? gripAt(event) : undefined;
        env.setOverlay(
          candidates(event.phase === "move" ? event : undefined).flatMap((grips) =>
            gripOverlay(grips, hot?.grip),
          ),
        );
        env.setCursor(hot === undefined ? "default" : "rotate");
        return;
      }
      if (event.phase !== "down" || event.button !== 0) return;
      // Rotation starts only from a grip of a selected room; the tool never writes selection (3.13).
      const grabbed = gripAt(event, true);
      if (grabbed === undefined) return;
      lock = {
        grips: grabbed.grips,
        grip: grabbed.grip,
        startAngle: angleOf(grabbed.grips.pivot, grabbed.grip),
        raw: 0,
        screen: event.screen,
        shift: event.shiftKey,
        ctrl: false,
      };
      env.setHint(
        "Turn the grip; it locks at each quarter turn. Shift: quarter turns only. Ctrl: no snapping. Type degrees; click to place. Esc cancels.",
      );
      preview();
    },
    key: (event) => {
      if (lock === undefined) return false;
      const action = feedValueKey(input, event.key);
      if (action === "cancel") reset();
      else if (action === "commit") commit();
      else if (action === "consumed") preview();
      return action !== "none";
    },
    cancel: reset,
  };
};
