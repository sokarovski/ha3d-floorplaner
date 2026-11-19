// Output contract of RealAllWalls (spec/builder/features/shared-walls.md#face-ownership-and-materials).
import type { AreaValue } from "@shared/domain/schemas/area";
import type { WallableInstanceValue } from "@shared/domain/schemas/instances";
import type { WallValue } from "@shared/domain/schemas/wall";
import type { MeshBuffers } from "./meshData";
import type { ReliefPrism } from "./wallReliefs";
import type { Region, Ring } from "./region";
import type { RoofLimit } from "./roofLimit";
import type { Vec2 } from "./vector";
import type { BandFace, OrphanReason, RealWall, WallFaceRef, WallSide } from "./wallBands";

/** One RealWall band piece placed on the floor. */
export type FloorBand = Readonly<{
  wallId: string;
  areaId: string;
  heightMm: number;
  ring: Ring;
  faces: readonly BandFace[];
  wall: RealWall;
}>;

/** Opening size from its template (the geometry core does not load templates). */
export type OpeningSize = Readonly<{ widthMm: number; heightMm: number }>;

export type OpeningSizeResolver = (
  opening: WallableInstanceValue,
  wall: WallValue,
  area: AreaValue,
) => OpeningSize | null;

/** An opening's cut: a vertical prism through the full merged depth at its location. */
export type OpeningPrism = Readonly<{
  openingId: string;
  wallId: string;
  areaId: string;
  /** Plan footprint (floor coordinates) spanning every parallel band that touches or overlaps the host here. */
  footprint: Ring;
  bottomMm: number;
  topMm: number;
  /** Along-edge extent on the host's source edge, mm from its start vertex. */
  alongFromMm: number;
  alongToMm: number;
}>;

/** A piece of a slice outline and the band face it lies on; null = no face (junction cap or opening reveal). */
export type ClassifiedEdge = Readonly<{ start: Vec2; end: Vec2; owner: WallFaceRef | null }>;

/** One height band of the 2.5D construction: everything between bottomMm and topMm has the same footprint. */
export type HeightSlice = Readonly<{
  bottomMm: number;
  topMm: number;
  footprint: Region;
  edges: readonly ClassifiedEdge[];
}>;

export type WallMaterialOwner =
  | Readonly<{ kind: "wallSide"; wallId: string; areaId: string; side: WallSide; reliefId?: string }>
  | Readonly<{ kind: "cap" }>;

/** A contiguous index range drawn with one material (BufferGeometry.addGroup). */
export type WallMeshGroup = Readonly<{ material: WallMaterialOwner; start: number; count: number }>;

export type RealAllWallsMesh = MeshBuffers &
  Readonly<{
    groups: readonly WallMeshGroup[];
    /** Per triangle: index into faceRefs, or −1 for faces without an owning wall face (junction caps, tops, reveals, sills). */
    triangleFaces: Int32Array;
    faceRefs: readonly WallFaceRef[];
  }>;

export type WallGeometryIssue =
  | Readonly<{ kind: "orphanWall"; wallId: string; areaId: string; reason: OrphanReason }>
  | Readonly<{ kind: "intrusion"; wallId: string; areaId: string; intrudedAreaId: string; areaMm2: number }>
  | Readonly<{ kind: "ambiguousOwnership"; wallIds: readonly string[]; areaIds: readonly string[]; at: Vec2 }>
  | Readonly<{ kind: "openingDoesNotFit"; openingId: string; wallId: string }>
  | Readonly<{ kind: "openingUnsized"; openingId: string; wallId: string }>
  | Readonly<{ kind: "openingConflict"; openingIds: readonly [string, string] }>
  | Readonly<{ kind: "reliefDoesNotFit"; reliefId: string; wallId: string }>
  | Readonly<{ kind: "reliefOnCurvedWall"; reliefId: string; wallId: string }>
  | Readonly<{ kind: "reliefTooDeep"; reliefId: string; wallId: string }>;

export type RealAllWalls = Readonly<{
  floorId: string;
  /** The floor's roof in Cuts walls mode, applied to the mesh (Phase 19.2), or null. */
  roofLimit: RoofLimit | null;
  bands: readonly FloorBand[];
  openings: readonly OpeningPrism[];
  /** Boxes (added) and niches (cut) on wall faces (Phase 5.0). */
  reliefs: readonly ReliefPrism[];
  slices: readonly HeightSlice[];
  mesh: RealAllWallsMesh;
  issues: readonly WallGeometryIssue[];
}>;
