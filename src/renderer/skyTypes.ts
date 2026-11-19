// Plain data of the sky portals (Phase 15.5), apart from instanceLayer.ts so pure modules and the Node checks
// can use them without the DOM.
import type { Object3D } from "three";
import type { TemplatePoseWeight } from "@shared/geometry/templateResize";

/** One clear glass part of an opening: its box in the instance root's contact frame (metres) and transmission. */
export type SkyGlassPane = Readonly<{
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  transmission: number;
}>;

/** A Wallable opening with clear glass; +z of `root` (contact frame) points into its host area. */
export type SkyOpening = Readonly<{
  id: string;
  areaId: string;
  root: Object3D;
  panes: readonly SkyGlassPane[];
  /** The parameter sets it is drawn with (pose blend, else its own), template defaults merged in. */
  parameterSets: readonly TemplatePoseWeight[];
}>;

export type SkyOpenings = Readonly<{ version: number; openings: readonly SkyOpening[] }>;
