// Shared WebGLRenderer configuration for the viewport and the template preview: sRGB output, the preview tone
// mapping (AgX since Phase 8.9, shared with the HA viewer; see lighting.ts), PCF shadows. Returns an error
// message instead of throwing when WebGL2 cannot be used.
import { PCFShadowMap, SRGBColorSpace, WebGLRenderer } from "three";
import { previewToneMapping } from "./lighting";
import { webgl2Unavailable } from "./webglSupport";

export const maxPixelRatio = 2;

export const createWebGlRenderer = (): WebGLRenderer | string => {
  const unavailable = webgl2Unavailable();
  if (unavailable !== null) return unavailable;
  try {
    const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = previewToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    return renderer;
  } catch (error) {
    return error instanceof Error ? error.message : "The WebGL renderer could not be created.";
  }
};
