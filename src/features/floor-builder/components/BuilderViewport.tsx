import { useStore } from "zustand";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { openingSizeFromParameters } from "@shared/domain/templates/openingSize";
import { useAppServices } from "../../../app/appServicesContext";
import type {
  CameraSnapshot,
  OverlayPrimitive,
  PrimaryCameraDrag,
  RuntimeEvent,
  ViewportRuntime,
} from "../../../renderer/runtimeTypes";
import { usePreferences } from "../../preferences/hooks/usePreferences";
import { ViewportHost } from "../../viewport/components/ViewportHost";
import { useHouse, useSession, useUi } from "../hooks/sessionContext";
import { useViewportRef } from "../hooks/viewportRef";
import { useEffectiveTheme } from "../hooks/useEffectiveTheme";
import { useHouseSun } from "../hooks/useHouseSun";
import { compassOverlay } from "../services/compassOverlay";
import { sunSettingsFor } from "../services/sunLighting";
import { defaultSun } from "../../../renderer/lighting";
import { useViewportFraming } from "../hooks/useViewportFraming";
import { createToolController } from "../tools/toolController";
import type { ToolController } from "../tools/toolController";
import type { Readout, ViewportCursor } from "../tools/toolTypes";
import { runtimeCenter } from "../services/runtimeCenter";
import { openCarpetOverlay, shapeHandlesOverlay } from "../services/shapeHandlesOverlay";
import { viewportSelectionFor } from "../services/viewportSelection";
import { editorIsolation } from "../services/editorIsolation";
import { wallSeamsOverlay } from "../services/wallSeams";
import { cueOverlay } from "../inference/cueOverlay";
import type { InferenceCue } from "../inference/inferenceTypes";
import { readoutWithCue } from "../inference/cueReadout";
import { applyToolShortcut, inShortcutScope } from "../services/toolShortcuts";
import { applyHideShortcut, visibilityRuleOf } from "../services/hideActions";
import { applyViewportDoubleClick } from "../services/viewportDoubleClick";
import { selectedFloorsOverlay } from "../services/houseOverlay";
import { roofEditOverlay, selectedCanopiesOverlay, selectedRoofsOverlay } from "../services/roofOverlay";
import { wallFaceOf } from "../services/wallFace";
import { openRoofFaceOf } from "../services/roofFace";
import { faceOverlay, openFeatureOverlay } from "../tools/faceTools";
import { lightTipFor } from "../services/lightTip";
import { selectedLightsHandlesOverlay } from "../services/lightHandlesOverlay";
import { selectedObjectsOverlay } from "../services/objectSelectionOverlay";
import { ViewGizmo } from "../../../design-system/components/ViewGizmo/ViewGizmo";
import { gizmoAxes, gizmoNorth } from "../services/viewGizmo";
import { ViewportReadout } from "./ViewportReadout";
import { helperAccent, schemeFromPreference } from "../../../design-system/tokens/colorScheme";

/** A Space press shorter than this, with no camera movement, is a tap: it selects the Select tool. */
const spaceTapMs = 300;

export const BuilderViewport = (): ReactElement => {
  const session = useSession();
  const services = useAppServices();
  const house = useHouse((value) => value);
  // A running move or turn draws its uncommitted result live (owner, Phase 5 follow-up).
  const previewHouse = useStore(session.documents, (state) => state.preview);
  const floorId = useUi((ui) => ui.activeFloorId);
  const viewMode = useUi((ui) => ui.viewMode);
  const tool = useUi((ui) => ui.tool);
  const selection = useUi((ui) => ui.selection);
  const mode = useUi((ui) => ui.mode);
  // The whole-house overview (Phase 16.4): every floor stacked; floors are groups.
  const houseOverview = useUi((ui) => ui.houseOverview);
  const operationActive = useUi((ui) => ui.toolOperationActive);
  const focusAreaId = useUi((ui) => ui.focusAreaId);
  const focusCarpetId = useUi((ui) => ui.focusCarpetId);
  const focusWallFace = useUi((ui) => ui.focusWallFace);
  const focusReliefId = useUi((ui) => ui.focusReliefId);
  // A roof's editing level (Phase 19.1): the roof is drawn over its floor while it is open.
  const focusRoofId = useUi((ui) => ui.focusRoofId);
  const openFace = useMemo(() => wallFaceOf(house, floorId, focusWallFace), [house, floorId, focusWallFace]);
  // A roof face view (Phase 19.3): the camera looks straight at the open flat face of the roof.
  const focusRoofFace = useUi((ui) => ui.focusRoofFace);
  const openRoofFace = useMemo(
    () => openRoofFaceOf(house, { activeFloorId: floorId, focusRoofId, focusRoofFace }),
    [house, floorId, focusRoofId, focusRoofFace],
  );
  const showOthers = useUi((ui) => ui.showOthers);
  const wallsVisible = useUi((ui) => ui.wallsVisible);
  const lightControls = useUi((ui) => ui.lightControls);
  /** The light under the pointer (Phase 5.11): its name and height next to the pointer. */
  const [lightTip, setLightTip] = useState<Readout | undefined>(undefined);
  const isolation = useMemo(
    () => editorIsolation(mode, focusAreaId, showOthers, tool, focusCarpetId !== undefined),
    [mode, focusAreaId, showOthers, tool, focusCarpetId],
  );
  const navigation = usePreferences((preferences) => preferences.editor.navigation);
  const showGrid = usePreferences((preferences) => preferences.editor.showGroundGrid);
  const theme = useEffectiveTheme();
  const [runtime, setRuntime] = useState<ViewportRuntime | null>(null);
  useEffect(() => {
    runtime?.setRoofView(focusRoofId ?? null);
  }, [runtime, focusRoofId]);
  useEffect(() => {
    runtime?.setLightsFocus(lightControls === "focus");
    runtime?.setLightPinsVisible(lightControls !== "hidden");
  }, [runtime, lightControls]);
  const lightsOn = useUi((ui) => ui.lightsOn);
  useEffect(() => {
    runtime?.setLightsOn(lightsOn);
  }, [runtime, lightsOn]);
  const effectsOn = useUi((ui) => ui.effectsOn);
  useEffect(() => {
    runtime?.setEffectsOn(effectsOn);
  }, [runtime, effectsOn]);
  // Hide and Hidden (Phase 7.5): session-hidden things and Show hidden, through the shared visibility rule.
  const hiddenIds = useUi((ui) => ui.hiddenIds);
  const showHidden = useUi((ui) => ui.showHidden);
  useEffect(() => {
    runtime?.setVisibility(visibilityRuleOf({ hiddenIds, showHidden }));
  }, [runtime, hiddenIds, showHidden]);
  // Room, Carpet, and wall face editing draw on plain colours (owner): textures return in the overview.
  useEffect(() => {
    runtime?.setSurfaceTexturesVisible(mode !== "area");
  }, [runtime, mode]);
  // Wall face view (Phase 5.1): the camera looks straight at the open face; closing it restores the view.
  // Re-frame only when the face itself changes (not on every relief edit): its wall, side, size, and the
  // clip depth in 500 mm steps.
  const faceFrameKey =
    openRoofFace !== undefined
      ? [
          "roof",
          openRoofFace.roof.id,
          openRoofFace.pieceIndex,
          Math.round(openRoofFace.view.lengthMm),
          Math.round(openRoofFace.view.heightMm),
          Math.round(openRoofFace.frame.pitchDeg * 10),
        ].join("|")
      : openFace === undefined
        ? ""
        : [
            openFace.wall.id,
            openFace.side,
            Math.round(openFace.lengthMm),
            Math.round(openFace.heightMm),
            Math.ceil(openFace.frame.clipAheadMm / 500),
          ].join("|");
  useEffect(() => {
    if (runtime === null) return;
    const ui = session.ui.getState();
    const roofFace = openRoofFaceOf(session.documents.getState().document, ui);
    if (roofFace !== undefined) {
      runtime.setFaceView(roofFace.view);
      return;
    }
    const face =
      faceFrameKey === ""
        ? undefined
        : wallFaceOf(session.documents.getState().document, ui.activeFloorId, ui.focusWallFace);
    runtime.setFaceView(
      face === undefined
        ? null
        : { ...face.frame, clipAheadMm: Math.ceil(face.frame.clipAheadMm / 500) * 500 },
    );
  }, [runtime, session, faceFrameKey]);
  const [overlay, setOverlay] = useState<readonly OverlayPrimitive[]>([]);
  const [readout, setReadout] = useState<Readout | undefined>(undefined);
  const [hint, setHint] = useState("");
  const [cue, setCue] = useState<InferenceCue | undefined>(undefined);
  const [cursor, setCursor] = useState<ViewportCursor>("default");
  const [camera, setCamera] = useState<CameraSnapshot | null>(null);
  /** An X/Y gizmo click from Top view: applied once the 3D view is active. */
  const pendingAxis = useRef<"x" | "y" | undefined>(undefined);
  /** The floating toolbox covers the viewport's left edge: the renderer fits into the rest (owner). */
  const viewportElement = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = viewportElement.current;
    if (element === null || runtime === null) return undefined;
    const measure = (): void => {
      const toolbox = document.querySelector("[data-editor-layout-toolbox] [data-toolbox]");
      const left =
        toolbox === null ? 0 : toolbox.getBoundingClientRect().right - element.getBoundingClientRect().left;
      const inset = Math.max(0, Math.round(left + 8));
      runtime.setViewInsets({ leftPx: inset });
      element.style.setProperty("--viewport-inset-left", `${String(inset)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const toolbox = document.querySelector("[data-editor-layout-toolbox]");
    if (toolbox !== null) observer.observe(toolbox);
    return () => {
      observer.disconnect();
    };
  }, [runtime]);
  useEffect(() => {
    const axis = pendingAxis.current;
    if (axis === undefined || viewMode !== "3d" || runtime === null) return;
    pendingAxis.current = undefined;
    runtime.lookFromAxis(axis);
  }, [viewMode, runtime]);
  const controller = useRef<ToolController | undefined>(undefined);
  /**
   * Space held (Phase 5.13, SketchUp): primary drags pan (Shift: orbit) from any tool, keeping its operation.
   * A quick tap with no camera movement still selects the Select tool (Space's shortcut).
   */
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Shift flipping Auto-select so that the next press selects (Phase 5.3): the cursor says so (SketchUp-style
  // modifier cursor). When the flip makes the press act instead, the tool's own cursor already says that.
  const autoSelect = useUi((ui) => ui.autoSelect);
  const shiftFlip = useUi((ui) => ui.autoSelectShiftFlip);
  const shiftWillSelect = shiftFlip && !autoSelect;
  const spaceUse = useRef<{ downAt: number; moved: boolean } | undefined>(undefined);
  useEffect(() => {
    const drag: PrimaryCameraDrag | null = spaceHeld
      ? { base: "pan", shift: "toOrbit" }
      : tool === "orbit"
        ? { base: "orbit", shift: "toPan" }
        : tool === "pan"
          ? { base: "pan", shift: "none" }
          : null;
    runtime?.setPrimaryDrag(drag);
  }, [runtime, spaceHeld, tool]);
  const viewportRef = useViewportRef();
  const viewportSelection = useMemo(() => viewportSelectionFor(house, selection), [house, selection]);
  const sunResult = useHouseSun();
  const sunView = useUi((ui) => ui.sunView);
  // The header's sun view: the house's sun, a fixed daytime sun, or night (the same direction, no intensity).
  const sun = useMemo(
    () =>
      sunView === "day"
        ? defaultSun
        : sunView === "night"
          ? { ...defaultSun, intensity: 0 }
          : sunSettingsFor(sunResult),
    [sunResult, sunView],
  );
  const combinedOverlay = useMemo(() => {
    // The overview draws in the house frame: the selected floors' outlines (a running move draws its own).
    if (houseOverview)
      return [
        ...(operationActive ? [] : selectedFloorsOverlay(house, selection)),
        ...(operationActive ? [] : selectedRoofsOverlay(house, selection)),
        ...overlay,
        ...cueOverlay(cue),
      ];
    const floor = house.floors.find((candidate) => candidate.id === floorId);
    // The open roof: its sheet (outline, lines, folds, points), following a running edit's preview.
    if (focusRoofId !== undefined)
      return [
        ...roofEditOverlay(
          (previewHouse ?? house).floors.find((candidate) => candidate.id === floorId),
          focusRoofId,
          selection,
        ),
        ...overlay,
        ...cueOverlay(cue),
      ];
    // Grip offsets are in screen pixels, so the overlay follows the zoom: every camera change re-reads it.
    const mmPerPx = camera === null || runtime === null ? 1 : runtime.worldUnitsPerPixel();
    // Selection handles follow a running move or turn (the previewed document), like the model.
    const shown = previewHouse ?? house;
    const handles = [
      ...(openFace === undefined ? [] : faceOverlay(openFace, selection)),
      ...openCarpetOverlay(shown, focusCarpetId),
      ...(openFace === undefined ? [] : openFeatureOverlay(openFace, focusReliefId)),
      // Object boxes come from the built models, which catch up with a preview one frame later: the
      // running tool draws its own box meanwhile.
      ...(runtime === null || previewHouse !== undefined
        ? []
        : selectedObjectsOverlay(shown, selection, runtime, {
            topView: viewMode === "top",
            wallsVisible,
            wallItemHandles: openFace === undefined,
          })),
      ...shapeHandlesOverlay(shown, selection, floorId, openFace),
      // Canopies (19.3) are drawn in floor views: a selected one shows its outline.
      ...selectedCanopiesOverlay(
        shown.floors.find((candidate) => candidate.id === floorId),
        selection,
      ),
      ...(lightControls === "hidden"
        ? []
        : selectedLightsHandlesOverlay(shown, selection, mmPerPx, viewMode === "top")),
    ];
    const base =
      mode === "area" ? handles : [...compassOverlay(floor, house.environment.northRotationDeg), ...handles];
    const seams = wallSeamsOverlay(house, floorId, mode === "area" ? focusAreaId : undefined, selection);
    return [...base, ...seams, ...overlay, ...cueOverlay(cue)];
  }, [
    houseOverview,
    operationActive,
    mode,
    house,
    previewHouse,
    floorId,
    focusAreaId,
    focusCarpetId,
    focusReliefId,
    focusRoofId,
    openFace,
    selection,
    overlay,
    cue,
    runtime,
    camera,
    viewMode,
    wallsVisible,
    lightControls,
  ]);
  const shownReadout = useMemo(
    () => readoutWithCue(readout, cue, runtime) ?? lightTip,
    [readout, cue, runtime, lightTip],
  );
  // The renderer's selection colours follow the colour scheme (Phase 5.5).
  const schemeName = usePreferences((preferences) => preferences.appearance.colorScheme);
  const customColors = usePreferences((preferences) => preferences.appearance.customColors);
  const helpers = useMemo(
    () => ({
      groundGrid: showGrid,
      theme,
      accent: helperAccent(schemeFromPreference(schemeName, customColors), theme),
    }),
    [showGrid, theme, schemeName, customColors],
  );
  useViewportFraming(runtime);

  useEffect(() => {
    if (runtime === null) return undefined;
    const created = createToolController(session, runtime, {
      setOverlay,
      setReadout,
      setHint,
      setCue,
      setCursor,
    });
    controller.current = created;
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      if (event.key === " ") {
        if (!inShortcutScope(target, " ")) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat || spaceUse.current !== undefined) return;
        // A focused toolbox button would otherwise be pressed by Space.
        if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body)
          document.activeElement.blur();
        spaceUse.current = { downAt: performance.now(), moved: false };
        setSpaceHeld(true);
        return;
      }
      // Escape first ends a click–move–click camera follow (Pan/Orbit), before any tool sees it.
      if (event.key === "Escape" && runtime.stopCameraFollow()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const modifier = ["Shift", "Control", "Alt"].includes(event.key);
      if (!modifier && (event.metaKey || event.ctrlKey || event.altKey)) return;
      if (
        created.key(event) ||
        (inShortcutScope(target, event.key) && applyHideShortcut(session, event)) ||
        applyToolShortcut(session, event)
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === " ") {
        const use = spaceUse.current;
        if (use === undefined) return;
        spaceUse.current = undefined;
        setSpaceHeld(false);
        event.preventDefault();
        if (!use.moved && performance.now() - use.downAt < spaceTapMs) applyToolShortcut(session, event);
        return;
      }
      if (["Shift", "Control", "Alt"].includes(event.key)) onKey(event);
    };
    // Cmd-Tab away with Shift or Space down never delivers its keyup: forget held keys on blur.
    const onBlur = (): void => {
      created.blur();
      spaceUse.current = undefined;
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      created.dispose();
      controller.current = undefined;
    };
  }, [runtime, session]);

  const onEvent = (event: RuntimeEvent): void => {
    if (event.type === "pointer") {
      controller.current?.pointer(event);
      if (event.phase === "move" || event.phase === "leave") setLightTip(lightTipFor(session, event));
    } else if (event.type === "doubleClick") applyViewportDoubleClick(session, event, runtime);
    else if (event.type === "cameraChange" && runtime !== null) {
      if (spaceUse.current !== undefined) spaceUse.current.moved = true;
      setCamera(event.camera);
      const anchor = runtimeCenter(runtime);
      const center = runtime.planPointAt(anchor.x, anchor.y);
      if (center !== null)
        session.ui.setState({ viewCenterMm: { x: Math.round(center.x), y: Math.round(center.y) } });
    } else if (event.type === "unsupported") session.notify("danger", `3D view unavailable: ${event.reason}`);
  };

  return (
    <div
      ref={viewportElement}
      data-builder-viewport=""
      data-cursor={
        spaceHeld ? "pan" : shiftWillSelect ? "willSelect" : cursor === "default" ? undefined : cursor
      }
    >
      <ViewportHost
        label={houseOverview ? "Whole house" : "Active floor"}
        house={previewHouse ?? house}
        floorId={floorId}
        openingSize={openingSizeFromParameters}
        imageUrl={(imageId) => services.images.fileUrl(session.houseId, imageId)}
        templateUrl={(templateId, version) =>
          templateId.startsWith("t_")
            ? services.templates.houseTemplateUrl(session.houseId, templateId, version)
            : services.templates.builtinUrl(templateId, version)
        }
        viewMode={viewMode}
        navigation={navigation}
        selection={viewportSelection}
        helpers={helpers}
        overlay={combinedOverlay}
        isolation={isolation}
        wallsVisible={wallsVisible}
        houseOverview={houseOverview}
        sun={sun}
        onEvent={onEvent}
        onRuntime={(next) => {
          viewportRef.current = next;
          setRuntime(next);
          setCamera(next?.cameraSnapshot() ?? null);
        }}
      />
      {/* Bottom-left of the uncovered view: camera buttons above the orientation gizmo (owner). */}
      {camera === null ? null : (
        <div data-viewport-gizmo="">
          <ViewGizmo
            axes={gizmoAxes(camera)}
            north={gizmoNorth(camera, house.environment.northRotationDeg)}
            onAxis={(axis) => {
              if (axis === "z") session.ui.setState({ viewMode: "top" });
              else if (session.ui.getState().viewMode === "3d") runtime?.lookFromAxis(axis);
              else {
                pendingAxis.current = axis;
                session.ui.setState({ viewMode: "3d" });
              }
            }}
          />
        </div>
      )}
      <ViewportReadout readout={shownReadout} hint={hint} />
      {/* Moved out of the header (owner, Phase 13.2): a quiet link floating at the bottom right. */}
      <a href="agent.md" target="_blank" rel="noreferrer" data-agent-instructions="">
        AI agent instructions
      </a>
    </div>
  );
};
