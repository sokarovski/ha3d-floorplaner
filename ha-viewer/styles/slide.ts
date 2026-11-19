// The slide of the room cards and the floor widgets (14.4): the camera's inset spring as a CSS transition, so the
// cards move in step with the house (spec/home-assistant/viewer-mvp.md#room-cards).
import { unsafeCSS } from "lit";
import { slideEasing, slideEasingFallback, slideSeconds } from "../three/springs";

export const slideDuration = unsafeCSS(`${slideSeconds.toFixed(3)}s`);
/** The spring curve (`linear()`); declare a transition with `slideCurveFallback` first for older browsers. */
export const slideCurve = unsafeCSS(slideEasing);
export const slideCurveFallback = unsafeCSS(slideEasingFallback);
