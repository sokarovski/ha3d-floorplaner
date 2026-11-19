// Small Three.js object utilities shared by the scene layers.
import type { Object3D } from "three";
import { BufferGeometry, Mesh } from "three";

/** Three.js layer for editor helpers (grid, guides, outlines, overlays, selection); excluded from exports. */
export const helperLayer = 1;

export const markAsHelper = (object: Object3D): void => {
  object.traverse((child) => {
    child.layers.set(helperLayer);
  });
};

/** Disposes every geometry under an object. Materials are owned by caches or their layer and disposed there. */
export const disposeGeometries = (object: Object3D): void => {
  object.traverse((child) => {
    if ("geometry" in child && child.geometry instanceof BufferGeometry) child.geometry.dispose();
  });
};

export const detachAndDisposeGeometries = (object: Object3D): void => {
  object.removeFromParent();
  disposeGeometries(object);
};

export const isMesh = (object: Object3D): object is Mesh => object instanceof Mesh;
