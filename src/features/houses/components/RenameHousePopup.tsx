import type { ReactElement } from "react";
import type { ValidHouseCardValue } from "@shared/contracts/houses";
import { renameHouseForm } from "@shared/domain/schemas/forms/houseForms";
import { FormPopup } from "../../../design-system/forms/FormPopup/FormPopup";
import { useAppServices } from "../../../app/appServicesContext";
import { submitWithFormErrors } from "../../forms/toFormSubmitError";

type RenameHousePopupProps = Readonly<{
  house: ValidHouseCardValue | undefined;
  onClose: () => void;
  onRenamed: () => void;
}>;

export const RenameHousePopup = ({
  house,
  onClose,
  onRenamed,
}: RenameHousePopupProps): ReactElement | null => {
  const { houses } = useAppServices();
  return house === undefined ? null : (
    <FormPopup
      open
      schema={renameHouseForm}
      values={{ name: house.name }}
      onCancel={onClose}
      onSubmit={async (values) => {
        await submitWithFormErrors(() => houses.rename(house.id, values.name, house.revision));
        onRenamed();
      }}
    />
  );
};
