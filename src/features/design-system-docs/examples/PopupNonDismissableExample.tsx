import { useState } from "react";
import type { ReactElement } from "react";
import { Button } from "../../../design-system/components/Button/Button";
import { Popup } from "../../../design-system/components/Popup/Popup";

export const PopupNonDismissableExample = (): ReactElement => {
  const [open, setOpen] = useState(false);
  const choose = (): void => {
    setOpen(false);
  };
  return (
    <>
      <Button
        variant="secondary"
        onPress={() => {
          setOpen(true);
        }}
      >
        Show conflict…
      </Button>
      {/* No onClose: no close button and Escape does nothing; one of the footer choices must be taken. */}
      <Popup
        open={open}
        title="This house was changed elsewhere"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onPress={choose}>
              Reload server copy
            </Button>
            <Button variant="danger" onPress={choose}>
              Keep my version
            </Button>
          </>
        }
      >
        <p>Choose which copy to keep. The popup stays open until you do.</p>
      </Popup>
    </>
  );
};
