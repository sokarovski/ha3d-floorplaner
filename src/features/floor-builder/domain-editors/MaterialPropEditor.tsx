import { useState } from "react";
import type { ReactElement } from "react";
import { fromMaterialView, MaterialView, toMaterialView } from "@shared/domain/materials/materialView";
import { isSchemaNode, withValueAtPath } from "@shared/domain/schemas/schemaWalk";
import { SurfaceMaterialSchema } from "@shared/domain/schemas/values";
import type { SurfaceMaterialValue } from "@shared/domain/schemas/values";
import { compileValidator } from "@shared/domain/validation/ajv";
import { MenuButton } from "../../../design-system/components/MenuButton/MenuButton";
import { SchemaForm } from "../../../design-system/forms/SchemaForm/SchemaForm";
import type { PropertyEditorProps } from "../../../design-system/property-editors/editorContract";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { useDomainEditorData } from "./domainEditorData";
import { ImagePropEditor } from "./ImagePropEditor";
import { SavePresetPopup } from "./SavePresetPopup";

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
  const [savingPreset, setSavingPreset] = useState<SurfaceMaterialValue | undefined>(undefined);
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
        <MenuButton
          label={`${label} presets`}
          text="Presets"
          size="sm"
          variant="secondary"
          disabled={disabled}
          placement="bottom end"
          items={[
            ...data.presets.map((preset) => ({
              id: `apply:${preset.id}`,
              label: preset.builtIn ? `${preset.name} (built-in)` : preset.name,
            })),
            { id: "save", label: "Save as preset…", icon: "save", disabled: material === undefined || mixed },
          ]}
          onAction={(action) => {
            if (action === "save") setSavingPreset(material);
            const preset = data.presets.find((candidate) => `apply:${candidate.id}` === action);
            if (preset !== undefined) onCommit(structuredClone(preset.material));
          }}
        />
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
      <SavePresetPopup
        material={savingPreset}
        onClose={() => {
          setSavingPreset(undefined);
        }}
      />
    </div>
  );
};
