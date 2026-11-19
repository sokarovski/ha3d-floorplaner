// Maps the solar position to the viewport sun: full intensity in daylight, fading through twilight, off at night.
// The rule itself lives in the renderer (sunSettingsFromPosition) so the HA viewer uses the same one.
import type { SunResult } from "@shared/domain/environment/sun";
import { sunSettingsFromPosition } from "../../../renderer/lighting";
import type { SunSettings } from "../../../renderer/runtimeTypes";

export const sunSettingsFor = (result: SunResult): SunSettings | undefined =>
  result.ok ? sunSettingsFromPosition(result.sun.directionPlan, result.sun.elevationDeg) : undefined;
