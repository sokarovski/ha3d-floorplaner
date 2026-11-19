import { useState } from "react";
import type { ReactElement } from "react";
import { Button } from "../../../design-system/components/Button/Button";
import { Popup } from "../../../design-system/components/Popup/Popup";

export const PopupCustomFooterExample = (): ReactElement => {
  const [open, setOpen] = useState(false);
  const close = (): void => {
    setOpen(false);
  };
  return (
    <>
      <Button
        variant="danger"
        onPress={() => {
          setOpen(true);
        }}
      >
        Delete house…
      </Button>
      <Popup
        open={open}
        title="Delete house?"
        size="sm"
        onClose={close}
        footer={
          <>
            <Button variant="secondary" onPress={close}>
              Cancel
            </Button>
            <Button variant="danger" onPress={close}>
              Delete
            </Button>
          </>
        }
      >
        <p>The house moves to the trash. You can restore it later.</p>
      </Popup>
    </>
  );
};
