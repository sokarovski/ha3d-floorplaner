// The click slop (Phase 19.6, owner: "a quick click never nudges"): how far a press may wander, in CSS pixels on
// screen (never model distance, so it does not depend on zoom), before it counts as a drag. Shared by the builder's
// move and drag tools (src/features/floor-builder/tools/toolPointer.ts) and the HA viewer's taps
// (ha-viewer/gestures.ts, its tap slop), so both front ends read one value. Framework-free.

/** A mouse or pen press is a click until the pointer has moved more than this (CSS px). */
export const clickSlopPx = 6;

/** A finger is less precise: a touch press is a tap until it has moved more than this (CSS px). */
export const touchClickSlopPx = 12;

/** A press held at least this long (ms) becomes a drag as soon as it moves at all (`heldDragPx`). */
export const dragHoldMs = 250;

/** The least movement (CSS px) that starts a drag once the press has been held for `dragHoldMs`. */
export const heldDragPx = 2;

/** The slop for a pointer type ("touch" gets the larger one; mouse, pen and unknown the smaller one). */
export const slopForPointer = (pointerType: string | undefined): number =>
  pointerType === "touch" ? touchClickSlopPx : clickSlopPx;
