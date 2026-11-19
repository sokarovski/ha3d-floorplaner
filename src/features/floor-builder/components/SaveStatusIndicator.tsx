import type { ReactElement } from "react";
import { useStore } from "zustand";
import { Button } from "../../../design-system/components/Button/Button";
import { useSaveState, useSession } from "../hooks/sessionContext";
import { saveStatusText } from "../services/saveStatusText";

/**
 * Only problems are shown (owner, Phase 13.2): a failed write (with Retry now) or a conflict. Normal states
 * ("Saved", "Changes pending…") are not shown; the Save button's enabled state says whether there is
 * something to save.
 */
export const SaveStatusIndicator = (): ReactElement | null => {
  const session = useSession();
  const save = useSaveState((value) => value);
  const generation = useStore(session.documents, (state) => state.generation);
  const status = saveStatusText(save, generation);
  if (status.tone !== "danger") return null;
  return (
    <div data-save-status="" data-save-status-tone={status.tone} role="status" aria-live="polite">
      <span data-save-status-dot="" />
      <span>{status.text}</span>
      {save.status === "failed" ? (
        <Button size="sm" variant="ghost" onPress={session.save.retry}>
          Retry now
        </Button>
      ) : null}
    </div>
  );
};
