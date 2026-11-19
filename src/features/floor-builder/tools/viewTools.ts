// Pan (H) and Orbit (O), SketchUp's camera tools (Phase 5.13, spec/builder/screens/floor-builder.md#camera-
// controls-and-view-choices). While one is active the viewport runtime turns primary drags into camera moves
// (BuilderViewport sets `setPrimaryDrag`), so these handlers only show the cursor and the hint; they never
// edit the model, change the selection, or enter history.
import { finishTool } from "./toolContext";
import type { ToolFactory, ViewportCursor } from "./toolTypes";

const createViewTool =
  (cursor: ViewportCursor, hint: string): ToolFactory =>
  (env) => {
    env.setHint(hint);
    env.setCursor(cursor);
    return {
      isActive: () => false,
      pointer: (event) => {
        if (event.phase === "move") env.setCursor(cursor);
      },
      key: () => false,
      cancel: () => {
        finishTool(env);
      },
    };
  };

export const createPanTool = (): ToolFactory =>
  createViewTool("pan", "Pan: drag to move the view. Pinch zooms.");

export const createOrbitTool = (): ToolFactory =>
  createViewTool("orbit", "Orbit: drag to turn the view around the point you grab. Shift pans; pinch zooms.");
