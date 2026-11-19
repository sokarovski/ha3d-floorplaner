// "Demo: City apartment" (scripts/fixtures/demoHouses/build.ts): a 72 m² one-bedroom flat in Berlin with a south balcony.
// An L-shaped open living room with the kitchen in its north-west leg and dining by the balcony door, an L-shaped
// entrance hall, a bedroom, a bathroom with a tub and a utility room. 250 mm exterior walls, 100 mm partitions,
// 2700 mm ceilings.
import { createHouseDocument } from "../../../shared/domain/house/defaults";
import type { HouseDocument } from "../../../shared/domain/schemas/house";
import type { BuildContext } from "./kit";
import {
  E,
  FloorPlan,
  N,
  S,
  W,
  builtin,
  paint,
  palette,
  tallMirror,
  textured,
  threePictures,
  vanityMirror,
  galleryFrames,
} from "./kit";

export const cityApartmentName = "Demo: City apartment";

export const buildCityApartment = (
  id: string,
  context: BuildContext,
): { house: HouseDocument; plans: FloorPlan[] } => {
  const plan = new FloorPlan(context, {
    heightMm: 2700,
    extThicknessMm: 250,
    intThicknessMm: 100,
    facade: paint([0.8, 0.79, 0.76], 0.95),
  });
  const sage = { fronts: { preset: "Sage green" } };

  // ---- Living / kitchen / dining: an L, the kitchen in the north-west leg --------------------------
  // Edges: 0 south (balcony), 1 east (bedroom), 2 north (hall), 3 east of the kitchen leg (hall), 4 north, 5 west.
  const living = plan
    .room(
      "Living, kitchen and dining",
      [
        { x: 0, y: 0 },
        { x: 6400, y: 0 },
        { x: 6400, y: 4000 },
        { x: 2600, y: 4000 },
        { x: 2600, y: 7400 },
        { x: 0, y: 7400 },
      ],
      ["ext", "int", "int", "int", "ext", "ext"],
      paint(palette.warmWhite),
    )
    .floorMaterial(textured("oak"));
  living
    .window(0, 1500, "sliding-door-double", { widthMm: 1660, heightMm: 2260 }, 0, {
      name: "Balcony door",
      overrides: { frame: { preset: "Anthracite" } },
    })
    .window(0, 4700, "window-casement", { widthMm: 1600, heightMm: 1450, wings: "two" }, 800, {
      name: "Living window",
      overrides: { frame: { preset: "Anthracite" } },
    })
    .window(5, 2000, "window-casement", { widthMm: 1200, heightMm: 1450 }, 800, {
      name: "Dining window",
      overrides: { frame: { preset: "Anthracite" } },
    })
    .window(4, 1600, "window-casement", { widthMm: 1000, heightMm: 1200 }, 1000, {
      name: "Kitchen window",
      overrides: { frame: { preset: "Anthracite" } },
    })
    .door(
      2,
      5800,
      "interior-door",
      { widthMm: 850, heightMm: 2050, panelStyle: "half-glazed" },
      {
        name: "Living door",
        overrides: { leaf: { preset: "White" } },
      },
    );
  // Kitchen: a galley along the west wall, from the north corner down to the dining area.
  living.run(5, 7400, [
    { ref: "fridge-freezer-column", name: "Fridge freezer" },
    { ref: "kitchen-sink-base", name: "Sink", overrides: sage },
    { ref: "kitchen-base-cabinet", name: "Base cabinet", parameters: { widthMm: 600 }, overrides: sage },
    { ref: "kitchen-oven-hob", name: "Oven and hob" },
    { ref: "kitchen-drawer-unit", name: "Drawers", parameters: { widthMm: 600 }, overrides: sage },
  ]);
  living
    .onWall(5, 7400 - 700 - 550, "kitchen-upper-cabinet", 1500, {
      name: "Upper cabinet",
      parameters: { widthMm: 1100 },
      overrides: sage,
    })
    .onWall(5, 7400 - 2100, "kitchen-extractor-strip", 1460, { name: "Extractor" })
    .onWall(5, 7400 - 2700, "kitchen-upper-cabinet", 1500, {
      name: "Upper cabinet 2",
      parameters: { widthMm: 600 },
      overrides: sage,
    })
    .onWall(5, 7400 - 1850, "tile-backsplash", 900, {
      name: "Backsplash",
      parameters: { widthMm: 2300, heightMm: 600 },
    })
    .rug("Kitchen tiles", { x: 1300, y: 5700 }, 2600, 3400, textured("tileGrey"))
    .light(
      "Kitchen ceiling",
      { x: 1500, y: 5700 },
      { fixture: { templateId: "ceiling-light-round", version: 1 }, lumens: 1500 },
    )
    .light(
      "Under-cabinet strip",
      { x: 300, y: 5550 },
      {
        fixture: { templateId: "linear-strip", version: 1 },
        elevationMm: 1490,
        lumens: 900,
        kelvin: 3000,
        modes: ["colorTemperature", "rgb"],
        linear: { lengthMm: 2200, rotationDeg: 90 },
      },
    );
  // Dining by the balcony door: a square table and four fabric chairs.
  const chair = "dining-chair";
  living
    .place("table-dining", { x: 1300, y: 2000 }, 0, { name: "Dining table", cluster: "dining" })
    .place(chair, { x: 1300, y: 2826 }, 0, { name: "Dining chair 1", cluster: "dining" })
    .place(chair, { x: 1300, y: 1174 }, 180, { name: "Dining chair 2", cluster: "dining" })
    .place(chair, { x: 474, y: 2000 }, 90, { name: "Dining chair 3", cluster: "dining" })
    .place(chair, { x: 2126, y: 2000 }, 270, { name: "Dining chair 4", cluster: "dining" })
    .against(5, 3500, "sideboard-cabinet", {
      name: "Sideboard",
      parameters: { widthMm: 900 },
      overrides: { fronts: { preset: "Oak" } },
    })
    .frames(5, 3500, threePictures, 1650, "Small picture")
    .light("Dining pendant", { x: 1300, y: 2000 }, { fixture: builtin("pendant-cone"), lumens: 1200 });
  // Living: a cream sofa, an armchair and an oak coffee table facing the TV on the east wall.
  living
    .place("sofa", { x: 3500, y: 2000 }, 90, { name: "Sofa", parameters: { widthMm: 2100 } })
    .place("coffee-table", { x: 4700, y: 2000 }, 90, {
      name: "Coffee table",
      cluster: "rug",
      overrides: { wood: { preset: "Oak" } },
    })
    .place("sofa", { x: 4700, y: 650 }, 180, { name: "Armchair", parameters: { widthMm: 900 } })
    .onWall(E, 2000, "wall-tv", 1050, { name: "TV", parameters: { widthMm: 1400, heightMm: 800 } })
    .against(E, 2000, "drawer-shelf", { name: "TV shelf", parameters: { widthMm: 1800, drawers: 4 } })
    .place("plant-monstera", { x: 6050, y: 300 }, 0, { name: "Monstera" })
    .place("plant-snake", { x: 2850, y: 3750 }, 0, { name: "Snake plant" })
    .frames(2, 4000, galleryFrames, 1600, "Gallery frame", 100)
    .rug("Living rug", { x: 4550, y: 2000 }, 1800, 2600, paint([0.55, 0.5, 0.45], 1))
    .light(
      "Living pendant",
      { x: 4700, y: 2000 },
      {
        fixture: { templateId: "pendant-shade", version: 1 },
        lumens: 1800,
      },
    )
    .light(
      "Reading lamp",
      { x: 3300, y: 3500 },
      {
        fixture: { templateId: "floor-lamp", version: 1 },
        // A floor-standing fixture's foot sits at the light's elevation; the bulb is the template's light node.
        elevationMm: 0,
        lumens: 900,
        modes: ["colorTemperature"],
      },
    )
    .light(
      "Cove strip",
      { x: 4500, y: 3960 },
      {
        elevationMm: 2650,
        lumens: 1400,
        modes: ["colorTemperature", "rgb"],
        linear: { lengthMm: 3600, rotationDeg: 0 },
      },
    );

  // ---- Hall: an L, entrance from the stairwell on the north --------------------------------------
  // Edges: 0 south (living, bedroom), 1 east (bathroom), 2 north of the corridor (utility), 3 east (utility),
  // 4 north (entrance), 5 west (kitchen).
  const hall = plan
    .room(
      "Entrance hall",
      [
        { x: 2700, y: 4100 },
        { x: 7400, y: 4100 },
        { x: 7400, y: 5300 },
        { x: 5000, y: 5300 },
        { x: 5000, y: 7400 },
        { x: 2700, y: 7400 },
      ],
      ["int", "int", "int", "int", "ext", "int"],
      paint(palette.greige),
    )
    .floorMaterial(textured("slate"));
  hall
    .door(4, 3850, "door-entrance", { widthMm: 1000, heightMm: 2100 }, { name: "Front door" })
    .against(5, 5600, "shoe-cabinet", { name: "Shoe cabinet", parameters: { widthMm: 1200, sections: 2 } })
    .frame(5, 6500, tallMirror, 350, "Hall mirror")
    .against(3, 6400, "tall-cabinet-doors", { name: "Coat cupboard", parameters: { widthMm: 600 } })
    .place("plant-leafy", { x: 3000, y: 4400 }, 90, { name: "Leafy plant" })
    .rug("Hall runner", { x: 3850, y: 5900 }, 1000, 2200, paint([0.42, 0.24, 0.2], 1))
    .light("Hall ceiling", { x: 3850, y: 6300 }, { fixture: builtin("ceiling-light-round"), lumens: 900 })
    .light(
      "Corridor ceiling",
      { x: 5900, y: 4700 },
      { fixture: builtin("ceiling-light-round"), lumens: 900 },
    );

  // ---- Bedroom -----------------------------------------------------------------------------------
  const bedroom = plan
    .rect("Bedroom", 6500, 0, 10000, 4000, ["ext", "ext", "int", "int"], paint(palette.sage))
    .floorMaterial(textured("oak"));
  bedroom
    .door(
      N,
      6920,
      "interior-door",
      { widthMm: 800, heightMm: 2050 },
      { name: "Bedroom door", overrides: { leaf: { preset: "White" } } },
    )
    .window(
      S,
      8250,
      "window-casement",
      { widthMm: 1400, heightMm: 1450, wings: "two", secondWingMm: 500 },
      800,
      {
        name: "Bedroom window",
        overrides: { frame: { preset: "Anthracite" } },
      },
    )
    .against(E, 2000, "bed-double", { name: "Bed" })
    .against(E, 755, "bedside-table-hokksund", { name: "Bedside table 1" })
    .against(E, 3245, "bedside-table-hokksund", { name: "Bedside table 2" })
    .frames(E, 2000, threePictures, 1450, "Picture over the bed")
    .against(W, 2500, "wardrobe-two-door", { name: "Wardrobe 1", parameters: { widthMm: 1000 } })
    .against(W, 1500, "wardrobe-two-door", { name: "Wardrobe 2", parameters: { widthMm: 1000 } })
    .place("plant-snake", { x: 9850, y: 260 }, 0, { name: "Snake plant" })
    .rug("Bedroom rug", { x: 8600, y: 2000 }, 2200, 2800, paint([0.78, 0.74, 0.68], 1))
    .light(
      "Bedroom pendant",
      { x: 8400, y: 2000 },
      {
        fixture: { templateId: "pendant-shade", version: 1 },
        lumens: 1400,
      },
    )
    .light(
      "Headboard glow",
      { x: 9985, y: 2000 },
      {
        elevationMm: 1000,
        lumens: 500,
        kelvin: 2400,
        modes: ["colorTemperature", "rgb"],
        linear: { lengthMm: 1800, rotationDeg: 90, facingDeg: 180 },
      },
    );

  // ---- Bathroom ----------------------------------------------------------------------------------
  const bath = plan
    .rect("Bathroom", 7500, 4100, 10000, 7400, ["int", "ext", "ext", "int"], paint(palette.mist, 0.6))
    .floorMaterial(textured("tileWhite"));
  bath
    .door(
      W,
      4700,
      "interior-door",
      { widthMm: 750, heightMm: 2050 },
      { name: "Bathroom door", overrides: { leaf: { preset: "White" } } },
    )
    .window(E, 6550, "window-casement", { widthMm: 700, heightMm: 900 }, 1300, {
      name: "Bathroom window",
      overrides: { glass: { preset: "Frosted glass" }, frame: { preset: "White" } },
    })
    .place("bathtub", { x: 9650, y: 6550 }, 0, { name: "Bathtub" })
    .onWall(E, 5950, "shower-rail", 700, { name: "Shower rail" })
    .against(N, 8300, "toilet-high-cistern", { name: "Toilet" })
    .against(S, 8900, "basin-pedestal", { name: "Basin" })
    .frame(S, 8900, vanityMirror, 1100, "Mirror and light")
    .against(W, 6900, "tall-cabinet-doors", { name: "Tall cabinet" })
    .onWall(W, 5700, "radiator-ribbed", 150, {
      name: "Towel radiator",
      parameters: { widthMm: 500, heightMm: 1200 },
    })
    .light(
      "Bathroom ceiling",
      { x: 8750, y: 5750 },
      { fixture: { templateId: "ceiling-light-round", version: 1 }, lumens: 1200, kelvin: 3500 },
    )
    .light("Mirror light", { x: 8900, y: 4250 }, { elevationMm: 1950, lumens: 400, kelvin: 3500 });

  // ---- Utility -----------------------------------------------------------------------------------
  const utility = plan
    .rect("Utility", 5100, 5400, 7400, 7400, ["int", "int", "ext", "int"], paint(palette.chalk))
    .floorMaterial(textured("tileGrey"));
  utility
    .door(
      S,
      5600,
      "interior-door",
      { widthMm: 800, heightMm: 2050 },
      { name: "Utility door", overrides: { leaf: { preset: "White" } } },
    )
    .window(N, 6300, "window-casement", { widthMm: 800, heightMm: 600 }, 1500, { name: "Utility window" })
    .against(N, 6950, "washing-machine", { name: "Washing machine" })
    .against(N, 6300, "tumble-dryer", { name: "Tumble dryer" })
    .against(W, 6900, "tall-cabinet-open-shelves", { name: "Shelves" })
    .onWall(E, 6000, "water-heater-wall", 1100, { name: "Water heater" })
    .light(
      "Utility ceiling",
      { x: 6250, y: 6400 },
      { fixture: { templateId: "ceiling-light-square", version: 1 }, lumens: 1000, kelvin: 4000 },
    );

  // ---- Balcony (outside, low parapet) --------------------------------------------------------------
  const balcony = plan
    .rect("Balcony", 300, -1650, 2900, -250, ["low", "low", "none", "low"], paint([0.8, 0.79, 0.76], 0.95))
    .floorMaterial(textured("decking"));
  balcony
    .place("bar-table", { x: 2450, y: -1350 }, 0, {
      name: "Bistro table",
      parameters: { widthMm: 800, depthMm: 600, heightMm: 750 },
      cluster: "bistro",
    })
    .place("stool-three-leg", { x: 2050, y: -1350 }, 90, { name: "Stool 1", cluster: "bistro" })
    .place("stool-three-leg", { x: 2500, y: -850 }, 180, { name: "Stool 2", cluster: "bistro" })
    .place("plant-leafy", { x: 560, y: -1440 }, 0, { name: "Planter" })
    .light("Balcony light", { x: 1600, y: -420 }, { elevationMm: 2300, lumens: 350, kelvin: 2700 });

  const house = createHouseDocument(id, cityApartmentName);
  const floor = house.floors[0];
  if (floor === undefined) throw new Error("No floor");
  return {
    house: {
      ...house,
      defaultWallHeightMm: 2700,
      environment: {
        location: { latitudeDeg: 52.52, longitudeDeg: 13.405, timeZone: "Europe/Berlin" },
        northRotationDeg: 0,
        sun: { timeMode: "fixed", fixedLocalDateTime: "2020-05-20T16:00:00" },
      },
      floors: [{ ...floor, name: "Apartment", areas: plan.areas() }],
    },
    plans: [plan],
  };
};
