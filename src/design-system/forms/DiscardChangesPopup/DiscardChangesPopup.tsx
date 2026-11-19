import type { ReactElement } from "react";
import { Button } from "../../components/Button/Button";
import { Popup } from "../../components/Popup/Popup";

type DiscardChangesPopupProps = Readonly<{
  open: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
}>;

export const DiscardChangesPopup = ({
  open,
  onKeepEditing,
  onDiscard,
}: DiscardChangesPopupProps): ReactElement => (
  <Popup
    open={open}
    title="Discard changes?"
    size="sm"
    onClose={onKeepEditing}
    footer={
      <>
        <Button variant="secondary" onPress={onKeepEditing} autoFocus>
          Keep editing
        </Button>
        <Button variant="danger" onPress={onDiscard}>
          Discard
        </Button>
      </>
    }
  >
    <p>Your changes in this form will be lost.</p>
  </Popup>
);
