// The one hover look for every grab handle (owner, Phase 4 follow-up): the handle keeps its size and shape but
// turns darker and bolder, so the handle under the pointer is unmistakable before the press. Tools add a
// short label through their cue.
import type { OverlayPrimitive, PlanPoint, PlanPoint3 } from "../../../renderer/runtimeTypes";

export const hoveredHandle = (
  at: PlanPoint | PlanPoint3,
  shape: "dot" | "cross" = "dot",
  sizePx = 8,
): OverlayPrimitive => ({
  kind: "point",
  at,
  marker: shape === "dot" ? "dotBold" : "crossBold",
  sizePx,
  tone: "accentStrong",
});
