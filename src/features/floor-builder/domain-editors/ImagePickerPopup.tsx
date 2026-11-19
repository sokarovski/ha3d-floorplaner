import { useState } from "react";
import type { ReactElement } from "react";
import { builtInImages } from "@shared/domain/house/builtinMaterials";
import { Button } from "../../../design-system/components/Button/Button";
import { Popup } from "../../../design-system/components/Popup/Popup";
import { useDomainEditorData } from "./domainEditorData";
import { UploadImagePopup } from "./UploadImagePopup";

type ImagePickerPopupProps = Readonly<{
  open: boolean;
  selectedId: string | undefined;
  onPick: (imageId: string | undefined) => void;
  onClose: () => void;
}>;

export const ImagePickerPopup = ({
  open,
  selectedId,
  onPick,
  onClose,
}: ImagePickerPopupProps): ReactElement => {
  const data = useDomainEditorData();
  const [uploading, setUploading] = useState(false);
  return (
    <>
      <Popup
        open={open && !uploading}
        title="Choose a texture"
        size="lg"
        onClose={onClose}
        footer={
          <>
            <Button
              variant="ghost"
              onPress={() => {
                onPick(undefined);
              }}
            >
              No texture
            </Button>
            <Button
              variant="secondary"
              onPress={() => {
                setUploading(true);
              }}
            >
              Upload image…
            </Button>
            <Button variant="primary" onPress={onClose}>
              Done
            </Button>
          </>
        }
      >
        <h3 data-image-picker-heading="">House images</h3>
        {data.images.length === 0 ? (
          <p data-image-picker-empty="">This house has no images yet. Upload one to use it as a texture.</p>
        ) : (
          <div data-image-picker-grid="" role="listbox" aria-label="House images">
            {data.images.map((image) => (
              <button
                key={image.id}
                type="button"
                role="option"
                aria-selected={image.id === selectedId}
                data-image-picker-item=""
                onClick={() => {
                  onPick(image.id);
                }}
              >
                <img src={data.thumbnailUrl(image.id)} alt="" data-image-picker-thumb="" />
                <span data-image-picker-name="">{image.name}</span>
              </button>
            ))}
          </div>
        )}
        <h3 data-image-picker-heading="">Built-in textures</h3>
        <div data-image-picker-grid="" role="listbox" aria-label="Built-in textures">
          {builtInImages.map((image) => (
            <button
              key={image.id}
              type="button"
              role="option"
              aria-selected={image.id === selectedId}
              data-image-picker-item=""
              onClick={() => {
                onPick(image.id);
              }}
            >
              <img src={data.thumbnailUrl(image.id)} alt="" data-image-picker-thumb="" />
              <span data-image-picker-name="">{image.name}</span>
            </button>
          ))}
        </div>
      </Popup>
      <UploadImagePopup
        open={uploading}
        onClose={() => {
          setUploading(false);
        }}
        onUploaded={(image) => {
          setUploading(false);
          onPick(image.id);
        }}
      />
    </>
  );
};
