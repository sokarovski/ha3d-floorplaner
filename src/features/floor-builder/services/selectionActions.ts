// Non-property actions for the selection (custom panel section, D18): delete, duplicate, floor delete…
// Features register more actions (split wall, snap to shared wall, update template) as they arrive.
import { deleteFloorCommand } from "@shared/domain/commands/floorCommands";
import { deleteEntitiesCommand } from "@shared/domain/commands/deleteCommands";
import { duplicateAreaCommand } from "@shared/domain/commands/areaCommands";
import type { EntityRef } from "@shared/domain/house/entityIndex";
import type { EditorSession } from "./editorSession";
import { canHide, hideShortcutLabel, toggleHidden } from "./hideActions";

export type SelectionAction = Readonly<{ id: string; label: string; danger?: boolean; run: () => void }>;

export type SelectionActionProvider = (
  session: EditorSession,
  refs: readonly EntityRef[],
) => readonly SelectionAction[];

const providers: SelectionActionProvider[] = [];
let templateProvider: SelectionActionProvider | undefined;

/** The Floor Builder's navigation-aware template action (replaced per open builder). */
export const setTemplateActionProvider = (provider: SelectionActionProvider | undefined): void => {
  templateProvider = provider;
};

export const registerSelectionActions = (provider: SelectionActionProvider): void => {
  providers.push(provider);
};

export const deleteSelection = (session: EditorSession, refs: readonly EntityRef[]): void => {
  const house = session.documents.getState().document;
  const first = refs[0];
  if (first === undefined) return;
  if (first.kind === "floor" && refs.length === 1) {
    if (session.execute(deleteFloorCommand(house, first.id)).ok) session.ui.setState({ selection: [] });
    return;
  }
  if (refs.some((ref) => ref.kind === "house" || ref.kind === "floor" || ref.kind === "floorSurface")) {
    session.notify("info", "Select areas, walls, shapes, objects, or lights to delete them.");
    return;
  }
  if (
    session.execute(
      deleteEntitiesCommand(
        house,
        refs.map((ref) => ref.id),
      ),
    ).ok
  )
    session.ui.setState({ selection: [] });
};

const builtIn: SelectionActionProvider = (session, refs) => {
  const first = refs[0];
  if (first === undefined) return [];
  const actions: SelectionAction[] = [];
  if (refs.length === 1 && first.kind === "area") {
    actions.push({
      id: "duplicate",
      label: "Duplicate area",
      run: () => {
        const house = session.documents.getState().document;
        const { command, newAreaId } = duplicateAreaCommand(house, first.floorId, first.id);
        if (session.execute(command).ok && newAreaId !== undefined)
          session.ui.setState({ selection: [newAreaId] });
      },
    });
  }
  // Hide (Phase 7.5): session-only, the same as the tree's eye and Shift+H.
  const hideable = refs.filter((ref) => canHide(session, ref.id));
  if (hideable.length > 0) {
    const allHidden = hideable.every((ref) => session.ui.getState().hiddenIds.includes(ref.id));
    actions.push({
      id: "hide",
      label: `${allHidden ? "Show" : "Hide"} for this session (${hideShortcutLabel})`,
      run: () => {
        toggleHidden(
          session,
          hideable.map((ref) => ref.id),
        );
      },
    });
  }
  if (first.kind !== "house" && first.kind !== "floorSurface") {
    actions.push({
      id: "delete",
      label:
        refs.length > 1
          ? `Delete ${String(refs.length)} items`
          : first.kind === "floor"
            ? "Delete floor"
            : "Delete",
      danger: true,
      run: () => {
        deleteSelection(session, refs);
      },
    });
  }
  return actions;
};

export const selectionActionsFor = (
  session: EditorSession,
  refs: readonly EntityRef[],
): readonly SelectionAction[] => [
  ...(templateProvider === undefined ? [] : templateProvider(session, refs)),
  ...providers.flatMap((provider) => provider(session, refs)),
  ...builtIn(session, refs),
];
