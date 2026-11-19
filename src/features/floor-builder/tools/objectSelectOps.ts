// Objects in Select (owner, Phase 5 follow-up): hovering an object outlines its box and names it; a selected
// object shows its box (drawn by the viewport) with a Move cross at its bottom centre. Move follows the
// pointer on the floor plan with inference (Ctrl: free); one drag is one undo step. Turning is the Rotate
// tool's (Q), as for everything else. Wall-hosted objects slide along their wall with Nudge instead.
import { setPropertyCommand } from "@shared/domain/commands/propertyCommands";
import { indexEntities } from "@shared/domain/house/entityIndex";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { AreableInstanceValue } from "@shared/domain/schemas/instances";
import type { Vec2 } from "@shared/geometry/vector";
import type { OverlayPrimitive, PlanPoint3, RuntimePointerEvent } from "../../../renderer/runtimeTypes";
import { inferFloorPoint } from "../inference/toolInference";
import { hoveredHandle } from "../services/handleHover";
import { pickedEntity } from "./instanceDrag";
import { toAreaLocal } from "./planGeometry";
import { areaById, finishTool, houseOf } from "./toolContext";
import type { ToolEnv } from "./toolTypes";

const handleHitPx = 11;

type Selected = Readonly<{ area: AreaValue; object: AreableInstanceValue; corners: readonly PlanPoint3[] }>;

/** The 12 edges of a box (corners: bottom 4, then top 4). */
export const boxEdges = (
  corners: readonly PlanPoint3[],
  tone: "accent" | "accentStrong",
): OverlayPrimitive[] => {
  const pairs: (readonly [number, number])[] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  return pairs.flatMap(([a, b]) => {
    const from = corners[a];
    const to = corners[b];
    return from === undefined || to === undefined ? [] : [{ kind: "segment" as const, from, to, tone }];
  });
};

const average = (points: readonly PlanPoint3[]): PlanPoint3 => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / Math.max(points.length, 1),
  y: points.reduce((sum, p) => sum + p.y, 0) / Math.max(points.length, 1),
  h: points.reduce((sum, p) => sum + p.h, 0) / Math.max(points.length, 1),
});

/** The Move cross: the middle of the box's bottom. */
export const objectMovePoint = (corners: readonly PlanPoint3[]): PlanPoint3 | null =>
  corners.length < 4 ? null : average(corners.slice(0, 4));

/** The selected object's handle as an overlay primitive (the box itself is drawn by the viewport). */
export const objectHandlesOverlay = (corners: readonly PlanPoint3[]): OverlayPrimitive[] => {
  const move = objectMovePoint(corners);
  return move === null ? [] : [{ kind: "point", at: move, marker: "cross", sizePx: 12, tone: "accent" }];
};

export type ObjectSelectOps = Readonly<{
  isActive: () => boolean;
  hover: (event: RuntimePointerEvent) => boolean;
  down: (event: RuntimePointerEvent) => boolean;
  pointer: (event: RuntimePointerEvent) => void;
  key: (event: KeyboardEvent) => boolean;
  cancel: () => void;
}>;

export const createObjectSelectOps = (env: ToolEnv): ObjectSelectOps => {
  let op:
    | {
        target: Selected;
        startLocal: Vec2;
        /** Where the press was on the floor plan (the preview's offset). */
        startPlan: Vec2;
        positionMm: Vec2 | undefined;
      }
    | undefined;
  let showingHover = false;

  const selected = (): Selected | undefined => {
    const { selection } = env.session.ui.getState();
    if (selection.length !== 1 || selection[0] === undefined) return undefined;
    const ref = indexEntities(houseOf(env)).get(selection[0]);
    if (ref?.kind !== "object" || ref.value.attachment.host === "wall") return undefined;
    const area = areaById(env, ref.areaId);
    const corners = env.runtime.instanceBounds(ref.id);
    return area === undefined || corners === null ? undefined : { area, object: ref.value, corners };
  };

  /** The selected object whose Move cross is under the pointer, with the cross. */
  const moveHandleAt = (
    event: RuntimePointerEvent,
  ): Readonly<{ target: Selected; at: PlanPoint3 }> | undefined => {
    const target = selected();
    if (target === undefined) return undefined;
    const at = objectMovePoint(target.corners);
    if (at === null) return undefined;
    const screen = env.runtime.screenPointOf(at);
    return screen !== null && Math.hypot(screen.x - event.screen.x, screen.y - event.screen.y) <= handleHitPx
      ? { target, at }
      : undefined;
  };

  const clearHover = (): void => {
    if (!showingHover) return;
    showingHover = false;
    env.setOverlay([]);
    env.setCue(undefined);
    env.setCursor("default");
  };

  const end = (): void => {
    op = undefined;
    finishTool(env);
    env.setHint("");
  };

  const refresh = (event: RuntimePointerEvent): void => {
    if (op === undefined || event.plan === null) return;
    const { target } = op;
    const point = event.ctrlKey ? event.plan : inferFloorPoint(env, event.plan);
    const local = toAreaLocal(target.area, point);
    op.positionMm = {
      x: Math.round(target.object.positionMm.x + local.x - op.startLocal.x),
      y: Math.round(target.object.positionMm.y + local.y - op.startLocal.y),
    };
    const dx = point.x - op.startPlan.x;
    const dy = point.y - op.startPlan.y;
    const moved = target.corners.map((corner) => ({ ...corner, x: corner.x + dx, y: corner.y + dy }));
    env.session.preview(
      setPropertyCommand(houseOf(env), [target.object.id], ["positionMm"], op.positionMm, "Move object"),
    );
    env.setOverlay(boxEdges(moved, "accentStrong"));
    env.setHint("Moving the object: click to place. Ctrl: no snapping. Esc cancels.");
  };

  const commit = (): void => {
    const current = op;
    end();
    if (current?.positionMm === undefined) return;
    env.session.execute(
      setPropertyCommand(
        houseOf(env),
        [current.target.object.id],
        ["positionMm"],
        current.positionMm,
        "Move object",
      ),
    );
  };

  return {
    isActive: () => op !== undefined,
    hover: (event) => {
      if (event.phase === "leave") {
        clearHover();
        return false;
      }
      const found = moveHandleAt(event);
      if (found !== undefined) {
        showingHover = true;
        env.setOverlay([hoveredHandle(found.at, "cross", 12)]);
        env.setCue({ lines: [], marker: null, label: "Move object" });
        env.setCursor("move");
        return true;
      }
      const picked = pickedEntity(env, event);
      // Doors and windows outline their own box too (Phase 15.8).
      if (picked?.kind === "object" || picked?.kind === "opening") {
        const corners = env.runtime.instanceBounds(picked.id);
        showingHover = true;
        env.setOverlay(corners === null ? [] : boxEdges(corners, "accent"));
        env.setCue({ lines: [], marker: null, label: picked.value.name });
        env.setCursor("default");
        return true;
      }
      clearHover();
      return false;
    },
    down: (event) => {
      if (event.button !== 0 || event.plan === null) return false;
      const found = moveHandleAt(event);
      if (found === undefined) return false;
      op = {
        target: found.target,
        startLocal: toAreaLocal(found.target.area, event.plan),
        startPlan: { x: event.plan.x, y: event.plan.y },
        positionMm: undefined,
      };
      env.setCursor("move");
      // Nothing moves on the press itself (Phase 19.6: a quick click never nudges); the box shows it is grabbed.
      env.setOverlay(boxEdges(found.target.corners, "accentStrong"));
      env.setHint("Moving the object: click to place. Ctrl: no snapping. Esc cancels.");
      return true;
    },
    pointer: (event) => {
      if (op === undefined) return;
      if (event.phase === "move") refresh(event);
      else if (event.phase === "down" && event.button === 0) commit();
    },
    key: (event) => {
      if (op === undefined || event.key !== "Escape") return false;
      end();
      return true;
    },
    cancel: end,
  };
};
