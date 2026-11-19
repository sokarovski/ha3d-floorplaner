import { useState } from "react";
import type { ReactElement } from "react";
import { Button } from "../../../design-system/components/Button/Button";
import { Popup } from "../../../design-system/components/Popup/Popup";

export const PopupExample = (): ReactElement => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onPress={() => {
          setOpen(true);
        }}
      >
        Open popup
      </Button>
      <Popup
        open={open}
        title="Rename"
        onClose={() => {
          setOpen(false);
        }}
        onSave={() => {
          setOpen(false);
        }}
      >
        <p>Header with title and close, body, and the default Cancel/Save footer.</p>
      </Popup>
    </>
  );
};
