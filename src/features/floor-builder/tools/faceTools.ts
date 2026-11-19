// Face view tools (wall relief groups): with a wall face seen straight on and no feature open, Select picks a
// feature (its box handles resize it; double-click opens it for editing with the shared shape tools), Nudge moves a whole feature, and
// Push/pull gives it depth: drag up to bring it out (a box), down to push it in (a niche). Pointer positions
// come from the face plane (`facePointAt`); positions snap to the wall's ends, floor, top, and centre lines,
// openings' edges, and other features' edges and centres (Ctrl: no snapping). Click–lock–type–commit as
// everywhere. Each change is one undo step. Drawing and editing the shapes themselves is the shared 2D shape
// editor (see faceSpace.ts), not these tools.
import { replaceShapeGroupGeometryCommand } from "@shared/domain/commands/shapeCommands";
import { moveReliefCommand, updateReliefCommand } from "@shared/domain/commands/wallCommands";
import type { WallReliefValue } from "@shared/domain/schemas/wall";
import { identityAffine } from "@shared/geometry/affine";
import { unionRings } from "@shared/geometry/polygonKernel";
import { pointInRegion, regionRings } from "@shared/geometry/region";
import type { Region } from "@shared/geometry/region";
import { reliefBounds } from "@shared/geometry/reliefStrips";
import { shapeGroupFrame } from "@shared/geometry/shapeGroup";
import { shapeOutline } from "@shared/geometry/shapeOutline";
import { formatLength, parseLength } from "@shared/domain/units/lengthUnits";
import type { OverlayPrimitive, RuntimePointerEvent } from "../../../renderer/runtimeTypes";
import { faceToolEnv, inFaceSpace } from "../services/faceSpace";
import type { WallFace } from "../services/wallFace";
import { createShapeGroupSelectOps } from "./shapeGroupSelectOps";
import type { ShapeGroupTarget } from "./shapeGroupSelectOps";
import { faceOf, finishTool, unitOf } from "./toolContext";
import type { ToolEnv, ToolFactory } from "./toolTypes";

const snapPx = 10;
const maxDepthMm = 2000;
/** A niche leaves this much wall behind it (D21). */
const nicheBackMm = 20;

type FacePoint = Readonly<{ along: number; h: number }>;
type Rect = Readonly<{ along: number; bottom: number; width: number; height: number }>;

const pointOf = (env: ToolEnv, event: RuntimePointerEvent): FacePoint | null => {
  const hit = env.runtime.facePointAt(event.screen.x, event.screen.y);
  return hit === null ? null : { along: hit.alongMm, h: hit.heightMm };
};

const mmPerPx = (env: ToolEnv): number => env.runtime.worldUnitsPerPixel();

/** The nearest snap value within reach, or the value itself. */
const snapTo = (value: number, candidates: readonly number[], reach: number): number => {
  let best: number | undefined;
  for (const candidate of candidates)
    if (
      Math.abs(candidate - value) <= reach &&
      (best === undefined || Math.abs(candidate - value) < Math.abs(best - value))
    )
      best = candidate;
  return best ?? value;
};

const regionCache = new WeakMap<WallReliefValue, Region>();

/** A feature's combined outline in the face frame. */
const regionOf = (relief: WallReliefValue): Region => {
  const cached = regionCache.get(relief);
  if (cached !== undefined) return cached;
  const region = unionRings(relief.shapes.map((shape) => shapeOutline(shape).ring));
  regionCache.set(relief, region);
  return region;
};

const rectOf = (relief: WallReliefValue): Rect => {
  const box = reliefBounds(relief.shapes);
  return box === null
    ? { along: 0, bottom: 0, width: 0, height: 0 }
    : { along: box.minX, bottom: box.minY, width: box.maxX - box.minX, height: box.maxY - box.minY };
};

const outlineOf = (
  face: WallFace,
  relief: WallReliefValue,
  tone: "accent" | "accentStrong",
  dashed = false,
): OverlayPrimitive[] =>
  regionRings(regionOf(relief)).map((ring): OverlayPrimitive => ({
    kind: "polyline",
    points: ring.map((point) => face.toPlan(point.x, point.y)),
    closed: true,
    dashed,
    tone,
  }));

const reliefAt = (face: WallFace, point: FacePoint): WallReliefValue | undefined =>
  [...face.reliefs]
    .reverse()
    .find((relief) => pointInRegion({ x: point.along, y: point.h }, regionOf(relief)));

const selectedRelief = (env: ToolEnv, face: WallFace): WallReliefValue | undefined => {
  const { selection } = env.session.ui.getState();
  return face.reliefs.find((relief) => selection.includes(relief.id));
};

/** The selected feature as a shape group on the face plane (Phase 7.2), for its box handles. */
const selectedFeatureGroup = (env: ToolEnv): ShapeGroupTarget | undefined => {
  const face = faceOf(env);
  const { selection, activeFloorId } = env.session.ui.getState();
  if (face === undefined || selection.length !== 1) return undefined;
  const relief = selectedRelief(env, face);
  if (relief === undefined || relief.shapes.length === 0) return undefined;
  return {
    noun: "feature",
    shapes: relief.shapes,
    frame: shapeGroupFrame(relief.shapes, identityAffine),
    resize: (shapes) =>
      replaceShapeGroupGeometryCommand(activeFloorId, face.area.id, relief.id, { shapes }, "Resize feature"),
  };
};

/**
 * Select: pick features on the face. A selected feature shows its box; its corner and side handles resize
 * all its shapes together, as a carpet's do (shapeGroupSelectOps.ts, run in face coordinates).
 */
export const createFaceSelectTool = (): ToolFactory => (env) => {
  const planeEnv = faceToolEnv(env, () => faceOf(env));
  const groupOps = createShapeGroupSelectOps(planeEnv, () => selectedFeatureGroup(env));
  const hint =
    "Click a feature to select it; drag its box handles to resize it; double-click to edit its shapes. Double-click off the wall to go back.";
  env.setHint(hint);
  return {
    isActive: () => groupOps.isActive(),
    pointer: (event) => {
      const face = faceOf(env);
      if (face === undefined) return;
      const planeEvent = inFaceSpace(env.runtime, event);
      if (groupOps.isActive()) {
        groupOps.pointer(planeEvent);
        if (!groupOps.isActive()) env.setHint(hint);
        return;
      }
      if ((event.phase === "move" || event.phase === "leave") && groupOps.hover(planeEvent)) return;
      if (event.phase === "down" && groupOps.down(planeEvent)) return;
      const point = pointOf(env, event);
      if (event.phase === "move" || event.phase === "leave") {
        const hovered = point === null || event.phase === "leave" ? undefined : reliefAt(face, point);
        env.setOverlay(hovered === undefined ? [] : outlineOf(face, hovered, "accent"));
        env.setCue(hovered === undefined ? undefined : { lines: [], marker: null, label: hovered.name });
        return;
      }
      if (event.phase !== "down" || event.button !== 0) return;
      const picked = point === null ? undefined : reliefAt(face, point);
      const { selection } = env.session.ui.getState();
      if (picked === undefined) {
        if (!event.shiftKey) env.session.ui.setState({ selection: [] });
        return;
      }
      env.session.ui.setState({
        selection: event.shiftKey
          ? selection.includes(picked.id)
            ? selection.filter((id) => id !== picked.id)
            : [...selection, picked.id]
          : [picked.id],
      });
    },
    key: (event) => {
      if (!groupOps.isActive()) return false;
      const handled = groupOps.key(event);
      if (!groupOps.isActive()) env.setHint(hint);
      return handled;
    },
    cancel: () => {
      groupOps.cancel();
      finishTool(env);
    },
  };
};

/** Nudge: move a whole feature on the face; its edges and centre snap. Shift keeps it on one axis. */
export const createFaceNudgeTool = (): ToolFactory => (env) => {
  let move:
    { relief: WallReliefValue; grab: FacePoint; delta: Readonly<{ x: number; y: number }> } | undefined;

  const end = (): void => {
    move = undefined;
    finishTool(env);
  };

  const refresh = (face: WallFace, point: FacePoint, shift: boolean, ctrl: boolean): void => {
    if (move === undefined) return;
    const rect = rectOf(move.relief);
    let dx = point.along - move.grab.along;
    let dy = point.h - move.grab.h;
    if (shift) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    if (!ctrl) {
      const reach = snapPx * mmPerPx(env);
      const snapEdge = (start: number, size: number, candidates: readonly number[]): number => {
        const options = [start, start + size, start + size / 2].map((edge) => {
          const snapped = snapTo(edge, candidates, reach);
          return { delta: snapped - edge, moved: snapped !== edge };
        });
        const best = options
          .filter((option) => option.moved)
          .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0];
        return best === undefined ? 0 : best.delta;
      };
      const own = (a: number, size: number): number[] => [a, a + size, a + size / 2];
      const others = face.reliefs.filter((relief) => relief.id !== move?.relief.id);
      const alongs = [
        ...face.snapAlong.filter((value) => !own(rect.along, rect.width).includes(value)),
        ...others.flatMap((relief) => own(rectOf(relief).along, rectOf(relief).width)),
      ];
      const heights = [
        ...face.snapHeights.filter((value) => !own(rect.bottom, rect.height).includes(value)),
        ...others.flatMap((relief) => own(rectOf(relief).bottom, rectOf(relief).height)),
      ];
      dx += snapEdge(rect.along + dx, rect.width, alongs);
      dy += snapEdge(rect.bottom + dy, rect.height, heights);
    }
    dx = Math.min(Math.max(-rect.along, dx), face.lengthMm - rect.along - rect.width);
    dy = Math.min(Math.max(-rect.bottom, dy), face.heightMm - rect.bottom - rect.height);
    move.delta = { x: Math.round(dx), y: Math.round(dy) };
    env.setOverlay(
      outlineOf(
        face,
        {
          ...move.relief,
          shapes: move.relief.shapes.map((shape) => ({
            ...shape,
            positionMm: { x: shape.positionMm.x + dx, y: shape.positionMm.y + dy },
          })),
        },
        "accentStrong",
      ),
    );
  };

  env.setHint("Click or drag a feature to move it on the wall. Shift: one axis; Ctrl: no snapping.");
  return {
    isActive: () => move !== undefined,
    pointer: (event) => {
      const face = faceOf(env);
      if (face === undefined) return;
      const point = pointOf(env, event);
      if (move !== undefined) {
        if (event.phase === "move" && point !== null) refresh(face, point, event.shiftKey, event.ctrlKey);
        else if (event.phase === "down" && event.button === 0) {
          const current = move;
          end();
          if (current.delta.x !== 0 || current.delta.y !== 0)
            env.session.execute(
              moveReliefCommand(
                env.session.ui.getState().activeFloorId,
                face.area.id,
                face.wall.id,
                current.relief.id,
                current.delta,
                "Move feature",
              ),
            );
        }
        return;
      }
      if (event.phase === "move") {
        const hovered = point === null ? undefined : reliefAt(face, point);
        env.setOverlay(hovered === undefined ? [] : outlineOf(face, hovered, "accent"));
        env.setCursor(hovered === undefined ? "default" : "move");
        return;
      }
      if (event.phase !== "down" || event.button !== 0 || point === null) return;
      const relief = reliefAt(face, point) ?? selectedRelief(env, face);
      if (relief === undefined) return;
      env.session.ui.setState({ selection: [relief.id] });
      move = { relief, grab: point, delta: { x: 0, y: 0 } };
      env.setCursor("move");
    },
    key: (event) => {
      if (move === undefined || event.key !== "Escape") return false;
      end();
      return true;
    },
    cancel: end,
  };
};

/** Push/pull: drag a relief up to bring it out of the wall (a box), down to push it in (a niche). */
export const createFacePushPullTool = (): ToolFactory => (env) => {
  let pull:
    | { relief: WallReliefValue; startY: number; depth: number; screen: Readonly<{ x: number; y: number }> }
    | undefined;
  let typed = "";

  const end = (): void => {
    pull = undefined;
    typed = "";
    finishTool(env);
  };

  const limitIn = (face: WallFace): number => -(face.real.thicknessMm - nicheBackMm);

  const refresh = (face: WallFace, screenY: number | null, ctrl: boolean): void => {
    if (pull === undefined) return;
    const unit = unitOf(env);
    const typedDepth = typed.trim() === "" ? undefined : parseLength(typed.replace("+", ""), unit);
    let depth: number;
    if (typedDepth?.ok === true) depth = typedDepth.millimeters;
    else if (screenY !== null) depth = pull.relief.depthMm + (pull.startY - screenY) * mmPerPx(env);
    else depth = pull.depth;
    if (typedDepth === undefined && !ctrl) {
      const others = face.reliefs
        .filter((relief) => relief.id !== pull?.relief.id)
        .map((relief) => relief.depthMm);
      depth = snapTo(depth, [0, limitIn(face), ...others], snapPx * mmPerPx(env));
    }
    depth = Math.round(Math.min(maxDepthMm, Math.max(Math.max(-maxDepthMm, limitIn(face)), depth)));
    pull.depth = depth;
    env.setOverlay([
      ...outlineOf(face, pull.relief, "accentStrong"),
      ...depthCue(face, rectOf(pull.relief), depth, "accentStrong"),
    ]);
    const text = `${depth > 0 ? "out" : depth < 0 ? "in" : "flat"} ${formatLength(Math.abs(depth), unit)}`;
    env.setReadout({ text: typed === "" ? text : `${typed}  =  ${text}`, screen: pull.screen });
    env.setHint(
      "Up brings it out (a box), down pushes it in (a niche). Type a depth (−150 goes in); click to place. Esc cancels.",
    );
  };

  const commit = (face: WallFace): void => {
    const current = pull;
    end();
    if (current === undefined || current.depth === current.relief.depthMm) return;
    env.session.execute(
      updateReliefCommand(
        env.session.ui.getState().activeFloorId,
        face.area.id,
        face.wall.id,
        current.relief.id,
        { depthMm: current.depth },
        "Push/pull feature",
      ),
    );
  };

  env.setHint("Click a feature on the wall, then move up (out) or down (in).");
  return {
    isActive: () => pull !== undefined,
    pointer: (event) => {
      const face = faceOf(env);
      if (face === undefined) return;
      if (pull !== undefined) {
        if (event.phase === "move") {
          pull.screen = event.screen;
          refresh(face, event.screen.y, event.ctrlKey);
        } else if (event.phase === "down" && event.button === 0) commit(face);
        return;
      }
      const point = pointOf(env, event);
      const hovered = point === null ? undefined : reliefAt(face, point);
      if (event.phase === "move") {
        env.setOverlay(hovered === undefined ? [] : outlineOf(face, hovered, "accent"));
        env.setCursor(hovered === undefined ? "default" : "pushPull");
        return;
      }
      if (event.phase !== "down" || event.button !== 0 || hovered === undefined) return;
      env.session.ui.setState({ selection: [hovered.id] });
      pull = { relief: hovered, startY: event.screen.y, depth: hovered.depthMm, screen: event.screen };
      env.setCursor("pushPull");
      refresh(face, event.screen.y, event.ctrlKey);
    },
    key: (event) => {
      if (pull === undefined) return false;
      const face = faceOf(env);
      if (event.key === "Escape") {
        end();
        return true;
      }
      if (event.key === "Enter" && face !== undefined) {
        commit(face);
        return true;
      }
      if (event.key === "Backspace") typed = typed.slice(0, -1);
      else if (event.key.length === 1 && /[0-9a-zA-Z.,'" +-]/.test(event.key)) typed += event.key;
      else return false;
      if (face !== undefined) refresh(face, null, event.ctrlKey);
      return true;
    },
    cancel: end,
  };
};

/**
 * A relief's depth made visible straight on: its front (box) or back (niche) outline and the four edges back
 * to the face, which the perspective view shows as a frame, since a box's front shades like the wall.
 */
const depthCue = (
  face: WallFace,
  rect: Rect,
  depthMm: number,
  tone: "accent" | "accentStrong",
): OverlayPrimitive[] => {
  if (Math.abs(depthMm) < 1) return [];
  const corners = [
    [rect.along, rect.bottom],
    [rect.along + rect.width, rect.bottom],
    [rect.along + rect.width, rect.bottom + rect.height],
    [rect.along, rect.bottom + rect.height],
  ] as const;
  const lift = depthMm + Math.sign(depthMm) * 2;
  return [
    {
      kind: "polyline",
      points: corners.map(([along, h]) => face.toPlan(along, h, lift)),
      closed: true,
      tone,
    },
    ...corners.map(([along, h]): OverlayPrimitive => ({
      kind: "segment",
      from: face.toPlan(along, h),
      to: face.toPlan(along, h, lift),
      dashed: true,
      tone,
    })),
  ];
};

/** The face's features as outlines (flat ones dashed) with their depth, the selected one bold. */
export const faceOverlay = (face: WallFace, selection: readonly string[]): OverlayPrimitive[] =>
  face.reliefs.flatMap((relief): OverlayPrimitive[] => {
    const rect = rectOf(relief);
    const tone = selection.includes(relief.id) ? "accentStrong" : "accent";
    return [
      ...outlineOf(face, relief, tone, relief.depthMm === 0 && tone === "accent"),
      ...depthCue(face, rect, relief.depthMm, tone),
    ];
  });

/** The feature under a face point, if any. */
export const featureAtFacePoint = (
  face: WallFace,
  point: Readonly<{ x: number; y: number }>,
): WallReliefValue | undefined => reliefAt(face, { along: point.x, h: point.y });

/** Whether a face point is within a feature's bounding box grown by a margin (mm). */
export const insideFeatureBounds = (
  relief: WallReliefValue,
  point: Readonly<{ x: number; y: number }>,
  marginMm: number,
): boolean => {
  const box = rectOf(relief);
  return (
    point.x >= box.along - marginMm &&
    point.x <= box.along + box.width + marginMm &&
    point.y >= box.bottom - marginMm &&
    point.y <= box.bottom + box.height + marginMm
  );
};

/** While a feature is open: its combined outline dashed, so the group reads as one thing. */
export const openFeatureOverlay = (face: WallFace, reliefId: string | undefined): OverlayPrimitive[] => {
  const open = face.reliefs.find((relief) => relief.id === reliefId);
  return open === undefined ? [] : outlineOf(face, open, "accent", true);
};
