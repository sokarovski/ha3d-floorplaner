// Building-floor slabs and placement (Phase 16.2/16.4, spec/builder/model.md#floor-placement-and-slab): the derived
// slab (shared/geometry/floorSlab.ts) and the placement helpers (shared/domain/house/floorPlacement.ts) on synthetic
// floors and the "Multi-storey test" fixture (scripts/fixtures/multiStoreyHouse.ts), plus the compatibility of
// documents saved before the fields existed. No browser or WebGL. Run: npm run slabs:check
import { Value } from "typebox/value";
import { addFloorCommand } from "@shared/domain/commands/floorCommands";
import { runCommand } from "@shared/domain/commands/command";
import { createFloor, createHouseDocument } from "@shared/domain/house/defaults";
import {
  floorPlacementOf,
  floorSlabOf,
  floorsByElevation,
  suggestedElevationAboveMm,
  tallestWallMm,
} from "@shared/domain/house/floorPlacement";
import { migrateHouseDocument } from "@shared/domain/house/migrations";
import { House } from "@shared/domain/schemas/house";
import { buildFloorSlab, slabCoverage } from "@shared/geometry/floorSlab";
import { floorPointToHouse, floorToHouseOffset } from "@shared/geometry/placement";
import { regionArea, regionBounds } from "@shared/geometry/region";
import { floorCutsOf } from "@shared/geometry/floorCuts";
import {
  buildMultiStoreyHouse,
  fixtureFloorOpening,
  fixtureRoom,
  fixtureStair,
  stairSize,
} from "./fixtures/multiStoreyHouse.ts";
import { Mesh, MeshStandardMaterial } from "three";
import { openingSizeFromParameters } from "@shared/domain/templates/openingSize";
import { createHouseExterior } from "../src/renderer/houseExterior.ts";
import { helperPalette } from "../src/renderer/helperPalette.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `  (${detail})`}`);
};
const near = (a, b, tolerance = 0.5) => Math.abs(a - b) <= tolerance;
const floorOf = (areas, extra = {}) => ({ ...createFloor("Test"), ...extra, areas });
const holeCount = (region) => region.polygons.reduce((sum, polygon) => sum + polygon.holes.length, 0);

/** Sums of triangle areas by facing (up, down, side) and the up-facing triangles' heights. */
const faceAreas = (mesh) => {
  const result = { up: 0, down: 0, side: 0, upHeights: new Set(), downHeights: new Set() };
  const p = mesh.positions;
  const n = mesh.normals;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]];
    const ax = p[a * 3],
      ay = p[a * 3 + 1],
      ah = p[a * 3 + 2];
    const ux = p[b * 3] - ax,
      uy = p[b * 3 + 1] - ay,
      uh = p[b * 3 + 2] - ah;
    const vx = p[c * 3] - ax,
      vy = p[c * 3 + 1] - ay,
      vh = p[c * 3 + 2] - ah;
    const cross = [uy * vh - uh * vy, uh * vx - ux * vh, ux * vy - uy * vx];
    const area = Math.hypot(...cross) / 2;
    // Winding must agree with the stored normal (counterclockwise seen from outside).
    const dot = cross[0] * n[a * 3] + cross[1] * n[a * 3 + 1] + cross[2] * n[a * 3 + 2];
    if (dot < 0) result.badWinding = (result.badWinding ?? 0) + 1;
    const nh = n[a * 3 + 2];
    if (nh > 0.5) {
      result.up += area;
      result.upHeights.add(ah);
    } else if (nh < -0.5) {
      result.down += area;
      result.downHeights.add(ah);
    } else result.side += area;
  }
  return result;
};

// ---- coverage ------------------------------------------------------------------------------------

const living = fixtureRoom("Living", { x: 3000, y: 2000 }, { width: 6000, depth: 4000 }, 2600);
const kitchen = fixtureRoom("Kitchen", { x: 7700, y: 2000 }, { width: 3000, depth: 4000 }, 2600);
const adjacent = buildFloorSlab(floorOf([living, kitchen]));
check("two adjacent rooms (Full clash) give one slab part", adjacent?.region.polygons.length === 1);
{
  const bounds = adjacent === null ? null : regionBounds(adjacent.region);
  // Outside-aligned 200 mm walls: the slab reaches the walls' outer faces (wall support).
  check(
    "slab covers the wall support",
    bounds !== null &&
      near(bounds.minX, -200) &&
      near(bounds.maxX, 9200 + 200) &&
      near(bounds.minY, -200) &&
      near(bounds.maxY, 4200),
    bounds === null ? "no slab" : JSON.stringify(bounds),
  );
}
check("adjacent rooms: no exposed top", adjacent?.exposedTop.polygons.length === 0);

const store = fixtureRoom("Store", { x: 3000, y: -3000 }, { width: 2000, depth: 2000 }, 2600);
const disjoint = buildFloorSlab(floorOf([living, store]));
check("disjoint areas give two slab parts", disjoint?.region.polygons.length === 2);

// Phase 16.14: a stair with Cut floor below (in Living, at floor (1000, 2000)) cuts its own floor's slab.
const cutFloor = (objects) => {
  const floor = floorOf([{ ...living, objects }]);
  return { floor, cuts: floorCutsOf({ floors: [floor] }, floor.id) };
};
const below = cutFloor([
  fixtureStair({ centre: { x: -2000, y: 0 }, size: stairSize }, 2800, { below: true }),
]);
const down = buildFloorSlab(below.floor, below.cuts);
check("a stair with Cut floor below is a hole in its slab", down !== null && holeCount(down.region) === 1);
check(
  "the hole has the stair's footprint",
  down !== null &&
    near(regionArea(slabCoverage(floorOf([living]))) - regionArea(down.region), 1000 * 2800, 5),
);
const plain = cutFloor([fixtureStair({ centre: { x: -2000, y: 0 }, size: stairSize }, 2800)]);
const up = buildFloorSlab(plain.floor, plain.cuts);
check("a stair standing on the floor keeps the slab solid", up !== null && holeCount(up.region) === 0);
check("…with no exposed slab top", up !== null && regionArea(up.exposedTop) === 0);
const well = cutFloor([
  fixtureFloorOpening({ centre: { x: 1000, y: 0 }, size: { width: 1200, depth: 900 } }),
]);
const wellSlab = buildFloorSlab(well.floor, well.cuts);
check(
  "a floor opening is a hole in its slab",
  wellSlab !== null &&
    holeCount(wellSlab.region) === 1 &&
    near(regionArea(slabCoverage(well.floor)) - regionArea(wellSlab.region), 1200 * 900, 5),
);
check("a slab built without its house has no holes", holeCount(slabCoverage(below.floor)) === 0);

// ---- thickness and faces -------------------------------------------------------------------------

check("thickness 0 gives no slab", buildFloorSlab(floorOf([living], { slabThicknessMm: 0 })) === null);
check("no areas give no slab", buildFloorSlab(floorOf([])) === null);
{
  const slab = buildFloorSlab(floorOf([living], { slabThicknessMm: 350 }));
  const faces = slab === null ? null : faceAreas(slab.mesh);
  check("thickness is applied", slab?.thicknessMm === 350 && faces?.downHeights.has(-350) === true);
  check("no top face under room floors", faces !== null && faces.up === 0);
  check(
    "underside covers the coverage",
    slab !== null && faces !== null && near(faces.down, regionArea(slab.region), 1),
  );
  // Perimeter of 6400 x 4400 times 350 mm.
  check("side faces span the outline", faces !== null && near(faces.side, 2 * (6400 + 4400) * 350, 1));
  check("every triangle winds with its normal", faces !== null && faces.badWinding === undefined);
}
{
  const faces = down === null ? null : faceAreas(down.mesh);
  // Outline 2 (6400 + 4400) plus the hole 2 (1000 + 2800), times 200 mm.
  check("stair hole: the hole has side faces", faces !== null && near(faces.side, (21600 + 7600) * 200, 1));
}
check("default slab is 200 mm", floorSlabOf({}).thicknessMm === 200);
check(
  "default slab material is Concrete",
  floorSlabOf({}).material.pbrMetallicRoughness.roughnessFactor === 0.95,
);

// ---- placement -----------------------------------------------------------------------------------

{
  const house = createHouseDocument("h_slabcheck", "Slab check");
  const lower = floorOf([fixtureRoom("Room", { x: 0, y: 0 }, { width: 3000, depth: 3000 }, 2600)], {
    elevationMm: 0,
  });
  check(
    "suggested elevation: lower 0, walls 2600, slab 200 → 2800",
    suggestedElevationAboveMm(lower, house, 200) === 2800,
  );
  check(
    "suggested elevation uses the tallest wall",
    (() => {
      const mixed = floorOf(
        [
          fixtureRoom("Low", { x: 0, y: 0 }, { width: 3000, depth: 3000 }, 2400),
          fixtureRoom("High", { x: 5000, y: 0 }, { width: 3000, depth: 3000 }, 3100),
        ],
        { elevationMm: 500 },
      );
      return suggestedElevationAboveMm(mixed, house, 150) === 500 + 3100 + 150;
    })(),
  );
  check("a floor without walls uses the house's wall height", tallestWallMm(floorOf([]), house) === 2400);
  const placed = { positionMm: { x: 1200, y: -300 }, elevationMm: 2800 };
  const offset = floorToHouseOffset(placed);
  check(
    "floorToHouseOffset is the plan offset and elevation",
    offset.x === 1200 && offset.y === -300 && offset.h === 2800,
  );
  const point = floorPointToHouse(placed, { x: 10, y: 20, h: 30 });
  check("floorPointToHouse translates", point.x === 1210 && point.y === -280 && point.h === 2830);
  const absent = floorPlacementOf({});
  check("absent placement is 0 / 0 / 0", absent.xMm === 0 && absent.yMm === 0 && absent.elevationMm === 0);
  const order = floorsByElevation([
    { id: "b", elevationMm: 2800 },
    { id: "a" },
    { id: "c", elevationMm: -2500 },
    { id: "d", elevationMm: 2800 },
  ]).map((floor) => floor.id);
  check("floors order by elevation, ties by document order", order.join(",") === "c,a,b,d", order.join(","));
}

// ---- fixture ---------------------------------------------------------------------------------------

{
  const house = buildMultiStoreyHouse("h_multistorey");
  check("fixture validates", Value.Check(House, house));
  const [ground, first, attic] = house.floors;
  check("fixture: First at the suggested 2800 mm", first?.elevationMm === 2800);
  check("fixture: Attic at 2800 + 2500 + 150 mm", attic?.elevationMm === 5450);
  const groundSlab = ground === undefined ? null : buildFloorSlab(ground);
  check("fixture: Ground slab has two parts (house + Store)", groundSlab?.region.polygons.length === 2);
  const firstSlab = first === undefined ? null : buildFloorSlab(first, floorCutsOf(house, first.id));
  check(
    "fixture: First slab has the stair hole (cut by the Ground stair) and the light well",
    firstSlab !== null && holeCount(firstSlab.region) === 2,
  );
  const groundCut = ground === undefined ? null : buildFloorSlab(ground, floorCutsOf(house, ground.id));
  check(
    "fixture: Ground slab under the stair stays solid",
    groundCut !== null && holeCount(groundCut.region) === 0,
  );
  const added = addFloorCommand(house);
  const outcome = runCommand(house, added.command);
  const newFloor = outcome.ok
    ? outcome.document.floors.find((floor) => floor.id === added.floorId)
    : undefined;
  check(
    "Add floor goes above the top floor once: 5450 + 1200 + 200 mm",
    newFloor?.elevationMm === 5450 + 1200 + 200 && newFloor.slabThicknessMm === 200,
    String(newFloor?.elevationMm),
  );
  const single = createHouseDocument("h_singlefloor", "Single");
  const onlyFloor = single.floors[0];
  check(
    "a new house's floor sits at 0 with the default slab",
    onlyFloor?.elevationMm === 0 && onlyFloor.slabThicknessMm === 200,
  );
  check(
    "fixture: Attic slab is 150 mm",
    attic === undefined ? false : buildFloorSlab(attic)?.thicknessMm === 150,
  );
}

// ---- compatibility -------------------------------------------------------------------------------

{
  const house = buildMultiStoreyHouse("h_oldfloors");
  const newFields = new Set(["positionMm", "elevationMm", "slabThicknessMm", "slabMaterial"]);
  const old = {
    ...house,
    floors: house.floors.map((floor) =>
      Object.fromEntries(Object.entries(floor).filter(([key]) => !newFields.has(key))),
    ),
  };
  check("a document without the new fields validates", Value.Check(House, old));
  const migrated = migrateHouseDocument(JSON.parse(JSON.stringify(old)));
  const document = migrated.kind === "ok" ? migrated.document : null;
  check("…and still validates after reading", document !== null && Value.Check(House, document));
  const floors = document !== null && Array.isArray(document.floors) ? document.floors : [];
  check(
    "…and gets the defaults (0 / 0 / 0, 200 mm, Concrete)",
    floors.length === 3 &&
      floors.every(
        (floor) =>
          floor.positionMm.x === 0 &&
          floor.positionMm.y === 0 &&
          floor.elevationMm === 0 &&
          floor.slabThicknessMm === 200 &&
          floor.slabMaterial.pbrMetallicRoughness.roughnessFactor === 0.95,
      ),
  );
  const current = migrateHouseDocument(JSON.parse(JSON.stringify(house)));
  check(
    "present values are kept",
    current.kind === "ok" &&
      Array.isArray(current.document.floors) &&
      current.document.floors[1]?.elevationMm === 2800,
  );
  check(
    "a slab thickness over 1000 mm is rejected",
    !Value.Check(House, {
      ...house,
      floors: house.floors.map((floor) => ({ ...floor, slabThicknessMm: 1200 })),
    }),
  );
}

// ---- 16.1: the whole-house exterior (src/renderer/houseExterior.ts) on the fixture ----------------------------------
{
  const house = buildMultiStoreyHouse("h_exterior");
  // A window and a door on the ground floor's Living front wall (simplified openings: no template loads).
  const living = house.floors[0].areas.find((area) => area.name === "Living");
  const opening = (id, templateId, bottomMm, widthMm, heightMm, distanceAlongWallMm) => ({
    id,
    name: id,
    templateId,
    templateVersion: 1,
    parameters: { widthMm, heightMm },
    flip: { x: false, z: false },
    materialOverrides: {},
    placement: { distanceAlongWallMm, bottomMm },
  });
  living.walls[0].objects.push(opening("o_window", "window-casement", 900, 1200, 1200, 1500));
  living.walls[0].objects.push(opening("o_door", "door-interior", 0, 900, 2100, 4200));
  const made = [];
  const materials = {
    begin: () => undefined,
    get: () => {
      const material = new MeshStandardMaterial();
      made.push(material);
      return material;
    },
    sweep: () => undefined,
    setTexturesEnabled: () => undefined,
    dispose: () => undefined,
  };
  const exterior = createHouseExterior(materials, helperPalette("light"), 0x03a9f4);
  exterior.sync(house, openingSizeFromParameters);
  exterior.applyMaterials();
  const groups = exterior.root.children;
  check(
    "exterior: one group per floor at its placement (plan offset and elevation)",
    groups.length === 3 &&
      house.floors.every((floor, index) => {
        const offset = floorToHouseOffset(floor);
        const position = groups[index].position;
        return position.x === offset.x && position.y === offset.y && position.z === offset.h;
      }),
  );
  const attic = house.floors[2];
  const bounds = exterior.bounds();
  check(
    "exterior: the house's top is the attic's elevation + its walls",
    bounds !== null && near(bounds.maxHeightMm, floorPlacementOf(attic).elevationMm + 1200),
    JSON.stringify(bounds),
  );
  const points = exterior.framePoints();
  check(
    "exterior: frame points reach from the ground slab underside to the attic wall tops",
    near(Math.min(...points.map((point) => point.h)), -200) &&
      near(Math.max(...points.map((point) => point.h)), floorPlacementOf(attic).elevationMm + 1200),
  );
  let firstWall = null;
  groups[1].traverse((child) => {
    if (firstWall === null && child instanceof Mesh && child.material !== undefined) firstWall = child;
  });
  check(
    "exterior: a hit maps to its floor",
    firstWall !== null &&
      exterior.floorAt(firstWall) === house.floors[1].id &&
      exterior.floorAt(exterior.root) === null,
  );
  // The floor group holds the floor scene's root, then the simplified openings.
  const owned = groups[0].children[1].children.filter((child) => child instanceof Mesh);
  const glass = owned.filter((mesh) => mesh.material.transparent);
  check(
    "exterior: the window is a frame and glass (no shadow), the door a leaf; no template is loaded",
    glass.length === 1 && !glass[0].castShadow && owned.length === 1 + 4 + 1,
    `${String(owned.length)} opening parts`,
  );
  // Hover (16.13): the floor's bounding box, as wide screen-space lines over everything; one per floor, built hidden.
  const boxes = groups.map((group) => group.children.find((child) => child.name === "floorHoverBox"));
  exterior.setResolution(800, 600);
  exterior.setHighlight(house.floors[1].id);
  const shown = boxes.map((box) => box?.visible === true);
  const box = boxes[1];
  box?.geometry.computeBoundingBox();
  const extent = box?.geometry.boundingBox;
  const coverage = regionBounds(slabCoverage(house.floors[1]));
  check(
    "exterior: hover shows one floor's box (wide accent lines over everything, no tone mapping) and clears",
    shown.join() === "false,true,false" &&
      box?.isLineSegments2 === true &&
      box.material.linewidth >= 3 &&
      box.material.depthTest === false &&
      box.material.toneMapped === false &&
      box.material.resolution.x === 800 &&
      (exterior.setHighlight(null), boxes.every((candidate) => candidate?.visible === false)),
  );
  check(
    "exterior: the box spans the slab underside to the wall tops and the footprint's extents",
    extent !== null &&
      extent !== undefined &&
      near(extent.min.z, -floorSlabOf(house.floors[1]).thicknessMm) &&
      near(extent.max.z, tallestWallMm(house.floors[1], house)) &&
      extent.min.x <= coverage.minX &&
      extent.max.x >= coverage.maxX &&
      extent.min.y <= coverage.minY &&
      extent.max.y >= coverage.maxY,
    extent === null || extent === undefined ? "" : `${extent.min.z}..${extent.max.z}`,
  );
  // 18.1: floors are kept by ID; an unchanged floor keeps its group and its surfaces.
  exterior.sync(house, openingSizeFromParameters);
  let sameWall = null;
  groups[1].traverse((child) => {
    if (sameWall === null && child instanceof Mesh && child.material !== undefined) sameWall = child;
  });
  check(
    "exterior: syncing the same house again keeps every floor's group and surfaces (nothing rebuilt)",
    exterior.root.children.length === 3 &&
      house.floors.every((floor, index) => exterior.root.children[index] === groups[index]) &&
      sameWall === firstWall,
  );
  exterior.setLoadOrder([house.floors[2].id]);
  check(
    "exterior: the load order puts the likely floor first, then document order",
    exterior
      .contentFloors()
      .map((floor) => floor.id)
      .join() === [house.floors[2].id, house.floors[0].id, house.floors[1].id].join(),
  );
  const atticArea = house.floors[2].areas[0];
  let inAttic = false;
  for (let current = exterior.areaGroup(atticArea.id); current !== null; current = current.parent)
    if (current === groups[2]) inAttic = true;
  check("exterior: an area's group is found in its own floor (lights attach there)", inAttic);
  // 18.1 merging: a floor's opaque meshes become a few merged ones; their sources leave the view.
  const drawnMeshes = (group) => {
    const found = [];
    group.traverse((child) => {
      if (child instanceof Mesh && child.layers.isEnabled(0) && !child.material.transparent)
        found.push(child);
    });
    return found;
  };
  const before = drawnMeshes(groups[0]).length;
  while (exterior.rebatch());
  const stats = exterior.batchStats();
  const merged = drawnMeshes(groups[0]);
  check(
    "exterior: merging draws each floor with fewer meshes (sources on the batched layer)",
    stats.sources > 0 &&
      stats.batches < stats.sources &&
      merged.length < before &&
      // What still draws itself is merged, keeps its own picking (the shadow-only ceilings) or has several
      // materials (a wall layer's faces).
      merged.every(
        (mesh) =>
          mesh.name === "staticBatch:mesh" || Object.hasOwn(mesh, "raycast") || Array.isArray(mesh.material),
      ),
    `${String(before)} → ${String(merged.length)} meshes on the ground floor; ${String(stats.sources)} sources in ${String(stats.batches)} draws`,
  );
  check(
    "exterior: a merged mesh still maps to its floor",
    merged.some((mesh) => mesh.name === "staticBatch:mesh" && exterior.floorAt(mesh) === house.floors[0].id),
  );
  check("exterior: nothing left to merge", !exterior.rebatch());
  // A changed floor (its walls lower) rebuilds its surfaces: its batch goes at once, the others stay.
  const lowered = {
    ...house,
    floors: house.floors.map((floor, index) =>
      index === 0
        ? {
            ...floor,
            areas: floor.areas.map((area) => ({
              ...area,
              walls: area.walls.map((wall) => ({ ...wall, heightMm: wall.heightMm - 100 })),
            })),
          }
        : floor,
    ),
  };
  exterior.sync(lowered, openingSizeFromParameters);
  const after = exterior.batchStats();
  check(
    "exterior: a changed floor drops its batch at once; the unchanged floors keep theirs",
    after.sources > 0 &&
      after.sources < stats.sources &&
      drawnMeshes(groups[0]).every((mesh) => mesh.name !== "staticBatch:mesh"),
    `${String(after.sources)} of ${String(stats.sources)} sources still merged`,
  );
  check("exterior: the changed floor merges again", exterior.rebatch() && !exterior.rebatch());
  exterior.unbatch();
  check("exterior: unbatching gives every source back", exterior.batchStats().sources === 0);
  exterior.dispose();
  check(
    "exterior: disposal empties it",
    exterior.root.children.length === 0 && exterior.root.parent === null,
  );
}

console.log(failures === 0 ? "\nAll slab checks passed." : `\n${String(failures)} slab check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
