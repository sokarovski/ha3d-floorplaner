// Baseline lighting: a hemisphere fill plus one directional "sun" with PCF shadows fitted to the floor.
// Artificial lights live in lightsLayer.ts; the house-environment sun direction is set by the host.
//
// Exposure policy (preview convention): daylight d = sun intensity / default intensity (0..1). Sun and sky
// are multiplied by the gain g = 1 + (G − 1)·d and the tone-mapping exposure is 1/g, so the daylit scene
// looks the same at any d and any G, while artificial lights (fixed photometric scale) appear G× weaker at
// full daylight than at night. At night (d = 0) the sky drops to a faint ambient and lamps carry the scene.
// G was 10 (physically plausible: lamps nearly invisible by day); Phase 14.2 (owner, 2026-11-18: switching a
// lamp by day made no visible difference) lowered it to 3, so a lamp by day is about 3.3× more visible than
// before and still clearly weaker than at night. Night and the daylit look are unchanged by G.
//
// Tone mapping (Phase 8.9): AgX in the builder, the template preview, PNG exports, and the HA viewer (before:
// ACES in the builder, Neutral in the viewer). At exposure 1 AgX puts middle grey (0.18) where ACES did
// (sRGB ≈ 0.50), so daylit scenes keep their mid-tones, but it rolls highlights off over about 6.5 stops
// instead of clipping: a lamp pool of radiance 1.5 / 2.8 / 5 shows 0.85 / 0.91 / 0.95 (ACES 0.93 / 0.97 / 0.99,
// Neutral 0.97 / 0.99 / 0.99) and desaturates towards white like film, where ACES pushed warm light to
// orange. AgX also lifts the deep shadows (radiance 0.02: 0.14 vs ACES 0.08), so the night ambient fell from
// 0.3 to 0.12: an unlit floor at night stays about where it was (sRGB ≈ 0.16).
import { AgXToneMapping, DirectionalLight, Group, HemisphereLight, Vector3 } from "three";
import type { FloorBounds } from "./floorTypes";
import { planToWorld } from "./planFrame";
import type { SunSettings } from "./runtimeTypes";

export type Lighting = Readonly<{
  root: Group;
  setSun: (sun: SunSettings) => void;
  /** Tone-mapping exposure for the current daylight (see the exposure policy above). */
  exposure: () => number;
  /** Daylight d (0 at night .. 1 in full daylight) of the current sun; see the exposure policy above. */
  daylight: () => number;
  /**
   * Strength for fixed environment reflections (mirrors): 1 in full daylight, falling with the sky fill so a
   * reflection keeps its ratio to the ambient light (about 0.02 at night, where the exposure is G× higher).
   */
  reflectionScale: () => number;
  /** The configured sun (not the exposure-scaled intensity): world direction toward the sun and intensity. */
  sunState: () => Readonly<{ directionWorld: [number, number, number]; intensity: number }>;
  fit: (bounds: FloorBounds | null) => void;
  dispose: () => void;
}>;

/** Default sun: from the south-east (−y is south when north is +y), about 50° above the horizon. */
export const defaultSun: SunSettings = { directionPlan: { x: 0.45, y: -0.45, h: 0.77 }, intensity: 2.4 };

/** Daylight sun intensity; it fades linearly from 6° elevation to the horizon and is off below it. */
const daylightIntensity = 2.4;

/** The viewport sun for a solar position (builder and HA viewer share this rule). */
export const sunSettingsFromPosition = (
  directionPlan: Readonly<{ x: number; y: number; h: number }>,
  elevationDeg: number,
): SunSettings => {
  const factor = elevationDeg >= 6 ? 1 : elevationDeg <= 0 ? 0 : elevationDeg / 6;
  return { directionPlan, intensity: daylightIntensity * factor };
};

/** The tone mapping of every preview renderer (builder, template preview, HA viewer); see the header. */
export const previewToneMapping = AgXToneMapping;

/** The hemisphere sky fill in full daylight (before the gain g) and its sky/ground colours (sRGB hex). */
export const dayAmbient = 2.1;
export const skyFillColors = { sky: 0xe8eef7, ground: 0x9a9184 } as const;
const nightAmbient = 0.12;
/** G in the exposure policy above (Phase 14.2: 3, was 10). */
const daylightGain = 3;

export const createLighting = (): Lighting => {
  const root = new Group();
  root.name = "lighting";
  const hemisphere = new HemisphereLight(skyFillColors.sky, skyFillColors.ground, dayAmbient);
  const sun = new DirectionalLight(0xfff6e8, defaultSun.intensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  root.add(hemisphere, sun, sun.target);

  let direction = new Vector3();
  let gain = 1;
  let daylightShare = 1;
  let center = new Vector3();
  let radius = 10;

  const place = (): void => {
    const distance = radius * 3 + 10;
    sun.target.position.copy(center);
    sun.position.copy(center).addScaledVector(direction, distance);
    const camera = sun.shadow.camera;
    camera.left = -radius;
    camera.right = radius;
    camera.top = radius;
    camera.bottom = -radius;
    camera.near = 0.1;
    camera.far = distance + radius * 2;
    camera.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
  };

  const setSun = (settings: SunSettings): void => {
    const next = planToWorld(settings.directionPlan);
    direction = next.lengthSq() > 0 ? next.normalize() : planToWorld(defaultSun.directionPlan).normalize();
    sun.intensity = Math.max(settings.intensity, 0);
    sun.visible = settings.directionPlan.h > -0.05 && sun.intensity > 0;
    // The sky fill follows the sun: full at the default intensity, a faint night ambient at 0.
    const daylight = Math.min(1, sun.visible ? sun.intensity / defaultSun.intensity : 0);
    daylightShare = daylight;
    gain = 1 + (daylightGain - 1) * daylight;
    hemisphere.intensity = (nightAmbient + (dayAmbient - nightAmbient) * daylight) * gain;
    sun.intensity *= gain;
    place();
  };
  setSun(defaultSun);

  return {
    root,
    setSun,
    exposure: () => 1 / gain,
    daylight: () => daylightShare,
    reflectionScale: () => hemisphere.intensity / (dayAmbient * daylightGain),
    sunState: () => ({
      directionWorld: [direction.x, direction.y, direction.z],
      intensity: sun.visible ? sun.intensity / gain : 0,
    }),
    fit: (bounds) => {
      if (bounds === null) {
        center = new Vector3();
        radius = 10;
      } else {
        center = planToWorld({
          x: (bounds.minX + bounds.maxX) / 2,
          y: (bounds.minY + bounds.maxY) / 2,
          h: 0,
        });
        radius = Math.max(
          Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxHeightMm) / 2000 + 1,
          3,
        );
      }
      place();
    },
    dispose: () => {
      sun.shadow.dispose();
      sun.dispose();
      hemisphere.dispose();
      root.removeFromParent();
    },
  };
};
