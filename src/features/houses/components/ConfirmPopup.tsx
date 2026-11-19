import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Banner } from "../../../design-system/components/Banner/Banner";
import { Button } from "../../../design-system/components/Button/Button";
import { Popup } from "../../../design-system/components/Popup/Popup";

type ConfirmPopupProps = Readonly<{
  open: boolean;
  title: string;
  confirmLabel: string;
  danger?: boolean;
  children: ReactNode;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}>;

export const ConfirmPopup = ({
  open,
  title,
  confirmLabel,
  danger = true,
  children,
  onConfirm,
  onClose,
}: ConfirmPopupProps): ReactElement => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const confirm = (): void => {
    setBusy(true);
    setError(undefined);
    onConfirm().then(
      () => {
        setBusy(false);
      },
      (failure: unknown) => {
        setBusy(false);
        setError(failure instanceof Error ? failure.message : "The action failed.");
      },
    );
  };
  return (
    <Popup
      open={open}
      title={title}
      size="sm"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onPress={confirm} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {error === undefined ? null : <Banner tone="danger">{error}</Banner>}
    </Popup>
  );
};
