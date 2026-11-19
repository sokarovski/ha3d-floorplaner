// Optional authenticated bytes are injected by a host; no HA/store/React dependency enters the renderer.
import { LoadingManager } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

export type AssetReader = (url: string) => Promise<Blob>;

export const readGltf = async (url: string, read: AssetReader): Promise<GLTF> => {
  const blob = await read(url);
  const bytes = await blob.arrayBuffer();
  const data = new DataView(bytes);
  let jsonText: string;
  if (bytes.byteLength >= 20 && data.getUint32(0, true) === 0x46546c67) {
    const length = data.getUint32(12, true);
    if (data.getUint32(16, true) !== 0x4e4f534a || length > bytes.byteLength - 20)
      throw new Error("Invalid GLB JSON chunk.");
    jsonText = new TextDecoder().decode(new Uint8Array(bytes, 20, length));
  } else jsonText = new TextDecoder().decode(bytes);
  const json: unknown = JSON.parse(jsonText);
  const uris = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (key === "uri" && typeof item === "string" && !item.startsWith("data:"))
        uris.add(new URL(item, url).href);
      else visit(item);
    }
  };
  visit(json);
  const urls = new Map<string, string>();
  try {
    for (const uri of uris) urls.set(uri, URL.createObjectURL(await read(uri)));
    const manager = new LoadingManager();
    manager.setURLModifier((uri) => {
      if (uri.startsWith("blob:") || uri.startsWith("data:")) return uri;
      const replacement = urls.get(new URL(uri, url).href);
      if (replacement === undefined) throw new Error("Unlisted template dependency.");
      return replacement;
    });
    return await new GLTFLoader(manager).parseAsync(bytes, new URL(".", url).href);
  } finally {
    for (const uri of urls.values()) URL.revokeObjectURL(uri);
  }
};
