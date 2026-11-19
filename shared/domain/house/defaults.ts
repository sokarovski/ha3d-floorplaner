// Built-in material presets and factories for new documents and entities.
import { createId } from "../ids";
import { builtInImages, builtInTexturedMaterial } from "./builtinMaterials";
import type { AreaValue } from "../schemas/area";
import { defaultSlabThicknessMm } from "../schemas/floor";
import type { BuildingFloorValue } from "../schemas/floor";
import { currentHouseSchemaVersion } from "../schemas/house";
import type { HouseDocument } from "../schemas/house";
import type { SurfaceMaterialValue } from "../schemas/values";
import type { WallValue } from "../schemas/wall";

const plainMaterial = (rgb: readonly [number, number, number], roughness: number): SurfaceMaterialValue => ({
  pbrMetallicRoughness: {
    baseColorFactor: [rgb[0], rgb[1], rgb[2], 1],
    roughnessFactor: roughness,
    metallicFactor: 0,
  },
  extras: { homeplan: { tileSizeMm: { x: 1000, y: 1000 }, rotationDeg: 0, offsetMm: { x: 0, y: 0 } } },
});

export type BuiltInPreset = Readonly<{ id: string; name: string; material: SurfaceMaterialValue }>;

/**
 * Read-only built-in presets (D19). Their IDs use the reserved "builtin_" prefix. The plain colours come first,
 * then the built-in textured materials (Phase 17.1), whose images ship with the app (./builtinMaterials).
 */
export const builtInPresets: readonly BuiltInPreset[] = [
  { id: "builtin_capwhite", name: "Plain white (cap)", material: plainMaterial([1, 1, 1], 0.9) },
  { id: "builtin_flooring", name: "Default flooring", material: plainMaterial([0.78, 0.66, 0.5], 0.7) },
  { id: "builtin_wallpaint", name: "Default wall paint", material: plainMaterial([0.94, 0.93, 0.9], 0.9) },
  { id: "builtin_concrete", name: "Concrete", material: plainMaterial([0.62, 0.62, 0.6], 0.95) },
  { id: "builtin_darkwood", name: "Dark wood", material: plainMaterial([0.35, 0.22, 0.13], 0.6) },
  ...builtInImages.map((texture) => ({
    id: texture.presetId,
    name: texture.presetName,
    material: builtInTexturedMaterial(texture),
  })),
];

const presetMaterial = (id: string): SurfaceMaterialValue => {
  const preset = builtInPresets.find((candidate) => candidate.id === id);
  if (preset === undefined) throw new Error(`Unknown built-in preset ${id}`);
  return structuredClone(preset.material);
};

export const defaultCapMaterial = (): SurfaceMaterialValue => presetMaterial("builtin_capwhite");
export const defaultFlooring = (): SurfaceMaterialValue => presetMaterial("builtin_flooring");
export const defaultWallPaint = (): SurfaceMaterialValue => presetMaterial("builtin_wallpaint");
/** A floor's slab material when it sets none (Phase 16): the built-in Concrete. */
export const defaultSlabMaterial = (): SurfaceMaterialValue => presetMaterial("builtin_concrete");

/** A new floor at the house's zero with the default slab; `elevationMm` places it (addFloorCommand). */
export const createFloor = (name: string, elevationMm = 0): BuildingFloorValue => ({
  id: createId("f"),
  name,
  positionMm: { x: 0, y: 0 },
  elevationMm,
  slabThicknessMm: defaultSlabThicknessMm,
  slabMaterial: defaultSlabMaterial(),
  areas: [],
  lightGroups: [],
  guides: [],
});

export const createHouseDocument = (id: string, name: string): HouseDocument => ({
  schemaVersion: currentHouseSchemaVersion,
  revision: 0,
  id,
  name,
  units: "mm",
  capMaterial: defaultCapMaterial(),
  environment: {
    location: {
      latitudeDeg: 51.5074,
      longitudeDeg: -0.1278,
      timeZone: "Europe/London",
    },
    northRotationDeg: 0,
    sun: { timeMode: "fixed", fixedLocalDateTime: "2020-06-01T12:00:00" },
  },
  materialPresets: [],
  floors: [createFloor("Etage1")],
});

export const createArea = (name: string, positionMm: { x: number; y: number }): AreaValue => ({
  id: createId("a"),
  name,
  positionMm,
  rotationDeg: 0,
  floor: { id: createId("fs"), material: defaultFlooring(), shapes: [], carpets: [] },
  walls: [],
  objects: [],
  lights: [],
});

/** Wall height when the house sets no default (owner, Phase 4.4). */
export const fallbackWallHeightMm = 2400;

/** The height new walls start at in this house: its default wall height, else 2400 mm. */
export const effectiveWallHeightMm = (house: Pick<HouseDocument, "defaultWallHeightMm">): number =>
  house.defaultWallHeightMm ?? fallbackWallHeightMm;

/** A wall covering its whole source edge, both ends attached to the corners (D04). */
export const createWall = (shapeId: string, edge: string, heightMm = fallbackWallHeightMm): WallValue => ({
  id: createId("w"),
  sourceEdge: { shapeId, edge },
  spanMm: { start: { anchor: "start", offsetMm: 0 }, end: { anchor: "end", offsetMm: 0 } },
  heightMm,
  thicknessMm: 200,
  alignment: "outside",
  materials: { interior: defaultWallPaint(), exterior: defaultWallPaint() },
  objects: [],
});
