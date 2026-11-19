// Shared picking contract: scene layers expose objects with a resolver from a ray hit to a PickHit.
import type { Intersection, Object3D } from "three";
import type { PickHit } from "./runtimeTypes";

export type PickResolver = (hit: Intersection) => PickHit | null;

/** Objects of one layer and how a hit on each resolves. */
export type PickTargets = ReadonlyMap<Object3D, PickResolver>;
