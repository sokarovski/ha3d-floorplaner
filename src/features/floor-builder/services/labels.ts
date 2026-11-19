// Display labels for document entities.
import type { AreaValue } from "@shared/domain/schemas/area";
import type { WallValue } from "@shared/domain/schemas/wall";

const edgeNames: Readonly<Record<string, string>> = {
  bottom: "bottom",
  right: "right",
  top: "top",
  left: "left",
  arc: "curved",
};

export const wallLabel = (area: AreaValue, wall: WallValue, index: number): string => {
  const named = edgeNames[wall.sourceEdge.edge];
  const sameEdge = area.walls.filter(
    (candidate) =>
      candidate.sourceEdge.shapeId === wall.sourceEdge.shapeId &&
      candidate.sourceEdge.edge === wall.sourceEdge.edge,
  );
  const piece =
    sameEdge.length > 1 ? ` · ${String(sameEdge.indexOf(wall) + 1)}/${String(sameEdge.length)}` : "";
  // A yard's walls are its fences (Phase 17.2).
  const noun = area.kind === "yard" ? "Fence" : "Wall";
  return named === undefined ? `${noun} ${String(index + 1)}${piece}` : `${noun} (${named})${piece}`;
};
