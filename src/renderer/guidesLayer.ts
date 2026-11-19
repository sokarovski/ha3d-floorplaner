// Measurement guides of the active floor (D16): line guides as dashed lines across the view, point guides
// as X markers, in the guide color. Helpers: excluded from exports; pickable as `helper` hits.
import type { Object3D, Raycaster } from "three";
import { BufferGeometry, Float32BufferAttribute, Group, LineSegments, Points } from "three";
import type { GuideValue } from "@shared/domain/schemas/guide";
import type { HelperMaterials } from "./helperMaterials";
import { helperRenderOrder } from "./helperMaterials";
import { worldToPlan } from "./planFrame";
import type { PickHit } from "./runtimeTypes";
import { detachAndDisposeGeometries, markAsHelper } from "./sceneObjects";

export type GuidesLayer = Readonly<{
  root: Group;
  sync: (guides: readonly GuideValue[]) => void;
  pick: (raycaster: Raycaster) => PickHit | null;
  dispose: () => void;
}>;

/** Half-length of a rendered guide line: long enough to cross any view of one floor. */
const guideHalfLengthMm = 1_000_000;
const guideLiftMm = 5;

const lineGeometry = (guide: GuideValue): BufferGeometry | null => {
  const dx = guide.bMm.x - guide.aMm.x;
  const dy = guide.bMm.y - guide.aMm.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  const ux = (dx / length) * guideHalfLengthMm;
  const uy = (dy / length) * guideHalfLengthMm;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [guide.aMm.x - ux, guide.aMm.y - uy, guideLiftMm, guide.aMm.x + ux, guide.aMm.y + uy, guideLiftMm],
      3,
    ),
  );
  return geometry;
};

const pointGeometry = (x: number, y: number): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([x, y, guideLiftMm], 3));
  return geometry;
};

export const createGuidesLayer = (materials: HelperMaterials): GuidesLayer => {
  const root = new Group();
  root.name = "guides";
  let current: readonly GuideValue[] | null = null;
  const pickables = new Map<Object3D, string>();

  const clear = (): void => {
    for (const child of [...root.children]) detachAndDisposeGeometries(child);
    pickables.clear();
  };

  return {
    root,
    sync: (guides) => {
      if (guides === current) return;
      current = guides;
      clear();
      for (const guide of guides) {
        if (!guide.visible) continue;
        if (guide.kind === "line") {
          const geometry = lineGeometry(guide);
          if (geometry === null) continue;
          const line = new LineSegments(geometry, materials.line("guide", true));
          line.computeLineDistances();
          line.renderOrder = helperRenderOrder;
          line.frustumCulled = false;
          root.add(line);
          pickables.set(line, guide.id);
          const ends = new Points(
            new BufferGeometry().setFromPoints([]),
            materials.marker("cross", "guide", 10),
          );
          ends.geometry.setAttribute(
            "position",
            new Float32BufferAttribute(
              [guide.aMm.x, guide.aMm.y, guideLiftMm, guide.bMm.x, guide.bMm.y, guideLiftMm],
              3,
            ),
          );
          ends.renderOrder = helperRenderOrder;
          root.add(ends);
        } else {
          const marker = new Points(
            pointGeometry(guide.bMm.x, guide.bMm.y),
            materials.marker("cross", "guide", 14),
          );
          marker.renderOrder = helperRenderOrder;
          root.add(marker);
          pickables.set(marker, guide.id);
        }
      }
      markAsHelper(root);
    },
    pick: (raycaster) => {
      const hit = raycaster.intersectObjects([...pickables.keys()], false)[0];
      if (hit === undefined) return null;
      const id = pickables.get(hit.object);
      return id === undefined ? null : { kind: "helper", id, pointMm: worldToPlan(hit.point) };
    },
    dispose: () => {
      clear();
      root.removeFromParent();
    },
  };
};
