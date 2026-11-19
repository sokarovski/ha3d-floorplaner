// Registers the "Edit template" action with navigation for the open Floor Builder.
import { useEffect } from "react";
import { useNavigate } from "react-router";
import type { TemplateListItemValue } from "@shared/contracts/templates";
import { paths } from "../../../app/routes/paths";
import { setTemplateActionProvider } from "../services/selectionActions";
import { templateActions } from "../services/templateActions";
import { useSession } from "./sessionContext";

export const useTemplateActions = (templates: readonly TemplateListItemValue[]): void => {
  const session = useSession();
  const navigate = useNavigate();
  useEffect(() => {
    setTemplateActionProvider(
      templateActions(
        (templateId) => {
          void navigate(paths.object(session.houseId, templateId));
        },
        (templateId) => templates.some((item) => item.id === templateId && item.source === "house"),
      ),
    );
    return () => {
      setTemplateActionProvider(undefined);
    };
  }, [navigate, session, templates]);
};
