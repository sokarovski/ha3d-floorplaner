// Tool-preview overlay primitives in plan mm, rebuilt whenever the host replaces the overlay list.
// Drawn on top of the model (no depth test) and excluded from exports.
import type { Material } from "three";
import { BufferGeometry, Float32BufferAttribute, Group, LineSegments, Mesh, Points } from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { planPoint3, polylineSegments, regionFill } from "./geometryBuffers";
import type { HelperMaterials } from "./helperMaterials";
import { helperRenderOrder } from "./helperMaterials";
import type { OverlayPrimitive } from "./runtimeTypes";
import { detachAndDisposeGeometries, markAsHelper } from "./sceneObjects";

export type OverlayLayer = Readonly<{
  root: Group;
  set: (overlay: readonly OverlayPrimitive[]) => void;
  dispose: () => void;
}>;

const lineObject = (
  geometry: BufferGeometry,
  materials: HelperMaterials,
  dashed: boolean,
  primitive: OverlayPrimitive,
  widthPx = 1,
): LineSegments | LineSegments2 => {
  if (widthPx > 1) {
    // A wide line (Phase 19.5): screen-space segments `widthPx` CSS pixels wide, the same pairs of points.
    const position = geometry.getAttribute("position");
    const wide = new LineSegmentsGeometry();
    wide.setPositions(Array.from(position.array));
    geometry.dispose();
    const line = new LineSegments2(wide, materials.wideLine(primitive.tone ?? "accent", dashed, widthPx));
    if (dashed) line.computeLineDistances();
    return line;
  }
  const line = new LineSegments(geometry, materials.line(primitive.tone ?? "accent", dashed));
  if (dashed) line.computeLineDistances();
  return line;
};

export const createOverlayLayer = (materials: HelperMaterials): OverlayLayer => {
  const root = new Group();
  root.name = "overlay";
  let current: readonly OverlayPrimitive[] = [];
  let ownedMaterials: Material[] = [];

  const clear = (): void => {
    for (const child of [...root.children]) detachAndDisposeGeometries(child);
    for (const material of ownedMaterials) material.dispose();
    ownedMaterials = [];
  };

  const build = (primitive: OverlayPrimitive): (LineSegments | LineSegments2 | Mesh | Points)[] => {
    switch (primitive.kind) {
      case "segment":
        return [
          lineObject(
            polylineSegments([primitive.from, primitive.to], false),
            materials,
            primitive.dashed ?? false,
            primitive,
            primitive.widthPx,
          ),
        ];
      case "polyline":
        return primitive.points.length < 2
          ? []
          : [
              lineObject(
                polylineSegments(primitive.points, primitive.closed ?? false),
                materials,
                primitive.dashed ?? false,
                primitive,
                primitive.widthPx,
              ),
            ];
      case "verticalLine":
        return [
          lineObject(
            polylineSegments(
              [
                { ...primitive.at, h: primitive.fromHMm },
                { ...primitive.at, h: primitive.toHMm },
              ],
              false,
            ),
            materials,
            primitive.dashed ?? false,
            primitive,
          ),
        ];
      case "polygon": {
        if (primitive.points.length < 3) return [];
        const hMm = primitive.hMm ?? 0;
        const fill = materials.fill(primitive.tone ?? "accent", primitive.fillOpacity ?? 0.18);
        ownedMaterials.push(fill);
        const objects: (LineSegments | Mesh)[] = [
          new Mesh(
            regionFill({ polygons: [{ outer: primitive.points, holes: primitive.holes ?? [] }] }, hMm),
            fill,
          ),
        ];
        if (primitive.outline ?? true)
          for (const ring of [primitive.points, ...(primitive.holes ?? [])])
            objects.push(
              lineObject(
                polylineSegments(
                  ring.map((point) => ({ ...point, h: hMm })),
                  true,
                ),
                materials,
                false,
                primitive,
              ),
            );
        return objects;
      }
      case "point": {
        const at = planPoint3(primitive.at);
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute([at.x, at.y, at.h], 3));
        return [
          new Points(
            geometry,
            materials.marker(primitive.marker ?? "dot", primitive.tone ?? "accent", primitive.sizePx ?? 10),
          ),
        ];
      }
    }
  };

  return {
    root,
    set: (overlay) => {
      if (overlay === current) return;
      current = overlay;
      clear();
      for (const primitive of overlay) {
        for (const object of build(primitive)) {
          object.renderOrder = helperRenderOrder + 1;
          object.frustumCulled = false;
          root.add(object);
        }
      }
      markAsHelper(root);
    },
    dispose: () => {
      clear();
      root.removeFromParent();
    },
  };
};
