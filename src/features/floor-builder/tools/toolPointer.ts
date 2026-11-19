// Shared SketchUp-style auto detection. Tools consume starts/commits as primary downs; only this
// adapter decides whether an initial release commits or leaves an operation following the pointer.
//
// The click slop (Phase 19.6, owner: "a quick click never nudges"; spec/builder/screens/floor-builder.md#the-click-slop):
// for the tools that move or resize existing things (Select's handles and Move crosses, Nudge/Move in every level,
// the corner editor), the press that starts an operation is a click until the pointer has moved more than the
// slop from where it was pressed (screen pixels: 6 px mouse or pen, 12 px touch), or the press has been held for
// 250 ms and moved at least 2 px (src/renderer/pointerSlop.ts). Until then no pointer move reaches the operation, so
// nothing moves; a release inside the slop leaves the operation locked (click–lock–type–commit, D16, unchanged:
// typed values and arrow locks still work), and a second click before the pointer has left the slop cancels it, so
// a quick click (or two) never changes the document and makes no undo step. Past the slop the operation gets the
// pointer as it is (the grabbed thing follows the pointer from there), and a release after a real drag commits.
import type { RuntimePointerEvent, ScreenPoint } from "../../../renderer/runtimeTypes";
import { dragHoldMs, heldDragPx, slopForPointer } from "../../../renderer/pointerSlop";
import { autoSelectFor } from "./toolContext";
import type { ToolEnv, ToolHandler } from "./toolTypes";

/** CSS pixels travelled while the initial primary press is held (drawing tools). Independent of zoom/snapping. */
export const dragThresholdPx = 4;

type Press = {
  start: ScreenPoint;
  startedAt: number;
  slopPx: number;
  /** The pointer has left the slop (a drag, or a click-lock move away from the press point). */
  dragged: boolean;
  /** The button is still down. */
  held: boolean;
};

export const createToolPointer = (
  handler: ToolHandler,
  env: ToolEnv,
  /** The tool moves or resizes existing things: its presses get the click slop (Phase 19.6). */
  slop = false,
  /** The clock (ms), replaceable by the checks. */
  now: () => number = () => performance.now(),
): ToolHandler["pointer"] => {
  let press: Press | undefined;
  let selectionOnly = false;

  const updateDrag = (event: RuntimePointerEvent): void => {
    if (press === undefined || press.dragged) return;
    const distance = Math.hypot(event.screen.x - press.start.x, event.screen.y - press.start.y);
    if (!slop) {
      press.dragged = distance > dragThresholdPx;
      return;
    }
    press.dragged =
      distance > press.slopPx ||
      (press.held && now() - press.startedAt >= dragHoldMs && distance >= heldDragPx);
  };

  /** Inside the slop of the press that started a moving operation: pointer moves do not reach it yet. */
  const insideSlop = (): boolean => slop && press !== undefined && !press.dragged;

  return (event) => {
    if (event.phase === "cancel") {
      press = undefined;
      selectionOnly = false;
      handler.cancel();
      return;
    }
    if (event.phase === "up") {
      if (event.button !== 0) return;
      updateDrag(event);
      const finish = press?.dragged === true && handler.isActive();
      selectionOnly = false;
      if (finish) {
        press = undefined;
        // Include the release position even when the browser coalesces the final pointer move.
        handler.pointer({ ...event, phase: "move", button: -1 });
        handler.pointer({ ...event, phase: "down" });
        return;
      }
      // A quick click on a moving tool: the operation stays locked, still inside its slop.
      if (slop && press !== undefined && handler.isActive()) press.held = false;
      else press = undefined;
      return;
    }
    if (event.phase === "down") {
      if (event.button !== 0) return;
      const ui = env.session.ui.getState();
      if (autoSelectFor(env, event) && !handler.isActive() && (!event.shiftKey || ui.tool !== "select")) {
        const target = handler.target?.(event);
        if (target !== undefined && !ui.selection.includes(target)) {
          env.session.ui.setState({ selection: [target] });
          selectionOnly = true;
          return;
        }
      }
      if (handler.isActive() && insideSlop()) {
        // A second click before the pointer left the slop: the quick click changes nothing.
        press = undefined;
        handler.cancel();
        return;
      }
      // Refresh the last preview at the commit click, including modifiers and snapped values.
      if (handler.isActive()) handler.pointer({ ...event, phase: "move", button: -1 });
      handler.pointer(event);
      press = handler.isActive()
        ? {
            start: event.screen,
            startedAt: now(),
            slopPx: slopForPointer(event.pointerType),
            dragged: false,
            held: true,
          }
        : undefined;
      return;
    }
    if (selectionOnly) return;
    if (event.phase === "move") {
      if ((event.buttons & 1) !== 0 || insideSlop()) {
        updateDrag(event);
        if (press !== undefined && !press.dragged) return;
      }
    }
    handler.pointer(event);
    if (!handler.isActive()) press = undefined;
  };
};
