import type { ReactElement, ReactNode } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "../Button/Button";
import { IconButton } from "../IconButton/IconButton";

type PopupProps = Readonly<{
  open: boolean;
  title: string;
  /** Omitted: the popup cannot be dismissed (no close button, Escape does nothing); its footer decides. */
  onClose?: () => void;
  children: ReactNode;
  onSave?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  saveDisabled?: boolean;
  busy?: boolean;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}>;

export const Popup = ({
  open,
  title,
  onClose,
  children,
  onSave,
  saveLabel = "Save",
  cancelLabel,
  saveDisabled = false,
  busy = false,
  footer,
  size = "md",
}: PopupProps): ReactElement => (
  <ModalOverlay
    isOpen={open}
    onOpenChange={(isOpen) => {
      if (!isOpen && !busy) onClose?.();
    }}
    isDismissable={false}
    isKeyboardDismissDisabled={busy || onClose === undefined}
    data-popup-overlay=""
  >
    <Modal
      data-popup-modal=""
      data-popup-sm={size === "sm" ? "" : undefined}
      data-popup-lg={size === "lg" ? "" : undefined}
      data-popup-xl={size === "xl" ? "" : undefined}
    >
      <Dialog data-popup="" aria-busy={busy ? true : undefined}>
        <header data-popup-header="">
          <Heading slot="title" data-popup-title="">
            {title}
          </Heading>
          {onClose === undefined ? null : (
            <IconButton icon="close" label="Close" onPress={onClose} disabled={busy} />
          )}
        </header>
        <div data-popup-body="">{children}</div>
        <footer data-popup-footer="">
          {footer ?? (
            <>
              {onClose === undefined ? null : (
                <Button variant="secondary" onPress={onClose} disabled={busy}>
                  {cancelLabel ?? (onSave === undefined ? "Close" : "Cancel")}
                </Button>
              )}
              {onSave === undefined ? null : (
                <Button variant="primary" onPress={onSave} disabled={saveDisabled} busy={busy}>
                  {saveLabel}
                </Button>
              )}
            </>
          )}
        </footer>
      </Dialog>
    </Modal>
  </ModalOverlay>
);
