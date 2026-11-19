// The React-free Three.js viewport runtime (spec/architecture/renderer.md). One instance owns one canvas,
// its scene graph, cameras, input listeners, render scheduling, and every GPU resource it creates.
// Rendering happens on invalidation only: state changes and gestures request one animation frame.
// Shadow maps are static (Phase 7.10): they are redrawn only when scene content changes (`invalidate`), never
// for camera-only frames (`redraw`), because light and sun shadows do not depend on the view.
import { Color, Plane, Raycaster, Scene, Vector3 } from "three";
import { attachNavigationInput } from "./navigationInput";
import type { ForwardedPointer } from "./navigationInput";
import { createCameraRig } from "./cameraRig";
import { createEffectsLayer, effectsLayer } from "./effectsLayer";
import { watchViewportVisibility } from "./viewportVisibility";
import type { FloorBounds } from "./floorScene";
import { createFloorScene } from "./floorScene";
import { createGroundGrid } from "./groundGrid";
import { createHouseOverviewLayer } from "./houseOverviewLayer";
import { attachedRoofsOnly, createRoofLayer } from "./roofLayer";
import { createGuidesLayer } from "./guidesLayer";
import { createHelperMaterials } from "./helperMaterials";
import { helperPalette } from "./helperPalette";
import { createInertRuntime } from "./inertRuntime";
import { createInstanceLayer } from "./instanceLayer";
import { createMirrorSurfaces } from "./mirrorSurface";
import { createWebGlRenderer, maxPixelRatio } from "./rendererSetup";
import { createLightsLayer, houseShadowBudget, shadowBudget } from "./lightsLayer";
import { floorWithLightsOff } from "./lightSwitch";
import { floorView, houseWithFloor, viewerVisibility } from "@shared/domain/house/visibility";
import type { FloorView, VisibilityRule } from "@shared/domain/house/visibility";
import { strongerFade } from "./surfaceMaterialKey";
import type { FadeLevel } from "./surfaceMaterialKey";
import type { PickTargets } from "./pickables";
import { createTemplateCache } from "./templateCache";
import { createLighting } from "./lighting";
import { createSkyShading } from "./skyShading";
import { createMaterialCache } from "./materialCache";
import { createOverlayLayer } from "./overlayLayer";
import { createPlanRoot, mmPerMetre, planToWorld, worldToPlan } from "./planFrame";
import { renderPng } from "./pngExport";
import { buildRenderScene, exportGlb } from "./renderSceneExport";
import type {
  AreaIsolation,
  HelperSettings,
  NavigationMode,
  PickHit,
  PlanPoint,
  PlanPoint3,
  FaceViewFrame,
  PrimaryCameraDrag,
  RuntimeEvent,
  SceneInput,
  ScreenPoint,
  ViewportRuntime,
  ViewportRuntimeOptions,
} from "./runtimeTypes";
import { helperLayer } from "./sceneObjects";
import { createSwitchTiming, switchTimingRequested } from "./switchTiming";
import { createTextureCache } from "./textureCache";

const cameraEventIntervalMs = 100;
const linePickPx = 6;
const pointPickPx = 9;
const modelLayer = 0;
/** The builder overview is merged (18.1) once nothing changed for this long (ms), then one floor per step (ms). */
const overviewBatchQuietMs = 300;
const overviewBatchStepMs = 50;
/** Framing used before a floor has any geometry: a 10 m square around the origin. */
const emptyFloorBounds: FloorBounds = { minX: -5000, minY: -5000, maxX: 5000, maxY: 5000, maxHeightMm: 2500 };

export const createViewportRuntime = (options: ViewportRuntimeOptions): ViewportRuntime => {
  const { container, onEvent } = options;
  const created = createWebGlRenderer();
  if (typeof created === "string") {
    onEvent({ type: "unsupported", reason: created });
    return createInertRuntime(created);
  }
  const renderer = created;
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.setAttribute("data-viewport-canvas", "");
  container.appendChild(canvas);

  let disposed = false;
  let frameHandle = 0;
  let helpers: HelperSettings = { groundGrid: true, theme: "light" };
  let palette = helperPalette(helpers.theme, helpers.accent);
  let navigation: NavigationMode = "trackpad";
  let primaryDrag: PrimaryCameraDrag | null = null;
  let framedFloorKey: string | null = null;
  let framedWithContent = false;
  let cameraTimer: ReturnType<typeof setTimeout> | null = null;
  let cameraPending = false;
  /** Off screen (16.11): frames are held back; the viewport draws once when it is back. */
  let offScreen = false;

  const scene = new Scene();
  scene.background = new Color(palette.background);
  const planRoot = createPlanRoot();
  scene.add(planRoot);

  const rig = createCameraRig();
  for (const camera of rig.cameras) {
    camera.layers.enable(helperLayer);
    camera.layers.enable(effectsLayer);
  }
  const raycaster = new Raycaster();
  raycaster.layers.enableAll();

  /** A frame for a view-only change (camera, size, helpers): shadow maps are reused. */
  const redraw = (): void => {
    if (disposed || frameHandle !== 0) return;
    if (offScreen) return;
    frameHandle = requestAnimationFrame(() => {
      frameHandle = 0;
      if (disposed) return;
      helperMaterials.setDashScale(rig.mmPerPixel());
      effects.beforeRender();
      sky.beforeRender();
      lights.beforeRender(scene);
      const started = performance.now();
      renderer.render(scene, rig.camera());
      if (frameStats !== null) frameStats(performance.now() - started);
    });
  };
  // Light switch timing (Phase 16.6, opt-in): the time to the next frame and whether it compiled programs. Call
  // after the change has requested its frame, so this frame callback runs after the render.
  const switchTiming = switchTimingRequested()
    ? createSwitchTiming((message) => {
        console.info(`[homeplan viewport] ${message}`);
      })
    : null;
  const timeSwitch = (label: string): void => {
    if (switchTiming === null) return;
    const programs = (): number => renderer.info.programs?.length ?? 0;
    const measured = switchTiming.begin(label, programs());
    requestAnimationFrame(() => {
      measured(programs());
    });
  };
  // Frame cost (Phase 18.1, opt-in with the switch timing): every 60 frames, the average render time (CPU side) and
  // the last frame's draw calls and triangles.
  const frameStats = switchTimingRequested()
    ? ((): ((ms: number) => void) => {
        let count = 0;
        let total = 0;
        let worst = 0;
        return (ms) => {
          count += 1;
          total += ms;
          worst = Math.max(worst, ms);
          if (count < 60) return;
          const info = renderer.info.render;
          console.info(
            `[homeplan viewport] ${String(count)} frames: render avg ${(total / count).toFixed(1)} ms, worst ${worst.toFixed(1)} ms; ${String(info.calls)} draw calls, ${String(info.triangles)} triangles`,
          );
          count = 0;
          total = 0;
          worst = 0;
        };
      })()
    : null;
  /** A frame after a scene change: shadow maps are redrawn too. */
  const invalidate = (): void => {
    renderer.shadowMap.needsUpdate = true;
    redraw();
  };

  const textures = createTextureCache(
    options.imageUrl,
    Math.min(8, renderer.capabilities.getMaxAnisotropy()),
    invalidate,
  );
  const materials = createMaterialCache(textures);
  const helperMaterials = createHelperMaterials(palette);
  const floorScene = createFloorScene(materials, palette);
  const guides = createGuidesLayer(helperMaterials);
  const overlay = createOverlayLayer(helperMaterials);
  const grid = createGroundGrid(palette);
  const lighting = createLighting();
  const floorShadowBudget = shadowBudget(renderer.capabilities.maxTextures);
  const lights = createLightsLayer(helperMaterials, floorShadowBudget);
  /** Light pins shown (light controls); never in the overview (18.1). */
  let pinsShown = true;
  let lastScene: SceneInput | null = null;
  // Template loads re-run the instance/light sync for the current scene.
  const templates = createTemplateCache(options.templateUrl, () => {
    if (disposed) return;
    syncContent();
    invalidate();
  });
  const mirrors = createMirrorSurfaces(renderer);
  const instances = createInstanceLayer(templates, materials, mirrors);
  // Builder whole-house overview (Phase 16.4): all floors stacked; the single-floor content is released meanwhile.
  const overviewLayer = createHouseOverviewLayer(materials, palette, templates, mirrors);
  let houseOverview = false;
  // A roof's editing level (Phase 19.1): that roof drawn over its floor, in the floor's frame. Floor and room views
  // never draw the cutting roof (owner decision 4); since 19.3 they draw the floor's attached roofs (canopies, a
  // proposal for the owner to confirm). The whole-house overview draws every roof through its own layer.
  const roofEdit = createRoofLayer(materials, templates);
  let roofViewId: string | null = null;
  /** The floor ID the single-floor layers sync while the overview is on: none, so they hold nothing. */
  const noFloorId = "";
  // Sky light indoors (Phase 15.5): sky portals at the windows and a reduced sky fill inside rooms.
  const sky = createSkyShading({
    frame: floorScene.root,
    content: planRoot,
    rooms: floorScene.indoorRooms,
    openings: instances.skyOpenings,
    lighting,
  });
  // Ambient effects (D24) animate through view-only frames: they never redraw the shadow maps.
  const effects = createEffectsLayer(redraw);
  const onScreenWatch = watchViewportVisibility(canvas, (onScreen) => {
    offScreen = !onScreen;
    effects.setPaused(offScreen);
    if (offScreen) {
      if (frameHandle !== 0) {
        cancelAnimationFrame(frameHandle);
        frameHandle = 0;
      }
      return;
    }
    // Back on screen: always one frame (the page may have loaded hidden, or the canvas been resized meanwhile).
    invalidate();
  });
  offScreen = !onScreenWatch.onScreen();
  effects.setPaused(offScreen);
  let previewedEffects = new Set<string>();

  /** Lights focus dims every area (no area is the focused one) and locks them; lights stay pickable. */
  const lightsFocusIsolation: AreaIsolation = {
    areaId: "",
    others: "faded",
    fadeOwnContent: false,
    othersLocked: true,
  };
  let editorIsolation: AreaIsolation | null = null;
  const applyIsolation = (): void => {
    floorScene.setIsolation(lightsFocus ? lightsFocusIsolation : editorIsolation);
    // Shared openings (15.7) may change group with the isolation: re-attach the instances, then the materials.
    if (lastScene === null) refreshMaterials();
    else syncContent();
    invalidate();
  };

  // Hide and Hidden (Phase 7.5): the floor is drawn through one visibility rule (shared with the HA viewer).
  let visibility: VisibilityRule = viewerVisibility;
  let view: FloorView | null = null;
  const ghostFade = (areaId: string, entityId: string): FadeLevel => {
    const fade = floorScene.entityFade(areaId, entityId);
    return view?.ghostIds.has(entityId) === true ? strongerFade(fade, "faded") : fade;
  };

  const refreshMaterials = (): void => {
    materials.begin();
    floorScene.applyMaterials();
    instances.applyMaterials(ghostFade);
    overviewLayer.applyMaterials();
    roofEdit.applyMaterials();
    materials.sweep();
  };

  /** Draws the last scene through the visibility rule: floors, walls, instances, and lights. */
  const syncScene = (): void => {
    if (lastScene === null) return;
    const { house, openingSize } = lastScene;
    const floorId = houseOverview ? noFloorId : lastScene.floorId;
    const authored = house.floors.find((candidate) => candidate.id === floorId);
    view = authored === undefined ? null : floorView(authored, visibility);
    floorScene.sync(
      view === null ? house : houseWithFloor(house, view.floor),
      floorId,
      openingSize,
      view ?? undefined,
    );
    const shownRoofId = roofViewId;
    roofEdit.sync(
      houseOverview ? null : (authored ?? null),
      shownRoofId === null ? attachedRoofsOnly : (roof) => roof.id === shownRoofId,
    );
    syncContent();
  };

  const syncContent = (): void => {
    if (lastScene === null) return;
    const { openingSize } = lastScene;
    // Roof windows (19.3) whose template has loaded since.
    roofEdit.refresh();
    const overviewStart = performance.now();
    overviewLayer.sync(houseOverview ? lastScene.house : null, openingSize, visibility);
    if (houseOverview && switchTiming !== null)
      console.info(
        `[homeplan viewport] house overview sync ${(performance.now() - overviewStart).toFixed(1)} ms (${String(lastScene.house.floors.length)} floors)`,
      );
    const floor = view?.floor ?? null;
    const concealed = view?.concealedLightIds ?? new Set<string>();
    instances.setConcealedLights(concealed);
    const emitters = instances.sync(floor, openingSize, floorScene.contentGroup);
    // The overview (18.1) lights every floor with this one layer: one topology, the house shadow budget.
    const overviewFloors = houseOverview ? overviewLayer.contentFloors() : [];
    const [firstFloor] = overviewFloors;
    const lit = !houseOverview
      ? floor
      : firstFloor === undefined
        ? null
        : { ...firstFloor, areas: overviewFloors.flatMap((each) => each.areas) };
    lights.setConcealed(houseOverview ? overviewLayer.concealedLightIds() : concealed);
    lights.setShadowBudget(houseOverview ? houseShadowBudget : floorShadowBudget);
    lights.sync(
      lit === null || lightsOn ? lit : floorWithLightsOff(lit),
      houseOverview ? overviewLayer.areaGroup : floorScene.areaGroup,
      houseOverview ? overviewLayer.emitters() : emitters,
    );
    instances.setFixtureGlow(lights.fixtureGlow());
    overviewLayer.setFixtureGlow(lights.fixtureGlow());
    // Light pins belong to a floor's editing: none in the overview (a pick there is a floor).
    lights.setPinsVisible(pinsShown && !houseOverview);
    effects.sync(floor, instances.root);
    refreshMaterials();
    if (houseOverview) scheduleOverviewBatch(overviewBatchQuietMs);
  };
  // The overview's floors are merged once settled (18.1, staticBatch.ts): one floor per step, so no frame waits
  // for the whole house; the merged meshes draw the same geometry, so only the view is redrawn.
  let overviewBatchTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleOverviewBatch = (wait: number): void => {
    if (overviewBatchTimer !== null) clearTimeout(overviewBatchTimer);
    overviewBatchTimer = setTimeout(() => {
      overviewBatchTimer = null;
      if (disposed || !houseOverview) return;
      const started = performance.now();
      if (!overviewLayer.rebatch()) return;
      if (switchTiming !== null) {
        const stats = overviewLayer.batchStats();
        console.info(
          `[homeplan viewport] merged an overview floor in ${(performance.now() - started).toFixed(1)} ms (${String(stats.sources)} meshes in ${String(stats.batches)} draws so far)`,
        );
      }
      redraw();
      scheduleOverviewBatch(overviewBatchStepMs);
    }, wait);
  };
  planRoot.add(floorScene.root, overviewLayer.root, roofEdit.root, guides.root, overlay.root, grid.mesh);
  scene.add(lighting.root);
  renderer.toneMappingExposure = lighting.exposure();

  const emit = (event: RuntimeEvent): void => {
    if (!disposed) onEvent(event);
  };

  const emitCamera = (): void => {
    if (cameraTimer !== null) {
      cameraPending = true;
      return;
    }
    emit({ type: "cameraChange", camera: rig.snapshot() });
    cameraTimer = setTimeout(() => {
      cameraTimer = null;
      if (!cameraPending) return;
      cameraPending = false;
      emitCamera();
    }, cameraEventIntervalMs);
  };

  const cameraMoved = (): void => {
    redraw();
    emitCamera();
  };

  const projectPlan = (planMm: PlanPoint3): ScreenPoint | null => {
    const camera = rig.camera();
    camera.updateMatrixWorld();
    const projected = planToWorld(planMm).project(camera);
    if (projected.z < -1 || projected.z > 1) return null;
    const { width, height } = rig.size();
    return { x: ((projected.x + 1) / 2) * width, y: ((1 - projected.y) / 2) * height };
  };

  // Light pins (Phase 5.11): picked first, in screen space. Clicking the same spot again cycles through the
  // lights stacked there; the Lights focus makes them the only pickable things.
  let lightsFocus = false;
  let lightsOn = true;
  /** Light controls Off hides fixtures in the view only; exports always include them. */
  let fixturesShown = true;
  /** The Room Editor draws on plain colours (owner): textures off in the view only; exports keep them. */
  let texturesShown = true;
  const showFixtures = (visible: boolean): void => {
    lights.setFixturesVisible(visible);
    instances.setLightFixturesVisible(visible);
    overviewLayer.setLightFixturesVisible(visible);
  };
  let faceView: FaceViewFrame | null = null;
  const applyFaceView = (): void => {
    if (faceView === null) {
      rig.setFaceView(null);
      return;
    }
    const { originMm, directionPlan, normalPlan, lengthMm, heightMm, clipAheadMm, tilt } = faceView;
    if (tilt !== undefined) {
      rig.setFaceView({
        center: planToWorld(tilt.centerMm),
        normal: new Vector3(tilt.normal.x, tilt.normal.h, -tilt.normal.y).normalize(),
        widthM: lengthMm / mmPerMetre,
        heightM: heightMm / mmPerMetre,
        clipAheadM: clipAheadMm / mmPerMetre,
      });
      return;
    }
    rig.setFaceView({
      center: planToWorld({
        x: originMm.x + (directionPlan.x * lengthMm) / 2,
        y: originMm.y + (directionPlan.y * lengthMm) / 2,
        h: heightMm / 2,
      }),
      normal: new Vector3(normalPlan.x, 0, -normalPlan.y).normalize(),
      widthM: lengthMm / mmPerMetre,
      heightM: heightMm / mmPerMetre,
      clipAheadM: clipAheadMm / mmPerMetre,
    });
  };
  let hoveredLight: string | null = null;
  let selectedLights: readonly string[] = [];
  let lightCycle: { screen: ScreenPoint; ids: string; index: number; clicked: boolean } | null = null;
  const cycleSpotPx = 4;

  const pickLightPin = (screen: ScreenPoint, includeLocked: boolean, click: boolean): PickHit | null => {
    if (houseOverview) return null;
    const pins = lights
      .pickScreen(screen, projectPlan, rig.mmPerPixel())
      .filter((pin) => includeLocked || lightsFocus || floorScene.isPickable(pin.areaId));
    if (pins.length === 0) return null;
    const ids = pins.map((pin) => pin.lightId).join(",");
    const same =
      lightCycle !== null &&
      lightCycle.ids === ids &&
      Math.hypot(screen.x - lightCycle.screen.x, screen.y - lightCycle.screen.y) <= cycleSpotPx;
    if (!same || lightCycle === null) lightCycle = { screen, ids, index: 0, clicked: false };
    if (click) {
      if (lightCycle.clicked) lightCycle.index = (lightCycle.index + 1) % pins.length;
      lightCycle.clicked = true;
    }
    const pin = pins[lightCycle.index] ?? pins[0];
    if (pin === undefined) return null;
    return pins.length > 1 ? { ...pin, stack: { index: lightCycle.index, total: pins.length } } : pin;
  };

  const pickAt = (screen: ScreenPoint, includeLocked = false, click = false): PickHit | null => {
    const pinned = pickLightPin(screen, includeLocked, click);
    if (pinned !== null) return pinned;
    scene.updateMatrixWorld();
    rig.setRay(raycaster, screen);
    const metresPerPixel = rig.mmPerPixel() / mmPerMetre;
    raycaster.params.Line.threshold = linePickPx * metresPerPixel;
    raycaster.params.Points.threshold = pointPickPx * metresPerPixel;
    const first = (targets: PickTargets, ordered: boolean): PickHit | null => {
      const hits = raycaster.intersectObjects([...targets.keys()], false);
      let best: PickHit | null = null;
      for (const hit of hits) {
        const resolved = targets.get(hit.object)?.(hit) ?? null;
        if (
          resolved === null ||
          (!includeLocked && "areaId" in resolved && !floorScene.isPickable(resolved.areaId))
        )
          continue;
        if (best === null) {
          best = resolved;
          if (!ordered || resolved.kind !== "floor") return best;
          continue;
        }
        // A carpet just above the floor of the same area wins over that floor.
        const floorHit = best;
        if (
          resolved.kind === "carpet" &&
          floorHit.kind === "floor" &&
          resolved.areaId === floorHit.areaId &&
          Math.abs(resolved.pointMm.h - floorHit.pointMm.h) < 20
        )
          return resolved;
      }
      return best;
    };
    if (houseOverview) return overviewLayer.pick((objects) => raycaster.intersectObjects([...objects], true));
    if (roofViewId !== null && lastScene !== null) {
      const [roofHit] = raycaster.intersectObjects([roofEdit.root], true);
      const roofId = roofHit === undefined ? null : roofEdit.roofAt(roofHit.object);
      if (roofHit !== undefined && roofId !== null)
        return { kind: "roof", roofId, floorId: lastScene.floorId, pointMm: worldToPlan(roofHit.point) };
    } else if (lastScene !== null && roofEdit.root.children.length > 0) {
      // A floor view's canopies (19.3): picked when nothing of the floor is in front of them.
      const [front] = raycaster.intersectObjects([roofEdit.root, floorScene.root], true);
      const roofId = front === undefined ? null : roofEdit.roofAt(front.object);
      if (front !== undefined && roofId !== null)
        return { kind: "roof", roofId, floorId: lastScene.floorId, pointMm: worldToPlan(front.point) };
    }
    if (lightsFocus) return first(lights.pickTargets(), false);
    return (
      first(lights.pickTargets(), false) ??
      guides.pick(raycaster) ??
      first(new Map([...floorScene.pickTargets(), ...instances.pickTargets()]), true)
    );
  };

  const planPointAt = (screen: ScreenPoint, heightMm: number): PlanPoint | null => {
    rig.setRay(raycaster, screen);
    const plane = new Plane(new Vector3(0, 1, 0), -heightMm / mmPerMetre);
    const point = raycaster.ray.intersectPlane(plane, new Vector3());
    if (point === null) return null;
    const plan = worldToPlan(point);
    return { x: plan.x, y: plan.y };
  };

  /** Closest approach between the pointer ray and the vertical line through `at` (world metres → mm). */
  const heightOnVertical = (screen: ScreenPoint, at: PlanPoint): number | null => {
    rig.setRay(raycaster, screen);
    const { origin, direction } = raycaster.ray;
    const base = planToWorld({ x: at.x, y: at.y, h: 0 });
    const up = new Vector3(0, 1, 0);
    const b = direction.dot(up);
    const denominator = 1 - b * b;
    if (denominator < 1e-4) return null;
    const w = origin.clone().sub(base);
    const s = (w.dot(up) - b * w.dot(direction)) / denominator;
    return s * mmPerMetre;
  };

  /** Screen pixels covered on the left by the floating toolbox: fitting centres in the uncovered part. */
  let insetLeftPx = 0;
  const frameBounds = (bounds: FloorBounds): void => {
    const { width } = rig.size();
    const visible = Math.max(1, width - insetLeftPx);
    // Frame a box widened by the covered share, then slide it right by half the inset.
    const grow = width / visible;
    const halfX = ((bounds.maxX - bounds.minX) / 2) * grow;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    rig.frame({ ...bounds, minX: centerX - halfX, maxX: centerX + halfX }, true);
    if (insetLeftPx > 0) rig.panPixels(insetLeftPx / 2, 0);
    cameraMoved();
  };

  const onPointer = (pointer: ForwardedPointer): void => {
    const hit =
      pointer.phase === "leave" || pointer.phase === "cancel"
        ? null
        : pickAt(pointer.screen, false, pointer.phase === "down" && pointer.button === 0);
    // The hovered light's pin grows and takes the strong accent (Phase 5.11).
    const nextHovered = hit?.kind === "light" ? hit.lightId : null;
    if (pointer.phase !== "down" && pointer.phase !== "up" && nextHovered !== hoveredLight) {
      hoveredLight = nextHovered;
      lights.setHighlight(hoveredLight, selectedLights);
      redraw();
    }
    emit({ type: "pointer", ...pointer, plan: planPointAt(pointer.screen, 0), hit });
  };

  const input = attachNavigationInput(canvas, rig, {
    navigation: () => navigation,
    primaryDrag: () => primaryDrag,
    // Orbit about what was grabbed (SketchUp); empty space keeps the current pivot.
    onPrimaryDragStart: (screen) => {
      const hit = pickAt(screen, true);
      if (hit !== null) rig.setPivot(planToWorld(hit.pointMm));
    },
    onCamera: cameraMoved,
    onPointer,
    onDoubleClick: (screen) => {
      emit({ type: "doubleClick", screen, hit: pickAt(screen, true) });
    },
  });

  const resize = (): void => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio, maxPixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    helperMaterials.setPixelRatio(pixelRatio);
    helperMaterials.setResolution(width, height);
    rig.setSize(width, height);
    redraw();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const onContextLost = (event: Event): void => {
    event.preventDefault();
    emit({ type: "contextLost" });
  };
  const onContextRestored = (): void => {
    emit({ type: "contextRestored" });
    invalidate();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  /** What is framed and fitted: the floor, or every floor in the house overview (house frame). */
  const contentBounds = (): FloorBounds | null => {
    if (houseOverview) return overviewLayer.bounds();
    const floor = floorScene.bounds();
    // The open roof, or a floor view's canopies (19.3).
    const roof = roofEdit.extent();
    if (roof === null) return floor;
    const xs = roof.corners.map((corner) => corner.x);
    const ys = roof.corners.map((corner) => corner.y);
    return {
      minX: Math.min(floor?.minX ?? Number.POSITIVE_INFINITY, ...xs),
      minY: Math.min(floor?.minY ?? Number.POSITIVE_INFINITY, ...ys),
      maxX: Math.max(floor?.maxX ?? Number.NEGATIVE_INFINITY, ...xs),
      maxY: Math.max(floor?.maxY ?? Number.NEGATIVE_INFINITY, ...ys),
      maxHeightMm: Math.max(floor?.maxHeightMm ?? 0, roof.topMm),
    };
  };

  const applyBounds = (): void => {
    const bounds = contentBounds();
    rig.setExtent(bounds);
    lighting.fit(bounds);
    const reference = bounds ?? emptyFloorBounds;
    grid.fit(
      { x: (reference.minX + reference.maxX) / 2, y: (reference.minY + reference.maxY) / 2 },
      Math.hypot(reference.maxX - reference.minX, reference.maxY - reference.minY),
    );
  };

  /**
   * Exports never draw saved-hidden things (Phase 7.5): with Show hidden on, the ghosts are left out for the
   * export and come back afterwards. Returns the restore step.
   */
  const withoutGhosts = (): (() => void) => {
    if (!visibility.showHidden || view === null || view.ghostIds.size === 0) return () => undefined;
    const shown = visibility;
    visibility = { ...shown, showHidden: false };
    syncScene();
    scene.updateMatrixWorld(true);
    return () => {
      visibility = shown;
      syncScene();
    };
  };

  const runtime: ViewportRuntime = {
    setScene: ({ house, floorId, openingSize }) => {
      if (disposed) return;
      lastScene = { house, floorId, openingSize };
      syncScene();
      guides.sync(houseOverview ? [] : (house.floors.find((floor) => floor.id === floorId)?.guides ?? []));
      applyBounds();
      // Frame only on the first scene of a floor (or once it first gets geometry); never on later edits.
      const floorKey = `${house.id}/${houseOverview ? "house" : floorId}`;
      const bounds = contentBounds();
      if (framedFloorKey !== floorKey || (!framedWithContent && bounds !== null)) {
        framedFloorKey = floorKey;
        framedWithContent = bounds !== null;
        frameBounds(bounds ?? emptyFloorBounds);
      }
      invalidate();
      timeSwitch("scene update");
    },
    setViewMode: (mode) => {
      if (mode === rig.mode()) return;
      rig.setMode(mode);
      cameraMoved();
    },
    setNavigation: (next) => {
      navigation = next;
    },
    setPrimaryDrag: (next) => {
      // A tool change or Space release ends a click–move–click camera follow.
      if (next?.base !== primaryDrag?.base || next?.shift !== primaryDrag?.shift) input.stopFollow();
      primaryDrag = next;
    },
    stopCameraFollow: () => input.stopFollow(),
    frame: (target = { kind: "floor" }) => {
      if (disposed) return;
      // In a face view, Fit to screen frames the face again.
      if (faceView !== null) {
        applyFaceView();
        cameraMoved();
        invalidate();
        return;
      }
      const floorBounds = contentBounds();
      if (target.kind === "floor") frameBounds(floorBounds ?? emptyFloorBounds);
      else frameBounds({ ...target, maxHeightMm: floorBounds?.maxHeightMm ?? emptyFloorBounds.maxHeightMm });
    },
    setSelection: (selection) => {
      floorScene.setSelection(selection);
      selectedLights = selection.lightIds ?? [];
      // Effects play once when they (or their object) join the selection.
      const effectIds = new Set(selection.effectIds ?? []);
      effects.preview([...effectIds].filter((id) => !previewedEffects.has(id)));
      previewedEffects = effectIds;
      lights.setHighlight(hoveredLight, selectedLights);
      invalidate();
    },
    setIsolation: (isolation) => {
      editorIsolation = isolation;
      applyIsolation();
    },
    setFaceView: (next) => {
      faceView = next;
      applyFaceView();
      cameraMoved();
      invalidate();
    },
    facePointAt: (screenX, screenY) => {
      if (faceView === null) return null;
      rig.setRay(raycaster, { x: screenX, y: screenY });
      const tilt = faceView.tilt;
      if (tilt !== undefined) {
        const tiltHit = raycaster.ray.intersectPlane(
          new Plane().setFromNormalAndCoplanarPoint(
            new Vector3(tilt.normal.x, tilt.normal.h, -tilt.normal.y).normalize(),
            planToWorld(tilt.originMm),
          ),
          new Vector3(),
        );
        if (tiltHit === null) return null;
        const plan = worldToPlan(tiltHit);
        const d = { x: plan.x - tilt.originMm.x, y: plan.y - tilt.originMm.y, h: plan.h - tilt.originMm.h };
        return {
          alongMm: d.x * tilt.along.x + d.y * tilt.along.y + d.h * tilt.along.h,
          heightMm: d.x * tilt.up.x + d.y * tilt.up.y + d.h * tilt.up.h,
        };
      }
      const origin = planToWorld({ ...faceView.originMm, h: 0 });
      const normal = new Vector3(faceView.normalPlan.x, 0, -faceView.normalPlan.y).normalize();
      const hit = raycaster.ray.intersectPlane(
        new Plane().setFromNormalAndCoplanarPoint(normal, origin),
        new Vector3(),
      );
      if (hit === null) return null;
      const plan = worldToPlan(hit);
      return {
        alongMm:
          (plan.x - faceView.originMm.x) * faceView.directionPlan.x +
          (plan.y - faceView.originMm.y) * faceView.directionPlan.y,
        heightMm: plan.h,
      };
    },
    instanceBounds: (instanceId) => {
      scene.updateMatrixWorld();
      return instances.bounds(instanceId);
    },
    setViewInsets: (insets) => {
      insetLeftPx = Math.max(0, insets.leftPx);
    },
    cameraPreset: (preset) => {
      // Both moves are 3D: from Top, switch first (the UI's view mode follows).
      if (rig.mode() === "top") rig.setMode("3d");
      if (preset === "lookDown") rig.lookStraightDown();
      else rig.turnQuarter();
      cameraMoved();
    },
    setLightFixturesVisible: (visible) => {
      fixturesShown = visible;
      showFixtures(visible);
      invalidate();
    },
    setSurfaceTexturesVisible: (visible) => {
      texturesShown = visible;
      materials.setTexturesEnabled(visible);
      invalidate();
    },
    setLightPinsVisible: (visible) => {
      pinsShown = visible;
      lights.setPinsVisible(visible && !houseOverview);
      redraw();
    },
    setEffectsOn: (on) => {
      effects.setShown(on);
      if (on) effects.playAll();
      redraw();
    },
    setLightsOn: (on) => {
      if (on === lightsOn) return;
      lightsOn = on;
      syncContent();
      invalidate();
      timeSwitch(on ? "lights on" : "lights off");
    },
    setVisibility: (rule) => {
      if (rule === visibility) return;
      visibility = rule;
      syncScene();
      applyBounds();
      invalidate();
    },
    setLightsFocus: (on) => {
      if (on === lightsFocus) return;
      lightsFocus = on;
      applyIsolation();
    },
    lookFromAxis: (axis) => {
      // Camera offset (sin p·sin a, cos p, sin p·cos a): +x faces the viewer at a = π/2; plan +y (world −z) at a = π.
      rig.orbitToAzimuth(axis === "x" ? Math.PI / 2 : Math.PI);
      redraw();
      emitCamera();
    },
    setWallsVisible: (visible) => {
      floorScene.setWallsVisible(visible);
      instances.setWallOpeningsVisible(visible);
      overviewLayer.setWallsVisible(visible);
      invalidate();
    },
    setHelpers: (next) => {
      helpers = next;
      palette = helperPalette(helpers.theme, helpers.accent);
      if (scene.background instanceof Color) scene.background.set(palette.background);
      grid.mesh.visible = helpers.groundGrid;
      grid.setPalette(palette);
      helperMaterials.setPalette(palette);
      floorScene.setPalette(palette);
      overviewLayer.setPalette(palette);
      invalidate();
    },
    setOverlay: (primitives) => {
      // Overlays live on the helper layer and cast no shadows.
      overlay.set(primitives);
      redraw();
    },
    setHouseOverview: (on) => {
      if (on === houseOverview) return;
      houseOverview = on;
      if (lastScene === null) return;
      // The same scene, drawn the other way: the single floor (released in the overview) or every floor. The
      // framing key changes with it, so the new content is framed once.
      runtime.setScene(lastScene);
    },
    setRoofView: (roofId) => {
      if (roofId === roofViewId) return;
      roofViewId = roofId;
      if (lastScene === null) return;
      syncScene();
      applyBounds();
      invalidate();
    },
    setFloorPreviewOffsets: (offsets) => {
      overviewLayer.setPreviewOffsets(offsets);
      invalidate();
    },
    setAreaPreviewTransform: (areaId, transform) => {
      floorScene.setPreview(areaId, transform);
      refreshMaterials();
      invalidate();
    },
    setSun: (sun) => {
      lighting.setSun(sun);
      renderer.toneMappingExposure = lighting.exposure();
      mirrors.setReflectionScale(lighting.reflectionScale());
      invalidate();
    },
    pick: (x, y) => (disposed ? null : pickAt({ x, y })),
    planPointAt: (x, y, heightMm = 0) => (disposed ? null : planPointAt({ x, y }, heightMm)),
    heightOnVertical: (x, y, at) => (disposed ? null : heightOnVertical({ x, y }, at)),
    screenPointOf: projectPlan,
    worldUnitsPerPixel: () => rig.mmPerPixel(),
    cameraSnapshot: () => rig.snapshot(),
    exportPng: async ({ scale, transparentBackground }) => {
      if (disposed) throw new Error("The viewport has been disposed.");
      const restoreGhosts = withoutGhosts();
      // Walls off is an editing aid: exports always show the walls.
      const wallsWereOff = !floorScene.wallsVisible();
      const showWalls = (visible: boolean): void => {
        floorScene.setWallsVisible(visible);
        instances.setWallOpeningsVisible(visible);
      };
      if (wallsWereOff) showWalls(true);
      if (!fixturesShown) showFixtures(true);
      if (!texturesShown) materials.setTexturesEnabled(true);
      const { width, height } = rig.size();
      const camera = rig.camera();
      const snapshot = rig.snapshot();
      scene.updateMatrixWorld();
      // Walls shown for the export change what casts shadows; redraw the maps for it and again afterwards.
      renderer.shadowMap.needsUpdate = true;
      const result = await (async () => {
        try {
          sky.beforeRender();
          lights.beforeRender(scene);
          return await renderPng({
            renderer,
            scene,
            camera,
            viewportWidth: width,
            viewportHeight: height,
            scale,
            transparentBackground,
            background: new Color(palette.background),
            modelLayer,
          });
        } finally {
          if (wallsWereOff) showWalls(false);
          if (!fixturesShown) showFixtures(false);
          if (!texturesShown) materials.setTexturesEnabled(false);
          restoreGhosts();
        }
      })();
      invalidate();
      return { ...result, camera: snapshot };
    },
    exportRenderScene: async () => {
      if (disposed) throw new Error("The viewport has been disposed.");
      const restoreGhosts = withoutGhosts();
      const wallsWereOff = !floorScene.wallsVisible();
      if (wallsWereOff) {
        floorScene.setWallsVisible(true);
        instances.setWallOpeningsVisible(true);
      }
      if (!fixturesShown) showFixtures(true);
      if (!texturesShown) materials.setTexturesEnabled(true);
      const camera = rig.snapshot();
      const sun = lighting.sunState();
      // Isolation dimming is a viewport aid: export with every area at full material.
      const isolated = floorScene.isolation();
      if (isolated !== null) {
        floorScene.setIsolation(null);
        refreshMaterials();
      }
      scene.updateMatrixWorld(true);
      const exportScene = buildRenderScene(scene);
      if (isolated !== null) {
        floorScene.setIsolation(isolated);
        refreshMaterials();
      }
      if (wallsWereOff) {
        floorScene.setWallsVisible(false);
        instances.setWallOpeningsVisible(false);
      }
      if (!fixturesShown) showFixtures(false);
      if (!texturesShown) materials.setTexturesEnabled(false);
      restoreGhosts();
      const glb = await exportGlb(exportScene);
      return { glb, camera, sun };
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (frameHandle !== 0) cancelAnimationFrame(frameHandle);
      frameHandle = 0;
      if (cameraTimer !== null) clearTimeout(cameraTimer);
      if (overviewBatchTimer !== null) clearTimeout(overviewBatchTimer);
      onScreenWatch.dispose();
      resizeObserver.disconnect();
      input.dispose();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      effects.dispose();
      sky.dispose();
      instances.dispose();
      mirrors.dispose();
      lights.dispose();
      templates.dispose();
      floorScene.dispose();
      overviewLayer.dispose();
      roofEdit.dispose();
      guides.dispose();
      overlay.dispose();
      grid.dispose();
      lighting.dispose();
      materials.dispose();
      textures.dispose();
      helperMaterials.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
  return runtime;
};
