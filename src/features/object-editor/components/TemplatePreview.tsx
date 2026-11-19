import type { ReactElement } from "react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { defaultInstanceParameters } from "@shared/domain/templates/metadata";
import { useAppServices } from "../../../app/appServicesContext";
import { Button } from "../../../design-system/components/Button/Button";
import { createTemplatePreviewRuntime } from "../../../renderer/templatePreviewRuntime";
import type { TemplatePreviewEvent, TemplatePreviewRuntime } from "../../../renderer/templatePreviewTypes";
import { documentTheme } from "../../viewport/services/documentTheme";
import { describePreviewStatus } from "../../viewport/services/describePreviewStatus";
import type { TemplateDraftStore } from "../stores/templateDraftStore";

type TemplatePreviewProps = Readonly<{
  houseId: string;
  draft: TemplateDraftStore;
}>;

export const TemplatePreview = ({ houseId, draft }: TemplatePreviewProps): ReactElement => {
  const { templates } = useAppServices();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<TemplatePreviewRuntime | null>(null);
  const [status, setStatus] = useState<TemplatePreviewEvent | null>(null);
  const templateId = useStore(draft.store, (state) => state.draft.templateId);
  const rootMatrix = useStore(draft.store, (state) => state.draft.rootMatrix);
  const metadata = useStore(draft.store, (state) => state.content.metadata);
  const nodeRules = useStore(draft.store, (state) => state.content.nodeRules);
  const selected = useStore(draft.store, (state) => state.selected);
  const parameters = useMemo(() => defaultInstanceParameters(metadata), [metadata]);
  const url = templates.baseUrl(houseId, templateId);

  const handleEvent = useEffectEvent((event: TemplatePreviewEvent) => {
    if (event.type === "pick") {
      draft.store.setState({ selected: event.nodeName ?? "" });
      return;
    }
    setStatus(event);
  });

  useEffect(() => {
    const container = surfaceRef.current;
    if (container === null) return;
    const runtime = createTemplatePreviewRuntime({
      container,
      onEvent: (event) => {
        handleEvent(event);
      },
    });
    runtime.setTheme(documentTheme());
    runtimeRef.current = runtime;
    return () => {
      runtimeRef.current = null;
      runtime.dispose();
    };
  }, []);

  useEffect(() => {
    runtimeRef.current?.setTemplate({
      url,
      rootMatrix,
      metadata,
      nodeRules,
      parameters,
      flip: { x: false, z: false },
    });
  }, [url, rootMatrix, metadata, nodeRules, parameters]);

  useEffect(() => {
    runtimeRef.current?.setSelectedNode(selected === "" ? null : selected);
  }, [selected]);

  return (
    <section data-viewport="" aria-label="Template preview">
      <div data-viewport-surface="" ref={surfaceRef} />
      <div data-template-preview-readout="">
        <span role="status">{describePreviewStatus(status)}</span>
        <Button variant="secondary" size="sm" onPress={() => runtimeRef.current?.frame()}>
          Frame
        </Button>
      </div>
    </section>
  );
};
