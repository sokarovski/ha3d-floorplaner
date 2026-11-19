// The north compass helper in the plan (excluded from exports like every overlay).
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { OverlayPrimitive } from "../../../renderer/runtimeTypes";
import { areaBounds } from "../tools/planGeometry";

export const compassOverlay = (
  floor: BuildingFloorValue | undefined,
  northRotationDeg: number,
): readonly OverlayPrimitive[] => {
  const bounds = floor === undefined ? undefined : areaBounds(floor.areas);
  const base = bounds === undefined ? { x: 1500, y: 1500 } : { x: bounds.maxX + 1500, y: bounds.maxY };
  const r = (northRotationDeg * Math.PI) / 180;
  const north = { x: Math.sin(r), y: Math.cos(r) };
  const side = { x: north.y, y: -north.x };
  const tip = { x: base.x + north.x * 900, y: base.y + north.y * 900 };
  const tail = { x: base.x - north.x * 300, y: base.y - north.y * 300 };
  return [
    { kind: "segment", from: tail, to: tip, tone: "danger" },
    {
      kind: "segment",
      from: tip,
      to: { x: tip.x - north.x * 250 + side.x * 150, y: tip.y - north.y * 250 + side.y * 150 },
      tone: "danger",
    },
    {
      kind: "segment",
      from: tip,
      to: { x: tip.x - north.x * 250 - side.x * 150, y: tip.y - north.y * 250 - side.y * 150 },
      tone: "danger",
    },
    { kind: "point", at: tip, marker: "dot", sizePx: 6, tone: "danger" },
  ];
};
