import { useState } from "react";
import type { ReactElement } from "react";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { findBuiltInImage, isBuiltInImageId } from "@shared/domain/house/builtinMaterials";
import {
  libraryCategories,
  materialHex,
  materialKey,
  searchLibrary,
} from "@shared/domain/materials/materialLibrary";
import type { LibraryMaterial } from "@shared/domain/materials/materialLibrary";
import { createMaterialForm, savePresetForm } from "@shared/domain/schemas/forms/materialForms";
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

/** A new material (Create material): plain white, no texture, a 1 m tile for a texture chosen later. */
const plainWhite = (): SurfaceMaterialValue => ({
  pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], roughnessFactor: 0.7, metallicFactor: 0 },
  extras: { homeplan: { tileSizeMm: { x: 1000, y: 1000 }, rotationDeg: 0, offsetMm: { x: 0, y: 0 } } },
});

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
 * a built-in shows its values instead of a form (it can be applied, not changed). Apply (or a double click on a tile) copies the selected material, as edited, onto the
 * surface; a house preset's name is a field above its form (saved with Save), and it can be deleted here. The footer shows the selected element's own material with Save as
 * preset (owner: "current" was unclear); Create material asks for a name and selects a new plain white house
 * preset to set up in the editor.
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
  const [creating, setCreating] = useState(false);
  /** The selected material as edited in the preview (undefined: unchanged). */
  const [draft, setDraft] = useState<SurfaceMaterialValue | undefined>(undefined);
  /** A house preset's name as edited above its form (undefined: unchanged); saved with Save (owner). */
  const [draftName, setDraftName] = useState<string | undefined>(undefined);
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
  // Unsaved changes block Apply (owner): save them or revert first.
  const unsaved = draft !== undefined || draftName !== undefined;
  const currentName =
    currentKey === undefined
      ? undefined
      : (library.find((item) => item.source === "used" && materialKey(item.material) === currentKey)?.name ??
        "Custom");
  const select = (key: string | null): void => {
    setSelectedKey(key);
    setDraft(undefined);
    setDraftName(undefined);
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
  /**
   * A saved house preset whose texture is an uploaded image without proposed values gives the image its tile size,
   * Shininess and metallic, so choosing that texture again proposes them (owner, 2026-11-20).
   */
  const proposeFromPreset = (material: SurfaceMaterialValue): void => {
    const imageId = material.pbrMetallicRoughness.baseColorTexture?.imageId;
    const placement = material.extras?.homeplan;
    if (imageId === undefined || placement === undefined || isBuiltInImageId(imageId)) return;
    if (data.images.find((image) => image.id === imageId)?.texture !== undefined) return;
    data
      .setImageTexture(imageId, {
        tileSizeMm: placement.tileSizeMm,
        roughness: material.pbrMetallicRoughness.roughnessFactor,
        metallic: material.pbrMetallicRoughness.metallicFactor,
      })
      .catch((error: unknown) => {
        console.warn("[homeplan] the image's proposed values were not saved", error);
      });
  };
  const close = (): void => {
    setQuery("");
    setCategory(null);
    setSelectedKey(null);
    setDraft(undefined);
    setDraftName(undefined);
    onClose();
  };
  const apply = (material: SurfaceMaterialValue): void => {
    onApply(structuredClone(material));
    close();
  };
  return (
    <>
      <Popup
        open={open && saving === undefined && !creating}
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
              disabled={edited === undefined || unsaved}
              aria-label={unsaved ? "Apply (save or revert your changes first)" : undefined}
              onPress={() => {
                if (edited !== undefined && !unsaved) apply(edited);
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
              if (event.key === "Enter" && edited !== undefined && !unsaved) {
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
                        disabled={unsaved && item.key !== selected?.key}
                        onClick={() => {
                          if (item.key !== selected?.key) select(item.key);
                        }}
                        onDoubleClick={() => {
                          if (!unsaved) apply(item.material);
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
                {draftName ?? selected.name}
                {unsaved ? <span data-material-picker-edited=""> · edited</span> : null}
              </h3>
              <p data-material-picker-preview-meta="">
                {selected.category} · {sourceLabel(selected)} · {textureName(edited)}
              </p>
              {readOnly ? (
                // A built-in material shows its values, not a form (owner): it can be applied, not changed.
                <dl data-material-picker-details="">
                  <dt>Texture</dt>
                  <dd>{textureName(edited)}</dd>
                  <dt>Colour / tint</dt>
                  <dd>{materialHex(edited)}</dd>
                  {edited.pbrMetallicRoughness.baseColorTexture === undefined ||
                  edited.extras === undefined ? null : (
                    <>
                      <dt>Tile size</dt>
                      <dd>
                        {String(Math.round(edited.extras.homeplan.tileSizeMm.x))} ×{" "}
                        {String(Math.round(edited.extras.homeplan.tileSizeMm.y))} mm
                      </dd>
                      <dt>Rotation</dt>
                      <dd>{String(Math.round(edited.extras.homeplan.rotationDeg))}°</dd>
                    </>
                  )}
                  <dt>Shininess</dt>
                  <dd>{String(Math.round((1 - edited.pbrMetallicRoughness.roughnessFactor) * 100))} %</dd>
                  <dt>Metallic</dt>
                  <dd>{String(Math.round(edited.pbrMetallicRoughness.metallicFactor * 100))} %</dd>
                </dl>
              ) : (
                <>
                  {selected.source === "house" ? (
                    <SchemaForm
                      schema={savePresetForm}
                      value={{ name: draftName ?? selected.name }}
                      registry={genericEditors}
                      projectUnit={projectUnit}
                      mode="live"
                      onCommit={(path, next) => {
                        if (path[0] !== "name" || typeof next !== "string" || next.trim() === "")
                          return false;
                        setDraftName(next.trim() === selected.name ? undefined : next.trim());
                        return true;
                      }}
                    />
                  ) : null}
                  <SchemaForm
                    schema={MaterialView}
                    value={toMaterialView(edited)}
                    registry={{ ...genericEditors, image: ImagePropEditor }}
                    projectUnit={projectUnit}
                    mode="live"
                    onCommit={(path, next) => {
                      const updated = materialAfterCommit(edited, path, next, data.images);
                      if (updated === undefined) return false;
                      setDraft(updated);
                      return true;
                    }}
                  />
                  <div data-material-picker-actions="">
                    <Button
                      size="sm"
                      disabled={!unsaved}
                      onPress={() => {
                        if (selected.source === "used") {
                          if (draft !== undefined && data.replaceMaterial(selected.material, draft))
                            select(`used:${materialKey(draft)}`);
                          return;
                        }
                        const presetId = selected.presetId;
                        if (presetId === undefined) return;
                        if (draftName !== undefined && !data.renamePreset(presetId, draftName)) return;
                        setDraftName(undefined);
                        if (draft !== undefined && data.updatePreset(presetId, draft)) {
                          proposeFromPreset(draft);
                          setDraft(undefined);
                        }
                      }}
                    >
                      {selected.source === "used"
                        ? `Save to ${String(selected.surfaces ?? 0)} surface${selected.surfaces === 1 ? "" : "s"}`
                        : "Save preset"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!unsaved}
                      onPress={() => {
                        setDraft(undefined);
                        setDraftName(undefined);
                      }}
                    >
                      Revert
                    </Button>
                    {unsaved ? (
                      <p data-material-picker-unsaved="">
                        Save or revert your changes to apply a material or choose another.
                      </p>
                    ) : null}
                    {selected.source === "house" && selected.presetId !== undefined ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onPress={() => {
                          if (selected.presetId !== undefined) data.deletePreset(selected.presetId);
                          select(null);
                        }}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </aside>
          )}
        </div>
      </Popup>
      {creating ? (
        <FormPopup
          open
          schema={createMaterialForm}
          values={{}}
          onCancel={() => {
            setCreating(false);
          }}
          onSubmit={async (values) => {
            await Promise.resolve();
            const presetId = data.createPreset(values.name, plainWhite());
            if (presetId === undefined) throw new FormSubmitError("The material could not be created.");
            setCreating(false);
            // The new material is selected in the editor (owner), where its texture and values are set.
            setQuery("");
            setCategory(null);
            select(`preset:${presetId}`);
          }}
        />
      ) : null}
      <SavePresetPopup
        material={saving}
        onClose={() => {
          setSaving(undefined);
        }}
      />
    </>
  );
};
