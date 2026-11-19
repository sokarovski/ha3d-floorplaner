import type { ReactElement } from "react";
import { savePresetForm } from "@shared/domain/schemas/forms/materialForms";
import type { SurfaceMaterialValue } from "@shared/domain/schemas/values";
import { FormPopup } from "../../../design-system/forms/FormPopup/FormPopup";
import { FormSubmitError } from "../../../design-system/forms/formErrors";
import { useDomainEditorData } from "./domainEditorData";

type SavePresetPopupProps = Readonly<{
  material: SurfaceMaterialValue | undefined;
  onClose: () => void;
}>;

export const SavePresetPopup = ({ material, onClose }: SavePresetPopupProps): ReactElement | null => {
  const data = useDomainEditorData();
  return material === undefined ? null : (
    <FormPopup
      open
      schema={savePresetForm}
      values={{}}
      onCancel={onClose}
      onSubmit={async (values) => {
        await Promise.resolve();
        if (!data.savePreset(values.name, material))
          throw new FormSubmitError("The preset could not be saved.");
        onClose();
      }}
    />
  );
};
