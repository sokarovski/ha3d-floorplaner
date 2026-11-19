// Dragging placed things: openings and wall-mounted objects slide along their wall (clamped to the span),
// floor/overhead objects, lights, and carpets move in the area plane. One command when placement commits.
import { moveObjectsCommand } from "@shared/domain/commands/objectGroupCommands";
import { setPropertyCommand } from "@shared/domain/commands/propertyCommands";
import { indexEntities, objectGroupOf } from "@shared/domain/house/entityIndex";
import type { EntityRef } from "@shared/domain/house/entityIndex";
import type { Vec2 } from "@shared/geometry/vector";
import type { OverlayPrimitive, RuntimePointerEvent } from "../../../renderer/runtimeTypes";
import { inferFloorPoint } from "../inference/toolInference";
import type { ElementBox } from "./elementBox";
import { toAreaLocal, wallEndLines } from "./planGeometry";
import { areaById, finishTool, houseOf } from "./toolContext";
import type { ToolEnv } from "./toolTypes";
import { constrainMove, moveAxisCue } from "./moveModifiers";
import { fitUnderRoof, lightTopLimitMm, wallItemTopLimitMm } from "@shared/geometry/roofItems";
import { heightToleranceMm } from "@shared/geometry/tolerances";

export type InstanceDrag = Readonly<{ move: (event: RuntimePointerEvent) => void; release: () => void }>;

const alongWall = (
  env: ToolEnv,
  areaId: string,
  wallId: string,
  point: Vec2,
): Readonly<{ along: number; length: number; at: (mm: number) => Vec2 }> | undefined => {
  const area = areaById(env, areaId);
  if (area === undefined) return undefined;
  const start = wallEndLines(area).find((line) => line.wallId === wallId && line.end === "start");
  const end = wallEndLines(area).find((line) => line.wallId === wallId && line.end === "end");
  if (start === undefined || end === undefined) return undefined;
  const dx = end.point.x - start.point.x;
  const dy = end.point.y - start.point.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return undefined;
  return {
    along: ((point.x - start.point.x) * dx + (point.y - start.point.y) * dy) / length,
    length,
    at: (mm) => ({ x: start.point.x + (dx * mm) / length, y: start.point.y + (dy * mm) / length }),
  };
};

const numberParameter = (parameters: Readonly<Record<string, unknown>>, key: string): number => {
  const value = parameters[key];
  return typeof value === "number" ? value : 0;
};

/**
 * Starts a drag for the picked entity, or returns undefined when it cannot be dragged. With `grabbedPoint`
 * the press took a box corner, edge midpoint, or centre (owner, Phase 5 follow-up): that point follows the
 * pointer's inference (endpoints, edges, axes), as a room corner does; Shift locks an axis, Ctrl is free.
 */
export const startInstanceDrag = (
  env: ToolEnv,
  ref: EntityRef,
  origin: Vec2,
  grabbedPoint = false,
  /** The thing's box, drawn moved with it. */
  box?: ElementBox,
): InstanceDrag | undefined => {
  if (ref.kind === "objectGroup") return startGroupDrag(env, ref, origin, grabbedPoint, box);
  let result: { path: readonly string[]; value: unknown; marker: Vec2 } | undefined;
  const pointerPoint = (event: RuntimePointerEvent): Vec2 | undefined => {
    if (event.plan === null) return undefined;
    if (grabbedPoint && !event.shiftKey && !event.ctrlKey) return inferFloorPoint(env, event.plan);
    const offset = constrainMove({ x: event.plan.x - origin.x, y: event.plan.y - origin.y }, event);
    env.setCue(event.shiftKey && !event.ctrlKey ? moveAxisCue(origin, offset) : undefined);
    return { x: origin.x + offset.x, y: origin.y + offset.y };
  };
  const commit = (): void => {
    finishTool(env);
    if (result === undefined) return;
    const house = houseOf(env);
    env.session.execute(
      setPropertyCommand(
        house,
        [ref.id],
        result.path,
        result.value,
        ref.kind === "opening" ? "Move opening" : "Move",
      ),
    );
  };
  const show = (marker: Vec2, tone: "accent" | "danger" = "accent"): void => {
    // The thing moves live (owner, Phase 5 follow-up); the cross marks the grabbed point.
    if (result !== undefined)
      env.session.preview(setPropertyCommand(houseOf(env), [ref.id], result.path, result.value, "Move"));
    const dx = marker.x - origin.x;
    const dy = marker.y - origin.y;
    const moved: OverlayPrimitive[] =
      box === undefined || ref.kind === "opening"
        ? []
        : [
            {
              kind: "polyline",
              points: box.corners.map((corner) => ({ x: corner.x + dx, y: corner.y + dy, h: box.hMm })),
              closed: true,
              tone: "accentStrong",
            },
          ];
    env.setOverlay([...moved, { kind: "point", at: marker, marker: "cross", sizePx: 14, tone }]);
  };
  /** The window limit refuses this place: the thing stays at its last place under the roof, the cross turns red. */
  const refuse = (marker: Vec2, name: string): void => {
    show(marker, "danger");
    env.setHint(
      `The roof is too low there for the ${name}: it stays where its top is under the roof. Esc cancels.`,
    );
  };
  if (ref.kind === "opening") {
    const width = numberParameter(ref.value.parameters, "widthMm");
    const height = numberParameter(ref.value.parameters, "heightMm");
    const originAlong = alongWall(env, ref.areaId, ref.wallId, origin)?.along;
    if (originAlong === undefined) return undefined;
    return {
      move: (event) => {
        const point = pointerPoint(event);
        if (point === undefined) return;
        const wall = alongWall(env, ref.areaId, ref.wallId, point);
        if (wall === undefined) return;
        const center = Math.min(
          Math.max(ref.value.placement.distanceAlongWallMm + wall.along - originAlong, width / 2),
          Math.max(width / 2, wall.length - width / 2),
        );
        // The window limit (Phase 19.2): a place where the opening's top would be above the roof is refused; the
        // opening stays at its last place under the roof and the cross turns red.
        const floor = houseOf(env).floors.find((candidate) => candidate.id === ref.floorId);
        const limit =
          floor === undefined ? null : wallItemTopLimitMm(floor, ref.areaId, ref.wallId, center, width);
        if (fitUnderRoof(ref.value.placement.bottomMm, height, limit).kind !== "fits") {
          refuse(wall.at(center), ref.value.name);
          return;
        }
        result = {
          path: ["placement", "distanceAlongWallMm"],
          value: Math.round(center),
          marker: wall.at(center),
        };
        show(result.marker);
      },
      release: commit,
    };
  }
  if (ref.kind === "object" || ref.kind === "light" || ref.kind === "carpet") {
    const area = areaById(env, ref.areaId);
    if (area === undefined) return undefined;
    const startLocal = toAreaLocal(area, origin);
    const wallId =
      ref.kind === "object" && ref.value.attachment.host === "wall" ? ref.value.attachment.wallId : undefined;
    const originAlong = wallId === undefined ? undefined : alongWall(env, ref.areaId, wallId, origin)?.along;
    return {
      move: (event) => {
        const point = pointerPoint(event);
        if (point === undefined) return;
        const floor = houseOf(env).floors.find((candidate) => candidate.id === ref.floorId);
        if (wallId !== undefined && ref.kind === "object") {
          const wall = alongWall(env, ref.areaId, wallId, point);
          if (wall === undefined || originAlong === undefined) return;
          const along = Math.min(Math.max(ref.value.positionMm.x + wall.along - originAlong, 0), wall.length);
          // Wall-mounted objects stop under the roof like doors and windows (Phase 19.5): a place where the
          // object's top would be above the underside over its width on its face is refused.
          const limit =
            floor === undefined
              ? null
              : wallItemTopLimitMm(
                  floor,
                  ref.areaId,
                  wallId,
                  along,
                  numberParameter(ref.value.parameters, "widthMm"),
                  [ref.value.attachment.hostSide ?? "interior"],
                );
          const top = ref.value.elevationMm + numberParameter(ref.value.parameters, "heightMm");
          if (limit !== null && top > limit + heightToleranceMm) {
            refuse(wall.at(along), ref.value.name);
            return;
          }
          result = {
            path: ["positionMm"],
            value: { x: Math.round(along), y: ref.value.positionMm.y },
            marker: wall.at(along),
          };
        } else {
          const local = toAreaLocal(area, point);
          const base = ref.value.positionMm;
          const value = {
            x: Math.round(base.x + local.x - startLocal.x),
            y: Math.round(base.y + local.y - startLocal.y),
          };
          // A wall-mounted light (Phase 17.3) stops under the roof too (Phase 19.5), checked on its face.
          if (ref.kind === "light" && ref.value.mount === "wall" && floor !== undefined) {
            const limit = lightTopLimitMm(floor, area, { ...ref.value, positionMm: value });
            if (limit !== null && ref.value.elevationMm > limit + heightToleranceMm) {
              refuse(point, ref.value.name);
              return;
            }
          }
          result = { path: ["positionMm"], value, marker: point };
        }
        show(result.marker);
      },
      release: commit,
    };
  }
  return undefined;
};

/** The entity a pick hit refers to (instances, lights, carpets). */
export const pickedEntity = (env: ToolEnv, event: RuntimePointerEvent): EntityRef | undefined => {
  const hit = event.hit;
  if (hit === null) return undefined;
  const id =
    hit.kind === "object"
      ? hit.instanceId
      : hit.kind === "light"
        ? hit.lightId
        : hit.kind === "carpet" && hit.carpetId !== env.session.ui.getState().focusCarpetId
          ? hit.carpetId
          : undefined;
  if (id === undefined) return undefined;
  const house = houseOf(env);
  const entities = indexEntities(house);
  // A member of a group (object, light, or carpet) stands for its group until the group is opened (double-click
  // a member).
  {
    const grouped = objectGroupOf(house, id);
    if (grouped !== undefined && grouped.group.id !== env.session.ui.getState().focusGroupId)
      return entities.get(grouped.group.id);
  }
  return entities.get(id);
};

/** A group moves as one: every member shifts by the pointer's offset (one command, live preview). */
const startGroupDrag = (
  env: ToolEnv,
  ref: Extract<EntityRef, { kind: "objectGroup" }>,
  origin: Vec2,
  grabbedPoint: boolean,
  box?: ElementBox,
): InstanceDrag | undefined => {
  const area = areaById(env, ref.areaId);
  if (area === undefined) return undefined;
  let delta: Vec2 | undefined;
  const toLocal = (offset: Vec2): Vec2 => {
    const r = (-area.rotationDeg * Math.PI) / 180;
    return {
      x: offset.x * Math.cos(r) - offset.y * Math.sin(r),
      y: offset.x * Math.sin(r) + offset.y * Math.cos(r),
    };
  };
  const command = (offset: Vec2) =>
    moveObjectsCommand(
      env.session.ui.getState().activeFloorId,
      ref.areaId,
      ref.value.memberIds,
      toLocal(offset),
    );
  return {
    move: (event) => {
      if (event.plan === null) return;
      const raw =
        grabbedPoint && !event.shiftKey && !event.ctrlKey ? inferFloorPoint(env, event.plan) : event.plan;
      const offset = constrainMove({ x: raw.x - origin.x, y: raw.y - origin.y }, event);
      env.setCue(event.shiftKey && !event.ctrlKey ? moveAxisCue(origin, offset) : undefined);
      delta = offset;
      env.session.preview(command(offset));
      const moved: OverlayPrimitive[] =
        box === undefined
          ? []
          : [
              {
                kind: "polyline",
                points: box.corners.map((corner) => ({
                  x: corner.x + offset.x,
                  y: corner.y + offset.y,
                  h: box.hMm,
                })),
                closed: true,
                tone: "accentStrong",
              },
            ];
      env.setOverlay([
        ...moved,
        {
          kind: "point",
          at: { x: origin.x + offset.x, y: origin.y + offset.y },
          marker: "cross",
          sizePx: 14,
          tone: "accent",
        },
      ]);
    },
    release: () => {
      finishTool(env);
      if (delta !== undefined && (delta.x !== 0 || delta.y !== 0)) env.session.execute(command(delta));
    },
  };
};
