// DOM input → camera gestures (D16 gesture map) and forwarded editor pointer input.
//
// Trackpad (default): Top — two-finger scroll pans, pinch (wheel + ctrlKey) zooms toward the pointer;
//   3D — two-finger scroll orbits, Shift + scroll pans, pinch zooms toward the pointer.
// Mouse: wheel zooms toward the pointer; middle-drag pans (Top) or orbits (3D); Shift + middle-drag pans.
// Middle-drag works in both modes. Safari's pinch gesture events zoom as well. Camera gestures never emit
// editor pointer events; primary-button and hover input is forwarded unchanged, except while a primary camera
// drag is set (Phase 5.13: the Pan and Orbit tools and holding Space), when a primary drag moves the camera.
// The camera side is the narrow `NavigationTarget` (the builder's CameraRig satisfies it), so the Home Assistant
// viewer drives its own orbit camera with the same gesture map (Phase 14.6).
// While any camera drag runs, the element carries data-camera-drag (the grabbing cursor). A primary press
// released without moving (click–move–click, D16) keeps the camera following the pointer until the next
// primary press, `stopFollow` (Escape), or a change of the primary drag (tool change, Space released).
import type { CameraRig } from "./cameraRig";
import type { NavigationMode, PointerPhase, PrimaryCameraDrag, ScreenPoint } from "./runtimeTypes";

/** What the gestures move: the builder's CameraRig, or another host's camera with the same operations. */
export type NavigationTarget = Pick<
  CameraRig,
  "size" | "mode" | "orbitLocked" | "panPixels" | "orbitPixels" | "zoomAt"
>;

export type ForwardedPointer = Readonly<{
  phase: PointerPhase;
  button: number;
  buttons: number;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  screen: ScreenPoint;
  /** The DOM pointer type ("mouse", "pen", "touch"): the click slop is larger on touch (Phase 19.6). */
  pointerType?: string;
}>;

export type NavigationCallbacks = Readonly<{
  navigation: () => NavigationMode;
  /** The camera drag a primary press starts, or null to forward it to the editor. */
  primaryDrag: () => PrimaryCameraDrag | null;
  /** A primary camera drag starts here (the runtime orbits about the point grabbed). */
  onPrimaryDragStart: (screen: ScreenPoint) => void;
  onCamera: () => void;
  onPointer: (pointer: ForwardedPointer) => void;
  onDoubleClick: (screen: ScreenPoint) => void;
  /**
   * Whether Safari's pinch gesture events zoom now (absent: always). A host that zooms touch pinches itself
   * returns false while it tracks one, since Safari repeats a touch pinch as gesture events.
   */
  gestureZoom?: () => boolean;
}>;

export type NavigationInput = Readonly<{
  /** Ends a click–move–click camera follow; true when one was running. */
  stopFollow: () => boolean;
  dispose: () => void;
}>;

/** A primary camera press that travels less than this (CSS px) before release is a click: it starts following. */
const clickTravelPx = 4;

const pinchSensitivity = 0.01;
const wheelZoomSensitivity = 0.0015;
const lineHeightPx = 16;

type CameraDrag = {
  pointerId: number;
  last: ScreenPoint;
  base: "pan" | "orbit";
  shift: PrimaryCameraDrag["shift"];
  /** Primary (Pan/Orbit tools, Space) rather than the middle button: may turn into a follow. */
  primary: boolean;
  /** Farthest the pointer got from the press (CSS px). */
  travel: number;
  start: ScreenPoint;
  /** Click–move–click: the button is up and the camera follows plain pointer moves. */
  follow: boolean;
};

/** Pan or orbit for this move: Top always pans; Shift turns the drag into its `shift` alternative. */
const pansNow = (drag: CameraDrag, top: boolean, shiftKey: boolean): boolean => {
  if (top) return true;
  if (shiftKey && drag.shift === "toPan") return true;
  if (shiftKey && drag.shift === "toOrbit") return false;
  return drag.base === "pan";
};

export const attachNavigationInput = (
  element: HTMLElement,
  rig: NavigationTarget,
  callbacks: NavigationCallbacks,
): NavigationInput => {
  let drag: CameraDrag | null = null;
  let primaryPointerId: number | null = null;
  let lastPointer: ScreenPoint = { x: 0, y: 0 };
  let gestureScale = 1;

  const screenOf = (event: MouseEvent): ScreenPoint => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const forward = (phase: PointerPhase, event: PointerEvent, button: number): void => {
    callbacks.onPointer({
      phase,
      button,
      buttons: event.buttons,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      screen: screenOf(event),
      pointerType: event.pointerType,
    });
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const scale = event.deltaMode === 1 ? lineHeightPx : event.deltaMode === 2 ? rig.size().height : 1;
    const dx = event.deltaX * scale;
    const dy = event.deltaY * scale;
    const screen = screenOf(event);
    if (callbacks.navigation() === "mouse") {
      rig.zoomAt(Math.exp(-dy * (event.ctrlKey ? pinchSensitivity : wheelZoomSensitivity)), screen);
    } else if (event.ctrlKey) {
      rig.zoomAt(Math.exp(-dy * pinchSensitivity), screen);
    } else if (rig.mode() === "top" || event.shiftKey || rig.orbitLocked()) {
      // A face view (Phase 5.1) has no orbit: two-finger scroll pans there, as in Top.
      rig.panPixels(-dx, -dy);
    } else {
      rig.orbitPixels(-dx, -dy);
    }
    callbacks.onCamera();
  };

  const onPointerDown = (event: PointerEvent): void => {
    lastPointer = screenOf(event);
    if (event.button === 1) {
      event.preventDefault();
      if (drag !== null) return;
      // Middle drag (mouse): Shift at the press pans; Shift during an orbit pans too.
      drag = {
        pointerId: event.pointerId,
        last: lastPointer,
        base: rig.mode() === "top" || event.shiftKey ? "pan" : "orbit",
        shift: "toPan",
        primary: false,
        travel: 0,
        start: lastPointer,
        follow: false,
      };
      element.setPointerCapture(event.pointerId);
      element.dataset.cameraDrag = "";
      return;
    }
    if (drag?.follow === true) {
      // The click that ends a click–move–click camera follow is consumed, its release too.
      if (event.button === 0) {
        stopFollow();
        swallowUpPointerId = event.pointerId;
        element.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (drag !== null) return;
    const primary = event.button === 0 ? callbacks.primaryDrag() : null;
    if (primary !== null) {
      drag = {
        pointerId: event.pointerId,
        last: lastPointer,
        ...primary,
        primary: true,
        travel: 0,
        start: lastPointer,
        follow: false,
      };
      element.setPointerCapture(event.pointerId);
      element.dataset.cameraDrag = "";
      callbacks.onPrimaryDragStart(lastPointer);
      return;
    }
    if (event.button === 0) {
      primaryPointerId = event.pointerId;
      element.setPointerCapture(event.pointerId);
    }
    forward("down", event, event.button);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const screen = screenOf(event);
    lastPointer = screen;
    if (drag !== null) {
      if (!drag.follow && event.pointerId !== drag.pointerId) return;
      const dx = screen.x - drag.last.x;
      const dy = screen.y - drag.last.y;
      drag.last = screen;
      drag.travel = Math.max(drag.travel, Math.hypot(screen.x - drag.start.x, screen.y - drag.start.y));
      if (pansNow(drag, rig.mode() === "top" || rig.orbitLocked(), event.shiftKey)) rig.panPixels(dx, dy);
      else rig.orbitPixels(dx, dy);
      callbacks.onCamera();
      return;
    }
    forward("move", event, -1);
  };

  /** The release of the click that ended a follow: consumed, never forwarded to the editor. */
  let swallowUpPointerId: number | null = null;

  const stopFollow = (): boolean => {
    if (drag?.follow !== true) return false;
    drag = null;
    delete element.dataset.cameraDrag;
    return true;
  };

  const endDrag = (event: PointerEvent): boolean => {
    // A follow outlives its press: only the next click, Escape, or a primary-drag change ends it.
    if (drag?.follow === true || drag?.pointerId !== event.pointerId) return false;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    drag = null;
    delete element.dataset.cameraDrag;
    return true;
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (swallowUpPointerId === event.pointerId) {
      swallowUpPointerId = null;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      return;
    }
    if (drag !== null && !drag.follow && drag.primary && drag.pointerId === event.pointerId) {
      if (drag.travel < clickTravelPx) {
        // A click, not a drag: keep following the pointer until the next click (click–move–click).
        drag.follow = true;
        drag.last = screenOf(event);
        if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
        return;
      }
    }
    if (endDrag(event)) return;
    if (event.button === 0) primaryPointerId = null;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    forward("up", event, event.button);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (endDrag(event)) return;
    primaryPointerId = null;
    forward("cancel", event, event.button);
  };

  const onLostPointerCapture = (event: PointerEvent): void => {
    if (endDrag(event) || primaryPointerId !== event.pointerId) return;
    primaryPointerId = null;
    forward("cancel", event, event.button);
  };

  const onPointerLeave = (event: PointerEvent): void => {
    if (drag !== null) return;
    forward("leave", event, -1);
  };

  const onDoubleClick = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    callbacks.onDoubleClick(screenOf(event));
  };

  const onAuxClick = (event: MouseEvent): void => {
    if (event.button === 1) event.preventDefault();
  };

  const onGestureStart = (event: Event): void => {
    event.preventDefault();
    gestureScale = 1;
  };

  const onGestureChange = (event: Event): void => {
    event.preventDefault();
    if (!("scale" in event) || typeof event.scale !== "number" || event.scale <= 0) return;
    if (callbacks.gestureZoom?.() === false) {
      gestureScale = event.scale;
      return;
    }
    rig.zoomAt(event.scale / gestureScale, lastPointer);
    gestureScale = event.scale;
    callbacks.onCamera();
  };

  element.addEventListener("wheel", onWheel, { passive: false });
  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerCancel);
  element.addEventListener("lostpointercapture", onLostPointerCapture);
  element.addEventListener("pointerleave", onPointerLeave);
  element.addEventListener("dblclick", onDoubleClick);
  element.addEventListener("auxclick", onAuxClick);
  element.addEventListener("gesturestart", onGestureStart);
  element.addEventListener("gesturechange", onGestureChange);

  return {
    stopFollow,
    dispose: () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerCancel);
      element.removeEventListener("lostpointercapture", onLostPointerCapture);
      element.removeEventListener("pointerleave", onPointerLeave);
      element.removeEventListener("dblclick", onDoubleClick);
      element.removeEventListener("auxclick", onAuxClick);
      element.removeEventListener("gesturestart", onGestureStart);
      element.removeEventListener("gesturechange", onGestureChange);
    },
  };
};
