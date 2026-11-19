// Fixture objects and schemas for the /ds property-panel playground and forms page.
import { Light } from "@shared/domain/schemas/light";
import type { LightValue } from "@shared/domain/schemas/light";
import { WallableInstance } from "@shared/domain/schemas/instances";
import type { WallableInstanceValue } from "@shared/domain/schemas/instances";
import { Wall } from "@shared/domain/schemas/wall";
import type { WallValue } from "@shared/domain/schemas/wall";
import { Roof } from "@shared/domain/schemas/roof";
import type { RoofValue } from "@shared/domain/schemas/roof";
import { Length } from "@shared/domain/schemas/values";
import type { SurfaceMaterialValue } from "@shared/domain/schemas/values";
import { withTemplateParameters } from "@shared/domain/templates/instanceSchema";
import { builtInPresets, createWall, defaultCapMaterial } from "@shared/domain/house/defaults";

export const fixtureWall: WallValue = createWall("s_fixture001", "bottom");

export const fixtureLight: LightValue = {
  id: "l_fixture001",
  name: "Pendant Light 1",
  fixture: null,
  fixtureVisible: true,
  geometry: { type: "spot", lengthMm: 1000, widthMm: 12 },
  positionMm: { x: 1200, y: 800 },
  elevationMm: 2300,
  rotationDeg: 0,
  spot: { tiltDeg: 0, beamAngleDeg: 40, softEdge: 0.3 },
  renderCapabilities: { colorModes: ["fixedWhite", "colorTemperature", "rgb"] },
  defaults: {
    enabled: true,
    brightness: 1,
    outputLumens: 800,
    color: { mode: "colorTemperature", kelvin: 3000, rgb: [255, 255, 255] },
  },
};

export const fixtureWindow: WallableInstanceValue = {
  id: "o_fixture001",
  name: "Window Style 1 1",
  templateId: "window-style-1",
  templateVersion: 1,
  placement: { distanceAlongWallMm: 1600, bottomMm: 900 },
  parameters: { widthMm: 1200, heightMm: 1000 },
  flip: { x: false, z: false },
  materialOverrides: {},
};

export const fixtureWindowSchema = withTemplateParameters(
  { ...WallableInstance },
  {
    parameterProperties: {
      widthMm: Length({ title: "Width", minimum: 400, maximum: 3000, order: 1 }),
      heightMm: Length({ title: "Height", minimum: 400, maximum: 2400, order: 2 }),
    },
    required: ["widthMm", "heightMm"],
  },
);

export const panelFixtures = [
  { id: "wall", label: "Wall", schema: Wall, value: fixtureWall },
  { id: "light", label: "Light", schema: Light, value: fixtureLight },
  { id: "window", label: "Window (template)", schema: fixtureWindowSchema, value: fixtureWindow },
] as const;

const fixturePreset = (id: string): SurfaceMaterialValue => {
  const preset = builtInPresets.find((candidate) => candidate.id === id);
  return preset === undefined ? defaultCapMaterial() : structuredClone(preset.material);
};

/** A flat 6 × 4 m roof with the three stacked materials of Phase 19.7 (Top, Underside, Sides). */
export const fixtureRoof: RoofValue = {
  id: "rf_fixture001",
  name: "Roof",
  design: "closed",
  cutsWalls: true,
  wallsRise: true,
  eaveHeightMm: 2600,
  thicknessMm: 120,
  topMaterial: fixturePreset("builtin_terracotta"),
  bottomMaterial: fixturePreset("builtin_ashplanks"),
  sideMaterial: fixturePreset("builtin_capwhite"),
  ribHeightMm: 40,
  ribWidthMm: 40,
  ribSpacingMm: 600,
  ribMaterial: "wood",
  points: [
    { id: "rp_fixture001", x: 0, y: 0, heightMm: 0 },
    { id: "rp_fixture002", x: 6000, y: 0, heightMm: 0 },
    { id: "rp_fixture003", x: 6000, y: 4000, heightMm: 0 },
    { id: "rp_fixture004", x: 0, y: 4000, heightMm: 0 },
  ],
  outline: ["rp_fixture001", "rp_fixture002", "rp_fixture003", "rp_fixture004"],
  lines: [],
};

/** Panels with stacked composite sections (Phase 19.7): a roof's three materials, a wall's two. */
export const sectionFixtures = [
  { id: "roof", label: "Roof", schema: Roof, value: fixtureRoof },
  { id: "wall", label: "Wall", schema: Wall, value: fixtureWall },
] as const;
