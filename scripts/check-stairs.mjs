// Stairs and floor openings (Phase 16.14, spec/builder/features/staircase-areas.md): the derived floor cuts
// (shared/geometry/floorCuts.ts) through RealFloor and the slab across placed floors, the rise suggestion, the
// template rules, the floor scene's rebuild when another floor's stair moves, and the v4 → v5 migration of staircase
// areas. No browser or WebGL. Run: npm run stairs:check
import { Value } from "typebox/value";
import { MeshStandardMaterial } from "three";
import { newAreableInstance } from "@shared/domain/commands/instanceCommands";
import { createFloor, createHouseDocument } from "@shared/domain/house/defaults";
import { migrateHouseDocument } from "@shared/domain/house/migrations";
import { stairRiseSuggestionMm } from "@shared/domain/house/stairs";
import { House } from "@shared/domain/schemas/house";
import { validateTemplateMetadata } from "@shared/domain/templates/metadata";
import { openingSizeFromParameters } from "@shared/domain/templates/openingSize";
import { floorCutsOf, floorCutters } from "@shared/geometry/floorCuts";
import { buildFloorSlab } from "@shared/geometry/floorSlab";
import { buildRealFloors } from "@shared/geometry/realFloor";
import { pointInRegion, regionArea } from "@shared/geometry/region";
import { createFloorScene } from "../src/renderer/floorScene.ts";
import { currentHouseEnvelope } from "../ha-viewer/houseSource.ts";
import { helperPalette } from "../src/renderer/helperPalette.ts";
import {
  buildMultiStoreyHouse,
  fixtureFloorOpening,
  fixtureRoom,
  fixtureStair,
  stairSize,
} from "./fixtures/multiStoreyHouse.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `  (${detail})`}`);
};
const near = (a, b, tolerance = 0.5) => Math.abs(a - b) <= tolerance;
const holeCount = (region) => region.polygons.reduce((sum, polygon) => sum + polygon.holes.length, 0);
const withObjects = (area, objects) => ({ ...area, objects: [...area.objects, ...objects] });

/** The union of a floor's RealFloors with its cuts. */
const floorRegions = (house, floor) => [...buildRealFloors(floor, floorCutsOf(house, floor.id)).values()];
const covered = (house, floor, point) =>
  floorRegions(house, floor).some((realFloor) => pointInRegion(point, realFloor.region));
const slabHoles = (house, floor) => {
  const slab = buildFloorSlab(floor, floorCutsOf(house, floor.id));
  return slab === null ? -1 : holeCount(slab.region);
};

/**
 * Two floors: Ground at 0 with a 6 × 4 m Room centred at (3000, 2000); Upper at `upperElevation`, placed at
 * (1000, 500), with a 6 × 4 m Hall centred at (2000, 1500), so the floors' rooms line up in the house frame.
 */
const twoFloors = (groundObjects, upperObjects = [], options = {}) => {
  const house = createHouseDocument("h_stairscheck", "Stairs check");
  const room = withObjects(
    fixtureRoom("Room", { x: 3000, y: 2000 }, { width: 6000, depth: 4000 }, 2600),
    groundObjects,
  );
  const hall = withObjects(
    fixtureRoom("Hall", { x: 2000, y: 1500 }, { width: 6000, depth: 4000 }, 2500),
    upperObjects,
  );
  const ground = { ...createFloor("Ground", 0), areas: [room] };
  const upper = {
    ...createFloor("Upper", options.upperElevation ?? 2800),
    positionMm: { x: 1000, y: 500 },
    areas: [hall],
  };
  const extra = (options.extraFloors ?? []).map((floor) => floor);
  return { ...house, floors: [ground, upper, ...extra] };
};

// The stair stands at Ground floor (1000, 2000) (Room-local (-2000, 0)); in Upper's frame that is (0, 1500).
const stairAt = (riseMm, switches) =>
  fixtureStair({ centre: { x: -2000, y: 0 }, size: stairSize }, riseMm, switches);

// ---- cut floor above, across placements ------------------------------------------------------------

{
  const house = twoFloors([stairAt(2800)]);
  const [ground, upper] = house.floors;
  check("the house validates", Value.Check(House, house));
  check(
    "Cut floor above: the floor above loses the stair's footprint (moved by both placements)",
    !covered(house, upper, { x: 0, y: 1500 }) && covered(house, upper, { x: 0, y: 3200 }),
  );
  const upperArea = floorRegions(house, upper).reduce(
    (sum, realFloor) => sum + regionArea(realFloor.region),
    0,
  );
  const uncut = [...buildRealFloors(upper).values()].reduce(
    (sum, realFloor) => sum + regionArea(realFloor.region),
    0,
  );
  check(
    "…by exactly the footprint (1 × 2.8 m)",
    near(uncut - upperArea, 1000 * 2800, 5),
    `${uncut - upperArea}`,
  );
  check("…and its slab gets the hole", slabHoles(house, upper) === 1);
  check(
    "the stair's own floor stays solid",
    covered(house, ground, { x: 1000, y: 2000 }) && slabHoles(house, ground) === 0,
  );
  check(
    "a floor built without its house has no cut",
    [...buildRealFloors(upper).values()].every((f) => holeCount(f.region) === 0),
  );
}

// ---- switches ------------------------------------------------------------------------------------

{
  const house = twoFloors([stairAt(2800, { above: false, below: true })]);
  const [ground, upper] = house.floors;
  check(
    "Cut floor below: the stair's own floor is cut, the floor above is not",
    !covered(house, ground, { x: 1000, y: 2000 }) &&
      slabHoles(house, ground) === 1 &&
      covered(house, upper, { x: 0, y: 1500 }),
  );
}
{
  const house = twoFloors([stairAt(2800, { above: false, below: false })]);
  const [ground, upper] = house.floors;
  check(
    "both switches off: no hole anywhere",
    floorCutsOf(house, ground.id).signature === "" &&
      floorCutsOf(house, upper.id).signature === "" &&
      slabHoles(house, ground) === 0 &&
      slabHoles(house, upper) === 0,
  );
}
{
  const hidden = { ...stairAt(2800), hidden: true };
  const house = twoFloors([hidden]);
  check("a saved-hidden stair cuts nothing", floorCutsOf(house, house.floors[1].id).signature === "");
}

// ---- floor openings ------------------------------------------------------------------------------

{
  const house = twoFloors(
    [],
    [
      fixtureFloorOpening({ centre: { x: 1000, y: 500 }, size: { width: 1200, depth: 900 } }),
      fixtureFloorOpening({ centre: { x: -1500, y: 0 }, size: { width: 1000, depth: 600 } }, true),
    ],
  );
  const [ground, upper] = house.floors;
  const cut = floorCutsOf(house, upper.id);
  const ellipse = (Math.PI * 1000 * 600) / 4;
  check(
    "floor openings cut their own floor: a rectangle and an ellipse",
    near(regionArea(cut.region), 1200 * 900 + ellipse, ellipse * 0.01),
    `${regionArea(cut.region).toFixed(0)} mm²`,
  );
  check("…and its slab (two holes)", slabHoles(house, upper) === 2);
  check("…but not the floor below", floorCutsOf(house, ground.id).signature === "");
  check("…and the opening is in the floor's frame", !covered(house, upper, { x: 3000, y: 2000 }));
}

// ---- tall and short stairs ---------------------------------------------------------------------------

{
  const top = {
    ...createFloor("Top", 5600),
    areas: [fixtureRoom("Loft", { x: 3000, y: 2000 }, { width: 6000, depth: 4000 }, 2400)],
  };
  const tall = twoFloors([stairAt(5600)], [], { extraFloors: [top] });
  const [, upper, loft] = tall.floors;
  check(
    "a tall stair cuts the floor it passes and the floor its top reaches",
    !covered(tall, upper, { x: 0, y: 1500 }) && !covered(tall, loft, { x: 1000, y: 2000 }),
  );
  const short = twoFloors([stairAt(2500)]);
  check(
    "a stair stopping below the slab's underside (2500 < 2800 − 200) cuts nothing",
    covered(short, short.floors[1], { x: 0, y: 1500 }),
  );
  const underside = twoFloors([stairAt(2600)]);
  check(
    "a stair reaching the slab's underside cuts it",
    !covered(underside, underside.floors[1], { x: 0, y: 1500 }),
  );
  const basement = {
    ...createFloor("Basement", -2800),
    areas: [
      withObjects(fixtureRoom("Cellar", { x: 3000, y: 2000 }, { width: 6000, depth: 4000 }, 2600), [
        stairAt(2800),
      ]),
    ],
  };
  const down = { ...twoFloors([]), floors: [basement, ...twoFloors([]).floors] };
  check(
    "a stair in the basement cuts the floor above it (a stair down)",
    !covered(down, down.floors[1], { x: 1000, y: 2000 }) && covered(down, down.floors[2], { x: 0, y: 1500 }),
  );
}

// ---- rise suggestion and tagging -------------------------------------------------------------------

{
  const house = twoFloors([]);
  const [ground, upper] = house.floors;
  check(
    "rise suggestion: the gap to the floor above",
    stairRiseSuggestionMm(house, ground.id, { minMm: 1000, maxMm: 6000 }, 2700) === 2800,
  );
  check(
    "rise suggestion: the default on the top floor",
    stairRiseSuggestionMm(house, upper.id, {}, 2700) === 2700,
  );
  check(
    "rise suggestion: within the template's limits",
    stairRiseSuggestionMm(house, ground.id, { maxMm: 2500 }, 2700) === 2500,
  );
  const stairMeta = {
    schemaVersion: 1,
    kind: "staircase",
    label: "Test stair",
    contract: "Staircasable",
    attachment: { hosts: ["floor"], contact: "bottom" },
    resize: {
      x: { mode: "scale", minMm: 600, maxMm: 2000, defaultMm: 1000 },
      y: { mode: "scale", parameter: "totalRiseMm", minMm: 1000, maxMm: 6000, defaultMm: 2700 },
      z: { mode: "scale", minMm: 1000, maxMm: 8000, defaultMm: 2800 },
    },
    flip: { x: false, z: false },
    opening: null,
    materialSlots: {},
  };
  const valid = validateTemplateMetadata(stairMeta).metadata;
  check("template rule: a Staircasable with widthMm / totalRiseMm / depthMm is valid", valid !== null);
  check(
    "template rule: a Staircasable without a run parameter is refused",
    validateTemplateMetadata({ ...stairMeta, resize: { ...stairMeta.resize, z: { mode: "fixed" } } })
      .metadata === null,
  );
  check(
    "template rule: floorCut on a Wallable is refused",
    validateTemplateMetadata({
      ...stairMeta,
      contract: "Wallable",
      attachment: { hosts: ["wall"], contact: "back" },
      opening: { shape: "bounds", clearanceMm: 0 },
      floorCut: { shape: "rectangle" },
    }).metadata === null,
  );
  const stair =
    valid === null
      ? null
      : newAreableInstance(
          { templateId: "t", version: 1, label: "Stair", metadata: valid },
          "Stair",
          { x: 0, y: 0 },
          undefined,
        );
  check(
    "a new stair is tagged: Cut floor above on, Cut floor below off",
    stair?.floorCut === "stair" &&
      stair.cutFloorAbove === true &&
      stair.cutFloorBelow === false &&
      stair.attachment.host === "floor",
  );
  const opening =
    valid === null
      ? null
      : newAreableInstance(
          {
            templateId: "t",
            version: 1,
            label: "Hole",
            metadata: { ...valid, contract: "Areable", kind: "floorOpening", floorCut: { shape: "ellipse" } },
          },
          "Hole",
          { x: 0, y: 0 },
          undefined,
        );
  check(
    "a new floor opening is tagged with its shape",
    opening?.floorCut === "opening" && opening.floorCutShape === "ellipse",
  );
}

// ---- the floor scene rebuilds when another floor's stair moves ---------------------------------------

{
  const materials = {
    begin: () => undefined,
    get: () => new MeshStandardMaterial(),
    sweep: () => undefined,
    setTexturesEnabled: () => undefined,
    dispose: () => undefined,
  };
  const house = twoFloors([stairAt(2800)]);
  const upper = house.floors[1];
  const scene = createFloorScene(materials, helperPalette("light"));
  const meshOf = (name) => {
    let found = null;
    scene.root.traverse((child) => {
      if (found === null && child.name === name) found = child;
    });
    return found;
  };
  const hallId = upper.areas[0].id;
  scene.sync(house, upper.id, openingSizeFromParameters);
  const before = meshOf(`floor:${hallId}`)?.geometry;
  const slabBefore = meshOf("slab:floor")?.geometry;
  // Move the stair on Ground by 1 m; Upper's document is the same object.
  const ground = house.floors[0];
  const moved = {
    ...house,
    floors: [
      {
        ...ground,
        areas: ground.areas.map((area) => ({
          ...area,
          objects: area.objects.map((object) => ({
            ...object,
            positionMm: { x: object.positionMm.x + 1000, y: 0 },
          })),
        })),
      },
      upper,
    ],
  };
  scene.sync(moved, upper.id, openingSizeFromParameters);
  const after = meshOf(`floor:${hallId}`)?.geometry;
  const slabAfter = meshOf("slab:floor")?.geometry;
  check(
    "moving a stair on the floor below rebuilds the floor above (its floor and slab)",
    before !== undefined && after !== undefined && before !== after && slabBefore !== slabAfter,
  );
  scene.sync(moved, upper.id, openingSizeFromParameters);
  check("…and an unchanged house keeps them", meshOf(`floor:${hallId}`)?.geometry === after);
  scene.dispose();
}

// ---- the fixture ------------------------------------------------------------------------------------

{
  const house = buildMultiStoreyHouse("h_multistorey");
  const [ground, first, attic] = house.floors;
  check("fixture: one stair and one floor opening", floorCutters(house).length === 2);
  check(
    "fixture: the Living stair cuts First above it, the light well cuts First, Ground and Attic stay whole",
    slabHoles(house, first) === 2 && slabHoles(house, ground) === 0 && slabHoles(house, attic) === 0,
  );
}

// ---- migration of staircase areas (house schema version 4 → 5) ---------------------------------------

{
  const fixture = buildMultiStoreyHouse("h_migration");
  /** An old staircase area: a rectangle footprint at floor (x, y), direction, and an instance. */
  const oldStairs = (id, centre, size, direction, riseMm) => ({
    id,
    name: "Staircase",
    kind: "staircase",
    positionMm: centre,
    rotationDeg: 0,
    floor: {
      id: `fs_${id.slice(2)}`,
      material: fixture.floors[0].areas[0].floor.material,
      shapes: [
        {
          id: `s_${id.slice(2)}`,
          type: "rectangle",
          positionMm: { x: 0, y: 0 },
          rotationDeg: 0,
          widthMm: size.width,
          heightMm: size.depth,
        },
      ],
      carpets: [],
    },
    walls: [],
    objects: [],
    lights: [],
    staircase: {
      id: `st_${id.slice(2)}`,
      templateId: "staircase-straight",
      templateVersion: 1,
      direction,
      positionMm: { x: 0, y: 0 },
      rotationDeg: 0,
      parameters: { widthMm: 900, totalRiseMm: riseMm, stepCount: 15 },
    },
  });
  const roomOf = (area) => {
    const { objects: _objects, ...rest } = area;
    return { ...rest, kind: "room", objects: [] };
  };
  const old = JSON.parse(
    JSON.stringify({
      ...fixture,
      schemaVersion: 4,
      floors: [
        {
          ...fixture.floors[0],
          areas: [
            ...fixture.floors[0].areas.map(roomOf),
            oldStairs("a_stairsup01", { x: 1000, y: 2000 }, stairSize, "up", 2800),
          ],
        },
        {
          ...fixture.floors[1],
          areas: [
            ...fixture.floors[1].areas.map(roomOf),
            oldStairs("a_stairsdn01", { x: 1000, y: 2000 }, stairSize, "down", 2700),
            // A Down opening with no stair below it: it must stay a hole.
            oldStairs("a_lonely0001", { x: 6500, y: 1250 }, { width: 800, depth: 1200 }, "down", 2700),
          ],
        },
        { ...fixture.floors[2], areas: fixture.floors[2].areas.map(roomOf) },
      ],
    }),
  );
  const result = migrateHouseDocument(old);
  const house = result.kind === "ok" ? result.document : null;
  check(
    "migration: the old document migrates and validates",
    house !== null && Value.Check(House, house),
    result.kind,
  );
  if (house !== null) {
    const [ground, first] = house.floors;
    const areas = house.floors.flatMap((floor) => floor.areas);
    check(
      "migration: no area keeps kind or staircase",
      areas.every((area) => !("kind" in area) && !("staircase" in area)),
    );
    check(
      "migration: staircase areas are removed",
      areas.every((area) => area.name !== "Staircase"),
    );
    const living = ground.areas.find((area) => area.name === "Living");
    const stair = living?.objects.find((object) => object.floorCut === "stair");
    check(
      "migration: the Up staircase is a stair in Living (ID, rise kept; footprint from the opening)",
      stair !== undefined &&
        stair.id === "st_stairsup01" &&
        stair.parameters.totalRiseMm === 2800 &&
        stair.parameters.widthMm === 1000 &&
        stair.parameters.depthMm === 2800 &&
        near(stair.positionMm.x, -2000) &&
        near(stair.positionMm.y, 0) &&
        stair.cutFloorAbove === true,
      JSON.stringify(stair?.positionMm),
    );
    const firstObjects = first.areas.flatMap((area) => area.objects);
    const openings = firstObjects.filter((object) => object.floorCut === "opening");
    check(
      "migration: the matching Down opening is dropped (the stair below cuts it); the lone one becomes a floor opening",
      openings.length === 1 &&
        openings[0].parameters.widthMm === 800 &&
        openings[0].parameters.depthMm === 1200,
      `${openings.length} opening(s)`,
    );
    check(
      "migration: no hole is lost (First is cut at both places)",
      !covered(house, first, { x: 1000, y: 2000 }) && !covered(house, first, { x: 6500, y: 1250 }),
    );
    check("migration: Ground stays whole under the stair", covered(house, ground, { x: 1000, y: 2000 }));
    // The HA viewer path (Phase 16.14): a stored v4 copy is migrated by the viewer's loader, then rendered.
    const viewed = currentHouseEnvelope({
      revision: old.revision,
      document: JSON.parse(JSON.stringify(old)),
    });
    const viewedFirst = viewed.document.floors[1];
    const viewerScene = createFloorScene(
      {
        begin: () => undefined,
        get: () => new MeshStandardMaterial(),
        sweep: () => undefined,
        setTexturesEnabled: () => undefined,
        dispose: () => undefined,
      },
      helperPalette("light"),
    );
    viewerScene.sync(viewed.document, viewedFirst.id, openingSizeFromParameters);
    let viewerSlab = null;
    viewerScene.root.traverse((child) => {
      if (child.name === "slab:floor") viewerSlab = child;
    });
    check(
      "HA viewer path: a stored v4 copy loads (migrated to the current version) and its First floor renders with both holes",
      viewed.document.schemaVersion === 6 &&
        viewerSlab !== null &&
        slabHoles(viewed.document, viewedFirst) === 2,
    );
    viewerScene.dispose();
    const again = migrateHouseDocument(JSON.parse(JSON.stringify(old)));
    check(
      "migration: deterministic (same IDs on every load)",
      again.kind === "ok" && JSON.stringify(again.document) === JSON.stringify(house),
    );
  }
}

console.log(failures === 0 ? "\nAll stair checks passed." : `\n${String(failures)} stair check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
