// Narrow, guard-based access to glTF JSON (no casts): nodes, scenes, materials, extras, URIs.
import { isRecord } from "../lib/json";
import type { JsonRecord } from "../lib/json";

export const recordArray = (value: unknown): JsonRecord[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

export const gltfNodes = (gltf: JsonRecord): JsonRecord[] => recordArray(gltf.nodes);
export const gltfMaterials = (gltf: JsonRecord): JsonRecord[] => recordArray(gltf.materials);

export const nameOf = (item: JsonRecord): string => (typeof item.name === "string" ? item.name : "");

export const indexArray = (value: unknown): number[] =>
  Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isInteger(item))
    : [];

/** The default scene record, or undefined. */
export const defaultScene = (gltf: JsonRecord): JsonRecord | undefined => {
  const scenes = recordArray(gltf.scenes);
  const index = typeof gltf.scene === "number" ? gltf.scene : 0;
  return scenes[index];
};

export const homeplanOf = (item: JsonRecord): unknown =>
  isRecord(item.extras) ? item.extras.homeplan : undefined;

/** Sets (or, with undefined, removes) `extras.homeplan`, keeping other extras keys. */
export const setHomeplan = (item: JsonRecord, value: unknown): void => {
  const extras: JsonRecord = isRecord(item.extras) ? { ...item.extras } : {};
  if (value === undefined) delete extras.homeplan;
  else extras.homeplan = value;
  if (Object.keys(extras).length === 0) delete item.extras;
  else item.extras = extras;
};

/** Every `uri` of buffers and images. */
export const resourceUris = (gltf: JsonRecord): string[] =>
  [...recordArray(gltf.buffers), ...recordArray(gltf.images)].flatMap((item) =>
    typeof item.uri === "string" ? [item.uri] : [],
  );

export const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
