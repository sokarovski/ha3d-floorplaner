// Light handles (Phase 5.12, owner H14): a selected light shows one handle per placement property, so
// nothing has to be typed in the panel. Move (the floor cross) moves it in the plan; Raise (the dot on the
// stem) sets its height; Stretch (a linear light's two ends) changes its length; Aim (the ring where a spot
// points) sets heading and tilt together; Face (Phase 13.3, the arrow from a linear light's middle in the
// direction it shines) turns its facing about the strip's own axis in 15° steps. Turning is the Rotate tool's
// job, as for everything else (owner, Phase 5 follow-up). Click–lock–type–commit as everywhere: Ctrl free,
// Option stretches about the centre, typed values commit with Enter. Raise applies to every selected light.
// Each drag is one undo step. A light just added from the tree follows the pointer until a click places it.
import { updateLightsCommand } from "@shared/domain/commands/furnishingCommands";
import type { LightPatch } from "@shared/domain/commands/furnishingCommands";
import { effectiveWallHeightMm } from "@shared/domain/house/defaults";
import {
  facingDirection,
  facingFromCrossSection,
  linearFacingDeg,
} from "@shared/domain/lighting/linearFacing";
import { indexEntities } from "@shared/domain/house/entityIndex";
import { lightFloorPoint } from "@shared/domain/lighting/wallMount";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { LightValue } from "@shared/domain/schemas/light";
import { normalizeDegrees, parseAngle } from "@shared/domain/units/angles";
import { formatLength, parseLength } from "@shared/domain/units/lengthUnits";
import type { Vec2 } from "@shared/geometry/vector";
import type { OverlayPrimitive, PlanPoint3, RuntimePointerEvent } from "../../../renderer/runtimeTypes";
import { inferFloorPoint } from "../inference/toolInference";
import { lightTopLimitMm } from "@shared/geometry/roofItems";
import { heightToleranceMm } from "@shared/geometry/tolerances";
import { hoveredHandle } from "../services/handleHover";
import { toAreaLocal } from "./planGeometry";
import { resizeCursorBetween } from "./resizeCursor";
import { areaById, finishTool, floorOf, houseOf, unitOf } from "./toolContext";
import type { ToolEnv, ViewportCursor } from "./toolTypes";

/** The Aim ring's screen radius; inside the inner radius the Move dot wins. */
export const lightAimRingPx = 16;
const moveHitPx = 7;
const handleHitPx = 11;
const heightSnapPx = 10;
const minLengthMm = 50;
const maxTiltDeg = 80;
/** The Face arrow's screen length, and its snap step unless Ctrl is held. */
const faceArrowPx = 44;
const faceSnapDeg = 15;

type Selected = Readonly<{ area: AreaValue; light: LightValue }>;

export type LightHandle = "move" | "raise" | "stretchStart" | "stretchEnd" | "aim" | "face";

type LightOp = {
  handle: LightHandle;
  targets: readonly Selected[];
  primary: Selected;
  screen: Readonly<{ x: number; y: number }>;
  alternate: boolean;
  /** Patches per light from the latest pointer position or typed value; committed on click/Enter. */
  patches: ReadonlyMap<string, LightPatch>;
  readout: string;
  overlay: readonly OverlayPrimitive[];
  /** Placing a newly added light (follows the pointer until a click). */
  placing: boolean;
};

const radians = (degrees: number): number => (degrees * Math.PI) / 180;
const degrees = (rad: number): number => (rad * 180) / Math.PI;
const normalizeDeg = (value: number): number => ((value % 360) + 360) % 360;
const roundTenth = (value: number): number => Math.round(value * 10) / 10;

/** The light's plan point: a wall-mounted light's point on its face (Phase 17.3), else its stored position. */
export const lightFloorPosition = (area: AreaValue, light: LightValue): Vec2 => {
  const point = lightFloorPoint(area, light);
  return { x: point.x, y: point.y };
};

export const lightFloorHeadingDeg = (area: AreaValue, light: LightValue): number =>
  area.rotationDeg + light.rotationDeg;

const direction = (headingDeg: number): Vec2 => ({
  x: Math.cos(radians(headingDeg)),
  y: Math.sin(radians(headingDeg)),
});

/** A spot's aim point on the floor (null when it points too far from straight down to land in the room). */
export const spotAimPoint = (area: AreaValue, light: LightValue): Vec2 | null => {
  if (light.geometry.type !== "spot" || light.spot.tiltDeg >= maxTiltDeg) return null;
  const position = lightFloorPosition(area, light);
  const reach = light.elevationMm * Math.tan(radians(light.spot.tiltDeg));
  const dir = direction(lightFloorHeadingDeg(area, light));
  return { x: position.x + dir.x * reach, y: position.y + dir.y * reach };
};

/** A linear light's middle (floor mm with height) and the tip of its Face arrow at `facingDeg`. */
const faceArrow = (
  area: AreaValue,
  light: LightValue,
  facingDeg: number,
  mmPerPx: number,
): Readonly<{ middle: PlanPoint3; tip: PlanPoint3 }> => {
  const middle = { ...lightFloorPosition(area, light), h: light.elevationMm };
  const facing = facingDirection(lightFloorHeadingDeg(area, light), facingDeg);
  const length = faceArrowPx * mmPerPx;
  return {
    middle,
    tip: {
      x: middle.x + facing.x * length,
      y: middle.y + facing.y * length,
      h: middle.h + facing.h * length,
    },
  };
};

/** The Face arrow: shaft, head, and grip dot. */
const faceArrowOverlay = (
  area: AreaValue,
  light: LightValue,
  facingDeg: number,
  mmPerPx: number,
  tone: "accent" | "accentStrong",
): OverlayPrimitive[] => {
  const { middle, tip } = faceArrow(area, light, facingDeg, mmPerPx);
  const heading = lightFloorHeadingDeg(area, light);
  const back = facingDirection(heading, facingDeg);
  const across = facingDirection(heading, facingDeg + 90);
  const head = 9 * mmPerPx;
  const barb = (sign: number): PlanPoint3 => ({
    x: tip.x - back.x * head + across.x * head * 0.5 * sign,
    y: tip.y - back.y * head + across.y * head * 0.5 * sign,
    h: tip.h - back.h * head + across.h * head * 0.5 * sign,
  });
  return [
    { kind: "segment", from: middle, to: tip, tone },
    { kind: "segment", from: barb(1), to: tip, tone },
    { kind: "segment", from: barb(-1), to: tip, tone },
    { kind: "point", at: tip, marker: tone === "accentStrong" ? "dotBold" : "dot", sizePx: 8, tone },
  ];
};

/** The circle the Face arrow turns on (across the strip, through its middle). */
const faceCircle = (area: AreaValue, light: LightValue, mmPerPx: number): OverlayPrimitive => ({
  kind: "polyline",
  points: Array.from({ length: 48 }, (_, i) => faceArrow(area, light, (i / 48) * 360, mmPerPx).tip),
  closed: true,
  dashed: true,
  tone: "accent",
});

/** Every handle of one light, in floor mm with height. */
export const lightHandlePoints = (
  area: AreaValue,
  light: LightValue,
  topView: boolean,
  mmPerPx: number,
): ReadonlyMap<LightHandle, PlanPoint3> => {
  const position = lightFloorPosition(area, light);
  const heading = lightFloorHeadingDeg(area, light);
  const dir = direction(heading);
  const handles = new Map<LightHandle, PlanPoint3>([["move", { ...position, h: 0 }]]);
  // Raise works along the vertical, which Top view sees end-on.
  if (!topView) handles.set("raise", { ...position, h: light.elevationMm / 2 });
  if (light.geometry.type === "linear") {
    const half = light.geometry.lengthMm / 2;
    handles.set("stretchStart", {
      x: position.x - dir.x * half,
      y: position.y - dir.y * half,
      h: light.elevationMm,
    });
    handles.set("stretchEnd", {
      x: position.x + dir.x * half,
      y: position.y + dir.y * half,
      h: light.elevationMm,
    });
  }
  const aim = spotAimPoint(area, light);
  if (aim !== null) handles.set("aim", { ...aim, h: 0 });
  // Top view sees the arrow from above: only a strip shining well to one side shows it clear of Move.
  const facing = linearFacingDeg(light);
  if (light.geometry.type === "linear" && (!topView || Math.abs(Math.sin(radians(facing))) >= 0.5))
    handles.set("face", faceArrow(area, light, facing, mmPerPx).tip);
  return handles;
};

/** The handles of selected lights as overlay primitives (drawn while no handle operation runs). */
export const lightHandlesOverlay = (
  area: AreaValue,
  light: LightValue,
  mmPerPx: number,
  topView: boolean,
): OverlayPrimitive[] => {
  const overlay: OverlayPrimitive[] = [];
  for (const [handle, at] of lightHandlePoints(area, light, topView, mmPerPx)) {
    if (handle === "move") overlay.push({ kind: "point", at, marker: "cross", sizePx: 12, tone: "accent" });
    else if (handle === "face")
      overlay.push(...faceArrowOverlay(area, light, linearFacingDeg(light), mmPerPx, "accent"));
    else if (handle === "raise")
      overlay.push({ kind: "point", at, marker: "dot", sizePx: 10, tone: "accent" });
    else if (handle === "aim") overlay.push(...aimRing(at, mmPerPx, "accent"));
    else overlay.push({ kind: "point", at, marker: "dot", sizePx: 10, tone: "accent" });
  }
  return overlay;
};

const aimRing = (at: PlanPoint3, mmPerPx: number, tone: "accent" | "accentStrong"): OverlayPrimitive[] => {
  const radius = lightAimRingPx * mmPerPx;
  return [
    {
      kind: "polyline",
      points: Array.from({ length: 32 }, (_, i) => ({
        x: at.x + Math.cos((i / 32) * Math.PI * 2) * radius,
        y: at.y + Math.sin((i / 32) * Math.PI * 2) * radius,
        h: 3,
      })),
      closed: true,
      tone,
    },
    { kind: "point", at, marker: "dot", sizePx: 6, tone },
  ];
};

export type LightSelectOps = Readonly<{
  isActive: () => boolean;
  hover: (event: RuntimePointerEvent) => boolean;
  down: (event: RuntimePointerEvent) => boolean;
  pointer: (event: RuntimePointerEvent) => void;
  key: (event: KeyboardEvent) => boolean;
  cancel: () => void;
}>;

export const createLightSelectOps = (env: ToolEnv): LightSelectOps => {
  let op: LightOp | undefined;
  let typed = "";
  let showingHover = false;

  const mmPerPx = (): number => env.runtime.worldUnitsPerPixel();
  const topView = (): boolean => env.session.ui.getState().viewMode === "top";

  const selectedLights = (): Selected[] => {
    const house = houseOf(env);
    const entities = indexEntities(house);
    return env.session.ui.getState().selection.flatMap((id) => {
      const ref = entities.get(id);
      if (ref?.kind !== "light") return [];
      const area = areaById(env, ref.areaId);
      return area === undefined ? [] : [{ area, light: ref.value }];
    });
  };

  /** The handle of the first selected light under the pointer (screen space). */
  const handleAt = (
    event: RuntimePointerEvent,
  ): Readonly<{ handle: LightHandle; target: Selected }> | undefined => {
    const [primary] = selectedLights();
    if (primary === undefined) return undefined;
    let best: { handle: LightHandle; distance: number } | undefined;
    for (const [handle, at] of lightHandlePoints(primary.area, primary.light, topView(), mmPerPx())) {
      const screen = env.runtime.screenPointOf(at);
      if (screen === null) continue;
      const distance = Math.hypot(screen.x - event.screen.x, screen.y - event.screen.y);
      const reach = handle === "move" ? moveHitPx : handle === "aim" ? lightAimRingPx + 3 : handleHitPx;
      if (distance > reach) continue;
      // The Move dot wins inside its radius, then the nearest handle.
      const score = handle === "move" ? distance - 100 : distance;
      if (best === undefined || score < best.distance) best = { handle, distance: score };
    }
    return best === undefined ? undefined : { handle: best.handle, target: primary };
  };

  const cursorFor = (handle: LightHandle, target: Selected): ViewportCursor => {
    if (handle === "raise") return "resizeNS";
    if (handle === "face") return "rotate";
    if (handle === "stretchStart" || handle === "stretchEnd") {
      const position = lightFloorPosition(target.area, target.light);
      const dir = direction(lightFloorHeadingDeg(target.area, target.light));
      return resizeCursorBetween(env.runtime, position, { x: position.x + dir.x, y: position.y + dir.y });
    }
    return "move";
  };

  const labelFor = (handle: LightHandle): string =>
    ({
      move: "Move light",
      raise: "Raise or lower (every selected light)",
      stretchStart: "Stretch (Option: about the centre)",
      stretchEnd: "Stretch (Option: about the centre)",
      aim: "Aim: drag where the spot should point",
      face: "Facing: turn where the strip shines (Ctrl: free)",
    })[handle];

  const clearHover = (): void => {
    if (!showingHover) return;
    showingHover = false;
    env.setOverlay([]);
    env.setCue(undefined);
    env.setCursor("default");
  };

  const end = (): void => {
    if (op?.placing === true) env.session.ui.setState({ placingLightId: undefined });
    op = undefined;
    typed = "";
    finishTool(env);
    env.setHint("");
  };

  /** Heights a Raise snaps to: the room's walls, the house default, other lights. */
  const heightSnaps = (target: Selected): number[] => [
    ...target.area.walls.map((wall) => wall.heightMm),
    effectiveWallHeightMm(houseOf(env)),
    ...(floorOf(env)?.areas.flatMap((area) => area.lights) ?? [])
      .filter((light) => light.id !== target.light.id)
      .map((light) => light.elevationMm),
  ];

  const typedAngle = (): number | undefined => {
    if (typed.trim() === "") return undefined;
    const parsed = parseAngle(typed);
    return parsed.ok ? parsed.degrees : undefined;
  };

  /**
   * The facing under the pointer: the pointer ray (through two of its points at different heights) meets the
   * plane across the strip at its middle. Seen along that plane (Top view, or a ray parallel to it), the
   * pointer's sideways offset over the arrow length gives the facing, keeping the current half (down or up).
   */
  const pointedFacing = (event: RuntimePointerEvent, target: Selected): number | null => {
    const { area, light } = target;
    const heading = lightFloorHeadingDeg(area, light);
    const along = direction(heading);
    const left = { x: -along.y, y: along.x };
    const middle = { ...lightFloorPosition(area, light), h: light.elevationMm };
    const near = env.runtime.planPointAt(event.screen.x, event.screen.y, middle.h);
    const far = env.runtime.planPointAt(event.screen.x, event.screen.y, middle.h - 1000);
    if (near === null) return null;
    if (far !== null) {
      const ray = { x: far.x - near.x, y: far.y - near.y, h: -1000 };
      const across = ray.x * along.x + ray.y * along.y;
      const offset = (near.x - middle.x) * along.x + (near.y - middle.y) * along.y;
      // A ray nearly parallel to the plane (more than ~85° from its normal) falls back to the side offset.
      if (Math.abs(across) > 0.09 * Math.hypot(ray.x, ray.y, ray.h)) {
        const t = -offset / across;
        const hit = { x: near.x + ray.x * t, y: near.y + ray.y * t, h: middle.h + ray.h * t };
        const side = (hit.x - middle.x) * left.x + (hit.y - middle.y) * left.y;
        const up = hit.h - middle.h;
        if (Math.hypot(side, up) > 1) return facingFromCrossSection(side, up);
      }
    }
    const side = ((near.x - middle.x) * left.x + (near.y - middle.y) * left.y) / (faceArrowPx * mmPerPx());
    const turn = degrees(Math.asin(Math.max(-1, Math.min(1, side))));
    const upward = Math.cos(radians(linearFacingDeg(light))) < 0;
    return normalizeDegrees(upward ? 180 - turn : turn);
  };

  const typedLength = (): number | undefined => {
    if (typed.trim() === "") return undefined;
    const parsed = parseLength(typed, unitOf(env));
    return parsed.ok ? parsed.millimeters : undefined;
  };

  /** Recomputes the running operation from a pointer event (or the last one, for typed values). */
  const update = (event: RuntimePointerEvent | undefined): void => {
    if (op === undefined) return;
    const { primary, handle } = op;
    const { area, light } = primary;
    const position = lightFloorPosition(area, light);
    const heading = lightFloorHeadingDeg(area, light);
    const dir = direction(heading);
    const unit = unitOf(env);
    const patches = new Map<string, LightPatch>();
    const overlay: OverlayPrimitive[] = [];
    /** The roof's underside over a wall-mounted light (Phase 19.5), or null (free lights: issue only). */
    const roofLimitOf = (candidate: LightValue): number | null => {
      const floor = floorOf(env);
      return candidate.mount !== "wall" || floor === undefined
        ? null
        : lightTopLimitMm(floor, area, candidate);
    };
    let readout = "";
    const ctrl = event?.ctrlKey ?? false;
    if (event !== undefined) {
      op.screen = event.screen;
      op.alternate = event.altKey;
    }
    const floorPoint = event?.plan ?? null;
    if (handle === "move") {
      if (floorPoint === null) return;
      const point = ctrl ? floorPoint : inferFloorPoint(env, floorPoint);
      const local = toAreaLocal(area, point);
      const positionMm = { x: Math.round(local.x), y: Math.round(local.y) };
      // A wall-mounted light stops under the roof (Phase 19.5): a place where it would be above the underside is
      // refused; it stays at its last place and the cross turns red.
      const roofTop = roofLimitOf({ ...light, positionMm });
      if (roofTop !== null && light.elevationMm > roofTop + heightToleranceMm) {
        overlay.push(...op.overlay.filter((primitive) => primitive.kind !== "point"), {
          kind: "point",
          at: { ...point, h: 0 },
          marker: "cross",
          sizePx: 12,
          tone: "danger",
        });
        env.setOverlay(overlay);
        env.setHint(`The roof is too low there for ${light.name}: it stays under the roof. Esc cancels.`);
        return;
      }
      patches.set(light.id, { positionMm });
      overlay.push(
        {
          kind: "segment",
          from: { ...point, h: 0 },
          to: { ...point, h: light.elevationMm },
          dashed: true,
          tone: "accent",
        },
        hoveredHandle({ ...point, h: 0 }, "cross", 12),
      );
    } else if (handle === "raise") {
      const typedHeight = typedLength();
      const pointed =
        typedHeight ??
        (event === undefined ? null : env.runtime.heightOnVertical(event.screen.x, event.screen.y, position));
      if (pointed === null) return;
      const reach = heightSnapPx * mmPerPx();
      const snap =
        typedHeight === undefined && !ctrl
          ? heightSnaps(primary).find((candidate) => Math.abs(candidate - pointed) <= reach)
          : undefined;
      // A wall-mounted light's Raise stops at the roof's underside over it (Phase 19.5), drawn as a dashed line.
      const roofTop = roofLimitOf(light);
      const height = Math.max(
        0,
        Math.round(
          Math.min(snap ?? pointed, roofTop === null ? Number.POSITIVE_INFINITY : Math.floor(roofTop)),
        ),
      );
      if (roofTop !== null)
        overlay.push({
          kind: "segment",
          from: { x: position.x - 150, y: position.y, h: roofTop },
          to: { x: position.x + 150, y: position.y, h: roofTop },
          dashed: true,
          tone: "warning",
        });
      const delta = height - light.elevationMm;
      for (const target of op.targets)
        patches.set(target.light.id, { elevationMm: Math.max(0, target.light.elevationMm + delta) });
      overlay.push(
        { kind: "segment", from: { ...position, h: 0 }, to: { ...position, h: height }, tone: "accent" },
        hoveredHandle({ ...position, h: height }),
      );
      readout = `h ${formatLength(height, unit)}`;
    } else if (handle === "stretchStart" || handle === "stretchEnd") {
      if (light.geometry.type !== "linear") return;
      const sign = handle === "stretchEnd" ? 1 : -1;
      const half = light.geometry.lengthMm / 2;
      const typedValue = typedLength();
      let along: number;
      if (typedValue !== undefined)
        along = op.alternate ? sign * (typedValue / 2) : sign * (typedValue - half);
      else {
        if (event === undefined) return;
        const atHeight = env.runtime.planPointAt(event.screen.x, event.screen.y, light.elevationMm);
        if (atHeight === null) return;
        const point = ctrl ? atHeight : inferFloorPoint(env, atHeight);
        along = (point.x - position.x) * dir.x + (point.y - position.y) * dir.y;
      }
      const fixed = op.alternate ? -along : -sign * half;
      const length = Math.max(minLengthMm, Math.abs(along - fixed));
      const centreAlong = op.alternate ? 0 : (fixed + (fixed + sign * length)) / 2;
      const centre = { x: position.x + dir.x * centreAlong, y: position.y + dir.y * centreAlong };
      const local = toAreaLocal(area, centre);
      patches.set(light.id, {
        lengthMm: Math.round(length),
        positionMm: { x: Math.round(local.x), y: Math.round(local.y) },
      });
      overlay.push({
        kind: "segment",
        from: {
          x: centre.x - dir.x * (length / 2),
          y: centre.y - dir.y * (length / 2),
          h: light.elevationMm,
        },
        to: { x: centre.x + dir.x * (length / 2), y: centre.y + dir.y * (length / 2), h: light.elevationMm },
        tone: "accentStrong",
      });
      readout = `L ${formatLength(length, unit)}`;
    } else if (handle === "aim") {
      if (floorPoint === null) return;
      const point = ctrl ? floorPoint : inferFloorPoint(env, floorPoint);
      const dx = point.x - position.x;
      const dy = point.y - position.y;
      const distance = Math.hypot(dx, dy);
      const tilt = Math.min(maxTiltDeg, degrees(Math.atan2(distance, Math.max(light.elevationMm, 1))));
      const aimHeading = distance < 1 ? heading : degrees(Math.atan2(dy, dx));
      patches.set(light.id, {
        tiltDeg: roundTenth(tilt),
        rotationDeg: roundTenth(normalizeDeg(aimHeading - area.rotationDeg)),
      });
      overlay.push(
        {
          kind: "segment",
          from: { ...position, h: light.elevationMm },
          to: { ...point, h: 0 },
          dashed: true,
          tone: "accent",
        },
        ...aimRing({ ...point, h: 0 }, mmPerPx(), "accentStrong"),
      );
      readout = `tilt ${tilt.toFixed(1)}° · ${normalizeDeg(aimHeading).toFixed(0)}°`;
    } else {
      if (light.geometry.type !== "linear") return;
      const typedFacing = typedAngle();
      const pointed = typedFacing ?? (event === undefined ? null : pointedFacing(event, primary));
      if (pointed === null) return;
      const snapped =
        typedFacing === undefined && !ctrl ? Math.round(pointed / faceSnapDeg) * faceSnapDeg : pointed;
      const facing = Math.round(normalizeDegrees(snapped)) % 360;
      patches.set(light.id, { facingDeg: facing });
      overlay.push(
        faceCircle(area, light, mmPerPx()),
        ...faceArrowOverlay(area, light, facing, mmPerPx(), "accentStrong"),
      );
      readout = `facing ${String(facing)}°`;
    }
    op.patches = patches;
    op.overlay = overlay;
    // The light itself moves live (owner, Phase 5 follow-up).
    const floorId = env.session.ui.getState().activeFloorId;
    env.session.preview(
      updateLightsCommand(
        floorId,
        op.targets.flatMap((target) => {
          const patch = patches.get(target.light.id);
          return patch === undefined ? [] : [{ areaId: target.area.id, lightId: target.light.id, patch }];
        }),
        "Preview",
      ),
    );
    op.readout = typed.trim() === "" ? readout : `${typed}  =  ${readout}`;
    env.setOverlay(overlay);
    if (op.readout !== "") env.setReadout({ text: op.readout, screen: op.screen });
    env.setHint(
      op.placing
        ? "Placing the new light: click to place it. Esc leaves it at the room's centre."
        : `${labelFor(handle)}. Click to place; type a value and Enter. Esc cancels.`,
    );
  };

  const commit = (): void => {
    const current = op;
    end();
    if (current === undefined || current.patches.size === 0) return;
    const floorId = env.session.ui.getState().activeFloorId;
    const updates = current.targets.flatMap((target) => {
      const patch = current.patches.get(target.light.id);
      return patch === undefined ? [] : [{ areaId: target.area.id, lightId: target.light.id, patch }];
    });
    const label = {
      move: current.placing ? "Place light" : "Move light",
      raise: updates.length > 1 ? "Raise lights" : "Raise light",
      stretchStart: "Stretch light",
      stretchEnd: "Stretch light",
      aim: "Aim spot",
      face: "Turn light facing",
    }[current.handle];
    env.session.execute(updateLightsCommand(floorId, updates, label));
  };

  const start = (
    handle: LightHandle,
    primary: Selected,
    event: RuntimePointerEvent,
    placing: boolean,
  ): void => {
    const all = selectedLights();
    const targets = handle === "raise" ? all : [primary];
    op = {
      handle,
      targets: targets.length === 0 ? [primary] : targets,
      primary,
      screen: event.screen,
      alternate: event.altKey,
      patches: new Map(),
      readout: "",
      overlay: [],
      placing,
    };
    env.setCursor(cursorFor(handle, primary));
    // A handle press itself changes nothing (Phase 19.6: a quick click never nudges): the light moves with the
    // pointer's next move past the click slop. A new light being placed follows the pointer at once.
    if (placing) update(event);
    else env.setHint(`${labelFor(handle)}. Click to place; type a value and Enter. Esc cancels.`);
  };

  /** A light added from the tree follows the pointer: start its Move as soon as the pointer is in the view. */
  const placingTarget = (): Selected | undefined => {
    const { placingLightId } = env.session.ui.getState();
    if (placingLightId === undefined) return undefined;
    const ref = indexEntities(houseOf(env)).get(placingLightId);
    if (ref?.kind !== "light") return undefined;
    const area = areaById(env, ref.areaId);
    return area === undefined ? undefined : { area, light: ref.value };
  };

  return {
    isActive: () => op !== undefined,
    hover: (event) => {
      const placing = placingTarget();
      // Hidden light controls: no handles to hover (a new light still follows the pointer).
      if (placing === undefined && env.session.ui.getState().lightControls === "hidden") return false;
      if (placing !== undefined && event.phase === "move") {
        start("move", placing, event, true);
        return true;
      }
      if (event.phase === "leave") {
        clearHover();
        return false;
      }
      const found = handleAt(event);
      if (found === undefined) {
        clearHover();
        return false;
      }
      const at = lightHandlePoints(found.target.area, found.target.light, topView(), mmPerPx()).get(
        found.handle,
      );
      showingHover = true;
      env.setOverlay(
        at === undefined
          ? []
          : found.handle === "aim"
            ? aimRing(at, mmPerPx(), "accentStrong")
            : found.handle === "face"
              ? faceArrowOverlay(
                  found.target.area,
                  found.target.light,
                  linearFacingDeg(found.target.light),
                  mmPerPx(),
                  "accentStrong",
                )
              : [
                  hoveredHandle(
                    at,
                    found.handle === "move" ? "cross" : "dot",
                    found.handle === "move" ? 12 : 10,
                  ),
                ],
      );
      env.setCue({ lines: [], marker: null, label: labelFor(found.handle) });
      env.setCursor(cursorFor(found.handle, found.target));
      return true;
    },
    down: (event) => {
      if (event.button !== 0 || env.session.ui.getState().lightControls === "hidden") return false;
      const found = handleAt(event);
      if (found === undefined) return false;
      start(found.handle, found.target, event, false);
      return true;
    },
    pointer: (event) => {
      if (op === undefined) return;
      if (event.phase === "move") update(event);
      else if (event.phase === "down" && event.button === 0) commit();
    },
    key: (event) => {
      if (op === undefined) return false;
      if (event.key === "Escape") {
        end();
        return true;
      }
      if (event.key === "Enter") {
        commit();
        return true;
      }
      if (
        op.handle !== "raise" &&
        op.handle !== "stretchStart" &&
        op.handle !== "stretchEnd" &&
        op.handle !== "face"
      )
        return false;
      if (event.key === "Backspace") typed = typed.slice(0, -1);
      else if (event.key.length === 1 && /[0-9a-zA-Z.,'"° -]/.test(event.key)) typed += event.key;
      else return false;
      update(undefined);
      return true;
    },
    cancel: end,
  };
};
