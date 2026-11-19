// Whole-house overview tools (Phase 16.4, owner 2026-11-18; spec/builder/screens/floor-builder.md#whole-house-overview).
// Floors are groups here: Select picks whole floors (Shift adds or removes), Nudge moves the selected floors
// together with click–lock–type–commit (D16). The move runs on the plan at the grab height; ↑ locks it to blue
// (vertical), → to red, ← to green (SketchUp's arrow-key locks; the same key again, or ↓, frees it), Shift locks
// the dominant red/green axis, Ctrl moves without snapping. Snaps come from shared/geometry/floorMove.ts. The
// preview only moves the floors' scene roots (runtime offsets); the commit is one moveFloorsCommand, one undo step.
import { moveFloorsCommand } from "@shared/domain/commands/floorCommands";
import { floorPlacementOf } from "@shared/domain/house/floorPlacement";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { FloorMoveLock, FloorMoveSnap } from "@shared/geometry/floorMove";
import { snapFloorMove } from "@shared/geometry/floorMove";
import type { Vec3 } from "@shared/geometry/meshData";
import type {
  OverlayPrimitive,
  PlanPoint3,
  RuntimePointerEvent,
  ScreenPoint,
} from "../../../renderer/runtimeTypes";
import { inferenceCapturePx } from "../inference/inferPoint";
import type { CueColor, CueLine } from "../inference/inferenceTypes";
import { floorBoxOverlay, floorOutlineOverlay } from "../services/houseOverlay";
import { hoveredRoofOverlay } from "../services/roofOverlay";
import { moveAxis } from "./moveModifiers";
import { autoSelectFor, finishTool, houseOf, magnetic, unitOf } from "./toolContext";
import type { ToolEnv, ToolFactory, ToolHandler } from "./toolTypes";
import { createValueInput, feedValueKey, hasTyped, readoutOf, valueOf } from "./valueInput";

/** The building floor under the pointer. */
export const floorAt = (event: RuntimePointerEvent): string | undefined =>
  event.hit?.kind === "buildingFloor" ? event.hit.floorId : undefined;

const floorById = (env: ToolEnv, floorId: string | undefined): BuildingFloorValue | undefined =>
  floorId === undefined ? undefined : houseOf(env).floors.find((floor) => floor.id === floorId);

/** The selected floors, in document order. */
const selectedFloors = (env: ToolEnv): BuildingFloorValue[] => {
  const { selection } = env.session.ui.getState();
  return houseOf(env).floors.filter((floor) => selection.includes(floor.id));
};

/** A hovered floor's bounding box (SketchUp's group box), unless it is already drawn as selected. */
const hoverOverlay = (env: ToolEnv, floorId: string | undefined): OverlayPrimitive[] => {
  const floor = floorById(env, floorId);
  return floor === undefined || env.session.ui.getState().selection.includes(floor.id)
    ? []
    : floorBoxOverlay(floor, houseOf(env), "accent");
};

/** The roof under the pointer (Phase 19.1: roofs are drawn and picked in the whole house). */
const roofAt = (event: RuntimePointerEvent): Readonly<{ roofId: string; floorId: string }> | undefined =>
  event.hit?.kind === "roof" ? { roofId: event.hit.roofId, floorId: event.hit.floorId } : undefined;

/**
 * Select in the whole-house overview: a click selects its floor, or a roof (Phase 19.1); Shift adds or removes it;
 * empty space clears.
 */
export const createHouseSelectTool = (): ToolFactory => (env) => {
  env.setHint(
    "Click a floor or the roof to select it; Shift-click adds or removes one. Double-click a floor or the roof to open it.",
  );
  return {
    isActive: () => false,
    pointer: (event) => {
      if (event.phase === "move" || event.phase === "leave") {
        const roof = event.phase === "leave" ? undefined : roofAt(event);
        env.setOverlay(
          event.phase === "leave"
            ? []
            : roof !== undefined
              ? hoveredRoofOverlay(houseOf(env), roof.roofId, env.session.ui.getState().selection)
              : hoverOverlay(env, floorAt(event)),
        );
        return;
      }
      if (event.phase !== "down" || event.button !== 0) return;
      const { selection } = env.session.ui.getState();
      const roof = roofAt(event);
      if (roof !== undefined) {
        env.session.ui.setState({
          activeFloorId: roof.floorId,
          selection: event.shiftKey
            ? selection.includes(roof.roofId)
              ? selection.filter((id) => id !== roof.roofId)
              : [...selection, roof.roofId]
            : [roof.roofId],
        });
        env.setOverlay([]);
        return;
      }
      const floorId = floorAt(event);
      if (event.shiftKey) {
        if (floorId === undefined) return;
        env.session.ui.setState({
          selection: selection.includes(floorId)
            ? selection.filter((id) => id !== floorId)
            : [...selection.filter((id) => floorById(env, id) !== undefined), floorId],
        });
      } else env.session.ui.setState({ selection: floorId === undefined ? [] : [floorId] });
      if (floorId !== undefined) env.session.ui.setState({ activeFloorId: floorId });
      env.setOverlay([]);
    },
    key: () => false,
    cancel: () => {
      finishTool(env);
    },
  };
};

type FloorMove = Readonly<{
  pointer: (event: RuntimePointerEvent) => void;
  key: (event: KeyboardEvent) => boolean;
  cancel: () => void;
}>;

const lockKeys: Readonly<Record<string, FloorMoveLock>> = {
  ArrowUp: "vertical",
  ArrowRight: "x",
  ArrowLeft: "y",
};

const lockLabel: Readonly<Record<FloorMoveLock, string>> = {
  plane: "",
  x: "Red axis",
  y: "Green axis",
  vertical: "Blue axis",
};

const lockColor: Readonly<Record<FloorMoveLock, CueColor>> = {
  plane: "edge",
  x: "axisX",
  y: "axisY",
  vertical: "vertical",
};

const add = (a: PlanPoint3, b: Vec3): PlanPoint3 => ({ x: a.x + b.x, y: a.y + b.y, h: a.h + b.h });
const length3 = (v: Vec3): number => Math.hypot(v.x, v.y, v.h);

/** Restricts a raw offset to a lock. */
const constrained = (raw: Vec3, lock: FloorMoveLock): Vec3 =>
  lock === "vertical"
    ? { x: 0, y: 0, h: raw.h }
    : lock === "x"
      ? { x: raw.x, y: 0, h: 0 }
      : lock === "y"
        ? { x: 0, y: raw.y, h: 0 }
        : { x: raw.x, y: raw.y, h: 0 };

/** A typed distance along the offset's direction (vertical: up unless the pointer is below the grab). */
const typedOffset = (base: Vec3, lock: FloorMoveLock, distance: number): Vec3 => {
  if (lock === "vertical") return { x: 0, y: 0, h: base.h < 0 ? -distance : distance };
  const size = Math.hypot(base.x, base.y);
  if (size === 0) return lock === "y" ? { x: 0, y: distance, h: 0 } : { x: distance, y: 0, h: 0 };
  return { x: (base.x / size) * distance, y: (base.y / size) * distance, h: 0 };
};

export const startFloorMove = (
  env: ToolEnv,
  moving: readonly BuildingFloorValue[],
  grab: PlanPoint3,
  event: RuntimePointerEvent,
  onDone: () => void,
): FloorMove => {
  const movingIds = new Set(moving.map((floor) => floor.id));
  const others = houseOf(env).floors.filter((floor) => !movingIds.has(floor.id));
  const input = createValueInput("length");
  let screen: ScreenPoint = event.screen;
  let raw: Vec3 = { x: 0, y: 0, h: 0 };
  let explicitLock: FloorMoveLock | undefined;
  let shift = event.shiftKey;
  let ctrl = event.ctrlKey;
  let result: FloorMoveSnap = { offset: raw, label: "", lines: [], marker: undefined };

  const lockNow = (): FloorMoveLock => {
    if (explicitLock !== undefined) return explicitLock;
    if (!shift || ctrl) return "plane";
    return moveAxis({ x: raw.x, y: raw.y }).x === 1 ? "x" : "y";
  };

  const readPointer = (): void => {
    if (lockNow() === "vertical") {
      const height = env.runtime.heightOnVertical(screen.x, screen.y, grab);
      if (height !== null) raw = { x: 0, y: 0, h: height - grab.h };
      return;
    }
    const plan = env.runtime.planPointAt(screen.x, screen.y, grab.h);
    if (plan !== null) raw = { x: plan.x - grab.x, y: plan.y - grab.y, h: 0 };
  };

  const place = (): FloorMoveSnap => {
    const lock = lockNow();
    const base = constrained(raw, lock);
    const none = (offset: Vec3): FloorMoveSnap => ({ offset, label: "", lines: [], marker: undefined });
    if (hasTyped(input)) {
      const distance = valueOf(input, length3(base), unitOf(env));
      return none(typedOffset(base, lock, Math.abs(distance)));
    }
    if (ctrl || !magnetic(env)) return none(base);
    return snapFloorMove({
      house: houseOf(env),
      moving,
      others,
      raw: base,
      lock,
      radiusMm: inferenceCapturePx * env.runtime.worldUnitsPerPixel(),
    });
  };

  const preview = (): void => {
    result = place();
    const { offset } = result;
    const lock = lockNow();
    env.runtime.setFloorPreviewOffsets(new Map(moving.map((floor) => [floor.id, offset])));
    const moved = add(grab, offset);
    const overlay: OverlayPrimitive[] = [
      lock === "vertical"
        ? { kind: "verticalLine", at: grab, fromHMm: grab.h, toHMm: moved.h, dashed: true, tone: "neutral" }
        : { kind: "segment", from: grab, to: moved, dashed: true, tone: "neutral" },
      ...moving.flatMap((floor) => floorOutlineOverlay(floor, "accent", offset)),
    ];
    env.setOverlay(overlay);
    const lines: CueLine[] = [
      ...(lock === "plane" ? [] : [{ from: grab, to: moved, color: lockColor[lock] }]),
      ...result.lines.map((line) => ({ from: line.from, to: line.to, color: lockColor.plane })),
    ];
    const label = [lockLabel[lock], result.label].filter((part) => part !== "").join(" · ");
    env.setCue(
      lines.length === 0 && label === "" ? undefined : { lines, marker: result.marker ?? moved, label },
    );
    env.setReadout({ text: readoutOf(input, length3(offset), unitOf(env)), screen });
  };

  const finish = (): void => {
    env.runtime.setFloorPreviewOffsets(null);
    input.typed = "";
    finishTool(env);
    onDone();
  };

  const commit = (): void => {
    const { offset } = result;
    finish();
    if (length3(offset) < 0.5) return;
    env.session.execute(
      moveFloorsCommand(
        houseOf(env),
        moving.map((floor) => {
          const placement = floorPlacementOf(floor);
          return {
            floorId: floor.id,
            positionMm: { x: placement.xMm + offset.x, y: placement.yMm + offset.y },
            elevationMm: placement.elevationMm + offset.h,
          };
        }),
      ),
    );
  };

  env.setCursor("move");
  preview();
  return {
    pointer: (next) => {
      shift = next.shiftKey;
      ctrl = next.ctrlKey;
      if (next.phase === "move") {
        screen = next.screen;
        readPointer();
        preview();
      } else if (next.phase === "down" && next.button === 0) commit();
    },
    key: (keyEvent) => {
      if (keyEvent.key === "Shift" || keyEvent.key === "Control") {
        shift = keyEvent.shiftKey;
        ctrl = keyEvent.ctrlKey;
        readPointer();
        preview();
        return false;
      }
      if (keyEvent.type !== "keydown") return false;
      const lock = lockKeys[keyEvent.key];
      if (lock !== undefined || keyEvent.key === "ArrowDown") {
        explicitLock = lock === undefined || explicitLock === lock ? undefined : lock;
        readPointer();
        preview();
        return true;
      }
      const action = feedValueKey(input, keyEvent.key);
      if (action === "cancel") finish();
      else if (action === "commit") commit();
      else if (action === "consumed") preview();
      return action !== "none";
    },
    cancel: finish,
  };
};

/** Nudge in the whole-house overview: moves the selected floors (owner decision 6: only those floors). */
export const createFloorMoveTool =
  (): ToolFactory =>
  (env): ToolHandler => {
    let operation: FloorMove | undefined;
    env.setHint(
      "Click a selected floor (or anywhere) and move; click again or type a distance and Enter. ↑ up/down, → red, ← green (again to free); Shift red/green; Ctrl no snapping; Esc cancels.",
    );
    return {
      isActive: () => operation !== undefined,
      target: floorAt,
      pointer: (event) => {
        if (operation !== undefined) {
          operation.pointer(event);
          return;
        }
        if (event.phase === "move" || event.phase === "leave") {
          const hovered = event.phase === "leave" ? undefined : floorAt(event);
          env.setOverlay(autoSelectFor(env, event) ? hoverOverlay(env, hovered) : []);
          env.setCursor(selectedFloors(env).length > 0 && event.phase !== "leave" ? "move" : "default");
          return;
        }
        if (event.phase !== "down" || event.button !== 0) return;
        if (autoSelectFor(env, event) && floorAt(event) === undefined) return;
        const moving = selectedFloors(env);
        if (moving.length === 0) {
          env.session.notify("info", "Select a floor to move first.");
          return;
        }
        const grab: PlanPoint3 =
          event.hit !== null
            ? event.hit.pointMm
            : event.plan === null
              ? { x: 0, y: 0, h: 0 }
              : { x: event.plan.x, y: event.plan.y, h: 0 };
        operation = startFloorMove(env, moving, grab, event, () => {
          operation = undefined;
        });
      },
      key: (event) => operation?.key(event) ?? false,
      cancel: () => {
        operation?.cancel();
        operation = undefined;
        finishTool(env);
      },
    };
  };
