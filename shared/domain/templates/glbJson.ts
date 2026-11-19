// Reads the JSON chunk of a GLB (glTF binary) without a 3D library, to get scene extras (Homeplan metadata).

const magicGlTF = 0x46546c67;
const chunkJson = 0x4e4f534a;

export const readGlbJson = (buffer: ArrayBuffer): unknown => {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== magicGlTF) throw new Error("Not a GLB file.");
  const length = view.getUint32(12, true);
  const type = view.getUint32(16, true);
  if (type !== chunkJson) throw new Error("The GLB has no JSON chunk.");
  const text = new TextDecoder().decode(new Uint8Array(buffer, 20, length));
  const parsed: unknown = JSON.parse(text);
  return parsed;
};

/** The scene-level extras of the default scene of a glTF JSON document. */
export const sceneExtras = (gltf: unknown): unknown => {
  if (typeof gltf !== "object" || gltf === null || !("scenes" in gltf) || !Array.isArray(gltf.scenes))
    return undefined;
  const sceneIndex = "scene" in gltf && typeof gltf.scene === "number" ? gltf.scene : 0;
  const scene: unknown = gltf.scenes[sceneIndex];
  return typeof scene === "object" && scene !== null && "extras" in scene ? scene.extras : undefined;
};
