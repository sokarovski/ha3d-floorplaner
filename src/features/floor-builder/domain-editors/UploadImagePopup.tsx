import type { ReactElement } from "react";
import type { ImageEntryValue } from "@shared/contracts/images";
import { uploadImageForm } from "@shared/domain/schemas/forms/imageForms";
import { FormPopup } from "../../../design-system/forms/FormPopup/FormPopup";
import { submitWithFormErrors } from "../../forms/toFormSubmitError";
import { useDomainEditorData } from "./domainEditorData";

type UploadImagePopupProps = Readonly<{
  open: boolean;
  onClose: () => void;
  onUploaded: (image: ImageEntryValue) => void;
}>;

export const UploadImagePopup = ({
  open,
  onClose,
  onUploaded,
}: UploadImagePopupProps): ReactElement | null => {
  const data = useDomainEditorData();
  return (
    <FormPopup
      open={open}
      schema={uploadImageForm}
      values={{}}
      onCancel={onClose}
      onSubmit={async (values) => {
        const image = await submitWithFormErrors(() => data.uploadImage(values.file, values.name));
        onUploaded(image);
        onClose();
      }}
    />
  );
};
