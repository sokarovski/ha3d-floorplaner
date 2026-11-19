// "Multi-storey test" house (Phase 16 fixture): three floors with different footprints for the slab, placement and
// whole-house work, never a real house. Ground (0 mm, 2600 mm walls): Living and Kitchen at Full clash (one
// slab part), a detached Store (a second part), a straight stair object in Living (Phase 16.14) whose rise reaches
// First, so First is cut above it automatically. First (suggested elevation 2800 mm, 2500 mm walls): Bedroom and
// Bath, a floor opening in the Bedroom. Attic (suggested 5500 mm, 1200 mm walls, 150 mm slab): one Loft. Used by
// scripts/check-slabs.mjs, scripts/check-stairs.mjs and scripts/seed-multistorey.ts.
import { createArea, createFloor, createHouseDocument, createWall } from "../../shared/domain/house/defaults";
import { suggestedElevationAboveMm } from "../../shared/domain/house/floorPlacement";
import { createId } from "../../shared/domain/ids";
import type { AreaValue } from "../../shared/domain/schemas/area";
import type { BuildingFloorValue } from "../../shared/domain/schemas/floor";
import type { HouseDocument } from "../../shared/domain/schemas/house";
import type { AreableInstanceValue } from "../../shared/domain/schemas/instances";

export const multiStoreyHouseName = "Multi-storey test";

const rectangle = (area: AreaValue, width: number, depth: number): string => {
  const shapeId = createId("s");
  area.floor.shapes.push({
    id: shapeId,
    type: "rectangle",
    positionMm: { x: 0, y: 0 },
    rotationDeg: 0,
    widthMm: width,
    heightMm: depth,
  });
  return shapeId;
};

/** A walled rectangular room centred at (x, y). */
export const fixtureRoom = (
  name: string,
  centre: { x: number; y: number },
  size: { width: number; depth: number },
  wallHeightMm: number,
): AreaValue => {
  const area = createArea(name, centre);
  const shapeId = rectangle(area, size.width, size.depth);
  for (const edge of ["bottom", "right", "top", "left"] as const)
    area.walls.push(createWall(shapeId, edge, wallHeightMm));
  return area;
};

type FixtureCut = Readonly<{
  centre: { x: number; y: number };
  size: { width: number; depth: number };
  rotationDeg?: number;
}>;

const cutObject = (name: string, templateId: string, cut: FixtureCut): AreableInstanceValue => ({
  id: createId("o"),
  name,
  templateId,
  templateVersion: 1,
  parameters: { widthMm: cut.size.width, depthMm: cut.size.depth },
  flip: { x: false, z: false },
  materialOverrides: {},
  attachment: { host: "floor" },
  positionMm: { ...cut.centre },
  elevationMm: 0,
  rotationDeg: cut.rotationDeg ?? 0,
});

/** A straight stair object (Phase 16.14) centred at `centre` in its room, climbing `riseMm`. */
export const fixtureStair = (
  cut: FixtureCut,
  riseMm: number,
  switches: Readonly<{ above?: boolean; below?: boolean }> = {},
): AreableInstanceValue => {
  const base = cutObject("Straight Staircase", "staircase-straight", cut);
  return {
    ...base,
    parameters: { ...base.parameters, totalRiseMm: riseMm, stepCount: 15 },
    floorCut: "stair",
    cutFloorAbove: switches.above ?? true,
    cutFloorBelow: switches.below ?? false,
  };
};

/** A floor opening object (Phase 16.14) centred at `centre` in its room; `round` gives the ellipse template. */
export const fixtureFloorOpening = (cut: FixtureCut, round = false): AreableInstanceValue => ({
  ...cutObject(
    round ? "Round Floor Opening" : "Floor Opening",
    round ? "floor-opening-round" : "floor-opening",
    cut,
  ),
  floorCut: "opening",
  ...(round ? { floorCutShape: "ellipse" as const } : {}),
});

const withObjects = (area: AreaValue, objects: readonly AreableInstanceValue[]): AreaValue => ({
  ...area,
  objects: [...area.objects, ...objects],
});

const floorWith = (
  name: string,
  areas: readonly AreaValue[],
  elevationMm: number,
  slabThicknessMm?: number,
): BuildingFloorValue => ({
  ...createFloor(name, elevationMm),
  ...(slabThicknessMm === undefined ? {} : { slabThicknessMm }),
  areas: [...areas],
});

/** The stair's plan size in the fixture (1 m × 2.8 m, the template's default footprint). */
export const stairSize = { width: 1000, depth: 2800 };

export const buildMultiStoreyHouse = (id: string): HouseDocument => {
  const house = createHouseDocument(id, multiStoreyHouseName);
  const living = fixtureRoom("Living", { x: 3000, y: 2000 }, { width: 6000, depth: 4000 }, 2600);
  const kitchen = fixtureRoom(
    "Kitchen",
    { x: 6000 + 200 + 1500, y: 2000 },
    { width: 3000, depth: 4000 },
    2600,
  );
  const store = fixtureRoom("Store", { x: 3000, y: -3000 }, { width: 2000, depth: 2000 }, 2600);
  // Before 16.14 the stair stood in its own staircase area at floor (1000, 2000); now it is an object in Living.
  const groundShell = floorWith("Ground", [living, kitchen, store], 0);
  const firstElevation = suggestedElevationAboveMm(groundShell, house);
  const ground: BuildingFloorValue = {
    ...groundShell,
    areas: [
      // Full clash: contours 200 mm apart (the wall thickness), so the slabs merge.
      withObjects(living, [fixtureStair({ centre: { x: -2000, y: 0 }, size: stairSize }, firstElevation)]),
      kitchen,
      store,
    ],
  };
  const bedroom = fixtureRoom("Bedroom", { x: 2500, y: 2000 }, { width: 5000, depth: 4000 }, 2500);
  const first = floorWith(
    "First",
    [
      // A light well in the Bedroom, cut by its own outline.
      withObjects(bedroom, [
        fixtureFloorOpening({ centre: { x: 1200, y: 800 }, size: { width: 1200, depth: 900 } }),
      ]),
      fixtureRoom("Bath", { x: 5000 + 200 + 1500, y: 1250 }, { width: 3000, depth: 2500 }, 2500),
    ],
    firstElevation,
  );
  const attic = floorWith(
    "Attic",
    [fixtureRoom("Loft", { x: 3000, y: 1500 }, { width: 4000, depth: 3000 }, 1200)],
    suggestedElevationAboveMm(first, house, 150),
    150,
  );
  return { ...house, floors: [ground, first, attic] };
};
