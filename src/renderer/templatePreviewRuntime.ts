// The Object Editor's 3D template preview (spec/builder/screens/object-editor.md#layout): a React-free
// runtime that loads a template's glTF, resizes it with the geometry core for the draft's metadata, node
// rules, parameters, and flips, and shows it in its mounting context.
//
// World = the template contact frame (meters, +Y up, front +Z), placed on reference surfaces:
// - floor/staircase objects stand on the ground (y = 0);
// - wall-mounted Areables (contact `back`) touch a reference wall at z = 0, raised to their default
//   elevation (1000 mm when the template declares none);
// - overhead objects (contact `top`) hang from y = 2.5 m (the default overhead reference, never drawn);
// - Wallables sit in a reference wall of hostDepthMm (default 200 mm) centered on z = 0 with the template's
//   opening cut through it, raised to their default bottom.
// Slice bands of every sliced (or fitHostDepth) axis are shown as translucent planes at the band
// boundaries. Camera: the shared 3D rig (orbit about the framed center, pan, zoom). Rendering on
// invalidation only; every resource is disposed with the runtime.
import type { Material, Object3D } from "three";
import {
  Box3,
  Color,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  Raycaster,
  Scene,
  Shape,
  ShadowMaterial,
} from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Axis } from "@shared/domain/templates/metadata";
import { axes, templateMaterialSlots } from "@shared/domain/templates/metadata";
import type { TemplateResizeSuccess } from "@shared/geometry/templateResize";
import { templateResize } from "@shared/geometry/templateResize";
import { createCameraRig } from "./cameraRig";
import { createGroundGrid } from "./groundGrid";
import { helperPalette } from "./helperPalette";
import { createLighting } from "./lighting";
import { createMirrorSurfaces } from "./mirrorSurface";
import { attachNavigationInput } from "./navigationInput";
import { createPlanRoot } from "./planFrame";
import { createWebGlRenderer, maxPixelRatio } from "./rendererSetup";
import type { HelperTheme, NavigationMode, ScreenPoint } from "./runtimeTypes";
import { disposeGeometries, helperLayer, isMesh, markAsHelper } from "./sceneObjects";
import { disposeGltf, flattenTemplate } from "./templateCache";
import { resizedGeometry } from "./templateGeometry";
import type {
  TemplatePreviewInput,
  TemplatePreviewOptions,
  TemplatePreviewRuntime,
} from "./templatePreviewTypes";

const overheadReferenceM = 2.5;
const defaultWallMountM = 1;
const defaultHostDepthMm = 200;
const clickTolerancePx = 4;
const axisColors: Readonly<Record<Axis, number>> = { x: 0xe5484d, y: 0x30a46c, z: 0x3e63dd };

const noop = (): void => undefined;

const inertPreview = (): TemplatePreviewRuntime => ({
  setTemplate: noop,
  setSelectedNode: noop,
  setNavigation: noop,
  setTheme: noop,
  frame: noop,
  dispose: noop,
});

/** Band boundary coordinates (mm, contact frame) of one axis, or none when the axis is not sliced. */
const bandPlanes = (axis: Axis, input: TemplatePreviewInput, result: TemplateResizeSuccess): number[] => {
  const resize = input.metadata.resize[axis];
  if (resize.mode !== "slice" && resize.mode !== "fitHostDepth") return [];
  const bandSize = (parameter: string | undefined, natural: number | undefined): number => {
    const value = parameter === undefined ? undefined : input.parameters[parameter];
    return typeof value === "number" ? value : (natural ?? 0);
  };
  const start = bandSize(resize.startParameter, resize.startMm);
  const end = bandSize(resize.endParameter, resize.endMm);
  const min = result.boundsMm.min[axis];
  const max = result.boundsMm.max[axis];
  const planes: number[] = [];
  if (start > 0) planes.push(min + start);
  if (end > 0) planes.push(max - end);
  return planes;
};

export const createTemplatePreviewRuntime = (options: TemplatePreviewOptions): TemplatePreviewRuntime => {
  const { container, onEvent } = options;
  const created = createWebGlRenderer();
  if (typeof created === "string") {
    onEvent({ type: "unsupported", reason: created });
    return inertPreview();
  }
  const renderer = created;
  const canvas = renderer.domElement;
  canvas.setAttribute("data-viewport-canvas", "");
  container.appendChild(canvas);

  let disposed = false;
  let frameHandle = 0;
  let theme: HelperTheme = "light";
  let navigation: NavigationMode = "trackpad";
  let input: TemplatePreviewInput | null = null;
  let loadedUrl: string | null = null;
  let loadToken = 0;
  let gltf: GLTF | null = null;
  let selected: string | null = null;
  let needsFrame = true;

  const scene = new Scene();
  scene.background = new Color(helperPalette(theme).background);
  const rig = createCameraRig();
  rig.setMode("3d");
  for (const camera of rig.cameras) camera.layers.enable(helperLayer);
  const lighting = createLighting();
  scene.add(lighting.root);
  renderer.toneMappingExposure = lighting.exposure();
  const planRoot = createPlanRoot();
  const grid = createGroundGrid(helperPalette(theme));
  grid.fit({ x: 0, y: 0 }, 6000);
  planRoot.add(grid.mesh);
  scene.add(planRoot);
  const mirrors = createMirrorSurfaces(renderer);
  const shadowMaterial = new ShadowMaterial({ opacity: 0.18 });
  const shadowCatcher = new Mesh(new PlaneGeometry(40, 40).rotateX(-Math.PI / 2), shadowMaterial);
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  const content = new Group();
  content.name = "templatePreview";
  scene.add(content);
  const objectGroup = new Group();
  const referenceGroup = new Group();
  const bandGroup = new Group();
  const highlightGroup = new Group();
  content.add(referenceGroup, objectGroup);
  objectGroup.add(bandGroup, highlightGroup);

  const wallMaterial = new MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.9 });
  const fallbackMaterial = new MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.7 });
  const highlightMaterial = new MeshBasicMaterial({
    color: helperPalette(theme).selection,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
  });
  const bandMaterials = new Map<Axis, Readonly<{ fill: MeshBasicMaterial; edge: LineBasicMaterial }>>(
    axes.map((axis) => [
      axis,
      {
        fill: new MeshBasicMaterial({
          color: axisColors[axis],
          transparent: true,
          opacity: 0.14,
          side: DoubleSide,
          depthWrite: false,
          toneMapped: false,
        }),
        edge: new LineBasicMaterial({
          color: axisColors[axis],
          transparent: true,
          opacity: 0.8,
          toneMapped: false,
        }),
      },
    ]),
  );
  const raycaster = new Raycaster();
  /** Object meshes and the node each came from. */
  let pickables = new Map<Object3D, string>();

  const invalidate = (): void => {
    if (disposed || frameHandle !== 0) return;
    frameHandle = requestAnimationFrame(() => {
      frameHandle = 0;
      if (!disposed) renderer.render(scene, rig.camera());
    });
  };

  const clearGroup = (group: Group): void => {
    for (const child of [...group.children]) {
      child.removeFromParent();
      disposeGeometries(child);
    }
  };

  const syncHighlight = (): void => {
    clearGroup(highlightGroup);
    if (selected === null) return;
    for (const [object, nodeName] of pickables) {
      if (nodeName !== selected || !isMesh(object)) continue;
      const overlay = new Mesh(object.geometry.clone(), highlightMaterial);
      overlay.renderOrder = 5;
      highlightGroup.add(overlay);
    }
    markAsHelper(highlightGroup);
  };

  const frameContent = (): void => {
    content.updateMatrixWorld(true);
    const box = new Box3().setFromObject(content);
    if (box.isEmpty()) return;
    rig.frame(
      {
        minX: box.min.x * 1000,
        maxX: box.max.x * 1000,
        minY: -box.max.z * 1000,
        maxY: -box.min.z * 1000,
        maxHeightMm: Math.max(box.max.y * 1000, 1),
      },
      true,
    );
    lighting.fit({
      minX: box.min.x * 1000,
      maxX: box.max.x * 1000,
      minY: -box.max.z * 1000,
      maxY: -box.min.z * 1000,
      maxHeightMm: box.max.y * 1000,
    });
  };

  const buildReferenceWall = (
    current: TemplatePreviewInput,
    result: TemplateResizeSuccess,
    bottomM: number,
  ): void => {
    const opening = result.openingMm;
    const depthM = (current.hostDepthMm ?? defaultHostDepthMm) / 1000;
    const widthM = Math.max(3, result.sizeMm.x / 1000 + 2);
    const topM = Math.max(2.6, bottomM + result.sizeMm.y / 1000 + 0.4);
    const outline = new Shape();
    outline.moveTo(-widthM / 2, 0);
    outline.lineTo(widthM / 2, 0);
    outline.lineTo(widthM / 2, topM);
    outline.lineTo(-widthM / 2, topM);
    outline.closePath();
    if (opening !== null) {
      const minY = Math.max(bottomM + opening.minY / 1000, 0.001);
      const hole = new Path();
      hole.moveTo(opening.minX / 1000, minY);
      hole.lineTo(opening.minX / 1000, bottomM + opening.maxY / 1000);
      hole.lineTo(opening.maxX / 1000, bottomM + opening.maxY / 1000);
      hole.lineTo(opening.maxX / 1000, minY);
      hole.closePath();
      outline.holes.push(hole);
    }
    const geometry = new ExtrudeGeometry(outline, { depth: depthM, bevelEnabled: false });
    geometry.translate(0, 0, -depthM / 2);
    const wall = new Mesh(geometry, wallMaterial);
    wall.castShadow = true;
    wall.receiveShadow = true;
    referenceGroup.add(wall);
  };

  const buildBackWall = (result: TemplateResizeSuccess): void => {
    const widthM = Math.max(3, result.sizeMm.x / 1000 + 1.5);
    const geometry = new ExtrudeGeometry(
      new Shape()
        .moveTo(-widthM / 2, 0)
        .lineTo(widthM / 2, 0)
        .lineTo(widthM / 2, 2.6)
        .lineTo(-widthM / 2, 2.6)
        .closePath(),
      { depth: 0.2, bevelEnabled: false },
    );
    geometry.translate(0, 0, -0.2);
    const wall = new Mesh(geometry, wallMaterial);
    wall.receiveShadow = true;
    referenceGroup.add(wall);
  };

  const buildBands = (current: TemplatePreviewInput, result: TemplateResizeSuccess): void => {
    const { min, max } = result.boundsMm;
    const size = { x: (max.x - min.x) / 1000, y: (max.y - min.y) / 1000, z: (max.z - min.z) / 1000 };
    const center = { x: (max.x + min.x) / 2000, y: (max.y + min.y) / 2000, z: (max.z + min.z) / 2000 };
    for (const axis of axes) {
      const materials = bandMaterials.get(axis);
      if (materials === undefined) continue;
      for (const at of bandPlanes(axis, current, result)) {
        const margin = 1.15;
        const plane =
          axis === "x"
            ? new PlaneGeometry(Math.max(size.z, 0.01) * margin, Math.max(size.y, 0.01) * margin).rotateY(
                Math.PI / 2,
              )
            : axis === "y"
              ? new PlaneGeometry(Math.max(size.x, 0.01) * margin, Math.max(size.z, 0.01) * margin).rotateX(
                  -Math.PI / 2,
                )
              : new PlaneGeometry(Math.max(size.x, 0.01) * margin, Math.max(size.y, 0.01) * margin);
        plane.translate(
          axis === "x" ? at / 1000 : center.x,
          axis === "y" ? at / 1000 : center.y,
          axis === "z" ? at / 1000 : center.z,
        );
        bandGroup.add(new Mesh(plane, materials.fill));
        bandGroup.add(new LineSegments(new EdgesGeometry(plane), materials.edge));
      }
    }
    markAsHelper(bandGroup);
  };

  const rebuild = (): void => {
    clearGroup(referenceGroup);
    clearGroup(bandGroup);
    clearGroup(highlightGroup);
    for (const child of [...objectGroup.children]) {
      if (child === bandGroup || child === highlightGroup) continue;
      child.removeFromParent();
      disposeGeometries(child);
    }
    pickables = new Map();
    const current = input;
    if (current === null || gltf === null) {
      invalidate();
      return;
    }
    const flat = flattenTemplate(gltf, current.nodeRules);
    const contract = current.metadata.contract;
    const result = templateResize(flat.input, current.metadata, {
      parameters: current.parameters,
      flip: current.flip,
      ...(contract === "Wallable" ? { hostDepthMm: current.hostDepthMm ?? defaultHostDepthMm } : {}),
    });
    if (!result.ok) {
      onEvent({ type: "resized", ok: false, issues: result.issues.map((issue) => issue.message) });
      invalidate();
      return;
    }
    const mirrorMaterial =
      current.metadata.mirror === undefined
        ? undefined
        : templateMaterialSlots(current.metadata)[current.metadata.mirror.materialSlot];
    for (const resized of result.meshes) {
      const authored =
        (resized.materialName === null ? undefined : flat.materials.get(resized.materialName)) ??
        fallbackMaterial;
      // Mirror slots (Phase 9.1) shine as they do in the builder and the HA viewer.
      const material: Material =
        mirrorMaterial !== undefined && resized.materialName === mirrorMaterial
          ? mirrors.material(authored)
          : authored;
      const mesh = new Mesh(resizedGeometry(resized, false), material);
      mesh.name = `${resized.nodeName}#${String(resized.copyIndex)}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      objectGroup.add(mesh);
      pickables.set(mesh, resized.nodeName);
    }
    const placement = current.metadata.attachment.defaultPlacement;
    const contact = current.metadata.attachment.contact;
    let lift = 0;
    if (contract === "Wallable") {
      lift = (placement?.bottomMm ?? 0) / 1000;
      buildReferenceWall(current, result, lift);
    } else if (contact === "top") {
      lift = overheadReferenceM;
    } else if (contact === "back") {
      lift = (placement?.elevationMm ?? defaultWallMountM * 1000) / 1000;
      buildBackWall(result);
    }
    objectGroup.position.set(0, lift, 0);
    buildBands(current, result);
    syncHighlight();
    onEvent({ type: "resized", ok: true, sizeMm: result.sizeMm });
    if (needsFrame) {
      needsFrame = false;
      frameContent();
    }
    invalidate();
  };

  const load = (url: string, rootMatrix: readonly number[] | undefined): void => {
    loadToken += 1;
    const token = loadToken;
    loadedUrl = url;
    onEvent({ type: "loading", url });
    new GLTFLoader()
      .loadAsync(url)
      .then((loaded) => {
        if (disposed || token !== loadToken) {
          disposeGltf(loaded);
          return;
        }
        if (rootMatrix?.length === 16) {
          const wrapper = new Group();
          wrapper.name = "HomeplanRoot";
          wrapper.matrixAutoUpdate = false;
          wrapper.matrix.fromArray([...rootMatrix]);
          for (const child of [...loaded.scene.children]) wrapper.add(child);
          loaded.scene.add(wrapper);
        }
        if (gltf !== null) disposeGltf(gltf);
        gltf = loaded;
        needsFrame = true;
        rebuild();
      })
      .catch((error: unknown) => {
        if (disposed || token !== loadToken) return;
        onEvent({
          type: "loadError",
          url,
          message: error instanceof Error ? error.message : "The model could not be loaded.",
        });
      });
  };

  const pickAt = (screen: ScreenPoint): string | null => {
    rig.setRay(raycaster, screen);
    const hit = raycaster.intersectObjects([...pickables.keys()], false)[0];
    return hit === undefined ? null : (pickables.get(hit.object) ?? null);
  };

  let downAt: ScreenPoint | null = null;
  const input$ = attachNavigationInput(canvas, rig, {
    navigation: () => navigation,
    // The Object Editor preview has no Pan/Orbit tools: primary drags stay picks.
    primaryDrag: () => null,
    onPrimaryDragStart: () => undefined,
    onCamera: invalidate,
    onPointer: (pointer) => {
      if (pointer.phase === "down" && pointer.button === 0) downAt = pointer.screen;
      if (pointer.phase === "up" && pointer.button === 0 && downAt !== null) {
        const moved = Math.hypot(pointer.screen.x - downAt.x, pointer.screen.y - downAt.y);
        downAt = null;
        if (moved <= clickTolerancePx) onEvent({ type: "pick", nodeName: pickAt(pointer.screen) });
      }
    },
    onDoubleClick: () => {
      frameContent();
      invalidate();
    },
  });

  const resize = (): void => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight), false);
    rig.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
    invalidate();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  return {
    setTemplate: (next) => {
      if (disposed) return;
      input = next;
      if (next.url !== loadedUrl) load(next.url, next.rootMatrix);
      else rebuild();
    },
    setSelectedNode: (nodeName) => {
      if (nodeName === selected) return;
      selected = nodeName;
      syncHighlight();
      invalidate();
    },
    setNavigation: (next) => {
      navigation = next;
    },
    setTheme: (next) => {
      theme = next;
      const palette = helperPalette(theme);
      if (scene.background instanceof Color) scene.background.set(palette.background);
      grid.setPalette(palette);
      highlightMaterial.color.set(palette.selection);
      invalidate();
    },
    frame: () => {
      frameContent();
      invalidate();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (frameHandle !== 0) cancelAnimationFrame(frameHandle);
      resizeObserver.disconnect();
      input$.dispose();
      clearGroup(referenceGroup);
      clearGroup(bandGroup);
      clearGroup(highlightGroup);
      disposeGeometries(objectGroup);
      if (gltf !== null) disposeGltf(gltf);
      grid.dispose();
      lighting.dispose();
      shadowCatcher.geometry.dispose();
      shadowMaterial.dispose();
      wallMaterial.dispose();
      fallbackMaterial.dispose();
      mirrors.dispose();
      highlightMaterial.dispose();
      for (const materials of bandMaterials.values()) {
        materials.fill.dispose();
        materials.edge.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
};
