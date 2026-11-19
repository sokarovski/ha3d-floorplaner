import { useState } from "react";
import type { ReactElement } from "react";
import {
  fromMaterialView,
  MaterialColorView,
  MaterialView,
  toMaterialView,
} from "@shared/domain/materials/materialView";
import type { MaterialViewValue } from "@shared/domain/materials/materialView";
import { isSchemaNode, withValueAtPath } from "@shared/domain/schemas/schemaWalk";
import { MaterialPresetChoice, SurfaceMaterialSchema } from "@shared/domain/schemas/values";
import type { SurfaceMaterialValue } from "@shared/domain/schemas/values";
import { compileValidator } from "@shared/domain/validation/ajv";
import { SwatchPicker } from "../../../design-system/components/SwatchPicker/SwatchPicker";
import type { SwatchOption } from "../../../design-system/components/SwatchPicker/SwatchPicker";
import { SchemaForm } from "../../../design-system/forms/SchemaForm/SchemaForm";
import type { PropertyEditorProps } from "../../../design-system/property-editors/editorContract";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { ImagePropEditor } from "./ImagePropEditor";

const isSurfaceMaterial = compileValidator(SurfaceMaterialSchema);
const isPresetChoice = compileValidator(MaterialPresetChoice);
const isView = compileValidator(MaterialView);

/** Option IDs: a bundled finish, an own colour, or an own texture. */
const presetId = (name: string): string => `preset:${name}`;
const colorId = "color";
const textureId = "texture";

/** Base factors of a new own material (opaque white, matte); the view then sets its tint. */
const baseFactors: SurfaceMaterialValue["pbrMetallicRoughness"] = {
  baseColorFactor: [1, 1, 1, 1],
  roughnessFactor: 0.6,
  metallicFactor: 0,
};

const rgb = (color: readonly number[] | undefined): readonly [number, number, number] => [
  color?.[0] ?? 200,
  color?.[1] ?? 200,
  color?.[2] ?? 200,
];

/**
 * A template material slot offered for choice (Phase 9.1, spec/builder/features/object-templates.md#material-
 * choices): the slot's own material and its presets as swatches, then an own colour and an own texture when the
 * template allows them. The slot's own material removes the override; a preset stores `{ preset }`; an own colour
 * or texture stores a surface material (D19) edited by the material fields below the swatches.
 */
export const MaterialChoicePropEditor = ({
  id,
  label,
  value,
  annotation,
  projectUnit,
  mixed,
  disabled,
  describedBy,
  onCommit,
}: PropertyEditorProps): ReactElement | null => {
  // Texture chosen but no image picked yet: the texture fields show until an image is committed.
  const [pendingTexture, setPendingTexture] = useState(false);
  const choice = annotation.materialChoice;
  if (choice === undefined) return null;
  const own = isSurfaceMaterial(value) ? value : undefined;
  const textured = own?.pbrMetallicRoughness.baseColorTexture !== undefined || pendingTexture;
  const selected = mixed
    ? null
    : own !== undefined
      ? textured && choice.allowTexture
        ? textureId
        : colorId
      : isPresetChoice(value) && choice.presets.some((preset) => preset.name === value.preset)
        ? presetId(value.preset)
        : presetId(choice.material);
  const current = choice.presets.find((preset) => selected === presetId(preset.name)) ?? choice.presets[0];
  const options: SwatchOption[] = [
    ...choice.presets.map((preset) => ({
      id: presetId(preset.name),
      label: preset.name,
      color: rgb(preset.color),
      textured: preset.textured,
    })),
    ...(choice.allowColor || own !== undefined ? [{ id: colorId, label: "Own colour", color: null }] : []),
    ...(choice.allowTexture ? [{ id: textureId, label: "Own texture", color: null }] : []),
  ];
  /** A plain material in the current finish's colour, as the start of an own colour or texture. */
  const startView = (): MaterialViewValue => ({
    tint: [...rgb(current?.color)],
    roughness: 0.6,
    metallic: 0,
    tileSizeMm: { x: 1000, y: 1000 },
    rotationDeg: 0,
    offsetMm: { x: 0, y: 0 },
  });
  const plain = (material: SurfaceMaterialValue): SurfaceMaterialValue => {
    const { image: _image, ...view } = toMaterialView(material);
    return fromMaterialView(view, material);
  };
  const choose = (next: string): void => {
    if (next === textureId) {
      setPendingTexture(true);
      if (own === undefined) onCommit(fromMaterialView(startView(), { pbrMetallicRoughness: baseFactors }));
      return;
    }
    setPendingTexture(false);
    if (next === colorId) {
      onCommit(
        own === undefined ? fromMaterialView(startView(), { pbrMetallicRoughness: baseFactors }) : plain(own),
      );
      return;
    }
    const name = next.slice("preset:".length);
    onCommit(name === choice.material ? undefined : { preset: name });
  };
  const view = own === undefined ? undefined : toMaterialView(own);
  return (
    <div data-material-editor="" data-material-choice="" id={id}>
      <SwatchPicker
        label={label}
        describedBy={describedBy}
        options={options}
        value={selected}
        disabled={disabled}
        onChange={choose}
      />
      {view === undefined || own === undefined ? null : (
        <SchemaForm
          schema={selected === textureId ? MaterialView : MaterialColorView}
          value={view}
          registry={{ ...genericEditors, image: ImagePropEditor }}
          projectUnit={projectUnit}
          mode="live"
          disabled={disabled}
          onCommit={(path, next) => {
            const updated = withValueAtPath(view, path, next);
            if (!isSchemaNode(updated) || !isView(updated)) return false;
            const committed = onCommit(fromMaterialView(updated, own));
            if (committed && updated.image !== undefined && updated.image !== "") setPendingTexture(false);
            return committed;
          }}
        />
      )}
    </div>
  );
};
