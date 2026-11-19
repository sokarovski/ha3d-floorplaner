// Push/pull (U): hover a bare floor edge or a wall's top edge (it highlights), press and move: a new wall grows
// from 0, an existing wall changes height; both snap to other wall heights and commit on release, a second
// click, or a typed height and Enter. Shift at the start raises every bare edge of the area, or changes every
// selected wall (spec/builder/screens/floor-builder.md#create-and-raise-walls). The tool stays active (SketchUp).
import { focusArea, finishTool } from "./toolContext";
import type { ToolFactory } from "./toolTypes";
import { handleAt, handleOverlay, wallHandlesOf } from "./wallHandles";
import type { WallOperation } from "./wallPushPull";
import { startPushPull } from "./wallPushPull";

export const createRaiseWallTool = (): ToolFactory => (env) => {
  let operation: WallOperation | undefined;

  env.setHint(
    "Point at a bare floor edge or a wall's top edge, press and move (or type a height), then release or click. Shift: every bare edge, or every selected wall.",
  );
  return {
    isActive: () => operation !== undefined,
    target: (event) => {
      const area = focusArea(env);
      if (area === undefined) return undefined;
      const handle = handleAt(env, wallHandlesOf(area, ["top", "bare"]), event.screen, event.hit);
      return handle?.kind === "bare" ? handle.piece.shapeId : handle?.wallId;
    },
    pointer: (event) => {
      if (operation !== undefined) {
        operation.pointer(event);
        return;
      }
      const area = focusArea(env);
      if (area === undefined) return;
      const handle = handleAt(env, wallHandlesOf(area, ["top", "bare"]), event.screen, event.hit);
      if (event.phase === "move" || event.phase === "leave") {
        env.setOverlay(handle === undefined ? [] : handleOverlay(handle));
        env.setCursor(handle === undefined ? "default" : "pushPull");
      } else if (
        event.phase === "down" &&
        event.button === 0 &&
        handle !== undefined &&
        handle.kind !== "end"
      ) {
        operation = startPushPull(env, handle, event, event.shiftKey, () => {
          operation = undefined;
        });
      }
    },
    key: (event) => operation?.key(event) ?? false,
    cancel: () => {
      operation?.cancel();
      operation = undefined;
      finishTool(env);
    },
  };
};
