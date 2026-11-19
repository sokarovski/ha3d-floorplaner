import { useState } from "react";
import type { ReactElement } from "react";
import type { ImageEntryValue } from "@shared/contracts/images";
import { renameImageForm } from "@shared/domain/schemas/forms/imageForms";
import { savePresetForm } from "@shared/domain/schemas/forms/materialForms";
import { deletePresetCommand, renamePresetCommand } from "@shared/domain/commands/presetCommands";
import { referencedImageIds } from "@shared/domain/materials/materialView";
import { Button } from "../../../design-system/components/Button/Button";
import { IconButton } from "../../../design-system/components/IconButton/IconButton";
import { FormPopup } from "../../../design-system/forms/FormPopup/FormPopup";
import { FormSubmitError } from "../../../design-system/forms/formErrors";
import { PropertyGroup } from "../../../design-system/forms/PropertyGroup/PropertyGroup";
import { useAppServices } from "../../../app/appServicesContext";
import { submitWithFormErrors } from "../../forms/toFormSubmitError";
import { useDomainEditorData } from "../domain-editors/domainEditorData";
import { UploadImagePopup } from "../domain-editors/UploadImagePopup";
import { useHistoryState, useHouse, useSession } from "../hooks/sessionContext";
import { useNavigate } from "react-router";
import { paths } from "../../../app/routes/paths";

export const HouseLibrariesSection = (): ReactElement => {
  const session = useSession();
  const services = useAppServices();
  const data = useDomainEditorData();
  const onImagesChanged = data.reloadImages;
  const navigate = useNavigate();
  const houseTemplates = data.templates.filter((template) => template.source === "house");
  const house = useHouse((value) => value);
  const history = useHistoryState((value) => value);
  const [uploading, setUploading] = useState(false);
  const [renamingImage, setRenamingImage] = useState<ImageEntryValue | undefined>(undefined);
  const [renamingPreset, setRenamingPreset] = useState<string | undefined>(undefined);
  const deleteImage = (image: ImageEntryValue): void => {
    const inHistory = JSON.stringify([history.past, history.future]).includes(image.id);
    if (referencedImageIds(house).has(image.id) || inHistory) {
      session.notify(
        "warning",
        `“${image.name}” is still used${inHistory ? " by the undo history" : ""} and cannot be deleted.`,
      );
      return;
    }
    services.images.remove(session.houseId, image.id).then(onImagesChanged, (error: unknown) => {
      session.notify("danger", error instanceof Error ? error.message : "The image could not be deleted.");
    });
  };
  const houseRenamedPreset = house.materialPresets.find((preset) => preset.id === renamingPreset);
  return (
    <>
      <PropertyGroup title={`Images (${String(data.images.length)})`}>
        <ul data-library-list="">
          {data.images.map((image) => (
            <li key={image.id} data-library-item="">
              <img src={data.thumbnailUrl(image.id)} alt="" data-image-editor-thumb="" />
              <span data-library-name="">{image.name}</span>
              <IconButton
                icon="edit"
                size="sm"
                label={`Rename ${image.name}`}
                onPress={() => {
                  setRenamingImage(image);
                }}
              />
              <IconButton
                icon="trash"
                size="sm"
                variant="danger"
                label={`Delete ${image.name}`}
                onPress={() => {
                  deleteImage(image);
                }}
              />
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          variant="secondary"
          onPress={() => {
            setUploading(true);
          }}
        >
          Upload image…
        </Button>
      </PropertyGroup>
      <PropertyGroup title={`Objects (${String(houseTemplates.length)})`}>
        <ul data-library-list="">
          {houseTemplates.map((template) => (
            <li key={template.id} data-library-item="">
              <span data-library-name="">
                {template.label} · v{Math.max(...template.versions, 0)}
              </span>
              <IconButton
                icon="edit"
                size="sm"
                label={`Edit ${template.label}`}
                onPress={() => {
                  void navigate(paths.object(session.houseId, template.id));
                }}
              />
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          variant="secondary"
          onPress={() => {
            void navigate(paths.newObject(session.houseId));
          }}
        >
          Import model…
        </Button>
      </PropertyGroup>
      <PropertyGroup title={`Material presets (${String(house.materialPresets.length)})`}>
        {house.materialPresets.length === 0 ? (
          <p data-library-empty="">Use “Save as preset” in a material to add one.</p>
        ) : null}
        <ul data-library-list="">
          {house.materialPresets.map((preset) => (
            <li key={preset.id} data-library-item="">
              <span data-library-name="">{preset.name}</span>
              <IconButton
                icon="edit"
                size="sm"
                label={`Rename ${preset.name}`}
                onPress={() => {
                  setRenamingPreset(preset.id);
                }}
              />
              <IconButton
                icon="trash"
                size="sm"
                variant="danger"
                label={`Delete ${preset.name}`}
                onPress={() => {
                  session.execute(deletePresetCommand(preset.id));
                }}
              />
            </li>
          ))}
        </ul>
      </PropertyGroup>
      <UploadImagePopup
        open={uploading}
        onClose={() => {
          setUploading(false);
        }}
        onUploaded={() => {
          onImagesChanged();
        }}
      />
      {renamingImage === undefined ? null : (
        <FormPopup
          open
          schema={renameImageForm}
          values={{ name: renamingImage.name }}
          onCancel={() => {
            setRenamingImage(undefined);
          }}
          onSubmit={async (values) => {
            await submitWithFormErrors(() =>
              services.images.rename(session.houseId, renamingImage.id, values.name),
            );
            setRenamingImage(undefined);
            onImagesChanged();
          }}
        />
      )}
      {houseRenamedPreset === undefined ? null : (
        <FormPopup
          open
          schema={{
            ...savePresetForm,
            "x-homeplan": { title: "Rename preset", submitLabel: "Rename", size: "sm" },
          }}
          values={{ name: houseRenamedPreset.name }}
          onCancel={() => {
            setRenamingPreset(undefined);
          }}
          onSubmit={async (values) => {
            await Promise.resolve();
            if (!session.execute(renamePresetCommand(houseRenamedPreset.id, values.name)).ok)
              throw new FormSubmitError("The preset could not be renamed.");
            setRenamingPreset(undefined);
          }}
        />
      )}
    </>
  );
};
