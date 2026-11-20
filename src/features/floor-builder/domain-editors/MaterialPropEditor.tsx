import { useState } from "react";
import type { ReactElement } from "react";
import { fromMaterialView, MaterialView, toMaterialView } from "@shared/domain/materials/materialView";
import { textureHintsFor } from "@shared/domain/materials/textureHints";
import { isSchemaNode, withValueAtPath } from "@shared/domain/schemas/schemaWalk";
import { SurfaceMaterialSchema } from "@shared/domain/schemas/values";
import { compileValidator } from "@shared/domain/validation/ajv";
import { Button } from "../../../design-system/components/Button/Button";
import { SchemaForm } from "../../../design-system/forms/SchemaForm/SchemaForm";
import type { PropertyEditorProps } from "../../../design-system/property-editors/editorContract";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { ImagePropEditor } from "./ImagePropEditor";
import { useDomainEditorData } from "./domainEditorData";
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
  const data = useDomainEditorData();
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
            const changed = withValueAtPath(view, path, next);
            // A newly chosen texture brings its proposed tile size, Shininess and metallic (owner, 2026-11-20).
            const hints =
              path.length === 1 && path[0] === "image" && typeof next === "string" && next !== view.image
                ? textureHintsFor(next, data.images)
                : undefined;
            const updated =
              hints === undefined || !isSchemaNode(changed)
                ? changed
                : {
                    ...changed,
                    tileSizeMm: hints.tileSizeMm,
                    roughness: hints.roughness,
                    metallic: hints.metallic,
                    // A flat colour would tint the new texture: it starts untinted.
                    ...(view.image === undefined ? { tint: [255, 255, 255] } : {}),
                  };
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
