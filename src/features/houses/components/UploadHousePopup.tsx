import { useState } from "react";
import type { ReactElement } from "react";
import { nameUploadedHouseForm, uploadHouseForm } from "@shared/domain/schemas/forms/houseForms";
import { ApiClientError } from "../../../api/apiError";
import { useAppServices } from "../../../app/appServicesContext";
import { FormPopup } from "../../../design-system/forms/FormPopup/FormPopup";
import { submitWithFormErrors, toFormSubmitError } from "../../forms/toFormSubmitError";

type UploadHousePopupProps = Readonly<{
  open: boolean;
  onClose: () => void;
  onUploaded: (houseId: string) => void;
}>;

/**
 * Upload house (Phase 21): a house archive becomes a new house. When its name is in use, a second popup asks for
 * a name, prefilled with the server's suggestion (the name with a number), to keep or change.
 */
export const UploadHousePopup = ({
  open,
  onClose,
  onUploaded,
}: UploadHousePopupProps): ReactElement | null => {
  const { houses } = useAppServices();
  const [conflict, setConflict] = useState<Readonly<{ file: File; suggestion: string }> | undefined>(
    undefined,
  );
  return (
    <>
      <FormPopup
        open={open && conflict === undefined}
        schema={uploadHouseForm}
        values={{}}
        onCancel={onClose}
        onSubmit={async (values) => {
          try {
            const card = await houses.importArchive(values.file);
            onUploaded(card.id);
          } catch (error: unknown) {
            const suggestion = error instanceof ApiClientError ? error.details?.suggestion : undefined;
            if (
              error instanceof ApiClientError &&
              error.code === "nameTaken" &&
              typeof suggestion === "string"
            ) {
              setConflict({ file: values.file, suggestion });
              return;
            }
            throw toFormSubmitError(error);
          }
        }}
      />
      <FormPopup
        open={open && conflict !== undefined}
        schema={nameUploadedHouseForm}
        values={{ name: conflict?.suggestion ?? "" }}
        onCancel={() => {
          setConflict(undefined);
          onClose();
        }}
        onSubmit={async (values) => {
          if (conflict === undefined) return;
          const card = await submitWithFormErrors(() => houses.importArchive(conflict.file, values.name));
          setConflict(undefined);
          onUploaded(card.id);
        }}
      />
    </>
  );
};
