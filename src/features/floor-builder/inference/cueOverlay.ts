// Draws an inference cue as overlay primitives: dotted colored lines and a marker at the snapped point.
import type { OverlayPrimitive, OverlayTone } from "../../../renderer/runtimeTypes";
import type { CueColor, InferenceCue } from "./inferenceTypes";

const tones: Readonly<Record<CueColor, OverlayTone>> = {
  axisX: "inferenceX",
  axisY: "inferenceY",
  vertical: "inferenceVertical",
  edge: "inferenceEdge",
};

export const cueOverlay = (cue: InferenceCue | undefined): readonly OverlayPrimitive[] => {
  if (cue === undefined) return [];
  const lines: OverlayPrimitive[] = cue.lines.map((line) => ({
    kind: "segment",
    from: line.from,
    to: line.to,
    dashed: true,
    tone: tones[line.color],
  }));
  return cue.marker === null
    ? lines
    : [...lines, { kind: "point", at: cue.marker, marker: "dot", sizePx: 9, tone: "accent" }];
};
