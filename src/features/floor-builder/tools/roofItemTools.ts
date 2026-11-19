// Holes and roof windows on a roof (Phase 19.3, spec/builder/features/roofs.md#holes-and-roof-windows): picking them
// on the roof sheet, moving them (D16 click–lock–type–commit, SketchUp's Move), and the roof face view's own tools:
// - Select (Space) picks a hole or roof window on the face (Shift adds or removes); Delete removes it.
// - Move (M) grabs the selection, or what is under the pointer, and moves it on the face: a second click, Enter after
//   a typed distance, or the release of a drag commits one undo step; Shift locks the dominant direction (level or
//   up the slope); Escape cancels. The move is converted to the roof sheet (plan), where the items live, so they
//   always follow the surface under them.
// - Roof window opens the roof-window picker; the chosen template lands centred where the face was clicked.
// The same pick and Move work in the roof's Top view (roofTools.ts), on the plan.
import { moveRoofItemsCommand } from "@shared/domain/commands/roofCommands";
import type { RoofValue } from "@shared/domain/schemas/roof";
import { roofOpenings } from "@shared/geometry/roofOpenings";
import { pointInRing } from "@shared/geometry/region";
import { roofHeightAt, roofSurface } from "@shared/geometry/roofSurface";
import type { Vec2 } from "@shared/geometry/vector";
import type {
  OverlayPrimitive,
  PlanPoint3,
  RuntimePointerEvent,
  ScreenPoint,
} from "../../../renderer/runtimeTypes";
import type { RoofFaceView } from "../services/roofFace";
import { roofItemsOverlay } from "../services/roofOverlay";
import { pickerStore } from "../templates/templatePickerStore";
import { finishTool, roofFaceOf, unitOf } from "./toolContext";
import type { ToolEnv, ToolFactory, ToolHandler } from "./toolTypes";
import { createValueInput, feedValueKey, hasTyped, readoutOf, valueOf } from "./valueInput";

/** The hole or roof window under a plan point (windows first: they sit in holes' places), or undefined. */
export const roofItemAt = (roof: RoofValue, point: Vec2): string | undefined => {
  const openings = roofOpenings(roof);
  const window = openings.windows.find((placed) => pointInRing(point, placed.ring));
  if (window !== undefined) return window.window.id;
  return openings.holes.find((placed) => pointInRing(point, placed.hole.points))?.hole.id;
};

/** Whether an ID is one of the roof's holes or windows. */
export const isRoofItem = (roof: RoofValue, id: string): boolean =>
  (roof.holes ?? []).some((hole) => hole.id === id) ||
  (roof.windows ?? []).some((window) => window.id === id);

/** A plan point on the roof's top (its base where no face is under it). */
const onTop = (roof: RoofValue, point: Vec2): PlanPoint3 => ({
  ...point,
  h: roof.eaveHeightMm + (roofHeightAt(roofSurface(roof), point) ?? 0) + roof.thicknessMm + 6,
});

/** How a view reads the pointer for a move: its 2D coordinates and the matching plan offset. */
export type ItemMoveSpace = Readonly<{
  /** The pointer's point in the view's 2D coordinates (face u/v, or plan), or null. */
  pointAt: (screen: ScreenPoint) => Vec2 | null;
  /** A view offset as a plan offset (linear). */
  toPlan: (offset: Vec2) => Vec2;
  /** A view point as a 3D point on the roof's top, for the overlay. */
  point3: (point: Vec2) => PlanPoint3;
}>;

export type ItemMove = Readonly<{
  pointer: (event: RuntimePointerEvent) => void;
  key: (event: KeyboardEvent) => boolean;
  cancel: () => void;
}>;

/** One Move of holes and windows from a grab point (view coordinates). */
export const startRoofItemMove = (
  env: ToolEnv,
  floorId: string,
  roof: RoofValue,
  ids: readonly string[],
  space: ItemMoveSpace,
  grab: Vec2,
  event: RuntimePointerEvent,
  onDone: () => void,
): ItemMove => {
  const input = createValueInput("length");
  let current = grab;
  let shift = event.shiftKey;
  let screen = event.screen;
  const offset = (): Vec2 => {
    let dx = current.x - grab.x;
    let dy = current.y - grab.y;
    if (shift) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    if (!hasTyped(input)) return { x: dx, y: dy };
    const size = Math.hypot(dx, dy);
    const distance = Math.abs(valueOf(input, size, unitOf(env)));
    return size === 0 ? { x: distance, y: 0 } : { x: (dx / size) * distance, y: (dy / size) * distance };
  };
  const label = `Move ${ids.length === 1 ? "roof item" : `${String(ids.length)} roof items`}`;
  const commandOf = (): ReturnType<typeof moveRoofItemsCommand> | undefined => {
    const by = offset();
    if (Math.hypot(by.x, by.y) < 0.01) return undefined;
    return moveRoofItemsCommand(floorId, roof.id, ids, space.toPlan(by), label);
  };
  const preview = (): void => {
    const by = offset();
    env.session.preview(commandOf());
    const moved = { x: grab.x + by.x, y: grab.y + by.y };
    const overlay: OverlayPrimitive[] = [
      { kind: "segment", from: space.point3(grab), to: space.point3(moved), dashed: true, tone: "neutral" },
      { kind: "point", at: space.point3(moved), marker: "dotBold", tone: "accentStrong" },
    ];
    env.setOverlay(overlay);
    env.setReadout({ text: readoutOf(input, Math.hypot(by.x, by.y), unitOf(env)), screen });
  };
  const finish = (): void => {
    input.typed = "";
    env.session.preview(undefined);
    finishTool(env);
    onDone();
  };
  const commit = (): void => {
    const command = commandOf();
    finish();
    if (command !== undefined) env.session.execute(command);
  };
  env.setCursor("move");
  preview();
  return {
    pointer: (next) => {
      shift = next.shiftKey;
      if (next.phase === "move") {
        screen = next.screen;
        current = space.pointAt(next.screen) ?? current;
        preview();
      } else if (next.phase === "down" && next.button === 0) commit();
    },
    key: (keyEvent) => {
      if (keyEvent.key === "Shift") {
        shift = keyEvent.shiftKey;
        preview();
        return false;
      }
      if (keyEvent.type !== "keydown") return false;
      const action = feedValueKey(input, keyEvent.key);
      if (action === "cancel") finish();
      else if (action === "commit") commit();
      else if (action === "consumed") preview();
      return action !== "none";
    },
    cancel: finish,
  };
};

/** The face view's move space: face coordinates, converted to plan offsets on the face's plane. */
const faceSpaceOf = (env: ToolEnv, face: RoofFaceView): ItemMoveSpace => ({
  pointAt: (screen) => {
    const hit = env.runtime.facePointAt(screen.x, screen.y);
    return hit === null ? null : { x: hit.alongMm, y: hit.heightMm };
  },
  toPlan: (offset) => {
    const origin = face.planOf({ x: 0, y: 0 });
    const moved = face.planOf(offset);
    return { x: moved.x - origin.x, y: moved.y - origin.y };
  },
  point3: (point) => face.toPlan(point.x, point.y, 8),
});

/** The plan point under the pointer on the open face, or null. */
const facePlanAt = (env: ToolEnv, face: RoofFaceView, screen: ScreenPoint): Vec2 | null => {
  const hit = env.runtime.facePointAt(screen.x, screen.y);
  return hit === null ? null : face.planOf({ x: hit.alongMm, y: hit.heightMm });
};

const faceHint =
  "Click a hole or roof window to select it (Shift adds). Move (M) moves it on the slope; Rectangle, Circle and Polygon draw holes; Roof window places one. Done, Esc or a double-click off the face goes back.";

export const createRoofFaceSelectTool = (): ToolFactory => (env) => {
  env.setHint(faceHint);
  return {
    isActive: () => false,
    target: (event) => {
      const face = roofFaceOf(env);
      const plan = face === undefined ? null : facePlanAt(env, face, event.screen);
      return face === undefined || plan === null ? undefined : roofItemAt(face.roof, plan);
    },
    pointer: (event) => {
      const face = roofFaceOf(env);
      if (face === undefined) return;
      const plan = event.phase === "leave" ? null : facePlanAt(env, face, event.screen);
      const id = plan === null ? undefined : roofItemAt(face.roof, plan);
      if (event.phase === "move" || event.phase === "leave") {
        env.setOverlay(
          id === undefined ? [] : roofItemsOverlay(face.roof, [id]).filter((p) => p.tone === "accentStrong"),
        );
        env.setCursor(id === undefined ? "default" : "move");
        return;
      }
      if (event.phase !== "down" || event.button !== 0) return;
      const { selection } = env.session.ui.getState();
      if (event.shiftKey) {
        if (id === undefined) return;
        env.session.ui.setState({
          selection: selection.includes(id) ? selection.filter((each) => each !== id) : [...selection, id],
        });
        return;
      }
      env.session.ui.setState({ selection: id === undefined ? [] : [id] });
    },
    key: () => false,
    cancel: () => {
      finishTool(env);
    },
  };
};

export const createRoofFaceMoveTool =
  (): ToolFactory =>
  (env): ToolHandler => {
    let operation: ItemMove | undefined;
    env.setHint(
      "Click a hole or roof window (or the selection) and move it on the slope; click again or type a distance and Enter. Shift keeps it level or straight up the slope; Esc cancels.",
    );
    return {
      isActive: () => operation !== undefined,
      pointer: (event) => {
        if (operation !== undefined) {
          operation.pointer(event);
          return;
        }
        const face = roofFaceOf(env);
        if (face === undefined) return;
        const space = faceSpaceOf(env, face);
        const at = event.phase === "leave" ? null : space.pointAt(event.screen);
        const id = at === null ? undefined : roofItemAt(face.roof, face.planOf(at));
        if (event.phase === "move" || event.phase === "leave") {
          env.setCursor(id === undefined ? "default" : "move");
          return;
        }
        if (event.phase !== "down" || event.button !== 0 || at === null) return;
        const selection = env.session.ui.getState().selection.filter((each) => isRoofItem(face.roof, each));
        const moving = id !== undefined && !selection.includes(id) ? [id] : selection;
        if (moving.length === 0) {
          env.session.notify("info", "Press a hole or roof window to move it.");
          return;
        }
        if (moving.length === 1 && id !== undefined) env.session.ui.setState({ selection: [id] });
        operation = startRoofItemMove(env, face.floor.id, face.roof, moving, space, at, event, () => {
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

export const createRoofWindowTool = (): ToolFactory => (env) => {
  env.setHint("Click on the face where the roof window goes; then choose it. Esc stops.");
  return {
    isActive: () => false,
    pointer: (event) => {
      const face = roofFaceOf(env);
      if (face === undefined || event.phase !== "down" || event.button !== 0) return;
      const plan = facePlanAt(env, face, event.screen);
      if (plan === null) return;
      pickerStore.setState({
        request: { kind: "roofWindow", floorId: face.floor.id, roofId: face.roof.id, at: plan },
      });
      env.session.ui.setState({ tool: "select" });
    },
    key: () => false,
    cancel: () => {
      finishTool(env);
    },
  };
};

/** The Top view's move space (the roof level): the plan itself. */
export const planSpaceOf = (
  roof: RoofValue,
  planAt: (screen: ScreenPoint) => Vec2 | null,
): ItemMoveSpace => ({
  pointAt: planAt,
  toPlan: (offset) => offset,
  point3: (point) => onTop(roof, point),
});
