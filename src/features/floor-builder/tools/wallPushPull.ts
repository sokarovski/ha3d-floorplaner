// Push/pull (SketchUp-like) in Wall Editor: drag a wall's top edge to change its height, or a bare floor edge
// to raise a new wall from 0. The height follows the pointer exactly along the wall's vertical line, snaps to
// other wall heights (inference), and accepts a typed height. Drag and release, or click–move–click, commits;
// Enter commits a typed value; Escape cancels with no history entry.
import { setPropertyCommand } from "@shared/domain/commands/propertyCommands";
import { raiseWallsCommand } from "@shared/domain/commands/wallCommands";
import { effectiveWallHeightMm } from "@shared/domain/house/defaults";
import { formatLength } from "@shared/domain/units/lengthUnits";
import type { Vec2 } from "@shared/geometry/vector";
import type { OverlayPrimitive, RuntimePointerEvent, ScreenPoint } from "../../../renderer/runtimeTypes";
import { inferenceSceneOf } from "../inference/inferenceScene";
import { inferHeight } from "../inference/inferHeight";
import { inferenceCapturePx } from "../inference/inferPoint";
import type { BoundaryPieceRef } from "./planGeometry";
import { barePieces, boundaryPieces, pointOnEdge } from "./planGeometry";
import { finishTool, floorOf, focusArea, houseOf, magnetic, snapFloor, unitOf } from "./toolContext";
import type { ToolEnv } from "./toolTypes";
import { createValueInput, feedValueKey, hasTyped, readoutOf, valueOf } from "./valueInput";
import type { WallHandle } from "./wallHandles";

export type WallOperation = Readonly<{
  pointer: (event: RuntimePointerEvent) => void;
  key: (event: KeyboardEvent) => boolean;
  cancel: () => void;
}>;

type Target =
  | Readonly<{
      kind: "walls";
      wallIds: readonly string[];
      startHeightMm: number;
      edges: readonly (readonly [Vec2, Vec2])[];
    }>
  | Readonly<{ kind: "raise"; pieces: readonly BoundaryPieceRef[] }>;

/**
 * Starts push/pull on a top or bare handle. `all`: Shift at the start — every selected wall (top) or every
 * bare edge of the area (bare). `onDone` runs after commit or cancel.
 */
export const startPushPull = (
  env: ToolEnv,
  handle: Extract<WallHandle, { kind: "top" | "bare" }>,
  event: RuntimePointerEvent,
  all: boolean,
  onDone: () => void,
): WallOperation | undefined => {
  const area = focusArea(env);
  if (area === undefined) return undefined;
  const input = createValueInput("length");
  let target: Target;
  let at: Vec2;
  if (handle.kind === "top") {
    const selection = env.session.ui.getState().selection;
    const ids =
      all && selection.includes(handle.wallId)
        ? area.walls.filter((wall) => selection.includes(wall.id)).map((wall) => wall.id)
        : [handle.wallId];
    target = { kind: "walls", wallIds: ids, startHeightMm: handle.heightMm, edges: handle.edges };
    at = handle.at;
  } else {
    const pieces = all ? boundaryPieces(area).flatMap((piece) => barePieces(area, piece)) : [handle.piece];
    target = { kind: "raise", pieces };
    at = pointOnEdge(handle.piece, (handle.piece.fromMm + handle.piece.toMm) / 2);
  }
  const startHeight = target.kind === "walls" ? target.startHeightMm : 0;
  const grabHeight = env.runtime.heightOnVertical(event.screen.x, event.screen.y, at) ?? startHeight;
  const start: ScreenPoint = event.screen;
  let screen: ScreenPoint = event.screen;
  let height = startHeight;

  const pointerHeight = (point: ScreenPoint): number => {
    const h = env.runtime.heightOnVertical(point.x, point.y, at);
    const raw =
      h === null
        ? startHeight + (start.y - point.y) * env.runtime.worldUnitsPerPixel()
        : startHeight + (h - grabHeight);
    const floor = floorOf(env);
    if (floor === undefined || !magnetic(env) || hasTyped(input)) {
      env.setCue(undefined);
      return Math.max(0, raw);
    }
    const inferred = inferHeight(
      inferenceSceneOf(snapFloor(env, floor)),
      raw,
      env.runtime.worldUnitsPerPixel(),
      {
        at,
        excludeWallIds: target.kind === "walls" ? target.wallIds : [],
        preferAreaId: area.id,
        format: (mm) => formatLength(mm, unitOf(env)),
      },
    );
    if (inferred === undefined && target.kind === "raise") {
      // A new wall also snaps to the house's default wall height (Phase 4.4).
      const preset = effectiveWallHeightMm(houseOf(env));
      if (Math.abs(raw - preset) <= inferenceCapturePx * env.runtime.worldUnitsPerPixel()) {
        env.setCue({
          lines: [],
          marker: { ...at, h: preset },
          label: `Default height ${formatLength(preset, unitOf(env))}`,
        });
        return preset;
      }
    }
    env.setCue(inferred?.cue);
    return Math.max(0, inferred?.heightMm ?? raw);
  };

  const effective = (): number => Math.max(0, valueOf(input, height, unitOf(env)));

  const preview = (): void => {
    const h = effective();
    const edges =
      target.kind === "walls"
        ? target.edges
        : target.pieces.flatMap((piece) =>
            piece.points.slice(1).map((point, index) => [piece.points[index] ?? point, point] as const),
          );
    const overlay: OverlayPrimitive[] = edges.flatMap(([a, b]) => [
      { kind: "segment", from: { ...a, h }, to: { ...b, h }, tone: "accent" },
      { kind: "verticalLine", at: a, fromHMm: 0, toHMm: h, tone: "accent" },
      { kind: "verticalLine", at: b, fromHMm: 0, toHMm: h, tone: "accent" },
      ...(target.kind === "raise"
        ? [{ kind: "segment" as const, from: a, to: b, tone: "accent" as const }]
        : []),
    ]);
    env.setOverlay(overlay);
    env.setReadout({ text: readoutOf(input, height, unitOf(env)), screen });
  };

  const finish = (): void => {
    input.typed = "";
    finishTool(env);
    onDone();
  };

  const commit = (): void => {
    const h = effective();
    const current = focusArea(env);
    finish();
    if (current === undefined) return;
    const floorId = env.session.ui.getState().activeFloorId;
    if (target.kind === "walls") {
      if (h < 1) {
        env.session.notify("info", "A wall needs some height; use Delete to remove it.");
        return;
      }
      env.session.execute(
        setPropertyCommand(
          houseOf(env),
          target.wallIds,
          ["heightMm"],
          Math.round(h * 10) / 10,
          target.wallIds.length > 1 ? "Set wall heights" : "Set wall height",
        ),
      );
      return;
    }
    if (h < 1) return;
    const template = current.walls[0];
    const { command, wallIds } = raiseWallsCommand(
      floorId,
      current.id,
      target.pieces.map((piece) => ({
        shapeId: piece.shapeId,
        edgeKey: piece.edgeKey,
        fromMm: piece.fromMm,
        toMm: piece.toMm,
      })),
      Math.round(h * 10) / 10,
      template === undefined
        ? undefined
        : { thicknessMm: template.thicknessMm, alignment: template.alignment, materials: template.materials },
    );
    if (env.session.execute(command).ok) env.session.ui.setState({ selection: wallIds });
  };

  env.setCursor("pushPull");
  preview();
  return {
    pointer: (next) => {
      if (next.phase === "move") {
        screen = next.screen;
        height = pointerHeight(next.screen);
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
