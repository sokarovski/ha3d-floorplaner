import type { ReactElement } from "react";
import { newHouseForm } from "@shared/domain/schemas/forms/houseForms";
import { FormPopup } from "../../../design-system/forms/FormPopup/FormPopup";
import { useAppServices } from "../../../app/appServicesContext";
import { submitWithFormErrors } from "../../forms/toFormSubmitError";

type NewHousePopupProps = Readonly<{
  open: boolean;
  onClose: () => void;
  onCreated: (houseId: string) => void;
}>;

export const NewHousePopup = ({ open, onClose, onCreated }: NewHousePopupProps): ReactElement | null => {
  const { houses } = useAppServices();
  return (
    <FormPopup
      open={open}
      schema={newHouseForm}
      values={{}}
      onCancel={onClose}
      onSubmit={async (values) => {
        const card = await submitWithFormErrors(() => houses.create(values.name));
        onCreated(card.id);
      }}
    />
  );
};
