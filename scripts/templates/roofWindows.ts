// Roof windows family (Phase 19.3, spec/builder/features/object-templates.md#roof-windows): Wallables hosted by a
// roof face. Template frame: x across the slope (level), y up the slope from the window's lower edge, z through the
// roof (+z out of the roof, toward the sky). The middle depth band is the lining through the slab and fits the
// roof's thickness across the slope (fitHostDepth); the end band is the frame and glass above the roof's top. The
// pitch limits (`roofWindow`) are copied into each placed window, so a window on a slope outside them is an issue.
import { boxes, glass, rectFrame, white, wallableBase } from "./helpers";
import type { MaterialSpec, TemplateSpec } from "./helpers";

/** Anthracite aluminium cladding (frame and curb). */
const cladding: MaterialSpec = { color: [0.2, 0.21, 0.23], roughness: 0.45, metallic: 0.5 };
/** Pale timber lining inside the roof. */
const lining: MaterialSpec = { color: [0.82, 0.74, 0.6], roughness: 0.6 };

const roofBase: typeof wallableBase & Pick<TemplateSpec["metadata"], "category"> = {
  ...wallableBase,
  attachment: { hosts: ["roof"], contact: "back" },
  category: "Windows",
};

/** A centre-pivot roof window for pitched roofs (15–90°), 780 × 1180 mm by default. */
const roofWindow: TemplateSpec = {
  id: "roof-window",
  view: "front",
  hostDepthMm: 200,
  metadata: {
    ...roofBase,
    kind: "roofWindow",
    label: "Roof window",
    tags: ["skylight", "roof"],
    resize: {
      x: { mode: "slice", startMm: 70, endMm: 70, minMm: 450, maxMm: 1400, defaultMm: 780 },
      y: { mode: "slice", startMm: 70, endMm: 70, minMm: 600, maxMm: 1800, defaultMm: 1180 },
      // The lining (−100…100) fits the roof; the 90 mm frame above the top stays.
      z: { mode: "fitHostDepth", startMm: 0, endMm: 90 },
    },
    flip: { x: false, z: false },
    materialSlots: { frame: "Frame", lining: "Lining", glass: "Glass" },
    roofWindow: { minPitchDeg: 15, maxPitchDeg: 90 },
  },
  materials: { Frame: cladding, Lining: lining, Glass: glass },
  parts: [
    { name: "Lining", material: "Lining", build: rectFrame(-390, 390, 0, 1180, 40, 40, 40, -100, 100) },
    { name: "Frame", material: "Frame", build: rectFrame(-390, 390, 0, 1180, 70, 70, 70, 100, 190) },
    {
      name: "Glass",
      material: "Glass",
      rule: { stretch: { x: true, y: true } },
      build: boxes([
        [-320, 70, 160],
        [320, 1110, 172],
      ]),
    },
  ],
};

/** A fixed skylight on a raised curb for flat and low roofs (0–15°), 1000 × 1000 mm by default. */
const flatSkylight: TemplateSpec = {
  id: "skylight-flat",
  view: "front",
  hostDepthMm: 200,
  metadata: {
    ...roofBase,
    kind: "roofWindow",
    label: "Flat-roof skylight",
    tags: ["skylight", "roof", "flat"],
    resize: {
      x: { mode: "slice", startMm: 90, endMm: 90, minMm: 500, maxMm: 2400, defaultMm: 1000 },
      y: { mode: "slice", startMm: 90, endMm: 90, minMm: 500, maxMm: 2400, defaultMm: 1000 },
      // The lining fits the roof; the 250 mm curb and glazing above the top stay.
      z: { mode: "fitHostDepth", startMm: 0, endMm: 250 },
    },
    flip: { x: false, z: false },
    materialSlots: { frame: "Frame", lining: "Lining", glass: "Glass" },
    roofWindow: { minPitchDeg: 0, maxPitchDeg: 15 },
  },
  materials: { Frame: white, Lining: lining, Glass: glass },
  parts: [
    { name: "Lining", material: "Lining", build: rectFrame(-500, 500, 0, 1000, 40, 40, 40, -100, 100) },
    { name: "Curb", material: "Frame", build: rectFrame(-500, 500, 0, 1000, 90, 90, 90, 100, 330) },
    {
      name: "Glass",
      material: "Glass",
      rule: { stretch: { x: true, y: true } },
      build: boxes([
        [-410, 90, 330],
        [410, 910, 350],
      ]),
    },
  ],
};

export const templates: readonly TemplateSpec[] = [roofWindow, flatSkylight];
