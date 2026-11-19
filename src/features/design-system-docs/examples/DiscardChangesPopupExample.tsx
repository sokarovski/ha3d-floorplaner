import { useState } from "react";
import type { ReactElement } from "react";
import { Button } from "../../../design-system/components/Button/Button";
import { DiscardChangesPopup } from "../../../design-system/forms/DiscardChangesPopup/DiscardChangesPopup";

export const DiscardChangesPopupExample = (): ReactElement => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        onPress={() => {
          setOpen(true);
        }}
      >
        Close a changed form
      </Button>
      <DiscardChangesPopup
        open={open}
        onKeepEditing={() => {
          setOpen(false);
        }}
        onDiscard={() => {
          setOpen(false);
        }}
      />
    </>
  );
};
