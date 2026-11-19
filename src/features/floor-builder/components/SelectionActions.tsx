import type { ReactElement } from "react";
import type { EntityRef } from "@shared/domain/house/entityIndex";
import { MenuButton } from "../../../design-system/components/MenuButton/MenuButton";
import { useSession } from "../hooks/sessionContext";
import { selectionActionsFor } from "../services/selectionActions";

type SelectionActionsProps = Readonly<{
  refs: readonly EntityRef[];
}>;

/**
 * The selection's actions (Phase 7.6, owner): a ⋯ menu in the properties panel header instead of a row of buttons
 * under the properties. Destructive actions (Delete) come last.
 */
export const SelectionActions = ({ refs }: SelectionActionsProps): ReactElement | null => {
  const session = useSession();
  const actions = [...selectionActionsFor(session, refs)].sort(
    (a, b) => Number(a.danger === true) - Number(b.danger === true),
  );
  return actions.length === 0 ? null : (
    <MenuButton
      label="Actions"
      text="Actions"
      variant="secondary"
      size="sm"
      placement="bottom end"
      items={actions.map((action) => ({
        id: action.id,
        label: action.label,
        ...(action.danger === true ? { danger: true, icon: "trash" as const } : {}),
      }))}
      onAction={(id) => {
        actions.find((action) => action.id === id)?.run();
      }}
    />
  );
};
