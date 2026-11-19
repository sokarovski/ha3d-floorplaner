// Fence segments of a yard (Phase 17.2, spec/builder/features/yards.md#fences): derived, never persisted. Every
// straight wall of a yard is drawn as its yard's fence template, one instance per stretch of the wall that no gate
// (a door on the wall) covers: the wall's pieces (its span on the yard's outline) minus each gate's width at its
// place. Each instance is sized to its stretch (template x = the stretch length, y = the wall height), stands on
// the floor at h = 0 on the middle of the wall's band, and faces into the yard. Its posts or leaves repeat along
// the length by the template's own repeat rule (D17). Curved walls carry no fence (like openings, D20).
import {
  fenceStyleOf,
  fenceTemplates,
  fenceTemplateVersion,
  isYard,
  minFenceSegmentMm,
} from "@shared/domain/house/yards";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import { computeAreaFloorGeometry } from "./areaGeometry";
import type { Interval } from "./interval";
import type { Vec2 } from "./vector";

export type FenceSegment = Readonly<{
  /** Stable per wall and stretch: `<wallId>~fence~<index>`. */
  id: string;
  areaId: string;
  wallId: string;
  templateId: string;
  templateVersion: number;
  /** Stretch length (the template's x size) and the wall height (its y size), mm. */
  widthMm: number;
  heightMm: number;
  /** Bottom centre of the stretch on the band's middle line, floor frame (h = 0). */
  center: Vec2;
  /** Unit plan direction of the wall's source edge, and into the yard (the template front, +z). */
  direction: Vec2;
  front: Vec2;
}>;

const fenceIdSeparator = "~fence~";

/** The wall a fence segment ID belongs to, or null for any other ID. */
export const fenceWallIdOf = (segmentId: string): string | null => {
  const at = segmentId.indexOf(fenceIdSeparator);
  return at < 0 ? null : segmentId.slice(0, at);
};

/** `intervals` minus `cuts`, each sorted by start; pieces shorter than `minMm` are dropped. */
export const subtractIntervals = (
  intervals: readonly Interval[],
  cuts: readonly Interval[],
  minMm: number,
): Interval[] => {
  const sorted = [...cuts].sort((a, b) => a.fromMm - b.fromMm);
  const result: Interval[] = [];
  for (const interval of intervals) {
    let from = interval.fromMm;
    for (const cut of sorted) {
      if (cut.toMm <= from || cut.fromMm >= interval.toMm) continue;
      if (cut.fromMm - from >= minMm) result.push({ fromMm: from, toMm: cut.fromMm });
      from = Math.max(from, cut.toMm);
    }
    if (interval.toMm - from >= minMm) result.push({ fromMm: from, toMm: interval.toMm });
  }
  return result;
};

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && value > 0 ? value : fallback;

/** The fence segments of one area in the floor frame (none unless it is a yard). */
export const yardFenceSegments = (area: AreaValue): readonly FenceSegment[] => {
  if (!isYard(area)) return [];
  const templateId = fenceTemplates[fenceStyleOf(area)];
  const geometry = computeAreaFloorGeometry(area);
  const segments: FenceSegment[] = [];
  for (const realWall of geometry.realWalls) {
    if (realWall.arc !== null) continue;
    const wall = area.walls.find((candidate) => candidate.id === realWall.wallId);
    if (wall === undefined || wall.hidden === true) continue;
    const gates = wall.objects.map((opening): Interval => {
      const along = realWall.spanMm.fromMm + opening.placement.distanceAlongWallMm;
      const half = numberOr(opening.parameters.widthMm, 1000) / 2;
      return { fromMm: along - half, toMm: along + half };
    });
    const stretches = subtractIntervals(
      realWall.pieces.map((piece) => ({ fromMm: piece.fromMm, toMm: piece.toMm })),
      gates,
      minFenceSegmentMm,
    );
    const edge = realWall.edge;
    const middle = (realWall.interiorOffsetMm + realWall.exteriorOffsetMm) / 2;
    stretches.forEach((stretch, index) => {
      const along = (stretch.fromMm + stretch.toMm) / 2;
      segments.push({
        id: `${realWall.wallId}${fenceIdSeparator}${String(index)}`,
        areaId: area.id,
        wallId: realWall.wallId,
        templateId,
        templateVersion: fenceTemplateVersion,
        widthMm: stretch.toMm - stretch.fromMm,
        heightMm: wall.heightMm,
        center: {
          x: edge.start.x + edge.direction.x * along + edge.outwardNormal.x * middle,
          y: edge.start.y + edge.direction.y * along + edge.outwardNormal.y * middle,
        },
        direction: edge.direction,
        front: { x: -edge.outwardNormal.x, y: -edge.outwardNormal.y },
      });
    });
  }
  return segments;
};

/** Every fence segment of a floor. */
export const floorFenceSegments = (floor: Pick<BuildingFloorValue, "areas">): readonly FenceSegment[] =>
  floor.areas.flatMap(yardFenceSegments);
