import { useEffect } from "react";
import { useAppServices } from "../../../app/appServicesContext";
import { createAutomation } from "../automation/createAutomation";
import { agentGuides } from "../automation/guides";
import type { EditorSession } from "../services/editorSession";

export const useAgentAutomation = (session: EditorSession, onTemplatesChanged: () => void): void => {
  const services = useAppServices();
  useEffect(() => {
    const bridge = createAutomation(
      { session, images: services.images, templates: services.templates, onTemplatesChanged },
      agentGuides,
    );
    window.homeplan = bridge.api;
    return () => {
      bridge.dispose();
      if (window.homeplan === bridge.api) Reflect.deleteProperty(window, "homeplan");
    };
  }, [services, session, onTemplatesChanged]);
};
