import type { ReactElement } from "react";
import { Button } from "../../components/Button/Button";
import { Popup } from "../../components/Popup/Popup";

type DiscardChangesPopupProps = Readonly<{
  open: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
  /** Offers Save as well (the material chooser, owner 2026-11-20): saves the changes, then continues. */
  onSave?: () => void;
  title?: string;
  message?: string;
  /** The keep-editing button's text (default "Keep editing"; "Cancel" beside Save). */
  keepLabel?: string;
}>;

export const DiscardChangesPopup = ({
  open,
  onKeepEditing,
  onDiscard,
  onSave,
  title = "Discard changes?",
  message = "Your changes in this form will be lost.",
  keepLabel = "Keep editing",
}: DiscardChangesPopupProps): ReactElement => (
  <Popup
    open={open}
    title={title}
    size="sm"
    onClose={onKeepEditing}
    footer={
      <>
        {onSave === undefined ? null : (
          <Button onPress={onSave} autoFocus>
            Save
          </Button>
        )}
        <Button variant="secondary" onPress={onKeepEditing} autoFocus={onSave === undefined}>
          {keepLabel}
        </Button>
        <Button variant="danger" onPress={onDiscard}>
          Discard
        </Button>
      </>
    }
  >
    <p>{message}</p>
  </Popup>
);
