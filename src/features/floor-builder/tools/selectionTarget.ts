// Read-only hit testing for Select. Never starts an edit or changes selection.
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import { pointInRegion } from "@shared/geometry/region";
import { shapeOutline } from "@shared/geometry/shapeOutline";
import type { Vec2 } from "@shared/geometry/vector";
import type { RuntimePointerEvent } from "../../../renderer/runtimeTypes";
import { pickedEntity } from "./instanceDrag";
import { toAreaLocal } from "./planGeometry";
import { findHandle } from "./shapeEditing";
import { snapCapturePx } from "./snapping";
import { focusArea } from "./toolContext";
import type { ToolEnv } from "./toolTypes";

export const shapeAt = (shapes: readonly ShapeValue[], local: Vec2): ShapeValue | undefined => {
  for (let index = shapes.length - 1; index >= 0; index -= 1) {
    const shape = shapes[index];
    if (
      shape !== undefined &&
      pointInRegion(local, { polygons: [{ outer: shapeOutline(shape).ring, holes: [] }] })
    )
      return shape;
  }
  return undefined;
};

export const selectionTargetAt = (env: ToolEnv, event: RuntimePointerEvent): string | undefined => {
  const picked = pickedEntity(env, event);
  if (picked !== undefined) return picked.id;
  const hit = event.hit;
  const ui = env.session.ui.getState();
  if (hit?.kind === "helper") return hit.id;
  if (ui.mode === "overview") return hit?.kind === "wall" || hit?.kind === "floor" ? hit.areaId : undefined;
  const area = focusArea(env);
  if (area === undefined || event.plan === null) return undefined;
  const local = toAreaLocal(area, event.plan);
  const handle = findHandle(
    hit?.kind === "wall"
      ? area.floor.shapes.filter((shape) => ui.selection.includes(shape.id))
      : area.floor.shapes,
    local,
    snapCapturePx * env.runtime.worldUnitsPerPixel(),
    ui.selection[0],
    area.rotationDeg,
  );
  return (
    handle?.shapeId ??
    (hit?.kind === "wall" ? (hit.reliefId ?? hit.wallId) : shapeAt(area.floor.shapes, local)?.id)
  );
};
