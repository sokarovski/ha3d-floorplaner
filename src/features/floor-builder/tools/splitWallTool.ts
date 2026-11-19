// Split (S): point at a wall's face; a vertical cut line follows the pointer on the wall itself (snapping to
// the midpoint, wall ends, points in line, extensions, guides). Click splits there. Typing a distance while
// pointing at a wall locks to it; Enter splits at that distance from the wall's start. Both halves are
// selected afterwards, and the seam between them stays visible.
import { splitWallCommand } from "@shared/domain/commands/wallCommands";
import { computeAreaFloorGeometry } from "@shared/geometry/areaGeometry";
import type { RealWall } from "@shared/geometry/wallBands";
import { wallAlongOf, wallPointAt } from "@shared/geometry/wallBands";
import { inferenceCapturePx } from "../inference/inferPoint";
import type { OverlayPrimitive, RuntimePointerEvent, ScreenPoint } from "../../../renderer/runtimeTypes";
import { inferAlong } from "../inference/inferAlong";
import { inferenceSceneOf } from "../inference/inferenceScene";
import { minWallSpanMm } from "@shared/domain/commands/wallCommands";
import { finishTool, floorOf, focusArea, magnetic, snapFloor, unitOf } from "./toolContext";
import type { ToolFactory } from "./toolTypes";
import { createValueInput, feedValueKey, hasTyped, readoutOf, valueOf } from "./valueInput";

type Cut = { wall: RealWall; alongMm: number; screen: ScreenPoint };

/** The cut's outline on the wall: vertical lines on both faces, joined at the bottom and the top. */
export const cutOverlay = (
  wall: RealWall,
  alongMm: number,
  tone: "accent" | "neutral",
): OverlayPrimitive[] => {
  const { point: base, normal } = wallPointAt(wall, alongMm);
  const face = (offset: number) => ({
    x: base.x + normal.x * offset,
    y: base.y + normal.y * offset,
  });
  const inner = face(wall.interiorOffsetMm);
  const outer = face(wall.exteriorOffsetMm);
  return [
    { kind: "verticalLine", at: inner, fromHMm: 0, toHMm: wall.heightMm, tone },
    { kind: "verticalLine", at: outer, fromHMm: 0, toHMm: wall.heightMm, tone },
    { kind: "segment", from: { ...inner, h: wall.heightMm }, to: { ...outer, h: wall.heightMm }, tone },
    { kind: "segment", from: inner, to: outer, tone },
  ];
};

export const createSplitWallTool = (): ToolFactory => (env) => {
  let lock: Cut | undefined;
  let hover: Cut | undefined;
  const input = createValueInput("length");

  const cutAt = (event: RuntimePointerEvent): Cut | undefined => {
    const area = focusArea(env);
    const hit = event.hit;
    if (area === undefined || hit?.kind !== "wall" || hit.areaId !== area.id || hit.side === "end")
      return undefined;
    const wall = computeAreaFloorGeometry(area).realWalls.find(
      (candidate) => candidate.wallId === hit.wallId,
    );
    if (wall === undefined) return undefined;
    const { edge } = wall;
    const raw = wallAlongOf(wall, hit.pointMm);
    const floor = floorOf(env);
    let alongMm = raw;
    const midpoint = (wall.spanMm.fromMm + wall.spanMm.toMm) / 2;
    if (wall.arc !== null) {
      // Arcs: the midpoint is the only stop.
      const near =
        magnetic(env) && Math.abs(raw - midpoint) <= inferenceCapturePx * env.runtime.worldUnitsPerPixel();
      env.setCue(
        near
          ? {
              lines: [],
              marker: { ...wallPointAt(wall, midpoint).point, h: hit.pointMm.h },
              label: "Midpoint",
            }
          : undefined,
      );
      alongMm = near ? midpoint : raw;
    } else if (floor !== undefined && magnetic(env)) {
      const inferred = inferAlong(
        inferenceSceneOf(snapFloor(env, floor)),
        { origin: edge.start, direction: edge.direction },
        raw,
        env.runtime.worldUnitsPerPixel(),
        {
          stops: [{ alongMm: midpoint, label: "Midpoint" }],
          hMm: hit.pointMm.h,
        },
      );
      env.setCue(inferred?.cue);
      alongMm = inferred?.alongMm ?? raw;
    } else env.setCue(undefined);
    const inside = Math.max(
      wall.spanMm.fromMm + minWallSpanMm,
      Math.min(wall.spanMm.toMm - minWallSpanMm, alongMm),
    );
    return { wall, alongMm: inside, screen: event.screen };
  };

  /** Distance from the wall's start to the cut, typed or pointed. */
  const distanceOf = (cut: Cut): number => valueOf(input, cut.alongMm - cut.wall.spanMm.fromMm, unitOf(env));

  const show = (cut: Cut | undefined): void => {
    if (cut === undefined) {
      env.setOverlay([]);
      env.setReadout(undefined);
      env.setCursor("default");
      return;
    }
    const at = cut.wall.spanMm.fromMm + distanceOf(cut);
    env.setOverlay(cutOverlay(cut.wall, at, "accent"));
    env.setReadout({
      text: readoutOf(input, cut.alongMm - cut.wall.spanMm.fromMm, unitOf(env)),
      screen: cut.screen,
    });
    env.setCursor("split");
  };

  const reset = (): void => {
    lock = undefined;
    hover = undefined;
    input.typed = "";
    finishTool(env);
  };

  const commit = (cut: Cut): void => {
    const area = focusArea(env);
    const at = distanceOf(cut);
    const wallId = cut.wall.wallId;
    reset();
    if (area === undefined) return;
    const { command, newWallId } = splitWallCommand(
      env.session.ui.getState().activeFloorId,
      area.id,
      wallId,
      at,
    );
    if (env.session.execute(command).ok) env.session.ui.setState({ selection: [wallId, newWallId] });
  };

  env.setHint(
    "Point at a wall and click to split it there, or type a distance from the wall's start and press Enter.",
  );
  return {
    isActive: () => lock !== undefined,
    target: (event) => cutAt(event)?.wall.wallId,
    pointer: (event) => {
      const cut = cutAt(event);
      if (event.phase === "move" || event.phase === "leave") {
        if (lock !== undefined) {
          if (cut?.wall.wallId === lock.wall.wallId) lock = cut;
          show(lock);
        } else {
          hover = event.phase === "leave" ? undefined : cut;
          show(hover);
        }
      } else if (event.phase === "down" && event.button === 0) {
        const target = lock ?? cut;
        if (target !== undefined) commit(target);
      }
    },
    key: (event) => {
      const target = lock ?? hover;
      if (target === undefined) return false;
      const action = feedValueKey(input, event.key);
      if (action === "cancel") reset();
      else if (action === "commit" && (lock !== undefined || hasTyped(input))) commit(target);
      else if (action === "consumed") {
        lock = target;
        show(lock);
      }
      return action !== "none";
    },
    cancel: reset,
  };
};
