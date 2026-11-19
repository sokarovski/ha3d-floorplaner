// Applies frame requests from the UI store (F key, Fit to screen, tree magnifiers, editor entry, floor
// switches) and the toolbox's camera presets (look straight down, turn 90°, then fit) to the runtime.
import { useEffect } from "react";
import type { ViewportRuntime } from "../../../renderer/runtimeTypes";
import { selectionAreaIds } from "../services/viewportSelection";
import { fitToScreen } from "../services/treeActions";
import { areaBounds } from "../tools/planGeometry";
import { floorsBoundsInHouse } from "@shared/geometry/floorMove";
import { useSession } from "./sessionContext";

export const useViewportFraming = (runtime: ViewportRuntime | null): void => {
  const session = useSession();
  useEffect(() => {
    if (runtime === null) return undefined;
    let last = session.ui.getState().frameRequest.serial;
    return session.ui.subscribe((state) => {
      if (state.frameRequest.serial === last) return;
      last = state.frameRequest.serial;
      const house = session.documents.getState().document;
      const floor = house.floors.find((candidate) => candidate.id === state.activeFloorId);
      const target = state.frameRequest.target;
      if (state.houseOverview) {
        // Whole house (Phase 16.4): the selected floors, else every floor (house frame).
        const bounds =
          target === "selection"
            ? floorsBoundsInHouse(house.floors.filter((candidate) => state.selection.includes(candidate.id)))
            : undefined;
        runtime.frame(bounds === undefined ? { kind: "floor" } : { kind: "bounds", ...bounds });
        return;
      }
      if (target !== "floor" && floor !== undefined) {
        const ids = new Set(
          target === "focus"
            ? state.focusAreaId === undefined
              ? []
              : [state.focusAreaId]
            : selectionAreaIds(house, state.selection, state.focusAreaId),
        );
        const bounds = areaBounds(floor.areas.filter((area) => ids.has(area.id)));
        if (bounds !== undefined) {
          runtime.frame({ kind: "bounds", ...bounds });
          return;
        }
      }
      runtime.frame({ kind: "floor" });
    });
  }, [runtime, session]);
  useEffect(() => {
    if (runtime === null) return undefined;
    let last = session.ui.getState().cameraRequest.serial;
    return session.ui.subscribe((state) => {
      if (state.cameraRequest.serial === last) return;
      last = state.cameraRequest.serial;
      runtime.cameraPreset(state.cameraRequest.preset);
      session.ui.setState({ viewMode: "3d" });
      fitToScreen(session);
    });
  }, [runtime, session]);
};
