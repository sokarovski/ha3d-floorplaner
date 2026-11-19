// "Demo: Family house" (scripts/fixtures/demoHouses/build.ts): a two-storey family house near Munich, 87 m² per floor.
// Ground floor (2700 mm walls): living room, open kitchen with island and dining, study, entrance hall with a
// straight staircase along its north wall (Phase 16.14 stair object, Cut floor above on), guest WC and utility,
// a paved terrace and a walled lawn. First floor at the suggested elevation (2600 mm walls): an L-shaped main
// bedroom with a dressing nook, a second L-shaped bedroom with a study nook, a child's room, the bathroom and a
// landing around the stair opening, which the stair cuts out of the first floor automatically. Both floors sit at
// the same plan position with default slabs. On top, an Attic (familyAttic.ts): a copy of the First floor under a
// roof with an east gable and a west hip that cuts and raises its walls (Phase 19.2).
import { createFloor, createHouseDocument } from "../../../shared/domain/house/defaults";
import { suggestedElevationAboveMm } from "../../../shared/domain/house/floorPlacement";
import { stairRiseSuggestionMm } from "../../../shared/domain/house/stairs";
import { createId } from "../../../shared/domain/ids";
import type { HouseDocument } from "../../../shared/domain/schemas/house";
import type { AreableInstanceValue } from "../../../shared/domain/schemas/instances";
import type { RoofValue } from "../../../shared/domain/schemas/roof";
import { builtInPresets } from "../../../shared/domain/house/defaults";
import { roofDefaults } from "../../../shared/domain/house/roofs";
import { familyAttic } from "./familyAttic";
import type { BuildContext, Room } from "./kit";
import {
  E,
  FloorPlan,
  N,
  S,
  W,
  builtin,
  galleryFrames,
  paint,
  palette,
  tallMirror,
  textured,
  threePictures,
  twoPrints,
  vanityMirror,
} from "./kit";

export const familyHouseName = "Demo: Family house";

/** The stair: 900 mm wide, a 3600 mm run along the hall's north wall, climbing west (front −x, heading 270°). */
const stair = { centre: { x: 6100, y: 8150 }, widthMm: 900, runMm: 3600, rotationDeg: 270, steps: 16 };

export const buildFamilyHouse = (
  id: string,
  context: BuildContext,
): { house: HouseDocument; plans: FloorPlan[] } => {
  const facade = paint([0.86, 0.78, 0.64], 0.95);
  const ground = new FloorPlan(context, { heightMm: 2700, extThicknessMm: 300, intThicknessMm: 100, facade });
  const first = new FloorPlan(context, { heightMm: 2600, extThicknessMm: 300, intThicknessMm: 100, facade });
  const frame = { frame: { preset: "White" } };
  const frosted = { glass: { preset: "Frosted glass" }, frame: { preset: "White" } };
  const whiteLeaf = { leaf: { preset: "White" } };
  const door = (width: number): Readonly<Record<string, number>> => ({ widthMm: width, heightMm: 2050 });
  const round = { templateId: "ceiling-light-round", version: 1 };
  const square = { templateId: "ceiling-light-square", version: 1 };

  // ================================ Ground floor ================================================

  const living = ground
    .rect("Living room", 0, 0, 5600, 4600, ["ext", "int", "int", "ext"], paint(palette.greige))
    .floorMaterial(textured("oak"));
  living
    .window(S, 2600, "sliding-door-double", { widthMm: 2400, heightMm: 2300 }, 0, {
      name: "Terrace door",
      overrides: frame,
    })
    .window(S, 4800, "window-casement", { widthMm: 1000, heightMm: 1450 }, 800, {
      name: "South window",
      overrides: frame,
    })
    .window(
      W,
      3700,
      "window-casement",
      { widthMm: 1400, heightMm: 1450, wings: "two", secondWingMm: 500 },
      800,
      {
        name: "West window",
        overrides: frame,
      },
    )
    .door(
      E,
      3500,
      "door-glazed",
      { widthMm: 1200, heightMm: 2100, blind: false },
      { name: "Kitchen door", overrides: { frame: { preset: "White" } } },
    )
    .place("sofa", { x: 3300, y: 1900 }, 90, { name: "Sofa", parameters: { widthMm: 2100 } })
    .place("coffee-table", { x: 2050, y: 1900 }, 90, {
      name: "Coffee table",
      overrides: { wood: { preset: "Oak" } },
    })
    .place("sofa", { x: 1900, y: 3600 }, 0, { name: "Armchair", parameters: { widthMm: 900 } })
    .place("ottoman", { x: 2900, y: 3500 }, 0, { name: "Ottoman" })
    .onWall(W, 1900, "wall-tv", 1050, { name: "TV", parameters: { widthMm: 1400, heightMm: 800 } })
    .against(W, 1900, "drawer-shelf", { name: "TV sideboard", parameters: { widthMm: 1800, drawers: 4 } })
    .against(E, 1300, "bookcase-open", {
      name: "Bookcase",
      parameters: { widthMm: 1000, heightMm: 1800, shelves: 4 },
    })
    .place("plant-monstera", { x: 400, y: 4200 }, 0, { name: "Monstera" })
    .place("plant-snake", { x: 5450, y: 4450 }, 0, { name: "Snake plant" })
    .frames(N, 2000, galleryFrames, 1650, "Gallery frame", 100)
    .rug("Living rug", { x: 2200, y: 1900 }, 2000, 2600, paint([0.33, 0.37, 0.45], 1))
    .light(
      "Living pendant",
      { x: 2100, y: 1900 },
      { fixture: { templateId: "pendant-shade", version: 1 }, lumens: 1800 },
    )
    .light("Living ceiling", { x: 4500, y: 2300 }, { fixture: round, lumens: 1200 })
    .light(
      "Reading lamp",
      { x: 4100, y: 3000 },
      {
        fixture: { templateId: "floor-lamp", version: 1 },
        // A floor-standing fixture's foot sits at the light's elevation; the bulb is the template's light node.
        elevationMm: 0,
        lumens: 900,
        modes: ["colorTemperature"],
      },
    )
    .light(
      "Bookcase strip",
      { x: 5590, y: 1300 },
      {
        elevationMm: 2050,
        lumens: 600,
        modes: ["colorTemperature", "rgb"],
        linear: { lengthMm: 1000, rotationDeg: 90 },
      },
    );

  const kitchen = ground
    .rect("Kitchen and dining", 5700, 0, 10400, 4600, ["ext", "ext", "int", "int"], paint(palette.warmWhite))
    .floorMaterial(textured("tileGrey"));
  const fronts = { fronts: { preset: "Anthracite" } };
  kitchen
    .window(S, 7000, "window-casement", { widthMm: 1600, heightMm: 1450, wings: "two" }, 800, {
      name: "Dining window",
      overrides: frame,
    })
    .window(S, 9000, "balcony-door-double", { widthMm: 1600, heightMm: 2230 }, 0, {
      name: "Garden door",
      overrides: frame,
    })
    .window(E, 1500, "window-casement", { widthMm: 1200, heightMm: 1450 }, 800, {
      name: "East window",
      overrides: frame,
    });
  kitchen.run(N, 10400, [
    { ref: "fridge-freezer-column", name: "Fridge freezer" },
    { ref: "kitchen-oven-hob", name: "Oven and hob" },
    { ref: "kitchen-drawer-unit", name: "Drawers", parameters: { widthMm: 600 }, overrides: fronts },
    { ref: "kitchen-sink-base", name: "Sink", overrides: fronts },
  ]);
  const bar = "bar";
  kitchen
    .onWall(N, 8550, "kitchen-upper-cabinet", 1500, {
      name: "Upper cabinet",
      parameters: { widthMm: 1100 },
      overrides: fronts,
    })
    .onWall(N, 9400, "kitchen-extractor-strip", 1460, { name: "Extractor" })
    .onWall(N, 8850, "tile-backsplash", 900, {
      name: "Backsplash",
      parameters: { widthMm: 1700, heightMm: 600 },
    })
    .place("bar-table", { x: 9000, y: 2800 }, 0, {
      name: "Kitchen island",
      overrides: { wood: { preset: "Oak" } },
      cluster: bar,
    })
    .place("stool-three-leg", { x: 8500, y: 2150 }, 180, { name: "Stool 1", cluster: bar })
    .place("stool-three-leg", { x: 9000, y: 2150 }, 180, { name: "Stool 2", cluster: bar })
    .place("stool-three-leg", { x: 9500, y: 2150 }, 180, { name: "Stool 3", cluster: bar });
  const chair = "dining-chair";
  kitchen
    .place("table-dining", { x: 7000, y: 1600 }, 0, { name: "Dining table", cluster: "dining" })
    .place(chair, { x: 7000, y: 2426 }, 0, { name: "Dining chair 1", cluster: "dining" })
    .place(chair, { x: 7000, y: 774 }, 180, { name: "Dining chair 2", cluster: "dining" })
    .place(chair, { x: 6174, y: 1600 }, 90, { name: "Dining chair 3", cluster: "dining" })
    .place(chair, { x: 7826, y: 1600 }, 270, { name: "Dining chair 4", cluster: "dining" })
    .place("plant-monstera", { x: 6020, y: 300 }, 0, { name: "Monstera" })
    .light("Dining pendant", { x: 7000, y: 1600 }, { fixture: builtin("pendant-cone"), lumens: 1200 })
    .light(
      "Island pendant 1",
      { x: 8600, y: 2800 },
      { fixture: { templateId: "pendant-cone", version: 1 }, lumens: 900 },
    )
    .light(
      "Island pendant 2",
      { x: 9400, y: 2800 },
      { fixture: { templateId: "pendant-cone", version: 1 }, lumens: 900 },
    )
    .light("Kitchen ceiling", { x: 9000, y: 3900 }, { fixture: round, lumens: 1400, kelvin: 3500 })
    .light(
      "Under-cabinet strip",
      { x: 8550, y: 4450 },
      {
        fixture: { templateId: "linear-strip", version: 1 },
        elevationMm: 1490,
        lumens: 700,
        kelvin: 3000,
        modes: ["colorTemperature", "rgb"],
        linear: { lengthMm: 1100, rotationDeg: 0 },
      },
    );

  const study = ground
    .rect("Study", 0, 4700, 3200, 8600, ["int", "int", "ext", "ext"], paint(palette.forest))
    .floorMaterial(textured("walnut"));
  study
    .window(
      N,
      1600,
      "window-casement",
      { widthMm: 1400, heightMm: 1450, wings: "two", secondWingMm: 500 },
      900,
      { name: "North window", overrides: frame },
    )
    .window(W, 7600, "window-casement", { widthMm: 1000, heightMm: 1450 }, 800, {
      name: "West window",
      overrides: frame,
    })
    .against(N, 1600, "desk", {
      name: "Desk",
      parameters: { widthMm: 1600, legStyle: "t-foot" },
      overrides: { top: { preset: "Walnut" } },
    })
    .place("office-chair-mesh", { x: 1600, y: 7750 }, 180, { name: "Desk chair" })
    .against(W, 6000, "bookcase-open", {
      name: "Bookshelf",
      parameters: { widthMm: 1400, heightMm: 2000, shelves: 5 },
    })
    .against(S, 1500, "sofa", { name: "Guest sofa", parameters: { widthMm: 1600 } })
    .onWall(S, 1500, "picture-frame", 1250, {
      name: "Picture over the sofa",
      parameters: { widthMm: 1000, heightMm: 700 },
    })
    .rug("Study rug", { x: 1700, y: 6500 }, 1800, 1600, paint([0.74, 0.62, 0.44], 1))
    .light("Study ceiling", { x: 1600, y: 6650 }, { fixture: square, lumens: 1300, kelvin: 3500 })
    .light("Desk lamp", { x: 2200, y: 8350 }, { elevationMm: 1150, lumens: 350, kelvin: 3500 });

  const hall = ground
    .rect("Entrance hall", 3300, 4700, 8100, 8600, ["int", "int", "ext", "int"], paint(palette.chalk))
    .floorMaterial(textured("slate"));
  hall
    .door(
      N,
      3800,
      "door-entrance",
      { widthMm: 900, heightMm: 2100 },
      { name: "Front door", overrides: { leaf: { preset: "Anthracite" } } },
    )
    .door(
      S,
      4500,
      "door-glazed",
      { widthMm: 900, heightMm: 2100, blind: false },
      { name: "Living door", overrides: { frame: { preset: "White" } } },
    )
    .door(
      S,
      7300,
      "door-glazed",
      { widthMm: 900, heightMm: 2100, blind: false },
      { name: "Kitchen door", overrides: { frame: { preset: "White" } } },
    )
    .door(W, 6400, "interior-door", door(800), { name: "Study door", overrides: whiteLeaf })
    .door(E, 5300, "interior-door", door(750), { name: "WC door", overrides: whiteLeaf })
    .door(E, 7250, "interior-door", door(800), { name: "Utility door", overrides: whiteLeaf })
    .against(W, 5350, "shoe-cabinet", { name: "Shoe cabinet", parameters: { widthMm: 1200, sections: 2 } })
    .frame(W, 7300, tallMirror, 350, "Hall mirror")
    .against(E, 6300, "tall-cabinet-doors", { name: "Coat cupboard", parameters: { widthMm: 600 } })
    .place("plant-leafy", { x: 5000, y: 7400 }, 0, { name: "Plant" })
    .rug("Hall rug", { x: 5700, y: 6100 }, 2400, 1200, paint([0.5, 0.26, 0.2], 1))
    .light("Hall ceiling", { x: 5000, y: 6000 }, { fixture: builtin("ceiling-light-round"), lumens: 1000 })
    .light("Hall ceiling 2", { x: 7000, y: 6400 }, { fixture: builtin("ceiling-light-round"), lumens: 900 });
  addStair(hall, stair.centre);

  const wc = ground
    .rect("Guest WC", 8200, 4700, 10400, 6700, ["int", "ext", "int", "int"], paint(palette.blush, 0.6))
    .floorMaterial(textured("tileWhite"));
  wc.window(E, 5700, "window-casement", { widthMm: 500, heightMm: 700 }, 1400, {
    name: "WC window",
    overrides: frosted,
  })
    .against(N, 9600, "toilet-high-cistern", { name: "Toilet" })
    .against(S, 9600, "basin-pedestal", { name: "Basin", parameters: { widthMm: 500 } })
    .onWall(S, 9600, "frame", 1150, {
      name: "Mirror",
      parameters: { widthMm: 500, heightMm: 700, surface: "Mirror", lightBar: true },
    })
    .light(
      "WC ceiling",
      { x: 9300, y: 5700 },
      { fixture: builtin("ceiling-light-round"), lumens: 700, kelvin: 3000 },
    );

  const utility = ground
    .rect("Utility", 8200, 6800, 10400, 8600, ["int", "ext", "ext", "int"], paint(palette.mist))
    .floorMaterial(textured("tileGrey"));
  utility
    .door(E, 7250, "door-glazed", { widthMm: 800, heightMm: 2100 }, { name: "Side door" })
    .against(N, 9400, "washing-machine", { name: "Washing machine" })
    .against(N, 10000, "tumble-dryer", { name: "Tumble dryer" })
    .onWall(S, 9200, "heating-boiler-wall", 1100, { name: "Boiler" })
    .against(N, 8650, "tall-cabinet-open-shelves", { name: "Shelves" })
    .light("Utility ceiling", { x: 9300, y: 7700 }, { fixture: square, lumens: 1000, kelvin: 4000 });

  const terrace = ground
    .rect("Terrace", 0, -3300, 8200, -300, ["none", "none", "none", "none"], facade)
    .floorMaterial(textured("paving"));
  terrace
    .place("table-dining", { x: 1700, y: -2000 }, 0, {
      name: "Garden table",
      parameters: { widthMm: 1600, depthMm: 900 },
      cluster: "terrace",
    })
    .place("dining-chair", { x: 1300, y: -1424 }, 0, { name: "Garden chair 1", cluster: "terrace" })
    .place("dining-chair", { x: 2100, y: -1424 }, 0, { name: "Garden chair 2", cluster: "terrace" })
    .place("dining-chair", { x: 1300, y: -2576 }, 180, { name: "Garden chair 3", cluster: "terrace" })
    .place("dining-chair", { x: 2100, y: -2576 }, 180, { name: "Garden chair 4", cluster: "terrace" })
    .place("sofa", { x: 5600, y: -2600 }, 180, {
      name: "Garden sofa",
      overrides: { upholstery: { preset: "Light grey" }, cushions: { preset: "Navy cushion" } },
    })
    .place("coffee-table", { x: 5600, y: -1500 }, 0, { name: "Garden coffee table" })
    .place("plant-areca-palm", { x: 7700, y: -800 }, 0, { name: "Palm pot" })
    .light("Terrace light", { x: 3900, y: -400 }, { elevationMm: 2400, lumens: 500, kelvin: 2700 });

  const garden = ground
    .room(
      "Garden",
      [
        { x: -2000, y: -8000 },
        { x: 12400, y: -8000 },
        { x: 12400, y: -300 },
        { x: 8200, y: -300 },
        { x: 8200, y: -3300 },
        { x: 0, y: -3300 },
        { x: 0, y: -300 },
        { x: -2000, y: -300 },
      ],
      ["hedge", "hedge", "none", "none", "none", "none", "none", "hedge"],
      paint(palette.stone),
    )
    .floorMaterial(textured("grass"));
  garden
    .place("plant-areca-palm", { x: -1100, y: -1500 }, 0, { name: "Palm 1", parameters: { heightMm: 2400 } })
    .place("plant-areca-palm", { x: 11500, y: -1500 }, 60, { name: "Palm 2", parameters: { heightMm: 2400 } })
    .place("plant-areca-palm", { x: 6000, y: -7200 }, 20, { name: "Palm 3", parameters: { heightMm: 2200 } })
    .place("plant-monstera", { x: 10500, y: -6800 }, 0, { name: "Shrub 1", parameters: { heightMm: 1200 } })
    .place("plant-monstera", { x: -1100, y: -7000 }, 90, { name: "Shrub 2", parameters: { heightMm: 1100 } })
    .rug("Stepping path", { x: 9000, y: -4500 }, 1000, 6200, textured("paving"));

  // ================================ First floor =================================================

  const bedroom1 = first
    .room(
      "Main bedroom",
      [
        { x: 0, y: 0 },
        { x: 4800, y: 0 },
        { x: 4800, y: 6500 },
        { x: 3300, y: 6500 },
        { x: 3300, y: 4500 },
        { x: 0, y: 4500 },
      ],
      ["ext", "int", "int", "int", "int", "ext"],
      paint(palette.sage),
    )
    .floorMaterial(textured("oak"));
  bedroom1
    .door(1, 4000, "interior-door", door(800), { name: "Main bedroom door", overrides: whiteLeaf })
    .window(0, 2400, "window-casement", { widthMm: 1800, heightMm: 1450, wings: "two" }, 800, {
      name: "South window",
      overrides: frame,
    })
    .against(5, 2000, "bed-double", { name: "Bed" })
    .against(5, 755, "bedside-table-hokksund", { name: "Bedside table 1" })
    .against(5, 3245, "bedside-table-hokksund", { name: "Bedside table 2" })
    .frames(5, 2000, threePictures, 1400, "Picture over the bed")
    .onWall(1, 2000, "wall-tv", 1100, { name: "TV", parameters: { widthMm: 1100, heightMm: 650 } })
    .against(1, 2000, "sideboard-cabinet", {
      name: "Dresser",
      parameters: { widthMm: 1200 },
      overrides: { fronts: { preset: "Oak" } },
    })
    .against(3, 5000, "wardrobe-two-door", { name: "Wardrobe 1", parameters: { widthMm: 1000 } })
    .against(3, 6000, "wardrobe-two-door", { name: "Wardrobe 2", parameters: { widthMm: 1000 } })
    .frame(2, 4300, tallMirror, 350, "Dressing mirror")
    .place("plant-areca-palm", { x: 4300, y: 600 }, 0, { name: "Areca palm" })
    .rug("Main bedroom rug", { x: 1700, y: 2000 }, 2400, 2800, paint([0.86, 0.8, 0.72], 1))
    .light(
      "Main bedroom pendant",
      { x: 2200, y: 2000 },
      { fixture: { templateId: "pendant-shade", version: 1 }, elevationMm: 2600, lumens: 1400 },
    )
    .light(
      "Dressing light",
      { x: 4050, y: 5500 },
      { fixture: builtin("ceiling-light-round"), elevationMm: 2600, lumens: 700 },
    )
    .light(
      "Headboard glow",
      { x: 15, y: 2000 },
      {
        elevationMm: 1000,
        lumens: 500,
        kelvin: 2400,
        modes: ["colorTemperature", "rgb"],
        linear: { lengthMm: 1800, rotationDeg: 90, facingDeg: 180 },
      },
    );

  const bedroom3 = first
    .rect("Child's room", 0, 4600, 3200, 8600, ["int", "int", "ext", "ext"], paint(palette.butter))
    .floorMaterial(textured("ash"));
  bedroom3
    .door(E, 7100, "interior-door", door(800), { name: "Child's room door", overrides: whiteLeaf })
    .window(N, 2400, "window-casement", { widthMm: 1200, heightMm: 1450 }, 900, {
      name: "North window",
      overrides: frame,
    })
    .window(W, 7700, "window-casement", { widthMm: 1000, heightMm: 1450 }, 800, {
      name: "West window",
      overrides: frame,
    })
    .against(W, 5800, "bed-slat-single", { name: "Bed", parameters: { widthMm: 850, depthMm: 2100 } })
    .against(N, 2400, "desk", {
      name: "Desk",
      parameters: { widthMm: 1250, depthMm: 520, legStyle: "panel", backRail: true },
      overrides: { top: { preset: "Oak" }, legs: { preset: "Oak" } },
    })
    .place("swivel-chair", { x: 2300, y: 7750 }, 180, { name: "Desk chair" })
    .against(S, 2600, "wardrobe-two-door", { name: "Wardrobe", parameters: { depthMm: 450 } })
    .against(S, 1500, "bookcase-open", { name: "Bookcase", parameters: { widthMm: 1300 } })
    .onWall(E, 5800, "wall-tv", 1100, {
      name: "TV",
      parameters: { widthMm: 560, heightMm: 340, bezelMm: 12 },
    })
    .frames(W, 5800, twoPrints, 1400, "Print over the bed")
    .rug("Play rug", { x: 1700, y: 6700 }, 1600, 1400, paint([0.9, 0.62, 0.5], 1))
    .light(
      "Child's room pendant",
      { x: 1600, y: 6600 },
      { fixture: builtin("pendant-shade"), elevationMm: 2600, lumens: 1200 },
    );

  const bedroom2 = first
    .room(
      "Bedroom 2",
      [
        { x: 6500, y: 0 },
        { x: 10400, y: 0 },
        { x: 10400, y: 4600 },
        { x: 8100, y: 4600 },
        { x: 8100, y: 6500 },
        { x: 6500, y: 6500 },
      ],
      ["ext", "ext", "int", "int", "int", "int"],
      paint(palette.dustyBlue),
    )
    .floorMaterial(textured("ash"));
  bedroom2
    .door(5, 3000, "interior-door", door(800), { name: "Bedroom 2 door", overrides: whiteLeaf })
    .window(0, 8450, "window-casement", { widthMm: 1600, heightMm: 1450, wings: "two" }, 800, {
      name: "South window",
      overrides: frame,
    })
    .window(1, 3800, "window-casement", { widthMm: 1000, heightMm: 1450 }, 800, {
      name: "East window",
      overrides: frame,
    })
    .against(1, 1800, "bed-slat-double", { name: "Bed", overrides: { blanket: { preset: "Navy" } } })
    .against(1, 590, "bedside-table-hokksund", { name: "Bedside table 1" })
    .against(1, 3010, "bedside-table-hokksund", { name: "Bedside table 2" })
    .against(5, 5000, "wardrobe-three-section", { name: "Wardrobe 1" })
    .against(5, 6000, "wardrobe-three-section", { name: "Wardrobe 2" })
    .against(4, 7550, "desk", { name: "Desk", parameters: { widthMm: 1000 } })
    .place("office-chair-mesh", { x: 7550, y: 5650 }, 180, { name: "Desk chair" })
    .place("plant-leafy", { x: 6800, y: 400 }, 0, { name: "Plant" })
    .rug("Bedroom 2 rug", { x: 8700, y: 1800 }, 2200, 2600, paint([0.8, 0.8, 0.78], 1))
    .light("Bedroom 2 ceiling", { x: 8400, y: 2000 }, { fixture: round, elevationMm: 2600, lumens: 1400 })
    .light("Desk lamp", { x: 7900, y: 6350 }, { elevationMm: 1100, lumens: 350, kelvin: 3500 });

  const bathroom = first
    .rect("Bathroom", 8200, 4700, 10400, 8600, ["int", "ext", "ext", "int"], paint(palette.mist, 0.6))
    .floorMaterial(textured("tileWhite"));
  bathroom
    .door(W, 7100, "interior-door", door(750), { name: "Bathroom door", overrides: whiteLeaf })
    .window(E, 6600, "window-casement", { widthMm: 700, heightMm: 900 }, 1300, {
      name: "Bathroom window",
      overrides: frosted,
    })
    .place("bathtub", { x: 10050, y: 5600 }, 0, { name: "Bathtub" })
    .onWall(N, 9800, "shower-rail", 700, { name: "Shower" })
    .rug("Shower tray", { x: 9950, y: 8150 }, 900, 900, textured("slate"))
    .place("shower-curtain", { x: 9484, y: 8150 }, 90, {
      name: "Shower curtain",
      parameters: { widthMm: 900 },
    })
    .against(W, 8000, "toilet-high-cistern", { name: "Toilet" })
    .against(W, 5400, "basin-pedestal", { name: "Basin" })
    .frame(W, 5400, vanityMirror, 1100, "Mirror and light")
    .against(S, 8600, "tall-cabinet-doors", { name: "Tall cabinet" })
    .onWall(W, 6400, "radiator-ribbed", 150, {
      name: "Towel radiator",
      parameters: { widthMm: 500, heightMm: 1200 },
    })
    .light(
      "Bathroom ceiling",
      { x: 9300, y: 6650 },
      { fixture: round, elevationMm: 2600, lumens: 1300, kelvin: 3500 },
    )
    .light("Mirror light", { x: 8350, y: 5400 }, { elevationMm: 1950, lumens: 400, kelvin: 3500 });

  const landing = first
    .room(
      "Landing",
      [
        { x: 4900, y: 0 },
        { x: 6400, y: 0 },
        { x: 6400, y: 6600 },
        { x: 8100, y: 6600 },
        { x: 8100, y: 8600 },
        { x: 3300, y: 8600 },
        { x: 3300, y: 6600 },
        { x: 4900, y: 6600 },
      ],
      ["ext", "int", "int", "int", "ext", "int", "int", "int"],
      paint(palette.chalk),
    )
    .floorMaterial(textured("oak"));
  landing
    .window(0, 5650, "window-casement", { widthMm: 1000, heightMm: 1450 }, 800, {
      name: "Landing window",
      overrides: frame,
    })
    .window(4, 6100, "window-casement", { widthMm: 1200, heightMm: 1200 }, 1000, {
      name: "Stair window",
      overrides: frame,
    })
    .place("sofa", { x: 5650, y: 900 }, 0, { name: "Reading chair", parameters: { widthMm: 900 } })
    .place("plant-snake", { x: 6250, y: 150 }, 0, { name: "Snake plant" })
    .against(7, 2000, "bookcase-open", {
      name: "Bookcase",
      parameters: { widthMm: 1000, heightMm: 1500, shelves: 3 },
    })
    .rug("Landing runner", { x: 5650, y: 4300 }, 900, 4000, paint([0.42, 0.36, 0.3], 1))
    .light(
      "Landing light 1",
      { x: 5650, y: 3000 },
      { fixture: builtin("ceiling-light-round"), elevationMm: 2600, lumens: 900 },
    )
    .light(
      "Landing light 2",
      { x: 5700, y: 7150 },
      { fixture: builtin("ceiling-light-round"), elevationMm: 2600, lumens: 900 },
    )
    .light(
      "Stair strip",
      { x: 6100, y: 8585 },
      {
        elevationMm: 2550,
        lumens: 900,
        modes: ["colorTemperature", "rgb"],
        linear: { lengthMm: 3600, rotationDeg: 0 },
      },
    );

  // ---- floors, placement and the stair's rise ------------------------------------------------------
  const shell = createHouseDocument(id, familyHouseName);
  const base = { ...shell, defaultWallHeightMm: 2700 };
  const groundFloor = {
    ...createFloor("Ground floor", 0),
    areas: ground.areas(),
    roofs: [terraceCanopy()],
  };
  const firstFloor = {
    ...createFloor("First floor", suggestedElevationAboveMm(groundFloor, base)),
    areas: first.areas(),
  };
  const floors = [groundFloor, firstFloor];
  const rise = stairRiseSuggestionMm({ floors }, groundFloor.id, { minMm: 1000, maxMm: 6000 }, 2700);
  for (const object of hall.area.objects)
    if (object.floorCut === "stair") object.parameters.totalRiseMm = rise;
  return {
    house: {
      ...base,
      environment: {
        location: { latitudeDeg: 48.1351, longitudeDeg: 11.582, timeZone: "Europe/Berlin" },
        northRotationDeg: 0,
        sun: { timeMode: "fixed", fixedLocalDateTime: "2020-06-01T17:00:00" },
      },
      // The roofed attic (familyAttic.ts): a copy of the First floor under a roof, added after the stair's rise.
      floors: [...floors, familyAttic(firstFloor, base)],
    },
    plans: [ground, first],
  };
};

/**
 * The terrace canopy (Phase 19.3): an attached roof (Cuts walls off, it cuts nothing) over the terrace's sitting area,
 * x 400…7800 along the house's south wall (its outer face at y = −300) out to y = −3100, a shed falling 250 mm away
 * from the wall from an eave at 2450 mm, 120 mm thick, aluminium on top, white underneath.
 */
export const terraceCanopy = (): RoofValue => {
  const preset = (presetId: string): RoofValue["topMaterial"] => {
    const found = builtInPresets.find((candidate) => candidate.id === presetId);
    if (found === undefined) throw new Error(`No built-in preset ${presetId}`);
    return structuredClone(found.material);
  };
  const point = (x: number, y: number, heightMm: number): RoofValue["points"][number] => ({
    id: createId("rp"),
    x,
    y,
    heightMm,
  });
  const points = [point(400, -3100, 0), point(7800, -3100, 0), point(7800, -300, 250), point(400, -300, 250)];
  return {
    id: createId("rf"),
    name: "Terrace canopy",
    design: "closed",
    cutsWalls: false,
    wallsRise: false,
    eaveHeightMm: 2450,
    thicknessMm: 120,
    topMaterial: preset("builtin_aluminium"),
    bottomMaterial: preset("builtin_capwhite"),
    sideMaterial: preset("builtin_capwhite"),
    ribHeightMm: roofDefaults.ribHeightMm,
    ribWidthMm: roofDefaults.ribWidthMm,
    ribSpacingMm: roofDefaults.ribSpacingMm,
    ribMaterial: "metal",
    points,
    outline: points.map((each) => each.id),
    lines: [],
  };
};

/** The straight stair object (Phase 16.14): Cut floor above on, so the first floor is cut over it. */
const addStair = (hall: Room, centre: { x: number; y: number }): void => {
  const instance: AreableInstanceValue = {
    id: createId("o"),
    name: "Staircase",
    templateId: "staircase-straight",
    templateVersion: 1,
    parameters: { widthMm: stair.widthMm, depthMm: stair.runMm, totalRiseMm: 2700, stepCount: stair.steps },
    flip: { x: false, z: false },
    materialOverrides: { treads: { preset: "Oak" } },
    attachment: { host: "floor" },
    positionMm: hall.toLocal(centre),
    elevationMm: 0,
    rotationDeg: stair.rotationDeg,
    floorCut: "stair",
    cutFloorAbove: true,
    cutFloorBelow: false,
  };
  hall.object(instance, {
    centre,
    size: { w: stair.widthMm, d: stair.runMm },
    rotationDeg: stair.rotationDeg,
  });
};
