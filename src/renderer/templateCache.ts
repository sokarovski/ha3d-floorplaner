// Object templates (spec/builder/features/object-templates.md, D17): each template version is loaded once
// with GLTFLoader (cached by id@version), its Homeplan metadata validated, and its node tree flattened into
// the resize engine's input: every mesh baked into template-root space (meters, +Y up, front +Z) under its
// glTF node's name, with the nearest ancestor-or-self node rule; mesh-less nodes (anchors, punctual lights)
// contribute only their origin. Every glTF material is kept by name, including ones no mesh uses (material
// presets a slot offers, Phase 9.1). Loads that finish after dispose are discarded.
import type { Object3D } from "three";
import type { Mesh } from "three";
import { BufferGeometry, Light, Material, Matrix3, Texture, Vector3 } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { NodeRule, TemplateMetadata } from "@shared/domain/templates/metadata";
import { homeplanExtras, parseNodeRule, validateTemplateMetadata } from "@shared/domain/templates/metadata";
import type {
  TemplateGeometryInput,
  TemplateMeshInput,
  TemplateNodeInput,
  TemplateVec3,
} from "@shared/geometry/templateResize";
import { readGltf } from "./assetTransport";
import type { AssetReader } from "./assetTransport";
import type { LoadQueue } from "./loadQueue";
import { isMesh } from "./sceneObjects";

export type TemplateAsset = Readonly<{
  metadata: TemplateMetadata;
  input: TemplateGeometryInput;
  /** glTF materials by name (material slots refer to these). */
  materials: ReadonlyMap<string, Material>;
  /** Names of nodes that carry a KHR_lights_punctual emitter. */
  lightNodes: ReadonlySet<string>;
}>;

export type TemplateState =
  | Readonly<{ state: "loading" }>
  | Readonly<{ state: "ready"; asset: TemplateAsset }>
  | Readonly<{ state: "failed"; reason: string }>;

export type TemplateCache = Readonly<{
  get: (templateId: string, version: number) => TemplateState;
  /** The state without requesting a load: null when the template was never requested. */
  peek: (templateId: string, version: number) => TemplateState | null;
  dispose: () => void;
}>;

type Entry = { state: TemplateState; gltf: GLTF | null; unused: readonly Material[] };

/** One measured template load (opt-in timing, Phase 15.1): fetch and glTF parse, then flattening. */
export type TemplateTiming = Readonly<{ key: string; fetchParseMs: number; flattenMs: number }>;

/**
 * Staged loading (opt-in, Phase 15.1; the HA viewer): requests wait in the host's load queue, in the lane `laneOf`
 * gives (the HA viewer loads doors and windows with the house model, objects after the opening). Without it (the
 * builder) every template loads on its first request, as before.
 */
export type TemplateLoading = Readonly<{
  queue: LoadQueue;
  laneOf: (templateId: string, version: number) => number;
  onTiming?: (timing: TemplateTiming) => void;
}>;

/** Every material of the glTF (cached by the loader, so the meshes' own instances come back too). */
const allMaterials = async (gltf: GLTF): Promise<readonly Material[]> => {
  const dependencies: unknown[] = await gltf.parser.getDependencies("material");
  return dependencies.filter((value) => value instanceof Material);
};

const disposeMaterial = (material: Material): void => {
  for (const value of Object.values(material)) if (value instanceof Texture) value.dispose();
  material.dispose();
};

const meshInput = (mesh: Mesh): TemplateMeshInput | null => {
  const geometry = mesh.geometry;
  if (!(geometry instanceof BufferGeometry)) return null;
  const position = geometry.getAttribute("position");
  const normal = geometry.hasAttribute("normal") ? geometry.getAttribute("normal") : null;
  const uv = geometry.hasAttribute("uv") ? geometry.getAttribute("uv") : null;
  const count = position.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const vector = new Vector3();
  const normalMatrix = new Matrix3().getNormalMatrix(mesh.matrixWorld);
  for (let index = 0; index < count; index += 1) {
    vector.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
    positions.set([vector.x, vector.y, vector.z], index * 3);
    if (normal !== null) {
      vector.fromBufferAttribute(normal, index).applyMatrix3(normalMatrix).normalize();
      normals.set([vector.x, vector.y, vector.z], index * 3);
    }
  }
  let uvs: Float32Array | null = null;
  if (uv !== null) {
    uvs = new Float32Array(count * 2);
    for (let index = 0; index < count; index += 1) uvs.set([uv.getX(index), uv.getY(index)], index * 2);
  }
  const indexAttribute = geometry.getIndex();
  let indices: Uint32Array | null = null;
  if (indexAttribute !== null) {
    indices = new Uint32Array(indexAttribute.count);
    for (let index = 0; index < indexAttribute.count; index += 1) indices[index] = indexAttribute.getX(index);
  }
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return {
    positions,
    normals: normal === null ? null : normals,
    uvs,
    indices,
    materialName: material?.name ?? null,
  };
};

export type FlattenedTemplate = Readonly<{
  input: TemplateGeometryInput;
  materials: Map<string, Material>;
  lightNodes: Set<string>;
}>;

/**
 * Flattens a loaded glTF scene into resize-engine input (node world transforms applied, including any
 * HomeplanRoot normalization node). Node rules come from node extras, or from `rulesByName` when given
 * (the Object Editor's draft rules); either way the nearest ancestor-or-self rule applies.
 */
export const flattenTemplate = (
  gltf: GLTF,
  rulesByName?: Readonly<Record<string, NodeRule>>,
): FlattenedTemplate => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const associations = gltf.parser.associations;
  const isNode = (object: Object3D): boolean => associations.get(object)?.nodes !== undefined;
  const nearest = <T>(object: Object3D, pick: (candidate: Object3D) => T | undefined): T | undefined => {
    for (
      let current: Object3D | null = object;
      current !== null && current !== scene;
      current = current.parent
    ) {
      const value = pick(current);
      if (value !== undefined) return value;
    }
    return undefined;
  };
  const nodes = new Map<string, { meshes: TemplateMeshInput[]; origin?: TemplateVec3; rule?: NodeRule }>();
  const materials = new Map<string, Material>();
  const lightNodes = new Set<string>();
  const nodeOf = (name: string): { meshes: TemplateMeshInput[]; origin?: TemplateVec3; rule?: NodeRule } => {
    const existing = nodes.get(name);
    if (existing !== undefined) return existing;
    const created: { meshes: TemplateMeshInput[]; origin?: TemplateVec3; rule?: NodeRule } = { meshes: [] };
    nodes.set(name, created);
    return created;
  };
  const ruleOf = (object: Object3D): NodeRule | undefined =>
    nearest(object, (candidate) =>
      rulesByName === undefined
        ? parseNodeRule(homeplanExtras(candidate.userData)).rule
        : rulesByName[candidate.name],
    );

  const meshless: Object3D[] = [];
  scene.traverse((object) => {
    if (isMesh(object)) {
      const node = nearest(object, (candidate) => (isNode(candidate) ? candidate : undefined)) ?? object;
      const input = meshInput(object);
      if (input === null) return;
      const entry = nodeOf(node.name);
      entry.meshes.push(input);
      const rule = ruleOf(node);
      if (rule !== undefined) entry.rule = rule;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      if (material !== undefined && material.name !== "") materials.set(material.name, material);
      return;
    }
    if (object instanceof Light && isNode(object)) lightNodes.add(object.name);
    if (isNode(object)) meshless.push(object);
  });
  for (const object of meshless) {
    const entry = nodeOf(object.name);
    if (entry.meshes.length > 0) continue;
    const origin = new Vector3().setFromMatrixPosition(object.matrixWorld);
    entry.origin = [origin.x, origin.y, origin.z];
    const rule = ruleOf(object);
    if (rule !== undefined) entry.rule = rule;
  }
  const list: TemplateNodeInput[] = [...nodes.entries()].map(([name, node]) => ({
    name,
    meshes: node.meshes,
    ...(node.origin === undefined ? {} : { origin: node.origin }),
    ...(node.rule === undefined ? {} : { rule: node.rule }),
  }));
  return { input: { nodes: list }, materials, lightNodes };
};

export const disposeGltf = (gltf: GLTF): void => {
  gltf.scene.traverse((object) => {
    if (!isMesh(object)) return;
    object.geometry.dispose();
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) disposeMaterial(material);
  });
};

export const createTemplateCache = (
  templateUrl: (templateId: string, version: number) => string,
  onChange: () => void,
  readAsset?: AssetReader,
  staged?: TemplateLoading,
): TemplateCache => {
  const loader = new GLTFLoader();
  const entries = new Map<string, Entry>();
  let disposed = false;

  const load = (key: string, templateId: string, version: number): Entry => {
    const entry: Entry = { state: { state: "loading" }, gltf: null, unused: [] };
    entries.set(key, entry);
    /** Read through a call: the cache may be disposed, or the entry replaced, while the load awaits. */
    const alive = (): boolean => !disposed && entries.get(key) === entry;
    const run = async (): Promise<void> => {
      if (!alive()) return;
      const started = performance.now();
      const url = templateUrl(templateId, version);
      try {
        const gltf = await (readAsset === undefined ? loader.loadAsync(url) : readGltf(url, readAsset));
        const materials = await allMaterials(gltf);
        if (!alive()) {
          disposeGltf(gltf);
          return;
        }
        const parsed = performance.now();
        entry.gltf = gltf;
        const validation = validateTemplateMetadata(homeplanExtras(gltf.scene.userData));
        if (validation.metadata === null) {
          const reason = validation.issues.map((issue) => `${issue.pointer} ${issue.message}`).join("; ");
          console.warn(
            `Viewport: template ${key} has invalid Homeplan metadata (${reason}); showing placeholders.`,
          );
          entry.state = { state: "failed", reason };
        } else {
          const flat = flattenTemplate(gltf);
          const used = new Set(flat.materials.values());
          const unused: Material[] = [];
          for (const material of materials) {
            if (used.has(material)) continue;
            unused.push(material);
            if (material.name !== "" && !flat.materials.has(material.name))
              flat.materials.set(material.name, material);
          }
          entry.unused = unused;
          entry.state = { state: "ready", asset: { metadata: validation.metadata, ...flat } };
        }
        staged?.onTiming?.({
          key,
          fetchParseMs: parsed - started,
          flattenMs: performance.now() - parsed,
        });
        onChange();
      } catch (error: unknown) {
        if (!alive()) return;
        const reason = error instanceof Error ? error.message : "load failed";
        console.warn(`Viewport: template ${key} could not be loaded (${reason}); showing placeholders.`);
        entry.state = { state: "failed", reason };
        onChange();
      }
    };
    if (staged === undefined) void run();
    else staged.queue.enqueue({ lane: staged.laneOf(templateId, version), kind: "template", run });
    return entry;
  };

  return {
    get: (templateId, version) => {
      const key = `${templateId}@${String(version)}`;
      return (entries.get(key) ?? load(key, templateId, version)).state;
    },
    peek: (templateId, version) => entries.get(`${templateId}@${String(version)}`)?.state ?? null,
    dispose: () => {
      disposed = true;
      for (const entry of entries.values()) {
        if (entry.gltf !== null) disposeGltf(entry.gltf);
        for (const material of entry.unused) disposeMaterial(material);
      }
      entries.clear();
    },
  };
};
