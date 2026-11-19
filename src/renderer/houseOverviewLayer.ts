// The builder's whole-house overview (Phase 16.4, owner 2026-11-18; spec/architecture/renderer.md#builder-house-overview):
// every floor of the house stacked at its placement, each floor one FloorScene (room floors, carpets, RealAllWalls,
// slab) plus one instance layer with everything the floor holds (Phase 18.1, owner: the whole house shows every
// floor complete; 16.4 drew only doors, windows and, from 17.2, yard fences): furniture, stairs and floor openings,
// doors and windows, wall-mounted items, trees, light fixtures and fences, with the floor's root at
// floorToHouseOffset(floor) inside the plan root. The host lights it: `contentFloors`, `areaGroup` and `emitters`
// feed its lights layer, so every floor's lamps shine with one light topology (lights hang in the area groups, so
// they move with their floor). Effects (D24) are not drawn here. Picking resolves any hit to its building floor
// (floors are groups here). A running floor move shows through extra preview offsets that only move the floor
// roots (content and lights included), so nothing is rebuilt while dragging. As in the HA whole house, a settled
// floor is merged (`rebatch`, staticBatch.ts, one floor per call; the host schedules it), so the overview draws a
// few hundred draw calls instead of thousands; a sync, Walls on/off or a material change that no longer matches a
// floor's batch drops it at once until the host merges it again. The batch lives in the floor's root, so a move
// preview moves it too.
//
// Roofs (Phase 19.1, owner decision 4): each floor's roofs (roofLayer.ts) are drawn in the floor's root, so they
// move with a floor move, merge with the floor and cast shadows; a hit on a roof picks the roof (`roof` hit), not
// its floor, so it can be selected and entered.
import type { Intersection, Object3D } from "three";
import { Group, Mesh } from "three";
import type { FloorView, VisibilityRule } from "@shared/domain/house/visibility";
import { floorView, houseWithFloor } from "@shared/domain/house/visibility";
import { floorPlacementOf } from "@shared/domain/house/floorPlacement";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { OpeningSizeResolver } from "@shared/geometry/realAllWallsTypes";
import { floorToHouseOffset } from "@shared/geometry/placement";
import type { FloorBounds, FloorScene } from "./floorScene";
import { createFloorScene, isShadowOnly } from "./floorScene";
import type { HelperPalette } from "./helperPalette";
import type { InstanceLayer } from "./instanceLayer";
import type { FixtureGlow } from "./lightColor";
import { createInstanceLayer } from "./instanceLayer";
import type { MaterialCache } from "./materialCache";
import type { MirrorSurfaces } from "./mirrorSurface";
import { worldToPlan } from "./planFrame";
import type { PickHit, PlanPoint3 } from "./runtimeTypes";
import type { TemplateCache } from "./templateCache";
import type { RoofLayer } from "./roofLayer";
import { createRoofLayer } from "./roofLayer";
import type { BucketOf, StaticBatch } from "./staticBatch";
import { createStaticBatch, floorBatchBuckets } from "./staticBatch";

export type HouseOverviewLayer = Readonly<{
  root: Group;
  /** Shows every floor of the house (through the visibility rule), or clears the overview for null. */
  sync: (house: HouseDocument | null, openingSize: OpeningSizeResolver, visibility: VisibilityRule) => void;
  /** A running floor move: extra offsets (plan mm) by floor ID, or null to show the committed placements. */
  setPreviewOffsets: (offsets: ReadonlyMap<string, PlanPoint3> | null) => void;
  setWallsVisible: (visible: boolean) => void;
  setPalette: (palette: HelperPalette) => void;
  /** Assigns surface materials; call between MaterialCache.begin() and sweep(). */
  applyMaterials: () => void;
  /** Bounds of all floors in the house frame (plan mm); maxHeightMm is the highest wall top. */
  bounds: () => FloorBounds | null;
  /** The floors as last synced (through the visibility rule), for the host's lights layer. */
  contentFloors: () => readonly BuildingFloorValue[];
  /** Hidden lights of every floor (the visibility rule's), for the host's lights layer. */
  concealedLightIds: () => ReadonlySet<string>;
  /** An area's group in whichever floor holds it (lights attach there), or null. */
  areaGroup: (areaId: string) => Group | null;
  /** Light fixture emitters (floor frame, by light ID) from the last sync. */
  emitters: () => ReadonlyMap<string, PlanPoint3>;
  /** Fixture glow by light ID (`LightsLayer.fixtureGlow`) for every floor's fixtures. */
  setFixtureGlow: (glow: ReadonlyMap<string, FixtureGlow>) => void;
  /** Light controls Off: fixture models are not drawn. */
  setLightFixturesVisible: (visible: boolean) => void;
  /** Merges the next floor without a batch; false when every floor is merged (the host calls it once settled). */
  rebatch: () => boolean;
  /** Merged source meshes and merged draw calls over all floors. */
  batchStats: () => Readonly<{ sources: number; batches: number }>;
  /** The building floor under a ray, or null. */
  pick: (intersect: (objects: readonly Object3D[]) => readonly Intersection[]) => PickHit | null;
  dispose: () => void;
}>;

type FloorEntry = {
  readonly scene: FloorScene;
  readonly content: InstanceLayer;
  readonly roofs: RoofLayer;
  floor: BuildingFloorValue | null;
  view: FloorView | null;
  readonly batch: StaticBatch;
  bucketOf: BucketOf;
  /** Nothing to merge as last synced: not tried again until the floor changes. */
  batchEmpty: boolean;
};

/** Whether an object and all its parents are drawn. */
const shownInTree = (object: Object3D): boolean => {
  for (let current: Object3D | null = object; current !== null; current = current.parent)
    if (!current.visible) return false;
  return true;
};

export const createHouseOverviewLayer = (
  materials: MaterialCache,
  initialPalette: HelperPalette,
  templates: TemplateCache,
  mirrors: MirrorSurfaces,
): HouseOverviewLayer => {
  const root = new Group();
  root.name = "houseOverview";
  let palette = initialPalette;
  let wallsOn = true;
  const entries = new Map<string, FloorEntry>();
  let previewOffsets: ReadonlyMap<string, PlanPoint3> | null = null;
  let cachedBounds: FloorBounds | null = null;
  let emitters: ReadonlyMap<string, PlanPoint3> = new Map();
  let fixturesShown = true;

  const placeRoot = (floorId: string, entry: FloorEntry): void => {
    if (entry.floor === null) return;
    const base = floorToHouseOffset(entry.floor);
    const extra = previewOffsets?.get(floorId);
    entry.scene.root.position.set(
      base.x + (extra?.x ?? 0),
      base.y + (extra?.y ?? 0),
      base.h + (extra?.h ?? 0),
    );
  };

  /** A batch that no longer matches its floor goes at once, so nothing is drawn twice or stale. */
  const dropStaleBatches = (): void => {
    for (const entry of entries.values()) {
      if (!entry.batch.built()) entry.batchEmpty = false;
      else if (!entry.batch.valid(entry.scene.root, entry.bucketOf)) entry.batch.clear();
    }
  };

  const removeEntry = (entry: FloorEntry): void => {
    entry.batch.dispose();
    entry.content.dispose();
    entry.roofs.dispose();
    entry.scene.dispose();
  };

  const computeBounds = (): FloorBounds | null => {
    let bounds: FloorBounds | null = null;
    for (const entry of entries.values()) {
      const local = entry.scene.bounds();
      if (local === null || entry.floor === null) continue;
      const placement = floorPlacementOf(entry.floor);
      const roof = entry.roofs.extent();
      const xs = roof?.corners.map((corner) => corner.x) ?? [];
      const ys = roof?.corners.map((corner) => corner.y) ?? [];
      const shifted = {
        minX: Math.min(local.minX, ...xs) + placement.xMm,
        minY: Math.min(local.minY, ...ys) + placement.yMm,
        maxX: Math.max(local.maxX, ...xs) + placement.xMm,
        maxY: Math.max(local.maxY, ...ys) + placement.yMm,
        maxHeightMm: Math.max(
          0,
          Math.max(local.maxHeightMm, roof?.topMm ?? Number.NEGATIVE_INFINITY) + placement.elevationMm,
        ),
      };
      bounds =
        bounds === null
          ? shifted
          : {
              minX: Math.min(bounds.minX, shifted.minX),
              minY: Math.min(bounds.minY, shifted.minY),
              maxX: Math.max(bounds.maxX, shifted.maxX),
              maxY: Math.max(bounds.maxY, shifted.maxY),
              maxHeightMm: Math.max(bounds.maxHeightMm, shifted.maxHeightMm),
            };
    }
    return bounds;
  };

  const clear = (): void => {
    for (const entry of entries.values()) removeEntry(entry);
    entries.clear();
    cachedBounds = null;
    emitters = new Map();
  };

  return {
    root,
    sync: (house, openingSize, visibility) => {
      if (house === null) {
        clear();
        return;
      }
      const ids = new Set(house.floors.map((floor) => floor.id));
      const merged = new Map<string, PlanPoint3>();
      for (const [id, entry] of entries) {
        if (ids.has(id)) continue;
        removeEntry(entry);
        entries.delete(id);
      }
      for (const authored of house.floors) {
        let entry = entries.get(authored.id);
        if (entry === undefined) {
          const scene = createFloorScene(materials, palette);
          scene.setWallsVisible(wallsOn);
          root.add(scene.root);
          const batch = createStaticBatch();
          scene.root.add(batch.root);
          const roofs = createRoofLayer(materials, templates);
          scene.root.add(roofs.root);
          entry = {
            scene,
            content: createInstanceLayer(templates, materials, mirrors),
            roofs,
            floor: null,
            view: null,
            batch,
            bucketOf: () => null,
            batchEmpty: false,
          };
          entries.set(authored.id, entry);
        }
        const view = floorView(authored, visibility);
        if (entry.view?.floor !== view.floor)
          entry.bucketOf = floorBatchBuckets(view.floor, entry.scene.root);
        entry.floor = authored;
        entry.view = view;
        entry.scene.sync(houseWithFloor(house, view.floor), authored.id, openingSize, view);
        // Everything the floor holds (18.1); hidden lights keep shining without their fixture, as in a floor view.
        entry.content.setConcealedLights(view.concealedLightIds);
        entry.content.setLightFixturesVisible(fixturesShown);
        for (const [lightId, point] of entry.content.sync(view.floor, openingSize, entry.scene.contentGroup))
          merged.set(lightId, point);
        entry.content.setWallOpeningsVisible(wallsOn);
        entry.roofs.sync(view.floor);
        placeRoot(authored.id, entry);
      }
      emitters = merged;
      cachedBounds = computeBounds();
      dropStaleBatches();
    },
    setPreviewOffsets: (offsets) => {
      previewOffsets = offsets;
      for (const [id, entry] of entries) placeRoot(id, entry);
    },
    setWallsVisible: (visible) => {
      wallsOn = visible;
      for (const entry of entries.values()) {
        entry.scene.setWallsVisible(visible);
        entry.content.setWallOpeningsVisible(visible);
      }
      dropStaleBatches();
    },
    setPalette: (next) => {
      palette = next;
      for (const entry of entries.values()) entry.scene.setPalette(next);
    },
    applyMaterials: () => {
      for (const entry of entries.values()) {
        entry.scene.applyMaterials();
        entry.content.applyMaterials(() => "normal");
        entry.roofs.applyMaterials();
      }
      dropStaleBatches();
    },
    bounds: () => cachedBounds,
    rebatch: () => {
      for (const entry of entries.values()) {
        if (entry.batch.built() || entry.batchEmpty) continue;
        entry.batch.build(entry.scene.root, entry.bucketOf);
        entry.batchEmpty = !entry.batch.built();
        return true;
      }
      return false;
    },
    batchStats: () => {
      let sources = 0;
      let batches = 0;
      for (const entry of entries.values()) {
        const stats = entry.batch.stats();
        sources += stats.sources;
        batches += stats.batches;
      }
      return { sources, batches };
    },
    contentFloors: () =>
      [...entries.values()].flatMap((entry) => (entry.view === null ? [] : [entry.view.floor])),
    concealedLightIds: () =>
      new Set([...entries.values()].flatMap((entry) => [...(entry.view?.concealedLightIds ?? [])])),
    areaGroup: (areaId) => {
      for (const entry of entries.values()) {
        const group = entry.scene.areaGroup(areaId);
        if (group !== null) return group;
      }
      return null;
    },
    emitters: () => emitters,
    setFixtureGlow: (glow) => {
      for (const entry of entries.values()) entry.content.setFixtureGlow(glow);
    },
    setLightFixturesVisible: (visible) => {
      fixturesShown = visible;
      for (const entry of entries.values()) entry.content.setLightFixturesVisible(visible);
      dropStaleBatches();
    },
    pick: (intersect) => {
      const roots = [...entries.values()].map((entry) => entry.scene.root);
      for (const hit of intersect(roots)) {
        const object = hit.object;
        if (!(object instanceof Mesh) || isShadowOnly(object) || !shownInTree(object)) continue;
        for (const [floorId, entry] of entries) {
          const roofId = entry.roofs.roofAt(object);
          if (roofId !== null) return { kind: "roof", roofId, floorId, pointMm: worldToPlan(hit.point) };
        }
        for (const [floorId, entry] of entries) {
          let inside = false;
          for (let current: Object3D | null = object; current !== null; current = current.parent)
            if (current === entry.scene.root) inside = true;
          if (inside) return { kind: "buildingFloor", floorId, pointMm: worldToPlan(hit.point) };
        }
      }
      return null;
    },
    dispose: () => {
      clear();
      root.removeFromParent();
    },
  };
};
