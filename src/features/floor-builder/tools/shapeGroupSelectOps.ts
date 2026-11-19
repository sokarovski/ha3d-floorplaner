// Whole-group box handles in Select (Phase 7.2, spec/builder/screens/floor-builder.md#shape-groups): a selected
// shape group (a room's floor, a carpet, a wall feature) shows its box with eight resize handles; dragging one
// scales every shape of the group together (opposite side fixed; Option about the centre; Ctrl without
// snapping; typed "W x D"). Each resize previews live and commits as one undo step. The env is the edit
// plane's: the floor plan, or the wall face (see faceSpace.ts), so pointer points, overlays, and cursors are
// all in that plane. Callers say which group is selected and what command a resize makes.
import type { Command } from "@shared/domain/commands/command";
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import { formatLength, parseLength } from "@shared/domain/units/lengthUnits";
import { applyAffine } from "@shared/geometry/affine";
import { unionRings } from "@shared/geometry/polygonKernel";
import { transformRing } from "@shared/geometry/region";
import {
  groupFrameCenter,
  groupHandleAt,
  groupHandleLocal,
  isCornerHandle,
  resizeShapeGroup,
} from "@shared/geometry/shapeGroup";
import type { GroupHandle, GroupResize, GroupTypedSize, ShapeGroupFrame } from "@shared/geometry/shapeGroup";
import { shapeOutline } from "@shared/geometry/shapeOutline";
import type { Vec2 } from "@shared/geometry/vector";
import type { OverlayPrimitive, RuntimePointerEvent } from "../../../renderer/runtimeTypes";
import { inferFloorPoint } from "../inference/toolInference";
import { hoveredHandle } from "../services/handleHover";
import { resizeCursorBetween } from "./resizeCursor";
import { splitPair } from "./shapeDrawing";
import { snapCapturePx } from "./snapping";
import { finishTool, unitOf } from "./toolContext";
import type { ToolEnv } from "./toolTypes";

/** A selected shape group as Select resizes it. */
export type ShapeGroupTarget = Readonly<{
  /** The group's name in cues and hints: "room", "carpet", "feature". */
  noun: string;
  shapes: readonly ShapeValue[];
  frame: ShapeGroupFrame;
  /** The one-step command that gives the group these shapes (label included). */
  resize: (shapes: readonly ShapeValue[]) => Command;
}>;

type GroupOp = {
  target: ShapeGroupTarget;
  handle: GroupHandle;
  plan: Vec2 | null;
  screen: Readonly<{ x: number; y: number }>;
  alternate: boolean;
  ctrl: boolean;
  result: GroupResize | null;
};

export type ShapeGroupSelectOps = Readonly<{
  isActive: () => boolean;
  /** Hover feedback on the selected group's handles; true when one is under the pointer. */
  hover: (event: RuntimePointerEvent) => boolean;
  /** A primary press on the selected group's handle starts a resize; true when it did. */
  down: (event: RuntimePointerEvent) => boolean;
  /** Pointer input while a resize runs. */
  pointer: (event: RuntimePointerEvent) => void;
  key: (event: KeyboardEvent) => boolean;
  cancel: () => void;
}>;

/** The group's shapes in the edit plane, shaded as one outline. */
export const groupOutlineOverlay = (
  frame: ShapeGroupFrame,
  shapes: readonly ShapeValue[],
  fillOpacity: number,
): OverlayPrimitive[] =>
  unionRings(
    shapes.map((shape) => transformRing(shapeOutline(shape).ring, frame.toPlane)),
    { closeContacts: false },
  ).polygons.map((polygon): OverlayPrimitive => ({
    kind: "polygon",
    points: polygon.outer,
    holes: polygon.holes,
    fillOpacity,
    outline: true,
    tone: "accent",
  }));

export const createShapeGroupSelectOps = (
  env: ToolEnv,
  selected: () => ShapeGroupTarget | undefined,
): ShapeGroupSelectOps => {
  let op: GroupOp | undefined;
  let typed = "";
  let showingHover = false;

  const radius = (): number => snapCapturePx * env.runtime.worldUnitsPerPixel();

  const centerOf = (frame: ShapeGroupFrame): Vec2 => applyAffine(frame.toPlane, groupFrameCenter(frame));

  const typedSize = (handle: GroupHandle): GroupTypedSize | undefined => {
    if (typed.trim() === "") return undefined;
    const [first, second] = splitPair(typed);
    const a = parseLength(first, unitOf(env));
    const b = second === undefined ? undefined : parseLength(second, unitOf(env));
    if (!a.ok || a.millimeters <= 0 || (b !== undefined && (!b.ok || b.millimeters <= 0))) return undefined;
    const bMm = b?.ok === true ? b.millimeters : undefined;
    // A side takes one value along its axis; a corner takes "W x D" (or one value for the width).
    if (handle.sx === 0) return { depthMm: a.millimeters };
    if (handle.sy === 0) return { widthMm: a.millimeters };
    return { widthMm: a.millimeters, depthMm: bMm };
  };

  const clearHover = (): void => {
    if (!showingHover) return;
    showingHover = false;
    env.setOverlay([]);
    env.setCue(undefined);
    env.setCursor("default");
  };

  const end = (): void => {
    op = undefined;
    typed = "";
    finishTool(env);
    env.setHint("");
  };

  const refresh = (): void => {
    if (op === undefined) return;
    const { target, handle } = op;
    const pointer = op.plan === null ? undefined : op.ctrl ? op.plan : inferFloorPoint(env, op.plan);
    if (op.ctrl) env.setCue(undefined);
    const local =
      pointer === undefined
        ? groupHandleLocal(target.frame, handle)
        : applyAffine(target.frame.fromPlane, pointer);
    op.result = resizeShapeGroup(target.shapes, target.frame, handle, local, op.alternate, typedSize(handle));
    // The group resizes live (owner, Phase 5 follow-up for carpets).
    env.session.preview(target.resize(op.result.shapes));
    env.setOverlay(groupOutlineOverlay(target.frame, op.result.shapes, 0.2));
    const unit = unitOf(env);
    const text = `${formatLength(op.result.widthMm, unit)} × ${formatLength(op.result.depthMm, unit)}`;
    env.setReadout({ text: typed.trim() === "" ? text : `${typed}  =  ${text}`, screen: op.screen });
    env.setHint(
      op.alternate
        ? `Resizing the ${target.noun} about its centre. Release Option to keep the opposite side. Type W x D; click to place. Esc cancels.`
        : `Resizing the ${target.noun} with the opposite side fixed. Option: about the centre. Ctrl: no snapping. Type W x D; click to place. Esc cancels.`,
    );
  };

  const commit = (): void => {
    const current = op;
    end();
    if (current === undefined || current.result === null) return;
    // A press and release without a change makes no undo step.
    if (JSON.stringify(current.result.shapes) === JSON.stringify(current.target.shapes)) return;
    env.session.execute(current.target.resize(current.result.shapes));
  };

  return {
    isActive: () => op !== undefined,
    hover: (event) => {
      const target = event.phase === "leave" || event.plan === null ? undefined : selected();
      const handle =
        target === undefined || event.plan === null
          ? undefined
          : groupHandleAt(target.frame, event.plan, radius());
      if (target === undefined || handle === undefined) {
        clearHover();
        return false;
      }
      const at = applyAffine(target.frame.toPlane, groupHandleLocal(target.frame, handle));
      showingHover = true;
      env.setOverlay([hoveredHandle(at)]);
      env.setCue({
        lines: [],
        marker: { ...at, h: 0 },
        label: `Resize ${target.noun}: ${isCornerHandle(handle) ? "corner" : "side"}`,
      });
      env.setCursor(resizeCursorBetween(env.runtime, centerOf(target.frame), at));
      return true;
    },
    down: (event) => {
      if (event.button !== 0 || event.plan === null) return false;
      const target = selected();
      if (target === undefined) return false;
      const handle = groupHandleAt(target.frame, event.plan, radius());
      if (handle === undefined) return false;
      const at = applyAffine(target.frame.toPlane, groupHandleLocal(target.frame, handle));
      showingHover = false;
      op = {
        target,
        handle,
        plan: null,
        screen: event.screen,
        alternate: event.altKey,
        ctrl: event.ctrlKey,
        result: null,
      };
      // The cursor keeps the direction it started with until commit or Escape.
      env.setCursor(resizeCursorBetween(env.runtime, centerOf(target.frame), at));
      refresh();
      return true;
    },
    pointer: (event) => {
      if (op === undefined) return;
      if (event.phase === "move" && event.plan !== null) {
        op.screen = event.screen;
        op.plan = event.plan;
        op.alternate = event.altKey;
        op.ctrl = event.ctrlKey;
        refresh();
      } else if (event.phase === "down" && event.button === 0) commit();
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
      if (event.key === "Backspace") typed = typed.slice(0, -1);
      else if (event.key.length === 1 && /[0-9a-zA-Z.,x× "'*;-]/.test(event.key)) typed += event.key;
      else return false;
      refresh();
      return true;
    },
    cancel: end,
  };
};
