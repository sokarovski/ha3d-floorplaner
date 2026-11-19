// Render-scene export for the photorealistic backend (spec/delivery/rendering-and-exports.md, D11):
// a binary glTF of the active floor's model content in world metres (y up), as server/render/render_scene.py
// imports it. Included: every visible mesh on the model layer (RealFloor, RealAllWalls, carpets, template
// instances, visible fixtures). Excluded: everything on the helper layer (grid, guides, overlays, outlines,
// markers, selection highlights) and the baseline sun/sky (the script adds its own sun and Nishita sky).
// Artificial lights are written as KHR_lights_punctual with physical candela (the preview calibration factor
// is removed); a linear light becomes evenly spaced point lights that share its total output (the preview's
// carriers, Phase 7.10, each exported as a point light of lumens / carriers, also when the preview does not draw
// them because its strip term carries all of the output; the strip term, Phase 12, is preview-only).
// Meshes keep their geometry; each copy carries its baked world transform, so nothing in the live scene is
// modified (shared geometries and materials are only referenced).
import type { Object3D } from "three";
import { Group, Mesh, Object3D as TargetObject, PointLight, Scene, SpotLight, Vector3 } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { lumensToCandela, previewPhotometricScale } from "./lightColor";
import { isShadowOnly } from "./floorScene";
import { linearSampleLumens } from "./lightsLayer";
import { isMesh } from "./sceneObjects";

const modelLayer = 0;

const visibleInTree = (object: Object3D): boolean => {
  for (let current: Object3D | null = object; current !== null; current = current.parent)
    if (!current.visible) return false;
  return true;
};

const bakedCopy = <T extends Object3D>(source: Object3D, copy: T): T => {
  source.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
  copy.name = source.name;
  return copy;
};

const spotCopy = (source: SpotLight): SpotLight => {
  const physical = source.intensity / previewPhotometricScale;
  const light = new SpotLight(source.color, physical, 0, source.angle, source.penumbra, 2);
  light.name = source.name;
  light.position.setFromMatrixPosition(source.matrixWorld);
  light.lookAt(new Vector3().setFromMatrixPosition(source.target.matrixWorld));
  // The exporter reads the direction from the light's orientation with a child target at (0, 0, −1).
  const target = new TargetObject();
  target.position.set(0, 0, -1);
  light.add(target);
  light.target = target;
  return light;
};

/** A linear light's preview sample as a point light of its share of the flux. */
const linearSampleCopy = (source: SpotLight, lumens: number): PointLight => {
  const light = new PointLight(source.color, lumensToCandela(lumens), 0, 2);
  light.name = source.name;
  light.position.setFromMatrixPosition(source.matrixWorld);
  return light;
};

/** Builds the export graph from the live scene (call with up-to-date world matrices). */
export const buildRenderScene = (scene: Scene): Scene => {
  const output = new Scene();
  const root = new Group();
  root.name = "HomeplanFloor";
  output.add(root);
  scene.traverse((object) => {
    // A linear carrier stands for its share of the light's whole output, drawn in the preview or not.
    if (object instanceof SpotLight) {
      const sampleLumens = linearSampleLumens(object);
      if (sampleLumens !== undefined) {
        if (sampleLumens > 0 && object.layers.isEnabled(modelLayer) && visibleInTree(object.parent ?? object))
          root.add(linearSampleCopy(object, sampleLumens));
        return;
      }
    }
    if (!object.layers.isEnabled(modelLayer) || !visibleInTree(object) || isShadowOnly(object)) return;
    if (isMesh(object)) {
      root.add(bakedCopy(object, new Mesh(object.geometry, object.material)));
    } else if (object instanceof SpotLight) {
      if (object.intensity > 0) root.add(spotCopy(object));
    } else if (object instanceof PointLight) {
      if (object.intensity > 0) {
        const light = new PointLight(object.color, object.intensity / previewPhotometricScale, 0, 2);
        light.name = object.name;
        light.position.setFromMatrixPosition(object.matrixWorld);
        root.add(light);
      }
    }
  });
  return output;
};

export const exportGlb = async (scene: Scene): Promise<Blob> => {
  const result = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true });
  if (!(result instanceof ArrayBuffer)) throw new Error("The glTF exporter did not return binary data.");
  return new Blob([result], { type: "model/gltf-binary" });
};
