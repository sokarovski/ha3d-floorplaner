// The device default of the viewer's navigation (Phase 14.6, navigationSetting.ts): kept apart from the pure setting
// code, which the checks run without a DOM.

/** True on a touch-first device: a coarse primary pointer and no fine pointer at all (a wall tablet, a phone). */
export const touchFirstDevice = (): boolean =>
  window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches;
