import type { ReactElement } from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { defaultInstanceParameters } from "@shared/domain/templates/metadata";
import { useAppServices } from "../../../app/appServicesContext";
import { Button } from "../../../design-system/components/Button/Button";
import { createTemplatePreviewRuntime } from "../../../renderer/templatePreviewRuntime";
import type { TemplatePreviewEvent, TemplatePreviewRuntime } from "../../../renderer/templatePreviewTypes";
import { alternateParameters } from "../services/alternateParameters";
import { describePreviewStatus } from "../services/describePreviewStatus";
import { documentTheme } from "../services/documentTheme";
import { readGlbTemplate } from "../services/readGlbTemplate";

type TemplatePreviewPlaygroundProps = Readonly<{
  templateIds: readonly string[];
  /** Dev-only templates served as local files (the Phase 9.0 rules fixture), by ID. */
  fixtures: Readonly<Record<string, string>>;
}>;

export const TemplatePreviewPlayground = ({
  templateIds,
  fixtures,
}: TemplatePreviewPlaygroundProps): ReactElement => {
  const { templates } = useAppServices();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<TemplatePreviewRuntime | null>(null);
  const [templateId, setTemplateId] = useState(templateIds[0] ?? "");
  const [wide, setWide] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [alternate, setAlternate] = useState(false);
  const [status, setStatus] = useState<TemplatePreviewEvent | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const handleEvent = useEffectEvent((event: TemplatePreviewEvent) => {
    if (event.type === "pick") {
      setPicked(event.nodeName);
      runtimeRef.current?.setSelectedNode(event.nodeName);
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
    const url = fixtures[templateId] ?? templates.builtinUrl(templateId, 1);
    let cancelled = false;
    readGlbTemplate(url)
      .then(({ metadata, nodeRules }) => {
        if (cancelled) return;
        const defaults = defaultInstanceParameters(metadata);
        const parameters = alternate ? alternateParameters(metadata, defaults) : defaults;
        const widthMax = metadata.resize.x.maxMm;
        runtimeRef.current?.setTemplate({
          url,
          metadata,
          nodeRules,
          parameters: wide && widthMax !== undefined ? { ...parameters, widthMm: widthMax } : parameters,
          flip: { x: flipped && metadata.flip.x, z: flipped && metadata.flip.z },
        });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setStatus({ type: "loadError", url, message: error instanceof Error ? error.message : "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [templates, fixtures, templateId, wide, flipped, alternate]);

  return (
    <div data-template-playground="">
      <div data-viewport-playground-toolbar="" role="toolbar" aria-label="Template preview controls">
        {[...templateIds, ...Object.keys(fixtures)].map((id) => (
          <Button
            key={id}
            variant={id === templateId ? "primary" : "secondary"}
            size="sm"
            onPress={() => setTemplateId(id)}
          >
            {id}
          </Button>
        ))}
        <Button variant={wide ? "primary" : "secondary"} size="sm" onPress={() => setWide(!wide)}>
          Max width
        </Button>
        <Button variant={flipped ? "primary" : "secondary"} size="sm" onPress={() => setFlipped(!flipped)}>
          Flip
        </Button>
        <Button
          variant={alternate ? "primary" : "secondary"}
          size="sm"
          onPress={() => setAlternate(!alternate)}
        >
          Options and states
        </Button>
        <Button variant="secondary" size="sm" onPress={() => runtimeRef.current?.frame()}>
          Frame
        </Button>
      </div>
      <section data-viewport="" aria-label="Template preview">
        <div data-viewport-surface="" ref={surfaceRef} />
        <div data-template-preview-readout="">
          <span role="status">{describePreviewStatus(status)}</span>
          <span>{picked === null ? "Click a part to select it" : `Part: ${picked}`}</span>
        </div>
      </section>
    </div>
  );
};
