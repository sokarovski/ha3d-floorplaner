// The house image library and template list for the open session (backend-owned resources, refreshed explicitly).
import { useCallback, useEffect, useState } from "react";
import type { ImageEntryValue } from "@shared/contracts/images";
import type { TemplateListItemValue } from "@shared/contracts/templates";
import { useAppServices } from "../../../app/appServicesContext";

export type HouseLibraries = Readonly<{
  images: readonly ImageEntryValue[];
  templates: readonly TemplateListItemValue[];
  reloadImages: () => void;
  reloadTemplates: () => void;
}>;

export const useHouseLibraries = (houseId: string): HouseLibraries => {
  const services = useAppServices();
  const [images, setImages] = useState<readonly ImageEntryValue[]>([]);
  const [templates, setTemplates] = useState<readonly TemplateListItemValue[]>([]);
  const [imageGeneration, setImageGeneration] = useState(0);
  const [templateGeneration, setTemplateGeneration] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    services.images.list(houseId, controller.signal).then(setImages, () => undefined);
    return () => {
      controller.abort();
    };
  }, [services, houseId, imageGeneration]);
  useEffect(() => {
    const controller = new AbortController();
    services.templates.list(houseId, controller.signal).then(setTemplates, () => undefined);
    return () => {
      controller.abort();
    };
  }, [services, houseId, templateGeneration]);
  return {
    images,
    templates,
    reloadImages: useCallback(() => {
      setImageGeneration((value) => value + 1);
    }, []),
    reloadTemplates: useCallback(() => {
      setTemplateGeneration((value) => value + 1);
    }, []),
  };
};
