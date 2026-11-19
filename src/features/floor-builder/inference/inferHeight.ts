// Height inference: every wall height on the active floor projects a horizontal inference line; a height
// being dragged snaps to the nearest one within the capture radius, with a blue cue naming the wall.
import type { Vec2 } from "@shared/geometry/vector";
import type { InferenceCue, InferenceScene, SceneHeight } from "./inferenceTypes";
import { inferenceCapturePx } from "./inferPoint";

export type HeightInference = Readonly<{ heightMm: number; source: SceneHeight; cue: InferenceCue }>;

export const inferHeight = (
  scene: InferenceScene,
  heightMm: number,
  mmPerPixel: number,
  options: Readonly<{
    /** Where the dragged height is shown (plan mm): the cue runs from the referenced wall to here. */
    at: Vec2;
    excludeWallIds?: readonly string[];
    /** Among equal heights, name a wall of this area (the one being edited). */
    preferAreaId?: string;
    format: (mm: number) => string;
  }>,
): HeightInference | undefined => {
  const radius = inferenceCapturePx * mmPerPixel;
  let best: SceneHeight | undefined;
  let bestDelta = radius;
  for (const candidate of scene.heights) {
    if (options.excludeWallIds?.includes(candidate.wallId) === true) continue;
    const delta = Math.abs(candidate.heightMm - heightMm);
    const sameHeight = best !== undefined && Math.abs(candidate.heightMm - best.heightMm) < 0.5;
    if (sameHeight && candidate.areaId !== options.preferAreaId) continue;
    if (delta <= bestDelta || (sameHeight && best?.areaId !== options.preferAreaId)) {
      best = candidate;
      bestDelta = delta;
    }
  }
  if (best === undefined) return undefined;
  const h = best.heightMm;
  return {
    heightMm: h,
    source: best,
    cue: {
      lines: [{ from: { ...best.at, h }, to: { ...options.at, h }, color: "vertical" }],
      marker: { ...options.at, h },
      label: `Height ${options.format(h)} (${best.wallLabel})`,
    },
  };
};
