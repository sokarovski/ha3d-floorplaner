// House data that domain editors need (images, presets, references, templates). Provided by the Floor Builder,
// and by /ds pages with fixtures. One narrow context; generic editors never see it.
import { createContext, useContext } from "react";
import type { ImageEntryValue } from "@shared/contracts/images";
import type { TemplateListItemValue } from "@shared/contracts/templates";
import type { SurfaceMaterialValue } from "@shared/domain/schemas/values";

export type PresetOption = Readonly<{
  id: string;
  name: string;
  material: SurfaceMaterialValue;
  builtIn: boolean;
}>;

export type ReferenceOption = Readonly<{ id: string; label: string }>;

export type DomainEditorData = Readonly<{
  houseId: string;
  images: readonly ImageEntryValue[];
  imageUrl: (imageId: string) => string;
  thumbnailUrl: (imageId: string) => string;
  uploadImage: (file: File, name?: string) => Promise<ImageEntryValue>;
  reloadImages: () => void;
  presets: readonly PresetOption[];
  savePreset: (name: string, material: SurfaceMaterialValue) => boolean;
  referenceOptions: (kind: string, owner: unknown) => readonly ReferenceOption[];
  templates: readonly TemplateListItemValue[];
  /** Updates instances to a newer template version (D07); returns false when rejected. */
  updateTemplateVersion: (owner: unknown, version: number) => boolean;
}>;

export const DomainEditorDataContext = createContext<DomainEditorData | undefined>(undefined);

export const useDomainEditorData = (): DomainEditorData => {
  const data = useContext(DomainEditorDataContext);
  if (data === undefined) throw new Error("Domain editors need DomainEditorDataContext");
  return data;
};
