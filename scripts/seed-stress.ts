// Creates a larger test house through the running API (npm run seed:stress): a 5 × 4 grid of furnished rooms
// with shared walls, openings, objects, carpets, and lights, for performance measurements (milestone 1.17).
import { createLight } from "../shared/domain/commands/furnishingCommands";
import { createArea, createHouseDocument, createWall } from "../shared/domain/house/defaults";
import { createId } from "../shared/domain/ids";
import type { HouseDocument } from "../shared/domain/schemas/house";

const base = process.env.HOMEPLAN_URL ?? "http://localhost:4310";
const columns = 5;
const rows = 4;
const width = 4000;
const depth = 3500;
const thickness = 200;

const main = async (): Promise<void> => {
  const created = await fetch(`${base}/api/houses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Stress: 20 rooms" }),
  });
  const card: unknown = await created.json();
  if (typeof card !== "object" || card === null || !("id" in card) || typeof card.id !== "string")
    throw new Error("Unexpected create response");
  const house: HouseDocument = createHouseDocument(card.id, "Stress: 20 rooms");
  const floor = house.floors[0];
  if (floor === undefined) throw new Error("No floor");
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const area = createArea(`Room ${String(row * columns + column + 1)}`, {
        x: column * (width + thickness),
        y: row * (depth + thickness),
      });
      const shapeId = createId("s");
      area.floor.shapes.push({
        id: shapeId,
        type: "rectangle",
        positionMm: { x: 0, y: 0 },
        rotationDeg: 0,
        widthMm: width,
        heightMm: depth,
      });
      for (const edge of ["bottom", "right", "top", "left"] as const)
        area.walls.push(createWall(shapeId, edge));
      const [bottom, right] = area.walls;
      bottom?.objects.push({
        id: createId("o"),
        name: "Window",
        templateId: "window-style-1",
        templateVersion: 1,
        placement: { distanceAlongWallMm: width / 2, bottomMm: 900 },
        parameters: { widthMm: 1400, heightMm: 1200 },
        flip: { x: false, z: false },
        materialOverrides: {},
      });
      right?.objects.push({
        id: createId("o"),
        name: "Door",
        templateId: "door-interior",
        templateVersion: 1,
        placement: { distanceAlongWallMm: 1200, bottomMm: 0 },
        parameters: { widthMm: 850, heightMm: 2050 },
        flip: { x: false, z: false },
        materialOverrides: {},
      });
      area.objects.push({
        id: createId("o"),
        name: "Sofa",
        templateId: "sofa-3-seat",
        templateVersion: 1,
        parameters: { widthMm: 2200 },
        flip: { x: false, z: false },
        materialOverrides: {},
        attachment: { host: "floor" },
        positionMm: { x: 0, y: -600 },
        elevationMm: 0,
        rotationDeg: 0,
      });
      area.floor.carpets.push({
        id: createId("c"),
        name: "Carpet 1",
        positionMm: { x: 0, y: 300 },
        rotationDeg: 0,
        material: {
          pbrMetallicRoughness: {
            baseColorFactor: [0.5, 0.25, 0.2, 1],
            roughnessFactor: 0.95,
            metallicFactor: 0,
          },
        },
        shapes: [
          {
            id: createId("s"),
            type: "rectangle",
            positionMm: { x: 0, y: 0 },
            rotationDeg: 0,
            widthMm: 2000,
            heightMm: 1400,
          },
        ],
      });
      const light = createLight("Light 1", { x: 0, y: 0 });
      light.fixture = { templateId: "pendant-light", templateVersion: 1 };
      area.lights.push(light);
      floor.areas.push(area);
    }
  }
  const saved = await fetch(`${base}/api/houses/${card.id}/document`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedRevision: 0, document: house }),
  });
  if (!saved.ok) throw new Error(`Save failed: ${String(saved.status)} ${await saved.text()}`);
  console.log(`Stress house created: /houses/${card.id}`);
};

await main();
