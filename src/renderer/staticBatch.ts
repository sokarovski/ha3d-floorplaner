// Static batching of a whole floor for the whole-house views (Phase 18.1, spec/architecture/renderer.md#house-exterior).
// Framework-free: Three.js only.
//
// A complete floor is a few thousand meshes (every template part of every object), and the cost of a whole-house
// frame is dominated by draw calls (measured in 18.1: about 10 µs each, independent of the pixel count). Once a floor
// is settled, `build` merges its drawn opaque meshes into one mesh per material, attribute layout and shadow flags,
// in the floor's own frame, so moving the floor's root (the builder's floor move preview) moves the batch with it.
// The source meshes stay where they are, owned by their layers, but move to `batchedLayer`, which no camera renders
// (the shadow passes follow the camera's layers, so they skip them too); the batch draws them instead with the same
// materials, so texture maps arriving later and surface materials shared with other floors keep working, and no
// shader compiles (the program depends on the material, the attribute layout and the shadow flags, which a batch
// keeps).
//
// Not batched: transparent materials (they sort per object), multi-material and morphed meshes, meshes on any layer
// but the model layer (helpers, background compiles), meshes with their own picking or render hook (shadow-only
// ceilings, which are never picked), and whatever `bucketOf` leaves out (null: light fixtures, whose glow
// materials follow their light). `bucketOf` also sorts what is merged into named buckets (one group each, named
// `staticBatch:<bucket>`), so a host can treat them apart (the HA viewer hides its objects' bucket from the glass
// reflection, as it hides the objects). `valid` tells whether the batch still matches the scene (a source rebuilt, removed
// or given another material, or a new mesh): a host then calls `clear` and builds again once things settle.
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute, Material, Object3D } from "three";
import { Group, Matrix4, Mesh } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { isMesh } from "./sceneObjects";

/** The Three.js layer batched source meshes move to (no camera renders it). */
export const batchedLayer = 30;
/** The model layer (Three.js layer 0) as a mask: only meshes on it alone are batched. */
const modelMask = 1;

export type StaticBatch = Readonly<{
  /** The merged meshes; the host adds it to the batched frame. */
  root: Group;
  /** Merges the drawn opaque meshes under `frame` (in its frame) into their buckets (null: left out). */
  build: (frame: Object3D, bucketOf: BucketOf) => void;
  /** Whether a batch is built. */
  built: () => boolean;
  /** Whether the batch still matches what is under `frame` (always true when none is built). */
  valid: (frame: Object3D, bucketOf: BucketOf) => boolean;
  /** Sources merged and draw calls the batch makes, for timing. */
  stats: () => Readonly<{ sources: number; batches: number }>;
  /** Drops the merged meshes and gives the sources back to the view. */
  clear: () => void;
  dispose: () => void;
}>;

/** The bucket a mesh merges into, or null to leave it drawing itself. */
export type BucketOf = (mesh: Mesh) => string | null;

/** The group name of a bucket's merged meshes. */
export const batchBucketName = (bucket: string): string => `staticBatch:${bucket}`;

type Source = Readonly<{ mesh: Mesh; material: Material; geometry: BufferGeometry; mask: number }>;

const drawnBelow = (object: Object3D, frame: Object3D): boolean => {
  for (let current: Object3D | null = object; current !== null; current = current.parent) {
    if (!current.visible) return false;
    if (current === frame) return true;
  }
  return false;
};

const attributeKey = (name: string, attribute: BufferAttribute | InterleavedBufferAttribute): string =>
  `${name}:${String(attribute.itemSize)}:${String(attribute.normalized)}:${attribute.array.constructor.name}`;

/** Material, attribute layout, index presence and shadow flags: what decides a merged mesh (and its program). */
const batchKey = (mesh: Mesh, material: Material, geometry: BufferGeometry): string =>
  [
    material.uuid,
    Object.entries(geometry.attributes)
      .map(([name, attribute]) => attributeKey(name, attribute))
      .sort()
      .join(","),
    geometry.index === null ? "flat" : "indexed",
    String(mesh.castShadow),
    String(mesh.receiveShadow),
  ].join("|");

/** A copy of the geometry in the frame's coordinates, its winding kept front-facing under a mirroring transform. */
const placedCopy = (geometry: BufferGeometry, matrix: Matrix4): BufferGeometry => {
  const copy = geometry.clone();
  copy.applyMatrix4(matrix);
  if (matrix.determinant() >= 0) return copy;
  const index = copy.index;
  if (index !== null) {
    for (let at = 0; at + 2 < index.count; at += 3) {
      const b = index.getX(at + 1);
      index.setX(at + 1, index.getX(at + 2));
      index.setX(at + 2, b);
    }
    index.needsUpdate = true;
    return copy;
  }
  for (const attribute of Object.values(copy.attributes)) {
    for (let at = 0; at + 2 < attribute.count; at += 3)
      for (let component = 0; component < attribute.itemSize; component += 1) {
        const b = attribute.getComponent(at + 1, component);
        attribute.setComponent(at + 1, component, attribute.getComponent(at + 2, component));
        attribute.setComponent(at + 2, component, b);
      }
    attribute.needsUpdate = true;
  }
  return copy;
};

/** The meshes `build` would merge now (drawn, opaque, single-material, unmorphed, on the model layer alone). */
/**
 * The merged geometry, or null when it cannot be merged: BufferGeometryUtils returns null (despite its typings) for
 * layouts that do not match, which grouping by layout should prevent.
 */
const mergedGeometry = (geometries: BufferGeometry[]): BufferGeometry | null => {
  try {
    return mergeGeometries(geometries, false);
  } catch (error) {
    console.warn("[homeplan] static batch: could not merge", error);
    return null;
  }
};

type Candidate = Readonly<{ mesh: Mesh; material: Material; bucket: string }>;

const candidates = (frame: Object3D, bucketOf: BucketOf, own: Group): Candidate[] => {
  const found: Candidate[] = [];
  frame.traverse((object) => {
    if (!isMesh(object) || object.parent?.parent === own) return;
    const material = object.material;
    if (Array.isArray(material) || material.transparent) return;
    if (object.layers.mask !== modelMask || Object.keys(object.geometry.morphAttributes).length > 0) return;
    // A mesh with its own picking or render hook (a shadow-only ceiling, a mirror) keeps drawing itself.
    if (Object.hasOwn(object, "raycast") || Object.hasOwn(object, "onBeforeRender")) return;
    if (!drawnBelow(object, frame)) return;
    const bucket = bucketOf(object);
    if (bucket !== null) found.push({ mesh: object, material, bucket });
  });
  return found;
};

export const createStaticBatch = (): StaticBatch => {
  const root = new Group();
  root.name = "staticBatch";
  let sources: Source[] = [];
  let merged: Mesh[] = [];
  /** Candidates whose group could not merge: they keep drawing themselves and do not invalidate the batch. */
  let unmerged = new Set<Mesh>();

  const clear = (): void => {
    for (const source of sources) source.mesh.layers.mask = source.mask;
    sources = [];
    for (const mesh of merged) mesh.geometry.dispose();
    for (const bucket of [...root.children]) bucket.removeFromParent();
    merged = [];
    unmerged = new Set();
  };

  return {
    root,
    build: (frame, bucketOf) => {
      clear();
      frame.updateMatrixWorld(true);
      const toFrame = new Matrix4().copy(frame.matrixWorld).invert();
      const groups = new Map<
        string,
        { material: Material; mesh: Mesh; bucket: string; geometries: BufferGeometry[] }
      >();
      const found = candidates(frame, bucketOf, root);
      const keyOf = ({ mesh, material, bucket }: Candidate): string =>
        `${bucket}|${batchKey(mesh, material, mesh.geometry)}`;
      for (const candidate of found) {
        const { mesh, material, bucket } = candidate;
        const key = keyOf(candidate);
        const group = groups.get(key) ?? { material, mesh, bucket, geometries: [] };
        group.geometries.push(
          placedCopy(mesh.geometry, new Matrix4().multiplyMatrices(toFrame, mesh.matrixWorld)),
        );
        groups.set(key, group);
      }
      const mergedKeys = new Set<string>();
      for (const [key, group] of groups) {
        const geometry = mergedGeometry(group.geometries);
        for (const each of group.geometries) each.dispose();
        if (geometry === null) continue;
        const batch = new Mesh(geometry, group.material);
        batch.name = "staticBatch:mesh";
        batch.castShadow = group.mesh.castShadow;
        batch.receiveShadow = group.mesh.receiveShadow;
        batch.matrixAutoUpdate = false;
        const name = batchBucketName(group.bucket);
        let holder = root.children.find((child) => child.name === name);
        if (holder === undefined) {
          holder = new Group();
          holder.name = name;
          root.add(holder);
        }
        holder.add(batch);
        merged.push(batch);
        mergedKeys.add(key);
      }
      // Merged: their sources leave the view (a group whose merge failed keeps drawing its own meshes).
      for (const candidate of found) {
        const { mesh, material } = candidate;
        if (!mergedKeys.has(keyOf(candidate))) {
          unmerged.add(mesh);
          continue;
        }
        sources.push({ mesh, material, geometry: mesh.geometry, mask: mesh.layers.mask });
        mesh.layers.set(batchedLayer);
      }
    },
    built: () => merged.length > 0,
    valid: (frame, bucketOf) => {
      if (merged.length === 0) return true;
      for (const source of sources) {
        const mesh = source.mesh;
        if (mesh.material !== source.material || mesh.geometry !== source.geometry) return false;
        if (mesh.layers.mask !== 1 << batchedLayer) return false;
        if (!drawnBelow(mesh, frame)) return false;
      }
      // A new mesh to draw (an instance placed or rebuilt since).
      return candidates(frame, bucketOf, root).every(({ mesh }) => unmerged.has(mesh));
    },
    stats: () => ({ sources: sources.length, batches: merged.length }),
    clear,
    dispose: () => {
      clear();
      root.removeFromParent();
    },
  };
};

/** The group name of a floor's roofs (roofLayer.ts); each roof's group is `roof:<id>`. */
export const roofsGroupName = "roofs";

/** The roof a merged mesh draws (its bucket `roof:<id>`), or null. */
export const batchedRoofId = (mesh: Object3D): string | null => {
  const prefix = batchBucketName("roof:");
  const name = mesh.parent?.name ?? "";
  return name.startsWith(prefix) ? name.slice(prefix.length) : null;
};

/**
 * The bucket rule of a floor's content (instanceLayer.ts names each instance root `instance:<id>`): light fixtures
 * stay unmerged, objects merge into "objects", each roof into "roof:<id>", everything else (shell, doors, windows,
 * fences) into "house".
 */
export const floorBatchBuckets = (floor: BuildingFloorValue, frame: Object3D): BucketOf => {
  const fixtures = new Set(floor.areas.flatMap((area) => area.lights.map((light) => `instance:${light.id}`)));
  const objects = new Set(
    floor.areas.flatMap((area) => area.objects.map((object) => `instance:${object.id}`)),
  );
  return (mesh) => {
    for (
      let current: Object3D | null = mesh;
      current !== null && current !== frame;
      current = current.parent
    ) {
      if (fixtures.has(current.name)) return null;
      if (objects.has(current.name)) return "objects";
      // A roof (Phase 19.1, roofLayer.ts) merges into its own bucket, so a hit on the merged mesh still names it.
      if (current.parent?.name === roofsGroupName && current.name.startsWith("roof:")) return current.name;
    }
    return "house";
  };
};
