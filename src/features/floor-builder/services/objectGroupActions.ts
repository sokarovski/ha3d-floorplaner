// Selection actions for object groups: group two or more objects, lights, or carpets of one area (at least one
// object), or ungroup (spec/builder/features/object-groups.md).
import { groupObjectsCommand, ungroupObjectsCommand } from "@shared/domain/commands/objectGroupCommands";
import { indexEntities, objectGroupOf } from "@shared/domain/house/entityIndex";
import type { SelectionAction, SelectionActionProvider } from "./selectionActions";

export const objectGroupActions: SelectionActionProvider = (session, refs) => {
  const house = session.documents.getState().document;
  const entities = indexEntities(house);
  const actions: SelectionAction[] = [];
  // Lights and carpets may join a group (Phase 7.3: a lamp or a rug moves with its table); a group still needs
  // at least one object, so it stays an object group.
  const members = refs.flatMap((ref) =>
    (ref.kind === "object" && ref.value.attachment.host !== "wall") ||
    ref.kind === "light" ||
    ref.kind === "carpet"
      ? [ref]
      : [],
  );
  const first = members[0];
  if (
    first !== undefined &&
    members.length === refs.length &&
    members.length >= 2 &&
    members.some((ref) => ref.kind === "object") &&
    members.every((ref) => ref.areaId === first.areaId)
  )
    actions.push({
      id: "group-objects",
      label: `Group ${String(members.length)} items`,
      run: () => {
        const { command, groupId } = groupObjectsCommand(
          first.floorId,
          first.areaId,
          members.map((ref) => ref.id),
        );
        if (session.execute(command).ok) session.ui.setState({ selection: [groupId] });
      },
    });
  const only = refs.length === 1 ? refs[0] : undefined;
  const groupRef =
    only?.kind === "objectGroup"
      ? only
      : only?.kind === "object" || only?.kind === "light" || only?.kind === "carpet"
        ? (() => {
            const grouped = objectGroupOf(house, only.id);
            const ref = grouped === undefined ? undefined : entities.get(grouped.group.id);
            return ref?.kind === "objectGroup" ? ref : undefined;
          })()
        : undefined;
  if (groupRef !== undefined)
    actions.push({
      id: "ungroup-objects",
      label: "Ungroup",
      run: () => {
        if (session.execute(ungroupObjectsCommand(groupRef.floorId, groupRef.areaId, groupRef.id)).ok)
          // An open group no longer exists, so the session has already left it; select its members.
          session.ui.setState({ selection: groupRef.value.memberIds });
      },
    });
  return actions;
};
