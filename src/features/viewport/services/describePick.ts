// Readable summaries of pick hits for the viewport playground.
import type { PickHit } from "../../../renderer/runtimeTypes";

const millimetres = (value: number): string => `${value.toFixed(0)} mm`;

export const describePick = (hit: PickHit | null, areaNames: ReadonlyMap<string, string>): string => {
  if (hit === null) return "Nothing (empty space)";
  const at = `at (${millimetres(hit.pointMm.x)}, ${millimetres(hit.pointMm.y)}, h ${millimetres(hit.pointMm.h)})`;
  switch (hit.kind) {
    case "wall":
      return `Wall ${hit.wallId} (${areaNames.get(hit.areaId) ?? hit.areaId}, ${hit.side}) ${at}`;
    case "floor":
      return `Floor of ${areaNames.get(hit.areaId) ?? hit.areaId} ${at}`;
    case "carpet":
      return `Carpet ${hit.carpetId} (${areaNames.get(hit.areaId) ?? hit.areaId}) ${at}`;
    case "object":
      return `Object ${hit.instanceId} (${areaNames.get(hit.areaId) ?? hit.areaId}${hit.wallId === undefined ? "" : `, wall ${hit.wallId}`}) ${at}`;
    case "light":
      return `Light ${hit.lightId} (${areaNames.get(hit.areaId) ?? hit.areaId}) ${at}`;
    case "helper":
      return `Guide ${hit.id} ${at}`;
    case "buildingFloor":
      return `Building floor ${hit.floorId} ${at}`;
    case "roof":
      return `Roof ${hit.roofId} (floor ${hit.floorId}) ${at}`;
  }
};
