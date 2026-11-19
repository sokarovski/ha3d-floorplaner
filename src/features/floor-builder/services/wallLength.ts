// A wall's current length: its corner-attached span resolved on the source edge's current length.
import { indexEntities } from "@shared/domain/house/entityIndex";
import { resolveSpan, sourceEdgeLength } from "@shared/domain/house/wallSpan";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { WallValue } from "@shared/domain/schemas/wall";

export const wallLengthOf = (house: HouseDocument, areaId: string, wall: WallValue): number => {
  const area = indexEntities(house).get(areaId);
  if (area?.kind !== "area") return 0;
  const length = sourceEdgeLength(area.value.floor.shapes, wall);
  if (length === undefined) return 0;
  const span = resolveSpan(wall.spanMm, length);
  return Math.max(0, Math.min(length, span.end) - Math.max(0, span.start));
};
