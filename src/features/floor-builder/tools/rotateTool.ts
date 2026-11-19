// Rotate (owner, Phase 5 follow-up): turns the selected floor shape, carpet piece, carpet, object, or light
// by one of four grips at its box's side midpoints, like Rotate area, and shows the turn live. Shapes and carpets turn
// about their box centre, objects and lights about their own origin. The dragged grip locks onto each
// quarter turn nearby; Shift: quarter turns only; Ctrl (or Magnetic off): no snapping; typed degrees are
// exact. Each turn is one undo step. Circles and wall-hosted objects have nothing to turn.
import { setPropertyCommand } from "@shared/domain/commands/propertyCommands";
import { rotateObjectsCommand } from "@shared/domain/commands/objectGroupCommands";
import { replaceCarpetGeometryCommand, replaceShapeCommand } from "@shared/domain/commands/shapeCommands";
import { updateLightsCommand } from "@shared/domain/commands/furnishingCommands";
import type { Command } from "@shared/domain/commands/command";
import { indexEntities } from "@shared/domain/house/entityIndex";
import { applyAffine } from "@shared/geometry/affine";
import { groupFrameCenter, rotateGroupAboutCenter } from "@shared/geometry/shapeGroup";
import type { Vec2 } from "@shared/geometry/vector";
import type { OverlayPrimitive, RuntimePointerEvent, ScreenPoint } from "../../../renderer/runtimeTypes";
import { hoveredHandle } from "../services/handleHover";
import { carpetAsArea, carpetFrame } from "./carpetEditing";
import { boxOf, elementBoxOf, rotateAbout } from "./elementBox";
import type { ElementBox } from "./elementBox";
import { toAreaLocal, toFloor } from "./planGeometry";
import { selectionTargetAt } from "./selectionTarget";
import { shapeRingInFloor } from "./shapeNudge";
import { areaById, finishTool, houseOf, magnetic, unitOf } from "./toolContext";
import { pickedEntity } from "./instanceDrag";
import type { ToolEnv, ToolFactory, ToolHandler } from "./toolTypes";
import { createValueInput, feedValueKey, hasTyped, readoutOf, valueOf } from "./valueInput";

/** Screen radius for grabbing a grip (implementation convention, as Rotate area). */
const gripPx = 12;
/** Screen capture within which the dragged grip locks onto a quarter-turn mark. */
const quarterLockPx = 16;
/** Grips sit at least this far from the pivot on screen, so small things stay turnable. */
const minGripReachPx = 28;

/** What Rotate turns: its box (grips at the side midpoints), its pivot, and its turn as a command. */
type Rotatable = Readonly<{
  id: string;
  pivot: Vec2;
  box: ElementBox;
  commit: (degrees: number) => Command;
}>;

const angleOf = (from: Vec2, to: Vec2): number => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

/** Signed −180…180. */
const wrap = (degrees: number): number => ((((degrees + 180) % 360) + 360) % 360) - 180;

/** 0…360, to 0.001°. */
const heading = (degrees: number): number => Math.round((((degrees % 360) + 360) % 360) * 1000) / 1000;

/** The box outline turned by `degrees` about the pivot. */
const outlineOf = (box: ElementBox, pivot: Vec2, degrees: number): OverlayPrimitive[] => [
  {
    kind: "polyline",
    points: box.corners.map((corner) => ({ ...rotateAbout(corner, pivot, degrees), h: box.hMm })),
    closed: true,
    tone: "accent",
  },
];

/** The selected thing Rotate can turn, if exactly one is selected. */
const rotatableOf = (env: ToolEnv): Rotatable | undefined => {
  const { selection, activeFloorId } = env.session.ui.getState();
  if (selection.length !== 1 || selection[0] === undefined) return undefined;
  const house = houseOf(env);
  const ref = indexEntities(house).get(selection[0]);
  if (ref === undefined || !("areaId" in ref)) return undefined;
  const room = areaById(env, ref.areaId);
  if (room === undefined) return undefined;

  if (ref.kind === "shape") {
    const shape = ref.value;
    // Turning shapes of a wall feature is not offered (Nudge, Corner edit, and the size handles edit them).
    if (shape.type === "circle" || ref.reliefId !== undefined) return undefined;
    const carpet = room.floor.carpets.find((candidate) => candidate.id === ref.carpetId);
    const area = carpet === undefined ? room : carpetAsArea(room, carpet);
    const box = boxOf(shapeRingInFloor(area, shape), area.rotationDeg + shape.rotationDeg, 0);
    return {
      id: shape.id,
      pivot: box.center,
      box,
      commit: (degrees) => {
        const pivot = toAreaLocal(area, box.center);
        const position = rotateAbout(shape.positionMm, pivot, degrees);
        return replaceShapeCommand(
          activeFloorId,
          room.id,
          {
            ...shape,
            positionMm: { x: Math.round(position.x * 10) / 10, y: Math.round(position.y * 10) / 10 },
            rotationDeg: heading(shape.rotationDeg + degrees),
          },
          "Rotate shape",
          ref.carpetId,
        );
      },
    };
  }

  const box = elementBoxOf(env, ref);
  if (box === undefined) return undefined;

  if (ref.kind === "carpet") {
    const carpet = ref.value;
    const frame = carpetFrame(room, carpet);
    return {
      id: carpet.id,
      pivot: applyAffine(frame.toPlane, groupFrameCenter(frame)),
      box,
      commit: (degrees) =>
        replaceCarpetGeometryCommand(
          activeFloorId,
          room.id,
          carpet.id,
          { ...rotateGroupAboutCenter(carpet, frame, carpet.rotationDeg + degrees), shapes: carpet.shapes },
          "Rotate carpet",
        ),
    };
  }

  if (ref.kind === "objectGroup") {
    const group = ref.value;
    const pivot = box.center;
    return {
      id: group.id,
      pivot,
      box,
      commit: (degrees) =>
        rotateObjectsCommand(activeFloorId, room.id, group.memberIds, toAreaLocal(room, pivot), degrees),
    };
  }

  if (ref.kind === "object") {
    const object = ref.value;
    return {
      id: object.id,
      pivot: toFloor(room, object.positionMm),
      box,
      commit: (degrees) =>
        setPropertyCommand(
          house,
          [object.id],
          ["rotationDeg"],
          heading(object.rotationDeg + degrees),
          "Rotate object",
        ),
    };
  }

  if (ref.kind === "light") {
    const light = ref.value;
    return {
      id: light.id,
      pivot: toFloor(room, light.positionMm),
      box,
      commit: (degrees) =>
        updateLightsCommand(
          activeFloorId,
          [
            {
              areaId: room.id,
              lightId: light.id,
              patch: { rotationDeg: heading(light.rotationDeg + degrees) },
            },
          ],
          "Rotate light",
        ),
    };
  }
  return undefined;
};

const idleHint =
  "Drag a grip of the selected room, shape, carpet, object, or light to rotate it. Shift-click flips Auto-select for one click.";

export const createRotateTool = (): ToolFactory => (env) => {
  const input = createValueInput("angle");
  let lock:
    | {
        target: Rotatable;
        grip: Vec2;
        startAngle: number;
        raw: number;
        screen: ScreenPoint;
        shift: boolean;
        ctrl: boolean;
      }
    | undefined;

  const screenOf = (point: Vec2, hMm: number): ScreenPoint | null =>
    env.runtime.screenPointOf({ ...point, h: hMm });

  /** Grips pushed out to a minimum screen reach from the pivot. */
  const gripsOf = (target: Rotatable): Vec2[] => {
    const reach = minGripReachPx * env.runtime.worldUnitsPerPixel();
    return target.box.mids.map((point) => {
      const dx = point.x - target.pivot.x;
      const dy = point.y - target.pivot.y;
      const length = Math.hypot(dx, dy);
      if (length >= reach) return point;
      const angle = length > 0 ? Math.atan2(dy, dx) : 0;
      return { x: target.pivot.x + Math.cos(angle) * reach, y: target.pivot.y + Math.sin(angle) * reach };
    });
  };

  const gripAt = (event: RuntimePointerEvent): { target: Rotatable; grip: Vec2 } | undefined => {
    const target = rotatableOf(env);
    if (target === undefined) return undefined;
    let best: { target: Rotatable; grip: Vec2 } | undefined;
    let bestPx = gripPx;
    for (const grip of gripsOf(target)) {
      const s = screenOf(grip, target.box.hMm);
      if (s === null) continue;
      const d = Math.hypot(s.x - event.screen.x, s.y - event.screen.y);
      if (d <= bestPx) {
        best = { target, grip };
        bestPx = d;
      }
    }
    return best;
  };

  const idleOverlay = (hot: Vec2 | undefined): OverlayPrimitive[] => {
    const target = rotatableOf(env);
    if (target === undefined) return [];
    const h = target.box.hMm;
    // The box like Move's, with the pivot; its four side midpoints are the grips (as for rooms).
    return [
      ...outlineOf(target.box, target.pivot, 0),
      { kind: "point", at: { ...target.pivot, h }, marker: "cross", sizePx: 12, tone: "accent" },
      ...gripsOf(target).map((point): OverlayPrimitive =>
        hot !== undefined && Math.hypot(point.x - hot.x, point.y - hot.y) < 1e-6
          ? hoveredHandle({ ...point, h }, "dot", 10)
          : { kind: "point", at: { ...point, h }, marker: "dot", sizePx: 10, tone: "accent" },
      ),
    ];
  };

  const turnOf = (
    state: NonNullable<typeof lock>,
  ): { degrees: number; locked: number | undefined; label: string } => {
    if (hasTyped(input))
      return { degrees: valueOf(input, state.raw, unitOf(env)), locked: undefined, label: "" };
    if (state.ctrl || !magnetic(env)) return { degrees: state.raw, locked: undefined, label: "Free (Ctrl)" };
    const quarter = Math.round(state.raw / 90) * 90;
    if (state.shift) return { degrees: quarter, locked: quarter, label: "Quarter turn (Shift)" };
    const { target } = state;
    const dragged = screenOf(rotateAbout(state.grip, target.pivot, state.raw), target.box.hMm);
    const mark = screenOf(rotateAbout(state.grip, target.pivot, quarter), target.box.hMm);
    if (
      dragged !== null &&
      mark !== null &&
      Math.hypot(dragged.x - mark.x, dragged.y - mark.y) <= quarterLockPx
    )
      return { degrees: quarter, locked: quarter, label: "Quarter turn" };
    return { degrees: state.raw, locked: undefined, label: "" };
  };

  const preview = (): void => {
    if (lock === undefined) return;
    const { target } = lock;
    const turn = turnOf(lock);
    const h = target.box.hMm;
    const grip = lock.grip;
    const current = rotateAbout(grip, target.pivot, turn.degrees);
    const marks: OverlayPrimitive[] = [0, 90, 180, 270].map((quarter) => {
      const hot = turn.locked !== undefined && ((turn.locked % 360) + 360) % 360 === quarter;
      return {
        kind: "point",
        at: { ...rotateAbout(grip, target.pivot, quarter), h },
        marker: "dot",
        sizePx: hot ? 14 : 8,
        tone: hot ? "accent" : "neutral",
      };
    });
    // The thing itself turns live, with its box.
    env.session.preview(Math.abs(wrap(turn.degrees)) < 0.001 ? undefined : target.commit(turn.degrees));
    env.setOverlay([
      ...outlineOf(target.box, target.pivot, turn.degrees),
      { kind: "point", at: { ...target.pivot, h }, marker: "cross", tone: "accent" },
      ...marks,
      { kind: "segment", from: { ...target.pivot, h }, to: { ...current, h }, dashed: true, tone: "accent" },
    ]);
    env.setCue(turn.label === "" ? undefined : { lines: [], marker: { ...current, h }, label: turn.label });
    env.setReadout({ text: readoutOf(input, wrap(turn.degrees), unitOf(env)), screen: lock.screen });
  };

  const reset = (): void => {
    lock = undefined;
    input.typed = "";
    finishTool(env);
    env.setHint(idleHint);
  };

  const commit = (): void => {
    if (lock === undefined) return;
    const { target } = lock;
    const degrees = turnOf(lock).degrees;
    reset();
    if (Math.abs(wrap(degrees)) < 0.001) return;
    env.session.execute(target.commit(degrees));
  };

  env.setHint(idleHint);
  return {
    isActive: () => lock !== undefined,
    // A grip acts on the selection; anything else is what Auto-select would pick (3.13).
    target: (event) =>
      lock === undefined ? (gripAt(event)?.target.id ?? selectionTargetAt(env, event)) : lock.target.id,
    pointer: (event) => {
      if (lock !== undefined) {
        if (event.phase === "move") {
          lock.shift = event.shiftKey;
          lock.ctrl = event.ctrlKey;
          lock.screen = event.screen;
          const plan = env.runtime.planPointAt(event.screen.x, event.screen.y, lock.target.box.hMm);
          if (plan !== null) lock.raw = wrap(angleOf(lock.target.pivot, plan) - lock.startAngle);
          preview();
        } else if (event.phase === "down" && event.button === 0) commit();
        return;
      }
      if (event.phase === "move" || event.phase === "leave") {
        const hot = event.phase === "move" ? gripAt(event) : undefined;
        env.setOverlay(idleOverlay(hot?.grip));
        env.setCursor(hot === undefined ? "default" : "rotate");
        return;
      }
      if (event.phase !== "down" || event.button !== 0) return;
      const grabbed = gripAt(event);
      if (grabbed === undefined) return;
      lock = {
        target: grabbed.target,
        grip: grabbed.grip,
        startAngle: angleOf(grabbed.target.pivot, grabbed.grip),
        raw: 0,
        screen: event.screen,
        shift: event.shiftKey,
        ctrl: false,
      };
      env.setHint(
        "Turn the grip; it locks at each quarter turn. Shift: quarter turns only. Ctrl: no snapping. Type degrees; click to place. Esc cancels.",
      );
      preview();
    },
    key: (event) => {
      if (lock === undefined) return false;
      const action = feedValueKey(input, event.key);
      if (action === "cancel") reset();
      else if (action === "commit") commit();
      else if (action === "consumed") preview();
      return action !== "none";
    },
    cancel: reset,
  };
};

/**
 * The overview's Rotate (Q): the selected carpet, object, or light turns like in the Room Editor; otherwise
 * Rotate area turns the selected rooms. One shortcut and one grip style for everything (owner, Phase 5
 * follow-up).
 */
export const createOverviewRotateTool =
  (rotateArea: ToolFactory): ToolFactory =>
  (env) => {
    const rooms = rotateArea(env);
    const things = createRotateTool()(env);
    let active: ToolHandler | undefined;
    const route = (): ToolHandler => active ?? (rotatableOf(env) === undefined ? rooms : things);
    const settle = (): void => {
      active = rooms.isActive() ? rooms : things.isActive() ? things : undefined;
    };
    return {
      isActive: () => rooms.isActive() || things.isActive(),
      target: (event) => {
        const handler = route();
        if (handler === things) return things.target?.(event);
        // A room grip wins; otherwise a carpet, object, or light under the pointer, then the room.
        const room = rooms.target?.(event);
        const hit = event.hit;
        const hovered = hit !== null && "areaId" in hit ? hit.areaId : undefined;
        if (room !== undefined && room !== hovered) return room;
        return pickedEntity(env, event)?.id ?? room;
      },
      pointer: (event) => {
        route().pointer(event);
        settle();
      },
      key: (event) => {
        const consumed = route().key(event);
        settle();
        return consumed;
      },
      cancel: () => {
        rooms.cancel();
        things.cancel();
        active = undefined;
      },
    };
  };
