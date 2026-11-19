// Primary-pointer and touch camera drags in the viewer (Phase 14.6, spec/home-assistant/viewer-mvp.md#houseviewer).
// The builder's gesture map (src/renderer/navigationInput.ts) handles the wheel, pinch, Safari's gesture events, and
// the middle button; the builder forwards primary presses to its tools, while the viewer, which has no tools, turns
// them into camera drags here: a mouse or pen drag orbits (Shift pans), one finger orbits, two fingers pan and pinch
// zooms at their midpoint. A drag starts only past the tap slop, so a tap never moves the camera and a drag never
// counts as a tap (houseViewer.ts reads `pressDragged`). Framework-free.
import type { NavigationTarget } from "../../src/renderer/navigationInput";
import type { ScreenPoint } from "../../src/renderer/runtimeTypes";

export type DragCallbacks = Readonly<{
  /** A drag (or a second finger) begins: the viewer stops a running spring move. */
  onGrab: () => void;
  /** Movement within this many CSS px of the press is still a tap. */
  slopPx: number;
}>;

export type DragNavigation = Readonly<{
  /** True while two or more fingers are down (Safari's gesture events then repeat the pinch; they are ignored). */
  pinching: () => boolean;
  /**
   * True when the pointer's press became a camera drag or joined a multi-finger gesture: it is not a tap. The viewer's
   * own tap listeners are added before this module's, so they read it on the release before it is forgotten.
   */
  pressDragged: (pointerId: number) => boolean;
  dispose: () => void;
}>;

type Tracked = {
  x: number;
  y: number;
  readonly startX: number;
  readonly startY: number;
  readonly touch: boolean;
};

export const attachDragNavigation = (
  element: HTMLElement,
  target: Pick<NavigationTarget, "panPixels" | "orbitPixels" | "zoomAt">,
  callbacks: DragCallbacks,
): DragNavigation => {
  const pointers = new Map<number, Tracked>();
  /** Pointers whose press is no longer a tap (they dragged, or another finger joined), until released. */
  const dragged = new Set<number>();
  /** A one-pointer drag is running (past the slop). */
  let dragging = false;
  /** The last two-finger midpoint and spread while pinching. */
  let pinch: { mid: ScreenPoint; spread: number } | null = null;

  const local = (event: PointerEvent): ScreenPoint => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const touches = (): Tracked[] => [...pointers.values()].filter((pointer) => pointer.touch);

  const pinchOf = (fingers: readonly Tracked[]): { mid: ScreenPoint; spread: number } | null => {
    const [a, b] = fingers;
    if (a === undefined || b === undefined) return null;
    return {
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      spread: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
    };
  };

  const onPointerDown = (event: PointerEvent): void => {
    const touch = event.pointerType === "touch";
    // The middle button and right clicks are the gesture map's (or nobody's); only primary presses drag here.
    if (!touch && event.button !== 0) return;
    const at = local(event);
    pointers.set(event.pointerId, { x: at.x, y: at.y, startX: at.x, startY: at.y, touch });
    if (touch && touches().length >= 2) {
      // A second finger: every finger down is now part of a pan / pinch, never a tap.
      for (const [id, pointer] of pointers) if (pointer.touch) dragged.add(id);
      pinch = pinchOf(touches());
      dragging = false;
      callbacks.onGrab();
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    const pointer = pointers.get(event.pointerId);
    if (pointer === undefined) return;
    const at = local(event);
    const dx = at.x - pointer.x;
    const dy = at.y - pointer.y;
    pointer.x = at.x;
    pointer.y = at.y;
    if (pinch !== null) {
      const next = pinchOf(touches());
      if (next === null) return;
      target.panPixels(next.mid.x - pinch.mid.x, next.mid.y - pinch.mid.y);
      target.zoomAt(next.spread / pinch.spread, next.mid);
      pinch = next;
      return;
    }
    if (pointers.size !== 1) return;
    if (!dragging) {
      if (Math.hypot(at.x - pointer.startX, at.y - pointer.startY) <= callbacks.slopPx) return;
      dragging = true;
      dragged.add(event.pointerId);
      callbacks.onGrab();
      return;
    }
    if (!pointer.touch && event.shiftKey) target.panPixels(dx, dy);
    else target.orbitPixels(dx, dy);
  };

  const onPointerEnd = (event: PointerEvent): void => {
    dragged.delete(event.pointerId);
    if (!pointers.delete(event.pointerId)) return;
    if (pinch !== null) {
      // One finger left of a pinch keeps orbiting from where it is (it stays a drag, never a tap).
      pinch = touches().length >= 2 ? pinchOf(touches()) : null;
      dragging = pinch === null && pointers.size === 1;
    } else if (pointers.size === 0) dragging = false;
  };

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerEnd);
  element.addEventListener("pointercancel", onPointerEnd);

  return {
    pinching: () => pinch !== null,
    pressDragged: (pointerId) => dragged.has(pointerId),
    dispose: () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerEnd);
      element.removeEventListener("pointercancel", onPointerEnd);
    },
  };
};
