import type { ReactElement } from "react";
import { Button } from "../../../design-system/components/Button/Button";
import { Popup } from "../../../design-system/components/Popup/Popup";
import { useSaveState, useSession } from "../hooks/sessionContext";

type ConflictPopupProps = Readonly<{
  onReload: () => void;
}>;

export const ConflictPopup = ({ onReload }: ConflictPopupProps): ReactElement => {
  const session = useSession();
  const conflict = useSaveState((save) => save.status === "conflict");
  return (
    <Popup
      open={conflict}
      title="This house was changed elsewhere"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onPress={onReload}>
            Reload server copy
          </Button>
          <Button
            variant="danger"
            onPress={() => {
              void session.save.overwriteServer();
            }}
          >
            Keep my version
          </Button>
        </>
      }
    >
      <p>
        The saved file is newer than the copy you are editing, for example because the house is open in
        another tab. Your edits are kept here. Reload to discard them and continue from the saved copy, or
        keep your version and overwrite the saved file.
      </p>
    </Popup>
  );
};
