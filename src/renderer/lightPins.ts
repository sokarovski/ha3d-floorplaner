// Light pins (Phase 5.11, owner H14): editor helpers that make lights easy to find, hover, and click at any
// zoom. Each light gets a screen-sized badge with its type's icon at the light, a stem down to the floor, and
// a floor dot; a linear light also gets a capsule along its strip. A selected light shows where it shines: a
// spot's beam ring or a linear light's footprint on the floor. Pins are helpers (never exported) and are hit
// in screen space by `pinDistancePx`, so a 12 mm strip is as easy to click as a 16 px wide bar.
import { BufferGeometry, Float32BufferAttribute, Group, Line, LineLoop, Points } from "three";
import { facingDirection, linearFacingDeg } from "@shared/domain/lighting/linearFacing";
import type { LightValue } from "@shared/domain/schemas/light";
import type { HelperMaterials } from "./helperMaterials";
import { helperRenderOrder } from "./helperMaterials";
import type { PlanPoint3, ScreenPoint } from "./runtimeTypes";
import { markAsHelper } from "./sceneObjects";

export type PinState = "normal" | "hovered" | "selected";

export type LightPin = Readonly<{
  group: Group;
  badge: Points;
  stem: Line | null;
  dot: Points;
  capsule: Line | null;
  footprint: LineLoop | null;
  kind: "point" | "spot" | "linear";
  /** The light in floor plan mm (x, y, h). */
  position: PlanPoint3;
  /** A linear light's strip ends, floor plan mm. */
  ends: readonly [PlanPoint3, PlanPoint3] | null;
  widthMm: number;
  lit: boolean;
}>;

const badgePx = { normal: 22, hovered: 27, selected: 24 } as const;
const badgeHitPx = 13;
const dotHitPx = 8;
const stemHitPx = 5;
/** A linear light's capsule is at least this wide on screen (half-width 8 px). */
const capsuleHalfPx = 8;
/** Footprint lines sit just above the floor. */
const floorLiftMm = 3;

const positionsOf = (points: readonly PlanPoint3[]): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      points.flatMap((p) => [p.x, p.y, p.h]),
      3,
    ),
  );
  return geometry;
};

const lineOf = (points: readonly PlanPoint3[]): Line => {
  const line = new Line(positionsOf(points));
  line.renderOrder = helperRenderOrder;
  return line;
};

const loopOf = (points: readonly PlanPoint3[]): LineLoop => {
  const loop = new LineLoop(positionsOf(points));
  loop.renderOrder = helperRenderOrder;
  return loop;
};

const pointsOf = (point: PlanPoint3): Points => {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([point.x, point.y, point.h], 3));
  const points = new Points(geometry);
  points.renderOrder = helperRenderOrder + 1;
  return points;
};

/** Where the light shines on the floor: a spot's beam ring, or a linear light's strip outline. */
const footprintPoints = (
  light: LightValue,
  position: PlanPoint3,
  heading: number,
): readonly PlanPoint3[] | null => {
  const h = position.h;
  if (h <= 0) return null;
  if (light.geometry.type === "spot") {
    const tilt = (light.spot.tiltDeg * Math.PI) / 180;
    if (tilt >= (80 * Math.PI) / 180) return null;
    const half = Math.min((light.spot.beamAngleDeg * Math.PI) / 360, (80 * Math.PI) / 180);
    const reach = h * Math.tan(tilt);
    const center = { x: position.x + Math.cos(heading) * reach, y: position.y + Math.sin(heading) * reach };
    const radius = h * Math.tan(half);
    return Array.from({ length: 48 }, (_, i) => {
      const angle = (i / 48) * Math.PI * 2;
      return {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
        h: floorLiftMm,
      };
    });
  }
  if (light.geometry.type === "linear") {
    // A strip facing sideways (Phase 13.3) lands beside itself; one shining near-horizontal or up shows none.
    const facing = facingDirection((heading * 180) / Math.PI, linearFacingDeg(light));
    if (-facing.h <= Math.cos((80 * Math.PI) / 180)) return null;
    const shift = h / -facing.h;
    const centre = { x: position.x + facing.x * shift, y: position.y + facing.y * shift };
    const halfLength = light.geometry.lengthMm / 2;
    const halfWidth = Math.max(light.geometry.widthMm, 20) / 2;
    const ux = Math.cos(heading);
    const uy = Math.sin(heading);
    return (
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const
    ).map(([a, b]) => ({
      x: centre.x + ux * halfLength * a - uy * halfWidth * b,
      y: centre.y + uy * halfLength * a + ux * halfWidth * b,
      h: floorLiftMm,
    }));
  }
  return null;
};

export const buildLightPin = (
  light: LightValue,
  position: PlanPoint3,
  heading: number,
  lit: boolean,
): LightPin => {
  const group = new Group();
  group.name = `light-pin:${light.id}`;
  const kind = light.geometry.type;
  const badge = pointsOf(position);
  group.add(badge);
  const stem = position.h > 1 ? lineOf([position, { ...position, h: floorLiftMm }]) : null;
  if (stem !== null) {
    stem.computeLineDistances();
    group.add(stem);
  }
  const dot = pointsOf({ ...position, h: floorLiftMm });
  group.add(dot);
  let ends: readonly [PlanPoint3, PlanPoint3] | null = null;
  let capsule: Line | null = null;
  if (light.geometry.type === "linear") {
    const half = light.geometry.lengthMm / 2;
    ends = [
      { x: position.x - Math.cos(heading) * half, y: position.y - Math.sin(heading) * half, h: position.h },
      { x: position.x + Math.cos(heading) * half, y: position.y + Math.sin(heading) * half, h: position.h },
    ];
    capsule = lineOf(ends);
    group.add(capsule);
  }
  const footprintRing = footprintPoints(light, position, heading);
  const footprint = footprintRing === null ? null : loopOf(footprintRing);
  if (footprint !== null) {
    footprint.computeLineDistances();
    footprint.visible = false;
    group.add(footprint);
  }
  markAsHelper(group);
  return {
    group,
    badge,
    stem,
    dot,
    capsule,
    footprint,
    kind,
    position,
    ends,
    widthMm: light.geometry.type === "linear" ? light.geometry.widthMm : 0,
    lit,
  };
};

/** Applies a pin's look: amber when lit (grey when off), the strong accent on hover, the accent when selected. */
export const styleLightPin = (materials: HelperMaterials, pin: LightPin, state: PinState): void => {
  const tone =
    state === "hovered" ? "accentStrong" : state === "selected" ? "accent" : pin.lit ? "warning" : "neutral";
  const shape = pin.kind === "point" ? "pinPoint" : pin.kind === "spot" ? "pinSpot" : "pinLinear";
  pin.badge.material = materials.marker(shape, tone, badgePx[state]);
  pin.dot.material = materials.marker(
    "dot",
    state === "normal" ? "neutral" : tone,
    state === "normal" ? 6 : 8,
  );
  if (pin.stem !== null) pin.stem.material = materials.line(state === "normal" ? "neutral" : tone, true);
  if (pin.capsule !== null) pin.capsule.material = materials.line(tone, false);
  if (pin.footprint !== null) {
    pin.footprint.material = materials.line("accent", true);
    pin.footprint.visible = state === "selected";
  }
};

const segmentDistance = (p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / length2, 0), 1);
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
};

/**
 * How well a screen point hits a pin (lower is better), or null when it misses: the badge, a linear light's
 * capsule, the floor dot, then the stem.
 */
export const pinDistancePx = (
  pin: LightPin,
  screen: ScreenPoint,
  project: (point: PlanPoint3) => ScreenPoint | null,
  mmPerPx: number,
): number | null => {
  const scores: number[] = [];
  const badge = project(pin.position);
  if (badge !== null) {
    const d = Math.hypot(screen.x - badge.x, screen.y - badge.y);
    if (d <= badgeHitPx) scores.push(d);
  }
  if (pin.ends !== null) {
    const a = project(pin.ends[0]);
    const b = project(pin.ends[1]);
    if (a !== null && b !== null) {
      const d = segmentDistance(screen, a, b);
      if (d <= Math.max(capsuleHalfPx, pin.widthMm / 2 / mmPerPx)) scores.push(d);
    }
  }
  const floor = project({ ...pin.position, h: floorLiftMm });
  if (floor !== null) {
    const d = Math.hypot(screen.x - floor.x, screen.y - floor.y);
    if (d <= dotHitPx) scores.push(d + 1);
    if (badge !== null && pin.stem !== null) {
      const s = segmentDistance(screen, badge, floor);
      if (s <= stemHitPx) scores.push(s + 2);
    }
  }
  return scores.length === 0 ? null : Math.min(...scores);
};
