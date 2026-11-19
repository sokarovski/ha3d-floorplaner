import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { useAppServices } from "../../../app/appServicesContext";
import { Button } from "../../../design-system/components/Button/Button";
import { defaultSun } from "../../../renderer/lighting";
import type {
  AreaIsolation,
  HelperSettings,
  NavigationMode,
  OverlayPrimitive,
  PlanPoint,
  RuntimeEvent,
  SunSettings,
  ViewMode,
  ViewportRuntime,
  ViewportSelection,
} from "../../../renderer/runtimeTypes";
import { TemplatePreviewPlayground } from "../components/TemplatePreviewPlayground";
import { ViewportHost } from "../components/ViewportHost";
import { createPlaygroundFixture } from "../fixtures/playgroundHouse";
import rulesPlaygroundUrl from "../fixtures/rules-playground.glb?url";
import { describePick } from "../services/describePick";
import { documentTheme } from "../services/documentTheme";
import { downloadBlob } from "../services/downloadBlob";

const emptySelection: ViewportSelection = { wallIds: [], areaIds: [] };
const noOverlay: readonly OverlayPrimitive[] = [];
const previewTemplates: readonly string[] = [
  "window-style-1",
  "sofa-3-seat",
  "door-interior",
  "tv-wall",
  "pendant-light",
  "staircase-straight",
];
const previewFixtures: Readonly<Record<string, string>> = { "rules-playground": rulesPlaygroundUrl };

export const ViewportPlaygroundPage = (): ReactElement => {
  const [fixture] = useState(createPlaygroundFixture);
  const [runtime, setRuntime] = useState<ViewportRuntime | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("top");
  const [navigation, setNavigation] = useState<NavigationMode>("trackpad");
  const [groundGrid, setGroundGrid] = useState(true);
  const [isolated, setIsolated] = useState(false);
  const [selection, setSelection] = useState<ViewportSelection>(emptySelection);
  const [lastPick, setLastPick] = useState("Click the model to pick.");
  const [anchor, setAnchor] = useState<PlanPoint | null>(null);
  const [hover, setHover] = useState<PlanPoint | null>(null);
  const [status, setStatus] = useState("");
  const [theme] = useState(documentTheme);
  const [night, setNight] = useState(false);
  const [templateMode, setTemplateMode] = useState(false);
  const { templates } = useAppServices();

  const sun = useMemo<SunSettings>(
    () => ({ directionPlan: defaultSun.directionPlan, intensity: night ? 0 : defaultSun.intensity }),
    [night],
  );
  const helpers = useMemo<HelperSettings>(() => ({ groundGrid, theme }), [groundGrid, theme]);
  const isolation = useMemo<AreaIsolation | null>(() => {
    const areaId = fixture.areaIds[0];
    return isolated && areaId !== undefined
      ? { areaId, others: "faded", fadeOwnContent: false, othersLocked: false }
      : null;
  }, [isolated, fixture]);
  const areaNames = useMemo(
    () =>
      new Map((fixture.house.floors[0]?.areas ?? []).map((area): [string, string] => [area.id, area.name])),
    [fixture],
  );
  const overlay = useMemo<readonly OverlayPrimitive[]>(
    () =>
      anchor === null
        ? noOverlay
        : [
            { kind: "point", at: anchor, tone: "accent" },
            ...(hover === null
              ? []
              : [{ kind: "segment", from: anchor, to: hover, dashed: true, tone: "accent" } as const]),
          ],
    [anchor, hover],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "f" && event.key !== "F") return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      runtime?.frame();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [runtime]);

  const onEvent = (event: RuntimeEvent): void => {
    if (event.type === "doubleClick" && event.hit === null) runtime?.frame();
    if (event.type !== "pointer") return;
    if (event.phase === "move") setHover(event.plan);
    if (event.phase !== "down" || event.button !== 0) return;
    setLastPick(describePick(event.hit, areaNames));
    const hit = event.hit;
    if (hit?.kind === "wall") setSelection({ wallIds: [hit.wallId], areaIds: [] });
    else if (hit?.kind === "floor") setSelection({ wallIds: [], areaIds: [hit.areaId] });
    else setSelection(emptySelection);
    setAnchor(anchor === null ? event.plan : null);
  };

  const exportPng = (transparentBackground: boolean): void => {
    if (runtime === null) return;
    setStatus("Exporting…");
    runtime
      .exportPng({ scale: 2, transparentBackground })
      .then((result) => {
        downloadBlob(result.blob, transparentBackground ? "viewport-transparent.png" : "viewport.png");
        setStatus(
          `Exported ${String(result.width)} × ${String(result.height)} px${result.capped ? " (capped by GPU limit)" : ""}.`,
        );
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : "Export failed.");
      });
  };

  const exportRenderScene = (): void => {
    if (runtime === null) return;
    setStatus("Exporting render scene…");
    runtime
      .exportRenderScene()
      .then((result) => {
        downloadBlob(result.glb, "render-scene.glb");
        setStatus(
          `Render scene ${String(Math.round(result.glb.size / 1024))} KB, sun ${result.sun.intensity.toFixed(2)}.`,
        );
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : "Export failed.");
      });
  };

  if (templateMode)
    return (
      <div data-viewport-playground="">
        <div data-viewport-playground-toolbar="">
          <Button variant="secondary" size="sm" onPress={() => setTemplateMode(false)}>
            Back to floor viewport
          </Button>
        </div>
        <TemplatePreviewPlayground templateIds={previewTemplates} fixtures={previewFixtures} />
      </div>
    );

  return (
    <div data-viewport-playground="">
      <div data-viewport-playground-toolbar="" role="toolbar" aria-label="Viewport controls">
        <Button
          variant={viewMode === "top" ? "primary" : "secondary"}
          size="sm"
          onPress={() => setViewMode("top")}
        >
          Top
        </Button>
        <Button
          variant={viewMode === "3d" ? "primary" : "secondary"}
          size="sm"
          onPress={() => setViewMode("3d")}
        >
          3D
        </Button>
        <Button
          variant={navigation === "trackpad" ? "primary" : "secondary"}
          size="sm"
          onPress={() => setNavigation("trackpad")}
        >
          Trackpad
        </Button>
        <Button
          variant={navigation === "mouse" ? "primary" : "secondary"}
          size="sm"
          onPress={() => setNavigation("mouse")}
        >
          Mouse
        </Button>
        <Button
          variant={groundGrid ? "primary" : "secondary"}
          size="sm"
          onPress={() => setGroundGrid(!groundGrid)}
        >
          Grid
        </Button>
        <Button variant={isolated ? "primary" : "secondary"} size="sm" onPress={() => setIsolated(!isolated)}>
          Isolate Living
        </Button>
        <Button variant={night ? "primary" : "secondary"} size="sm" onPress={() => setNight(!night)}>
          Night
        </Button>
        <Button variant="secondary" size="sm" onPress={() => runtime?.frame()}>
          Frame
        </Button>
        <Button variant="secondary" size="sm" onPress={() => exportPng(false)}>
          Export PNG
        </Button>
        <Button variant="secondary" size="sm" onPress={() => exportPng(true)}>
          Export transparent
        </Button>
        <Button variant="secondary" size="sm" onPress={exportRenderScene}>
          Export render scene
        </Button>
        <Button variant="secondary" size="sm" onPress={() => setTemplateMode(true)}>
          Template preview
        </Button>
      </div>
      <div data-viewport-playground-stage="">
        <ViewportHost
          label="Viewport playground"
          house={fixture.house}
          floorId={fixture.floorId}
          openingSize={fixture.openingSize}
          imageUrl={fixture.imageUrl}
          templateUrl={templates.builtinUrl}
          sun={sun}
          viewMode={viewMode}
          navigation={navigation}
          selection={selection}
          helpers={helpers}
          overlay={overlay}
          isolation={isolation}
          onEvent={onEvent}
          onRuntime={setRuntime}
        />
      </div>
      <p data-viewport-playground-status="" aria-live="polite">
        <span>Pick: {lastPick}</span>
        {status === "" ? null : <span>{status}</span>}
      </p>
    </div>
  );
};
