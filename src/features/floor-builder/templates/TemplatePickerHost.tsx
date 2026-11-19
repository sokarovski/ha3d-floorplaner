import type { ReactElement } from "react";
import { useStore } from "zustand";
import { useAppServices } from "../../../app/appServicesContext";
import { useDomainEditorData } from "../domain-editors/domainEditorData";
import { useSession } from "../hooks/sessionContext";
import { placeTemplate } from "./placement";
import { TemplatePickerPopup } from "./TemplatePickerPopup";
import { pickerStore } from "./templatePickerStore";
import { pickerTemplates, pickerTitle } from "./pickerFilter";

export const TemplatePickerHost = (): ReactElement => {
  const session = useSession();
  const services = useAppServices();
  const { templates } = useDomainEditorData();
  const request = useStore(pickerStore, (state) => state.request);
  const close = (): void => {
    pickerStore.setState({ request: undefined });
  };
  return (
    <TemplatePickerPopup
      open={request !== undefined}
      title={request === undefined ? "Choose an object" : pickerTitle(request)}
      templates={request === undefined ? [] : pickerTemplates(templates, request)}
      onClose={close}
      onPick={async (item) => {
        if (request === undefined) return;
        await placeTemplate(session, services.templates, request, item);
        close();
      }}
    />
  );
};
