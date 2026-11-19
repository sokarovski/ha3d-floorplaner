// Trim or extend (E): hover a wall's vertical end line (it highlights), press and move along the wall, or type
// a distance; release, click, or Enter commits. Pushing onto the other end removes the wall; past a corner
// continues onto the next edge. Only end lines are offered in this tool.
import { finishTool, focusArea } from "./toolContext";
import type { ToolFactory } from "./toolTypes";
import { handleAt, handleOverlay, wallHandlesOf } from "./wallHandles";
import type { WallOperation } from "./wallPushPull";
import { startTrim } from "./wallTrim";

export const createTrimWallTool = (): ToolFactory => (env) => {
  let operation: WallOperation | undefined;

  env.setHint(
    "Point at a wall's vertical end line, press and move along the wall (or type a distance), then release or click. Push onto the other end to remove the wall.",
  );
  return {
    isActive: () => operation !== undefined,
    target: (event) => {
      const area = focusArea(env);
      if (area === undefined) return undefined;
      const handle = handleAt(env, wallHandlesOf(area, ["end"]), event.screen, event.hit);
      return handle?.kind === "end" ? handle.wallId : undefined;
    },
    pointer: (event) => {
      if (operation !== undefined) {
        operation.pointer(event);
        return;
      }
      const area = focusArea(env);
      if (area === undefined) return;
      const handle = handleAt(env, wallHandlesOf(area, ["end"]), event.screen, event.hit);
      if (event.phase === "move" || event.phase === "leave") {
        env.setOverlay(handle === undefined ? [] : handleOverlay(handle));
        env.setCursor(handle === undefined ? "default" : "trim");
      } else if (event.phase === "down" && event.button === 0 && handle?.kind === "end") {
        operation = startTrim(env, handle, event, () => {
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
