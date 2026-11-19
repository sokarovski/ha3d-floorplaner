// Selection actions for carpet stacking (Phase 7.3): later carpets lie on top of earlier ones in the same room.
import { reorderCarpetCommand } from "@shared/domain/commands/furnishingCommands";
import type { SelectionAction, SelectionActionProvider } from "./selectionActions";

export const carpetOrderActions: SelectionActionProvider = (session, refs) => {
  const only = refs.length === 1 ? refs[0] : undefined;
  if (only?.kind !== "carpet") return [];
  const area = session.documents
    .getState()
    .document.floors.find((floor) => floor.id === only.floorId)
    ?.areas.find((candidate) => candidate.id === only.areaId);
  const carpets = area?.floor.carpets ?? [];
  if (carpets.length < 2) return [];
  const index = carpets.findIndex((carpet) => carpet.id === only.id);
  const actions: SelectionAction[] = [];
  if (index < carpets.length - 1)
    actions.push({
      id: "carpet-forward",
      label: "Bring forward",
      run: () => {
        session.execute(reorderCarpetCommand(only.floorId, only.areaId, only.id, "forward"));
      },
    });
  if (index > 0)
    actions.push({
      id: "carpet-backward",
      label: "Send backward",
      run: () => {
        session.execute(reorderCarpetCommand(only.floorId, only.areaId, only.id, "backward"));
      },
    });
  return actions;
};
