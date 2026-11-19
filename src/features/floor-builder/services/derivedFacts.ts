// Derived, never-stored values shown below the property fields (floor area, wall length, vertex count).
import { computeAreaLocalGeometry } from "@shared/geometry/areaGeometry";
import { regionArea } from "@shared/geometry/region";
import type { EntityRef } from "@shared/domain/house/entityIndex";
import type { HouseDocument, LengthUnit } from "@shared/domain/schemas/house";
import { wallLengthOf } from "./wallLength";
import { formatLength } from "@shared/domain/units/lengthUnits";
import { environmentSun } from "@shared/domain/environment/sun";

export type Fact = Readonly<{ label: string; value: string }>;

const squareMeters = (mm2: number): string => `${(mm2 / 1e6).toFixed(2)} m²`;

export const derivedFacts = (ref: EntityRef, unit: LengthUnit, house: HouseDocument): readonly Fact[] => {
  if (ref.kind === "house") {
    const sun = environmentSun(ref.value.environment, new Date());
    if (!sun.ok) return [{ label: "Sun", value: sun.message }];
    return [
      { label: "Sun instant", value: sun.sun.instant.toISOString().replace(".000Z", "Z") },
      { label: "Sun azimuth", value: `${sun.sun.azimuthDeg.toFixed(1)}°` },
      { label: "Sun elevation", value: `${sun.sun.elevationDeg.toFixed(1)}°` },
      {
        label: "Daylight",
        value: sun.sun.phase === "day" ? "Day" : sun.sun.phase === "twilight" ? "Twilight" : "Night",
      },
    ];
  }
  if (ref.kind === "area") {
    const geometry = computeAreaLocalGeometry(ref.value);
    return [
      { label: "Floor area", value: squareMeters(regionArea(geometry.union.region)) },
      { label: "Walls", value: String(ref.value.walls.length) },
    ];
  }
  if (ref.kind === "wall") {
    const length = wallLengthOf(house, ref.areaId, ref.value);
    return [{ label: "Length", value: formatLength(length, unit) }];
  }
  if (ref.kind === "shape" && ref.value.type === "polygon") {
    let perimeter = 0;
    const vertices = ref.value.vertices;
    vertices.forEach((vertex, index) => {
      const next = vertices[(index + 1) % vertices.length];
      if (next !== undefined) perimeter += Math.hypot(next.x - vertex.x, next.y - vertex.y);
    });
    return [
      { label: "Vertices", value: String(vertices.length) },
      { label: "Perimeter", value: formatLength(perimeter, unit) },
    ];
  }
  if (ref.kind === "guide")
    return [
      {
        label: "Distance",
        value: formatLength(
          Math.hypot(ref.value.bMm.x - ref.value.aMm.x, ref.value.bMm.y - ref.value.aMm.y),
          unit,
        ),
      },
    ];
  return [];
};
