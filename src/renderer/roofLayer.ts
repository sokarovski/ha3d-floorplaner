// Roofs of one floor as meshes (Phase 19.1, spec/architecture/renderer.md#roofs): the derived roof meshes
// (shared/geometry/roofMesh.ts) in the floor's local frame, one group per roof (`roof:<id>`) with its top, underside,
// edge and (open design) rib meshes in their materials. Framework-free (Three.js and shared/ only), so the builder's
// whole-house overview and roof editing level and the HA viewer's whole house use the same layer. Roofs cast and
// receive shadows like the walls. Memoized by the roof value: an unchanged roof keeps its meshes (and so its static
// batch in a whole-house view). Floor and room views never draw the cutting roof (owner decision 4); since 19.3
// they draw a floor's attached roofs (canopies, Cuts walls off) through this layer with `attachedRoofsOnly`.
//
// Roof windows (Phase 19.3): each window that fits (shared/geometry/roofOpenings.ts) is its roof-window template
// (D17) resized to the window and laid on its face: template x level along the slope, y up the slope, z the face's
// outward normal, the origin at the window's lower edge on the slab's mid-plane, the host depth the slab's thickness
// across the slope. Without a template source (checks) or before the template has loaded, a plain frame and glass
// stand in. `refresh` rebuilds windows whose template state changed (call it after template loads).
import type { Material, Object3D } from "three";
import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial } from "three";
import { builtInPresets } from "@shared/domain/house/defaults";
import { ribMaterials, roofsOf } from "@shared/domain/house/roofs";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { RoofValue } from "@shared/domain/schemas/roof";
import type { SurfaceMaterialValue } from "@shared/domain/schemas/values";
import type { MeshBuffers } from "@shared/geometry/meshData";
import { roofMeshes } from "@shared/geometry/roofMesh";
import type { PlacedRoofWindow } from "@shared/geometry/roofOpenings";
import { faceAxes, fromFace, roofOpenings } from "@shared/geometry/roofOpenings";
import { planeHeight } from "@shared/geometry/roofSurface";
import { templateResize } from "@shared/geometry/templateResize";
import { meshToGeometry } from "./geometryBuffers";
import type { MaterialCache } from "./materialCache";
import { detachAndDisposeGeometries } from "./sceneObjects";
import { seeThrough } from "./shadowCasting";
import { batchedRoofId, roofsGroupName } from "./staticBatch";
import type { TemplateCache } from "./templateCache";
import { resizedGeometry } from "./templateGeometry";

/** Which of a floor's roofs a layer draws. */
export type RoofFilter = (roof: RoofValue) => boolean;

/** Floor and room views (19.3): only attached roofs (canopies), never the cutting roof. */
export const attachedRoofsOnly: RoofFilter = (roof) => !roof.cutsWalls;

export type RoofLayer = Readonly<{
  /** Floor-frame group holding one child group per roof. */
  root: Group;
  /** Builds the floor's roofs (all, or those `which` keeps); null removes them. */
  sync: (floor: Pick<BuildingFloorValue, "roofs"> | null, which?: RoofFilter) => void;
  /** Rebuilds roof windows whose template has loaded (or failed) since they were built. */
  refresh: () => void;
  /** Assigns the roofs' materials; call between MaterialCache.begin() and sweep(). */
  applyMaterials: () => void;
  /** The roof a picked object belongs to, or null. */
  roofAt: (object: Object3D) => string | null;
  /** The highest roof top (mm above the floor) and the roofs' plan corners, for bounds and framing; null: none. */
  extent: () => Readonly<{ topMm: number; corners: readonly Readonly<{ x: number; y: number }>[] }> | null;
  dispose: () => void;
}>;

type PartName = "top" | "bottom" | "side" | "stepWall" | "ribs";
type Part = Readonly<{ mesh: Mesh; material: (roof: RoofValue) => SurfaceMaterialValue }>;
type Entry = {
  roof: RoofValue;
  readonly group: Group;
  parts: Part[];
  readonly windows: Group;
  /** The template states the windows were built with (rebuilt when it changes). */
  windowKey: string;
};

const wallPaint = ((): SurfaceMaterialValue => {
  const preset = builtInPresets.find((candidate) => candidate.id === "builtin_wallpaint");
  if (preset === undefined) throw new Error("Unknown built-in preset builtin_wallpaint");
  return preset.material;
})();

const partMaterials: Readonly<Record<PartName, (roof: RoofValue) => SurfaceMaterialValue>> = {
  top: (roof) => roof.topMaterial,
  bottom: (roof) => roof.bottomMaterial,
  // Closed: the side material; open: the deck's edge is the covering's.
  side: (roof) => (roof.design === "closed" ? roof.sideMaterial : roof.topMaterial),
  stepWall: () => wallPaint,
  ribs: (roof) => ribMaterials[roof.ribMaterial],
};

/** Simplified roof-window parts (mm, conventions): frame bar width and glass thickness. */
const frameBarMm = 70;
const glassMm = 12;

export const createRoofLayer = (
  materials: MaterialCache,
  templates: TemplateCache | null = null,
): RoofLayer => {
  const root = new Group();
  root.name = roofsGroupName;
  const entries = new Map<string, Entry>();
  const roofOf = new WeakMap<Object3D, string>();
  const frameMaterial = new MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.5, metalness: 0.2 });
  const glassMaterial = new MeshStandardMaterial({
    color: 0xc4dbe6,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const fallbackMaterial = new MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.7 });

  const stateKey = (roof: RoofValue): string =>
    (roof.windows ?? [])
      .map((window) => {
        const state = templates?.peek(window.templateId, window.templateVersion) ?? null;
        return `${window.id}:${state?.state ?? "none"}`;
      })
      .join(",");

  /** The window's placement matrix (template metres → floor mm) and its host depth across the slope. */
  const windowMatrix = (
    roof: RoofValue,
    placed: PlacedRoofWindow,
  ): Readonly<{ matrix: Matrix4; hostDepthMm: number }> | null => {
    const frame = placed.frame;
    if (frame === null) return null;
    const axes = faceAxes(frame);
    const lower = fromFace(frame, { x: 0, y: -placed.window.lengthMm / 2 });
    const thickness = Math.max(1, roof.thicknessMm);
    const origin = {
      ...lower,
      h: roof.eaveHeightMm + planeHeight(frame.plane, lower) + thickness / 2,
    };
    const scale = 1000;
    const matrix = new Matrix4().set(
      axes.along.x * scale,
      axes.up.x * scale,
      axes.normal.x * scale,
      origin.x,
      axes.along.y * scale,
      axes.up.y * scale,
      axes.normal.y * scale,
      origin.y,
      axes.along.h * scale,
      axes.up.h * scale,
      axes.normal.h * scale,
      origin.h,
      0,
      0,
      0,
      1,
    );
    return { matrix, hostDepthMm: thickness / frame.stretch };
  };

  /** A plain frame and glass in the template frame (metres): x across, y up the slope, z through the roof. */
  const simplifiedWindow = (holder: Group, widthMm: number, lengthMm: number, depthMm: number): void => {
    const w = widthMm / 1000;
    const l = lengthMm / 1000;
    const d = (depthMm + 40) / 1000;
    const bar = Math.min(frameBarMm / 1000, w / 4, l / 4);
    const part = (
      material: MeshStandardMaterial,
      size: readonly [number, number, number],
      at: readonly [number, number, number],
      casts: boolean,
    ): void => {
      const mesh = new Mesh(new BoxGeometry(size[0], size[1], size[2]), material);
      mesh.position.set(at[0], at[1], at[2]);
      mesh.castShadow = casts;
      mesh.receiveShadow = casts;
      holder.add(mesh);
    };
    part(frameMaterial, [w, bar, d], [0, bar / 2, 0], true);
    part(frameMaterial, [w, bar, d], [0, l - bar / 2, 0], true);
    part(frameMaterial, [bar, l, d], [-(w - bar) / 2, l / 2, 0], true);
    part(frameMaterial, [bar, l, d], [(w - bar) / 2, l / 2, 0], true);
    part(glassMaterial, [w - 2 * bar, l - 2 * bar, glassMm / 1000], [0, l / 2, depthMm / 2000], false);
  };

  const buildWindows = (entry: Entry): void => {
    for (const child of [...entry.windows.children]) detachAndDisposeGeometries(child);
    entry.windowKey = stateKey(entry.roof);
    for (const placed of roofOpenings(entry.roof).windows) {
      if (placed.fit !== "fits") continue;
      const placement = windowMatrix(entry.roof, placed);
      if (placement === null) continue;
      const holder = new Group();
      holder.name = `roofWindow:${placed.window.id}`;
      holder.matrixAutoUpdate = false;
      holder.matrix.copy(placement.matrix);
      const state = templates?.get(placed.window.templateId, placed.window.templateVersion);
      let built = false;
      if (state?.state === "ready") {
        const asset = state.asset;
        const result = templateResize(asset.input, asset.metadata, {
          parameters: { widthMm: placed.window.widthMm, heightMm: placed.window.lengthMm },
          hostDepthMm: placement.hostDepthMm,
          flip: { x: false, z: false },
        });
        if (result.ok) {
          for (const resized of result.meshes) {
            const material: Material =
              (resized.materialName === null ? undefined : asset.materials.get(resized.materialName)) ??
              fallbackMaterial;
            const mesh = new Mesh(resizedGeometry(resized, false), material);
            mesh.castShadow = !seeThrough(material);
            mesh.receiveShadow = true;
            roofOf.set(mesh, entry.roof.id);
            holder.add(mesh);
          }
          built = true;
        }
      }
      if (!built)
        simplifiedWindow(holder, placed.window.widthMm, placed.window.lengthMm, placement.hostDepthMm);
      for (const child of holder.children) roofOf.set(child, entry.roof.id);
      entry.windows.add(holder);
    }
  };

  const build = (entry: Entry): void => {
    for (const part of entry.parts) detachAndDisposeGeometries(part.mesh);
    const meshes = roofMeshes(entry.roof);
    const sources: readonly (readonly [PartName, MeshBuffers])[] = [
      ["top", meshes.top],
      ["bottom", meshes.bottom],
      ["side", meshes.side],
      ["stepWall", meshes.stepWall],
      ["ribs", meshes.ribs],
    ];
    entry.parts = sources.flatMap(([name, buffers]) => {
      if (buffers.indices.length === 0) return [];
      const mesh = new Mesh(meshToGeometry(buffers), []);
      mesh.name = `roof:${entry.roof.id}:${name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      roofOf.set(mesh, entry.roof.id);
      entry.group.add(mesh);
      return [{ mesh, material: partMaterials[name] }];
    });
    buildWindows(entry);
  };

  const remove = (id: string, entry: Entry): void => {
    for (const part of entry.parts) detachAndDisposeGeometries(part.mesh);
    for (const child of [...entry.windows.children]) detachAndDisposeGeometries(child);
    entry.group.removeFromParent();
    entries.delete(id);
  };

  return {
    root,
    sync: (floor, which) => {
      const roofs = floor === null ? [] : roofsOf(floor).filter((roof) => which === undefined || which(roof));
      const ids = new Set(roofs.map((roof) => roof.id));
      for (const [id, entry] of entries) if (!ids.has(id)) remove(id, entry);
      for (const roof of roofs) {
        let entry = entries.get(roof.id);
        if (entry === undefined) {
          const group = new Group();
          group.name = `roof:${roof.id}`;
          root.add(group);
          const windows = new Group();
          windows.name = "roofWindows";
          group.add(windows);
          entry = { roof, group, parts: [], windows, windowKey: "" };
          entries.set(roof.id, entry);
          build(entry);
        } else if (entry.roof !== roof) {
          entry.roof = roof;
          build(entry);
        } else if (entry.windowKey !== stateKey(roof)) buildWindows(entry);
      }
    },
    refresh: () => {
      for (const entry of entries.values()) if (entry.windowKey !== stateKey(entry.roof)) buildWindows(entry);
    },
    applyMaterials: () => {
      for (const entry of entries.values())
        for (const part of entry.parts)
          part.mesh.material = materials.get(part.material(entry.roof), "normal");
    },
    roofAt: (mesh) => {
      let id: string | null = null;
      for (let current: Object3D | null = mesh; current !== null && id === null; current = current.parent)
        id = roofOf.get(current) ?? null;
      id ??= batchedRoofId(mesh);
      return id !== null && entries.has(id) ? id : null;
    },
    extent: () => {
      let topMm = Number.NEGATIVE_INFINITY;
      const corners: Readonly<{ x: number; y: number }>[] = [];
      for (const { roof } of entries.values()) {
        const step = Math.max(
          0,
          ...roof.lines.map((line) => (line.kind === "step" ? (line.stepMm ?? 0) : 0)),
        );
        for (const point of roof.points) {
          topMm = Math.max(topMm, roof.eaveHeightMm + point.heightMm + step + roof.thicknessMm);
          corners.push({ x: point.x, y: point.y });
        }
      }
      return corners.length === 0 ? null : { topMm, corners };
    },
    dispose: () => {
      for (const [id, entry] of entries) remove(id, entry);
      frameMaterial.dispose();
      glassMaterial.dispose();
      fallbackMaterial.dispose();
      root.removeFromParent();
    },
  };
};
