// Openings family: windows and doors (Wallable).
import type { AxisPin, NodeRule, PivotAxis, RotateRule } from "@shared/domain/templates/metadata";
import {
  box,
  boxes,
  cylinder,
  darkWood,
  glass,
  metal,
  prism,
  rectFrame,
  wallableBase,
  white,
} from "./helpers";
import type { Geo, MaterialSpec, PartSpec, TemplateSpec } from "./helpers";

const windowStyle1: TemplateSpec = {
  id: "window-style-1",
  view: "front",
  hostDepthMm: 200,
  metadata: {
    ...wallableBase,
    kind: "window",
    label: "Window Style 1",
    attachment: { ...wallableBase.attachment, defaultPlacement: { bottomMm: 900 } },
    resize: {
      x: { mode: "slice", startMm: 60, endMm: 60, minMm: 400, maxMm: 3000, defaultMm: 1200 },
      y: { mode: "slice", startMm: 60, endMm: 60, minMm: 400, maxMm: 2400, defaultMm: 1000 },
      z: { mode: "fixed", wallPosition: "center" },
    },
    flip: { x: true, z: false },
    materialSlots: { frame: "Frame", glass: "Glass" },
  },
  materials: { Frame: white, Glass: glass },
  parts: [
    { name: "Frame", material: "Frame", build: rectFrame(-600, 600, 0, 1000, 60, 60, 60, -40, 40) },
    {
      name: "Mullion",
      material: "Frame",
      rule: { pin: { x: "center" }, stretch: { y: true } },
      build: boxes([
        [-20, 60, -30],
        [20, 940, 30],
      ]),
    },
    {
      name: "Glass",
      material: "Glass",
      rule: { stretch: { x: true, y: true } },
      build: boxes([
        [-540, 60, -4],
        [540, 940, 4],
      ]),
    },
  ],
};

const windowFixedWide: TemplateSpec = {
  id: "window-fixed-wide",
  view: "front",
  hostDepthMm: 200,
  metadata: {
    ...wallableBase,
    kind: "window",
    label: "Picture Window",
    attachment: { ...wallableBase.attachment, defaultPlacement: { bottomMm: 600 } },
    resize: {
      x: { mode: "slice", startMm: 50, endMm: 50, minMm: 600, maxMm: 4000, defaultMm: 2000 },
      y: { mode: "slice", startMm: 50, endMm: 50, minMm: 400, maxMm: 2400, defaultMm: 1200 },
      z: { mode: "fixed", wallPosition: "center" },
    },
    flip: { x: false, z: false },
    materialSlots: { frame: "Frame", glass: "Glass" },
  },
  materials: { Frame: { color: [0.08, 0.08, 0.09], roughness: 0.5 }, Glass: glass },
  parts: [
    { name: "Frame", material: "Frame", build: rectFrame(-1000, 1000, 0, 1200, 50, 50, 50, -35, 35) },
    {
      name: "Glass",
      material: "Glass",
      rule: { stretch: { x: true, y: true } },
      build: boxes([
        [-950, 50, -4],
        [950, 1150, 4],
      ]),
    },
  ],
};

/** Lever handle on a door face: rose and spindle along z from `face`, lever toward the hinge (−x). */
const leverHandle =
  (x: number, y: number, face: number, direction: 1 | -1) =>
  (g: Geo): void => {
    const z0 = face;
    const z1 = face + direction * 10;
    const z2 = face + direction * 45;
    const z3 = face + direction * 60;
    cylinder(g, [x, y], Math.min(z0, z1), Math.max(z0, z1), 26, "z");
    cylinder(g, [x, y], Math.min(z1, z2), Math.max(z1, z2), 9, "z");
    box(g, [x - 130, y - 10, Math.min(z2, z3)], [x + 10, y + 10, Math.max(z2, z3)]);
  };

const hinge =
  (x: number, y0: number, y1: number, z: number) =>
  (g: Geo): void =>
    cylinder(g, [x, z], y0, y1, 8);

const doorInterior: TemplateSpec = {
  id: "door-interior",
  view: "front",
  hostDepthMm: 100,
  metadata: {
    ...wallableBase,
    kind: "door",
    label: "Interior Door",
    attachment: { ...wallableBase.attachment, defaultPlacement: { bottomMm: 0 } },
    resize: {
      x: { mode: "slice", startMm: 30, endMm: 30, minMm: 700, maxMm: 1200, defaultMm: 850 },
      y: { mode: "slice", startMm: 0, endMm: 30, minMm: 1900, maxMm: 2400, defaultMm: 2050 },
      // Middle band z −50..50 is the lining; the 60 mm end band holds the interior handle.
      z: { mode: "fitHostDepth", startMm: 0, endMm: 60 },
    },
    flip: { x: true, z: true },
    materialSlots: { frame: "Lining", leaf: "Leaf", hardware: "Metal" },
  },
  materials: { Lining: white, Leaf: { color: [0.78, 0.74, 0.66], roughness: 0.45 }, Metal: metal },
  parts: [
    {
      name: "Lining",
      material: "Lining",
      build: boxes(
        [
          [-425, 0, -50],
          [-395, 2050, 50],
        ],
        [
          [395, 0, -50],
          [425, 2050, 50],
        ],
        [
          [-395, 2020, -50],
          [395, 2050, 50],
        ],
      ),
    },
    {
      name: "Leaf",
      material: "Leaf",
      rule: { stretch: { x: true, y: true }, pin: { z: "end" } },
      build: boxes([
        [-393, 6, 10],
        [393, 2017, 50],
      ]),
    },
    {
      name: "HandleFront",
      material: "Metal",
      rule: { pin: { x: "end", y: "start", z: "end" } },
      build: leverHandle(330, 1000, 50, 1),
    },
    {
      name: "HandleBack",
      material: "Metal",
      rule: { pin: { x: "end", y: "start", z: "end" } },
      build: leverHandle(330, 1000, 10, -1),
    },
    {
      name: "HingeLower",
      material: "Metal",
      rule: { pin: { x: "start", y: "start", z: "end" } },
      build: hinge(-395, 200, 300, 46),
    },
    {
      name: "HingeUpper",
      material: "Metal",
      rule: { pin: { x: "start", y: "end", z: "end" } },
      build: hinge(-395, 1750, 1850, 46),
    },
  ],
};

const doorEntrance: TemplateSpec = {
  id: "door-entrance",
  view: "front",
  hostDepthMm: 300,
  metadata: {
    ...wallableBase,
    kind: "door",
    label: "Entrance Door",
    attachment: { ...wallableBase.attachment, defaultPlacement: { bottomMm: 0 } },
    resize: {
      x: { mode: "slice", startMm: 60, endMm: 60, minMm: 900, maxMm: 1400, defaultMm: 1000 },
      y: { mode: "slice", startMm: 20, endMm: 60, minMm: 2000, maxMm: 2400, defaultMm: 2100 },
      // Middle band z −60..60 is the frame; the pull bar and the lever sit in the 10 and 60 mm bands.
      z: { mode: "fitHostDepth", startMm: 10, endMm: 60 },
    },
    flip: { x: true, z: true },
    materialSlots: { frame: "Frame", leaf: "Leaf", hardware: "Metal", glass: "Glass" },
  },
  materials: {
    Frame: { color: [0.12, 0.12, 0.13], roughness: 0.5 },
    Leaf: darkWood,
    Metal: { ...metal, roughness: 0.2 },
    Glass: glass,
  },
  parts: [
    {
      name: "Frame",
      material: "Frame",
      build: boxes(
        [
          [-500, 0, -60],
          [-440, 2100, 60],
        ],
        [
          [440, 0, -60],
          [500, 2100, 60],
        ],
        [
          [-440, 2040, -60],
          [440, 2100, 60],
        ],
      ),
    },
    {
      name: "Threshold",
      material: "Metal",
      build: boxes([
        [-440, 0, -60],
        [440, 20, 60],
      ]),
    },
    {
      name: "Leaf",
      material: "Leaf",
      rule: { stretch: { x: true, y: true }, pin: { z: "end" } },
      build: boxes([
        [-437, 22, -8],
        [437, 2037, 60],
      ]),
    },
    {
      name: "VisionPanel",
      material: "Glass",
      rule: { pin: { x: "start", z: "end" }, stretch: { y: true } },
      build: boxes([
        [-330, 400, -10],
        [-230, 1800, 62],
      ]),
    },
    {
      name: "HandleFront",
      material: "Metal",
      rule: { pin: { x: "end", y: "start", z: "end" } },
      build: leverHandle(370, 1050, 60, 1),
    },
    {
      name: "PullBar",
      material: "Metal",
      rule: { pin: { x: "end", y: "start", z: "end" } },
      build: (g) => {
        cylinder(g, [370, -55], 700, 1500, 15);
        cylinder(g, [370, 760], -55, -8, 8, "z");
        cylinder(g, [370, 1440], -55, -8, 8, "z");
      },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Phase 9.6: parametric windows and doors with states (D26). The four templates above keep their output;
// everything below is new. Conventions of these templates:
// - +z is the room side. Frames are unruled, so they follow the x/y slices vertex by vertex; their depth
//   (z −50..50) is the fitHostDepth middle band, so they line the whole wall reveal. Handles and blinds sit
//   in the room-side end band.
// - Sashes and leaves are ruled parts pinned to the room face (`pin z end`). They swing about a hinge line
//   (`rotate` about y, pivot on the template's bounds) or tilt about their bottom edge (`rotate` about x).
//   A part has one rotation, so a sash that both tilts and swings is drawn twice (one copy per posture,
//   the other hidden).
// - Blind slats are formula-counted repeats hanging from the blind rail at a fixed pitch. The copies are
//   rigid and their centres follow the y slice, so the authored step is the pitch divided by the middle
//   band's scale (`slatStep`); the count fills the glass height (`slatCount`). With the window closed,
//   slats tilt per copy about their own long axis (`blindsClosed` → 80°). A sash-mounted blind that moves
//   with an open sash cannot also tilt per copy (one rotation per part), so it has pre-tilted open and
//   closed copies that turn with the sash.

type Span = readonly [number, number];

/** Joins boolean formulas with `&&`; `"true"` terms drop out. */
const all = (...terms: readonly string[]): string => {
  const list = terms.filter((term) => term !== "" && term !== "true");
  if (list.length === 0) return "true";
  if (list.length === 1) return list[0] ?? "true";
  return list.map((term) => `(${term})`).join(" && ");
};

/** Merges node rules; `pin`, `stretch`, `size`, and `translate` merge per axis. */
const rule = (...rules: readonly NodeRule[]): NodeRule => {
  let out: NodeRule = {};
  for (const next of rules) {
    out = {
      ...out,
      ...next,
      ...(out.pin === undefined && next.pin === undefined ? {} : { pin: { ...out.pin, ...next.pin } }),
      ...(out.stretch === undefined && next.stretch === undefined
        ? {}
        : { stretch: { ...out.stretch, ...next.stretch } }),
      ...(out.size === undefined && next.size === undefined ? {} : { size: { ...out.size, ...next.size } }),
      ...(out.translate === undefined && next.translate === undefined
        ? {}
        : { translate: { ...out.translate, ...next.translate } }),
    };
  }
  return out;
};

/** `visible` only when it is not always true. */
const shownWhen = (formula: string): NodeRule => (formula === "true" ? {} : { visible: formula });

const roomFace: NodeRule = { pin: { z: "end" } };

/** A blind slat along x (depth along z, thickness along y), turned `angleDeg` about its own long axis. */
const slat =
  (x0: number, x1: number, yc: number, zc: number, depth: number, thickness: number, angleDeg: number) =>
  (g: Geo): void => {
    const radians = (angleDeg * Math.PI) / 180;
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    const corners = (
      [
        [-depth / 2, -thickness / 2],
        [depth / 2, -thickness / 2],
        [depth / 2, thickness / 2],
        [-depth / 2, thickness / 2],
      ] as const
    ).map(([dz, dy]): [number, number] => [zc + dy * s + dz * c, yc + dy * c - dz * s]);
    prism(g, corners, "z", "y", "x", x0, x1);
  };

/** A roll along x: an octagonal prism of radius `r` around (y, z). */
const roll =
  (x0: number, x1: number, y: number, z: number, r: number) =>
  (g: Geo): void => {
    const corners: [number, number][] = [];
    for (let i = 0; i < 8; i += 1) {
      const angle = ((i + 0.5) / 8) * 2 * Math.PI;
      corners.push([z + r * Math.cos(angle), y + r * Math.sin(angle)]);
    }
    prism(g, corners, "z", "y", "x", x0, x1);
  };

/** Window handle on a sash face at `z`: rose, neck, and a lever pointing down. Reaches z + 30. */
const windowHandle =
  (cx: number, cy: number, z: number) =>
  (g: Geo): void => {
    box(g, [cx - 16, cy - 36, z], [cx + 16, cy + 36, z + 8]);
    cylinder(g, [cx, cy], z + 8, z + 16, 7, "z");
    box(g, [cx - 9, cy - 120, z + 16], [cx + 9, cy + 10, z + 30]);
  };

// A 25 mm venetian slat at a 22 mm pitch (a common aluminium blind). Level slats pass the share
// 1 − (thickness + depth · tan profile) / pitch of direct sun: 0.39 at a 27° profile angle, none above 40°.
// The slat was 2.5 mm thick (ten times a real 0.2 mm aluminium slat), which cut that share to 0.30 (Phase 15.5,
// owner 2026-11-18: open blinds let too little sun in); 0.6 mm keeps a visible edge.
const slatDepth = 25;
const slatThickness = 0.6;
// Closed slats turn 80° with their room-side edge up (about x, −80°), so they slope down toward the glass and
// overlap by about 3 mm: no descending sun ray runs along them. Turned the other way (+80°, before Phase 15.5)
// a ray parallel to the slats slipped through the 3 mm channels: 15 % of the sun at a 61° profile angle.
const slatClosedDeg = -80;
// The blind reaches 8 mm over each stile (a negative inset from the glass edge), in front of the sash face, so
// no sun slips past the slat ends: with a 5 mm inset the side strips let 3 % of it past closed slats.
const blindInset = -8;
// The lowest slat's centre may sit up to 10 mm below the glass (`margin` of the slat count, in front of the
// bottom rail), so closed slats reach the bottom of the glass: with a 14 mm margin up to 24 mm of glass stayed
// uncovered there (2 % of the sun past closed slats on a 1350 mm window).
const slatMargin = -10;

/** Shared blind formulas: pitch-true step, a count that fills the middle band, and the slat tilt. */
const blindFormulas = (o: {
  heightMm: number;
  bands: number;
  pitch: number;
  margin: number;
}): Record<string, string> => ({
  slatCount: `floor((heightMm - ${o.bands} - ${o.margin}) / ${o.pitch}) + 1`,
  slatStep: `-${o.pitch} * ${o.heightMm - o.bands} / (heightMm - ${o.bands})`,
  slatAngleDeg: `blindsClosed ? ${String(slatClosedDeg)} : 0`,
});

/** One way a sash moves: its rotation axis, signed angle formula, and when its copy is drawn. */
type Posture = Readonly<{
  suffix: string;
  axis: "x" | "y" | null;
  angle: string;
  /** When this posture's copy of the sash is drawn. */
  shown: string;
  /** When the sash is actually turned in this posture. */
  active: string;
}>;

type XRole = "stileLo" | "stileHi" | "span" | "inset" | "handle";
/** How a sash part is placed along x: rule fields and its x translation formula (null: none). */
type XPlacement = Readonly<{ rule: NodeRule; tx: string | null }>;
type Placer = (role: XRole, span: Span) => XPlacement;

/** Sliced placement: spans stretch with the middle band, stiles and handles keep their size. */
const slicePlacer =
  (stretchLo: boolean, stretchHi: boolean): Placer =>
  (role) => {
    const stretch =
      role === "span" ||
      role === "inset" ||
      (role === "stileLo" && stretchLo) ||
      (role === "stileHi" && stretchHi);
    return { rule: stretch ? { stretch: { x: true } } : {}, tx: null };
  };

/**
 * Formula placement inside a wing whose edges `lo`/`hi` are formulas in mm from the template's left edge:
 * a part is moved (and spans sized) from where the x slice puts its centre (`band + (u − band) × scale`)
 * to its place in the wing. `guard` false shrinks spans to 1 mm, so a hidden wing never widens the layout.
 */
const formulaPlacer =
  (o: {
    w0: number;
    band: number;
    scale: string;
    lo: string;
    hi: string;
    stile: number;
    inset: number;
    hinge: "lo" | "hi";
    guard?: string;
  }): Placer =>
  (role, span) => {
    const centre = (span[0] + span[1]) / 2 + o.w0 / 2;
    const mapped = `${o.band} + ${centre - o.band} * ${o.scale}`;
    const sized = (inner: string): string =>
      o.guard === undefined ? `max(1, ${inner})` : `${o.guard} ? max(1, ${inner}) : 1`;
    const width = `${o.hi} - (${o.lo})`;
    let target: string;
    let size: string | undefined;
    if (role === "stileLo" || (role === "handle" && o.hinge === "hi")) target = `${o.lo} + ${o.stile / 2}`;
    else if (role === "stileHi" || role === "handle") target = `${o.hi} - ${o.stile / 2}`;
    else {
      target = `(${o.lo} + ${o.hi}) / 2`;
      size = sized(`${width} - ${2 * (o.stile + (role === "inset" ? o.inset : 0))}`);
    }
    const tx = `${target} - (${mapped})`;
    return { rule: { ...(size === undefined ? {} : { size: { x: size } }), translate: { x: tx } }, tx };
  };

type HandleSpec = Readonly<{
  name: string;
  material: string;
  visible?: string;
  pinY?: AxisPin;
  build: (cx: number) => (g: Geo) => void;
}>;

type BlindSpec = Readonly<{
  material: string;
  visible: string;
  inset: number;
  railHeight: number;
  face: boolean;
}>;

type SashSpec = Readonly<{
  name: string;
  /** Outer extent; z runs from the back to the room face. */
  x: Span;
  y: Span;
  z: Span;
  stile: number;
  railBottom: number;
  railTop: number;
  glassZ: Span;
  place: Placer;
  hinge: "lo" | "hi";
  /** Swing pivot along x, given the part's x translation (so a moved part still turns on the hinge). */
  hingeX: (tx: string | null) => PivotAxis;
  pivotZ: PivotAxis;
  tiltY?: PivotAxis;
  postures: readonly Posture[];
  visible: string;
  frameMaterial: string;
  glassMaterial: string;
  handles: readonly HandleSpec[];
  blind?: BlindSpec;
  /** Extra translation of every part (a sliding leaf): along x, and toward the room (z). */
  slideX?: string;
  slideZ?: string;
}>;

/** The parts of one sash or leaf: stiles, rails, glass, handles, and its blind, once per posture. */
const sashParts = (s: SashSpec): PartSpec[] => {
  const [x0, x1] = s.x;
  const [y0, y1] = s.y;
  const [zBack, zFront] = s.z;
  const parts: PartSpec[] = [];
  const turn = (posture: Posture, tx: string | null): NodeRule => {
    if (posture.axis === null) return {};
    const rotate: RotateRule =
      posture.axis === "y"
        ? { axis: "y", angleDeg: posture.angle, pivot: { x: s.hingeX(tx), z: s.pivotZ } }
        : { axis: "x", angleDeg: posture.angle, pivot: { y: s.tiltY ?? "start", z: s.pivotZ } };
    return { rotate };
  };
  const slide: NodeRule =
    s.slideX === undefined && s.slideZ === undefined
      ? {}
      : {
          translate: {
            ...(s.slideX === undefined ? {} : { x: s.slideX }),
            ...(s.slideZ === undefined ? {} : { z: s.slideZ }),
          },
        };
  /** The placement's x translation plus the slide (the merged rule keeps the placement's x). */
  const placed = (role: XRole, span: Span): XPlacement => {
    const placement = s.place(role, span);
    if (s.slideX === undefined || placement.tx === null) return placement;
    const tx = `${placement.tx} + ${s.slideX}`;
    return { rule: rule(placement.rule, { translate: { x: tx } }), tx };
  };
  const inner: Span = [x0 + s.stile, x1 - s.stile];
  const glassTop = y1 - s.railTop;
  for (const posture of s.postures) {
    const shown = all(s.visible, posture.shown);
    const add = (
      name: string,
      material: string,
      role: XRole,
      span: Span,
      extra: NodeRule,
      build: (g: Geo) => void,
      visible = shown,
    ): void => {
      const placement = placed(role, span);
      parts.push({
        name: `${s.name}${posture.suffix}${name}`,
        material,
        rule: rule(slide, placement.rule, roomFace, extra, shownWhen(visible), turn(posture, placement.tx)),
        build,
      });
    };
    add(
      "StileLo",
      s.frameMaterial,
      "stileLo",
      [x0, inner[0]],
      { stretch: { y: true } },
      boxes([
        [x0, y0, zBack - 1],
        [inner[0], y1, zFront + 1],
      ]),
    );
    add(
      "StileHi",
      s.frameMaterial,
      "stileHi",
      [inner[1], x1],
      { stretch: { y: true } },
      boxes([
        [inner[1], y0, zBack - 1],
        [x1, y1, zFront + 1],
      ]),
    );
    add(
      "RailBottom",
      s.frameMaterial,
      "span",
      inner,
      {},
      boxes([
        [inner[0], y0, zBack],
        [inner[1], y0 + s.railBottom, zFront],
      ]),
    );
    add(
      "RailTop",
      s.frameMaterial,
      "span",
      inner,
      {},
      boxes([
        [inner[0], glassTop, zBack],
        [inner[1], y1, zFront],
      ]),
    );
    add(
      "Glass",
      s.glassMaterial,
      "span",
      inner,
      { stretch: { y: true } },
      boxes([
        [inner[0], y0 + s.railBottom, s.glassZ[0]],
        [inner[1], glassTop, s.glassZ[1]],
      ]),
    );
    const handleStile: Span = s.hinge === "lo" ? [inner[1], x1] : [x0, inner[0]];
    const handleX = (handleStile[0] + handleStile[1]) / 2;
    for (const handle of s.handles)
      add(
        handle.name,
        handle.material,
        "handle",
        handleStile,
        handle.pinY === undefined ? {} : { pin: { y: handle.pinY } },
        handle.build(handleX),
        all(shown, handle.visible ?? "true"),
      );
    const blind = s.blind;
    if (blind === undefined) continue;
    const blindSpan: Span = [inner[0] + blind.inset, inner[1] - blind.inset];
    const face: NodeRule = blind.face ? { face: "interior" } : {};
    const railY0 = glassTop - blind.railHeight;
    add(
      "BlindRail",
      blind.material,
      "inset",
      blindSpan,
      face,
      boxes([
        [blindSpan[0], railY0, zFront],
        [blindSpan[1], glassTop, zFront + 30],
      ]),
      all(shown, blind.visible),
    );
    if (posture.axis === null) continue;
    for (const closed of [false, true])
      add(
        closed ? "SlatsClosed" : "SlatsOpen",
        blind.material,
        "inset",
        blindSpan,
        { ...face, repeat: { offsetMm: { y: "slatStep" }, count: "slatCount" } },
        slat(
          blindSpan[0],
          blindSpan[1],
          railY0,
          zFront + 2 + slatDepth / 2,
          slatDepth,
          slatThickness,
          closed ? slatClosedDeg : 0,
        ),
        all(s.visible, blind.visible, posture.active, closed ? "blindsClosed" : "!blindsClosed"),
      );
  }
  const blind = s.blind;
  if (blind !== undefined) {
    const blindSpan: Span = [inner[0] + blind.inset, inner[1] - blind.inset];
    const placement = placed("inset", blindSpan);
    const resting = s.postures
      .filter((posture) => posture.axis !== null)
      .map((posture) => `!(${posture.active})`);
    parts.push({
      name: `${s.name}Slats`,
      material: blind.material,
      rule: rule(
        slide,
        placement.rule,
        roomFace,
        blind.face ? { face: "interior" } : {},
        shownWhen(all(s.visible, blind.visible, ...resting)),
        {
          repeat: { offsetMm: { y: "slatStep" }, count: "slatCount" },
          rotate: { axis: "x", angleDeg: "slatAngleDeg", perCopy: true },
        },
      ),
      build: slat(
        blindSpan[0],
        blindSpan[1],
        glassTop - blind.railHeight,
        zFront + 2 + slatDepth / 2,
        slatDepth,
        slatThickness,
        0,
      ),
    });
  }
  return parts;
};

// Finishes offered by these templates (material presets, D19 / Phase 9 material choices).
const finish = {
  oak: { color: [0.371, 0.195, 0.056], roughness: 0.6 },
  lightOak: { color: [0.6, 0.43, 0.25], roughness: 0.55 },
  walnut: { color: [0.332, 0.15, 0.056], roughness: 0.6 },
  wenge: { color: [0.12, 0.075, 0.05], roughness: 0.5 },
  white: { color: [0.88, 0.88, 0.86], roughness: 0.55 },
  cream: { color: [0.81, 0.8, 0.73], roughness: 0.6 },
  anthracite: { color: [0.09, 0.1, 0.11], roughness: 0.45, metallic: 0.3 },
  blackAluminium: { color: [0.012, 0.013, 0.015], roughness: 0.45, metallic: 0.6 },
  brown: { color: [0.08, 0.03, 0.023], roughness: 0.6 },
  blackMetal: { color: [0.024, 0.023, 0.021], roughness: 0.4, metallic: 0.6 },
  steel: { color: [0.62, 0.62, 0.64], roughness: 0.3, metallic: 1 },
  brass: { color: [0.75, 0.56, 0.25], roughness: 0.3, metallic: 1 },
  clearGlass: { color: [0.64, 0.77, 0.78], alpha: 0.2, roughness: 0.05, doubleSided: true },
  frostedGlass: { color: [0.86, 0.9, 0.9], alpha: 0.75, roughness: 0.6, doubleSided: true },
  ivory: { color: [0.7, 0.7, 0.58], roughness: 0.7 },
  whiteBlind: { color: [0.9, 0.9, 0.88], roughness: 0.7 },
  greyBlind: { color: [0.45, 0.46, 0.47], roughness: 0.6 },
  blackBlind: { color: [0.05, 0.05, 0.055], roughness: 0.6 },
  bamboo: { color: [0.44, 0.262, 0.1], roughness: 0.75 },
  linen: { color: [0.76, 0.72, 0.62], roughness: 0.85 },
} satisfies Record<string, MaterialSpec>;

const glassSlot = {
  material: "Glass",
  title: "Glazing",
  choosable: true,
  presets: ["Glass", "Frosted glass"],
  allowColor: false,
  allowTexture: false,
};
const blindSlot = {
  material: "Ivory blind",
  title: "Blind",
  choosable: true,
  presets: ["Ivory blind", "White blind", "Grey blind", "Black blind"],
  allowColor: true,
  allowTexture: false,
};
const blindMaterials = {
  "Ivory blind": finish.ivory,
  "White blind": finish.whiteBlind,
  "Grey blind": finish.greyBlind,
  "Black blind": finish.blackBlind,
};
const glassMaterials = { Glass: finish.clearGlass, "Frosted glass": finish.frostedGlass };

const blindsClosedProperty = {
  type: "boolean",
  title: "Blinds closed",
  description: "Tilts every slat almost vertical (about 80°); open slats are horizontal.",
  default: false,
  "x-homeplan": { editor: "toggle", state: true },
};
const blindProperty = (title: string, description: string, value: boolean): Record<string, unknown> => ({
  type: "boolean",
  title,
  description,
  default: value,
  "x-homeplan": { editor: "toggle" },
});
const angleProperty = (title: string, description: string, value: number): Record<string, unknown> => ({
  type: "number",
  title,
  description,
  minimum: 0,
  maximum: 90,
  default: value,
  "x-homeplan": { editor: "angle", quantity: "angle", state: true },
});

// Casement window: one or two wings. Outer 1000 × 1350 at the defaults; frame 50, sash 55 (rails and
// stiles), sash depth z 0..50 flush with the frame's room face, glass z 21..29, handle and blind z 50..80.
// The wings are placed by formulas (`formulaPlacer`) so the narrow second wing keeps its width.
const casement = { w0: 1000, h0: 1350, frame: 50, stile: 55, mullion: 80 } as const;
const casementTilt = 8;

const casementWing = (o: {
  name: string;
  x: Span;
  lo: string;
  hi: string;
  hinge: "lo" | "hi";
  guard?: string;
  postures: readonly Posture[];
  visible: string;
}): PartSpec[] =>
  sashParts({
    name: o.name,
    x: o.x,
    y: [casement.frame, casement.h0 - casement.frame],
    z: [0, 50],
    stile: casement.stile,
    railBottom: 55,
    railTop: 55,
    glassZ: [21, 29],
    place: formulaPlacer({
      w0: casement.w0,
      band: casement.frame,
      scale: "kx",
      lo: o.lo,
      hi: o.hi,
      stile: casement.stile,
      inset: blindInset,
      hinge: o.hinge,
      ...(o.guard === undefined ? {} : { guard: o.guard }),
    }),
    hinge: o.hinge,
    hingeX: (tx) =>
      o.hinge === "lo"
        ? {
            at: "start",
            of: "template",
            offsetMm: tx === null ? casement.frame : `${casement.frame} - (${tx})`,
          }
        : {
            at: "end",
            of: "template",
            offsetMm: tx === null ? -casement.frame : `-${casement.frame} - (${tx})`,
          },
    pivotZ: { at: "end", of: "template", offsetMm: -30 },
    tiltY: { at: "start", of: "template", offsetMm: casement.frame },
    postures: o.postures,
    visible: o.visible,
    frameMaterial: "Oak",
    glassMaterial: "Glass",
    handles: [
      { name: "Handle", material: "Black metal", build: (cx) => windowHandle(cx, casement.h0 / 2, 50) },
    ],
    blind: { material: "Ivory blind", visible: "blind", inset: blindInset, railHeight: 35, face: true },
  });

const windowCasement: TemplateSpec = {
  id: "window-casement",
  view: "front",
  hostDepthMm: 100,
  metadata: {
    ...wallableBase,
    kind: "window",
    label: "Casement Window",
    category: "Openings",
    tags: ["window", "casement", "tilt and turn", "sash", "blind", "venetian blind", "two wing"],
    product: {
      description:
        "Timber casement window with one or two side-hung wings. The main wing tilts in from the top or swings like a door; an optional venetian blind on each wing tilts its slats open or closed.",
      notes:
        "Flip left/right to move the hinge and handle; flip inside/outside to turn the window, the blind stays on the room side.",
    },
    attachment: { ...wallableBase.attachment, defaultPlacement: { bottomMm: 900 } },
    resize: {
      x: {
        mode: "slice",
        startMm: 50,
        endMm: 50,
        minMm: 400,
        maxMm: 3000,
        defaultMm: 1000,
        description: "Outer frame width (the wall opening).",
        quickPicks: [600, 800, 1000, 1200, 1500, 1800],
      },
      y: {
        mode: "slice",
        startMm: 105,
        endMm: 140,
        minMm: 500,
        maxMm: 2400,
        defaultMm: 1350,
        description: "Outer frame height (the wall opening).",
        quickPicks: [600, 900, 1200, 1350, 1500],
      },
      z: { mode: "fitHostDepth", startMm: 0, endMm: 30 },
    },
    flip: { x: true, z: true },
    materialSlots: {
      frame: {
        material: "Oak",
        title: "Frame and sashes",
        choosable: true,
        presets: ["Oak", "Walnut", "White", "Anthracite"],
        allowColor: true,
        allowTexture: true,
      },
      glass: glassSlot,
      blind: blindSlot,
      handle: {
        material: "Black metal",
        title: "Handles",
        choosable: true,
        presets: ["Black metal", "Steel", "White"],
        allowColor: true,
        allowTexture: false,
      },
    },
    properties: {
      wings: {
        type: "string",
        title: "Wings",
        description: "One wing, or a main wing next to a narrow second wing (hinged on the opposite side).",
        enum: ["one", "two"],
        default: "one",
      },
      secondWingMm: {
        type: "number",
        title: "Narrow wing",
        description:
          "Two wings only: the narrow wing's width from the mullion centre to the inside of the frame (at most half the window).",
        minimum: 200,
        maximum: 1000,
        default: 630,
        "x-homeplan": {
          editor: "length",
          quantity: "length",
          quickPicks: [400, 500, 630],
          visibleWhen: { property: "wings", equals: "two" },
        },
      },
      blind: blindProperty("Blinds", "Shows a venetian blind on each wing, on the room side.", true),
      openMode: {
        type: "string",
        title: "Open",
        description:
          "Closed; tilted in from the top (main wing); or swung open like a door (both wings, by the open angle).",
        enum: ["closed", "tilt", "swing"],
        default: "closed",
        "x-homeplan": { state: true },
      },
      openAngleDeg: angleProperty("Open angle", "How far the wings swing open in the swing mode.", 90),
      blindsClosed: blindsClosedProperty,
    },
    formulas: {
      kx: `(widthMm - ${2 * casement.frame}) / ${casement.w0 - 2 * casement.frame}`,
      secondW: "max(200, min(secondWingMm, widthMm / 2 - 50))",
      mullionU: `widthMm - ${casement.frame} - secondW`,
      mainHiU: `wings == 'two' ? mullionU - ${casement.mullion / 2} : widthMm - ${casement.frame}`,
      secondLoU: `mullionU + ${casement.mullion / 2}`,
      mainSwingDeg: "openMode == 'swing' ? openAngleDeg : 0",
      mainTiltDeg: `openMode == 'tilt' ? ${casementTilt} : 0`,
      secondSwingDeg: "openMode == 'swing' && wings == 'two' ? openAngleDeg : 0",
      ...blindFormulas({ heightMm: casement.h0, bands: 245, pitch: 22, margin: slatMargin }),
    },
  },
  materials: {
    Oak: finish.oak,
    Walnut: finish.walnut,
    White: finish.white,
    Anthracite: finish.anthracite,
    ...glassMaterials,
    ...blindMaterials,
    "Black metal": finish.blackMetal,
    Steel: finish.steel,
  },
  parts: [
    {
      name: "Frame",
      material: "Oak",
      build: rectFrame(-500, 500, 0, casement.h0, casement.frame, casement.frame, casement.frame, -50, 50),
    },
    {
      // Authored at the template centre, where the default narrow wing (450 at 1000 mm) puts it.
      name: "Mullion",
      material: "Oak",
      rule: {
        stretch: { y: true, z: true },
        visible: "wings == 'two'",
        translate: { x: `mullionU - (${casement.frame} + ${casement.w0 / 2 - casement.frame} * kx)` },
      },
      build: boxes([
        [-casement.mullion / 2, casement.frame, -50],
        [casement.mullion / 2, casement.h0 - casement.frame, 50],
      ]),
    },
    ...casementWing({
      name: "Main",
      x: [-450, 450],
      lo: `${casement.frame}`,
      hi: "mainHiU",
      hinge: "lo",
      postures: [
        {
          suffix: "",
          axis: "y",
          angle: "-mainSwingDeg",
          shown: "mainTiltDeg == 0",
          active: "mainSwingDeg != 0",
        },
        {
          suffix: "Tilt",
          axis: "x",
          angle: "mainTiltDeg",
          shown: "mainTiltDeg != 0",
          active: "mainTiltDeg != 0",
        },
      ],
      visible: "true",
    }),
    ...casementWing({
      name: "Second",
      x: [40, 450],
      lo: "secondLoU",
      hi: `widthMm - ${casement.frame}`,
      hinge: "hi",
      guard: "wings == 'two'",
      postures: [
        { suffix: "", axis: "y", angle: "secondSwingDeg", shown: "true", active: "secondSwingDeg != 0" },
      ],
      visible: "wings == 'two'",
    }),
  ],
};

// Fixed window: equal fixed panels between formula-counted mullions, with an optional bamboo roll shade on
// the room side. Outer 1150 × 1400 at the defaults; frame and mullions 45.
const fixedWindow = { w0: 1150, h0: 1400, frame: 45 } as const;
const shadePitch = 31;

const windowFixed: TemplateSpec = {
  id: "window-fixed",
  view: "front",
  hostDepthMm: 100,
  metadata: {
    ...wallableBase,
    kind: "window",
    label: "Fixed Window",
    category: "Openings",
    tags: ["window", "fixed", "glazing", "panels", "balcony", "bamboo", "roll shade"],
    product: {
      description:
        "Fixed glazing in a slim frame, split into equal panels by mullions, with an optional bamboo roll shade on the room side.",
      notes:
        "Covers single fixed windows and wide balcony glazing; the shade keeps to the room side when flipped.",
    },
    attachment: { ...wallableBase.attachment, defaultPlacement: { bottomMm: 900 } },
    resize: {
      x: {
        mode: "slice",
        startMm: 45,
        endMm: 45,
        minMm: 300,
        maxMm: 6000,
        defaultMm: 1150,
        description: "Outer frame width (the wall opening).",
      },
      y: {
        mode: "slice",
        startMm: 45,
        endMm: 70,
        minMm: 300,
        maxMm: 3000,
        defaultMm: 1400,
        description: "Outer frame height (the wall opening).",
      },
      z: { mode: "fitHostDepth", startMm: 0, endMm: 50 },
    },
    flip: { x: true, z: true },
    materialSlots: {
      frame: {
        material: "White",
        title: "Frame",
        choosable: true,
        presets: ["White", "Cream", "Anthracite", "Oak", "Brown"],
        allowColor: true,
        allowTexture: true,
      },
      glass: glassSlot,
      shade: {
        material: "Bamboo",
        title: "Shade",
        choosable: true,
        presets: ["Bamboo", "Linen"],
        allowColor: true,
        allowTexture: true,
      },
      cord: "Cord",
    },
    properties: {
      panelCount: {
        type: "integer",
        title: "Panels",
        description: "Number of equal glass panels; a mullion separates each pair.",
        minimum: 1,
        maximum: 8,
        default: 1,
        "x-homeplan": { editor: "number" },
      },
      shade: blindProperty("Shade", "Shows a bamboo roll shade across the glazing, on the room side.", false),
      shadeLoweredPct: {
        type: "number",
        title: "Shade lowered",
        description: "How far the shade hangs down, from rolled up (0) to the bottom of the glass (100).",
        minimum: 0,
        maximum: 100,
        default: 100,
        "x-homeplan": { editor: "slider", visibleWhen: { property: "shade", equals: true } },
      },
    },
    formulas: {
      shadeSlats: `floor(shadeLoweredPct / 100 * (heightMm - 115 - 8) / ${shadePitch}) + 1`,
      shadeStep: `-${shadePitch} * ${fixedWindow.h0 - 115} / (heightMm - 115)`,
    },
  },
  materials: {
    White: finish.white,
    Cream: finish.cream,
    Anthracite: finish.anthracite,
    Oak: finish.oak,
    Brown: finish.brown,
    ...glassMaterials,
    Bamboo: finish.bamboo,
    Linen: finish.linen,
    Cord: finish.cream,
  },
  parts: [
    {
      name: "Frame",
      material: "White",
      build: rectFrame(-575, 575, 0, fixedWindow.h0, 45, 45, 45, -50, 50),
    },
    {
      name: "Glass",
      material: "Glass",
      build: boxes([
        [-530, 45, -4],
        [530, fixedWindow.h0 - 45, 4],
      ]),
    },
    {
      // Authored on the right frame's inner edge; copies step left by one panel and the whole row moves one
      // panel left, so the mullions sit between equal panels (none with one panel).
      name: "Mullion",
      material: "White",
      rule: {
        stretch: { y: true, z: true },
        repeat: { offsetMm: { x: `-${fixedWindow.w0 - 90} / panelCount` }, count: "panelCount - 1" },
        translate: { x: "-(widthMm - 90) / panelCount" },
      },
      build: boxes([
        [530 - 22.5, 45, -45],
        [530 + 22.5, fixedWindow.h0 - 45, 45],
      ]),
    },
    {
      name: "ShadeRoll",
      material: "Bamboo",
      rule: { stretch: { x: true }, pin: { z: "end" }, visible: "shade", face: "interior" },
      build: roll(-560, 560, fixedWindow.h0 - 35, 75, 25),
    },
    {
      name: "ShadeSlats",
      material: "Bamboo",
      rule: {
        stretch: { x: true },
        pin: { z: "end" },
        visible: "shade",
        face: "interior",
        repeat: { offsetMm: { y: "shadeStep" }, count: "shadeSlats" },
      },
      build: boxes([
        [-545, fixedWindow.h0 - 70 - 8, 71],
        [545, fixedWindow.h0 - 70 + 8, 79],
      ]),
    },
    {
      // Cord segments repeated with the slats, one pitch long and centred on each slat (so they follow the
      // slats exactly); the top segment reaches into the roll.
      name: "ShadeCords",
      material: "Cord",
      rule: {
        stretch: { x: true },
        pin: { z: "end" },
        visible: "shade",
        face: "interior",
        repeat: { offsetMm: { y: "shadeStep" }, count: "shadeSlats" },
      },
      build: boxes(
        [
          [-353, fixedWindow.h0 - 70 - shadePitch / 2, 80],
          [-347, fixedWindow.h0 - 70 + shadePitch / 2, 84],
        ],
        [
          [347, fixedWindow.h0 - 70 - shadePitch / 2, 80],
          [353, fixedWindow.h0 - 70 + shadePitch / 2, 84],
        ],
      ),
    },
  ],
};

// Interior door: door-interior's lining, leaf, handles, and hinges (850 × 2050, lining 30, leaf z 10..50)
// with an open angle about the hinge axis (x −395, z 46) and a panel style.
const doorLeafTurn: NodeRule = {
  rotate: {
    axis: "y",
    angleDeg: "-openAngleDeg",
    pivot: {
      x: { at: "start", of: "template", offsetMm: 30 },
      z: { at: "end", of: "template", offsetMm: -64 },
    },
  },
};
const framedStyle = "panelStyle != 'flat'";

const interiorDoor: TemplateSpec = {
  id: "interior-door",
  view: "front",
  hostDepthMm: 100,
  metadata: {
    ...wallableBase,
    kind: "door",
    label: "Hinged Interior Door",
    category: "Openings",
    tags: ["door", "interior", "hinged", "flush", "glazed", "oak", "wenge"],
    product: {
      description:
        "Hinged interior door in a lining that fits the wall depth: flat, fully glazed, or half-glazed leaf, with lever handles on both sides.",
      notes:
        "Flip left/right for the hinge side and inside/outside for the swing side; the open angle turns the leaf about its hinges.",
    },
    attachment: { ...wallableBase.attachment, defaultPlacement: { bottomMm: 0 } },
    resize: {
      x: {
        mode: "slice",
        startMm: 30,
        endMm: 30,
        minMm: 700,
        maxMm: 1200,
        defaultMm: 850,
        description: "Outer lining width (the wall opening).",
        quickPicks: [700, 750, 800, 850, 900, 1000],
      },
      y: {
        mode: "slice",
        startMm: 0,
        endMm: 30,
        minMm: 1900,
        maxMm: 2400,
        defaultMm: 2050,
        description: "Outer lining height from the floor.",
        quickPicks: [2000, 2050, 2100, 2200],
      },
      // Middle band z −50..50 is the lining; the 60 mm end band holds the room-side handle.
      z: { mode: "fitHostDepth", startMm: 0, endMm: 60 },
    },
    flip: { x: true, z: true },
    materialSlots: {
      frame: {
        material: "White",
        title: "Frame",
        choosable: true,
        presets: ["Oak", "Wenge", "White"],
        allowColor: true,
        allowTexture: true,
      },
      leaf: {
        material: "Oak",
        title: "Door leaf",
        choosable: true,
        presets: ["Oak", "Wenge", "White"],
        allowColor: true,
        allowTexture: true,
      },
      hardware: {
        material: "Steel",
        title: "Handles and hinges",
        choosable: true,
        presets: ["Steel", "Black metal", "Brass"],
        allowColor: false,
        allowTexture: false,
      },
      glass: glassSlot,
    },
    properties: {
      panelStyle: {
        type: "string",
        title: "Leaf",
        description: "Flat leaf, a fully glazed leaf, or glass above a solid lower panel.",
        enum: ["flat", "glazed", "half-glazed"],
        default: "flat",
      },
      openAngleDeg: angleProperty("Open angle", "How far the leaf is open, turning about its hinges.", 0),
    },
  },
  materials: {
    White: finish.white,
    Oak: finish.lightOak,
    Wenge: finish.wenge,
    Steel: finish.steel,
    "Black metal": finish.blackMetal,
    Brass: finish.brass,
    ...glassMaterials,
  },
  parts: [
    {
      name: "Lining",
      material: "White",
      build: boxes(
        [
          [-425, 0, -50],
          [-395, 2050, 50],
        ],
        [
          [395, 0, -50],
          [425, 2050, 50],
        ],
        [
          [-395, 2020, -50],
          [395, 2050, 50],
        ],
      ),
    },
    {
      name: "Leaf",
      material: "Oak",
      rule: rule(
        { stretch: { x: true, y: true }, pin: { z: "end" }, visible: "panelStyle == 'flat'" },
        doorLeafTurn,
      ),
      build: boxes([
        [-393, 6, 10],
        [393, 2017, 50],
      ]),
    },
    {
      name: "StileHinge",
      material: "Oak",
      rule: rule({ pin: { x: "start", z: "end" }, stretch: { y: true }, visible: framedStyle }, doorLeafTurn),
      build: boxes([
        [-393, 6, 9],
        [-273, 2017, 51],
      ]),
    },
    {
      name: "StileLatch",
      material: "Oak",
      rule: rule({ pin: { x: "end", z: "end" }, stretch: { y: true }, visible: framedStyle }, doorLeafTurn),
      build: boxes([
        [273, 6, 9],
        [393, 2017, 51],
      ]),
    },
    {
      name: "RailTop",
      material: "Oak",
      rule: rule({ pin: { y: "end", z: "end" }, stretch: { x: true }, visible: framedStyle }, doorLeafTurn),
      build: boxes([
        [-392, 1897, 10],
        [392, 2017, 50],
      ]),
    },
    {
      name: "RailBottom",
      material: "Oak",
      rule: rule({ pin: { y: "start", z: "end" }, stretch: { x: true }, visible: framedStyle }, doorLeafTurn),
      build: boxes([
        [-392, 6, 10],
        [392, 226, 50],
      ]),
    },
    {
      name: "RailMid",
      material: "Oak",
      rule: rule(
        { pin: { y: "start", z: "end" }, stretch: { x: true }, visible: "panelStyle == 'half-glazed'" },
        doorLeafTurn,
      ),
      build: boxes([
        [-392, 1000, 10],
        [392, 1120, 50],
      ]),
    },
    {
      name: "PanelLower",
      material: "Oak",
      rule: rule(
        {
          pin: { y: "start", z: "end" },
          size: { x: "widthMm - 284" },
          visible: "panelStyle == 'half-glazed'",
        },
        doorLeafTurn,
      ),
      build: boxes([
        [-283, 216, 22],
        [283, 1010, 38],
      ]),
    },
    {
      name: "Glass",
      material: "Glass",
      rule: rule(
        {
          pin: { y: "start", z: "end" },
          size: { x: "widthMm - 284", y: "heightMm - 359" },
          translate: { y: "(heightMm - 2050) / 2" },
          visible: "panelStyle == 'glazed'",
        },
        doorLeafTurn,
      ),
      build: boxes([
        [-283, 216, 26],
        [283, 1907, 34],
      ]),
    },
    {
      name: "GlassUpper",
      material: "Glass",
      rule: rule(
        {
          pin: { y: "start", z: "end" },
          size: { x: "widthMm - 284", y: "heightMm - 1253" },
          translate: { y: "(heightMm - 2050) / 2" },
          visible: "panelStyle == 'half-glazed'",
        },
        doorLeafTurn,
      ),
      build: boxes([
        [-283, 1110, 26],
        [283, 1907, 34],
      ]),
    },
    {
      name: "HandleFront",
      material: "Steel",
      rule: rule({ pin: { x: "end", y: "start", z: "end" } }, doorLeafTurn),
      build: leverHandle(330, 1000, 50, 1),
    },
    {
      name: "HandleBack",
      material: "Steel",
      rule: rule({ pin: { x: "end", y: "start", z: "end" } }, doorLeafTurn),
      build: leverHandle(330, 1000, 10, -1),
    },
    {
      name: "HingeLower",
      material: "Steel",
      rule: { pin: { x: "start", y: "start", z: "end" } },
      build: hinge(-395, 200, 300, 46),
    },
    {
      name: "HingeUpper",
      material: "Steel",
      rule: { pin: { x: "start", y: "end", z: "end" } },
      build: hinge(-395, 1750, 1850, 46),
    },
  ],
};

// Glazed door: a full-glass leaf (stiles 50, rails 110/60) in a 50 mm frame with a 20 mm threshold, lever or
// bar handles, and an optional venetian blind on the room face of the leaf (it turns with the leaf).
// 800 × 2100 at the defaults; leaf z 10..50, handles to z 110.
const glazedDoor = { w0: 800, h0: 2100 } as const;

const doorGlazed: TemplateSpec = {
  id: "door-glazed",
  view: "front",
  hostDepthMm: 100,
  metadata: {
    ...wallableBase,
    kind: "door",
    label: "Glazed Door",
    category: "Openings",
    tags: ["door", "glass", "glazed", "aluminium", "utility", "blind", "venetian blind"],
    product: {
      description:
        "Hinged door with a full-height glass leaf in a slim frame (aluminium or timber), lever or long bar handles, and an optional venetian blind on the leaf.",
      notes:
        "Flip left/right for the hinge side and inside/outside for the swing side; the blind is fixed to the leaf and swings with it.",
    },
    attachment: { ...wallableBase.attachment, defaultPlacement: { bottomMm: 0 } },
    resize: {
      x: {
        mode: "slice",
        startMm: 100,
        endMm: 100,
        minMm: 600,
        maxMm: 1200,
        defaultMm: 800,
        description: "Outer frame width (the wall opening).",
        quickPicks: [700, 800, 900, 1000],
      },
      y: {
        mode: "slice",
        startMm: 130,
        endMm: 145,
        minMm: 1700,
        maxMm: 2600,
        defaultMm: 2100,
        description: "Outer frame height.",
        quickPicks: [2000, 2100, 2200],
      },
      z: { mode: "fitHostDepth", startMm: 0, endMm: 60 },
    },
    flip: { x: true, z: true },
    materialSlots: {
      frame: {
        material: "Black aluminium",
        title: "Frame and leaf",
        choosable: true,
        presets: ["Black aluminium", "Anthracite", "White", "Oak"],
        allowColor: true,
        allowTexture: true,
      },
      glass: glassSlot,
      blind: blindSlot,
      hardware: {
        material: "Steel",
        title: "Handles and hinges",
        choosable: true,
        presets: ["Steel", "Black metal"],
        allowColor: false,
        allowTexture: false,
      },
    },
    properties: {
      handleStyle: {
        type: "string",
        title: "Handles",
        description: "Lever handles, or long vertical bar handles.",
        enum: ["lever", "bar"],
        default: "lever",
      },
      blind: blindProperty("Blind", "Shows a venetian blind on the room face of the leaf.", true),
      openAngleDeg: angleProperty("Open angle", "How far the leaf is open, turning about its hinges.", 0),
      blindsClosed: blindsClosedProperty,
    },
    formulas: blindFormulas({ heightMm: glazedDoor.h0, bands: 275, pitch: 22, margin: slatMargin }),
  },
  materials: {
    "Black aluminium": finish.blackAluminium,
    Anthracite: finish.anthracite,
    White: finish.white,
    Oak: finish.oak,
    ...glassMaterials,
    ...blindMaterials,
    Steel: finish.steel,
    "Black metal": finish.blackMetal,
  },
  parts: [
    {
      name: "Frame",
      material: "Black aluminium",
      build: rectFrame(-400, 400, 0, glazedDoor.h0, 50, 20, 50, -50, 50),
    },
    ...sashParts({
      name: "Leaf",
      x: [-350, 350],
      y: [20, glazedDoor.h0 - 50],
      z: [10, 50],
      stile: 50,
      railBottom: 110,
      railTop: 60,
      glassZ: [26, 34],
      place: slicePlacer(false, false),
      hinge: "lo",
      hingeX: () => ({ at: "start", of: "template", offsetMm: 50 }),
      pivotZ: { at: "end", of: "template", offsetMm: -60 },
      postures: [
        { suffix: "", axis: "y", angle: "-openAngleDeg", shown: "true", active: "openAngleDeg != 0" },
      ],
      visible: "true",
      frameMaterial: "Black aluminium",
      glassMaterial: "Glass",
      handles: [
        {
          name: "LeverFront",
          material: "Steel",
          visible: "handleStyle == 'lever'",
          pinY: "start",
          build: (cx) => leverHandle(cx, 1050, 50, 1),
        },
        {
          name: "LeverBack",
          material: "Steel",
          visible: "handleStyle == 'lever'",
          pinY: "start",
          build: (cx) => leverHandle(cx, 1050, 10, -1),
        },
        {
          name: "Bars",
          material: "Steel",
          visible: "handleStyle == 'bar'",
          pinY: "start",
          build: (cx) => (g) => {
            cylinder(g, [cx, 95], 750, 1350, 12);
            cylinder(g, [cx, -35], 750, 1350, 12);
            for (const y of [800, 1300]) {
              cylinder(g, [cx, y], 50, 83, 7, "z");
              cylinder(g, [cx, y], -23, 10, 7, "z");
            }
          },
        },
      ],
      blind: { material: "Ivory blind", visible: "blind", inset: blindInset, railHeight: 35, face: false },
    }),
    {
      name: "HingeLower",
      material: "Steel",
      rule: { pin: { y: "start", z: "end" } },
      build: hinge(-350, 250, 350, 50),
    },
    {
      name: "HingeUpper",
      material: "Steel",
      rule: { pin: { y: "end", z: "end" } },
      build: hinge(-350, glazedDoor.h0 - 400, glazedDoor.h0 - 300, 50),
    },
  ],
};

// Two-leaf balcony door (French door): two glazed leaves hinged on the outer posts and meeting at a centre
// post, each with handles and a venetian blind that swings with it. 2760 × 2230 at the defaults; frame 70,
// centre post 90 (it stretches with the leaves), leaf stiles and rails 60, leaves z 0..50.
const balconyDoor = { w0: 2760, h0: 2230 } as const;

const balconyLeaf = (side: "left" | "right"): PartSpec[] => {
  const left = side === "left";
  const angle = left ? "leftOpenAngleDeg" : "rightOpenAngleDeg";
  return sashParts({
    name: left ? "LeftLeaf" : "RightLeaf",
    x: left ? [-1310, -45] : [45, 1310],
    y: [70, balconyDoor.h0 - 70],
    z: [0, 50],
    stile: 60,
    railBottom: 60,
    railTop: 60,
    glassZ: [21, 29],
    place: slicePlacer(!left, left),
    hinge: left ? "lo" : "hi",
    hingeX: () =>
      left ? { at: "start", of: "template", offsetMm: 70 } : { at: "end", of: "template", offsetMm: -70 },
    pivotZ: { at: "end", of: "template", offsetMm: -30 },
    postures: [
      { suffix: "", axis: "y", angle: left ? `-${angle}` : angle, shown: "true", active: `${angle} != 0` },
    ],
    visible: "true",
    frameMaterial: "Oak",
    glassMaterial: "Glass",
    handles: [
      { name: "Handle", material: "Steel", pinY: "start", build: (cx) => windowHandle(cx, 1015, 50) },
    ],
    blind: { material: "Ivory blind", visible: "blinds", inset: blindInset, railHeight: 35, face: false },
  });
};

const balconyDoorDouble: TemplateSpec = {
  id: "balcony-door-double",
  view: "front",
  hostDepthMm: 100,
  metadata: {
    ...wallableBase,
    kind: "door",
    label: "Two-Leaf Balcony Door",
    category: "Openings",
    tags: ["door", "balcony", "french door", "two leaf", "glazed", "blind", "venetian blind"],
    product: {
      description:
        "Glazed two-leaf balcony door: both leaves hinge on the outer posts and meet at a centre post; each has a handle and a venetian blind that swings with it.",
      notes: "Each leaf has its own open angle; flip inside/outside to swing the leaves out.",
    },
    attachment: { ...wallableBase.attachment, defaultPlacement: { bottomMm: 0 } },
    resize: {
      x: {
        mode: "slice",
        startMm: 130,
        endMm: 130,
        minMm: 1200,
        maxMm: 3600,
        defaultMm: 2760,
        description: "Outer frame width (the wall opening).",
        quickPicks: [1400, 1600, 1800, 2400, 2760],
      },
      y: {
        mode: "slice",
        startMm: 130,
        endMm: 165,
        minMm: 1800,
        maxMm: 2700,
        defaultMm: 2230,
        description: "Outer frame height.",
        quickPicks: [2100, 2200, 2230, 2400],
      },
      z: { mode: "fitHostDepth", startMm: 0, endMm: 30 },
    },
    flip: { x: true, z: true },
    materialSlots: {
      frame: {
        material: "Oak",
        title: "Frame and leaves",
        choosable: true,
        presets: ["Oak", "Walnut", "White", "Anthracite"],
        allowColor: true,
        allowTexture: true,
      },
      glass: glassSlot,
      blind: blindSlot,
      handle: {
        material: "Steel",
        title: "Handles",
        choosable: true,
        presets: ["Steel", "Black metal", "White"],
        allowColor: true,
        allowTexture: false,
      },
    },
    properties: {
      blinds: blindProperty("Blinds", "Shows a venetian blind on each leaf, on the room side.", true),
      leftOpenAngleDeg: angleProperty(
        "Left leaf open",
        "How far the left leaf is open, turning about its hinges.",
        0,
      ),
      rightOpenAngleDeg: angleProperty(
        "Right leaf open",
        "How far the right leaf is open, turning about its hinges.",
        0,
      ),
      blindsClosed: blindsClosedProperty,
    },
    formulas: blindFormulas({ heightMm: balconyDoor.h0, bands: 295, pitch: 22, margin: slatMargin }),
  },
  materials: {
    Oak: finish.oak,
    Walnut: finish.walnut,
    White: finish.white,
    Anthracite: finish.anthracite,
    ...glassMaterials,
    ...blindMaterials,
    Steel: finish.steel,
    "Black metal": finish.blackMetal,
  },
  parts: [
    {
      name: "Frame",
      material: "Oak",
      build: (g) => {
        rectFrame(-1380, 1380, 0, balconyDoor.h0, 70, 70, 70, -50, 50)(g);
        box(g, [-45, 70, -50], [45, balconyDoor.h0 - 70, 50]);
      },
    },
    ...balconyLeaf("left"),
    ...balconyLeaf("right"),
  ],
};

// Sliding balcony door (a van-style sliding door): closed, two leaves sit flush side by side in one plane,
// either side of a fixed 90 mm centre post. Opening first pops the sliding leaf 100 mm into the room (the
// first 10 % of `openPct`), then slides it sideways in front of the fixed leaf. Each leaf carries its own
// venetian blind, which moves with it. 1660 × 2260 at the defaults; outer posts, head, and threshold 70,
// leaf stiles and rails 60 (13 mm from the post), leaves z 0..50, handle and blinds z 50..80. The leaves
// are placed by formulas so the centre post and the stiles keep their widths at every size.
const slidingDoor = { w0: 1660, h0: 2260, frame: 70, post: 90, gap: 13, stile: 60 } as const;
const slidingMeet = slidingDoor.post / 2 + slidingDoor.gap;

const slidingLeaf = (side: "sliding" | "fixed"): PartSpec[] => {
  const sliding = side === "sliding";
  const half = slidingDoor.w0 / 2 - slidingDoor.frame;
  return sashParts({
    name: sliding ? "SlidingLeaf" : "FixedLeaf",
    x: sliding ? [-half, -slidingMeet] : [slidingMeet, half],
    y: [slidingDoor.frame, slidingDoor.h0 - slidingDoor.frame],
    z: [0, 50],
    stile: slidingDoor.stile,
    railBottom: 60,
    railTop: 60,
    glassZ: [21, 29],
    place: formulaPlacer({
      w0: slidingDoor.w0,
      band: slidingDoor.frame,
      scale: "kx",
      lo: sliding ? `${slidingDoor.frame}` : `widthMm / 2 + ${slidingMeet}`,
      hi: sliding ? `widthMm / 2 - ${slidingMeet}` : `widthMm - ${slidingDoor.frame}`,
      stile: slidingDoor.stile,
      inset: blindInset,
      hinge: sliding ? "lo" : "hi",
    }),
    hinge: sliding ? "lo" : "hi",
    hingeX: () => "start",
    pivotZ: "end",
    postures: [{ suffix: "", axis: null, angle: "0", shown: "true", active: "false" }],
    visible: "true",
    frameMaterial: "Brown",
    glassMaterial: "Glass",
    handles: sliding
      ? [
          {
            name: "Handle",
            material: "Black metal",
            pinY: "start",
            build: (cx) => windowHandle(cx, 1015, 50),
          },
        ]
      : [],
    blind: { material: "Ivory blind", visible: "blinds", inset: blindInset, railHeight: 35, face: false },
    ...(sliding ? { slideX: "slideMm", slideZ: "popMm" } : {}),
  });
};

const slidingDoorDouble: TemplateSpec = {
  id: "sliding-door-double",
  view: "front",
  hostDepthMm: 100,
  metadata: {
    ...wallableBase,
    kind: "door",
    label: "Sliding Balcony Door",
    category: "Openings",
    tags: ["door", "sliding", "balcony", "patio", "two leaf", "blind", "venetian blind"],
    product: {
      description:
        "Two-leaf sliding door: closed, both leaves sit flush either side of a centre post; opening pops the sliding leaf into the room and slides it in front of the fixed one. Each leaf has a venetian blind that tilts open or closed.",
      notes:
        "Flip left/right to slide the other leaf; the blinds are fixed to the leaves and move with them.",
    },
    attachment: { ...wallableBase.attachment, defaultPlacement: { bottomMm: 0 } },
    resize: {
      x: {
        mode: "slice",
        startMm: 70,
        endMm: 70,
        minMm: 1200,
        maxMm: 3600,
        defaultMm: 1660,
        description: "Outer frame width (the wall opening).",
        quickPicks: [1400, 1660, 1800, 2400, 2760],
      },
      y: {
        mode: "slice",
        startMm: 130,
        endMm: 165,
        minMm: 1800,
        maxMm: 2700,
        defaultMm: 2260,
        description: "Outer frame height.",
        quickPicks: [2100, 2200, 2230, 2260, 2400],
      },
      z: { mode: "fitHostDepth", startMm: 0, endMm: 30 },
    },
    flip: { x: true, z: true },
    materialSlots: {
      frame: {
        material: "Brown",
        title: "Frame and leaves",
        choosable: true,
        presets: ["Brown", "Anthracite", "White", "Oak"],
        allowColor: true,
        allowTexture: true,
      },
      glass: glassSlot,
      blind: blindSlot,
      handle: {
        material: "Black metal",
        title: "Handle",
        choosable: true,
        presets: ["Black metal", "Steel"],
        allowColor: true,
        allowTexture: false,
      },
    },
    properties: {
      blinds: blindProperty("Blinds", "Shows a venetian blind on each leaf, on the room side.", true),
      openPct: {
        type: "number",
        title: "Slide open",
        description:
          "How far the sliding leaf is open: up to 10 it pops into the room, then it slides until it is in front of the fixed leaf (100).",
        minimum: 0,
        maximum: 100,
        default: 0,
        "x-homeplan": { editor: "slider", state: true },
      },
      blindsClosed: blindsClosedProperty,
    },
    formulas: {
      kx: `(widthMm - ${2 * slidingDoor.frame}) / ${slidingDoor.w0 - 2 * slidingDoor.frame}`,
      popMm: "min(openPct, 10) * 10",
      // Fully open, the sliding leaf's outer edge (at the frame) reaches the fixed leaf's outer edge.
      slideMm: `max(openPct - 10, 0) / 90 * (widthMm / 2 + ${slidingMeet} - ${slidingDoor.frame})`,
      ...blindFormulas({ heightMm: slidingDoor.h0, bands: 295, pitch: 22, margin: slatMargin }),
    },
  },
  materials: {
    Brown: finish.brown,
    Anthracite: finish.anthracite,
    White: finish.white,
    Oak: finish.oak,
    ...glassMaterials,
    ...blindMaterials,
    "Black metal": finish.blackMetal,
    Steel: finish.steel,
  },
  parts: [
    {
      name: "Frame",
      material: "Brown",
      build: rectFrame(
        -slidingDoor.w0 / 2,
        slidingDoor.w0 / 2,
        0,
        slidingDoor.h0,
        slidingDoor.frame,
        slidingDoor.frame,
        slidingDoor.frame,
        -50,
        50,
      ),
    },
    {
      // Fixed centre post: rigid in x (its centre stays at the middle), full height and wall depth.
      name: "CentrePost",
      material: "Brown",
      rule: { stretch: { y: true, z: true } },
      build: boxes([
        [-slidingDoor.post / 2, slidingDoor.frame, -50],
        [slidingDoor.post / 2, slidingDoor.h0 - slidingDoor.frame, 50],
      ]),
    },
    {
      // Stop strip on the outside face of the post (owner, 2026-11-17: night light leaked through the 13 mm gaps
      // either side of the post): it lies behind both leaves (z −15..0) and overlaps each stile by 15 mm, so
      // the gaps are closed from outside. The sliding leaf pops into the room (+z), clear of it.
      name: "CentreStop",
      material: "Brown",
      rule: { pin: { x: "center", z: "end" }, stretch: { y: true } },
      build: boxes([
        [-(slidingMeet + 15), slidingDoor.frame, -15],
        [slidingMeet + 15, slidingDoor.h0 - slidingDoor.frame, 0],
      ]),
    },
    ...slidingLeaf("sliding"),
    ...slidingLeaf("fixed"),
  ],
};

export const templates: readonly TemplateSpec[] = [
  windowStyle1,
  windowFixedWide,
  doorInterior,
  doorEntrance,
  windowCasement,
  windowFixed,
  interiorDoor,
  doorGlazed,
  balconyDoorDouble,
  slidingDoorDouble,
];
