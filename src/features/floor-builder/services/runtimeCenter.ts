// The screen center of the viewport runtime's canvas, used to find the plan point at the view center.
import type { ScreenPoint, ViewportRuntime } from "../../../renderer/runtimeTypes";

export const runtimeCenter = (runtime: ViewportRuntime): ScreenPoint => {
  const camera = runtime.cameraSnapshot();
  const anchor = runtime.screenPointOf({
    x: camera.target.x * 1000,
    y: -camera.target.z * 1000,
    h: camera.target.y * 1000,
  });
  return anchor ?? { x: 0, y: 0 };
};
