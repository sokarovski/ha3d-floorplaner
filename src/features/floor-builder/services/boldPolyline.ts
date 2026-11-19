// Bold overlay lines (Phase 5.15). WebGL draws overlay lines one pixel wide, so a bold line is built as one
// filled strip per segment, `widthMm` wide, extended by half the width at both ends (square caps) so that
// corners between segments close without gaps.
import type { Vec2 } from "@shared/geometry/vector";
import type { OverlayPrimitive, OverlayTone } from "../../../renderer/runtimeTypes";

export const boldPolyline = (
  points: readonly Vec2[],
  widthMm: number,
  tone: OverlayTone,
): OverlayPrimitive[] => {
  const half = widthMm / 2;
  const strips: OverlayPrimitive[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < 1e-6) continue;
    const ux = (to.x - from.x) / length;
    const uy = (to.y - from.y) / length;
    // Along (u) and across (n = u turned 90°), each scaled by half the width.
    const ax = ux * half;
    const ay = uy * half;
    const nx = -uy * half;
    const ny = ux * half;
    strips.push({
      kind: "polygon",
      points: [
        { x: from.x - ax + nx, y: from.y - ay + ny },
        { x: from.x - ax - nx, y: from.y - ay - ny },
        { x: to.x + ax - nx, y: to.y + ay - ny },
        { x: to.x + ax + nx, y: to.y + ay + ny },
      ],
      fillOpacity: 1,
      outline: false,
      tone,
    });
  }
  return strips;
};
