// Migration v3 → v4 (wall relief groups): a relief was one rectangle (alongMm, bottomMm, widthMm, heightMm); it
// becomes a feature holding that rectangle as a shape in the face frame (x along the wall, y up from the floor).
type JsonObject = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const num = (value: unknown): number => (typeof value === "number" ? value : 0);

const migrateRelief = (relief: unknown, index: number): unknown => {
  if (!isObject(relief) || "shapes" in relief) return relief;
  const { alongMm, bottomMm, widthMm, heightMm, ...rest } = relief;
  const width = num(widthMm);
  const height = num(heightMm);
  return {
    ...rest,
    shapes: [
      {
        id: `s_${(typeof rest.id === "string" ? rest.id : `rel${String(index)}0000`).replace(/^wr_/, "")}`,
        type: "rectangle",
        positionMm: { x: num(alongMm) + width / 2, y: num(bottomMm) + height / 2 },
        rotationDeg: 0,
        widthMm: width,
        heightMm: height,
      },
    ],
  };
};

const migrateWall = (wall: unknown): unknown =>
  isObject(wall) && Array.isArray(wall.reliefs)
    ? { ...wall, reliefs: wall.reliefs.map(migrateRelief) }
    : wall;

export const migrateWallReliefsV3 = (document: JsonObject): JsonObject => ({
  ...document,
  floors: list(document.floors).map((floor) =>
    isObject(floor)
      ? {
          ...floor,
          areas: list(floor.areas).map((area) =>
            isObject(area) ? { ...area, walls: list(area.walls).map(migrateWall) } : area,
          ),
        }
      : floor,
  ),
});
