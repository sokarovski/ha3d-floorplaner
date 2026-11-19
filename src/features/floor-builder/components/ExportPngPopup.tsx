import type { ReactElement } from "react";
import { exportPngForm } from "@shared/domain/schemas/forms/exportForms";
import { FormPopup } from "../../../design-system/forms/FormPopup/FormPopup";
import { FormSubmitError } from "../../../design-system/forms/formErrors";
import { useAppServices } from "../../../app/appServicesContext";
import { submitWithFormErrors } from "../../forms/toFormSubmitError";
import { downloadBlob } from "../../viewport/services/downloadBlob";
import { useSession } from "../hooks/sessionContext";
import { useViewportRef } from "../hooks/viewportRef";
import { exportMetadata } from "../services/exportMetadata";

type ExportPngPopupProps = Readonly<{
  open: boolean;
  onClose: () => void;
}>;

export const ExportPngPopup = ({ open, onClose }: ExportPngPopupProps): ReactElement | null => {
  const session = useSession();
  const services = useAppServices();
  const viewport = useViewportRef();
  return (
    <FormPopup
      open={open}
      schema={exportPngForm}
      values={{}}
      onCancel={onClose}
      onSubmit={async (values) => {
        const runtime = viewport.current;
        if (runtime === null) throw new FormSubmitError("The 3D view is not ready.");
        const scale = values.scale === "4" ? 4 : values.scale === "2" ? 2 : 1;
        const final = await runtime.exportPng({ scale, transparentBackground: values.transparentBackground });
        const house = session.documents.getState().document;
        const floorId = session.ui.getState().activeFloorId;
        const floorName = house.floors.find((floor) => floor.id === floorId)?.name ?? "floor";
        downloadBlob(final.blob, `${house.name} - ${floorName}.png`);
        if (values.saveToProject) {
          const written = await session.save.flush();
          if (!written)
            throw new FormSubmitError(
              "The house must be written before the export can be saved to the project.",
            );
          const preview =
            scale === 1
              ? final
              : await runtime.exportPng({ scale: 1, transparentBackground: values.transparentBackground });
          const metadata = exportMetadata(
            house,
            session.saves.getState().serverRevision,
            floorId,
            final.camera,
            {
              scale,
              transparentBackground: values.transparentBackground,
              widthPx: final.width,
              heightPx: final.height,
              capped: final.capped,
            },
          );
          await submitWithFormErrors(() =>
            services.exports.save(session.houseId, preview.blob, final.blob, metadata),
          );
        }
        session.notify(
          "info",
          `Exported ${String(final.width)} × ${String(final.height)} px${final.capped ? " (limited by the GPU)" : ""}${values.saveToProject ? " and saved to the project" : ""}.`,
        );
        onClose();
      }}
    />
  );
};
