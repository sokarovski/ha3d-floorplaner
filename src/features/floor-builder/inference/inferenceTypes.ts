// The shared inference engine's vocabulary (spec/builder/screens/floor-builder.md#inference-and-snapping).
import type { PlanPoint3 } from "../../../renderer/runtimeTypes";
import type { Vec2 } from "@shared/geometry/vector";

/** Cue colors as in SketchUp: plan x red, plan y green, vertical/height blue, edge-related magenta. */
export type CueColor = "axisX" | "axisY" | "vertical" | "edge";

export type InferenceKind =
  | "endpoint"
  | "midpoint"
  | "intersection"
  | "onEdge"
  | "guide"
  | "axis"
  | "parallel"
  | "perpendicular"
  | "extension"
  | "alignment"
  | "height"
  | "center"
  | "quadrant";

/** A dotted inference line from its source to the snapped point. */
export type CueLine = Readonly<{ from: PlanPoint3; to: PlanPoint3; color: CueColor }>;

/** What the viewport draws for an inference: dotted lines, a marker, and a short label. */
export type InferenceCue = Readonly<{
  lines: readonly CueLine[];
  marker: PlanPoint3 | null;
  label: string;
}>;

export type PointInference = Readonly<{ point: Vec2; kind: InferenceKind; cue: InferenceCue }>;

/** A straight piece of floor geometry (shape edge, wall face, or guide) in floor coordinates. */
export type SceneSegment = Readonly<{
  a: Vec2;
  b: Vec2;
  /** Unit direction a → b. */
  direction: Vec2;
  lengthMm: number;
  /** Curved-shape facets take part in on-edge snapping only (no midpoints or extensions). */
  straight: boolean;
}>;

export type SceneHeight = Readonly<{
  heightMm: number;
  wallId: string;
  areaId: string;
  /** "Wall (bottom)" etc., for the cue label. */
  wallLabel: string;
  /** A point on the wall's top line (floor mm), the cue's source. */
  at: Vec2;
}>;

/** A labelled snap point that is not a vertex: a shape's centre or a circle's quadrant point. */
export type NamedPoint = Readonly<{ point: Vec2; kind: "center" | "quadrant"; label: string }>;

/** Everything on the active floor that can be inferred from, in floor coordinates. */
export type InferenceScene = Readonly<{
  vertices: readonly Vec2[];
  segments: readonly SceneSegment[];
  /** Guide lines are infinite. */
  guideLines: readonly SceneSegment[];
  guidePoints: readonly Vec2[];
  /** Shape centres and circle quadrants (Phase 4.2): snap targets with their own labels. */
  namedPoints: readonly NamedPoint[];
  heights: readonly SceneHeight[];
}>;
