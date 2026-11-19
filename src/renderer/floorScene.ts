// The active floor's model content: RealFloor and carpets per area, RealAllWalls, floor-shape outlines, and
// selection highlights, updated incrementally by stable ID and input identity. Each area renders inside its
// own group (floor coordinates, identity transform) so preview transforms move everything it owns; other
// layers (lights, template instances) attach to the same groups through areaGroup().
//
// Wall layers. Normally the whole floor renders as one RealAllWalls mesh. While areas are previewed
// (drag transforms) or one area is isolated, those "separate" areas get their own RealAllWalls built from
// a one-area floor, placed inside the area's group so a preview transform moves it, and the remaining areas
// render from a RealAllWalls of the floor without them. This is a deliberate preview approximation: merges
// between a separate area and its neighbours are not shown until the preview ends. One exception (Phase 15.7):
// the isolated area's layer (when not previewed) is also cut by its neighbours' doors and windows that sit in a
// wall it shares (shared/geometry/sharedOpenings.ts), and those openings draw like its own (entityFade,
// contentGroup), so a doorway in a shared wall stays open and its door visible.
//
// Slab (Phase 16.2): the floor's derived slab (shared/geometry/floorSlab.ts) below the finished floor, in the slab
// material, casting and receiving shadows like the walls. It follows the wall layers: one slab for the floor, or,
// while areas are separate, a slab of the remaining areas plus one per separate area inside its group. The floor's
// placement in the house (elevation, offset) is not applied here: the shown floor stays in its local frame.
import type { Material, Object3D } from "three";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
} from "three";
import type { CarpetValue } from "@shared/domain/schemas/carpet";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { WallValue } from "@shared/domain/schemas/wall";
import type { WallBandPiece } from "@shared/geometry/wallBands";
import type { Interval } from "@shared/geometry/interval";
import { composeAffine, invertAffine, placementAffine } from "@shared/geometry/affine";
import { computeAreaFloorGeometry } from "@shared/geometry/areaGeometry";
import type { FloorView } from "@shared/domain/house/visibility";
import {
  buildRealAllWalls,
  buildRealAllWallsWithOpenings,
  faceOfTriangle,
  wallsAtPoint,
} from "@shared/geometry/realAllWalls";
import type { OpeningPrism, OpeningSizeResolver, RealAllWalls } from "@shared/geometry/realAllWallsTypes";
import { openingsInAreaBoundary } from "@shared/geometry/sharedOpenings";
import type { RealFloor } from "@shared/geometry/realFloor";
import { buildRealFloors } from "@shared/geometry/realFloor";
import { isYard } from "@shared/domain/house/yards";
import type { SlabGeometry } from "@shared/geometry/floorSlab";
import { buildFloorSlab } from "@shared/geometry/floorSlab";
import type { FloorCuts } from "@shared/geometry/floorCuts";
import { floorCutsOf, noFloorCuts } from "@shared/geometry/floorCuts";
import { floorSlabOf } from "@shared/domain/house/floorPlacement";
import type { FloorBounds, IndoorRoom, IndoorRooms } from "./floorTypes";
import type { Bounds, Region } from "@shared/geometry/region";
import { regionBounds, regionRings, ringBounds } from "@shared/geometry/region";
import {
  meshToGeometry,
  prismEdgeSegments,
  regionFill,
  regionFillOnPlanes,
  ringPrism,
  ringsToSegments,
} from "./geometryBuffers";
import type { RoofLimit } from "@shared/geometry/roofLimit";
import { floorRoofLimit } from "@shared/geometry/roofLimit";
import { ceilingUnderRoof } from "@shared/geometry/roofCeiling";
import type { HelperPalette } from "./helperPalette";
import type { MaterialCache } from "./materialCache";
import { worldToPlan } from "./planFrame";
import { carpetGeometry } from "./carpetGeometry";
import type { PickResolver, PickTargets } from "./pickables";
import type { AreaIsolation, AreaPreviewTransform, ViewportSelection } from "./runtimeTypes";
import { detachAndDisposeGeometries, markAsHelper } from "./sceneObjects";
import type { FadeLevel } from "./surfaceMaterialKey";
import { carpetVariant, strongerFade } from "./surfaceMaterialKey";

type WallLayer = {
  readonly key: string;
  source: BuildingFloorValue | AreaValue;
  readonly walls: RealAllWalls;
  readonly mesh: Mesh;
  /** Walls off (Phase 4.5): the walls' floor-level footprint as a flat trace beside the mesh. */
  readonly trace: Group;
  fade: FadeLevel;
  /** False when isolation hides this layer (other rooms hidden). */
  shown: boolean;
};

/** A drawn slab: the whole floor's, the remaining areas', or one separate area's (keys as the wall layers). */
type SlabLayer = {
  readonly key: string;
  source: BuildingFloorValue | AreaValue;
  readonly thicknessMm: number;
  /** The floor cuts' signature the slab was built with (Phase 16.14). */
  readonly cutsSignature: string;
  readonly slab: SlabGeometry | null;
  /** Null when the slab has no coverage (no areas) or no thickness. */
  readonly mesh: Mesh | null;
  fade: FadeLevel;
};

type AreaEntry = {
  area: AreaValue;
  readonly group: Group;
  realFloor: RealFloor | null;
  floorMesh: Mesh | null;
  outline: LineSegments | null;
  highlight: Group | null;
  highlightKey: string;
  preview: AreaPreviewTransform | null;
  carpets: CarpetEntry[];
  /** The room's invisible, shadow-only ceiling (Phase 15.5), or null for rooms without full-height walls. */
  ceiling: Mesh | null;
  /** The ceiling's outline (floor frame) and height, for the indoor sky rules (skyShading.ts). */
  ceilingOutline: Region | null;
  ceilingMm: number;
  /** The cutting roof the ceiling was kept under (Phase 19.3), or null. */
  ceilingRoof: RoofLimit | null;
};

type CarpetEntry = Readonly<{ carpet: CarpetValue; mesh: Mesh }>;

export type { FloorBounds, IndoorRoom, IndoorRooms };
export type FloorSceneSync = Readonly<{ floorChanged: boolean; found: boolean }>;

/**
 * Show hidden (Phase 7.5): what of the synced floor is drawn ghosted. The synced floor already lacks what is not
 * drawn at all (shared/domain/house/visibility.ts); its ghosted walls are drawn as one faded layer of their own.
 */
export type FloorGhosts = Readonly<Pick<FloorView, "solidFloor" | "ghostWalls" | "ghostIds">>;

export type WallLayerView = Readonly<{ mesh: Mesh; walls: RealAllWalls }>;

/** A room under a shown shadow-only ceiling (indoors for the sky rules, skyShading.ts): floor frame, mm. */

export type FloorScene = Readonly<{
  root: Group;
  sync: (
    house: HouseDocument,
    floorId: string,
    openingSize: OpeningSizeResolver,
    ghosts?: FloorGhosts,
  ) => FloorSceneSync;
  setSelection: (selection: ViewportSelection) => void;
  setIsolation: (isolation: AreaIsolation | null) => void;
  isolation: () => AreaIsolation | null;
  /** Walls off draws every wall as a flat trace on the floor instead of its 3D mesh (a viewport aid). */
  setWallsVisible: (visible: boolean) => void;
  wallsVisible: () => boolean;
  setPreview: (areaId: string, transform: AreaPreviewTransform | null) => void;
  setPalette: (palette: HelperPalette) => void;
  /** Assigns surface materials; call between MaterialCache.begin() and sweep(). */
  applyMaterials: () => void;
  bounds: () => FloorBounds | null;
  pickTargets: () => PickTargets;
  areaGroup: (areaId: string) => Group | null;
  /**
   * Phase 15.5 sky light: the rooms with a shown shadow-only ceiling (none with Walls off). Same object until
   * a ceiling changes.
   */
  indoorRooms: () => IndoorRooms;
  /** How isolation fades an area's walls and objects. */
  contentFade: (areaId: string) => FadeLevel;
  /**
   * How isolation fades one entity (object, opening, staircase, light) of an area: `contentFade`, except that a
   * neighbour's door or window in a wall the isolated area shares fades like the isolated area's own content
   * (and with that area's wall there under `setWallFade`), Phase 15.7.
   */
  entityFade: (areaId: string, entityId: string) => FadeLevel;
  /**
   * The group an entity's instance attaches to: its area's group, except that with other areas hidden a shared
   * opening (see `entityFade`) attaches to the isolated area's group so it stays drawn.
   */
  contentGroup: (areaId: string, entityId: string) => Group | null;
  /** False for other areas while a locked isolation (editor session) is active. */
  isPickable: (areaId: string) => boolean;
  /** Bounds of one area's RealFloor (floor mm), for framing. */
  areaBounds: (areaId: string) => Bounds | null;
  /** The drawn RealAllWalls layers and their meshes (the HA viewer's picking, cutaway, and focus). */
  wallLayers: () => readonly WallLayerView[];
  /**
   * An extra fade per wall on top of isolation (the HA viewer's cutaway fades a room's walls between the camera and
   * the room), or null for none. A layer's caps take the strongest fade of its walls. Applied by applyMaterials().
   */
  setWallFade: (fadeOf: ((wallId: string) => FadeLevel) | null) => void;
  dispose: () => void;
}>;

/** Bottom and top outlines of a curved band piece plus vertical lines at its end faces. */
const arcOutlineSegments = (piece: WallBandPiece, heightMm: number, span: Interval): BufferGeometry => {
  const coordinates: number[] = [];
  const ringLines = (h: number): void => {
    piece.ring.forEach((point, index) => {
      const next = piece.ring[(index + 1) % piece.ring.length];
      if (next !== undefined) coordinates.push(point.x, point.y, h, next.x, next.y, h);
    });
  };
  ringLines(0);
  ringLines(heightMm);
  // End faces in order: the piece's far end, then its near end; internal quarter-turn joints are skipped.
  const ends = piece.faces.filter((face) => face.ref.side === "end");
  const isWallEnd = [Math.abs(piece.toMm - span.toMm) < 0.5, Math.abs(piece.fromMm - span.fromMm) < 0.5];
  ends.forEach((face, index) => {
    if (isWallEnd[index] !== true) return;
    for (const point of [face.start, face.end])
      coordinates.push(point.x, point.y, 0, point.x, point.y, heightMm);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(coordinates, 3));
  return geometry;
};

const outlineLiftMm = 2;
const highlightLiftMm = 3;
/** Wall traces (walls off) sit just above the floor and its outline. */
const traceLiftMm = 2.5;

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const sameIsolation = (a: AreaIsolation | null, b: AreaIsolation | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.areaId === b.areaId &&
    a.others === b.others &&
    a.fadeOwnContent === b.fadeOwnContent &&
    a.othersLocked === b.othersLocked);

const unionBounds = (a: Bounds | null, b: Bounds): Bounds =>
  a === null
    ? b
    : {
        minX: Math.min(a.minX, b.minX),
        minY: Math.min(a.minY, b.minY),
        maxX: Math.max(a.maxX, b.maxX),
        maxY: Math.max(a.maxY, b.maxY),
      };

const previewMatrix = (area: AreaValue, transform: AreaPreviewTransform): Matrix4 => {
  const m = composeAffine(
    placementAffine(transform.positionMm, transform.rotationDeg),
    invertAffine(placementAffine(area.positionMm, area.rotationDeg)),
  );
  return new Matrix4().set(m.a, m.c, 0, m.tx, m.b, m.d, 0, m.ty, 0, 0, 1, 0, 0, 0, 0, 1);
};

/** The RealAllWalls meshes of every floor scene (a linear light measures what its facing hits, Phase 13.3). */
const wallMeshes = new WeakSet<Object3D>();
export const isWallMesh = (object: Object3D): object is Mesh => wallMeshes.has(object);

/**
 * Shadow-only ceilings (Phase 15.5, owner 2026-11-18): Homeplan draws no ceilings, so the sun shone over every wall
 * top onto the floors. Each room with walls at least `ceilingMinWallMm` high gets its floor outline at its tallest
 * wall's height, never drawn (no colour, no depth) but casting shadows, so sunlight reaches a room only through its
 * windows and doors. Never picked, hidden with Walls off, and left out of the render-scene export.
 */
const ceilingMinWallMm = 2000;
const ceilingMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: DoubleSide });
const shadowOnlyMeshes = new WeakSet<Object3D>();
/** Whether `object` is a shadow-only ceiling (exports leave it out). */
export const isShadowOnly = (object: Object3D): boolean => shadowOnlyMeshes.has(object);
const notPickable = (): void => undefined;

export const createFloorScene = (materials: MaterialCache, initialPalette: HelperPalette): FloorScene => {
  const root = new Group();
  root.name = "floorScene";
  const outlineMaterial = new LineBasicMaterial({
    color: initialPalette.outline,
    transparent: true,
    opacity: 0.55,
    toneMapped: false,
  });
  const highlightFill = new MeshBasicMaterial({
    color: initialPalette.selection,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
  });
  const traceFill = new MeshBasicMaterial({
    color: initialPalette.outline,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    toneMapped: false,
  });
  const traceLine = new LineBasicMaterial({
    color: initialPalette.outline,
    transparent: true,
    opacity: 0.95,
    toneMapped: false,
  });
  const highlightLine = new LineBasicMaterial({
    color: initialPalette.selection,
    depthTest: false,
    transparent: true,
    opacity: 1,
    toneMapped: false,
  });

  let house: HouseDocument | null = null;
  let floor: BuildingFloorValue | null = null;
  let floorId: string | null = null;
  let resolver: OpeningSizeResolver | null = null;
  /** The shown floor's cuts by stairs and floor openings of the whole house (Phase 16.14). */
  let cuts: FloorCuts = noFloorCuts;
  let wallById = new Map<string, WallValue>();
  const areas = new Map<string, AreaEntry>();
  const layers = new Map<string, WallLayer>();
  const slabs = new Map<string, SlabLayer>();
  let selection: ViewportSelection = { wallIds: [], areaIds: [] };
  let isolation: AreaIsolation | null = null;
  let wallsOn = true;
  /** Bumped whenever a ceiling or Walls on/off changes (indoorRooms). */
  let indoorVersion = 0;
  let indoorCache: IndoorRooms = { version: -1, rooms: [] };
  let cachedBounds: FloorBounds | null = null;
  let ghosts: FloorGhosts | null = null;
  let wallFade: ((wallId: string) => FadeLevel) | null = null;
  /** The isolated area's shared openings (neighbours' openings in its walls) → its own wall there, or null. */
  let sharedOpenings: ReadonlyMap<string, string | null> = new Map();
  const ghosted = (id: string): boolean => ghosts?.ghostIds.has(id) === true;
  const ghostFade = (fade: FadeLevel, id: string): FadeLevel =>
    ghosted(id) ? strongerFade(fade, "faded") : fade;

  // ---- isolation ---------------------------------------------------------------------------------

  const isOther = (areaId: string): boolean => isolation !== null && areaId !== isolation.areaId;

  /** Floors and carpets: other areas dimmed, the focused area's floor stays clear. */
  const surfaceFade = (areaId: string): FadeLevel => (isOther(areaId) ? "dimmed" : "normal");

  /** Walls and objects: other areas dimmed; in Area Editor the focused area's own content faded. */
  const contentFade = (areaId: string): FadeLevel =>
    isolation === null
      ? "normal"
      : areaId !== isolation.areaId
        ? "dimmed"
        : isolation.fadeOwnContent
          ? "faded"
          : "normal";

  const entityFade = (areaId: string, entityId: string): FadeLevel => {
    const shared = sharedOpenings.get(entityId);
    if (isolation === null || shared === undefined) return contentFade(areaId);
    const own = contentFade(isolation.areaId);
    return shared === null || wallFade === null ? own : strongerFade(own, wallFade(shared));
  };

  const isPickable = (areaId: string): boolean => !(isolation?.othersLocked === true && isOther(areaId));

  const applyVisibility = (entry: AreaEntry): void => {
    entry.group.visible = !(isolation?.others === "hidden" && isOther(entry.area.id));
  };

  // ---- wall layers -------------------------------------------------------------------------------

  const separateAreaIds = (): string[] => {
    const ids = [...areas.values()].filter((entry) => entry.preview !== null).map((entry) => entry.area.id);
    if (isolation !== null && areas.has(isolation.areaId) && !ids.includes(isolation.areaId))
      ids.push(isolation.areaId);
    return ids.sort();
  };

  const disposeLayer = (layer: WallLayer): void => {
    detachAndDisposeGeometries(layer.mesh);
    detachAndDisposeGeometries(layer.trace);
  };

  /** The walls' footprint at floor level (door gaps cut), filled and outlined. */
  const createTrace = (walls: RealAllWalls): Group => {
    const trace = new Group();
    trace.name = "wallTrace";
    const footprint = walls.slices[0]?.footprint;
    if (footprint !== undefined && footprint.polygons.length > 0) {
      trace.add(new Mesh(regionFill(footprint, traceLiftMm), traceFill));
      trace.add(new LineSegments(ringsToSegments(regionRings(footprint), traceLiftMm), traceLine));
    }
    markAsHelper(trace);
    trace.visible = false;
    return trace;
  };

  /** Walls on: the meshes; walls off: the traces (both respect isolation hiding). */
  const applyWallsVisibility = (): void => {
    for (const layer of layers.values()) {
      layer.mesh.visible = wallsOn && layer.shown;
      layer.trace.visible = !wallsOn && layer.shown;
    }
    for (const entry of areas.values()) if (entry.ceiling !== null) entry.ceiling.visible = wallsOn;
  };

  const createLayer = (
    key: string,
    source: BuildingFloorValue | AreaValue,
    walls: RealAllWalls,
  ): WallLayer => {
    const geometry = meshToGeometry(walls.mesh);
    walls.mesh.groups.forEach((group, index) => {
      geometry.addGroup(group.start, group.count, index);
    });
    const mesh = new Mesh(geometry, []);
    mesh.name = key;
    wallMeshes.add(mesh);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return { key, source, walls, mesh, trace: createTrace(walls), fade: "normal", shown: true };
  };

  const ensureLayer = (
    key: string,
    source: BuildingFloorValue | AreaValue,
    build: () => RealAllWalls,
    parent: Group,
  ): WallLayer => {
    const existing = layers.get(key);
    if (existing?.source === source) {
      if (existing.mesh.parent !== parent) parent.add(existing.mesh, existing.trace);
      return existing;
    }
    const walls = build();
    if (existing?.walls === walls) {
      existing.source = source;
      if (existing.mesh.parent !== parent) parent.add(existing.mesh, existing.trace);
      return existing;
    }
    if (existing !== undefined) disposeLayer(existing);
    const layer = createLayer(key, source, walls);
    layers.set(key, layer);
    parent.add(layer.mesh, layer.trace);
    return layer;
  };

  // ---- slab --------------------------------------------------------------------------------------

  const disposeSlab = (slab: SlabLayer): void => {
    if (slab.mesh !== null) detachAndDisposeGeometries(slab.mesh);
  };

  const ensureSlab = (
    key: string,
    source: BuildingFloorValue | AreaValue,
    slabFloor: () => BuildingFloorValue,
    thicknessMm: number,
    parent: Group,
  ): SlabLayer => {
    const existing = slabs.get(key);
    const reuse = (layer: SlabLayer): SlabLayer => {
      layer.source = source;
      if (layer.mesh !== null && layer.mesh.parent !== parent) parent.add(layer.mesh);
      return layer;
    };
    if (
      existing?.source === source &&
      existing.thicknessMm === thicknessMm &&
      existing.cutsSignature === cuts.signature
    )
      return reuse(existing);
    // buildFloorSlab is memoized by the areas, the thickness and the cuts: an unrelated floor edit keeps the mesh.
    const slab = buildFloorSlab(slabFloor(), cuts);
    if (existing?.slab === slab && existing.cutsSignature === cuts.signature) return reuse(existing);
    if (existing !== undefined) disposeSlab(existing);
    const mesh = slab === null ? null : new Mesh(meshToGeometry(slab.mesh), []);
    if (mesh !== null) {
      mesh.name = `slab:${key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    const layer: SlabLayer = {
      key,
      source,
      thicknessMm,
      cutsSignature: cuts.signature,
      slab,
      mesh,
      fade: "normal",
    };
    slabs.set(key, layer);
    return layer;
  };

  /** The slab layers for the same split as the wall layers (`separate`: previewed or isolated areas). */
  const syncSlabs = (currentFloor: BuildingFloorValue, separate: readonly string[]): void => {
    const thicknessMm = floorSlabOf(currentFloor).thicknessMm;
    const wanted = new Set<string>();
    if (separate.length === 0) {
      wanted.add("floor");
      ensureSlab("floor", currentFloor, () => currentFloor, thicknessMm, root).fade = "normal";
    } else {
      const restKey = `rest:${separate.join(",")}`;
      wanted.add(restKey);
      const rest = ensureSlab(
        restKey,
        currentFloor,
        () => ({ ...currentFloor, areas: currentFloor.areas.filter((area) => !separate.includes(area.id)) }),
        thicknessMm,
        root,
      );
      rest.fade = isolation === null ? "normal" : "dimmed";
      if (rest.mesh !== null) rest.mesh.visible = isolation?.others !== "hidden";
      for (const areaId of separate) {
        const entry = areas.get(areaId);
        if (entry === undefined) continue;
        const area = currentFloor.areas.find((candidate) => candidate.id === areaId) ?? entry.area;
        const key = `own:${areaId}`;
        wanted.add(key);
        ensureSlab(key, area, () => ({ ...currentFloor, areas: [area] }), thicknessMm, entry.group).fade =
          surfaceFade(areaId);
      }
    }
    for (const [key, slab] of slabs) {
      if (wanted.has(key)) continue;
      disposeSlab(slab);
      slabs.delete(key);
    }
  };

  const syncLayers = (): void => {
    if (floor === null || resolver === null) return;
    // Ghosted walls (Show hidden) leave the solid layers and are drawn in a faded layer of their own.
    const currentFloor = ghosts?.solidFloor ?? floor;
    const currentResolver = resolver;
    const separate = separateAreaIds();
    syncSlabs(currentFloor, separate);
    const wanted = new Set<string>();
    // Phase 15.7: the isolated area's neighbours' openings in its shared walls (none while it is previewed).
    const isolatedArea =
      isolation === null || areas.get(isolation.areaId)?.preview !== null
        ? undefined
        : currentFloor.areas.find((area) => area.id === isolation?.areaId);
    const wholeFloor = isolatedArea === undefined ? null : buildRealAllWalls(currentFloor, currentResolver);
    sharedOpenings =
      isolatedArea === undefined || wholeFloor === null
        ? new Map()
        : openingsInAreaBoundary(wholeFloor, isolatedArea);
    const sharedCuts: readonly OpeningPrism[] = (wholeFloor?.openings ?? []).filter((prism) =>
      sharedOpenings.has(prism.openingId),
    );
    if (separate.length === 0) {
      wanted.add("floor");
      const all = ensureLayer(
        "floor",
        currentFloor,
        () => buildRealAllWalls(currentFloor, currentResolver),
        root,
      );
      all.fade = "normal";
      all.shown = true;
    } else {
      const restKey = `rest:${separate.join(",")}`;
      wanted.add(restKey);
      const rest = ensureLayer(
        restKey,
        currentFloor,
        () =>
          buildRealAllWalls(
            { ...currentFloor, areas: currentFloor.areas.filter((area) => !separate.includes(area.id)) },
            currentResolver,
          ),
        root,
      );
      rest.fade = isolation === null ? "normal" : "dimmed";
      rest.shown = isolation?.others !== "hidden";
      for (const areaId of separate) {
        const entry = areas.get(areaId);
        if (entry === undefined) continue;
        const area = currentFloor.areas.find((candidate) => candidate.id === areaId) ?? entry.area;
        const key = `own:${areaId}`;
        wanted.add(key);
        const cuts = areaId === isolatedArea?.id ? sharedCuts : [];
        // With shared cuts the layer depends on the neighbours too: it follows the whole floor.
        const own = ensureLayer(
          key,
          cuts.length === 0 ? area : currentFloor,
          () =>
            cuts.length === 0
              ? buildRealAllWalls({ ...currentFloor, areas: [area] }, currentResolver)
              : buildRealAllWallsWithOpenings({ ...currentFloor, areas: [area] }, currentResolver, cuts),
          entry.group,
        );
        own.fade = contentFade(areaId);
        own.shown = true;
      }
    }
    const ghostWalls = ghosts?.ghostWalls ?? null;
    if (ghostWalls !== null) {
      wanted.add("ghost");
      const ghostLayer = ensureLayer(
        "ghost",
        ghostWalls,
        () => buildRealAllWalls(ghostWalls, currentResolver),
        root,
      );
      ghostLayer.fade = isolation === null ? "faded" : "dimmed";
      ghostLayer.shown = isolation?.others !== "hidden";
    }
    for (const [key, layer] of layers) {
      if (wanted.has(key)) continue;
      disposeLayer(layer);
      layers.delete(key);
    }
    applyWallsVisibility();
  };

  // ---- areas -------------------------------------------------------------------------------------

  const removeArea = (entry: AreaEntry): void => {
    if (entry.ceiling !== null) indoorVersion += 1;
    entry.group.removeFromParent();
    for (const child of [...entry.group.children]) detachAndDisposeGeometries(child);
  };

  const applyGroupTransform = (entry: AreaEntry): void => {
    const matrix = entry.preview === null ? new Matrix4() : previewMatrix(entry.area, entry.preview);
    entry.group.matrix.copy(matrix);
    entry.group.matrixWorldNeedsUpdate = true;
  };

  /** realFloor: from buildRealFloors (the floor's cuts by stairs and floor openings subtracted). */
  const syncArea = (area: AreaValue, realFloor: RealFloor | null, roofLimit: RoofLimit | null): void => {
    const existing = areas.get(area.id);
    const entry: AreaEntry = existing ?? {
      area,
      group: new Group(),
      realFloor: null,
      floorMesh: null,
      outline: null,
      highlight: null,
      highlightKey: "",
      preview: null,
      carpets: [],
      ceiling: null,
      ceilingOutline: null,
      ceilingMm: 0,
      ceilingRoof: null,
    };
    if (existing === undefined) {
      entry.group.name = `area:${area.id}`;
      entry.group.matrixAutoUpdate = false;
      areas.set(area.id, entry);
      root.add(entry.group);
    }
    const changed =
      existing?.area !== area || existing.realFloor !== realFloor || existing.ceilingRoof !== roofLimit;
    entry.area = area;
    if (!changed) return;
    if (realFloor !== entry.realFloor || entry.floorMesh === null) {
      if (entry.floorMesh !== null) detachAndDisposeGeometries(entry.floorMesh);
      entry.floorMesh = null;
      entry.realFloor = realFloor;
      if (realFloor !== null && realFloor.region.polygons.length > 0) {
        const mesh = new Mesh(meshToGeometry(realFloor.mesh), []);
        mesh.name = `floor:${area.id}`;
        mesh.receiveShadow = true;
        entry.group.add(mesh);
        entry.floorMesh = mesh;
      }
    }
    if (entry.ceiling !== null) detachAndDisposeGeometries(entry.ceiling);
    entry.ceiling = null;
    entry.ceilingOutline = null;
    entry.ceilingRoof = roofLimit;
    indoorVersion += 1;
    const ceilingMm = Math.max(0, ...area.walls.map((wall) => wall.heightMm));
    // The room's whole outline, not its RealFloor: a floor cut by a stair has a hole, and the sun came down it.
    const roomOutline = computeAreaFloorGeometry(area).floorShape;
    // A yard (Phase 17.2) is outdoors: no ceiling, so it is never indoors for the sky rules.
    if (!isYard(area) && ceilingMm >= ceilingMinWallMm && roomOutline.polygons.length > 0) {
      // Under a cutting roof the ceiling stays under the underside (Phase 19.3): a flat ceiling poking up through
      // the slopes shaded the roof's own top (roofCeiling.ts).
      const ceiling = new Mesh(
        roofLimit === null
          ? regionFill(roomOutline, ceilingMm)
          : regionFillOnPlanes(ceilingUnderRoof(roomOutline, ceilingMm, roofLimit)),
        ceilingMaterial,
      );
      ceiling.name = `ceiling:${area.id}`;
      ceiling.castShadow = true;
      ceiling.receiveShadow = false;
      ceiling.raycast = notPickable;
      ceiling.visible = wallsOn;
      shadowOnlyMeshes.add(ceiling);
      entry.group.add(ceiling);
      entry.ceiling = ceiling;
      entry.ceilingOutline = roomOutline;
      entry.ceilingMm = ceilingMm;
    }
    for (const carpet of entry.carpets) detachAndDisposeGeometries(carpet.mesh);
    entry.carpets = [];
    const floorRegion = realFloor?.region;
    if (floorRegion !== undefined)
      area.floor.carpets.forEach((carpet, stackIndex) => {
        const geometry = carpetGeometry(area, carpet, floorRegion, stackIndex);
        if (geometry === null) return;
        const mesh = new Mesh(geometry, []);
        mesh.name = `carpet:${carpet.id}`;
        mesh.receiveShadow = true;
        mesh.renderOrder = 1 + stackIndex;
        entry.group.add(mesh);
        entry.carpets.push({ carpet, mesh });
      });
    if (entry.outline !== null) detachAndDisposeGeometries(entry.outline);
    const outline = new LineSegments(
      ringsToSegments(regionRings(computeAreaFloorGeometry(area).floorShape), outlineLiftMm),
      outlineMaterial,
    );
    outline.name = `outline:${area.id}`;
    markAsHelper(outline);
    entry.group.add(outline);
    entry.outline = outline;
    entry.highlightKey = "";
    applyGroupTransform(entry);
    applyVisibility(entry);
  };

  // ---- selection highlights ----------------------------------------------------------------------

  const syncHighlight = (entry: AreaEntry): void => {
    const areaSelected = selection.areaIds.includes(entry.area.id);
    const wallIds = entry.area.walls.map((wall) => wall.id).filter((id) => selection.wallIds.includes(id));
    const key = `${areaSelected ? "area" : ""}|${wallIds.join(",")}|${wallsOn ? "walls" : "traces"}`;
    if (key === entry.highlightKey) return;
    entry.highlightKey = key;
    if (entry.highlight !== null) detachAndDisposeGeometries(entry.highlight);
    entry.highlight = null;
    if (!areaSelected && wallIds.length === 0) return;
    const highlight = new Group();
    highlight.name = `highlight:${entry.area.id}`;
    if (areaSelected && entry.realFloor !== null) {
      highlight.add(new Mesh(regionFill(entry.realFloor.region, highlightLiftMm), highlightFill));
      highlight.add(
        new LineSegments(
          ringsToSegments(regionRings(entry.realFloor.region), highlightLiftMm),
          highlightLine,
        ),
      );
    }
    const geometry = computeAreaFloorGeometry(entry.area);
    for (const wall of geometry.realWalls) {
      if (!wallIds.includes(wall.wallId)) continue;
      for (const piece of wall.pieces) {
        if (!wallsOn) {
          // Walls off: the selected wall highlights as its flat trace.
          const footprint = { polygons: [{ outer: piece.ring, holes: [] }] };
          highlight.add(new Mesh(regionFill(footprint, highlightLiftMm), highlightFill));
          highlight.add(new LineSegments(ringsToSegments([piece.ring], highlightLiftMm), highlightLine));
          continue;
        }
        highlight.add(new Mesh(ringPrism(piece.ring, 0, wall.heightMm), highlightFill));
        // Curved walls: outline at the bottom and top plus the end lines, not every facet.
        highlight.add(
          new LineSegments(
            wall.arc === null
              ? prismEdgeSegments(piece.ring, 0, wall.heightMm)
              : arcOutlineSegments(piece, wall.heightMm, wall.spanMm),
            highlightLine,
          ),
        );
      }
    }
    markAsHelper(highlight);
    highlight.renderOrder = 10;
    entry.group.add(highlight);
    entry.highlight = highlight;
  };

  // ---- materials ---------------------------------------------------------------------------------

  const applyMaterials = (): void => {
    if (house === null) return;
    const capMaterial = house.capMaterial;
    for (const entry of areas.values()) {
      const fade = ghostFade(surfaceFade(entry.area.id), entry.area.id);
      for (const carpet of entry.carpets)
        carpet.mesh.material = materials.get(
          carpet.carpet.material,
          carpetVariant(ghostFade(fade, carpet.carpet.id)),
        );
      if (entry.floorMesh === null) continue;
      entry.floorMesh.material = materials.get(entry.area.floor.material, fade);
    }
    // The slab material on the slab's edges, underside and exposed top (Phase 16.2).
    const slabMaterial = floor === null ? capMaterial : floorSlabOf(floor).material;
    for (const slab of slabs.values()) {
      if (slab.mesh === null) continue;
      slab.mesh.material = materials.get(slabMaterial, slab.fade);
      slab.mesh.castShadow = slab.fade === "normal";
    }
    for (const layer of layers.values()) {
      const layerFade = layer.fade;
      layer.mesh.castShadow = layer.fade === "normal";
      const fadeOf = wallFade;
      const capFade =
        fadeOf === null
          ? layerFade
          : layer.walls.bands.reduce((fade, band) => strongerFade(fade, fadeOf(band.wallId)), layerFade);
      layer.mesh.material = layer.walls.mesh.groups.map((group): Material => {
        if (group.material.kind === "cap") return materials.get(capMaterial, capFade);
        const variant = fadeOf === null ? layerFade : strongerFade(layerFade, fadeOf(group.material.wallId));
        const wall = wallById.get(group.material.wallId);
        // A box's or niche's sides use the relief's own material (Phase 5.0).
        const { reliefId } = group.material;
        const relief =
          reliefId === undefined ? undefined : wall?.reliefs?.find((candidate) => candidate.id === reliefId);
        return materials.get(
          relief?.material ?? (wall === undefined ? capMaterial : wall.materials[group.material.side]),
          reliefId === undefined ? variant : ghostFade(variant, reliefId),
        );
      });
    }
  };

  const computeBounds = (): FloorBounds | null => {
    let bounds: Bounds | null = null;
    let maxHeightMm = 0;
    for (const entry of areas.values()) {
      if (entry.realFloor !== null && entry.realFloor.region.polygons.length > 0)
        bounds = unionBounds(bounds, regionBounds(entry.realFloor.region));
    }
    for (const layer of layers.values()) {
      for (const band of layer.walls.bands) {
        bounds = unionBounds(bounds, ringBounds(band.ring));
        maxHeightMm = Math.max(maxHeightMm, band.heightMm);
      }
    }
    return bounds === null ? null : { ...bounds, maxHeightMm };
  };

  const clear = (): void => {
    for (const entry of areas.values()) removeArea(entry);
    areas.clear();
    for (const layer of layers.values()) disposeLayer(layer);
    layers.clear();
    for (const slab of slabs.values()) disposeSlab(slab);
    slabs.clear();
    floor = null;
    cachedBounds = null;
  };

  const preferredWall = (candidates: readonly string[]): string | undefined => {
    const preferred = [...selection.wallIds, ...(selection.preferredWallIds ?? [])];
    return candidates.find((id) => preferred.includes(id)) ?? candidates[0];
  };

  return {
    root,
    sync: (nextHouse, nextFloorId, openingSize, nextGhosts) => {
      const nextFloor = nextHouse.floors.find((candidate) => candidate.id === nextFloorId) ?? null;
      const floorChanged = floorId !== nextFloorId || house?.id !== nextHouse.id;
      if (floorChanged || resolver !== openingSize) clear();
      house = nextHouse;
      floorId = nextFloorId;
      resolver = openingSize;
      if (nextFloor === null) {
        clear();
        return { floorChanged, found: false };
      }
      const ghostsChanged = (nextGhosts ?? null) !== ghosts;
      ghosts = nextGhosts ?? null;
      // Stairs and floor openings anywhere in the house cut this floor (Phase 16.14): a changed cut rebuilds the
      // floor's surfaces and slab even when the floor itself is unchanged.
      const nextCuts = floorCutsOf(nextHouse, nextFloorId);
      const cutsChanged = nextCuts.signature !== cuts.signature;
      cuts = nextCuts;
      if (nextFloor !== floor || ghostsChanged || cutsChanged) {
        floor = nextFloor;
        wallById = new Map(
          nextFloor.areas.flatMap((area) => area.walls.map((wall): [string, WallValue] => [wall.id, wall])),
        );
        const ids = new Set(nextFloor.areas.map((area) => area.id));
        for (const [id, entry] of areas) {
          if (ids.has(id)) continue;
          removeArea(entry);
          areas.delete(id);
        }
        const realFloors = buildRealFloors(nextFloor, cuts);
        const roofLimit = floorRoofLimit(nextFloor);
        for (const area of nextFloor.areas) syncArea(area, realFloors.get(area.id) ?? null, roofLimit);
        syncLayers();
        for (const entry of areas.values()) syncHighlight(entry);
        cachedBounds = computeBounds();
      }
      return { floorChanged, found: true };
    },
    setSelection: (next) => {
      if (
        sameIds(next.wallIds, selection.wallIds) &&
        sameIds(next.areaIds, selection.areaIds) &&
        sameIds(next.preferredWallIds ?? [], selection.preferredWallIds ?? [])
      )
        return;
      selection = {
        wallIds: [...next.wallIds],
        areaIds: [...next.areaIds],
        preferredWallIds: [...(next.preferredWallIds ?? [])],
      };
      for (const entry of areas.values()) syncHighlight(entry);
    },
    isolation: () => isolation,
    wallsVisible: () => wallsOn,
    setWallsVisible: (visible) => {
      if (visible === wallsOn) return;
      indoorVersion += 1;
      wallsOn = visible;
      applyWallsVisibility();
      for (const entry of areas.values()) syncHighlight(entry);
    },
    setIsolation: (next) => {
      if (sameIsolation(next, isolation)) return;
      isolation = next;
      syncLayers();
      for (const entry of areas.values()) applyVisibility(entry);
    },
    setPreview: (areaId, transform) => {
      const entry = areas.get(areaId);
      if (entry === undefined) return;
      const wasSeparate = entry.preview !== null;
      entry.preview = transform;
      applyGroupTransform(entry);
      if (wasSeparate !== (transform !== null)) syncLayers();
    },
    setPalette: (palette) => {
      outlineMaterial.color.set(palette.outline);
      traceFill.color.set(palette.outline);
      traceLine.color.set(palette.outline);
      highlightFill.color.set(palette.selection);
      highlightLine.color.set(palette.selection);
    },
    bounds: () => cachedBounds,
    areaBounds: (areaId) => {
      const region = areas.get(areaId)?.realFloor?.region;
      return region === undefined || region.polygons.length === 0 ? null : regionBounds(region);
    },
    applyMaterials,
    wallLayers: () =>
      [...layers.values()]
        .filter((layer) => layer.mesh.parent !== null && layer.mesh.visible)
        .map((layer) => ({ mesh: layer.mesh, walls: layer.walls })),
    setWallFade: (fadeOf) => {
      wallFade = fadeOf;
    },
    contentFade,
    entityFade,
    contentGroup: (areaId, entityId) => {
      const isolatedId =
        isolation?.others === "hidden" && sharedOpenings.has(entityId) ? isolation.areaId : areaId;
      return areas.get(isolatedId)?.group ?? null;
    },
    isPickable,
    areaGroup: (areaId) => areas.get(areaId)?.group ?? null,
    indoorRooms: () => {
      if (indoorCache.version === indoorVersion) return indoorCache;
      const rooms: IndoorRoom[] = [];
      if (wallsOn)
        for (const entry of areas.values())
          if (entry.ceilingOutline !== null)
            rooms.push({ areaId: entry.area.id, outline: entry.ceilingOutline, ceilingMm: entry.ceilingMm });
      indoorCache = { version: indoorVersion, rooms };
      return indoorCache;
    },
    pickTargets: () => {
      const targets = new Map<Object3D, PickResolver>();
      for (const layer of layers.values()) {
        if (layer.mesh.parent === null) continue;
        const mesh = layer.mesh;
        targets.set(mesh, (hit) => {
          const pointMm = worldToPlan(hit.point);
          if (hit.faceIndex === undefined || hit.faceIndex === null) return null;
          const face = faceOfTriangle(layer.walls, hit.faceIndex);
          if (face !== null)
            return {
              kind: "wall",
              wallId: face.wallId,
              areaId: face.areaId,
              side: face.side,
              pointMm,
              ...(face.reliefId === undefined ? {} : { reliefId: face.reliefId }),
            };
          const local = mesh.worldToLocal(hit.point.clone());
          const wallId = preferredWall(wallsAtPoint(layer.walls, { x: local.x, y: local.y }, local.z - 1));
          const band = layer.walls.bands.find((candidate) => candidate.wallId === wallId);
          return wallId !== undefined && band !== undefined
            ? { kind: "wall", wallId, areaId: band.areaId, side: "top", pointMm }
            : null;
        });
      }
      for (const entry of areas.values()) {
        const areaId = entry.area.id;
        if (entry.floorMesh !== null)
          targets.set(entry.floorMesh, (hit) => ({ kind: "floor", areaId, pointMm: worldToPlan(hit.point) }));
        for (const { carpet, mesh } of entry.carpets)
          targets.set(mesh, (hit) => ({
            kind: "carpet",
            carpetId: carpet.id,
            areaId,
            pointMm: worldToPlan(hit.point),
          }));
      }
      return targets;
    },
    dispose: () => {
      clear();
      outlineMaterial.dispose();
      highlightFill.dispose();
      highlightLine.dispose();
      root.removeFromParent();
    },
  };
};
