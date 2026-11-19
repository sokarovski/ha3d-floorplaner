// "Demo: Garden bungalow" (scripts/fixtures/demoHouses/build.ts): a 129 m² single-storey house near Valencia. The living
// room opens through a wide sliding door onto a covered terrace (three posts) and a garden yard (Phase 17.2): a
// lawn enclosed by a 1.3 m hedge on three sides, with a picket gate at the end of a paved pathway.
// West wing: living, dining, kitchen; a corridor from the east entrance serves the utility room, a shower room,
// three bedrooms and the main bathroom. 300 mm exterior walls, 100 mm partitions, 2800 mm ceilings.
import { createHouseDocument } from "../../../shared/domain/house/defaults";
import type { HouseDocument } from "../../../shared/domain/schemas/house";
import type { BuildContext, WallPiece } from "./kit";
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
  twoPrints,
  vanityMirror,
} from "./kit";

export const gardenBungalowName = "Demo: Garden bungalow";

export const buildGardenBungalow = (
  id: string,
  context: BuildContext,
): { house: HouseDocument; plans: FloorPlan[] } => {
  const facade = paint([0.93, 0.92, 0.88], 0.95);
  const plan = new FloorPlan(context, { heightMm: 2800, extThicknessMm: 300, intThicknessMm: 100, facade });
  const white = { fronts: { preset: "Matte white" } };
  const oakFrame = { frame: { preset: "White" } };
  const frosted = { glass: { preset: "Frosted glass" }, frame: { preset: "White" } };
  const whiteLeaf = { leaf: { preset: "White" } };
  const door = (width: number): Readonly<Record<string, number>> => ({ widthMm: width, heightMm: 2050 });

  // ---- Living ------------------------------------------------------------------------------------
  const living = plan
    .rect("Living room", 0, 0, 5600, 5300, ["ext", "int", "int", "ext"], paint(palette.warmWhite))
    .floorMaterial(textured("oak"));
  living
    .window(S, 2200, "sliding-door-double", { widthMm: 2400, heightMm: 2300 }, 0, {
      name: "Terrace door",
      overrides: oakFrame,
    })
    .window(S, 4700, "window-casement", { widthMm: 1200, heightMm: 1500 }, 700, {
      name: "South window",
      overrides: oakFrame,
    })
    .window(W, 2700, "window-casement", { widthMm: 1800, heightMm: 1500, wings: "two" }, 700, {
      name: "West window",
      overrides: oakFrame,
    })
    .door(E, 4700, "interior-door", door(850), { name: "Corridor door", overrides: whiteLeaf })
    .door(N, 650, "door-glazed", { widthMm: 900, heightMm: 2100, blind: false }, { name: "Dining door" })
    .place("sofa-3-seat", { x: 2000, y: 2700 }, 90, {
      name: "Sofa",
      overrides: { upholstery: { preset: "Sage green" }, cushions: { preset: "Sage green cushion" } },
    })
    .place("coffee-table", { x: 3200, y: 2700 }, 90, { name: "Coffee table" })
    .place("armchair", { x: 4200, y: 1250 }, 210, { name: "Armchair 1" })
    .place("armchair", { x: 3200, y: 4400 }, 0, { name: "Armchair 2" })
    .onWall(E, 2700, "wall-tv", 1050, { name: "TV", parameters: { widthMm: 1400, heightMm: 800 } })
    .against(E, 2700, "drawer-shelf", { name: "TV sideboard", parameters: { widthMm: 2000, drawers: 4 } })
    .against(W, 4050, "bookcase-open", { name: "Bookcase", parameters: { widthMm: 900, heightMm: 1120 } })
    .place("plant-areca-palm", { x: 5250, y: 400 }, 0, { name: "Areca palm" })
    .place("plant-monstera", { x: 400, y: 400 }, 30, { name: "Monstera" })
    .frames(N, 3700, galleryFrames, 1650, "Gallery frame", 100)
    .rug("Living rug", { x: 3000, y: 2700 }, 2200, 3000, paint([0.72, 0.66, 0.56], 1))
    .light("Living pendant", { x: 3200, y: 2700 }, { fixture: builtin("pendant-cone"), lumens: 1400 })
    .light(
      "Living ceiling",
      { x: 1500, y: 1200 },
      { fixture: { templateId: "ceiling-light-round", version: 1 }, lumens: 1200 },
    )
    .light(
      "Reading lamp",
      { x: 2000, y: 4100 },
      {
        fixture: { templateId: "floor-lamp", version: 1 },
        // A floor-standing fixture's foot sits at the light's elevation; the bulb is the template's light node.
        elevationMm: 0,
        lumens: 900,
        modes: ["colorTemperature"],
      },
    )
    .light(
      "TV wall wash",
      { x: 5585, y: 2700 },
      {
        elevationMm: 2750,
        lumens: 1200,
        modes: ["colorTemperature", "rgb"],
        linear: { lengthMm: 2400, rotationDeg: 90 },
      },
    );

  // ---- Dining ------------------------------------------------------------------------------------
  const dining = plan
    .rect("Dining room", 0, 5400, 3000, 8800, ["int", "int", "ext", "ext"], paint(palette.clay))
    .floorMaterial(textured("oak"));
  const chair = "dining-chair";
  const chairWood = { legs: { preset: "Walnut" } };
  dining
    .window(N, 1500, "window-casement", { widthMm: 1600, heightMm: 1500, wings: "two" }, 700, {
      name: "North window",
      overrides: oakFrame,
    })
    .window(W, 7100, "window-casement", { widthMm: 1000, heightMm: 1400 }, 800, {
      name: "West window",
      overrides: oakFrame,
    })
    .place("table-dining", { x: 1500, y: 7100 }, 90, {
      name: "Dining table",
      parameters: { widthMm: 1800, depthMm: 900 },
      overrides: { top: { preset: "Walnut" }, legs: { preset: "Walnut" } },
      cluster: "dining",
    })
    .place(chair, { x: 924, y: 6650 }, 90, { name: "Chair 1", cluster: "dining", overrides: chairWood })
    .place(chair, { x: 924, y: 7550 }, 90, { name: "Chair 2", cluster: "dining", overrides: chairWood })
    .place(chair, { x: 2076, y: 6650 }, 270, { name: "Chair 3", cluster: "dining", overrides: chairWood })
    .place(chair, { x: 2076, y: 7550 }, 270, { name: "Chair 4", cluster: "dining", overrides: chairWood })
    .place(chair, { x: 1500, y: 8126 }, 0, { name: "Chair 5", cluster: "dining", overrides: chairWood })
    .place(chair, { x: 1500, y: 6074 }, 180, { name: "Chair 6", cluster: "dining", overrides: chairWood })
    .against(W, 8250, "sideboard-cabinet", { name: "Sideboard", parameters: { widthMm: 1000 } })
    .frames(E, 7800, twoPrints, 1600, "Print")
    .light(
      "Dining pendant 1",
      { x: 1500, y: 6750 },
      { fixture: { templateId: "pendant-light", version: 1 }, lumens: 800, modes: ["colorTemperature"] },
    )
    .light(
      "Dining pendant 2",
      { x: 1500, y: 7450 },
      { fixture: { templateId: "pendant-light", version: 1 }, lumens: 800, modes: ["colorTemperature"] },
    );

  // ---- Kitchen (L-shaped run on the north and east walls) -------------------------------------------
  const kitchen = plan
    .rect("Kitchen", 3100, 5400, 6400, 8800, ["int", "int", "ext", "int"], paint(palette.chalk))
    .floorMaterial(textured("terracotta"));
  kitchen
    .door(W, 5900, "interior-door", door(800), { name: "Dining door", overrides: whiteLeaf })
    .door(
      S,
      4300,
      "interior-door",
      { ...door(850), panelStyle: "glazed" },
      { name: "Living door", overrides: whiteLeaf },
    )
    .window(N, 4750, "window-casement", { widthMm: 1200, heightMm: 1100 }, 1050, {
      name: "Kitchen window",
      overrides: oakFrame,
    });
  kitchen.run(E, 5400, [
    { ref: "fridge-freezer-column", name: "Fridge freezer" },
    { ref: "kitchen-oven-hob", name: "Oven and hob" },
    { ref: "kitchen-drawer-unit", name: "Drawers", parameters: { widthMm: 600 }, overrides: white },
    { ref: "kitchen-base-cabinet", name: "Base cabinet", parameters: { widthMm: 600 }, overrides: white },
    {
      ref: "kitchen-base-cabinet",
      name: "Corner cabinet",
      parameters: { widthMm: 900, layout: "two-doors-drawer" },
      overrides: white,
    },
  ]);
  kitchen.run(N, 5786, [
    { ref: "kitchen-base-cabinet", name: "Base cabinet 2", parameters: { widthMm: 600 }, overrides: white },
    { ref: "kitchen-sink-base", name: "Sink", overrides: white },
    { ref: "kitchen-drawer-unit", name: "Drawers 2", parameters: { widthMm: 600 }, overrides: white },
    { ref: "kitchen-base-cabinet", name: "Base cabinet 3", parameters: { widthMm: 600 }, overrides: white },
  ]);
  kitchen
    .onWall(N, 5875, "kitchen-upper-cabinet", 1500, {
      name: "Upper cabinet",
      parameters: { widthMm: 1050 },
      overrides: white,
    })
    .onWall(N, 3818, "kitchen-upper-cabinet", 1500, {
      name: "Upper cabinet 2",
      parameters: { widthMm: 664 },
      overrides: white,
    })
    .onWall(E, 6400, "kitchen-extractor-strip", 1460, { name: "Extractor" })
    .onWall(E, 8200, "kitchen-upper-cabinet", 1500, {
      name: "Upper cabinet 3",
      parameters: { widthMm: 1200 },
      overrides: white,
    })
    .onWall(E, 7450, "tile-backsplash", 900, {
      name: "Backsplash",
      parameters: { widthMm: 2700, heightMm: 600 },
    })
    .place("plant-leafy", { x: 3350, y: 7400 }, 0, { name: "Herb pot" })
    .light(
      "Kitchen ceiling",
      { x: 4750, y: 7100 },
      { fixture: { templateId: "ceiling-light-square", version: 1 }, lumens: 1800, kelvin: 3500 },
    )
    .light(
      "Worktop strip",
      { x: 4900, y: 8450 },
      {
        fixture: { templateId: "linear-strip", version: 1 },
        elevationMm: 1490,
        lumens: 900,
        kelvin: 3000,
        modes: ["colorTemperature", "rgb"],
        linear: { lengthMm: 2400, rotationDeg: 0 },
      },
    );

  // ---- Utility -----------------------------------------------------------------------------------
  const utility = plan
    .rect("Utility", 6500, 5400, 8400, 8800, ["int", "int", "ext", "int"], paint(palette.chalk))
    .floorMaterial(textured("tileGrey"));
  utility
    .door(S, 7450, "interior-door", door(800), { name: "Utility door", overrides: whiteLeaf })
    .door(
      N,
      7000,
      "door-glazed",
      { widthMm: 800, heightMm: 2000, handleStyle: "bar", blind: false },
      { name: "Garden door" },
    )
    .against(E, 7700, "washing-machine", { name: "Washing machine" })
    .against(E, 7050, "tumble-dryer", { name: "Tumble dryer" })
    .onWall(W, 7600, "heating-boiler-wall", 1100, { name: "Boiler" })
    .against(W, 6300, "tall-cabinet-doors", { name: "Broom cupboard" })
    .light(
      "Utility ceiling",
      { x: 7450, y: 7100 },
      { fixture: { templateId: "ceiling-light-square", version: 1 }, lumens: 1000, kelvin: 4000 },
    );

  // ---- Shower room -------------------------------------------------------------------------------
  const shower = plan
    .rect("Shower room", 8500, 5400, 11200, 8800, ["int", "int", "ext", "int"], paint(palette.mist, 0.6))
    .floorMaterial(textured("tileWhite"));
  shower
    .door(S, 9100, "interior-door", door(750), { name: "Shower room door", overrides: whiteLeaf })
    .window(N, 10000, "window-casement", { widthMm: 700, heightMm: 900 }, 1400, {
      name: "Shower room window",
      overrides: frosted,
    })
    .onWall(N, 10800, "shower-rail", 700, { name: "Shower" })
    .rug("Shower tray", { x: 10750, y: 8350 }, 900, 900, textured("tileGrey"))
    .place("shower-curtain", { x: 10285, y: 8350 }, 90, {
      name: "Shower curtain",
      parameters: { widthMm: 900 },
    })
    .against(E, 6800, "toilet-high-cistern", { name: "Toilet" })
    .against(W, 7300, "basin-pedestal", { name: "Basin" })
    .frame(W, 7300, vanityMirror, 1100, "Mirror and light")
    .against(W, 8400, "tall-cabinet-doors", { name: "Towel cupboard" })
    .onWall(S, 10400, "radiator-ribbed", 150, {
      name: "Towel radiator",
      parameters: { widthMm: 500, heightMm: 1200 },
    })
    .light(
      "Shower room ceiling",
      { x: 9850, y: 7100 },
      { fixture: builtin("ceiling-light-round"), lumens: 1100, kelvin: 3500 },
    );

  // ---- Bedroom 3 (guest / study) -----------------------------------------------------------------
  const bedroom3 = plan
    .rect("Bedroom 3", 11300, 5400, 15200, 8800, ["int", "ext", "ext", "int"], paint(palette.butter))
    .floorMaterial(textured("ash"));
  bedroom3
    .door(S, 11850, "interior-door", door(800), { name: "Bedroom 3 door", overrides: whiteLeaf })
    .window(
      N,
      12700,
      "window-casement",
      { widthMm: 1400, heightMm: 1450, wings: "two", secondWingMm: 500 },
      800,
      { name: "North window", overrides: oakFrame },
    )
    .window(E, 6500, "window-casement", { widthMm: 1000, heightMm: 1450 }, 800, {
      name: "East window",
      overrides: oakFrame,
    })
    .against(N, 14400, "bed-slat-single", { name: "Bed", parameters: { widthMm: 850, depthMm: 2100 } })
    .against(N, 13550, "bedside-table-hokksund", { name: "Bedside table" })
    .against(W, 7600, "desk", {
      name: "Desk",
      parameters: { widthMm: 1250, depthMm: 520, legStyle: "panel", backRail: true },
      overrides: { top: { preset: "Oak" }, legs: { preset: "Oak" } },
    })
    .place("swivel-chair", { x: 12150, y: 7600 }, 270, { name: "Desk chair" })
    .frames(W, 7600, twoPrints, 1650, "Print over the desk")
    .against(S, 13000, "wardrobe-two-door", { name: "Wardrobe", parameters: { depthMm: 450 } })
    .against(S, 14200, "bookcase-open", { name: "Bookcase", parameters: { widthMm: 1300 } })
    .rug("Bedroom 3 rug", { x: 13400, y: 7300 }, 1600, 2200, paint([0.62, 0.7, 0.76], 1))
    .light("Bedroom 3 pendant", { x: 13250, y: 7100 }, { fixture: builtin("pendant-shade"), lumens: 1200 });

  // ---- Corridor ----------------------------------------------------------------------------------
  const corridor = plan
    .rect("Corridor", 5700, 4100, 15200, 5300, ["int", "ext", "int", "int"], paint(palette.chalk))
    .floorMaterial(textured("oak"));
  corridor
    .door(
      E,
      4700,
      "door-entrance",
      { widthMm: 1000, heightMm: 2100 },
      { name: "Front door", overrides: { leaf: { preset: "Anthracite" } } },
    )
    .against(S, 13700, "shoe-cabinet", { name: "Shoe cabinet", parameters: { widthMm: 1000 } })
    .frame(N, 14000, tallMirror, 350, "Hall mirror")
    .rug("Corridor runner", { x: 10450, y: 4700 }, 7600, 800, paint([0.38, 0.3, 0.4], 1))
    .light("Corridor light 1", { x: 7500, y: 4700 }, { fixture: builtin("ceiling-light-round"), lumens: 800 })
    .light(
      "Corridor light 2",
      { x: 10500, y: 4700 },
      { fixture: builtin("ceiling-light-round"), lumens: 800 },
    )
    .light(
      "Corridor light 3",
      { x: 13500, y: 4700 },
      { fixture: builtin("ceiling-light-round"), lumens: 800 },
    );

  // ---- Bedroom 1 (main) --------------------------------------------------------------------------
  const bedroom1 = plan
    .rect("Main bedroom", 5700, 0, 9500, 4000, ["ext", "int", "int", "int"], paint(palette.dustyBlue))
    .floorMaterial(textured("walnut"));
  bedroom1
    .door(N, 6300, "interior-door", door(800), { name: "Main bedroom door", overrides: whiteLeaf })
    .window(S, 7600, "window-casement", { widthMm: 1600, heightMm: 1450, wings: "two" }, 800, {
      name: "South window",
      overrides: oakFrame,
    })
    .against(E, 2000, "bed-slat-double", { name: "Bed" })
    .against(E, 760, "bedside-table-hokksund", { name: "Bedside table 1" })
    .against(E, 3240, "bedside-table-hokksund", { name: "Bedside table 2" })
    .against(W, 1200, "wardrobe-three-section", { name: "Wardrobe 1" })
    .against(W, 2200, "wardrobe-three-section", { name: "Wardrobe 2" })
    .against(N, 8300, "ladder-decorative", { name: "Blanket ladder" })
    .onWall(E, 2000, "picture-frame", 1250, {
      name: "Picture over the bed",
      parameters: { widthMm: 1200, heightMm: 600 },
    })
    .rug("Main bedroom rug", { x: 8000, y: 2000 }, 2400, 2800, paint([0.86, 0.82, 0.74], 1))
    .light(
      "Main bedroom pendant",
      { x: 7600, y: 2000 },
      { fixture: { templateId: "pendant-shade", version: 1 }, lumens: 1400 },
    )
    .light(
      "Headboard glow",
      { x: 9485, y: 2000 },
      {
        elevationMm: 1050,
        lumens: 500,
        kelvin: 2400,
        modes: ["colorTemperature", "rgb"],
        linear: { lengthMm: 1900, rotationDeg: 90, facingDeg: 180 },
      },
    );

  // ---- Bathroom ----------------------------------------------------------------------------------
  const bathroom = plan
    .rect("Bathroom", 9600, 0, 11700, 4000, ["ext", "int", "int", "int"], paint(palette.sage, 0.6))
    .floorMaterial(textured("tileWhite"));
  bathroom
    .door(N, 10650, "interior-door", door(750), { name: "Bathroom door", overrides: whiteLeaf })
    .window(S, 10650, "window-casement", { widthMm: 700, heightMm: 900 }, 1400, {
      name: "Bathroom window",
      overrides: frosted,
    })
    .place("bathtub", { x: 10650, y: 350 }, 90, { name: "Bathtub" })
    .onWall(S, 11300, "shower-rail", 700, { name: "Bath shower" })
    .against(W, 1600, "toilet-high-cistern", { name: "Toilet" })
    .against(E, 1800, "basin-pedestal", { name: "Basin" })
    .onWall(E, 1800, "frame", 1150, {
      name: "Mirror",
      parameters: { widthMm: 600, heightMm: 800, surface: "Mirror" },
    })
    .against(W, 2800, "tall-cabinet-doors", { name: "Cupboard" })
    .onWall(E, 3000, "radiator-ribbed", 150, {
      name: "Towel radiator",
      parameters: { widthMm: 500, heightMm: 1200 },
    })
    .light(
      "Bathroom ceiling",
      { x: 10650, y: 2000 },
      { fixture: { templateId: "ceiling-light-round", version: 1 }, lumens: 1200, kelvin: 3500 },
    )
    .light("Mirror light", { x: 11550, y: 1800 }, { elevationMm: 2050, lumens: 400, kelvin: 3500 });

  // ---- Bedroom 2 ---------------------------------------------------------------------------------
  const bedroom2 = plan
    .rect("Bedroom 2", 11800, 0, 15200, 4000, ["ext", "ext", "int", "int"], paint(palette.sage))
    .floorMaterial(textured("ash"));
  bedroom2
    .door(N, 12400, "interior-door", door(800), { name: "Bedroom 2 door", overrides: whiteLeaf })
    .window(
      S,
      13500,
      "window-casement",
      { widthMm: 1400, heightMm: 1450, wings: "two", secondWingMm: 500 },
      800,
      { name: "South window", overrides: oakFrame },
    )
    .against(E, 1800, "bed-double", { name: "Bed", overrides: { bedding: { preset: "Sage" } } })
    .against(E, 640, "bedside-table-hokksund", { name: "Bedside table 1" })
    .against(E, 2960, "bedside-table-hokksund", { name: "Bedside table 2" })
    .against(W, 2000, "desk", { name: "Desk", parameters: { widthMm: 1200 } })
    .place("office-chair-mesh", { x: 12620, y: 2000 }, 270, { name: "Desk chair" })
    .against(S, 12300, "wardrobe-drawer-legs", { name: "Wardrobe 1" })
    .against(S, 12900, "wardrobe-drawer-legs", { name: "Wardrobe 2" })
    .light(
      "Bedroom 2 ceiling",
      { x: 13500, y: 2000 },
      { fixture: { templateId: "ceiling-light-round", version: 1 }, lumens: 1300 },
    )
    .light("Desk lamp", { x: 11900, y: 1600 }, { elevationMm: 1100, lumens: 350, kelvin: 3500 });

  // ---- Covered terrace (three posts) and garden yard (hedge, gate, pathway) --------------------------------
  const post = paint([0.35, 0.24, 0.16], 0.7);
  const postPiece = (from: number): WallPiece => ({
    kind: "ext",
    alignment: "inside",
    from,
    to: from + 250,
    thicknessMm: 250,
    heightMm: 2700,
    material: post,
  });
  const terrace = plan
    .rect(
      "Covered terrace",
      0,
      -3300,
      5600,
      -300,
      [[postPiece(0), postPiece(2675), postPiece(5350)], "none", "none", "none"],
      facade,
    )
    .floorMaterial(textured("paving"));
  terrace
    .place("table-dining", { x: 1900, y: -2200 }, 0, {
      name: "Terrace table",
      parameters: { widthMm: 1600, depthMm: 900 },
      cluster: "terrace",
    })
    .place(chair, { x: 1500, y: -1624 }, 0, { name: "Terrace chair 1", cluster: "terrace" })
    .place(chair, { x: 2300, y: -1624 }, 0, { name: "Terrace chair 2", cluster: "terrace" })
    .place(chair, { x: 1500, y: -2776 }, 180, { name: "Terrace chair 3", cluster: "terrace" })
    .place(chair, { x: 2300, y: -2776 }, 180, { name: "Terrace chair 4", cluster: "terrace" })
    .place("sofa", { x: 5100, y: -1800 }, 270, {
      name: "Outdoor sofa",
      overrides: { upholstery: { preset: "Light grey" }, cushions: { preset: "Terracotta cushion" } },
    })
    .place("coffee-table", { x: 4100, y: -1800 }, 90, { name: "Outdoor coffee table" })
    .place("plant-areca-palm", { x: 380, y: -650 }, 0, { name: "Palm pot" })
    .light(
      "Terrace pendant 1",
      { x: 1500, y: -2200 },
      {
        fixture: { templateId: "pendant-light", version: 1 },
        elevationMm: 2700,
        lumens: 700,
        modes: ["colorTemperature"],
      },
    )
    .light(
      "Terrace pendant 2",
      { x: 2300, y: -2200 },
      {
        fixture: { templateId: "pendant-light", version: 1 },
        elevationMm: 2700,
        lumens: 700,
        modes: ["colorTemperature"],
      },
    )
    .light(
      "Terrace ceiling",
      { x: 4300, y: -1800 },
      { fixture: { templateId: "ceiling-light-round", version: 1 }, elevationMm: 2700, lumens: 900 },
    );
  const hedge: WallPiece = { kind: "fence", heightMm: 1300 };
  const garden = plan
    .room(
      "Garden",
      [
        { x: -1500, y: -7000 },
        { x: 16500, y: -7000 },
        { x: 16500, y: -300 },
        { x: 5600, y: -300 },
        { x: 5600, y: -3300 },
        { x: 0, y: -3300 },
        { x: 0, y: -300 },
        { x: -1500, y: -300 },
      ],
      [[hedge], [hedge], "none", "none", "none", "none", "none", [hedge]],
      paint(palette.hedge, 1),
    )
    .yard("hedge")
    .floorMaterial(textured("grass"));
  garden
    .door(S, 2800, "gate-picket", { widthMm: 1200, heightMm: 1000 }, { name: "Garden gate" })
    .rug("Garden path", { x: 2800, y: -5150 }, 1200, 3700, textured("paving"))
    .place("plant-areca-palm", { x: -900, y: -1500 }, 0, { name: "Palm 1", parameters: { heightMm: 2400 } })
    .place("plant-areca-palm", { x: 15800, y: -1300 }, 40, { name: "Palm 2", parameters: { heightMm: 2400 } })
    .place("plant-areca-palm", { x: 8000, y: -6300 }, 80, { name: "Palm 3", parameters: { heightMm: 2200 } })
    .place("plant-areca-palm", { x: 14500, y: -6200 }, 10, { name: "Palm 4", parameters: { heightMm: 2400 } })
    .place("plant-monstera", { x: 6400, y: -1000 }, 0, { name: "Shrub 1", parameters: { heightMm: 1200 } })
    .place("plant-monstera", { x: 9200, y: -900 }, 60, { name: "Shrub 2", parameters: { heightMm: 1100 } })
    .place("plant-monstera", { x: 12500, y: -1000 }, 120, { name: "Shrub 3", parameters: { heightMm: 1200 } })
    .place("plant-leafy", { x: -900, y: -6300 }, 0, { name: "Shrub 4", parameters: { heightMm: 1000 } })
    .light("Path light 1", { x: 2050, y: -4500 }, { elevationMm: 500, lumens: 250, kelvin: 2700 })
    .light("Path light 2", { x: 3550, y: -6000 }, { elevationMm: 500, lumens: 250, kelvin: 2700 });

  const house = createHouseDocument(id, gardenBungalowName);
  const floor = house.floors[0];
  if (floor === undefined) throw new Error("No floor");
  return {
    house: {
      ...house,
      defaultWallHeightMm: 2800,
      environment: {
        location: { latitudeDeg: 39.4699, longitudeDeg: -0.3763, timeZone: "Europe/Madrid" },
        northRotationDeg: 20,
        sun: { timeMode: "fixed", fixedLocalDateTime: "2020-06-10T17:30:00" },
      },
      floors: [{ ...floor, name: "Ground floor", areas: plan.areas() }],
    },
    plans: [plan],
  };
};
