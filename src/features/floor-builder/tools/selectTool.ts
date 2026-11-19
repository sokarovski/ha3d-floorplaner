// Select never moves anything. Overview picks rooms and instances; Room Editor picks shapes, walls,
// and instances together. Shape handles resize; wall edits use Push/pull, Trim, and Split.
// Shift toggles; empty clicks clear the selection. Handles belong to the selected shape only: they highlight
// on hover, and a locked resize shows its outline, hint, and readout at once (owner, 2026-11-15). Option
// switches a resize between "opposite side fixed" and "about the centre" (circles default to the centre);
// Ctrl resizes without snapping; a circle takes a typed radius (or diameter with Option) (Phase 4.2).
import { replaceShapeCommand } from "@shared/domain/commands/shapeCommands";
import { validatePolygonPoints } from "@shared/geometry/polygonValidation";
import { shapeOutline } from "@shared/geometry/shapeOutline";
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import { pickedEntity } from "./instanceDrag";
import { selectionTargetAt, shapeAt } from "./selectionTarget";
import {
  circleQuadrants,
  deleteVertex,
  dragHandle,
  findHandle,
  insertVertex,
  polygonPoints,
  rectangleCorners,
  rectangleSideMidpoints,
  resizesAboutCenter,
} from "./shapeEditing";
import { hoveredHandle } from "../services/handleHover";
import type { ShapeHandle } from "./shapeEditing";
import { snapCapturePx } from "./snapping";
import { toAreaLocal, toFloor } from "./planGeometry";

import { shapeSetIdOf, finishTool, floorOf, focusArea, unitOf } from "./toolContext";
import { inferFloorPoint } from "../inference/toolInference";
import type { ToolFactory } from "./toolTypes";
import { createValueInput, feedValueKey, hasTyped, readoutOf, valueOf } from "./valueInput";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { OverlayPrimitive, PlanPoint } from "../../../renderer/runtimeTypes";
import { shapeHandleCursor } from "./resizeCursor";
import { createFloorGroupSelectOps } from "./floorGroupSelectOps";
import { createLightSelectOps } from "./lightSelectOps";
import { createObjectSelectOps } from "./objectSelectOps";
import { createWallItemSelectOps } from "./wallItemSelectOps";

export const createSelectTool = (): ToolFactory => (env) => {
  let handleDrag:
    | {
        shape: ShapeValue;
        handle: ShapeHandle;
        result: ShapeValue | null;
        /** Last pointer (area-local, unsnapped plan) and modifiers, for modifier/typed refreshes. */
        plan: PlanPoint | null;
        screen: Readonly<{ x: number; y: number }>;
        alternate: boolean;
        ctrl: boolean;
      }
    | undefined;
  const typed = createValueInput("length");
  // Carpets and rooms as shape groups (Phase 5.14, 7.2): carpet hover and box resize handles, in both modes.
  const carpetOps = createFloorGroupSelectOps(env);
  // Light handles (Phase 5.12): Move, Raise, Turn, Stretch, Aim on the selected light; also new-light placement.
  const lightOps = createLightSelectOps(env);
  // Objects (owner, Phase 5 follow-up): hover box, Move cross, and Turn grip on the selected object.
  const objectOps = createObjectSelectOps(env);
  // Doors, windows, and wall-hung objects (Phase 15.8): their own box with stretch handles and a Move cross.
  const wallItemOps = createWallItemSelectOps(env);

  const commitShape = (shape: ShapeValue, label: string): void => {
    const area = focusArea(env);
    if (area === undefined) return;
    if (shape.type === "polygon") {
      const check = validatePolygonPoints(polygonPoints(shape));
      if (!check.valid) {
        env.session.notify(
          "warning",
          "That edit would make the polygon invalid; the last valid shape is kept.",
        );
        return;
      }
    }
    env.session.execute(
      replaceShapeCommand(env.session.ui.getState().activeFloorId, area.id, shape, label, shapeSetIdOf(env)),
    );
  };

  const lengthReadout = createValueInput("length");

  /** A handle of a selected shape under the pointer (unselected shapes never resize on a first click). */
  const handleAt = (
    area: AreaValue,
    plan: PlanPoint,
  ): { handle: ShapeHandle; shape: ShapeValue } | undefined => {
    const selection = env.session.ui.getState().selection;
    const selected = area.floor.shapes.filter((shape) => selection.includes(shape.id));
    const handle = findHandle(
      selected,
      toAreaLocal(area, plan),
      snapCapturePx * env.runtime.worldUnitsPerPixel(),
      selection[0],
      area.rotationDeg,
    );
    const shape =
      handle === undefined ? undefined : selected.find((candidate) => candidate.id === handle.shapeId);
    return handle === undefined || shape === undefined ? undefined : { handle, shape };
  };

  /** The highlighted part of a handle: the grabbed point (vertex, corner, quadrant) or the outline (sides). */
  const handleOverlay = (area: AreaValue, shape: ShapeValue, handle: ShapeHandle): OverlayPrimitive[] => {
    const ring = shapeOutline(shape).ring.map((point) => toFloor(area, point));
    const dot = (point: { x: number; y: number }): OverlayPrimitive => hoveredHandle(toFloor(area, point));
    if (handle.kind === "vertex" && shape.type === "polygon") {
      const vertex = polygonPoints(shape)[handle.index];
      return vertex === undefined ? [] : [dot(vertex)];
    }
    if (handle.kind === "quadrant" && shape.type === "circle")
      return [
        { kind: "polyline", points: ring, closed: true, tone: "accent" },
        dot({
          x: shape.positionMm.x + handle.direction.x * shape.radiusMm,
          y: shape.positionMm.y + handle.direction.y * shape.radiusMm,
        }),
      ];
    if (handle.kind === "rectCorner" && shape.type === "rectangle") {
      const corner = rectangleCorners(shape).find((c) => c.sx === handle.sx && c.sy === handle.sy);
      return corner === undefined ? [] : [dot(corner.point)];
    }
    if (handle.kind === "rectEdge" && shape.type === "rectangle") {
      const index = { right: 0, top: 1, left: 2, bottom: 3 }[handle.side];
      const midpoint = rectangleSideMidpoints(shape)[index];
      return [
        { kind: "polygon", points: ring, fillOpacity: 0.12, outline: true, tone: "accent" },
        ...(midpoint === undefined ? [] : [dot(midpoint)]),
      ];
    }
    return [{ kind: "polygon", points: ring, fillOpacity: 0.12, outline: true, tone: "accent" }];
  };

  /** What a hovered handle does, for the cue label. */
  const handleLabel = (shape: ShapeValue, handle: ShapeHandle): string =>
    handle.kind === "quadrant"
      ? "Resize: radius (Option: diameter)"
      : handle.kind === "rectCorner"
        ? "Resize: corner"
        : handle.kind === "rectEdge"
          ? "Resize: side"
          : handle.kind === "vertex"
            ? "Vertex (Alt-click deletes)"
            : shape.type === "polygon"
              ? "Edge (Alt-click adds a vertex)"
              : "Handle";

  /** The centre cross of a selected rectangle or circle under the pointer (moving is Nudge's job). */
  const centerAt = (area: AreaValue, plan: PlanPoint): { x: number; y: number } | undefined => {
    const selection = env.session.ui.getState().selection;
    const radius = snapCapturePx * env.runtime.worldUnitsPerPixel();
    for (const shape of area.floor.shapes) {
      if (shape.type === "polygon" || !selection.includes(shape.id)) continue;
      const center = toFloor(area, shape.positionMm);
      if (Math.hypot(center.x - plan.x, center.y - plan.y) <= radius) return center;
    }
    return undefined;
  };

  const resizePreview = (
    area: AreaValue,
    shape: ShapeValue,
    screen: Readonly<{ x: number; y: number }>,
  ): void => {
    const outline = shapeOutline(shape).ring.map((point) => toFloor(area, point));
    const overlay: OverlayPrimitive[] = [
      { kind: "polygon", points: outline, fillOpacity: 0.2, outline: true, tone: "accent" },
    ];
    if (shape.type === "circle") {
      const center = toFloor(area, shape.positionMm);
      const quadrants = circleQuadrants(shape.positionMm, shape.radiusMm, area.rotationDeg);
      const grabbed =
        handleDrag?.handle.kind === "quadrant" ? handleDrag.handle.direction : quadrants[0]?.direction;
      const rim = (direction: { x: number; y: number } | undefined, sign: number): { x: number; y: number } =>
        toFloor(area, {
          x: shape.positionMm.x + sign * (direction?.x ?? 1) * shape.radiusMm,
          y: shape.positionMm.y + sign * (direction?.y ?? 0) * shape.radiusMm,
        });
      const aboutCenter = resizesAboutCenter(shape, handleDrag?.alternate ?? false);
      overlay.push(
        { kind: "point", at: center, marker: "cross", tone: "accent" },
        {
          kind: "segment",
          from: aboutCenter ? center : rim(grabbed, -1),
          to: rim(grabbed, 1),
          dashed: true,
          tone: "accent",
        },
        ...quadrants.map((quadrant): OverlayPrimitive => ({
          kind: "point",
          at: toFloor(area, quadrant.point),
          sizePx: 8,
          tone: "accent",
        })),
      );
      const unit = unitOf(env);
      const text = hasTyped(typed)
        ? `${aboutCenter ? "r" : "⌀"} ${readoutOf(typed, 0, unit)}`
        : `r ${readoutOf(lengthReadout, shape.radiusMm, unit)} · ⌀ ${readoutOf(lengthReadout, shape.radiusMm * 2, unit)}`;
      env.setReadout({ text, screen });
    }
    env.setOverlay(overlay);
  };

  const resizeHint = (shape: ShapeValue, alternate: boolean): string =>
    shape.type === "circle"
      ? resizesAboutCenter(shape, alternate)
        ? "Resizing the circle about its centre (radius). Option: keep the opposite side (diameter). Ctrl: no snapping. Type a radius; click to place. Esc cancels."
        : "Resizing the circle by its diameter (opposite side fixed). Release Option for the radius. Type a diameter; click to place. Esc cancels."
      : resizesAboutCenter(shape, alternate)
        ? "Resizing about the centre. Release Option to keep the opposite side. Ctrl: no snapping. Click to place. Esc cancels."
        : "Resizing with the opposite side fixed. Option: about the centre. Ctrl: no snapping. Click to place. Esc cancels.";

  /** Recomputes the resize from the last pointer, modifiers, and any typed value. */
  const refreshResize = (): void => {
    const drag = handleDrag;
    const area = focusArea(env);
    if (drag === undefined || area === undefined) return;
    const { shape, handle } = drag;
    if (hasTyped(typed) && shape.type === "circle" && handle.kind === "quadrant") {
      const value = valueOf(typed, 0, unitOf(env));
      const aboutCenter = resizesAboutCenter(shape, drag.alternate);
      // A typed radius (about the centre) or diameter (from the opposite side) along the grabbed axis.
      const reach = aboutCenter ? value : value - shape.radiusMm;
      drag.result =
        value <= 0
          ? null
          : dragHandle(
              shape,
              handle,
              {
                x: shape.positionMm.x + handle.direction.x * reach,
                y: shape.positionMm.y + handle.direction.y * reach,
              },
              drag.alternate,
            );
    } else if (drag.plan !== null) {
      const point = drag.ctrl ? drag.plan : inferFloorPoint(env, drag.plan);
      if (drag.ctrl) env.setCue(undefined);
      drag.result = dragHandle(shape, handle, toAreaLocal(area, point), drag.alternate);
    }
    env.setHint(resizeHint(shape, drag.alternate));
    resizePreview(area, drag.result ?? shape, drag.screen);
  };

  const endResize = (): void => {
    carpetOps.cancel();
    lightOps.cancel();
    objectOps.cancel();
    wallItemOps.cancel();
    handleDrag = undefined;
    typed.typed = "";
    finishTool(env);
    env.setHint("");
  };

  const toggle = (id: string, additive: boolean): void => {
    const current = env.session.ui.getState().selection;
    env.session.ui.setState({
      selection: additive
        ? current.includes(id)
          ? current.filter((other) => other !== id)
          : [...current, id]
        : [id],
    });
  };

  return {
    isActive: () =>
      handleDrag !== undefined ||
      carpetOps.isActive() ||
      lightOps.isActive() ||
      objectOps.isActive() ||
      wallItemOps.isActive(),
    target: (event) => selectionTargetAt(env, event),
    pointer: (event) => {
      const { mode } = env.session.ui.getState();
      if (lightOps.isActive()) {
        lightOps.pointer(event);
        return;
      }
      if (objectOps.isActive()) {
        objectOps.pointer(event);
        return;
      }
      if (wallItemOps.isActive()) {
        wallItemOps.pointer(event);
        return;
      }
      if (carpetOps.isActive()) {
        carpetOps.pointer(event);
        return;
      }
      if ((event.phase === "move" || event.phase === "leave") && handleDrag === undefined) {
        if (lightOps.hover(event)) return;
        if (wallItemOps.hover(event)) return;
        if (objectOps.hover(event)) return;
      }
      if (event.phase === "down" && handleDrag === undefined && lightOps.down(event)) return;
      if (event.phase === "down" && handleDrag === undefined && wallItemOps.down(event)) return;
      if (event.phase === "down" && handleDrag === undefined && objectOps.down(event)) return;
      // A selected floor shape's handle under the pointer wins over a carpet lying on top of it.
      const focus = mode === "overview" ? undefined : focusArea(env);
      const shapeHandleHere =
        focus !== undefined && event.plan !== null && handleAt(focus, event.plan) !== undefined;
      if (
        (event.phase === "move" || event.phase === "leave") &&
        handleDrag === undefined &&
        !shapeHandleHere
      ) {
        if (carpetOps.hover(event)) return;
      }
      if (event.phase === "down" && handleDrag === undefined && !shapeHandleHere && carpetOps.down(event))
        return;
      if (handleDrag !== undefined) {
        const area = focusArea(env);
        const floor = floorOf(env);
        if (area === undefined || floor === undefined) return;
        if (event.phase === "move" && event.plan !== null) {
          handleDrag.plan = event.plan;
          handleDrag.screen = event.screen;
          handleDrag.alternate = event.altKey;
          handleDrag.ctrl = event.ctrlKey;
          refreshResize();
        } else if (event.phase === "down" && event.button === 0) {
          const drag = handleDrag;
          endResize();
          if (drag.result !== null) commitShape(drag.result, "Resize shape");
        }
        return;
      }
      if (mode !== "overview" && (event.phase === "move" || event.phase === "leave")) {
        const area = focusArea(env);
        const hover =
          area === undefined || event.phase === "leave" || event.plan === null
            ? undefined
            : handleAt(area, event.plan);
        const center =
          area === undefined || hover !== undefined || event.phase === "leave" || event.plan === null
            ? undefined
            : centerAt(area, event.plan);
        if (area !== undefined && hover !== undefined && event.plan !== null) {
          env.setOverlay(handleOverlay(area, hover.shape, hover.handle));
          env.setCue({
            lines: [],
            marker: { ...event.plan, h: 0 },
            label: handleLabel(hover.shape, hover.handle),
          });
        } else if (center !== undefined) {
          env.setOverlay([hoveredHandle(center, "cross", 12)]);
          env.setCue({ lines: [], marker: { ...center, h: 0 }, label: "Centre: move it with Nudge (M)" });
        } else {
          env.setOverlay([]);
          env.setCue(undefined);
        }
        env.setCursor(
          area === undefined || hover === undefined
            ? "default"
            : shapeHandleCursor(env.runtime, area, hover.shape, hover.handle),
        );
        return;
      }
      if (event.phase !== "down" || event.button !== 0) return;
      const hit = event.hit;
      const picked = pickedEntity(env, event);
      if (picked !== undefined) {
        toggle(picked.id, event.shiftKey);
        return;
      }
      if (hit?.kind === "helper") {
        toggle(hit.id, event.shiftKey);
        return;
      }
      if (mode === "overview") {
        if (hit === null) {
          if (!event.shiftKey) env.session.ui.setState({ selection: [] });
          return;
        }
        // A canopy (19.3) drawn in the floor view selects as itself.
        if (hit.kind === "roof") {
          toggle(hit.roofId, event.shiftKey);
          return;
        }
        if (hit.kind !== "wall" && hit.kind !== "floor") return;
        toggle(hit.areaId, event.shiftKey);
        return;
      }
      const area = focusArea(env);
      if (area === undefined || event.plan === null) return;
      const local = toAreaLocal(area, event.plan);
      const grabbed = handleAt(area, event.plan);
      if (grabbed !== undefined) {
        const { handle, shape: handleShape } = grabbed;
        env.session.ui.setState({ selection: [handleShape.id] });
        if (event.altKey && handleShape.type === "polygon" && handle.kind === "polygonEdge") {
          commitShape(insertVertex(handleShape, handle.index, handle.at), "Insert vertex");
          return;
        }
        if (event.altKey && handleShape.type === "polygon" && handle.kind === "vertex") {
          const next = deleteVertex(handleShape, handle.index);
          if (next === null) env.session.notify("info", "A polygon needs at least three vertices.");
          else commitShape(next, "Delete vertex");
          return;
        }
        if (handle.kind !== "polygonEdge") {
          handleDrag = {
            shape: handleShape,
            handle,
            result: null,
            plan: null,
            screen: event.screen,
            alternate: event.altKey,
            ctrl: false,
          };
          // The cursor keeps the direction it started with until commit or Escape.
          env.setCursor(shapeHandleCursor(env.runtime, area, handleShape, handle));
          env.setHint(resizeHint(handleShape, event.altKey));
          resizePreview(area, handleShape, event.screen);
          return;
        }
      }
      if (hit?.kind === "wall") {
        // A box's or niche's face selects the relief (Phase 5.0); other wall faces select the wall.
        toggle(hit.reliefId ?? hit.wallId, event.shiftKey);
        return;
      }
      const shape = shapeAt(area.floor.shapes, local);
      if (shape === undefined) {
        // In the Carpet Editor an empty click clears the selection; in the Room Editor it selects the room.
        if (!event.shiftKey)
          env.session.ui.setState({ selection: shapeSetIdOf(env) === undefined ? [area.id] : [] });
        return;
      }
      toggle(shape.id, event.shiftKey);
    },
    key: (event) => {
      if (lightOps.isActive()) return lightOps.key(event);
      if (objectOps.isActive()) return objectOps.key(event);
      if (wallItemOps.isActive()) return wallItemOps.key(event);
      if (carpetOps.isActive()) return carpetOps.key(event);
      if (handleDrag === undefined) return false;
      if (event.key === "Escape") {
        endResize();
        return true;
      }
      if (handleDrag.handle.kind !== "quadrant") return false;
      const action = feedValueKey(typed, event.key);
      if (action === "cancel") endResize();
      else if (action === "commit") {
        refreshResize();
        const drag = handleDrag;
        endResize();
        if (drag.result !== null) commitShape(drag.result, "Resize shape");
      } else if (action === "consumed") refreshResize();
      return action !== "none";
    },
    cancel: endResize,
  };
};
