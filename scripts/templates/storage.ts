// Storage family (Phase 9.3, D26): two wardrobes, a three-section divider wardrobe, a shoe cabinet with a
// section count, a low open bookcase, a floating drawer shelf, a sideboard, two tall cabinets, and the bedside
// table. Each is sliced so the corner/plinth/door-gap bands keep their size, and driven only by its own
// metadata: repeat counts and sizes are formulas, hidden parts are `visible` formulas, and the finishes are
// choosable material slots with bundled presets. Shapes and sizes follow the owner's templates of the same
// objects (Phase 9 notes); built-ins are named for what they are.
import { boxes, floorAreable, prismBuilder } from "./helpers";
import type { Geo, MaterialSpec, PartSpec, TemplateSpec, V3 } from "./helpers";
import type { MaterialSlot, NodeRule, TemplateMetadata } from "@shared/domain/templates/metadata";

/** One axis-aligned box, in millimetres. */
export const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
  [
    [x0, y0, z0],
    [x1, y1, z1],
  ] as const satisfies readonly [V3, V3];

// ---------------------------------------------------------------------------------------------
// Finishes and slots (shared with beds.ts).

const finish = (color: V3, roughness = 0.55): MaterialSpec => ({ color, roughness });

/** Wood and painted finishes offered as presets (linear colours). */
export const finishes: Readonly<Record<string, MaterialSpec>> = {
  Beech: finish([0.58, 0.31, 0.11]),
  Oak: finish([0.51, 0.3, 0.13]),
  Walnut: finish([0.22, 0.1, 0.05]),
  Birch: finish([0.77, 0.67, 0.48]),
  Sand: finish([0.66, 0.49, 0.3]),
  White: finish([0.85, 0.85, 0.83], 0.6),
  Grey: finish([0.35, 0.36, 0.36], 0.6),
  Black: finish([0.03, 0.03, 0.03], 0.5),
};

/** Handle finishes offered as presets. */
export const metals: Readonly<Record<string, MaterialSpec>> = {
  Steel: { color: [0.65, 0.67, 0.69], roughness: 0.35, metallic: 0.5 },
  "Black metal": { color: [0.03, 0.03, 0.03], roughness: 0.4, metallic: 0.4 },
  Brass: { color: [0.7, 0.5, 0.15], roughness: 0.35, metallic: 0.6 },
  "Dark brown": { color: [0.22, 0.11, 0.05], roughness: 0.5 },
};

const commonFinishes = ["Oak", "Beech", "Walnut", "Birch", "Sand", "White", "Grey"] as const;

/** A choosable wood or painted slot: its own default material first, then the shared finishes. */
export const woodSlot = (
  material: string,
  title: string,
  others: readonly string[] = commonFinishes,
  allowTexture = true,
): MaterialSlot => ({
  material,
  title,
  choosable: true,
  presets: [material, ...others.filter((name) => name !== material)],
  allowColor: true,
  allowTexture,
});

/** A choosable handle or hardware slot. */
export const metalSlot = (material: string, title: string): MaterialSlot => ({
  material,
  title,
  choosable: true,
  presets: [material, ...Object.keys(metals).filter((name) => name !== material)],
  allowColor: true,
  allowTexture: false,
});

/** The materials of a template: its own defaults plus every finish/metal named by its presets. */
export const withPresets = (
  own: Readonly<Record<string, MaterialSpec>>,
  slots: Readonly<Record<string, MaterialSlot>>,
): Readonly<Record<string, MaterialSpec>> => {
  const result: Record<string, MaterialSpec> = { ...own };
  for (const slot of Object.values(slots)) {
    if (typeof slot === "string") continue;
    for (const name of slot.presets ?? []) {
      const preset = finishes[name] ?? metals[name];
      if (result[name] === undefined && preset !== undefined) result[name] = preset;
    }
  }
  return result;
};

// ---------------------------------------------------------------------------------------------
// Parameter helpers.

export const counter = (
  title: string,
  description: string,
  minimum: number,
  maximum: number,
  value: number,
  order: number,
) => ({
  type: "integer",
  title,
  description,
  minimum,
  maximum,
  default: value,
  "x-homeplan": { editor: "number", group: "template", order },
});

export const toggle = (title: string, description: string, value: boolean, order: number) => ({
  type: "boolean",
  title,
  description,
  default: value,
  "x-homeplan": { editor: "toggle", group: "template", order },
});

/** Rigid by its own centre on every axis: not stretched by the slices, but kept where its centre maps. */
const rigid: NodeRule = { pin: {} };

const part = (name: string, material: string, rule: NodeRule | undefined, ...list: ReturnType<typeof bx>[]) =>
  ({
    name,
    material,
    ...(rule === undefined ? {} : { rule }),
    build: boxes(...list),
  }) satisfies PartSpec;

const storageBase = (
  kind: string,
  label: string,
  category: string,
  tags: readonly string[],
): Pick<
  TemplateMetadata,
  "schemaVersion" | "contract" | "opening" | "attachment" | "flip" | "kind" | "label"
> &
  Pick<TemplateMetadata, "category" | "tags"> => ({
  ...floorAreable,
  kind,
  label,
  category,
  tags: [...tags],
});

// ---------------------------------------------------------------------------------------------
// Wardrobe with a drawer, a top cupboard, and metal legs (bedroom wardrobe, 600 × 2600 × 538).
//
// x: 50 mm bands keep the legs and door edges at the corners; the two wings widen evenly, the wing handles stay
// at the centre gap, and the drawer handle is 70 % of the width. y: legs and drawer (427 mm) fixed at the
// bottom, the top cupboard (503 mm) fixed at the top, only the lower wings stretch. z: the leg and the door +
// handle bands stay at the back and front (the depth includes the 38 mm of doors and handles).

const wardrobeDrawerSlots: Readonly<Record<string, MaterialSlot>> = {
  carcass: woodSlot("Beech", "Carcass"),
  doors: woodSlot("Beech fronts", "Doors"),
  handles: metalSlot("Steel", "Handles and legs"),
};

const wardrobeDrawer: TemplateSpec = {
  id: "wardrobe-drawer-legs",
  view: "front",
  metadata: {
    ...storageBase("wardrobe", "Wardrobe with Drawer and Legs", "Storage", [
      "wardrobe",
      "closet",
      "bedroom",
      "drawer",
    ]),
    product: {
      name: "Two-wing wardrobe with drawer and top cupboard",
      description:
        "A 60 cm wardrobe on 100 mm metal legs: a drawer, two tall wings, and two top cupboard doors with bar handles.",
    },
    resize: {
      x: {
        mode: "slice",
        startMm: 50,
        endMm: 50,
        minMm: 450,
        maxMm: 1200,
        defaultMm: 600,
        description: "Overall width. The legs stay in the corners and the two wings widen evenly.",
        quickPicks: [500, 600, 800, 1000],
      },
      y: {
        mode: "slice",
        startMm: 427,
        endMm: 503,
        minMm: 1800,
        maxMm: 2800,
        defaultMm: 2600,
        description:
          "Overall height. Only the tall wings stretch; the legs, drawer, and top cupboard keep their size.",
        quickPicks: [2000, 2400, 2600],
      },
      z: {
        mode: "slice",
        startMm: 70,
        endMm: 92,
        minMm: 450,
        maxMm: 700,
        defaultMm: 538,
        description: "Overall depth including the doors and handles (the carcass is 38 mm less).",
        quickPicks: [450, 538, 600],
      },
    },
    materialSlots: wardrobeDrawerSlots,
  },
  materials: withPresets(
    {
      Beech: finishes.Beech ?? finish([0.58, 0.31, 0.11]),
      "Beech fronts": finishes.Beech ?? finish([0.58, 0.31, 0.11]),
      ...metals,
    },
    wardrobeDrawerSlots,
  ),
  parts: [
    part("Carcass", "Beech", undefined, bx(-300, 100, -250, 300, 2600, 232)),
    part(
      "Legs",
      "Steel",
      undefined,
      bx(-274, 0, -214, -256, 100, -196),
      bx(-274, 0, 196, -256, 100, 214),
      bx(256, 0, -214, 274, 100, -196),
      bx(256, 0, 196, 274, 100, 214),
    ),
    part(
      "Doors",
      "Beech fronts",
      undefined,
      bx(-297, 103, 232, 297, 423, 250),
      bx(-297, 427, 232, -1, 2097, 250),
      bx(1, 427, 232, 297, 2097, 250),
      bx(-297, 2103, 232, -1, 2597, 250),
      bx(1, 2103, 232, 297, 2597, 250),
    ),
    part(
      "DrawerHandle",
      "Steel",
      { pin: { x: "center" }, size: { x: "sizeX * 0.7" } },
      bx(-210, 257, 276, 210, 269, 288),
    ),
    // The posts sit 20 mm inside the ends of the bar (the bar is 70 % of the width).
    part(
      "DrawerHandlePostLeft",
      "Steel",
      { pin: { x: "center" }, translate: { x: "210 - sizeX * 0.35" } },
      bx(-194, 259, 250, -186, 267, 282),
    ),
    part(
      "DrawerHandlePostRight",
      "Steel",
      { pin: { x: "center" }, translate: { x: "sizeX * 0.35 - 210" } },
      bx(186, 259, 250, 194, 267, 282),
    ),
    part(
      "WingHandles",
      "Steel",
      { pin: { x: "center" } },
      bx(-32, 1150, 276, -20, 1500, 288),
      bx(-30, 1171, 250, -22, 1179, 282),
      bx(-30, 1471, 250, -22, 1479, 282),
      bx(20, 1150, 276, 32, 1500, 288),
      bx(22, 1171, 250, 30, 1179, 282),
      bx(22, 1471, 250, 30, 1479, 282),
    ),
    part(
      "TopHandles",
      "Steel",
      { pin: { x: "center" } },
      bx(-32, 2170, 276, -20, 2540, 288),
      bx(-30, 2191, 250, -22, 2199, 282),
      bx(-30, 2511, 250, -22, 2519, 282),
      bx(20, 2170, 276, 32, 2540, 288),
      bx(22, 2191, 250, 30, 2199, 282),
      bx(22, 2511, 250, 30, 2519, 282),
    ),
  ],
};

// ---------------------------------------------------------------------------------------------
// Wardrobe with two tall doors and two top cupboard doors (children's wardrobe, 850 × 2420 × 591).

const wardrobeDoorsSlots: Readonly<Record<string, MaterialSlot>> = {
  carcass: woodSlot("Oak case", "Carcass", ["Oak", "Beech", "Walnut", "Birch", "Sand", "White", "Grey"]),
  doors: woodSlot("Sand doors", "Doors", ["Oak", "Beech", "Walnut", "Birch", "White", "Grey"]),
  handles: metalSlot("Dark brown", "Handles"),
};

const wardrobeTwoDoor: TemplateSpec = {
  id: "wardrobe-two-door",
  view: "front",
  metadata: {
    ...storageBase("wardrobe", "Wardrobe with Two Doors and Top Cupboards", "Storage", [
      "wardrobe",
      "closet",
      "tall",
    ]),
    product: {
      name: "Tall wardrobe with two doors and two top cupboards",
      description: "A 85 cm wardrobe: two tall doors and two upper cupboard doors with bar handles.",
    },
    resize: {
      x: {
        mode: "slice",
        startMm: 8,
        endMm: 8,
        minMm: 600,
        maxMm: 1400,
        defaultMm: 850,
        description: "Overall width. The two doors widen evenly and the handles stay at the centre gap.",
        quickPicks: [600, 800, 1000, 1200],
      },
      y: {
        mode: "slice",
        startMm: 30,
        endMm: 520,
        minMm: 1700,
        maxMm: 2600,
        defaultMm: 2420,
        description: "Overall height. Only the tall doors stretch; the top cupboards keep their size.",
        quickPicks: [2000, 2200, 2420],
      },
      z: {
        mode: "slice",
        startMm: 0,
        endMm: 45,
        minMm: 400,
        maxMm: 650,
        defaultMm: 591,
        description: "Overall depth including the doors and handles (45 mm).",
        quickPicks: [450, 550, 591],
      },
    },
    materialSlots: wardrobeDoorsSlots,
  },
  materials: withPresets(
    {
      "Oak case": finishes.Oak ?? finish([0.51, 0.3, 0.13]),
      "Sand doors": finishes.Sand ?? finish([0.66, 0.49, 0.3]),
      ...metals,
    },
    wardrobeDoorsSlots,
  ),
  parts: [
    part("Carcass", "Oak case", undefined, bx(-425, 0, -275, 425, 2420, 275)),
    part(
      "Doors",
      "Sand doors",
      undefined,
      bx(-417, 30, 271, -3, 1900, 296),
      bx(3, 30, 271, 417, 1900, 296),
      bx(-417, 1940, 271, -3, 2410, 296),
      bx(3, 1940, 271, 417, 2410, 296),
    ),
    part(
      "LowerHandles",
      "Dark brown",
      { pin: { x: "center" } },
      bx(-51, 920, 304, -39, 1060, 316),
      bx(39, 920, 304, 51, 1060, 316),
    ),
    part(
      "TopHandles",
      "Dark brown",
      { pin: { x: "center" } },
      bx(-51, 1980, 304, -39, 2040, 316),
      bx(39, 1980, 304, 51, 2040, 316),
    ),
  ],
};

// ---------------------------------------------------------------------------------------------
// Three-section wardrobe (room divider, 1000 × 2500 × 500): tall doors below, upper cupboard doors above.

const dividerSlots: Readonly<Record<string, MaterialSlot>> = {
  carcass: woodSlot("Warm greige", "Carcass", ["Oak", "Beech", "Walnut", "Birch", "Sand", "White", "Grey"]),
  doors: woodSlot("Wardrobe doors", "Doors", ["Oak", "Beech", "Walnut", "Birch", "Sand", "White", "Grey"]),
  handles: metalSlot("Satin handles", "Handles"),
};

const dividerHandle = (door: 0 | 1 | 2, upper: boolean): PartSpec => {
  // Owner layout: the handles sit on the right edge of each door (door edges -498/-165/169 .. -169/165/498).
  const centers = [-223, 110, 443] as const;
  const x = centers[door];
  return part(
    `${upper ? "Upper" : "Tall"}Handle${door + 1}`,
    "Satin handles",
    rigid,
    upper ? bx(x - 4, 1965, 242, x + 4, 2045, 250) : bx(x - 4, 1160, 242, x + 4, 1370, 250),
  );
};

const wardrobeDivider: TemplateSpec = {
  id: "wardrobe-three-section",
  view: "front",
  metadata: {
    ...storageBase("wardrobe", "Three-Section Wardrobe", "Storage", [
      "wardrobe",
      "divider",
      "tall",
      "closet",
    ]),
    product: {
      name: "Three-section room-divider wardrobe",
      description:
        "Three equal sections with tall doors below and upper cupboard doors above; also stands in a room.",
    },
    resize: {
      x: {
        mode: "slice",
        startMm: 20,
        endMm: 20,
        minMm: 800,
        maxMm: 1400,
        defaultMm: 1000,
        description: "Overall width; the three sections stay equal.",
        quickPicks: [900, 1000, 1200, 1400],
      },
      y: {
        mode: "slice",
        startMm: 75,
        endMm: 640,
        minMm: 2000,
        maxMm: 2700,
        defaultMm: 2500,
        description: "Overall height. Only the tall doors stretch; the upper cupboards keep their size.",
        quickPicks: [2200, 2400, 2500],
      },
      z: {
        mode: "slice",
        startMm: 20,
        endMm: 24,
        minMm: 400,
        maxMm: 650,
        defaultMm: 500,
        description: "Overall depth including the door fronts and handles.",
        quickPicks: [400, 500, 600],
      },
    },
    materialSlots: dividerSlots,
  },
  materials: withPresets(
    {
      "Warm greige": finish([0.57, 0.55, 0.47]),
      "Wardrobe doors": finish([0.6, 0.57, 0.5]),
      "Satin handles": { color: [0.31, 0.33, 0.3], roughness: 0.4, metallic: 0.3 },
      ...metals,
    },
    dividerSlots,
  ),
  parts: [
    part(
      "Carcass",
      "Warm greige",
      undefined,
      bx(-500, 0, -250, -480, 2500, 250),
      bx(480, 0, -250, 500, 2500, 250),
      bx(-500, 0, -250, 500, 30, 250),
      bx(-500, 1860, -250, 500, 1890, 250),
      bx(-500, 2470, -250, 500, 2500, 250),
      bx(-500, 0, -250, 500, 2500, -230),
      bx(-480, 0, -235, 480, 70, 235),
    ),
    part(
      "DividerLeft",
      "Warm greige",
      { stretch: { y: true, z: true } },
      bx(-176, 30, -240, -158, 2470, 230),
    ),
    part("DividerRight", "Warm greige", { stretch: { y: true, z: true } }, bx(158, 30, -240, 176, 2470, 230)),
    part(
      "Doors",
      "Wardrobe doors",
      undefined,
      bx(-498, 75, 226, -169, 1865, 248),
      bx(-498, 1918, 226, -169, 2483, 248),
      bx(-165, 75, 226, 165, 1865, 248),
      bx(-165, 1918, 226, 165, 2483, 248),
      bx(169, 75, 226, 498, 1865, 248),
      bx(169, 1918, 226, 498, 2483, 248),
    ),
    ...([0, 1, 2] as const).flatMap((door) => [dividerHandle(door, false), dividerHandle(door, true)]),
  ],
};

// ---------------------------------------------------------------------------------------------
// Shoe cabinet: a low cabinet with `sections` doors (owner: three-section 1350 and low two-section 900).

const shoeSlots: Readonly<Record<string, MaterialSlot>> = {
  carcass: woodSlot("Warm grey", "Carcass", ["Oak", "Beech", "Walnut", "Birch", "Sand", "White", "Grey"]),
  doors: woodSlot("Warm grey fronts", "Doors", ["Oak", "Beech", "Walnut", "Birch", "Sand", "White", "Grey"]),
  handles: metalSlot("Dark metal", "Handles"),
};

const shoeCabinet: TemplateSpec = {
  id: "shoe-cabinet",
  view: "front",
  metadata: {
    ...storageBase("cabinet", "Shoe Cabinet", "Storage", ["shoe", "cabinet", "hallway", "low", "doors"]),
    product: {
      name: "Low shoe cabinet with doors",
      description: "A low cabinet whose front is divided into equal doors with bar handles.",
    },
    resize: {
      x: {
        mode: "scale",
        minMm: 500,
        maxMm: 2400,
        defaultMm: 1350,
        description: "Overall width; the doors share it equally.",
        quickPicks: [900, 1350, 1800],
      },
      y: {
        mode: "slice",
        startMm: 30,
        endMm: 30,
        minMm: 500,
        maxMm: 1000,
        defaultMm: 780,
        description: "Overall height; the doors keep their 30 mm gap above and below.",
        quickPicks: [600, 780, 900],
      },
      z: {
        mode: "slice",
        startMm: 0,
        endMm: 30,
        minMm: 230,
        maxMm: 480,
        defaultMm: 290,
        description: "Overall depth including the doors and handles.",
        quickPicks: [250, 290, 350],
      },
    },
    materialSlots: shoeSlots,
    properties: {
      sections: counter("Sections", "How many doors the front is divided into.", 1, 6, 3, 4),
    },
  },
  materials: withPresets(
    {
      "Warm grey": finish([0.53, 0.5, 0.42]),
      "Warm grey fronts": finish([0.53, 0.5, 0.42]),
      "Dark metal": { color: [0.09, 0.11, 0.12], roughness: 0.4, metallic: 0.4 },
      ...metals,
    },
    shoeSlots,
  ),
  parts: [
    part("Carcass", "Warm grey", { extendsWith: "Door" }, bx(-675, 0, -130, 675, 780, 130)),
    part(
      "Door",
      "Warm grey fronts",
      {
        repeat: { offsetMm: { x: 450 }, count: { parameter: "sections" } },
        stretch: { y: true },
        size: { x: "sizeX / sections - 10" },
      },
      bx(-670, 30, 130, -230, 750, 148),
    ),
    part(
      "Handle",
      "Dark metal",
      {
        repeat: { offsetMm: { x: 450 }, count: { parameter: "sections" } },
        pin: { y: "end" },
        size: { x: "min(230, sizeX / sections * 0.5)" },
      },
      bx(-565, 695, 150, -335, 705, 160),
    ),
  ],
};

// ---------------------------------------------------------------------------------------------
// Low open bookcase: `shelves` loose shelves between a fixed bottom and top shelf; optional books.

const bookcaseSlots: Readonly<Record<string, MaterialSlot>> = {
  wood: woodSlot("Light wood", "Wood", ["Oak", "Beech", "Walnut", "Birch", "Sand", "White", "Grey"]),
  books: {
    material: "Sage books",
    title: "Books",
    choosable: true,
    presets: ["Sage books", "Dusty pink books", "Blue books"],
    allowColor: true,
    allowTexture: false,
  },
  paper: "Paper",
};

const bookcase: TemplateSpec = {
  id: "bookcase-open",
  view: "front",
  metadata: {
    ...storageBase("bookcase", "Open Bookcase", "Storage", ["bookcase", "shelf", "shelves", "open", "low"]),
    product: {
      name: "Open bookcase",
      description:
        "An open shelving unit with adjustable height, width, and number of shelves; books stand on the bottom shelf.",
    },
    resize: {
      x: {
        mode: "slice",
        startMm: 25,
        endMm: 25,
        minMm: 500,
        maxMm: 1800,
        defaultMm: 700,
        description: "Overall width; the 25 mm sides keep their thickness.",
        quickPicks: [600, 700, 900, 1200],
      },
      y: {
        mode: "slice",
        startMm: 31,
        endMm: 22,
        minMm: 600,
        maxMm: 2200,
        defaultMm: 1120,
        description: "Overall height; the loose shelves spread evenly between the bottom and top shelf.",
        quickPicks: [800, 1120, 1500, 1800],
      },
      z: {
        mode: "slice",
        startMm: 12,
        endMm: 0,
        minMm: 250,
        maxMm: 450,
        defaultMm: 340,
        description: "Overall depth; the 12 mm back panel keeps its thickness.",
        quickPicks: [300, 340, 400],
      },
    },
    materialSlots: bookcaseSlots,
    properties: {
      shelves: counter("Shelves", "Loose shelves between the bottom and the top shelf.", 0, 8, 3, 4),
      books: toggle("Books", "Shows books and a paper stack on the bottom shelf.", true, 5),
    },
  },
  materials: withPresets(
    {
      "Light wood": finish([0.6, 0.46, 0.27]),
      "Sage books": finish([0.27, 0.4, 0.37], 0.8),
      "Dusty pink books": finish([0.6, 0.32, 0.38], 0.8),
      "Blue books": finish([0.2, 0.3, 0.5], 0.8),
      Paper: finish([0.81, 0.77, 0.67], 0.85),
    },
    bookcaseSlots,
  ),
  parts: [
    part(
      "Sides",
      "Light wood",
      { extendsWith: "Shelf" },
      bx(-350, 0, -170, -325, 1120, 170),
      bx(325, 0, -170, 350, 1120, 170),
    ),
    part("Back", "Light wood", { extendsWith: "Shelf" }, bx(-325, 0, -170, 325, 1120, -158)),
    part("BottomShelf", "Light wood", undefined, bx(-325, 9, -170, 325, 31, 170)),
    part("TopShelf", "Light wood", { follows: "Shelf" }, bx(-325, 1098, -170, 325, 1120, 170)),
    // Loose shelves 272 mm apart (251 mm clear), the first 282 mm above the floor.
    part(
      "Shelf",
      "Light wood",
      {
        repeat: { offsetMm: { y: 272 }, count: { parameter: "shelves" } },
        stretch: { x: true, z: true },
        size: { y: 22 },
      },
      bx(-325, 282, -170, 325, 304, 170),
    ),
    part(
      "Books",
      "Sage books",
      { pin: { x: "start", y: "start" }, size: { z: "sizeZ * 0.67" }, visible: "books" },
      bx(-250, 35, -125, -190, 245, 105),
      bx(-175, 45, -125, -115, 235, 105),
      bx(-100, 55, -125, -40, 225, 105),
    ),
    part(
      "PaperStack",
      "Paper",
      { pin: { x: "end", y: "start" }, size: { z: "sizeZ * 0.7" }, visible: "books" },
      bx(45, 31, -110, 265, 75, 130),
    ),
  ],
};

// ---------------------------------------------------------------------------------------------
// Floating drawer shelf: a low cabinet with `drawers` push-to-open drawers and a continuous ledge on top.

const drawerShelfSlots: Readonly<Record<string, MaterialSlot>> = {
  carcass: woodSlot("Warm white cabinet", "Carcass", [
    "Oak",
    "Beech",
    "Walnut",
    "Birch",
    "Sand",
    "White",
    "Grey",
  ]),
  fronts: woodSlot("Drawer fronts", "Drawer fronts", [
    "Oak",
    "Beech",
    "Walnut",
    "Birch",
    "Sand",
    "White",
    "Grey",
  ]),
};

const drawerShelf: TemplateSpec = {
  id: "drawer-shelf",
  view: "front",
  metadata: {
    ...storageBase("cabinet", "Low Drawer Shelf", "Storage", ["drawers", "shelf", "low", "ledge", "cabinet"]),
    product: {
      name: "Low drawer cabinet with ledge",
      description:
        "A 21 cm high row of push-to-open drawers under a continuous ledge that is deeper at the back.",
    },
    resize: {
      x: {
        mode: "scale",
        minMm: 1200,
        maxMm: 3500,
        defaultMm: 2800,
        description: "Overall width; the drawers share it equally.",
        quickPicks: [1400, 2100, 2800],
      },
      y: { mode: "fixed" },
      z: { mode: "fixed" },
    },
    materialSlots: drawerShelfSlots,
    properties: {
      drawers: counter("Drawers", "How many drawers the front is divided into.", 1, 6, 4, 4),
    },
  },
  materials: withPresets(
    {
      "Warm white cabinet": finish([0.79, 0.76, 0.68], 0.6),
      "Drawer fronts": finish([0.73, 0.7, 0.62], 0.6),
    },
    drawerShelfSlots,
  ),
  parts: [
    part(
      "Carcass",
      "Warm white cabinet",
      { extendsWith: "Drawer" },
      bx(-1400, 0, -135, 1400, 18, 135),
      bx(-1400, 9, -135, 1400, 207, -117),
      bx(-1400, 210, -285, 1400, 221, 135),
    ),
    part("EndLeft", "Warm white cabinet", { pin: { x: "start" } }, bx(-1400, 0, -135, -1382, 210, 135)),
    part(
      "EndRight",
      "Warm white cabinet",
      { pin: { x: "end" }, follows: "Drawer" },
      bx(1382, 0, -135, 1400, 210, 135),
    ),
    part(
      "Drawer",
      "Drawer fronts",
      {
        repeat: { offsetMm: { x: 700 }, count: { parameter: "drawers" } },
        size: { x: "sizeX / drawers - 4" },
      },
      bx(-1398, 8, 119, -702, 208, 135),
    ),
  ],
};

// ---------------------------------------------------------------------------------------------
// Sideboard on feet: pedestal 70 × 60 × 85 (door and drawer) and bar cabinet 60 × 60 × 80 (one door).

const sideboardSlots: Readonly<Record<string, MaterialSlot>> = {
  carcass: woodSlot("Pale ash", "Carcass", ["Oak", "Beech", "Walnut", "Birch", "Sand", "White", "Grey"]),
  fronts: woodSlot("Pale ash fronts", "Doors and drawer", [
    "Oak",
    "Beech",
    "Walnut",
    "Birch",
    "Sand",
    "White",
    "Grey",
  ]),
  handles: {
    material: "Aluminium",
    title: "Handle strips",
    choosable: true,
    presets: ["Aluminium", "Black metal", "Brass", "Steel"],
    allowColor: true,
    allowTexture: false,
  },
  feet: "Feet",
};

const foot = (
  name: string,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  xPin: "start" | "end",
  zPin: "start" | "end",
) => part(name, "Feet", { pin: { x: xPin, z: zPin } }, bx(x0, 0, z0, x1, 30, z1));

const sideboard: TemplateSpec = {
  id: "sideboard-cabinet",
  view: "front",
  metadata: {
    ...storageBase("cabinet", "Sideboard Cabinet", "Storage", [
      "sideboard",
      "cabinet",
      "pedestal",
      "bar",
      "feet",
    ]),
    product: {
      name: "Sideboard cabinet on feet",
      description:
        "A cabinet on black feet with an aluminium handle strip: a door with a top drawer (pedestal 70 × 60 × 85 cm), or a single door (bar cabinet 60 × 60 × 80 cm).",
    },
    resize: {
      x: {
        mode: "slice",
        startMm: 6,
        endMm: 6,
        minMm: 450,
        maxMm: 1200,
        defaultMm: 700,
        description: "Overall width; the feet stay in the corners.",
        quickPicks: [500, 600, 700, 900],
      },
      y: {
        mode: "slice",
        startMm: 30,
        endMm: 204,
        minMm: 650,
        maxMm: 1000,
        defaultMm: 850,
        description: "Overall height including the 30 mm feet; the drawer and handle strip keep their size.",
        quickPicks: [800, 850, 900],
      },
      z: {
        mode: "slice",
        startMm: 0,
        endMm: 25,
        minMm: 400,
        maxMm: 700,
        defaultMm: 608,
        description: "Overall depth including the doors and handle strips.",
        quickPicks: [450, 500, 608],
      },
    },
    materialSlots: sideboardSlots,
    properties: {
      drawer: toggle("Top drawer", "A drawer above the door. Off gives one full-height door.", true, 4),
    },
  },
  materials: withPresets(
    {
      "Pale ash": finish([0.77, 0.67, 0.48]),
      "Pale ash fronts": finish([0.77, 0.67, 0.48]),
      Aluminium: { color: [0.42, 0.46, 0.48], roughness: 0.35, metallic: 0.6 },
      Feet: finish([0.04, 0.04, 0.04], 0.5),
      ...metals,
    },
    sideboardSlots,
  ),
  parts: [
    part("Carcass", "Pale ash", undefined, bx(-350, 30, -300, 350, 850, 284)),
    foot("FootBackLeft", -330, -290, -280, -240, "start", "start"),
    foot("FootBackRight", 290, 330, -280, -240, "end", "start"),
    foot("FootFrontLeft", -330, -290, 240, 280, "start", "end"),
    foot("FootFrontRight", 290, 330, 240, 280, "end", "end"),
    part("DoorLow", "Pale ash fronts", { visible: "drawer" }, bx(-344, 32, 283, 344, 646, 301)),
    part("DoorFull", "Pale ash fronts", { visible: "!drawer" }, bx(-344, 32, 283, 344, 841, 301)),
    part("DrawerFront", "Pale ash fronts", { visible: "drawer" }, bx(-344, 657, 283, 344, 841, 301)),
    part(
      "DrawerStrip",
      "Aluminium",
      { pin: { x: "center" }, size: { x: "sizeX - 60" }, visible: "drawer" },
      bx(-320, 666, 300, 320, 682, 308),
    ),
    part(
      "DoorStrip",
      "Aluminium",
      { pin: { x: "center", y: "end" }, size: { x: "sizeX - 60" }, visible: "drawer" },
      bx(-320, 612, 300, 320, 628, 308),
    ),
    part(
      "DoorFullStrip",
      "Aluminium",
      { pin: { x: "center" }, size: { x: "sizeX - 60" }, visible: "!drawer" },
      bx(-320, 800, 300, 320, 816, 308),
    ),
  ],
};

// ---------------------------------------------------------------------------------------------
// Tall cabinet with doors (bathroom tall cabinet, 500 × 2130 × 380): two lower doors, an open compartment with
// a basket, two upper doors.

const tallDoorsSlots: Readonly<Record<string, MaterialSlot>> = {
  carcass: woodSlot("Warm white", "Carcass", ["Oak", "Beech", "Walnut", "Birch", "Sand", "White", "Grey"]),
  doors: woodSlot("Warm white fronts", "Doors", ["Oak", "Beech", "Walnut", "Birch", "Sand", "White", "Grey"]),
  handles: metalSlot("Dark metal", "Handles"),
  basket: "Inner shelf",
};

const tallDoors: TemplateSpec = {
  id: "tall-cabinet-doors",
  view: "front",
  metadata: {
    ...storageBase("cabinet", "Tall Cabinet with Doors", "Storage", [
      "tall",
      "cabinet",
      "bathroom",
      "doors",
      "basket",
    ]),
    product: {
      name: "Tall cabinet with two lower and two upper doors",
      description:
        "A tall narrow cabinet with a basket in the open compartment between the lower and upper doors.",
    },
    resize: {
      x: {
        mode: "slice",
        startMm: 20,
        endMm: 20,
        minMm: 350,
        maxMm: 800,
        defaultMm: 500,
        description: "Overall width; the two doors share it and the sides keep their thickness.",
        quickPicks: [400, 500, 600],
      },
      y: {
        mode: "slice",
        startMm: 30,
        endMm: 1240,
        minMm: 1500,
        maxMm: 2300,
        defaultMm: 2130,
        description:
          "Overall height. Only the lower doors stretch; the open compartment and upper doors keep their size.",
        quickPicks: [1800, 2130, 2300],
      },
      z: {
        mode: "slice",
        startMm: 10,
        endMm: 35,
        minMm: 250,
        maxMm: 500,
        defaultMm: 380,
        description: "Overall depth including the doors and handles.",
        quickPicks: [300, 380, 450],
      },
    },
    materialSlots: tallDoorsSlots,
  },
  materials: withPresets(
    {
      "Warm white": finish([0.89, 0.87, 0.81], 0.6),
      "Warm white fronts": finish([0.89, 0.87, 0.81], 0.6),
      "Dark metal": { color: [0.09, 0.11, 0.12], roughness: 0.4, metallic: 0.4 },
      "Inner shelf": finish([0.56, 0.57, 0.51], 0.8),
      ...metals,
    },
    tallDoorsSlots,
  ),
  parts: [
    part(
      "Carcass",
      "Warm white",
      undefined,
      bx(-250, 0, -175, -230, 2130, 175),
      bx(230, 0, -175, 250, 2130, 175),
      bx(-250, 10, -175, 250, 30, 175),
      bx(-250, 890, -175, 250, 910, 175),
      bx(-250, 1120, -175, 250, 1140, 175),
      bx(-250, 2110, -175, 250, 2130, 175),
      bx(-250, 0, -175, 250, 2130, -165),
    ),
    part(
      "Doors",
      "Warm white fronts",
      undefined,
      bx(-237, 30, 170, -3, 890, 190),
      bx(3, 30, 170, 237, 890, 190),
      bx(-237, 1140, 170, -3, 2110, 190),
      bx(3, 1140, 170, 237, 2110, 190),
    ),
    part(
      "LowerHandles",
      "Dark metal",
      { pin: { x: "center", y: "end" } },
      bx(-45, 760, 195, -35, 830, 205),
      bx(35, 760, 195, 45, 830, 205),
    ),
    part(
      "UpperHandles",
      "Dark metal",
      { pin: { x: "center" } },
      bx(-45, 1190, 195, -35, 1260, 205),
      bx(35, 1190, 195, 45, 1260, 205),
    ),
    part(
      "Basket",
      "Inner shelf",
      { pin: { x: "center" }, stretch: { z: true }, size: { x: "sizeX * 0.56" } },
      bx(-140, 920, -150, 140, 1080, 130),
    ),
  ],
};

// ---------------------------------------------------------------------------------------------
// Tall cabinet with open shelves (tall storage, 850 × 2500 × 463): two tall doors beside an open column with
// `shelves` shelves and an optional basket.

const tallOpenSlots: Readonly<Record<string, MaterialSlot>> = {
  carcass: woodSlot("Greige cabinet", "Carcass", [
    "Oak",
    "Beech",
    "Walnut",
    "Birch",
    "Sand",
    "White",
    "Grey",
  ]),
  doors: woodSlot("Greige fronts", "Doors", ["Oak", "Beech", "Walnut", "Birch", "Sand", "White", "Grey"]),
  handles: metalSlot("Dark metal", "Handles"),
  basket: "Shelf interior",
};

const tallOpen: TemplateSpec = {
  id: "tall-cabinet-open-shelves",
  view: "front",
  metadata: {
    ...storageBase("cabinet", "Tall Cabinet with Open Shelves", "Storage", [
      "tall",
      "cabinet",
      "storage",
      "open shelves",
      "doors",
    ]),
    product: {
      name: "Tall storage cabinet with open shelves",
      description: "A tall cabinet with two doors on the left and an open shelf column on the right.",
    },
    resize: {
      x: {
        mode: "slice",
        startMm: 20,
        endMm: 370,
        minMm: 600,
        maxMm: 1400,
        defaultMm: 850,
        description: "Overall width. The door column widens; the open column keeps its width.",
        quickPicks: [700, 850, 1000, 1200],
      },
      y: {
        mode: "slice",
        startMm: 30,
        endMm: 30,
        minMm: 1200,
        maxMm: 2700,
        defaultMm: 2500,
        description: "Overall height; the open shelves spread evenly.",
        quickPicks: [1800, 2200, 2500],
      },
      z: {
        mode: "slice",
        startMm: 20,
        endMm: 43,
        minMm: 300,
        maxMm: 600,
        defaultMm: 463,
        description: "Overall depth including the doors and handles.",
        quickPicks: [350, 463, 550],
      },
    },
    materialSlots: tallOpenSlots,
    properties: {
      shelves: counter("Open shelves", "Shelves in the open column.", 2, 6, 4, 4),
      basket: toggle("Basket", "Shows a basket on the lowest open shelf.", true, 5),
    },
    formulas: {
      // How much the middle of the height is stretched relative to its natural size.
      scaleY: "(sizeY - 60) / (2440 + (shelves - 4) * 485)",
    },
  },
  materials: withPresets(
    {
      "Greige cabinet": finish([0.58, 0.56, 0.46]),
      "Greige fronts": finish([0.58, 0.56, 0.46]),
      "Dark metal": { color: [0.09, 0.11, 0.12], roughness: 0.4, metallic: 0.4 },
      "Shelf interior": finish([0.42, 0.39, 0.3], 0.8),
      ...metals,
    },
    tallOpenSlots,
  ),
  parts: [
    part(
      "Frame",
      "Greige cabinet",
      { extendsWith: "OpenShelf" },
      bx(-425, 0, -210, -405, 2500, 210),
      bx(55, 0, -210, 75, 2500, 210),
      bx(405, 0, -210, 425, 2500, 210),
      bx(-425, 0, -210, 425, 2500, -190),
    ),
    part("BottomShelf", "Greige cabinet", undefined, bx(-425, 10, -210, 425, 30, 210)),
    part("TopShelf", "Greige cabinet", { follows: "OpenShelf" }, bx(-425, 2470, -210, 425, 2490, 210)),
    part(
      "OpenShelf",
      "Greige cabinet",
      {
        repeat: { offsetMm: { y: 485 }, count: { parameter: "shelves" } },
        stretch: { x: true, z: true },
        size: { y: 22 },
      },
      bx(75, 489, -210, 415, 511, 210),
    ),
    part(
      "Doors",
      "Greige fronts",
      { extendsWith: "OpenShelf" },
      bx(-410, 25, 211, -180, 2475, 233),
      bx(-170, 25, 211, 60, 2475, 233),
    ),
    // The handles stay at 51 % of the height, whatever the shelf count.
    part(
      "Handles",
      "Dark metal",
      { pin: {}, translate: { y: "sizeY * 0.51 - 30 - 1245 * scaleY" } },
      bx(-225, 1190, 243, -215, 1360, 253),
      bx(15, 1190, 243, 25, 1360, 253),
    ),
    // The basket stands on the lowest open shelf (its centre follows the shelf's mapped position).
    part(
      "Basket",
      "Shelf interior",
      { pin: {}, stretch: { z: true }, visible: "basket", translate: { y: "100 - 100 * scaleY" } },
      bx(105, 512, -160, 355, 688, 150),
    ),
  ],
};

// ---------------------------------------------------------------------------------------------
// Bedside table (JYSK HOKKSUND, 450 × 550 × 330): one drawer on splayed legs.

const bedsideSlots: Readonly<Record<string, MaterialSlot>> = {
  wood: woodSlot("Natural oak", "Wood", ["Oak", "Beech", "Walnut", "Birch", "White", "Black"]),
  drawerShadow: "Drawer shadow",
};

/** A splayed leg: the foot sits `out` mm outside the top, over the plan rectangle x0..x1 × z0..z1. */
const splayedLeg =
  (xTop: number, xFoot: number, width: number, z0: number, z1: number) =>
  (g: Geo): void =>
    prismBuilder(
      [
        [xFoot, 0],
        [xFoot + width, 0],
        [xTop + width, 372],
        [xTop, 372],
      ],
      "x",
      "y",
      "z",
      z0,
      z1,
    )(g);

const bedsideTable: TemplateSpec = {
  id: "bedside-table-hokksund",
  view: "front",
  metadata: {
    ...storageBase("table", "Bedside Table with Drawer", "Beds", [
      "bedside",
      "nightstand",
      "drawer",
      "bedroom",
    ]),
    product: {
      manufacturer: "JYSK",
      name: "HOKKSUND",
      description: "Bedside table with one drawer and splayed legs, 450 × 330 × 550 mm, natural oak look.",
    },
    resize: { x: { mode: "fixed" }, y: { mode: "fixed" }, z: { mode: "fixed" } },
    materialSlots: bedsideSlots,
  },
  materials: withPresets(
    {
      "Natural oak": finish([0.64, 0.39, 0.15]),
      "Drawer shadow": finish([0.25, 0.14, 0.05], 0.7),
    },
    bedsideSlots,
  ),
  parts: [
    part("Top", "Natural oak", undefined, bx(-225, 520, -165, 225, 550, 165)),
    part("DrawerCase", "Natural oak", undefined, bx(-205, 370, -150, 205, 520, 150)),
    part("DrawerFront", "Natural oak", undefined, bx(-200, 377, 147, 200, 512, 162)),
    part("HandleSlot", "Drawer shadow", undefined, bx(-80, 463, 162, 80, 477, 166)),
    {
      name: "Legs",
      material: "Natural oak",
      build: (g) => {
        // Back and front pairs; each leg leans outward from the case corner to the floor.
        splayedLeg(-170, -209, 36, -149, -96)(g);
        splayedLeg(134, 173, 36, -149, -96)(g);
        splayedLeg(-170, -209, 36, 96, 149)(g);
        splayedLeg(134, 173, 36, 96, 149)(g);
      },
    },
  ],
};

export const templates: readonly TemplateSpec[] = [
  wardrobeDrawer,
  wardrobeTwoDoor,
  wardrobeDivider,
  shoeCabinet,
  bookcase,
  drawerShelf,
  sideboard,
  tallDoors,
  tallOpen,
  bedsideTable,
];
