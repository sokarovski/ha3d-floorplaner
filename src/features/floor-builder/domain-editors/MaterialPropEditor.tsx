import { useState } from "react";
import type { ReactElement } from "react";
import { fromMaterialView, MaterialView, toMaterialView } from "@shared/domain/materials/materialView";
import { isSchemaNode, withValueAtPath } from "@shared/domain/schemas/schemaWalk";
import { SurfaceMaterialSchema } from "@shared/domain/schemas/values";
import { compileValidator } from "@shared/domain/validation/ajv";
import { Button } from "../../../design-system/components/Button/Button";
import { SchemaForm } from "../../../design-system/forms/SchemaForm/SchemaForm";
import type { PropertyEditorProps } from "../../../design-system/property-editors/editorContract";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { ImagePropEditor } from "./ImagePropEditor";
import { MaterialPickerPopup } from "./MaterialPickerPopup";

export const MaterialPropEditor = ({
  id,
  label,
  value,
  projectUnit,
  mixed,
  disabled,
  onCommit,
}: PropertyEditorProps): ReactElement => {
  const [choosing, setChoosing] = useState(false);
  const isMaterial = compileValidator(SurfaceMaterialSchema);
  const material = isMaterial(value) ? value : undefined;
  const view = material === undefined ? undefined : toMaterialView(material);
  return (
    <div data-material-editor="" id={id}>
      <div data-material-editor-header="">
        <span data-material-editor-swatch="" data-material-editor-mixed={mixed ? "" : undefined}>
          {mixed
            ? "Mixed"
            : material?.pbrMetallicRoughness.baseColorTexture === undefined
              ? "Flat color"
              : "Textured"}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          aria-label={`${label}: more materials`}
          onPress={() => {
            setChoosing(true);
          }}
        >
          More…
        </Button>
      </div>
      {view === undefined || material === undefined ? null : (
        <SchemaForm
          schema={MaterialView}
          value={view}
          registry={{ ...genericEditors, image: ImagePropEditor }}
          projectUnit={projectUnit}
          mode="live"
          disabled={disabled}
          mixedPointers={
            mixed
              ? new Set([
                  "/image",
                  "/tint",
                  "/roughness",
                  "/metallic",
                  "/tileSizeMm",
                  "/rotationDeg",
                  "/offsetMm",
                ])
              : undefined
          }
          onCommit={(path, next) => {
            const updated = withValueAtPath(view, path, next);
            const isView = compileValidator(MaterialView);
            return isSchemaNode(updated) && isView(updated)
              ? onCommit(fromMaterialView(updated, material))
              : false;
          }}
        />
      )}
      <MaterialPickerPopup
        open={choosing}
        title={`Choose a material · ${label}`}
        current={mixed ? undefined : material}
        onApply={(next) => {
          onCommit(next);
        }}
        onClose={() => {
          setChoosing(false);
        }}
      />
    </div>
  );
};
