// The centre of a room's floor-shape bounds, in the room's own coordinates: where a new light, stair, or floor
// opening starts (Phase 5.12, 16.14).
import type { AreaValue } from "@shared/domain/schemas/area";
import { shapeOutline } from "@shared/geometry/shapeOutline";

export const roomCentre = (area: AreaValue): Readonly<{ x: number; y: number }> => {
  const points = area.floor.shapes.flatMap((shape) => shapeOutline(shape).ring);
  if (points.length === 0) return { x: 0, y: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
    y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2),
  };
};
