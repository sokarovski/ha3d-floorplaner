import { useState } from "react";
import type { ReactElement } from "react";
import { Link, useParams } from "react-router";
import { Banner } from "../../../design-system/components/Banner/Banner";
import { Button } from "../../../design-system/components/Button/Button";
import { Spinner } from "../../../design-system/components/Spinner/Spinner";
import { useAppServices } from "../../../app/appServicesContext";
import { paths } from "../../../app/routes/paths";
import { FloorBuilder } from "../components/FloorBuilder";
import { EditorSessionContext } from "../hooks/sessionContext";
import { useEditorSessionLoader } from "../hooks/useEditorSessionLoader";
import { registerFloorBuilderFeatures } from "../services/featureRegistrations";

export const FloorBuilderPage = (): ReactElement => {
  registerFloorBuilderFeatures();
  const { houseId = "" } = useParams();
  const { houses } = useAppServices();
  const [attempt, setAttempt] = useState(0);
  const state = useEditorSessionLoader(houseId, houses, attempt);
  if (state.status === "loading") {
    return (
      <div data-app-loading="">
        <Spinner label="Opening house" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div data-builder-error="">
        <Banner
          tone="danger"
          actions={
            state.notFound ? undefined : (
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  setAttempt((value) => value + 1);
                }}
              >
                Retry
              </Button>
            )
          }
        >
          {state.notFound
            ? "This house does not exist (it may be in the trash)."
            : `The house could not be opened: ${state.message}`}
        </Banner>
        <Link to={paths.houses()}>Back to houses</Link>
      </div>
    );
  }
  return (
    <EditorSessionContext.Provider value={state.session}>
      <FloorBuilder
        onReload={() => {
          setAttempt((value) => value + 1);
        }}
      />
    </EditorSessionContext.Provider>
  );
};
