// Material presets (D19): Save as preset stores a named copy; applying copies values; delete never changes surfaces.
import { createId } from "../ids";
import { materialKey } from "../materials/materialLibrary";
import { SurfaceMaterialSchema } from "../schemas/values";
import type { SurfaceMaterialValue } from "../schemas/values";
import { compileValidator } from "../validation/ajv";
import { defineCommand } from "./command";
import type { Command } from "./command";

const isMaterial = compileValidator(SurfaceMaterialSchema);

export const savePresetCommand = (
  name: string,
  material: SurfaceMaterialValue,
): Readonly<{ command: Command; presetId: string }> => {
  const presetId = createId("mp");
  return {
    presetId,
    command: defineCommand(`Save preset ${name}`, undefined, (draft) => {
      draft.materialPresets.push({
        id: presetId,
        name: name.normalize("NFC").trim(),
        material: structuredClone(material),
      });
      return undefined;
    }),
  };
};

export const renamePresetCommand = (presetId: string, name: string): Command =>
  defineCommand("Rename preset", undefined, (draft) => {
    const preset = draft.materialPresets.find((candidate) => candidate.id === presetId);
    if (preset === undefined) return "The preset no longer exists.";
    preset.name = name.normalize("NFC").trim();
    return undefined;
  });

/** Replaces a house preset's material (the material chooser's Save to preset); surfaces keep their copies. */
export const updatePresetMaterialCommand = (presetId: string, material: SurfaceMaterialValue): Command =>
  defineCommand("Update preset", undefined, (draft) => {
    const preset = draft.materialPresets.find((candidate) => candidate.id === presetId);
    if (preset === undefined) return "The preset no longer exists.";
    preset.material = structuredClone(material);
    return undefined;
  });

export const deletePresetCommand = (presetId: string): Command =>
  defineCommand("Delete preset", undefined, (draft) => {
    const index = draft.materialPresets.findIndex((candidate) => candidate.id === presetId);
    if (index < 0) return "The preset no longer exists.";
    draft.materialPresets.splice(index, 1);
    return undefined;
  });

/**
 * Changes a material wherever the house uses it (the material chooser's Save on a material of Used in this house,
 * owner 2026-11-20): every surface whose material equals `previous` gets `next`; presets are not touched. One
 * command, so one Undo restores every surface.
 */
export const replaceMaterialCommand = (previous: SurfaceMaterialValue, next: SurfaceMaterialValue): Command =>
  defineCommand("Change material", undefined, (draft) => {
    const key = materialKey(previous);
    let changed = 0;
    const visit = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return;
      const entries: [string | number, unknown][] = Array.isArray(value)
        ? value.map((item, index): [number, unknown] => [index, item])
        : Object.entries(value);
      for (const [name, item] of entries) {
        if (isMaterial(item) && materialKey(item) === key) {
          Reflect.set(value, name, structuredClone(next));
          changed += 1;
        } else visit(item);
      }
    };
    for (const [name, value] of Object.entries(draft)) if (name !== "materialPresets") visit(value);
    return changed === 0 ? "No surface uses that material any more." : undefined;
  });
