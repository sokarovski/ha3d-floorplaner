// Migration v2 → v3 (Phase 3): staircases gain a direction; existing ones climb up from this floor.
type JsonObject = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const migrateArea = (area: unknown): unknown => {
  if (!isObject(area) || !isObject(area.staircase) || "direction" in area.staircase) return area;
  return { ...area, staircase: { ...area.staircase, direction: "up" } };
};

export const migrateStaircaseDirectionV2 = (document: JsonObject): JsonObject => ({
  ...document,
  floors: list(document.floors).map((floor) =>
    isObject(floor) ? { ...floor, areas: list(floor.areas).map(migrateArea) } : floor,
  ),
});
