// The cue label rides along with the tool's readout ("1.20 m · Endpoint"); without a readout it is shown
// next to the snapped point on its own.
import type { ViewportRuntime } from "../../../renderer/runtimeTypes";
import type { Readout } from "../tools/toolTypes";
import type { InferenceCue } from "./inferenceTypes";

export const readoutWithCue = (
  readout: Readout | undefined,
  cue: InferenceCue | undefined,
  runtime: ViewportRuntime | null,
): Readout | undefined => {
  if (cue === undefined || cue.label === "") return readout;
  if (readout !== undefined) return { ...readout, text: `${readout.text}  ·  ${cue.label}` };
  const screen = cue.marker === null || runtime === null ? null : runtime.screenPointOf(cue.marker);
  return screen === null ? undefined : { text: cue.label, screen };
};
