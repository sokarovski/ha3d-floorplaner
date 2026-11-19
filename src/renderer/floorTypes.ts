// Plain data types of the floor scene, kept apart from floorScene.ts (which needs the DOM through its texture
// cache) so pure modules and the Node checks can use them.
import type { Bounds, Region } from "@shared/geometry/region";

export type FloorBounds = Bounds & Readonly<{ maxHeightMm: number }>;

/** A room under a shadow-only ceiling (Phase 15.5): its outline and ceiling height. */
export type IndoorRoom = Readonly<{ areaId: string; outline: Region; ceilingMm: number }>;
/** The indoor rooms; `version` changes whenever the list does. */
export type IndoorRooms = Readonly<{ version: number; rooms: readonly IndoorRoom[] }>;
