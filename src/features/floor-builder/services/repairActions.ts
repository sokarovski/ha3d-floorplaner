// Repair and housekeeping actions: reassign an orphaned wall, clear the floor's guides.
import { clearGuidesCommand } from "@shared/domain/commands/guideCommands";
import type { SelectionActionProvider } from "./selectionActions";
import { floorGeometryIssues } from "./floorIssues";
import { enterAreaEditor } from "./treeActions";

export const repairActions: SelectionActionProvider = (session, refs) => {
  const first = refs[0];
  if (first === undefined || refs.length !== 1) return [];
  if (first.kind === "wall") {
    const house = session.documents.getState().document;
    const orphan = floorGeometryIssues(house, first.floorId).some(
      (issue) => issue.kind === "orphanWall" && issue.wallId === first.id,
    );
    return orphan
      ? [
          {
            id: "reassign",
            label: "Reassign to an edge…",
            run: () => {
              enterAreaEditor(session, first.areaId);
              session.ui.setState({ tool: "reassignWall", reassignWallId: first.id });
            },
          },
        ]
      : [];
  }
  if (first.kind === "guide") {
    return [
      {
        id: "clearGuides",
        label: "Clear all guides",
        danger: true,
        run: () => {
          session.execute(clearGuidesCommand(first.floorId));
          session.ui.setState({ selection: [] });
        },
      },
    ];
  }
  return [];
};
