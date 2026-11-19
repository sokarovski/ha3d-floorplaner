// Same-version defaults for building-floor placement and slab (Phase 16): documents saved before the fields existed
// stay valid (they are optional), and reading a house fills the absent ones so the builder's property panel shows
// real values and the next save stores them: position { 0, 0 }, elevation 0, a 200 mm slab of Concrete. Applied by
// migrateHouseDocument after the version migrations, on untyped JSON like them; never changes a present value.
import { defaultSlabThicknessMm } from "../schemas/floor";
import { defaultSlabMaterial } from "./defaults";

type JsonObject = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fillFloor = (floor: unknown): unknown => {
  if (!isObject(floor)) return floor;
  if (
    "positionMm" in floor &&
    "elevationMm" in floor &&
    "slabThicknessMm" in floor &&
    "slabMaterial" in floor
  )
    return floor;
  return {
    ...floor,
    positionMm: floor.positionMm ?? { x: 0, y: 0 },
    elevationMm: floor.elevationMm ?? 0,
    slabThicknessMm: floor.slabThicknessMm ?? defaultSlabThicknessMm,
    slabMaterial: floor.slabMaterial ?? defaultSlabMaterial(),
  };
};

/** Fills absent floor placement and slab fields; returns `document` itself when nothing was missing. */
export const fillFloorDefaults = (document: JsonObject): JsonObject => {
  const floors = document.floors;
  if (!Array.isArray(floors)) return document;
  const filled: unknown[] = floors.map(fillFloor);
  return filled.every((floor, index) => floor === floors[index]) ? document : { ...document, floors: filled };
};
