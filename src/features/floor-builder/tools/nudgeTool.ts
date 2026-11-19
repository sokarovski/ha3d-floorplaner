// Nudge (M): the only tool that moves things (owner F20). Overview: rooms (by wall or floor), objects, and
// lights. Room Editor: floor shapes (edge/corner/inside snapping), carpets, objects, lights, and openings
// sliding along their wall. Select never moves anything.
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import { indexEntities } from "@shared/domain/house/entityIndex";
import type { EntityRef } from "@shared/domain/house/entityIndex";
import { pointInRegion } from "@shared/geometry/region";
import { shapeOutline } from "@shared/geometry/shapeOutline";
import type { Vec2 } from "@shared/geometry/vector";
import type { OverlayPrimitive, RuntimePointerEvent } from "../../../renderer/runtimeTypes";
import type { InferenceCue } from "../inference/inferenceTypes";
import { hoveredHandle } from "../services/handleHover";
import { inferenceCapturePx } from "../inference/inferPoint";
import { boxOverlay, boxPointAt, boxPointLabel, elementBoxOf } from "./elementBox";
import type { InstanceDrag } from "./instanceDrag";
import { pickedEntity, startInstanceDrag } from "./instanceDrag";
import { roomHandleAt, roomHandleCue, roomHandleOverlay, startRoomMove } from "./roomMove";
import { toAreaLocal } from "./planGeometry";
import { grabOf, shapeRingInFloor, startShapeNudge } from "./shapeNudge";
import { autoSelectFor, finishTool, focusArea, houseOf } from "./toolContext";
import type { ToolFactory } from "./toolTypes";
import type { WallOperation } from "./wallPushPull";
import { startRoofMove } from "./roofTools";
import { floorOf } from "./toolContext";

/** The topmost shape under an area-local point, or one whose outline is within the radius. */
const shapeNear = (shapes: readonly ShapeValue[], local: Vec2, radiusMm: number): ShapeValue | undefined => {
  for (let index = shapes.length - 1; index >= 0; index -= 1) {
    const shape = shapes[index];
    if (shape === undefined) continue;
    const ring = shapeOutline(shape).ring;
    if (pointInRegion(local, { polygons: [{ outer: ring, holes: [] }] })) return shape;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (a === undefined || b === undefined) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(1, ((local.x - a.x) * dx + (local.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
      );
      if (Math.hypot(local.x - (a.x + t * dx), local.y - (a.y + t * dy)) <= radiusMm) return shape;
    }
  }
  return undefined;
};

/** Screen radius for grabbing a box point (as room corners). */
const grabPointPx = 10;

export const createNudgeTool = (): ToolFactory => (env) => {
  let operation: WallOperation | undefined;
  let instance: InstanceDrag | undefined;

  const targetAt = (event: RuntimePointerEvent): string | undefined => {
    const picked = pickedEntity(env, event);
    if (picked !== undefined) return picked.id;
    // A canopy drawn in the floor or room view (19.5): Move moves it whole without entering it.
    if (event.hit?.kind === "roof") return event.hit.roofId;
    if (env.session.ui.getState().mode === "overview") {
      const handle = roomHandleAt(env, event);
      return handle?.kind === "edge" ? handle.edge.areaId : handle?.areaId;
    }
    const area = focusArea(env);
    return area === undefined || event.plan === null
      ? undefined
      : shapeNear(
          area.floor.shapes,
          toAreaLocal(area, event.plan),
          inferenceCapturePx * env.runtime.worldUnitsPerPixel(),
        )?.id;
  };

  /** Edit targets come only from selection. Cursor hits are used by the optional click-selection guard. */
  const selectedTarget = (event: RuntimePointerEvent): EntityRef | undefined => {
    const ui = env.session.ui.getState();
    const entities = indexEntities(houseOf(env));
    const selected = ui.selection.flatMap<EntityRef>((id) => {
      const ref = entities.get(id);
      if (ref === undefined || !("floorId" in ref) || ref.floorId !== ui.activeFloorId) return [];
      if (ref.kind === "area") return ui.mode === "overview" ? [ref] : [];
      if (ref.kind === "roof") return ref.value.cutsWalls ? [] : [ref];
      if (ref.kind === "shape") return ui.mode === "area" && ref.areaId === ui.focusAreaId ? [ref] : [];
      if (
        ref.kind !== "object" &&
        ref.kind !== "objectGroup" &&
        ref.kind !== "light" &&
        ref.kind !== "carpet" &&
        ref.kind !== "opening"
      )
        return [];
      return ui.mode === "overview" || ref.areaId === ui.focusAreaId ? [ref] : [];
    });
    const clickedId = targetAt(event);
    return selected.find((ref) => ref.id === clickedId) ?? selected[0];
  };

  /**
   * Room Editor hover (owner, Phase 4.2 follow-up): what a press would grab on the selected shape — a corner,
   * an edge, its centre or a circle quadrant, or the whole shape — highlighted and named before the drag.
   */
  const shapeHover = (
    event: RuntimePointerEvent,
  ): Readonly<{ overlay: OverlayPrimitive[]; cue: InferenceCue }> | undefined => {
    const target = selectedTarget(event);
    const area = focusArea(env);
    if (target?.kind !== "shape" || area === undefined || event.plan === null) return undefined;
    const radius = inferenceCapturePx * env.runtime.worldUnitsPerPixel();
    const grab = grabOf(area, target.value, event.plan, radius);
    const dot = (
      point: Vec2,
      label: string,
      shape: "dot" | "cross" = "dot",
    ): Readonly<{ overlay: OverlayPrimitive[]; cue: InferenceCue }> => ({
      overlay: [hoveredHandle(point, shape, shape === "cross" ? 12 : 8)],
      cue: { lines: [], marker: { ...point, h: 0 }, label },
    });
    if (grab.kind === "corner") return dot(grab.point, "Corner");
    if (grab.kind === "edge")
      return {
        overlay: [
          { kind: "segment", from: grab.a, to: grab.b, tone: "accent" },
          hoveredHandle(grab.a),
          hoveredHandle(grab.b),
        ],
        cue: { lines: [], marker: { ...event.plan, h: 0 }, label: "Edge" },
      };
    if (grab.anchor !== undefined)
      return grab.anchor === "center" ? dot(grab.point, "Centre", "cross") : dot(grab.point, "Quadrant");
    const ring = shapeRingInFloor(area, target.value);
    if (!pointInRegion(event.plan, { polygons: [{ outer: ring, holes: [] }] })) return undefined;
    return {
      overlay: [{ kind: "polygon", points: ring, fillOpacity: 0.12, outline: true, tone: "accent" }],
      cue: { lines: [], marker: { ...event.plan, h: 0 }, label: "Shape" },
    };
  };

  /**
   * The selected carpet, object, or light (owner, Phase 5 follow-up): its box with corner, edge-midpoint,
   * and centre points like a room's; the point under the pointer lights up and is what a press grabs.
   */
  const boxHover = (
    event: RuntimePointerEvent,
  ): Readonly<{ overlay: OverlayPrimitive[]; cue: InferenceCue | undefined }> | undefined => {
    const target = selectedTarget(event);
    const box = target === undefined ? undefined : elementBoxOf(env, target);
    if (box === undefined) return undefined;
    const hot = boxPointAt(env, box, event.screen, grabPointPx);
    return {
      overlay: boxOverlay(box, hot),
      cue:
        hot === undefined
          ? undefined
          : { lines: [], marker: { ...hot.at, h: box.hMm }, label: boxPointLabel(hot.kind) },
    };
  };

  const start = (event: RuntimePointerEvent): void => {
    if (autoSelectFor(env, event) && targetAt(event) === undefined) return;
    const target = selectedTarget(event);
    if (target === undefined || event.plan === null) return;
    if (target.kind === "area") {
      const handle = roomHandleAt(env, event, [target.id]) ?? {
        kind: "floor",
        areaId: target.id,
        point: event.plan,
      };
      operation = startRoomMove(env, target.value, handle, event, () => {
        operation = undefined;
      });
    } else if (target.kind === "roof") {
      // A canopy (19.5): the whole roof moves (plan, ↑ its height) from where it was pressed, as in its own level.
      const floor = floorOf(env);
      if (floor === undefined) return;
      const roof = target.value;
      const grab =
        event.hit?.kind === "roof" && event.hit.roofId === roof.id
          ? event.hit.pointMm
          : { ...event.plan, h: roof.eaveHeightMm + roof.thicknessMm };
      operation = startRoofMove(env, { floor, roof }, [], true, grab, event, () => {
        operation = undefined;
      });
    } else if (target.kind === "shape") {
      const area = focusArea(env);
      if (area === undefined) return;
      const radius = inferenceCapturePx * env.runtime.worldUnitsPerPixel();
      operation = startShapeNudge(
        env,
        target.value,
        grabOf(area, target.value, event.plan, radius),
        event,
        target.carpetId,
        () => {
          operation = undefined;
        },
      );
    } else {
      const box = elementBoxOf(env, target);
      const hot = box === undefined ? undefined : boxPointAt(env, box, event.screen, grabPointPx);
      instance = startInstanceDrag(env, target, hot?.at ?? event.plan, hot !== undefined, box);
    }
  };

  env.setHint(
    "Click or drag to move the current selection. Auto-select on: clicking a different target selects it first; Shift-click flips that for one click. While moving: Shift red/green axis, Ctrl free move.",
  );
  return {
    isActive: () => operation !== undefined || instance !== undefined,
    target: targetAt,
    pointer: (event) => {
      if (operation !== undefined) {
        operation.pointer(event);
        return;
      }
      if (instance !== undefined) {
        if (event.phase === "move") instance.move(event);
        else if (event.phase === "down" && event.button === 0) {
          const current = instance;
          instance = undefined;
          current.release();
        }
        return;
      }
      if (event.phase === "move" || event.phase === "leave") {
        const ui = env.session.ui.getState();
        const target = selectedTarget(event);
        const handle =
          event.phase === "leave" || ui.mode !== "overview"
            ? undefined
            : roomHandleAt(
                env,
                event,
                autoSelectFor(env, event) ? undefined : target?.kind === "area" ? [target.id] : [],
              );
        const shape = event.phase === "leave" || ui.mode === "overview" ? undefined : shapeHover(event);
        const box = event.phase === "leave" ? undefined : boxHover(event);
        env.setOverlay(
          shape?.overlay ?? box?.overlay ?? (handle === undefined ? [] : roomHandleOverlay(handle)),
        );
        env.setCue(shape?.cue ?? box?.cue ?? (handle === undefined ? undefined : roomHandleCue(handle)));
        env.setCursor(
          event.phase === "leave" || target === undefined || (target.kind === "shape" && shape === undefined)
            ? "default"
            : "move",
        );
      }
      if (event.phase === "down" && event.button === 0) start(event);
    },
    key: (event) => operation?.key(event) ?? false,
    cancel: () => {
      operation?.cancel();
      operation = undefined;
      instance = undefined;
      finishTool(env);
    },
  };
};
