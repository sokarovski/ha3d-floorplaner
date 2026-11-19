// Creates a demo house through the running API (npm run seed:demo). Useful for trying the editor quickly:
// two 200 mm rooms at Full clash, a 400 mm room at Touching, a window, a door through the shared wall, a guide.
import { createArea, createWall, createHouseDocument } from "../shared/domain/house/defaults";
import { createId } from "../shared/domain/ids";
import type { AreaValue } from "../shared/domain/schemas/area";
import type { HouseDocument } from "../shared/domain/schemas/house";

const base = process.env.HOMEPLAN_URL ?? "http://localhost:4310";

const room = (
  name: string,
  x: number,
  y: number,
  width: number,
  depth: number,
  thickness: number,
  interior: readonly [number, number, number],
): AreaValue => {
  const area = createArea(name, { x, y });
  const shapeId = createId("s");
  area.floor.shapes.push({
    id: shapeId,
    type: "rectangle",
    positionMm: { x: 0, y: 0 },
    rotationDeg: 0,
    widthMm: width,
    heightMm: depth,
  });
  for (const edge of ["bottom", "right", "top", "left"] as const) {
    const wall = createWall(shapeId, edge);
    wall.thicknessMm = thickness;
    wall.materials.interior.pbrMetallicRoughness.baseColorFactor = [interior[0], interior[1], interior[2], 1];
    area.walls.push(wall);
  }
  return area;
};

const main = async (): Promise<void> => {
  const created = await fetch(`${base}/api/houses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Demo: shared walls" }),
  });
  if (!created.ok) throw new Error(`Create failed: ${String(created.status)} ${await created.text()}`);
  const card: unknown = await created.json();
  if (typeof card !== "object" || card === null || !("id" in card) || typeof card.id !== "string")
    throw new Error("Unexpected create response");
  const house: HouseDocument = createHouseDocument(card.id, "Demo: shared walls");
  const floor = house.floors[0];
  if (floor === undefined) throw new Error("No floor");
  // Rectangle positions are centers. Full clash: contours 200 mm apart (max thickness). Touching: 200 + 400 mm apart.
  const living = room("Living room", 2500, 2000, 5000, 4000, 200, [0.95, 0.94, 0.9]);
  const kitchen = room("Kitchen", 5000 + 200 + 1500, 2000, 3000, 4000, 200, [0.82, 0.9, 0.82]);
  const study = room("Study", 2500, 4000 + 600 + 1500, 5000, 3000, 400, [0.8, 0.86, 0.95]);
  const front = living.walls[0];
  if (front !== undefined) {
    front.objects.push({
      id: createId("o"),
      name: "Window 1",
      templateId: "window-style-1",
      templateVersion: 1,
      placement: { distanceAlongWallMm: 2500, bottomMm: 900 },
      parameters: { widthMm: 1600, heightMm: 1200 },
      flip: { x: false, z: false },
      materialOverrides: {},
    });
  }
  const shared = living.walls[1];
  if (shared !== undefined) {
    shared.objects.push({
      id: createId("o"),
      name: "Door 1",
      templateId: "door-interior",
      templateVersion: 1,
      placement: { distanceAlongWallMm: 2000, bottomMm: 0 },
      parameters: { widthMm: 850, heightMm: 2050 },
      flip: { x: false, z: false },
      materialOverrides: {},
    });
  }
  floor.areas.push(living, kitchen, study);
  floor.guides.push({
    id: createId("gd"),
    kind: "line",
    visible: true,
    aMm: { x: -3000, y: -1500 },
    bMm: { x: 9000, y: -1500 },
  });
  const saved = await fetch(`${base}/api/houses/${card.id}/document`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision: 0, document: house }),
  });
  if (!saved.ok) throw new Error(`Save failed: ${String(saved.status)} ${await saved.text()}`);
  console.log(`Demo house created: /houses/${card.id}`);
};

await main();
