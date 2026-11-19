// Loads metadata (and so the parameter schemas) of every template version the house uses.
import { useEffect } from "react";
import type { TemplateListItemValue } from "@shared/contracts/templates";
import { useAppServices } from "../../../app/appServicesContext";
import { loadTemplateMetadata } from "../templates/templateLibrary";
import { useHouse, useSession } from "./sessionContext";

export const useTemplateSchemaLoading = (templates: readonly TemplateListItemValue[]): void => {
  const session = useSession();
  const services = useAppServices();
  const house = useHouse((value) => value);
  useEffect(() => {
    const used = new Set<string>();
    for (const floor of house.floors) {
      for (const area of floor.areas) {
        for (const wall of area.walls)
          for (const opening of wall.objects)
            used.add(`${opening.templateId}@${String(opening.templateVersion)}`);
        for (const object of area.objects) used.add(`${object.templateId}@${String(object.templateVersion)}`);
      }
    }
    for (const key of used) {
      const [templateId = "", version = "1"] = key.split("@");
      const item = templates.find((candidate) => candidate.id === templateId);
      if (item !== undefined)
        void loadTemplateMetadata(services.templates, session.houseId, item, Number(version));
    }
  }, [house, templates, services, session]);
};
