// Material presets (D19): Save as preset stores a named copy; applying copies values; delete never changes surfaces.
import { createId } from "../ids";
import type { SurfaceMaterialValue } from "../schemas/values";
import { defineCommand } from "./command";
import type { Command } from "./command";

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

export const deletePresetCommand = (presetId: string): Command =>
  defineCommand("Delete preset", undefined, (draft) => {
    const index = draft.materialPresets.findIndex((candidate) => candidate.id === presetId);
    if (index < 0) return "The preset no longer exists.";
    draft.materialPresets.splice(index, 1);
    return undefined;
  });
