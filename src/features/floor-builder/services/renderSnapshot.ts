// The frozen render snapshot (D11): house revision, floor, camera, size, and environment at submit time.
import type { RenderSnapshotValue } from "@shared/contracts/renders";
import { effectiveInstant } from "@shared/domain/environment/sun";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { CameraSnapshot } from "../../../renderer/runtimeTypes";

export type RenderScene = Readonly<{
  camera: CameraSnapshot;
  sun: Readonly<{ directionWorld: readonly [number, number, number]; intensity: number }>;
}>;

const longSidePx = 1600;

export const renderSnapshot = (
  house: HouseDocument,
  revision: number,
  floorId: string,
  scene: RenderScene,
): RenderSnapshotValue => {
  const aspect = scene.camera.aspect > 0 ? scene.camera.aspect : 16 / 10;
  const widthPx = aspect >= 1 ? longSidePx : Math.round(longSidePx * aspect);
  const heightPx = aspect >= 1 ? Math.round(longSidePx / aspect) : longSidePx;
  const instant = effectiveInstant(house.environment, new Date());
  return {
    houseRevision: revision,
    floorId,
    widthPx,
    heightPx,
    camera: { ...scene.camera },
    environment: {
      sunDirectionWorld: [
        scene.sun.directionWorld[0],
        scene.sun.directionWorld[1],
        scene.sun.directionWorld[2],
      ],
      sunIntensity: scene.sun.intensity,
      timeInstant: instant.ok ? instant.instant.toISOString() : null,
    },
  };
};
