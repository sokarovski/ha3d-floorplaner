// Flags shown in the tree (orphaned walls, intrusions, openings that do not fit) from the geometry core.
import { useMemo } from "react";
import type { TreeIssues } from "../services/houseTree";
import { collectIssues } from "../services/floorIssues";
import { useHouse, useUi } from "./sessionContext";

export const useTreeIssues = (): TreeIssues => {
  const house = useHouse((value) => value);
  const floorId = useUi((ui) => ui.activeFloorId);
  return useMemo(() => collectIssues(house, floorId), [house, floorId]);
};
