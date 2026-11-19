// The snapshot recorded with an export: document revision, floor, camera, settings, renderer, sun instant.
import type { ExportMetadataInputValue } from "@shared/contracts/exports";
import type { HouseDocument } from "@shared/domain/schemas/house";
import { effectiveInstant, environmentSun, solarCalculationVersion } from "@shared/domain/environment/sun";
import type { CameraSnapshot } from "../../../renderer/runtimeTypes";

/** The depicted simulation instant (UTC), frozen once per export. */
export const simulationInstant = (house: HouseDocument, now: Date): string | null => {
  const instant = effectiveInstant(house.environment, now);
  return instant.ok ? instant.instant.toISOString() : null;
};

export const exportMetadata = (
  house: HouseDocument,
  revision: number,
  floorId: string,
  camera: CameraSnapshot,
  settings: Readonly<{
    scale: number;
    transparentBackground: boolean;
    widthPx: number;
    heightPx: number;
    capped: boolean;
  }>,
): ExportMetadataInputValue => ({
  houseRevision: revision,
  floorId,
  camera: { ...camera },
  renderSettings: { ...settings, environment: environmentSnapshot(house) },
  renderer: { name: "homeplan-webgl", version: "1" },
  simulationInstant: simulationInstant(house, new Date()),
  assetVersions: {
    templates: Object.fromEntries(
      house.floors
        .find((floor) => floor.id === floorId)
        ?.areas.flatMap((area) => [...area.walls.flatMap((wall) => wall.objects), ...area.objects])
        .map((instance) => [instance.templateId, instance.templateVersion]) ?? [],
    ),
  },
});

const environmentSnapshot = (house: HouseDocument): Readonly<Record<string, unknown>> => {
  const sun = environmentSun(house.environment, new Date());
  return {
    location: house.environment.location,
    northRotationDeg: house.environment.northRotationDeg,
    timeMode: house.environment.sun.timeMode,
    fixedLocalDateTime: house.environment.sun.fixedLocalDateTime,
    sunAzimuthDeg: sun.ok ? sun.sun.azimuthDeg : null,
    sunElevationDeg: sun.ok ? sun.sun.elevationDeg : null,
    solarCalculation: solarCalculationVersion,
    sky: "hemisphere + directional sun, AgX tone mapping",
  };
};
