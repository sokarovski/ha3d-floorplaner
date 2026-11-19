import { useRef, useState } from "react";
import type { ReactElement } from "react";
import { Button } from "../../../design-system/components/Button/Button";
import { EditorLayout } from "../../../design-system/components/EditorLayout/EditorLayout";
import { Popup } from "../../../design-system/components/Popup/Popup";
import { SettingsPopup } from "../../preferences/components/SettingsPopup";
import { usePreferences } from "../../preferences/hooks/usePreferences";
import { useAppServices } from "../../../app/appServicesContext";
import type { ViewportRuntime } from "../../../renderer/runtimeTypes";
import { DomainEditorDataContext } from "../domain-editors/domainEditorData";
import { ViewportRefContext } from "../hooks/viewportRef";
import { HistoryPopup } from "./HistoryPopup";
import { ExportAction } from "./ExportAction";
import { TemplatePickerHost } from "../templates/TemplatePickerHost";
import { useTemplateSchemaLoading } from "../hooks/useTemplateSchemaLoading";
import { useTemplateActions } from "../hooks/useTemplateActions";
import { IconButton } from "../../../design-system/components/IconButton/IconButton";
import { useSession } from "../hooks/sessionContext";
import { useDomainEditorValue } from "../hooks/useDomainEditorValue";
import { useHouseLibraries } from "../hooks/useHouseLibraries";
import { useBuilderShortcuts } from "../hooks/useBuilderShortcuts";
import { useLeaveGuard } from "../hooks/useLeaveGuard";
import { useAgentAutomation } from "../hooks/useAgentAutomation";
import { BuilderHeader } from "./BuilderHeader";
import { BuilderToolbox } from "./BuilderToolbox";
import { BuilderViewport } from "./BuilderViewport";
import { ConflictPopup } from "./ConflictPopup";
import { HouseTreePanel } from "./HouseTreePanel";
import { SelectionPanel } from "./SelectionPanel";
import { StatusBar } from "./StatusBar";

type FloorBuilderProps = Readonly<{
  onReload: () => void;
}>;

export const FloorBuilder = ({ onReload }: FloorBuilderProps): ReactElement => {
  const session = useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { preferences } = useAppServices();
  const treeShare = usePreferences((value) => value.editor.treeShare);
  const [historyOpen, setHistoryOpen] = useState(false);
  const viewportRef = useRef<ViewportRuntime | null>(null);
  const guard = useLeaveGuard(session);
  const libraries = useHouseLibraries(session.houseId);
  useAgentAutomation(session, libraries.reloadTemplates);
  const domainData = useDomainEditorValue(libraries);
  useTemplateSchemaLoading(libraries.templates);
  useTemplateActions(libraries.templates);
  useBuilderShortcuts(session, !settingsOpen);
  return (
    <ViewportRefContext.Provider value={viewportRef}>
      <DomainEditorDataContext.Provider value={domainData}>
        <EditorLayout
          header={
            <BuilderHeader
              onOpenSettings={() => {
                setSettingsOpen(true);
              }}
              extraActions={
                <>
                  <IconButton
                    icon="history"
                    label="History"
                    onPress={() => {
                      setHistoryOpen(true);
                    }}
                  />
                  <ExportAction />
                </>
              }
            />
          }
          toolbox={<BuilderToolbox />}
          viewport={<BuilderViewport />}
          sideSplit={treeShare}
          onSideSplitChange={(share) => {
            preferences.update({ editor: { treeShare: share } });
          }}
          overview={<HouseTreePanel />}
          properties={<SelectionPanel />}
          status={<StatusBar />}
        />
        <ConflictPopup onReload={onReload} />
        <TemplatePickerHost />
        <HistoryPopup
          open={historyOpen}
          onClose={() => {
            setHistoryOpen(false);
          }}
        />
        <SettingsPopup
          open={settingsOpen}
          onClose={() => {
            setSettingsOpen(false);
          }}
        />
        <Popup
          open={guard.asking}
          title="Leave without saving?"
          size="sm"
          onClose={guard.stay}
          footer={
            <>
              <Button variant="secondary" onPress={guard.stay}>
                Stay
              </Button>
              <Button variant="danger" onPress={guard.leave}>
                Leave anyway
              </Button>
            </>
          }
        >
          <p>The latest changes could not be written to disk. If you leave now, they are lost.</p>
        </Popup>
      </DomainEditorDataContext.Provider>
    </ViewportRefContext.Provider>
  );
};
