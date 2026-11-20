// The whole house as seen from outside (Phase 16.1, owner decisions 2026-11-18; completed in Phase 18.1, owner
// 2026-11-18: "display all elements"; spec/architecture/renderer.md#house-exterior and
// spec/home-assistant/viewer-mvp.md#floors-and-the-whole-house): every building floor complete, each placed at its
// placement in the house (floorToHouseOffset: plan offset and finished-floor elevation), stacked, open at the top
// (no roof, no visible ceiling). Framework-free: Three.js and shared/ only (the HA viewer uses it; no React, no
// stores).
//
// Each floor's shell is the builder's own floor scene (floorScene.ts, so walls, floors, carpets and slab look
// exactly as in a floor view), synced with that floor alone, inside a group at the floor's placement. With a
// content source (`content`: the host's template cache and mirrors), each floor also gets its own instance layer
// drawing everything the floor view draws: furniture, stairs and floor openings, the real door and window
// templates, wall-mounted items, trees, light fixtures, yard fences and gates (Phase 18.1; 17.2 drew only fences).
// The host lights them: `contentFloors`, `areaGroup` and the emitters `syncContent` returns feed one lights layer
// for the whole house (one light topology and one shadow budget house-wide, Phase 16.6). Content is synced in the
// floors' load order (`setLoadOrder`: the host's likely floor first), so a staged host's template and texture
// requests queue that floor first. Floors are kept by ID across syncs: an unchanged floor (same value) keeps its
// scene and instances, so showing the whole house again rebuilds nothing. Once a floor has settled, the host merges
// it (`rebatch`, staticBatch.ts): its drawn opaque meshes become one mesh per material, so a whole-house frame makes
// a few hundred draw calls instead of thousands; objects and the house (shell, doors and windows) merge apart
// (buckets "objects" and "house") and light fixtures stay unmerged (their glow follows their light). A content sync
// or a material change that no longer matches a floor's batch drops that batch at once (the sources draw again)
// until the host merges it again.
//
// Without a content source (checks, a host that loads no templates) the doors and windows are drawn simplified
// from their opening prisms (RealAllWalls.openings), as in 16.1:
//   - a window, a glazed door (template ID with window, glazed, balcony, sliding or glass) or any opening whose sill
//     is above `doorSillMaxMm` is a light frame around a glass pane (the glass casts no shadow, so the sun reaches
//     in);
//   - any other door is a plain leaf in the opening, mid-depth.
// Picking maps a hit to its floor (`floorAt`); a hovered floor shows its bounding box in the accent colour
// (`setHighlight`, owner 16.13): the axis-aligned box of its walls and slab coverage, from the slab underside to its
// wall tops, drawn as screen-space lines `highlightLinePx` wide (thick enough to read on a tablet) over everything.
// Each floor's box is built with the floor and hidden, so its shader compiles with the house.
//
// One set of floors (Phase 21.4, owner 2026-11-20: every floor's shell always loaded, once): the HA viewer's floor
// view draws the shown floor from here too (`floorParts`), so no floor is built twice. `setFocus` shows one floor
// with its frame at the root's origin (the root moves by minus the floor's placement), every other floor hidden, its
// roofs hidden (a floor view draws only its attached roofs) and its batch dropped (a floor view picks per area);
// during a floor switch the floors below it stay shown, so the camera rides past real geometry. `setContentFloors`
// keeps the content (instances) of the given floors only: the others' instances are removed (a floor view keeps
// only the shown floor's furniture). The focused floor's materials are the host's to assign (with its fades).
//
// Roofs (Phase 19.1, owner decision 4): each floor's roofs are drawn here (roofLayer.ts) inside the floor's group, so
// they move, merge and cast shadows with it; a floor view never draws them. The bounds and framing points reach
// the roofs' tops and corners.
import type { Material, Object3D } from "three";
import { BoxGeometry, BufferGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { floorSlabOf } from "@shared/domain/house/floorPlacement";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { WallableInstanceValue } from "@shared/domain/schemas/instances";
import { slabCoverage } from "@shared/geometry/floorSlab";
import { floorToHouseOffset } from "@shared/geometry/placement";
import { floorFenceSegments } from "@shared/geometry/yardFences";
import type { OpeningPrism, OpeningSizeResolver } from "@shared/geometry/realAllWallsTypes";
import { regionRings } from "@shared/geometry/region";
import { createFloorScene } from "./floorScene";
import type { RoofLayer } from "./roofLayer";
import { createRoofLayer } from "./roofLayer";
import type { FloorScene } from "./floorScene";
import type { FloorBounds } from "./floorTypes";
import type { HelperPalette } from "./helperPalette";
import type { FixtureGlow } from "./lightColor";
import type { InstanceLayer } from "./instanceLayer";
import { createInstanceLayer } from "./instanceLayer";
import type { BucketOf, StaticBatch } from "./staticBatch";
import { createStaticBatch, floorBatchBuckets } from "./staticBatch";
import type { MirrorSurfaces } from "./mirrorSurface";
import type { TemplateCache } from "./templateCache";
import type { MaterialCache } from "./materialCache";
import type { PlanPoint3 } from "./runtimeTypes";

/** An opening whose bottom is higher than this (mm) is a window (convention, for house templates of unknown kind). */
const doorSillMaxMm = 150;
/** Simplified opening parts (mm, conventions): frame bar width and depth, glass and leaf thickness. */
const frameMm = 55;
const frameDepthMm = 70;
const glassMm = 12;
const leafMm = 45;
const glazedTemplate = /window|glazed|balcony|sliding|glass/i;
/** The hover box's line width (CSS px, convention: reads on an HA tablet). */
export const highlightLinePx = 3;

export type HouseExterior = Readonly<{
  /** Plan-frame group (inside the host's plan root): one child per floor at its placement. */
  root: Group;
  /**
   * Builds every floor of `house` (the host passes the floors as it shows them, hidden things removed) and syncs
   * their content (`syncContent` without live states). Floors are kept by ID; an unchanged floor rebuilds nothing.
   */
  sync: (house: HouseDocument, openingSize: OpeningSizeResolver) => void;
  /**
   * The floors' load order (Phase 18.1): these floor IDs first, in this order, then the rest by document order.
   * Content syncs (and so template and texture requests) follow it.
   */
  setLoadOrder: (floorIds: readonly string[]) => void;
  /**
   * Places every floor's instances whose templates are available now (`stated` lays live states over a floor,
   * HA 9.7; identity when unchanged). Returns the light fixtures' emitters (floor frame, by light ID) for the lights
   * layer. Without a content source, nothing is placed and the map is empty.
   */
  syncContent: (
    stated?: (floor: BuildingFloorValue) => BuildingFloorValue,
  ) => ReadonlyMap<string, PlanPoint3>;
  /** The floors as last synced, in load order (the lights layer draws their lights). */
  contentFloors: () => readonly BuildingFloorValue[];
  /** An area's group in whichever floor holds it (lights attach there), or null. */
  areaGroup: (areaId: string) => Group | null;
  /** An instance's placed model group in whichever floor holds it, or null before it is built. */
  instanceRoot: (instanceId: string) => Object3D | null;
  /** Light fixtures not drawn (or picked) on any floor, by light ID (the HA viewer's Shown when, Phase 21). */
  setConcealedLights: (lightIds: ReadonlySet<string>) => void;
  /** Fixture glow by light ID (`LightsLayer.fixtureGlow`) for every floor's fixtures. */
  setFixtureGlow: (glow: ReadonlyMap<string, FixtureGlow>) => void;
  /**
   * Merges the next floor (in load order) that has no batch (staticBatch.ts); call once things have settled, one
   * floor at a time so no frame waits for the whole house. False when every floor is merged.
   */
  rebatch: () => boolean;
  /** Drops every floor's batch (the sources draw again). */
  unbatch: () => void;
  /** Merged source meshes and merged draw calls over all floors. */
  batchStats: () => Readonly<{ sources: number; batches: number }>;
  /** Assigns the floors' surface materials; call between MaterialCache.begin() and sweep(). */
  applyMaterials: () => void;
  /** The whole house's plan box (house frame) and its top (mm above the house's zero); null with no floors. */
  bounds: () => FloorBounds | null;
  /** Wall-band and slab corners in the house frame (mm), for framing the whole house. */
  framePoints: () => readonly PlanPoint3[];
  /** The floor a picked object belongs to, or null. */
  floorAt: (object: Object3D) => string | null;
  /** Shows one floor's bounding box (hover), or none. */
  setHighlight: (floorId: string | null) => void;
  /** The viewport's size (CSS px), for the box's line width. */
  setResolution: (width: number, height: number) => void;
  /**
   * One floor shown at the root's origin (null: the whole house, every floor at its placement). `withBelow` also
   * shows the floors below it at their places (a floor switch's ride).
   */
  setFocus: (focus: Readonly<{ floorId: string; withBelow: boolean }> | null) => void;
  /** The floors whose content is kept and synced (null: every floor); the others' instances are removed. */
  setContentFloors: (floorIds: ReadonlySet<string> | null) => void;
  /** A floor's scene, content layer, and group (for a host's floor view), or null when the floor is not built. */
  floorParts: (
    floorId: string,
  ) => Readonly<{ scene: FloorScene; content: InstanceLayer | null; group: Group }> | null;
  dispose: () => void;
}>;

type ExteriorFloor = {
  floor: BuildingFloorValue;
  readonly group: Group;
  readonly scene: FloorScene;
  /** Simplified doors and windows (no content source only). */
  readonly openings: Group;
  /** Everything the floor holds (null without a content source). */
  readonly content: InstanceLayer | null;
  /** The floor's roofs (Phase 19.1). */
  readonly roofs: RoofLayer;
  offset: PlanPoint3;
  highlight: LineSegments2;
  /** The floor value the simplified openings and the hover box were built for. */
  builtFor: BuildingFloorValue | null;
  readonly batch: StaticBatch;
  /** Nothing to merge on this floor as last synced (an empty floor): not tried again until it changes. */
  batchEmpty: boolean;
  /** Objects merge into "objects", light fixtures stay unmerged, the rest is "house". */
  bucketOf: BucketOf;
};

/** The prism's footprint as a box: centre, width along the wall, depth across it, and the wall's angle. */
const footprintBox = (
  prism: OpeningPrism,
): Readonly<{ x: number; y: number; width: number; depth: number; angle: number }> | null => {
  const ring = prism.footprint;
  let longest = -1;
  let angle = 0;
  ring.forEach((a, index) => {
    const b = ring[(index + 1) % ring.length];
    if (b === undefined) return;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > longest) {
      longest = length;
      angle = Math.atan2(b.y - a.y, b.x - a.x);
    }
  });
  if (longest <= 0) return null;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const along = ring.map((point) => point.x * ux + point.y * uy);
  const across = ring.map((point) => -point.x * uy + point.y * ux);
  const a0 = Math.min(...along);
  const a1 = Math.max(...along);
  const c0 = Math.min(...across);
  const c1 = Math.max(...across);
  const ca = (a0 + a1) / 2;
  const cc = (c0 + c1) / 2;
  return { x: ca * ux - cc * uy, y: ca * uy + cc * ux, width: a1 - a0, depth: c1 - c0, angle };
};

const glazed = (opening: WallableInstanceValue | undefined, prism: OpeningPrism): boolean =>
  prism.bottomMm > doorSillMaxMm || (opening !== undefined && glazedTemplate.test(opening.templateId));

/** Where the exterior's floor content loads from (the host's template cache and mirrors). */
export type ExteriorContentSource = Readonly<{ templates: TemplateCache; mirrors: MirrorSurfaces }>;

export const createHouseExterior = (
  materials: MaterialCache,
  palette: HelperPalette,
  highlightColor: number,
  content: ExteriorContentSource | null = null,
): HouseExterior => {
  const root = new Group();
  root.name = "houseExterior";
  const frameMaterial = new MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.55, metalness: 0 });
  const leafMaterial = new MeshStandardMaterial({ color: 0xe4ddd2, roughness: 0.6, metalness: 0 });
  const glassMaterial = new MeshStandardMaterial({
    color: 0xc4dbe6,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const lineMaterial = new LineMaterial({
    color: highlightColor,
    linewidth: highlightLinePx,
    worldUnits: false,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.95,
    toneMapped: false,
  });
  const owned: readonly Material[] = [frameMaterial, leafMaterial, glassMaterial, lineMaterial];
  const floors = new Map<string, ExteriorFloor>();
  const floorOf = new WeakMap<Object3D, string>();
  let highlighted: string | null = null;
  let openingSizeOf: OpeningSizeResolver | null = null;
  let loadOrder: readonly string[] = [];
  /** The floors in load order (`setLoadOrder`, then document order). */
  let ordered: ExteriorFloor[] = [];
  const reorder = (documentOrder: readonly string[]): void => {
    const rank = (id: string): number => {
      const at = loadOrder.indexOf(id);
      return at < 0 ? loadOrder.length + documentOrder.indexOf(id) : at;
    };
    ordered = [...floors.values()].sort((a, b) => rank(a.floor.id) - rank(b.floor.id));
  };
  let documentOrder: readonly string[] = [];
  let focus: Readonly<{ floorId: string; withBelow: boolean }> | null = null;
  let contentFloors: ReadonlySet<string> | null = null;
  /** The live states last laid over the floors' content (`syncContent`), reused by `sync`. */
  let lastStated: (floor: BuildingFloorValue) => BuildingFloorValue = (floor) => floor;

  /** Visibility, roofs, batches and the root's offset for the focus (or the whole house). */
  const applyFocus = (): void => {
    const focused = focus === null ? undefined : floors.get(focus.floorId);
    const base = focused?.offset.h ?? 0;
    root.position.set(-(focused?.offset.x ?? 0), -(focused?.offset.y ?? 0), -base);
    for (const entry of floors.values()) {
      const isFocused = entry === focused;
      entry.group.visible =
        focused === undefined ||
        isFocused ||
        (focus?.withBelow === true && entry.offset.h < focused.offset.h);
      entry.roofs.root.visible = focused === undefined;
      if (isFocused) entry.batch.clear();
    }
  };

  const part = (
    parent: Group,
    material: MeshStandardMaterial,
    size: Readonly<{ width: number; depth: number; height: number }>,
    at: Readonly<{ x: number; y: number; h: number; angle: number }>,
    casts: boolean,
  ): void => {
    if (size.width <= 0 || size.height <= 0) return;
    const mesh = new Mesh(new BoxGeometry(size.width, size.depth, size.height), material);
    mesh.position.set(at.x, at.y, at.h);
    mesh.rotation.z = at.angle;
    mesh.castShadow = casts;
    mesh.receiveShadow = casts;
    parent.add(mesh);
  };

  /** One simplified door or window in its opening. */
  const addOpening = (
    parent: Group,
    prism: OpeningPrism,
    opening: WallableInstanceValue | undefined,
  ): void => {
    const box = footprintBox(prism);
    const height = prism.topMm - prism.bottomMm;
    if (box === null || height <= 0) return;
    const centre = { x: box.x, y: box.y, angle: box.angle };
    const midH = (prism.bottomMm + prism.topMm) / 2;
    const depth = Math.min(frameDepthMm, box.depth);
    if (!glazed(opening, prism)) {
      part(
        parent,
        leafMaterial,
        { width: box.width, depth: Math.min(leafMm, box.depth), height },
        { ...centre, h: midH },
        true,
      );
      return;
    }
    const cos = Math.cos(box.angle);
    const sin = Math.sin(box.angle);
    const shifted = (
      along: number,
      h: number,
    ): Readonly<{ x: number; y: number; h: number; angle: number }> => ({
      x: box.x + along * cos,
      y: box.y + along * sin,
      h,
      angle: box.angle,
    });
    const bar = Math.min(frameMm, box.width / 4, height / 4);
    part(
      parent,
      frameMaterial,
      { width: box.width, depth, height: bar },
      shifted(0, prism.topMm - bar / 2),
      true,
    );
    part(
      parent,
      frameMaterial,
      { width: box.width, depth, height: bar },
      shifted(0, prism.bottomMm + bar / 2),
      true,
    );
    part(parent, frameMaterial, { width: bar, depth, height }, shifted(-(box.width - bar) / 2, midH), true);
    part(parent, frameMaterial, { width: bar, depth, height }, shifted((box.width - bar) / 2, midH), true);
    part(
      parent,
      glassMaterial,
      { width: box.width - 2 * bar, depth: Math.min(glassMm, box.depth), height: height - 2 * bar },
      shifted(0, midH),
      false,
    );
  };

  const disposeOpenings = (entry: ExteriorFloor): void => {
    for (const child of [...entry.openings.children]) {
      if (child instanceof Mesh && child.geometry instanceof BufferGeometry) child.geometry.dispose();
      child.removeFromParent();
    }
  };

  const disposeFloor = (entry: ExteriorFloor): void => {
    entry.batch.dispose();
    entry.content?.dispose();
    entry.roofs.dispose();
    entry.scene.dispose();
    disposeOpenings(entry);
    entry.highlight.geometry.dispose();
    entry.group.removeFromParent();
  };

  const clear = (): void => {
    for (const entry of floors.values()) disposeFloor(entry);
    floors.clear();
  };

  /** The floor's bounding box (floor-local mm): walls and slab coverage, slab underside to wall tops. */
  const boxOf = (floor: BuildingFloorValue, scene: FloorScene): LineSegments2 => {
    const bounds = scene.bounds();
    let minX = bounds?.minX ?? Number.POSITIVE_INFINITY;
    let minY = bounds?.minY ?? Number.POSITIVE_INFINITY;
    let maxX = bounds?.maxX ?? Number.NEGATIVE_INFINITY;
    let maxY = bounds?.maxY ?? Number.NEGATIVE_INFINITY;
    for (const ring of regionRings(slabCoverage(floor)))
      for (const point of ring) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    const geometry = new LineSegmentsGeometry();
    if (Number.isFinite(minX) && Number.isFinite(minY)) {
      const bottom = -floorSlabOf(floor).thicknessMm;
      const top = Math.max(bounds?.maxHeightMm ?? 0, bottom + 1);
      const corners = [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
      ];
      const positions: number[] = [];
      corners.forEach(([x = 0, y = 0], index) => {
        const [nx = 0, ny = 0] = corners[(index + 1) % corners.length] ?? [];
        positions.push(x, y, bottom, nx, ny, bottom, x, y, top, nx, ny, top, x, y, bottom, x, y, top);
      });
      geometry.setPositions(positions);
    }
    const box = new LineSegments2(geometry, lineMaterial);
    box.name = "floorHoverBox";
    box.renderOrder = 10;
    box.visible = false;
    box.raycast = () => undefined;
    return box;
  };

  const applyHighlight = (): void => {
    for (const entry of floors.values()) entry.highlight.visible = entry.floor.id === highlighted;
  };

  /** A batch that no longer matches its floor goes at once, so nothing is drawn twice or stale. */
  const dropStaleBatches = (): void => {
    for (const entry of floors.values())
      if (!entry.batch.built()) entry.batchEmpty = false;
      else if (!entry.batch.valid(entry.group, entry.bucketOf)) entry.batch.clear();
  };

  const syncContent = (
    stated: (floor: BuildingFloorValue) => BuildingFloorValue = (floor) => floor,
  ): ReadonlyMap<string, PlanPoint3> => {
    const emitters = new Map<string, PlanPoint3>();
    if (openingSizeOf === null) return emitters;
    lastStated = stated;
    for (const entry of ordered) {
      // Roof windows (19.3) whose template has loaded since.
      entry.roofs.refresh();
      if (entry.content === null) continue;
      const scene = entry.scene;
      const kept = contentFloors === null || contentFloors.has(entry.floor.id);
      const floorEmitters = entry.content.sync(
        kept ? stated(entry.floor) : null,
        openingSizeOf,
        scene.contentGroup,
      );
      for (const [lightId, point] of floorEmitters) emitters.set(lightId, point);
    }
    dropStaleBatches();
    return emitters;
  };

  return {
    root,
    sync: (house, openingSize) => {
      if (openingSize !== openingSizeOf) clear();
      openingSizeOf = openingSize;
      const ids = new Set(house.floors.map((floor) => floor.id));
      for (const [id, entry] of floors) {
        if (ids.has(id)) continue;
        disposeFloor(entry);
        floors.delete(id);
      }
      for (const floor of house.floors) {
        let entry = floors.get(floor.id);
        if (entry === undefined) {
          const group = new Group();
          group.name = `exteriorFloor:${floor.id}`;
          const scene = createFloorScene(materials, palette);
          group.add(scene.root);
          const openings = new Group();
          group.add(openings);
          const roofs = createRoofLayer(materials, content?.templates ?? null);
          group.add(roofs.root);
          const highlight = new LineSegments2(new LineSegmentsGeometry(), lineMaterial);
          const batch = createStaticBatch();
          group.add(batch.root);
          root.add(group);
          floorOf.set(group, floor.id);
          entry = {
            floor,
            group,
            scene,
            openings,
            content:
              content === null ? null : createInstanceLayer(content.templates, materials, content.mirrors),
            roofs,
            offset: floorToHouseOffset(floor),
            highlight,
            builtFor: null,
            batch,
            batchEmpty: false,
            bucketOf: floorBatchBuckets(floor, group),
          };
          floors.set(floor.id, entry);
        }
        entry.floor = floor;
        entry.offset = floorToHouseOffset(floor);
        entry.group.position.set(entry.offset.x, entry.offset.y, entry.offset.h);
        // Memoized by the floor value (and the house's stair cuts): an unchanged floor keeps its surfaces.
        entry.scene.sync(house, floor.id, openingSize);
        entry.roofs.sync(floor);
        if (entry.builtFor !== floor) {
          entry.builtFor = floor;
          entry.batch.clear();
          entry.batchEmpty = false;
          entry.bucketOf = floorBatchBuckets(floor, entry.group);
          disposeOpenings(entry);
          if (entry.content === null) {
            const byId = new Map(
              floor.areas.flatMap((area) =>
                area.walls.flatMap((wall) =>
                  wall.objects.map((opening): [string, WallableInstanceValue] => [opening.id, opening]),
                ),
              ),
            );
            for (const layer of entry.scene.wallLayers())
              for (const prism of layer.walls.openings)
                addOpening(entry.openings, prism, byId.get(prism.openingId));
          }
          entry.highlight.geometry.dispose();
          entry.highlight.removeFromParent();
          entry.highlight = boxOf(floor, entry.scene);
          entry.group.add(entry.highlight);
        }
      }
      documentOrder = house.floors.map((floor) => floor.id);
      reorder(documentOrder);
      syncContent(lastStated);
      applyHighlight();
      applyFocus();
    },
    setLoadOrder: (floorIds) => {
      loadOrder = [...floorIds];
      reorder(documentOrder);
    },
    syncContent,
    contentFloors: () => ordered.map((entry) => entry.floor),
    areaGroup: (areaId) => {
      for (const entry of floors.values()) {
        const group = entry.scene.areaGroup(areaId);
        if (group !== null) return group;
      }
      return null;
    },
    instanceRoot: (instanceId) => {
      for (const entry of floors.values()) {
        const found = entry.content?.root(instanceId) ?? null;
        if (found !== null) return found;
      }
      return null;
    },
    setConcealedLights: (lightIds) => {
      for (const entry of floors.values()) entry.content?.setConcealedLights(lightIds);
    },
    setFixtureGlow: (glow) => {
      for (const entry of floors.values()) entry.content?.setFixtureGlow(glow);
    },
    rebatch: () => {
      if (focus !== null) return false;
      const next = ordered.find((entry) => !entry.batch.built() && !entry.batchEmpty);
      if (next === undefined) return false;
      next.batch.build(next.group, next.bucketOf);
      next.batchEmpty = !next.batch.built();
      return true;
    },
    unbatch: () => {
      for (const entry of floors.values()) entry.batch.clear();
    },
    batchStats: () => {
      let sources = 0;
      let batches = 0;
      for (const entry of floors.values()) {
        const stats = entry.batch.stats();
        sources += stats.sources;
        batches += stats.batches;
      }
      return { sources, batches };
    },
    applyMaterials: () => {
      for (const entry of floors.values()) {
        // The focused floor's are the host's (its floor view assigns them with its fades).
        if (focus !== null && entry.floor.id === focus.floorId) continue;
        entry.scene.applyMaterials();
        entry.content?.applyMaterials(() => "normal");
        entry.roofs.applyMaterials();
      }
      dropStaleBatches();
    },
    bounds: () => {
      let box: { minX: number; minY: number; maxX: number; maxY: number; maxHeightMm: number } | null = null;
      for (const entry of floors.values()) {
        const local = entry.scene.bounds();
        if (local === null) continue;
        const { x, y, h } = entry.offset;
        const roof = entry.roofs.extent();
        const xs = roof?.corners.map((corner) => corner.x) ?? [];
        const ys = roof?.corners.map((corner) => corner.y) ?? [];
        const next = {
          minX: Math.min(local.minX, ...xs) + x,
          minY: Math.min(local.minY, ...ys) + y,
          maxX: Math.max(local.maxX, ...xs) + x,
          maxY: Math.max(local.maxY, ...ys) + y,
          maxHeightMm: Math.max(local.maxHeightMm, roof?.topMm ?? Number.NEGATIVE_INFINITY) + h,
        };
        box =
          box === null
            ? next
            : {
                minX: Math.min(box.minX, next.minX),
                minY: Math.min(box.minY, next.minY),
                maxX: Math.max(box.maxX, next.maxX),
                maxY: Math.max(box.maxY, next.maxY),
                maxHeightMm: Math.max(box.maxHeightMm, next.maxHeightMm),
              };
      }
      return box;
    },
    framePoints: () => {
      const points: PlanPoint3[] = [];
      for (const entry of floors.values()) {
        const { x, y, h } = entry.offset;
        const bottom = h - floorSlabOf(entry.floor).thicknessMm;
        for (const layer of entry.scene.wallLayers())
          for (const band of layer.walls.bands)
            for (const corner of band.ring) {
              points.push({ x: corner.x + x, y: corner.y + y, h: bottom });
              points.push({ x: corner.x + x, y: corner.y + y, h: h + band.heightMm });
            }
        // Roofs (19.1): their corners at the roof's top.
        const roof = entry.roofs.extent();
        for (const corner of roof?.corners ?? [])
          points.push({ x: corner.x + x, y: corner.y + y, h: h + (roof?.topMm ?? 0) });
        // Yards: the ends of their fence segments (a yard without fences is framed by the floor bounds).
        for (const segment of floorFenceSegments(entry.floor)) {
          const half = segment.widthMm / 2;
          for (const sign of [-1, 1]) {
            const px = segment.center.x + segment.direction.x * half * sign + x;
            const py = segment.center.y + segment.direction.y * half * sign + y;
            points.push({ x: px, y: py, h });
            points.push({ x: px, y: py, h: h + segment.heightMm });
          }
        }
      }
      return points;
    },
    floorAt: (object) => {
      for (let current: Object3D | null = object; current !== null; current = current.parent) {
        const id = floorOf.get(current);
        if (id !== undefined) return id;
      }
      return null;
    },
    setHighlight: (floorId) => {
      if (floorId === highlighted) return;
      highlighted = floorId;
      applyHighlight();
    },
    setResolution: (width, height) => {
      lineMaterial.resolution.set(Math.max(width, 1), Math.max(height, 1));
    },
    setFocus: (next) => {
      focus = next;
      applyFocus();
    },
    setContentFloors: (floorIds) => {
      contentFloors = floorIds;
    },
    floorParts: (floorId) => {
      const entry = floors.get(floorId);
      return entry === undefined ? null : { scene: entry.scene, content: entry.content, group: entry.group };
    },
    dispose: () => {
      clear();
      for (const material of owned) material.dispose();
      root.removeFromParent();
    },
  };
};
