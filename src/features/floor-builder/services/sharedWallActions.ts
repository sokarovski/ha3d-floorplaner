// "Snap to shared wall": moves an intruding area back to the Full clash detent (D05).
import { setAreaTransformCommand } from "@shared/domain/commands/areaCommands";
import { computePushDetents } from "@shared/geometry/detents";
import type { SelectionActionProvider } from "./selectionActions";
import { floorGeometryIssues } from "./floorIssues";

export const sharedWallActions: SelectionActionProvider = (session, refs) => {
  const house = session.documents.getState().document;
  const floorId = session.ui.getState().activeFloorId;
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  if (floor === undefined) return [];
  const ids = new Set(
    refs.flatMap((ref) =>
      ref.kind === "wall" ? [ref.id] : ref.kind === "area" ? ref.value.walls.map((wall) => wall.id) : [],
    ),
  );
  const intrusion = floorGeometryIssues(house, floorId).find(
    (issue) => issue.kind === "intrusion" && ids.has(issue.wallId),
  );
  if (intrusion?.kind !== "intrusion") return [];
  const moving = floor.areas.find((area) => area.id === intrusion.areaId);
  const target = floor.areas.find((area) => area.id === intrusion.intrudedAreaId);
  if (moving === undefined || target === undefined) return [];
  for (const wall of target.walls) {
    const result = computePushDetents(
      { area: moving, wallId: intrusion.wallId },
      { area: target, wallId: wall.id },
    );
    if (result.ok) {
      const { positionMm } = result.detents.fullClash;
      return [
        {
          id: "snapShared",
          label: "Snap to shared wall",
          run: () => {
            session.execute(
              setAreaTransformCommand(
                floorId,
                moving.id,
                positionMm,
                moving.rotationDeg,
                "Snap to shared wall",
              ),
            );
          },
        },
      ];
    }
  }
  return [];
};
