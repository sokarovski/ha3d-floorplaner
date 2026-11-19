// Layout kit for the demo houses (scripts/fixtures/demoHouses/build.ts): rooms authored in floor coordinates as CCW
// polygons with per-edge wall pieces, and placement helpers that put openings, furniture, lights and carpets
// against those walls from template footprints, so nothing is placed by guesswork. Every floor object, door
// clearance and wall-mounted object is recorded, and `checkFloorLayout` reports objects outside their room, objects
// overlapping each other, blocked doors and wall objects off their wall. All furniture is built-in templates.
//
// Conventions (spec/builder/model.md, src/renderer/instanceLayer.ts): plan x right, y up (north when the house's
// north rotation is 0); a floor object's front (template +z) faces (sin θ, −cos θ) for heading θ, so θ = 0 faces
// −y; walls are outside-aligned, so a wall's band lies outside the room outline and an exterior wall's thickness
// does not reduce the room. Neighbouring rooms are one interior wall thickness apart (Full clash).
import { builtInTexturedMaterial, findBuiltInImage } from "../../../shared/domain/house/builtinMaterials";
import { createId } from "../../../shared/domain/ids";
import type { AreaValue, FenceStyle } from "../../../shared/domain/schemas/area";
import type { CarpetValue } from "../../../shared/domain/schemas/carpet";
import type { AreableInstanceValue, WallableInstanceValue } from "../../../shared/domain/schemas/instances";
import type { LightValue } from "../../../shared/domain/schemas/light";
import type { SurfaceMaterialValue } from "../../../shared/domain/schemas/values";
import type { WallValue } from "../../../shared/domain/schemas/wall";
import type { TemplateParameterValue } from "../../../shared/domain/templates/metadata";

export type Pt = Readonly<{ x: number; y: number }>;
export type Params = Readonly<Record<string, TemplateParameterValue>>;
export type Size = Readonly<{ w: number; d: number }>;
export type TemplateRef = Readonly<{ templateId: string; version: number }>;
type Overrides = AreableInstanceValue["materialOverrides"];

/** What the build resolved beforehand: built-in template footprints. */
export type BuildContext = Readonly<{
  /** Plan footprint (template x and z extents, mm) of a built-in template at the given parameters. */
  size: (templateId: string, parameters: Params) => Size;
}>;

/** A built-in template (every built-in used by the demo houses is at version 1). */
export const builtin = (templateId: string): TemplateRef => ({ templateId, version: 1 });

// ---- materials ----------------------------------------------------------------------------------

type Rgb = readonly [number, number, number];

export const paint = (rgb: Rgb, roughness = 0.9): SurfaceMaterialValue => ({
  pbrMetallicRoughness: {
    baseColorFactor: [rgb[0], rgb[1], rgb[2], 1],
    roughnessFactor: roughness,
    metallicFactor: 0,
  },
  extras: { homeplan: { tileSizeMm: { x: 1000, y: 1000 }, rotationDeg: 0, offsetMm: { x: 0, y: 0 } } },
});

/** The demo textures: built-in textured materials (Phase 17.1) by fixture key. */
const textureImages = {
  oak: "builtinimg_oakparquet",
  walnut: "builtinimg_walnut",
  ash: "builtinimg_ashplanks",
  tileGrey: "builtinimg_greytiles",
  tileWhite: "builtinimg_whitetiles",
  terracotta: "builtinimg_terracotta",
  slate: "builtinimg_slatetiles",
  granite: "builtinimg_granite",
  decking: "builtinimg_decking",
  grass: "builtinimg_lawngrass",
  paving: "builtinimg_paving",
} as const;

export type TextureKey = keyof typeof textureImages;

/** A built-in textured material (its preset's values), optionally rotated or tinted. */
export const textured = (
  key: TextureKey,
  options: Readonly<{ rotationDeg?: number; tint?: Rgb }> = {},
): SurfaceMaterialValue => {
  const texture = findBuiltInImage(textureImages[key]);
  if (texture === undefined) throw new Error(`No built-in texture ${textureImages[key]}`);
  return builtInTexturedMaterial(texture, options);
};

/** Wall paints used across the demo houses (linear glTF base colours). */
export const palette = {
  warmWhite: [0.93, 0.91, 0.86],
  chalk: [0.96, 0.95, 0.93],
  greige: [0.8, 0.76, 0.69],
  sage: [0.62, 0.7, 0.58],
  dustyBlue: [0.58, 0.68, 0.76],
  blush: [0.88, 0.72, 0.66],
  butter: [0.94, 0.88, 0.7],
  clay: [0.78, 0.6, 0.5],
  forest: [0.22, 0.36, 0.3],
  charcoal: [0.28, 0.29, 0.31],
  mist: [0.82, 0.86, 0.86],
  hedge: [0.16, 0.3, 0.13],
  stone: [0.84, 0.8, 0.72],
} as const satisfies Record<string, Rgb>;

// ---- frames -------------------------------------------------------------------------------------

/** One built-in `frame` on a wall: a picture (a plain colour stands in for the art) or a mirror. */
export type FrameSpec = Readonly<{
  widthMm: number;
  heightMm: number;
  surface?: "Picture" | "Mirror";
  frameWidthMm?: number;
  matWidthMm?: number;
  lightBar?: boolean;
  /** Frame preset name (default the template's own). */
  framePreset?: string;
  /** The picture's colour. */
  art?: Rgb;
}>;

/** The frame parameters and overrides of a frame spec. */
export const frameInstance = (spec: FrameSpec): Readonly<{ parameters: Params; overrides: Overrides }> => {
  const parameters: Record<string, TemplateParameterValue> = {
    widthMm: spec.widthMm,
    heightMm: spec.heightMm,
    surface: spec.surface ?? "Picture",
  };
  if (spec.frameWidthMm !== undefined) parameters.frameWidthMm = spec.frameWidthMm;
  if (spec.matWidthMm !== undefined) parameters.matWidthMm = spec.matWidthMm;
  if (spec.lightBar !== undefined) parameters.lightBar = spec.lightBar;
  const overrides: Overrides = {};
  if (spec.framePreset !== undefined) overrides.frame = { preset: spec.framePreset };
  if (spec.art !== undefined) overrides.picture = paint(spec.art, 0.8);
  return { parameters, overrides };
};

/** A gallery wall of five frames of mixed sizes and finishes. */
export const galleryFrames: readonly FrameSpec[] = [
  {
    widthMm: 400,
    heightMm: 500,
    frameWidthMm: 20,
    matWidthMm: 50,
    framePreset: "Oak",
    art: [0.7, 0.42, 0.25],
  },
  {
    widthMm: 300,
    heightMm: 300,
    frameWidthMm: 20,
    matWidthMm: 40,
    framePreset: "White",
    art: [0.2, 0.3, 0.45],
  },
  {
    widthMm: 600,
    heightMm: 700,
    frameWidthMm: 25,
    matWidthMm: 80,
    framePreset: "Anthracite",
    art: [0.85, 0.75, 0.55],
  },
  {
    widthMm: 300,
    heightMm: 400,
    frameWidthMm: 20,
    matWidthMm: 40,
    framePreset: "White",
    art: [0.35, 0.5, 0.35],
  },
  {
    widthMm: 400,
    heightMm: 500,
    frameWidthMm: 20,
    matWidthMm: 50,
    framePreset: "Oak",
    art: [0.6, 0.25, 0.3],
  },
];

/** Three small matching pictures. */
export const threePictures: readonly FrameSpec[] = [
  {
    widthMm: 300,
    heightMm: 400,
    frameWidthMm: 18,
    matWidthMm: 45,
    framePreset: "Oak",
    art: [0.55, 0.62, 0.5],
  },
  {
    widthMm: 300,
    heightMm: 400,
    frameWidthMm: 18,
    matWidthMm: 45,
    framePreset: "Oak",
    art: [0.82, 0.66, 0.45],
  },
  {
    widthMm: 300,
    heightMm: 400,
    frameWidthMm: 18,
    matWidthMm: 45,
    framePreset: "Oak",
    art: [0.45, 0.52, 0.65],
  },
];

/** Two small prints in white frames. */
export const twoPrints: readonly FrameSpec[] = [
  {
    widthMm: 250,
    heightMm: 320,
    frameWidthMm: 15,
    matWidthMm: 0,
    framePreset: "White",
    art: [0.68, 0.44, 0.49],
  },
  {
    widthMm: 250,
    heightMm: 320,
    frameWidthMm: 15,
    matWidthMm: 0,
    framePreset: "White",
    art: [0.38, 0.47, 0.4],
  },
];

/** A full-length mirror. */
export const tallMirror: FrameSpec = {
  widthMm: 450,
  heightMm: 1450,
  surface: "Mirror",
  frameWidthMm: 20,
  matWidthMm: 0,
};

/** A bathroom mirror with its light bar. */
export const vanityMirror: FrameSpec = {
  widthMm: 600,
  heightMm: 800,
  surface: "Mirror",
  lightBar: true,
  matWidthMm: 0,
};

// ---- rooms and walls ----------------------------------------------------------------------------

/**
 * `hedge` is a low garden wall (900 mm, 250 mm, stone). `fence` is a yard's fence wall (Phase 17.2): 1000 mm high
 * (the fence height), 100 mm, inside the yard outline; the yard's fence style draws it.
 */
export type WallKind = "ext" | "int" | "none" | "low" | "hedge" | "fence";

/** A wall piece on one edge: `from`/`to` in mm along the edge from its start vertex (absent = the corners). */
export type WallPiece = Readonly<{
  kind: WallKind;
  from?: number;
  to?: number;
  heightMm?: number;
  thicknessMm?: number;
  /** Default outside: the band lies outside the room outline; `inside` keeps it within the room (posts). */
  alignment?: "outside" | "inside";
  /** Both faces' material (posts, feature walls); default: the room paint inside, the facade outside. */
  material?: SurfaceMaterialValue;
}>;

export type EdgeSpec = WallKind | readonly WallPiece[];

export type WallStyle = Readonly<{
  heightMm: number;
  extThicknessMm: number;
  intThicknessMm: number;
  facade: SurfaceMaterialValue;
}>;

type Edge = Readonly<{
  key: string;
  start: Pt;
  end: Pt;
  length: number;
  direction: Pt;
  inward: Pt;
  walls: { wall: WallValue; from: number; to: number }[];
}>;

/** A recorded footprint for the layout check. */
type Footprint = Readonly<{
  label: string;
  room: Room;
  centre: Pt;
  size: Size;
  rotationDeg: number;
  /** Objects sharing a cluster may overlap (chairs tucked under their table, a rug's sofa…). */
  cluster: string | null;
}>;

type Clearance = Readonly<{ label: string; centre: Pt; size: Size; rotationDeg: number }>;

type WallMounted = Readonly<{ label: string; room: Room; edge: Edge; from: number; to: number }>;

/** The rooms and records of one building floor. */
export class FloorPlan {
  readonly rooms: Room[] = [];
  readonly footprints: Footprint[] = [];
  readonly clearances: Clearance[] = [];
  readonly wallMounted: WallMounted[] = [];

  constructor(
    readonly context: BuildContext,
    readonly style: WallStyle,
  ) {}

  room(
    name: string,
    points: readonly Pt[],
    edges: readonly EdgeSpec[],
    interior: SurfaceMaterialValue,
  ): Room {
    const room = new Room(this, name, points, edges, interior);
    this.rooms.push(room);
    return room;
  }

  /** An axis-aligned room; edges in order S (bottom), E, N, W. */
  rect(
    name: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    edges: readonly [EdgeSpec, EdgeSpec, EdgeSpec, EdgeSpec],
    interior: SurfaceMaterialValue,
  ): Room {
    return this.room(
      name,
      [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ],
      edges,
      interior,
    );
  }

  areas(): AreaValue[] {
    return this.rooms.map((room) => room.area);
  }
}

/** Edge indices of a rectangular room. */
export const S = 0;
export const E = 1;
export const N = 2;
export const W = 3;

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;

/** The heading whose front (sin θ, −cos θ) points along `n`, in whole degrees 0–359. */
const headingFacing = (n: Pt): number => {
  const degrees = Math.round((Math.atan2(n.x, -n.y) * 180) / Math.PI);
  return ((degrees % 360) + 360) % 360;
};

export type PlaceOptions = Readonly<{
  name?: string;
  parameters?: Params;
  overrides?: Overrides;
  cluster?: string;
  flipX?: boolean;
}>;

export type LightOptions = Readonly<{
  fixture?: TemplateRef;
  /** Fixture top (or emitter) height above the floor; default: the room's ceiling (wall height). */
  elevationMm?: number;
  lumens?: number;
  kelvin?: number;
  modes?: readonly ("fixedWhite" | "colorTemperature" | "rgb")[];
  linear?: Readonly<{ lengthMm: number; rotationDeg: number; facingDeg?: number }>;
  spot?: Readonly<{ rotationDeg: number; tiltDeg: number; beamAngleDeg: number }>;
}>;

export class Room {
  readonly area: AreaValue;
  readonly origin: Pt;
  readonly edges: Edge[] = [];

  constructor(
    readonly plan: FloorPlan,
    readonly name: string,
    readonly points: readonly Pt[],
    specs: readonly EdgeSpec[],
    interior: SurfaceMaterialValue,
  ) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    this.origin = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
    const shapeId = createId("s");
    const vertices = points.map((p) => ({
      id: createId("v"),
      x: p.x - this.origin.x,
      y: p.y - this.origin.y,
    }));
    this.area = {
      id: createId("a"),
      name,
      positionMm: { ...this.origin },
      rotationDeg: 0,
      floor: {
        id: createId("fs"),
        material: paint([0.78, 0.66, 0.5], 0.7),
        shapes: [{ id: shapeId, type: "polygon", positionMm: { x: 0, y: 0 }, rotationDeg: 0, vertices }],
        carpets: [],
      },
      walls: [],
      objects: [],
      lights: [],
    };
    const style = plan.style;
    points.forEach((start, index) => {
      const end = points[(index + 1) % points.length] ?? start;
      const from = vertices[index];
      const to = vertices[(index + 1) % vertices.length];
      if (from === undefined || to === undefined) return;
      const delta = sub(end, start);
      const length = Math.hypot(delta.x, delta.y);
      const direction = scale(delta, 1 / length);
      const edge: Edge = {
        key: `${from.id}>${to.id}`,
        start,
        end,
        length,
        direction,
        inward: { x: -direction.y, y: direction.x },
        walls: [],
      };
      this.edges.push(edge);
      const spec = specs[index] ?? "none";
      const pieces: readonly WallPiece[] = typeof spec === "string" ? [{ kind: spec }] : spec;
      for (const piece of pieces) {
        if (piece.kind === "none") continue;
        const fromMm = piece.from ?? 0;
        const toMm = piece.to ?? length;
        const thickness =
          piece.thicknessMm ??
          (piece.kind === "ext"
            ? style.extThicknessMm
            : piece.kind === "int"
              ? style.intThicknessMm
              : piece.kind === "hedge"
                ? 250
                : piece.kind === "fence"
                  ? 100
                  : 150);
        const height =
          piece.heightMm ??
          (piece.kind === "low"
            ? 1050
            : piece.kind === "hedge"
              ? 900
              : piece.kind === "fence"
                ? 1000
                : style.heightMm);
        const outer =
          piece.kind === "ext" || piece.kind === "low"
            ? style.facade
            : piece.kind === "hedge"
              ? paint(palette.stone, 0.95)
              : structuredClone(interior);
        const wall: WallValue = {
          id: createId("w"),
          sourceEdge: { shapeId, edge: edge.key },
          spanMm: {
            start: fromMm <= 0.05 ? { anchor: "start", offsetMm: 0 } : { anchor: "start", offsetMm: fromMm },
            end:
              length - toMm <= 0.05
                ? { anchor: "end", offsetMm: 0 }
                : { anchor: "end", offsetMm: length - toMm },
          },
          heightMm: height,
          thicknessMm: thickness,
          alignment: piece.alignment ?? (piece.kind === "fence" ? "inside" : "outside"),
          materials: {
            interior: structuredClone(
              piece.material ?? (piece.kind === "hedge" ? paint(palette.stone, 0.95) : interior),
            ),
            exterior: structuredClone(piece.material ?? outer),
          },
          objects: [],
        };
        this.area.walls.push(wall);
        edge.walls.push({ wall, from: fromMm, to: toMm });
      }
    });
  }

  get context(): BuildContext {
    return this.plan.context;
  }

  /** Makes the room a yard (Phase 17.2): outdoors, no slab or ceiling; its walls draw as `fence` fences. */
  yard(fence: FenceStyle): this {
    this.area.kind = "yard";
    this.area.fence = fence;
    return this;
  }

  floorMaterial(material: SurfaceMaterialValue): this {
    this.area.floor.material = material;
    return this;
  }

  private edge(index: number): Edge {
    const edge = this.edges[index];
    if (edge === undefined) throw new Error(`${this.name}: no edge ${String(index)}`);
    return edge;
  }

  /** Distance along an edge (from its start vertex) of the point whose x (horizontal edge) or y (vertical) is `at`. */
  private alongOf(edge: Edge, at: number): number {
    const horizontal = Math.abs(edge.direction.y) < 1e-9;
    const point = horizontal ? { x: at, y: edge.start.y } : { x: edge.start.x, y: at };
    return dot(sub(point, edge.start), edge.direction);
  }

  private pointAt(edge: Edge, along: number): Pt {
    return add(edge.start, scale(edge.direction, along));
  }

  private wallAt(edge: Edge, along: number, what: string): { wall: WallValue; from: number; to: number } {
    const host = edge.walls.find((piece) => along >= piece.from - 0.5 && along <= piece.to + 0.5);
    if (host === undefined) throw new Error(`${this.name}: no wall for ${what} at ${String(along)} mm`);
    return host;
  }

  private local(point: Pt): Pt {
    return { x: Math.round(point.x - this.origin.x), y: Math.round(point.y - this.origin.y) };
  }

  /** A door or window centred at `at` (x or y in floor coordinates) on the wall of edge `index`. */
  opening(
    index: number,
    at: number,
    templateId: string,
    parameters: Params,
    options: Readonly<{
      bottomMm?: number;
      name?: string;
      flipX?: boolean;
      flipZ?: boolean;
      overrides?: Overrides;
      door?: boolean;
      version?: number;
    }> = {},
  ): this {
    const edge = this.edge(index);
    const along = this.alongOf(edge, at);
    const host = this.wallAt(edge, along, templateId);
    const widthValue = parameters.widthMm;
    const width = typeof widthValue === "number" ? widthValue : 900;
    if (along - width / 2 < host.from - 0.5 || along + width / 2 > host.to + 0.5)
      throw new Error(`${this.name}: ${templateId} at ${String(at)} does not fit its wall`);
    const name = options.name ?? (options.door === true ? `${this.name} door` : `${this.name} window`);
    const instance: WallableInstanceValue = {
      id: createId("o"),
      name,
      templateId,
      templateVersion: options.version ?? 1,
      placement: { distanceAlongWallMm: Math.round(along - host.from), bottomMm: options.bottomMm ?? 0 },
      parameters: { ...parameters },
      flip: { x: options.flipX ?? false, z: options.flipZ ?? false },
      materialOverrides: { ...(options.overrides ?? {}) },
    };
    host.wall.objects.push(instance);
    if (options.door === true) {
      // Keep 800 mm clear in front of the door on both sides of the wall.
      const centre = this.pointAt(edge, along);
      const rotationDeg = headingFacing(edge.inward);
      for (const side of [1, -1])
        this.plan.clearances.push({
          label: `${this.name}: ${name}`,
          centre: add(centre, scale(edge.inward, side * (400 + (side < 0 ? host.wall.thicknessMm : 0)))),
          size: { w: width - 100, d: 760 },
          rotationDeg,
        });
    }
    return this;
  }

  door(
    index: number,
    at: number,
    templateId: string,
    parameters: Params,
    options: Parameters<Room["opening"]>[4] = {},
  ): this {
    return this.opening(index, at, templateId, parameters, { ...options, door: true, bottomMm: 0 });
  }

  window(
    index: number,
    at: number,
    templateId: string,
    parameters: Params,
    bottomMm: number,
    options: Parameters<Room["opening"]>[4] = {},
  ): this {
    return this.opening(index, at, templateId, parameters, { ...options, bottomMm });
  }

  /** A floor object centred at `centre` (floor coordinates), heading `rotationDeg`. */
  place(ref: TemplateRef | string, centre: Pt, rotationDeg: number, options: PlaceOptions = {}): this {
    const template = typeof ref === "string" ? { templateId: ref, version: 1 } : ref;
    const parameters = options.parameters ?? {};
    const size = this.context.size(template.templateId, parameters);
    const name = options.name ?? template.templateId;
    this.area.objects.push({
      id: createId("o"),
      name,
      templateId: template.templateId,
      templateVersion: template.version,
      parameters: { ...parameters },
      flip: { x: options.flipX ?? false, z: false },
      materialOverrides: { ...(options.overrides ?? {}) },
      attachment: { host: "floor" },
      positionMm: this.local(centre),
      elevationMm: 0,
      rotationDeg: ((rotationDeg % 360) + 360) % 360,
    });
    this.plan.footprints.push({
      label: `${this.name}: ${name}`,
      room: this,
      centre,
      size,
      rotationDeg,
      cluster: options.cluster ?? null,
    });
    return this;
  }

  /**
   * A floor object with its back against the wall of edge `index`, centred at `at` along it, `gapMm` off the
   * wall face and facing into the room.
   */
  against(
    index: number,
    at: number,
    ref: TemplateRef | string,
    options: PlaceOptions & { gapMm?: number } = {},
  ): this {
    const edge = this.edge(index);
    const template = typeof ref === "string" ? { templateId: ref, version: 1 } : ref;
    const size = this.context.size(template.templateId, options.parameters ?? {});
    const onEdge = this.pointAt(edge, this.alongOf(edge, at));
    const centre = add(onEdge, scale(edge.inward, size.d / 2 + (options.gapMm ?? 0)));
    return this.place(template, centre, headingFacing(edge.inward), options);
  }

  /** The heading that faces a floor object towards the wall of edge `index` (front pointing at the wall). */
  facingWall(index: number): number {
    return headingFacing(scale(this.edge(index).inward, -1));
  }

  /** The heading that faces away from the wall of edge `index` into the room. */
  fromWall(index: number): number {
    return headingFacing(this.edge(index).inward);
  }

  /** A wall-mounted object (back on the wall's room face) centred at `at`, its bottom `elevationMm` up. */
  onWall(
    index: number,
    at: number,
    ref: TemplateRef | string,
    elevationMm: number,
    options: PlaceOptions = {},
  ): this {
    const edge = this.edge(index);
    const template = typeof ref === "string" ? { templateId: ref, version: 1 } : ref;
    const along = this.alongOf(edge, at);
    const host = this.wallAt(edge, along, template.templateId);
    const size = this.context.size(template.templateId, options.parameters ?? {});
    const name = options.name ?? template.templateId;
    this.area.objects.push({
      id: createId("o"),
      name,
      templateId: template.templateId,
      templateVersion: template.version,
      parameters: { ...(options.parameters ?? {}) },
      flip: { x: options.flipX ?? false, z: false },
      materialOverrides: { ...(options.overrides ?? {}) },
      attachment: { host: "wall", wallId: host.wall.id, hostSide: "interior" },
      positionMm: { x: Math.round(along - host.from), y: 0 },
      elevationMm,
      rotationDeg: 0,
    });
    this.plan.wallMounted.push({
      label: `${this.name}: ${name}`,
      room: this,
      edge,
      from: along - size.w / 2,
      to: along + size.w / 2,
    });
    // Units standing on the floor against the wall (kitchen units, appliances) also take floor space.
    if (elevationMm < 300) {
      const onEdge = this.pointAt(edge, along);
      this.plan.footprints.push({
        label: `${this.name}: ${name}`,
        room: this,
        centre: add(onEdge, scale(edge.inward, size.d / 2)),
        size,
        rotationDeg: headingFacing(edge.inward),
        cluster: options.cluster ?? null,
      });
    }
    return this;
  }

  /** A run of wall-mounted units side by side along the wall of edge `index`, starting at `from` (x or y). */
  run(
    index: number,
    from: number,
    units: readonly (Readonly<{ ref: TemplateRef | string; elevationMm?: number; gapMm?: number }> &
      PlaceOptions)[],
  ): number {
    const edge = this.edge(index);
    let along = this.alongOf(edge, from);
    const horizontal = Math.abs(edge.direction.y) < 1e-9;
    for (const unit of units) {
      const template = typeof unit.ref === "string" ? { templateId: unit.ref, version: 1 } : unit.ref;
      const size = this.context.size(template.templateId, unit.parameters ?? {});
      along += unit.gapMm ?? 0;
      const centre = this.pointAt(edge, along + size.w / 2);
      this.onWall(index, horizontal ? centre.x : centre.y, template, unit.elevationMm ?? 0, unit);
      along += size.w;
    }
    const end = this.pointAt(edge, along);
    return horizontal ? end.x : end.y;
  }

  /** One built-in frame on the wall of edge `index`, centred at `at`, its bottom `elevationMm` up. */
  frame(index: number, at: number, spec: FrameSpec, elevationMm: number, name: string): this {
    return this.onWall(index, at, "frame", elevationMm, { name, ...frameInstance(spec) });
  }

  /**
   * A row of frames on the wall of edge `index`, centred as a row at `at`, `gapMm` apart, each frame's centre
   * `centreMm` above the floor. Frame k is named `${name} k`.
   */
  frames(
    index: number,
    at: number,
    specs: readonly FrameSpec[],
    centreMm: number,
    name: string,
    gapMm = 120,
  ): this {
    const edge = this.edge(index);
    const horizontal = Math.abs(edge.direction.y) < 1e-9;
    const total = specs.reduce((sum, spec) => sum + spec.widthMm, 0) + gapMm * (specs.length - 1);
    let along = this.alongOf(edge, at) - total / 2;
    specs.forEach((spec, position) => {
      const centre = this.pointAt(edge, along + spec.widthMm / 2);
      const elevation = Math.round(centreMm - spec.heightMm / 2);
      this.frame(index, horizontal ? centre.x : centre.y, spec, elevation, `${name} ${String(position + 1)}`);
      along += spec.widthMm + gapMm;
    });
    return this;
  }

  /** A light; with a fixture its top hangs at the ceiling unless `elevationMm` says otherwise. */
  light(name: string, centre: Pt, options: LightOptions = {}): this {
    const modes = options.modes ?? ["fixedWhite", "colorTemperature"];
    const kelvin = options.kelvin ?? 2700;
    const light: LightValue = {
      id: createId("l"),
      name,
      fixture:
        options.fixture === undefined
          ? null
          : { templateId: options.fixture.templateId, templateVersion: options.fixture.version },
      fixtureVisible: true,
      geometry:
        options.linear === undefined
          ? { type: options.spot === undefined ? "point" : "spot", lengthMm: 1000, widthMm: 12 }
          : {
              type: "linear",
              lengthMm: options.linear.lengthMm,
              widthMm: 12,
              ...(options.linear.facingDeg === undefined ? {} : { facingDeg: options.linear.facingDeg }),
            },
      positionMm: this.local(centre),
      elevationMm: options.elevationMm ?? this.plan.style.heightMm,
      rotationDeg: options.linear?.rotationDeg ?? options.spot?.rotationDeg ?? 0,
      spot: {
        tiltDeg: options.spot?.tiltDeg ?? 0,
        beamAngleDeg: options.spot?.beamAngleDeg ?? 40,
        softEdge: 0.4,
      },
      renderCapabilities: { colorModes: [...modes] },
      defaults: {
        enabled: true,
        brightness: 1,
        outputLumens: options.lumens ?? 1200,
        color: modes.includes("colorTemperature")
          ? { mode: "colorTemperature", kelvin, rgb: [255, 255, 255] }
          : { mode: modes[0] ?? "fixedWhite", kelvin, rgb: [255, 255, 255] },
      },
    };
    this.area.lights.push(light);
    return this;
  }

  /** A rectangular rug centred at `centre`. */
  rug(
    name: string,
    centre: Pt,
    width: number,
    depth: number,
    material: SurfaceMaterialValue,
    rotationDeg = 0,
  ): this {
    const carpet: CarpetValue = {
      id: createId("c"),
      name,
      positionMm: this.local(centre),
      rotationDeg,
      material,
      shapes: [
        {
          id: createId("s"),
          type: "rectangle",
          positionMm: { x: 0, y: 0 },
          rotationDeg: 0,
          widthMm: width,
          heightMm: depth,
        },
      ],
    };
    this.area.floor.carpets.push(carpet);
    return this;
  }

  /** Appends any prepared object (a stair, a floor opening) as is. */
  object(
    instance: AreableInstanceValue,
    footprint?: Readonly<{ centre: Pt; size: Size; rotationDeg: number }>,
  ): this {
    this.area.objects.push(instance);
    if (footprint !== undefined)
      this.plan.footprints.push({
        label: `${this.name}: ${instance.name}`,
        room: this,
        ...footprint,
        cluster: null,
      });
    return this;
  }

  /** Floor coordinates → this room's local frame (for prepared objects). */
  toLocal(point: Pt): Pt {
    return this.local(point);
  }
}

// ---- layout check -------------------------------------------------------------------------------

type Rect = readonly Pt[];

const corners = (centre: Pt, size: Size, rotationDeg: number, inset = 0): Rect => {
  const radians = (rotationDeg * Math.PI) / 180;
  const across = { x: Math.cos(radians), y: Math.sin(radians) };
  const front = { x: Math.sin(radians), y: -Math.cos(radians) };
  const hw = Math.max(0, size.w / 2 - inset);
  const hd = Math.max(0, size.d / 2 - inset);
  return [
    add(add(centre, scale(across, -hw)), scale(front, -hd)),
    add(add(centre, scale(across, hw)), scale(front, -hd)),
    add(add(centre, scale(across, hw)), scale(front, hd)),
    add(add(centre, scale(across, -hw)), scale(front, hd)),
  ];
};

const overlap = (a: Rect, b: Rect): boolean => {
  for (const shape of [a, b])
    for (let i = 0; i < shape.length; i += 1) {
      const p = shape[i] ?? { x: 0, y: 0 };
      const q = shape[(i + 1) % shape.length] ?? p;
      const axis = { x: -(q.y - p.y), y: q.x - p.x };
      const project = (rect: Rect): [number, number] => {
        const values = rect.map((point) => dot(point, axis));
        return [Math.min(...values), Math.max(...values)];
      };
      const [aMin, aMax] = project(a);
      const [bMin, bMax] = project(b);
      if (aMax <= bMin || bMax <= aMin) return false;
    }
  return true;
};

const inside = (point: Pt, ring: readonly Pt[]): boolean => {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i] ?? point;
    const b = ring[j] ?? point;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x)
      result = !result;
  }
  return result;
};

/** Problems with a floor's furnishing: objects outside their room, overlapping, blocking doors, off their wall. */
export const checkFloorLayout = (plan: FloorPlan): string[] => {
  const problems: string[] = [];
  const rects = plan.footprints.map((footprint) =>
    corners(footprint.centre, footprint.size, footprint.rotationDeg, 2),
  );
  plan.footprints.forEach((footprint, index) => {
    const rect = rects[index] ?? [];
    if (!rect.every((point) => inside(point, footprint.room.points)))
      problems.push(`${footprint.label} is not inside its room`);
    for (let other = index + 1; other < plan.footprints.length; other += 1) {
      const second = plan.footprints[other];
      if (second === undefined) continue;
      if (footprint.cluster !== null && footprint.cluster === second.cluster) continue;
      if (overlap(rect, rects[other] ?? [])) problems.push(`${footprint.label} overlaps ${second.label}`);
    }
    for (const clearance of plan.clearances)
      if (overlap(rect, corners(clearance.centre, clearance.size, clearance.rotationDeg)))
        problems.push(`${footprint.label} blocks ${clearance.label}`);
  });
  for (const mounted of plan.wallMounted)
    if (!mounted.edge.walls.some((piece) => mounted.from >= piece.from - 1 && mounted.to <= piece.to + 1))
      problems.push(`${mounted.label} is not on its wall`);
  return problems;
};
