import { useState } from "react";
import type { ReactElement } from "react";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { findBuiltInImage } from "@shared/domain/house/builtinMaterials";
import { libraryCategories, materialKey, searchLibrary } from "@shared/domain/materials/materialLibrary";
import type { LibraryMaterial } from "@shared/domain/materials/materialLibrary";
import { proportionalTileSize } from "@shared/domain/materials/textureHints";
import { newMaterialFromImageForm, savePresetForm } from "@shared/domain/schemas/forms/materialForms";
import { MaterialView, toMaterialView } from "@shared/domain/materials/materialView";
import type { LengthUnit } from "@shared/domain/schemas/house";
import type { SurfaceMaterialValue } from "@shared/domain/schemas/values";
import { Button } from "../../../design-system/components/Button/Button";
import { Icon } from "../../../design-system/components/Icon/Icon";
import { Input } from "../../../design-system/components/Input/Input";
import { Popup } from "../../../design-system/components/Popup/Popup";
import { FormPopup } from "../../../design-system/forms/FormPopup/FormPopup";
import { FormSubmitError } from "../../../design-system/forms/formErrors";
import { SchemaForm } from "../../../design-system/forms/SchemaForm/SchemaForm";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { submitWithFormErrors } from "../../forms/toFormSubmitError";
import { useDomainEditorData } from "./domainEditorData";
import { ImagePropEditor } from "./ImagePropEditor";
import { materialAfterCommit } from "./materialViewCommit";
import { MaterialSwatch } from "./MaterialSwatch";
import { SavePresetPopup } from "./SavePresetPopup";

type MaterialPickerPopupProps = Readonly<{
  open: boolean;
  title: string;
  /** The selected element's material now (undefined: a mixed selection), shown in the footer with Save as preset. */
  current: SurfaceMaterialValue | undefined;
  projectUnit: LengthUnit;
  onApply: (material: SurfaceMaterialValue) => void;
  onClose: () => void;
}>;

/** A tile stands for 1.5 m of surface, the preview for 3 m, so textures repeat at their real tile size. */
const tileSpanMm = 1500;
const previewSpanMm = 3000;

const sourceLabel = (item: LibraryMaterial): string =>
  item.source === "used"
    ? `${String(item.surfaces ?? 0)} surface${item.surfaces === 1 ? "" : "s"}`
    : item.source === "house"
      ? "House preset"
      : "Built-in";

/**
 * The material chooser (owner, 2026-11-20; replaces the Presets menu): search, category chips (Used in this house,
 * House presets, then the built-in categories), a grid of swatches grouped by category, and a preview of the
 * selected material in an editor (the material form) on a working copy beside the original: Save writes the copy
 * back (a house preset, or every surface using a material of Used in this house), Revert returns to the original;
 * built-ins are read-only. Apply (or a double click on a tile) copies the selected material, as edited, onto the
 * surface; house presets can be renamed or deleted here. The footer shows the selected element's own material with Save as
 * preset (owner: "current" was unclear); Create material
 * from image uploads an image with its proposed values (repeat size, Shininess, metallic), saves it as a house
 * preset and applies it.
 */
export const MaterialPickerPopup = ({
  open,
  title,
  current,
  projectUnit,
  onApply,
  onClose,
}: MaterialPickerPopupProps): ReactElement => {
  const data = useDomainEditorData();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState<SurfaceMaterialValue | undefined>(undefined);
  const [renaming, setRenaming] = useState<LibraryMaterial | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  /** The selected material as edited in the preview (undefined: unchanged). */
  const [draft, setDraft] = useState<SurfaceMaterialValue | undefined>(undefined);
  const library = open ? data.materialLibrary() : [];
  const matching = searchLibrary(library, query, null);
  const filtered = searchLibrary(library, query, category);
  const present = libraryCategories.filter((name) => library.some((item) => item.category === name));
  const groups = present
    .map((name) => ({ category: name, items: filtered.filter((item) => item.category === name) }))
    .filter((group) => group.items.length > 0);
  // Before a choice, the surface's own material is selected (else the first tile).
  const currentKey = current === undefined ? undefined : materialKey(current);
  const selected =
    filtered.find((item) => item.key === selectedKey) ??
    (selectedKey === null ? filtered.find((item) => materialKey(item.material) === currentKey) : undefined) ??
    filtered[0];
  const edited = draft ?? selected?.material;
  // Built-in materials are shown, not edited (owner, 2026-11-20); house presets and used materials are edited on a
  // working copy (`draft`) beside the original (`selected.material`): Save writes it back, Revert drops it.
  const readOnly = selected?.source === "builtin";
  const currentName =
    currentKey === undefined
      ? undefined
      : (library.find((item) => item.source === "used" && materialKey(item.material) === currentKey)?.name ??
        "Custom");
  const select = (key: string | null): void => {
    setSelectedKey(key);
    setDraft(undefined);
  };
  const textureName = (material: SurfaceMaterialValue): string => {
    const imageId = material.pbrMetallicRoughness.baseColorTexture?.imageId;
    if (imageId === undefined) return "None (flat colour)";
    return (
      findBuiltInImage(imageId)?.name ??
      data.images.find((image) => image.id === imageId)?.name ??
      "House image"
    );
  };
  const close = (): void => {
    setQuery("");
    setCategory(null);
    setSelectedKey(null);
    setDraft(undefined);
    onClose();
  };
  const apply = (material: SurfaceMaterialValue): void => {
    onApply(structuredClone(material));
    close();
  };
  return (
    <>
      <Popup
        open={open && saving === undefined && renaming === undefined && !creating}
        title={title}
        size="xl"
        onClose={close}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={current === undefined}
              aria-label={
                current === undefined
                  ? "Save as preset (the selection has mixed materials)"
                  : `Save as preset: this surface's material, ${currentName ?? "Custom"}`
              }
              onPress={() => {
                setSaving(current);
              }}
            >
              <span data-material-picker-surface="">
                {current === undefined ? null : (
                  <MaterialSwatch material={current} spanMm={tileSpanMm} size="tile" />
                )}
                Save as preset
              </span>
            </Button>
            <Button
              variant="ghost"
              onPress={() => {
                setCreating(true);
              }}
            >
              Create material
            </Button>
            <span data-material-picker-spacer="" />
            <Button variant="secondary" onPress={close}>
              Cancel
            </Button>
            <Button
              disabled={edited === undefined}
              onPress={() => {
                if (edited !== undefined) apply(edited);
              }}
            >
              Apply
            </Button>
          </>
        }
      >
        <div data-template-picker-bar="">
          <Input
            type="search"
            value={query}
            onChange={setQuery}
            autoFocus
            placeholder="Search materials"
            aria-label="Search materials"
            start={<Icon name="search" />}
            onKeyDown={(event) => {
              if (event.key === "Enter" && edited !== undefined) {
                event.preventDefault();
                apply(edited);
              }
            }}
          />
          <span data-template-picker-count="">
            {filtered.length === library.length
              ? `${String(library.length)} materials`
              : `${String(filtered.length)} of ${String(library.length)}`}
          </span>
        </div>
        <ToggleButtonGroup
          aria-label="Category"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[category ?? ""]}
          onSelectionChange={(keys) => {
            const [key] = [...keys];
            if (typeof key === "string") setCategory(key === "" ? null : key);
          }}
          data-template-picker-categories=""
        >
          <ToggleButton id="" data-template-picker-category="">
            All <span data-template-picker-category-count="">{matching.length}</span>
          </ToggleButton>
          {present.map((name) => (
            <ToggleButton key={name} id={name} data-template-picker-category="">
              {name}{" "}
              <span data-template-picker-category-count="">
                {matching.filter((item) => item.category === name).length}
              </span>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <div data-material-picker-body="">
          <div data-material-picker-groups="">
            {groups.length === 0 ? (
              <p data-image-picker-empty="">No matching materials.</p>
            ) : (
              groups.map((group) => (
                <section key={group.category} data-template-picker-group="">
                  <h3 data-template-picker-group-title="">{group.category}</h3>
                  <div data-image-picker-grid="" role="listbox" aria-label={group.category}>
                    {group.items.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        role="option"
                        aria-selected={item.key === selected?.key}
                        data-image-picker-item=""
                        onClick={() => {
                          if (item.key !== selected?.key) select(item.key);
                        }}
                        onDoubleClick={() => {
                          apply(item.material);
                        }}
                      >
                        <MaterialSwatch material={item.material} spanMm={tileSpanMm} size="tile" />
                        <span data-image-picker-name="">{item.name}</span>
                        <span data-template-meta="">{sourceLabel(item)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
          {selected === undefined || edited === undefined ? null : (
            <aside data-material-picker-preview="" aria-label="Selected material">
              <MaterialSwatch material={edited} spanMm={previewSpanMm} size="preview" />
              <h3 data-material-picker-preview-name="">
                {selected.name}
                {draft === undefined ? null : <span data-material-picker-edited=""> · edited</span>}
              </h3>
              <p data-material-picker-preview-meta="">
                {selected.category} · {sourceLabel(selected)} · {textureName(edited)}
              </p>
              <SchemaForm
                schema={MaterialView}
                value={toMaterialView(edited)}
                registry={{ ...genericEditors, image: ImagePropEditor }}
                projectUnit={projectUnit}
                mode="live"
                disabled={readOnly}
                onCommit={(path, next) => {
                  const updated = materialAfterCommit(edited, path, next, data.images);
                  if (updated === undefined) return false;
                  setDraft(updated);
                  return true;
                }}
              />
              {readOnly ? (
                <p data-material-picker-preview-meta="">
                  A built-in material cannot be changed. Apply it, then adjust it on the surface (or save that
                  as a preset).
                </p>
              ) : (
                <div data-material-picker-actions="">
                  <Button
                    size="sm"
                    disabled={draft === undefined}
                    onPress={() => {
                      if (draft === undefined) return;
                      if (selected.source === "used") {
                        if (data.replaceMaterial(selected.material, draft))
                          select(`used:${materialKey(draft)}`);
                      } else if (
                        selected.presetId !== undefined &&
                        data.updatePreset(selected.presetId, draft)
                      )
                        setDraft(undefined);
                    }}
                  >
                    {selected.source === "used"
                      ? `Save to ${String(selected.surfaces ?? 0)} surface${selected.surfaces === 1 ? "" : "s"}`
                      : "Save preset"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={draft === undefined}
                    onPress={() => {
                      setDraft(undefined);
                    }}
                  >
                    Revert
                  </Button>
                  {selected.source === "house" && selected.presetId !== undefined ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => {
                          setRenaming(selected);
                        }}
                      >
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => {
                          if (selected.presetId !== undefined) data.deletePreset(selected.presetId);
                          select(null);
                        }}
                      >
                        Delete
                      </Button>
                    </>
                  ) : null}
                </div>
              )}
            </aside>
          )}
        </div>
      </Popup>
      {creating ? (
        <FormPopup
          open
          schema={newMaterialFromImageForm}
          values={{ repeatWidthMm: 1000, roughness: 0.7, metallic: 0 }}
          onCancel={() => {
            setCreating(false);
          }}
          onSubmit={async (values) => {
            const material = await submitWithFormErrors(async () => {
              const image = await data.uploadImage(values.file, values.name);
              const texture = {
                tileSizeMm: proportionalTileSize(values.repeatWidthMm, image),
                roughness: values.roughness,
                metallic: values.metallic,
              };
              await data.setImageTexture(image.id, texture);
              const created: SurfaceMaterialValue = {
                pbrMetallicRoughness: {
                  baseColorTexture: { imageId: image.id },
                  baseColorFactor: [1, 1, 1, 1],
                  roughnessFactor: texture.roughness,
                  metallicFactor: texture.metallic,
                },
                extras: {
                  homeplan: { tileSizeMm: texture.tileSizeMm, rotationDeg: 0, offsetMm: { x: 0, y: 0 } },
                },
              };
              return created;
            });
            if (!data.savePreset(values.name, material))
              throw new FormSubmitError("The image was uploaded, but the preset could not be saved.");
            setCreating(false);
            onApply(material);
            close();
          }}
        />
      ) : null}
      <SavePresetPopup
        material={saving}
        onClose={() => {
          setSaving(undefined);
        }}
      />
      {renaming === undefined ? null : (
        <FormPopup
          open
          schema={{
            ...savePresetForm,
            "x-homeplan": { title: "Rename preset", submitLabel: "Rename", size: "sm" },
          }}
          values={{ name: renaming.name }}
          onCancel={() => {
            setRenaming(undefined);
          }}
          onSubmit={async (values) => {
            await Promise.resolve();
            if (renaming.presetId === undefined || !data.renamePreset(renaming.presetId, values.name))
              throw new FormSubmitError("The preset could not be renamed.");
            setRenaming(undefined);
          }}
        />
      )}
    </>
  );
};
