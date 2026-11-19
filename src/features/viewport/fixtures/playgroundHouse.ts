// Fixture house for the /ds/viewport playground: three rectangle rooms on one floor with built-in templates
// (windows, a flipped interior door in the 600 mm touching wall, a sofa with an upholstery override, a wall
// TV), two carpets, and three lights: a visible pendant fixture (point), an invisible spot, and a visible
// linear strip.
//   Living (5 × 4 m, 200 mm outside walls, flat parquet-like flooring) at the origin.
//   Kitchen (4 × 4 m, 400 mm walls) east of it: Touching pair (outer faces coincide, 600 mm combined wall).
//   Bedroom (5 × 3.5 m, 400 mm walls) north of it: Full-clash pair (the 200 mm wall lies inside the 400 mm one).
// Opening sizes come from instance parameters (openingSizeFromParameters, the app's stable resolver).
// The kitchen floor uses a generated tile image to exercise the texture path (data URL, no server image).
import { createArea, createHouseDocument, createWall, defaultFlooring } from "@shared/domain/house/defaults";
import { createId } from "@shared/domain/ids";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { AreableInstanceValue, WallableInstanceValue } from "@shared/domain/schemas/instances";
import type { CarpetValue } from "@shared/domain/schemas/carpet";
import type { LightValue } from "@shared/domain/schemas/light";
import { openingSizeFromParameters } from "@shared/domain/templates/openingSize";
import type { RectangleEdgeName } from "@shared/domain/schemas/shapes";
import type { SurfaceMaterialValue } from "@shared/domain/schemas/values";
import type { OpeningSizeResolver } from "@shared/geometry/realAllWallsTypes";

export type PlaygroundFixture = Readonly<{
  house: HouseDocument;
  floorId: string;
  openingSize: OpeningSizeResolver;
  imageUrl: (imageId: string) => string;
  areaIds: readonly string[];
}>;

type OpeningSpec = Readonly<{
  templateId: string;
  atMm: number;
  widthMm: number;
  heightMm: number;
  bottomMm: number;
  flip?: boolean;
}>;
type WallSpec = Readonly<{ edge: RectangleEdgeName; openings?: readonly OpeningSpec[] }>;

const tileImageId = "img_playtile01";

const material = (
  rgb: readonly [number, number, number],
  roughness: number,
  imageId?: string,
  tileMm = 1000,
): SurfaceMaterialValue => ({
  pbrMetallicRoughness: {
    ...(imageId === undefined ? {} : { baseColorTexture: { imageId } }),
    baseColorFactor: [rgb[0], rgb[1], rgb[2], 1],
    roughnessFactor: roughness,
    metallicFactor: 0,
  },
  extras: { homeplan: { tileSizeMm: { x: tileMm, y: tileMm }, rotationDeg: 0, offsetMm: { x: 0, y: 0 } } },
});

const exteriorStone = material([0.42, 0.42, 0.4], 0.9);

const opening = (spec: OpeningSpec): WallableInstanceValue => ({
  id: createId("o"),
  name: spec.templateId,
  templateId: spec.templateId,
  templateVersion: 1,
  parameters: { widthMm: spec.widthMm, heightMm: spec.heightMm },
  flip: { x: spec.flip === true, z: spec.flip === true },
  materialOverrides: {},
  placement: { distanceAlongWallMm: spec.atMm, bottomMm: spec.bottomMm },
});

const windowAt = (atMm: number): OpeningSpec => ({
  templateId: "window-style-1",
  atMm,
  widthMm: 1200,
  heightMm: 1000,
  bottomMm: 900,
});

const object = (
  templateId: string,
  attachment: AreableInstanceValue["attachment"],
  positionMm: Readonly<{ x: number; y: number }>,
  elevationMm: number,
  parameters: AreableInstanceValue["parameters"],
  materialOverrides: AreableInstanceValue["materialOverrides"] = {},
): AreableInstanceValue => ({
  id: createId("o"),
  name: templateId,
  templateId,
  templateVersion: 1,
  parameters,
  flip: { x: false, z: false },
  materialOverrides,
  attachment,
  positionMm,
  elevationMm,
  rotationDeg: 0,
});

const carpet = (
  name: string,
  positionMm: Readonly<{ x: number; y: number }>,
  rotationDeg: number,
  shape: CarpetValue["shapes"][number],
  color: readonly [number, number, number],
): CarpetValue => ({
  id: createId("c"),
  name,
  positionMm,
  rotationDeg,
  material: material(color, 0.95),
  shapes: [shape],
});

type LightSpec = Readonly<{
  name: string;
  type: LightValue["geometry"]["type"];
  fixture: string | null;
  positionMm: Readonly<{ x: number; y: number }>;
  elevationMm: number;
  rotationDeg?: number;
  lengthMm?: number;
  lumens: number;
  color: LightValue["defaults"]["color"];
  tiltDeg?: number;
}>;

const light = (spec: LightSpec): LightValue => ({
  id: createId("l"),
  name: spec.name,
  fixture: spec.fixture === null ? null : { templateId: spec.fixture, templateVersion: 1 },
  fixtureVisible: spec.fixture !== null,
  geometry: { type: spec.type, lengthMm: spec.lengthMm ?? 1000, widthMm: 30 },
  positionMm: spec.positionMm,
  elevationMm: spec.elevationMm,
  rotationDeg: spec.rotationDeg ?? 0,
  spot: { tiltDeg: spec.tiltDeg ?? 0, beamAngleDeg: 50, softEdge: 0.4 },
  renderCapabilities: { colorModes: ["fixedWhite", "colorTemperature", "rgb"] },
  defaults: { enabled: true, brightness: 1, outputLumens: spec.lumens, color: spec.color },
});

const rectangleRoom = (
  name: string,
  center: Readonly<{ x: number; y: number }>,
  size: Readonly<{ widthMm: number; depthMm: number }>,
  thicknessMm: number,
  flooring: SurfaceMaterialValue,
  interior: SurfaceMaterialValue,
  walls: readonly WallSpec[],
): AreaValue => {
  const area = createArea(name, center);
  const shapeId = createId("s");
  return {
    ...area,
    floor: {
      ...area.floor,
      material: flooring,
      shapes: [
        {
          id: shapeId,
          type: "rectangle",
          positionMm: { x: 0, y: 0 },
          rotationDeg: 0,
          widthMm: size.widthMm,
          heightMm: size.depthMm,
        },
      ],
    },
    walls: walls.map((spec) => ({
      ...createWall(shapeId, spec.edge),
      thicknessMm,
      materials: { interior, exterior: exteriorStone },
      objects: (spec.openings ?? []).map(opening),
    })),
  };
};

/** A small tile pattern as a PNG data URL (sRGB), standing in for a house image. */
const tileDataUrl = (): string => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context === null) return "";
  context.fillStyle = "#d9d4c7";
  context.fillRect(0, 0, 128, 128);
  context.fillStyle = "#b9b2a1";
  context.fillRect(0, 0, 64, 64);
  context.fillRect(64, 64, 64, 64);
  context.strokeStyle = "#8f887a";
  context.lineWidth = 2;
  context.strokeRect(1, 1, 126, 126);
  return canvas.toDataURL("image/png");
};

export const createPlaygroundFixture = (): PlaygroundFixture => {
  const house = createHouseDocument(createId("h"), "Viewport playground");
  const living = rectangleRoom(
    "Living",
    { x: 0, y: 0 },
    { widthMm: 5000, depthMm: 4000 },
    200,
    material([0.42, 0.24, 0.11], 0.55),
    material([0.86, 0.84, 0.8], 0.9),
    [
      { edge: "bottom", openings: [windowAt(3600)] },
      {
        edge: "right",
        openings: [
          windowAt(2700),
          { templateId: "door-interior", atMm: 900, widthMm: 850, heightMm: 2050, bottomMm: 0, flip: true },
        ],
      },
      { edge: "top" },
      { edge: "left" },
    ],
  );
  const kitchen = rectangleRoom(
    "Kitchen",
    { x: 5100, y: 0 },
    { widthMm: 4000, depthMm: 4000 },
    400,
    material([1, 1, 1], 0.6, tileImageId, 600),
    material([0.55, 0.7, 0.55], 0.85),
    [{ edge: "bottom" }, { edge: "right", openings: [windowAt(2000)] }, { edge: "top" }, { edge: "left" }],
  );
  const bedroom = rectangleRoom(
    "Bedroom",
    { x: 0, y: 4150 },
    { widthMm: 5000, depthMm: 3500 },
    400,
    defaultFlooring(),
    material([0.5, 0.62, 0.8], 0.85),
    [
      { edge: "bottom" },
      { edge: "right" },
      { edge: "top", openings: [windowAt(1500), windowAt(3500)] },
      { edge: "left" },
    ],
  );
  const southWall = living.walls.find((wall) => wall.sourceEdge.edge === "bottom");
  const furnishedLiving: AreaValue = {
    ...living,
    floor: {
      ...living.floor,
      carpets: [
        carpet(
          "Rug",
          { x: 300, y: 200 },
          10,
          {
            id: createId("s"),
            type: "rectangle",
            positionMm: { x: 0, y: 0 },
            rotationDeg: 0,
            widthMm: 2400,
            heightMm: 1600,
          },
          [0.45, 0.08, 0.06],
        ),
        carpet(
          "Round mat",
          { x: 1500, y: -900 },
          0,
          { id: createId("s"), type: "circle", positionMm: { x: 0, y: 0 }, radiusMm: 550 },
          [0.1, 0.2, 0.45],
        ),
      ],
    },
    objects: [
      object(
        "sofa-3-seat",
        { host: "floor" },
        { x: 300, y: 1450 },
        0,
        { widthMm: 2200 },
        { upholstery: material([0.12, 0.3, 0.2], 0.9) },
      ),
      ...(southWall === undefined
        ? []
        : [
            object(
              "tv-wall",
              { host: "wall", wallId: southWall.id, hostSide: "interior" },
              { x: 2300, y: 0 },
              1000,
              { widthMm: 1230, heightMm: 710 },
            ),
          ]),
    ],
    lights: [
      light({
        name: "Pendant",
        type: "point",
        fixture: "pendant-light",
        positionMm: { x: 300, y: 200 },
        elevationMm: 2500,
        lumens: 800,
        color: { mode: "colorTemperature", kelvin: 2700, rgb: [255, 255, 255] },
      }),
    ],
  };
  const litKitchen: AreaValue = {
    ...kitchen,
    lights: [
      light({
        name: "Spot",
        type: "spot",
        fixture: null,
        positionMm: { x: -800, y: 800 },
        elevationMm: 2400,
        rotationDeg: -45,
        tiltDeg: 35,
        lumens: 1500,
        color: { mode: "fixedWhite", kelvin: 3000, rgb: [255, 255, 255] },
      }),
    ],
  };
  const litBedroom: AreaValue = {
    ...bedroom,
    lights: [
      light({
        name: "Strip",
        type: "linear",
        fixture: "linear-strip",
        positionMm: { x: 0, y: 1300 },
        elevationMm: 2400,
        lengthMm: 2400,
        lumens: 1500,
        color: { mode: "rgb", kelvin: 3000, rgb: [120, 160, 255] },
      }),
    ],
  };
  const baseFloor = house.floors[0];
  if (baseFloor === undefined) throw new Error("createHouseDocument returned no floor");
  const floor = {
    ...baseFloor,
    areas: [furnishedLiving, litKitchen, litBedroom],
    guides: [
      {
        id: createId("gd"),
        kind: "line" as const,
        visible: true,
        aMm: { x: -2500, y: -3200 },
        bMm: { x: 2500, y: -3200 },
      },
      {
        id: createId("gd"),
        kind: "point" as const,
        visible: true,
        aMm: { x: 8200, y: 3500 },
        bMm: { x: 8200, y: 3500 },
      },
    ],
  };
  const image = tileDataUrl();
  return {
    house: { ...house, floors: [floor] },
    floorId: floor.id,
    openingSize: openingSizeFromParameters,
    imageUrl: () => image,
    areaIds: [living.id, kitchen.id, bedroom.id],
  };
};
