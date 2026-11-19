// Moving building floors as groups (Phase 16.4, owner 2026-11-18; spec/builder/screens/floor-builder.md#whole-house-overview).
// Pure geometry for the builder's floor Move: each floor's slab outline in the house frame, and the snaps of a
// proposed move offset. Horizontal snaps register the moving floors' slab outlines on another floor's slab outline
// (corner on corner first, then corners on edges, up to two edges so a corner can land on a corner of two edges);
// with an axis lock, a moving corner aligns with another floor's corner along the axis. Vertical snaps (blue lock)
// put a moving floor's slab underside on another floor's wall tops, its wall tops under another floor's slab
// underside, or its finished floor level with another's. Snaps never apply to typed values (D16).
import { DraftSafeWeakMap } from "./draftSafeWeakMap";
import { floorPlacementOf, floorSlabOf, tallestWallMm } from "@shared/domain/house/floorPlacement";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { HouseDocument } from "@shared/domain/schemas/house";
import { slabCoverage } from "./floorSlab";
import type { Vec3 } from "./meshData";
import type { Bounds, Ring } from "./region";
import { regionRings } from "./region";
import type { Vec2 } from "./vector";

type PlacedFloor = BuildingFloorValue;

const localRings = new DraftSafeWeakMap<BuildingFloorValue["areas"], readonly Ring[]>();

/** The floor's slab outline rings (outer rings and holes) in its own frame, memoized by its areas. */
export const floorOutlineLocal = (floor: Pick<BuildingFloorValue, "areas">): readonly Ring[] => {
  const cached = localRings.get(floor.areas);
  if (cached !== undefined) return cached;
  const rings = regionRings(slabCoverage(floor));
  localRings.set(floor.areas, rings);
  return rings;
};

/** The floor's slab outline rings in the house frame, moved by an extra plan offset (a running move). */
export const floorOutlineInHouse = (floor: PlacedFloor, extra: Vec2 = { x: 0, y: 0 }): readonly Ring[] => {
  const placement = floorPlacementOf(floor);
  const dx = placement.xMm + extra.x;
  const dy = placement.yMm + extra.y;
  return floorOutlineLocal(floor).map((ring) => ring.map((point) => ({ x: point.x + dx, y: point.y + dy })));
};

/** Plan bounds of floors' slab outlines in the house frame, or undefined when none has an outline. */
export const floorsBoundsInHouse = (floors: readonly PlacedFloor[]): Bounds | undefined => {
  let bounds: Bounds | undefined;
  for (const floor of floors)
    for (const ring of floorOutlineInHouse(floor))
      for (const point of ring)
        bounds =
          bounds === undefined
            ? { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y }
            : {
                minX: Math.min(bounds.minX, point.x),
                minY: Math.min(bounds.minY, point.y),
                maxX: Math.max(bounds.maxX, point.x),
                maxY: Math.max(bounds.maxY, point.y),
              };
  return bounds;
};

/** How a floor move is constrained: on the plan (free), along red x or green y, or along blue (vertical). */
export type FloorMoveLock = "plane" | "x" | "y" | "vertical";

export type FloorMoveSnapLine = Readonly<{ from: Vec3; to: Vec3; kind: "edge" | "vertical" }>;

export type FloorMoveSnap = Readonly<{
  offset: Vec3;
  /** What the move snapped to ("" when it did not snap). */
  label: string;
  /** Cue lines from the snap target to the snapped point (house frame). */
  lines: readonly FloorMoveSnapLine[];
  /** The snapped point (house frame), when there is one. */
  marker: Vec3 | undefined;
}>;

export type FloorMoveSnapInput = Readonly<{
  house: Pick<HouseDocument, "defaultWallHeightMm">;
  /** The floors being moved, at their committed placements. */
  moving: readonly PlacedFloor[];
  /** The other floors: the snap references. */
  others: readonly PlacedFloor[];
  /** The proposed offset from the committed placements (mm, house frame). */
  raw: Vec3;
  lock: FloorMoveLock;
  /** Capture radius (mm) around the pointer. */
  radiusMm: number;
}>;

type Segment = Readonly<{ a: Vec2; b: Vec2; floor: PlacedFloor }>;
type Corner = Readonly<{ point: Vec2; floor: PlacedFloor }>;

const segmentsOf = (floor: PlacedFloor, rings: readonly Ring[]): Segment[] =>
  rings.flatMap((ring) =>
    ring.flatMap((a, index) => {
      const b = ring[(index + 1) % ring.length];
      return b === undefined || (a.x === b.x && a.y === b.y) ? [] : [{ a, b, floor }];
    }),
  );

const cornersOf = (floor: PlacedFloor, rings: readonly Ring[]): Corner[] =>
  rings.flatMap((ring) => ring.map((point) => ({ point, floor })));

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
const unit = (v: Vec2): Vec2 => {
  const length = Math.hypot(v.x, v.y);
  return length === 0 ? { x: 1, y: 0 } : { x: v.x / length, y: v.y / length };
};

/** The correction that puts `point` on segment ab (perpendicular, within the segment ± slack), or undefined. */
const ontoSegment = (point: Vec2, segment: Segment, slackMm: number): Vec2 | undefined => {
  const direction = sub(segment.b, segment.a);
  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) return undefined;
  const along = dot(sub(point, segment.a), direction) / length;
  if (along < -slackMm || along > length + slackMm) return undefined;
  const normal = { x: -direction.y / length, y: direction.x / length };
  const across = dot(sub(point, segment.a), normal);
  return { x: -normal.x * across, y: -normal.y * across };
};

type EdgeSnap = Readonly<{ correction: Vec2; direction: Vec2; target: Segment; at: Vec2 }>;

const elevationOf = (floor: PlacedFloor): number => floorPlacementOf(floor).elevationMm;

const noSnap = (offset: Vec3): FloorMoveSnap => ({ offset, label: "", lines: [], marker: undefined });

/** Horizontal registration of the moving outlines on the other floors' outlines. */
const planSnap = (input: FloorMoveSnapInput): FloorMoveSnap => {
  const { raw, radiusMm } = input;
  const shift = { x: raw.x, y: raw.y };
  const movingCorners = input.moving.flatMap((floor) => cornersOf(floor, floorOutlineInHouse(floor, shift)));
  const movingEdges = input.moving.flatMap((floor) => segmentsOf(floor, floorOutlineInHouse(floor, shift)));
  const targetCorners = input.others.flatMap((floor) => cornersOf(floor, floorOutlineInHouse(floor)));
  const targetEdges = input.others.flatMap((floor) => segmentsOf(floor, floorOutlineInHouse(floor)));
  const lineH = (floor: PlacedFloor): number => elevationOf(floor);

  // 1. A moving corner on another floor's corner.
  let corner: Readonly<{ from: Corner; to: Corner; distance: number }> | undefined;
  for (const from of movingCorners)
    for (const to of targetCorners) {
      const distance = Math.hypot(to.point.x - from.point.x, to.point.y - from.point.y);
      if (distance <= radiusMm && (corner === undefined || distance < corner.distance))
        corner = { from, to, distance };
    }
  if (corner !== undefined) {
    const correction = sub(corner.to.point, corner.from.point);
    const h = lineH(corner.to.floor);
    const marker = { ...corner.to.point, h };
    return {
      offset: { x: raw.x + correction.x, y: raw.y + correction.y, h: raw.h },
      label: `Corner of ${corner.to.floor.name}`,
      lines: [
        { from: marker, to: { ...corner.to.point, h: lineH(corner.from.floor) + raw.h }, kind: "edge" },
      ],
      marker,
    };
  }

  // 2. Corners on edges (moving corners on target edges, target corners on moving edges): the nearest one.
  const edgeSnaps = (offset: Vec2): EdgeSnap[] => {
    const snaps: EdgeSnap[] = [];
    for (const from of movingCorners) {
      const point = add(from.point, offset);
      for (const target of targetEdges) {
        const correction = ontoSegment(point, target, radiusMm);
        if (correction !== undefined)
          snaps.push({
            correction,
            direction: unit(sub(target.b, target.a)),
            target,
            at: add(point, correction),
          });
      }
    }
    for (const to of targetCorners)
      for (const edge of movingEdges) {
        const moved = { ...edge, a: add(edge.a, offset), b: add(edge.b, offset) };
        const toward = ontoSegment(to.point, moved, radiusMm);
        if (toward !== undefined)
          snaps.push({
            correction: { x: -toward.x, y: -toward.y },
            direction: unit(sub(edge.b, edge.a)),
            target: { a: to.point, b: to.point, floor: to.floor },
            at: to.point,
          });
      }
    return snaps.filter((snap) => Math.hypot(snap.correction.x, snap.correction.y) <= radiusMm);
  };
  const size = (v: Vec2): number => Math.hypot(v.x, v.y);
  const first = edgeSnaps({ x: 0, y: 0 }).sort((a, b) => size(a.correction) - size(b.correction))[0];
  if (first === undefined) return noSnap(raw);
  let correction = first.correction;
  let label = `Edge of ${first.target.floor.name}`;
  const lines: FloorMoveSnapLine[] = [];
  // 3. A second, non-parallel edge: slide along the first edge so the outlines register in both directions.
  const second = edgeSnaps(correction)
    .filter((snap) => Math.abs(cross(snap.direction, first.direction)) > 0.1)
    .map((snap) => {
      // Move along the first edge only, keeping the first contact: s · d1 with n2 · (s · d1) = n2 · c2.
      const normal = { x: -snap.direction.y, y: snap.direction.x };
      const along = dot(normal, snap.correction) / dot(normal, first.direction);
      return { snap, slide: { x: first.direction.x * along, y: first.direction.y * along } };
    })
    .filter((candidate) => size(candidate.slide) <= radiusMm)
    .sort((a, b) => size(a.slide) - size(b.slide))[0];
  if (second !== undefined) {
    correction = add(correction, second.slide);
    label = `Edges of ${first.target.floor.name}${second.snap.target.floor === first.target.floor ? "" : ` and ${second.snap.target.floor.name}`}`;
  }
  const at = add(first.at, second?.slide ?? { x: 0, y: 0 });
  const h = lineH(first.target.floor);
  lines.push({ from: { ...first.target.a, h }, to: { ...first.target.b, h }, kind: "edge" });
  if (second !== undefined) {
    const secondH = lineH(second.snap.target.floor);
    lines.push({
      from: { ...second.snap.target.a, h: secondH },
      to: { ...second.snap.target.b, h: secondH },
      kind: "edge",
    });
  }
  return {
    offset: { x: raw.x + correction.x, y: raw.y + correction.y, h: raw.h },
    label,
    lines,
    marker: { ...at, h },
  };
};

/** Along red or green only: a moving corner aligned with another floor's corner on that axis. */
const axisSnap = (input: FloorMoveSnapInput, axis: "x" | "y"): FloorMoveSnap => {
  const { raw, radiusMm } = input;
  const along = axis === "x" ? raw.x : raw.y;
  const locked: Vec3 = axis === "x" ? { x: raw.x, y: 0, h: raw.h } : { x: 0, y: raw.y, h: raw.h };
  const movingCorners = input.moving.flatMap((floor) => cornersOf(floor, floorOutlineInHouse(floor)));
  const targetCorners = input.others.flatMap((floor) => cornersOf(floor, floorOutlineInHouse(floor)));
  let best: Readonly<{ value: number; from: Corner; to: Corner }> | undefined;
  for (const from of movingCorners)
    for (const to of targetCorners) {
      const value = axis === "x" ? to.point.x - from.point.x : to.point.y - from.point.y;
      if (Math.abs(value - along) > radiusMm) continue;
      if (best === undefined || Math.abs(value - along) < Math.abs(best.value - along))
        best = { value, from, to };
    }
  if (best === undefined) return noSnap(locked);
  const offset: Vec3 = axis === "x" ? { x: best.value, y: 0, h: raw.h } : { x: 0, y: best.value, h: raw.h };
  const moved = { x: best.from.point.x + offset.x, y: best.from.point.y + offset.y };
  const h = elevationOf(best.from.floor) + raw.h;
  return {
    offset,
    label: `In line with a corner of ${best.to.floor.name}`,
    lines: [{ from: { ...best.to.point, h: elevationOf(best.to.floor) }, to: { ...moved, h }, kind: "edge" }],
    marker: { ...moved, h },
  };
};

/** Along blue: slab underside on wall tops, wall tops under a slab, or level with another finished floor. */
const verticalSnap = (input: FloorMoveSnapInput): FloorMoveSnap => {
  const { raw, radiusMm, house } = input;
  const locked: Vec3 = { x: 0, y: 0, h: raw.h };
  type Candidate = Readonly<{ value: number; label: string; at: number }>;
  const candidates: Candidate[] = [];
  for (const moving of input.moving) {
    const elevation = elevationOf(moving);
    const slab = floorSlabOf(moving).thicknessMm;
    const walls = tallestWallMm(moving, house);
    for (const other of input.others) {
      const otherElevation = elevationOf(other);
      const otherTop = otherElevation + tallestWallMm(other, house);
      const otherUnderside = otherElevation - floorSlabOf(other).thicknessMm;
      candidates.push(
        { value: otherTop - (elevation - slab), label: `Slab on the walls of ${other.name}`, at: otherTop },
        {
          value: otherUnderside - (elevation + walls),
          label: `Walls under the slab of ${other.name}`,
          at: otherUnderside,
        },
        { value: otherElevation - elevation, label: `Level with ${other.name}`, at: otherElevation },
      );
    }
  }
  const best = candidates
    .filter((candidate) => Math.abs(candidate.value - raw.h) <= radiusMm)
    .sort((a, b) => Math.abs(a.value - raw.h) - Math.abs(b.value - raw.h))[0];
  if (best === undefined) return noSnap(locked);
  return { offset: { x: 0, y: 0, h: best.value }, label: best.label, lines: [], marker: undefined };
};

/** The snapped offset for a floor move (no snapping when no other floor is a reference). */
export const snapFloorMove = (input: FloorMoveSnapInput): FloorMoveSnap => {
  if (input.others.length === 0 || input.moving.length === 0)
    return noSnap(
      input.lock === "vertical"
        ? { x: 0, y: 0, h: input.raw.h }
        : input.lock === "x"
          ? { x: input.raw.x, y: 0, h: 0 }
          : input.lock === "y"
            ? { x: 0, y: input.raw.y, h: 0 }
            : input.raw,
    );
  if (input.lock === "vertical") return verticalSnap(input);
  if (input.lock === "x" || input.lock === "y") return axisSnap(input, input.lock);
  return planSnap(input);
};
