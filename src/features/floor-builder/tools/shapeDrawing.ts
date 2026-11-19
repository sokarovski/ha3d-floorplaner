// Shared helpers for drawing tools: rectangle previews and typed size pairs. Point snapping lives in the
// inference engine (../inference).
import type { Vec2 } from "@shared/geometry/vector";
import type { AreaValue } from "@shared/domain/schemas/area";
import { toFloor } from "./planGeometry";

/** Area-local rectangle edges for previews, mapped back to floor coordinates. */
export const localRectangleInFloor = (area: AreaValue, a: Vec2, b: Vec2): readonly Vec2[] => [
  toFloor(area, a),
  toFloor(area, { x: b.x, y: a.y }),
  toFloor(area, b),
  toFloor(area, { x: a.x, y: b.y }),
];

/** Parses "4525 x 1428", "4.5m,1.4m", or one value (square) into two lengths with the shared parser. */
export const splitPair = (typed: string): readonly [string, string | undefined] => {
  const parts = typed.split(/\s*[x×,;*]\s*/i).filter((part) => part !== "");
  return [parts[0] ?? "", parts[1]];
};
