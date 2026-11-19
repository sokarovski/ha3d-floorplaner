import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Banner } from "../../../design-system/components/Banner/Banner";
import { Spinner } from "../../../design-system/components/Spinner/Spinner";
import { useAppServices } from "../../../app/appServicesContext";
import { paths } from "../../../app/routes/paths";
import { ImportModelPopup } from "../components/ImportModelPopup";
import { ObjectEditor } from "../components/ObjectEditor";
import { createTemplateDraftStore } from "../stores/templateDraftStore";
import type { TemplateDraftStore } from "../stores/templateDraftStore";

export const ObjectEditorPage = (): ReactElement => {
  const { houseId = "", templateId = "new" } = useParams();
  const { templates } = useAppServices();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<
    Readonly<{ key: string; draft: TemplateDraftStore | undefined; error: string | undefined }>
  >({ key: "", draft: undefined, error: undefined });
  const key = `${houseId}/${templateId}`;
  useEffect(() => {
    if (templateId === "new") return undefined;
    const controller = new AbortController();
    templates.draft(houseId, templateId, controller.signal).then(
      (response) => {
        if (!controller.signal.aborted)
          setLoaded({ key, draft: createTemplateDraftStore(response.draft), error: undefined });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setLoaded({
            key,
            draft: undefined,
            error: error instanceof Error ? error.message : "The template could not be opened.",
          });
      },
    );
    return () => {
      controller.abort();
    };
  }, [templates, houseId, templateId, key]);
  if (templateId === "new") {
    return (
      <div data-builder-error="">
        <p>Import a GLB/glTF or STL model to create a template for this house.</p>
        <Link to={paths.house(houseId)}>Back to the Floor Builder</Link>
        <ImportModelPopup
          open
          houseId={houseId}
          onClose={() => {
            void navigate(paths.house(houseId));
          }}
          onImported={(id) => {
            void navigate(paths.object(houseId, id), { replace: true });
          }}
        />
      </div>
    );
  }
  if (loaded.key !== key)
    return (
      <div data-app-loading="">
        <Spinner label="Opening template" />
      </div>
    );
  if (loaded.draft === undefined) {
    return (
      <div data-builder-error="">
        <Banner tone="danger">{loaded.error ?? "The template could not be opened."}</Banner>
        <Link to={paths.house(houseId)}>Back to the Floor Builder</Link>
      </div>
    );
  }
  return <ObjectEditor houseId={houseId} draft={loaded.draft} />;
};
