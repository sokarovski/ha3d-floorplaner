// Orphan repair (D04): click a bare boundary edge to anchor the flagged wall there; never remapped silently.
import { reassignWallCommand } from "@shared/domain/commands/wallCommands";
import { barePieces, boundaryPieces, nearestPiece } from "./planGeometry";
import { snapCapturePx } from "./snapping";
import { finishTool, focusArea } from "./toolContext";
import type { ToolFactory } from "./toolTypes";

export const createReassignWallTool = (): ToolFactory => (env) => {
  env.setHint("Click a bare floor edge to anchor the selected wall there. Esc cancels.");
  const done = (): void => {
    finishTool(env);
    env.session.ui.setState({ tool: "select", reassignWallId: undefined });
  };
  return {
    isActive: () => true,
    pointer: (event) => {
      const area = focusArea(env);
      const wallId = env.session.ui.getState().reassignWallId;
      if (area === undefined || wallId === undefined || event.plan === null) return;
      const bare = boundaryPieces(area).flatMap((piece) => barePieces(area, piece));
      const near = nearestPiece(bare, event.plan, snapCapturePx * 2 * env.runtime.worldUnitsPerPixel());
      if (event.phase === "move")
        env.setOverlay(
          near === undefined ? [] : [{ kind: "segment", from: near.start, to: near.end, tone: "warning" }],
        );
      else if (event.phase === "down" && event.button === 0 && near !== undefined) {
        env.session.execute(
          reassignWallCommand(env.session.ui.getState().activeFloorId, area.id, wallId, {
            shapeId: near.shapeId,
            edgeKey: near.edgeKey,
            fromMm: near.fromMm,
            toMm: near.toMm,
          }),
        );
        done();
      }
    },
    key: (event) => {
      if (event.key !== "Escape") return false;
      done();
      return true;
    },
    cancel: () => {
      finishTool(env);
    },
  };
};
