import type { ReactElement } from "react";
import { importModelForm } from "@shared/domain/schemas/forms/modelForms";
import { FormPopup } from "../../../design-system/forms/FormPopup/FormPopup";
import { useAppServices } from "../../../app/appServicesContext";
import { submitWithFormErrors } from "../../forms/toFormSubmitError";

type ImportModelPopupProps = Readonly<{
  open: boolean;
  houseId: string;
  onClose: () => void;
  onImported: (templateId: string) => void;
}>;

export const ImportModelPopup = ({
  open,
  houseId,
  onClose,
  onImported,
}: ImportModelPopupProps): ReactElement | null => {
  const { templates } = useAppServices();
  return (
    <FormPopup
      open={open}
      schema={importModelForm}
      values={{}}
      onCancel={onClose}
      onSubmit={async (values) => {
        const result = await submitWithFormErrors(() =>
          templates.importModel(
            houseId,
            values.file,
            values.format === "stl"
              ? { format: "stl", unit: values.unit, upAxis: values.upAxis, frontAxis: values.frontAxis }
              : { format: "gltf" },
          ),
        );
        onImported(result.templateId);
      }}
    />
  );
};
