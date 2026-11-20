// Builds the domain-editor data for the Floor Builder from the session and the house libraries.
import { useMemo } from "react";
import {
  deletePresetCommand,
  renamePresetCommand,
  savePresetCommand,
} from "@shared/domain/commands/presetCommands";
import { materialLibrary } from "@shared/domain/materials/materialLibrary";
import { builtInPresets } from "@shared/domain/house/defaults";
import { useAppServices } from "../../../app/appServicesContext";
import type { DomainEditorData } from "../domain-editors/domainEditorData";
import { referenceOptionsFor } from "../services/referenceOptions";
import { updateTemplateVersionFor } from "../services/templateVersions";
import type { HouseLibraries } from "./useHouseLibraries";
import { useHouse, useSession } from "./sessionContext";

export const useDomainEditorValue = (libraries: HouseLibraries): DomainEditorData => {
  const session = useSession();
  const services = useAppServices();
  const presets = useHouse((house) => house.materialPresets);
  return useMemo(() => {
    const allPresets = [
      ...builtInPresets.map((preset) => ({ ...preset, builtIn: true })),
      ...presets.map((preset) => ({ ...preset, builtIn: false })),
    ];
    return {
      houseId: session.houseId,
      images: libraries.images,
      imageUrl: (imageId: string) => services.images.fileUrl(session.houseId, imageId),
      thumbnailUrl: (imageId: string) => services.images.thumbnailUrl(session.houseId, imageId),
      uploadImage: async (file: File, name?: string) => {
        const image = await services.images.upload(session.houseId, file, name);
        libraries.reloadImages();
        return image;
      },
      reloadImages: libraries.reloadImages,
      presets: allPresets,
      savePreset: (name, material) => session.execute(savePresetCommand(name, material).command).ok,
      renamePreset: (presetId, name) => session.execute(renamePresetCommand(presetId, name)).ok,
      deletePreset: (presetId) => session.execute(deletePresetCommand(presetId)).ok,
      materialLibrary: () => materialLibrary(session.documents.getState().document, allPresets),
      referenceOptions: (kind: string) => {
        const state = session.ui.getState();
        return referenceOptionsFor(
          session.documents.getState().document,
          state.activeFloorId,
          state.selection,
          kind,
        );
      },
      templates: libraries.templates,
      updateTemplateVersion: (owner: unknown, version: number) =>
        updateTemplateVersionFor(session, owner, version),
    };
  }, [session, services, presets, libraries]);
};
