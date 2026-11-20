import { useState } from "react";
import type { ReactElement } from "react";
import { Button } from "../../../design-system/components/Button/Button";
import { DiscardChangesPopup } from "../../../design-system/forms/DiscardChangesPopup/DiscardChangesPopup";

export const DiscardChangesPopupSaveExample = (): ReactElement => {
  const [open, setOpen] = useState(false);
  const close = (): void => {
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
        Choose another material with unsaved changes
      </Button>
      <DiscardChangesPopup
        open={open}
        title="Unsaved changes"
        message="There are unsaved changes to Kitchen tiles."
        keepLabel="Cancel"
        onSave={close}
        onKeepEditing={close}
        onDiscard={close}
      />
    </>
  );
};
