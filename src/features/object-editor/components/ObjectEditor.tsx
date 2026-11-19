import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { useBlocker, useNavigate } from "react-router";
import { useStore } from "zustand";
import { Button } from "../../../design-system/components/Button/Button";
import { EditorLayout } from "../../../design-system/components/EditorLayout/EditorLayout";
import { Icon } from "../../../design-system/components/Icon/Icon";
import { IconButton } from "../../../design-system/components/IconButton/IconButton";
import { Popup } from "../../../design-system/components/Popup/Popup";
import { ToolButton } from "../../../design-system/components/ToolButton/ToolButton";
import { Toolbox } from "../../../design-system/components/Toolbox/Toolbox";
import { useAppServices } from "../../../app/appServicesContext";
import { paths } from "../../../app/routes/paths";
import { draftIssues } from "../services/draftValidation";
import { NodeRefOptionsContext } from "../services/nodeRefData";
import type { TemplateDraftStore } from "../stores/templateDraftStore";
import { TemplatePreview } from "./TemplatePreview";
import { TemplatePropertiesPanel } from "./TemplatePropertiesPanel";
import { TemplateTreePanel } from "./TemplateTreePanel";

type ObjectEditorProps = Readonly<{
  houseId: string;
  draft: TemplateDraftStore;
}>;

export const ObjectEditor = ({ houseId, draft }: ObjectEditorProps): ReactElement => {
  const { templates } = useAppServices();
  const navigate = useNavigate();
  const state = useStore(draft.store, (value) => value);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const issues = draftIssues(state.draft, state.content);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => state.dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  // Reloading or closing the tab while the draft is unsaved asks the browser to confirm.
  useEffect(() => {
    if (!state.dirty) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [state.dirty]);

  const save = async (): Promise<boolean> => {
    if (issues.length > 0) {
      setMessage(`Fix ${String(issues.length)} metadata issue${issues.length === 1 ? "" : "s"} first.`);
      return false;
    }
    setSaving(true);
    const current = draft.store.getState();
    const submitted = current.content;
    try {
      const version = await templates.saveVersion(houseId, current.draft.templateId, {
        metadata: submitted.metadata,
        rootTransform: current.draft.rootTransform,
        nodeRules: { ...submitted.nodeRules },
        label: submitted.label,
      });
      const refreshed = await templates.draft(houseId, current.draft.templateId);
      draft.markSaved(refreshed.draft, submitted);
      setMessage(
        `Saved version ${String(version)}. Placed objects keep their version until you update them.`,
      );
      return true;
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "The version could not be saved.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) draft.redo();
        else draft.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [draft]);

  return (
    <NodeRefOptionsContext.Provider
      value={state.draft.nodes.map((node) => node.name).filter((name) => name !== "")}
    >
      <EditorLayout
        header={
          <div data-builder-header="">
            <button
              type="button"
              data-builder-back=""
              onClick={() => {
                void navigate(paths.house(houseId));
              }}
            >
              <Icon name="back" />
              Floor Builder
            </button>
            <div data-builder-title="">
              <span data-builder-house-name="">{state.content.label}</span>
              <span data-builder-floor-name="">
                Template draft · versions:{" "}
                {state.draft.versions.length === 0 ? "none" : state.draft.versions.join(", ")}
              </span>
              <span data-builder-mode="">Object Editor</span>
            </div>
            <div data-builder-header-actions="">
              <IconButton
                icon="undo"
                label="Undo (template draft)"
                disabled={state.past.length === 0}
                onPress={draft.undo}
              />
              <IconButton
                icon="redo"
                label="Redo (template draft)"
                disabled={state.future.length === 0}
                onPress={draft.redo}
              />
              <span data-save-status="" data-save-status-tone={state.dirty ? "warning" : "success"}>
                <span data-save-status-dot="" />
                {state.dirty ? "Unsaved draft" : "Saved"}
              </span>
              <Button
                busy={saving}
                onPress={() => {
                  void save();
                }}
              >
                Save version
              </Button>
            </div>
          </div>
        }
        toolbox={
          <Toolbox label="Tools">
            <ToolButton icon="pointer" label="Select" active onPress={() => undefined} />
          </Toolbox>
        }
        viewport={<TemplatePreview houseId={houseId} draft={draft} />}
        overview={<TemplateTreePanel draft={draft} />}
        properties={<TemplatePropertiesPanel draft={draft} />}
        status={
          <div data-status-bar="">
            {message === undefined ? (
              <span data-status-hint="">{state.draft.warnings.join(" · ")}</span>
            ) : (
              <span data-status-notice="" data-status-tone="info">
                {message}
              </span>
            )}
          </div>
        }
      />
      <Popup
        open={blocker.state === "blocked"}
        title="Save the template draft?"
        size="sm"
        onClose={() => {
          if (blocker.state === "blocked") blocker.reset();
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onPress={() => {
                if (blocker.state === "blocked") blocker.reset();
              }}
            >
              Keep editing
            </Button>
            <Button
              variant="danger"
              onPress={() => {
                if (blocker.state === "blocked") blocker.proceed();
              }}
            >
              Discard
            </Button>
            <Button
              busy={saving}
              onPress={() => {
                void save().then((ok) => {
                  if (ok && blocker.state === "blocked") blocker.proceed();
                });
              }}
            >
              Save version
            </Button>
          </>
        }
      >
        <p>The draft has changes that are not saved as a template version.</p>
      </Popup>
    </NodeRefOptionsContext.Provider>
  );
};
