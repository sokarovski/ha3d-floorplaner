import { useState } from "react";
import type { ReactElement } from "react";
import { findBuiltInImage } from "@shared/domain/house/builtinMaterials";
import { Button } from "../../../design-system/components/Button/Button";
import type { PropertyEditorProps } from "../../../design-system/property-editors/editorContract";
import { useDomainEditorData } from "./domainEditorData";
import { ImagePickerPopup } from "./ImagePickerPopup";

export const ImagePropEditor = ({
  id,
  value,
  mixed,
  disabled,
  onCommit,
}: PropertyEditorProps): ReactElement => {
  const data = useDomainEditorData();
  const [picking, setPicking] = useState(false);
  const imageId = typeof value === "string" && value !== "" ? value : undefined;
  const name =
    imageId === undefined
      ? undefined
      : (data.images.find((candidate) => candidate.id === imageId)?.name ?? findBuiltInImage(imageId)?.name);
  return (
    <div data-image-editor="">
      {imageId === undefined ? (
        <span data-image-editor-none="">{mixed ? "Mixed" : "No texture"}</span>
      ) : (
        <span data-image-editor-current="">
          <img src={data.thumbnailUrl(imageId)} alt="" data-image-editor-thumb="" />
          <span>{name ?? "Missing image"}</span>
        </span>
      )}
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled}
        onPress={() => {
          setPicking(true);
        }}
      >
        <span id={id}>{imageId === undefined ? "Choose…" : "Change…"}</span>
      </Button>
      <ImagePickerPopup
        open={picking}
        selectedId={imageId}
        onClose={() => {
          setPicking(false);
        }}
        onPick={(next) => {
          setPicking(false);
          onCommit(next ?? "");
        }}
      />
    </div>
  );
};
