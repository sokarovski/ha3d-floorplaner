// Viewport-quality PNG export (spec/delivery/rendering-and-exports.md): renders the current camera into an
// offscreen HDR render target at viewport size × scale (capped by the GPU's max texture/renderbuffer size),
// applies the same tone mapping and sRGB output as the canvas in an output pass, and encodes a PNG. Only
// the model layer is rendered: grid, guides, overlays, outlines, and selection highlights are excluded.
import type { Camera, Scene, WebGLRenderer } from "three";
import { Color, HalfFloatType, SRGBColorSpace, UnsignedByteType, WebGLRenderTarget } from "three";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export type PngRender = Readonly<{ blob: Blob; width: number; height: number; capped: boolean }>;

export type PngRequest = Readonly<{
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  viewportWidth: number;
  viewportHeight: number;
  scale: number;
  transparentBackground: boolean;
  background: Color;
  modelLayer: number;
}>;

const gpuSizeLimit = (renderer: WebGLRenderer): number => {
  const context = renderer.getContext();
  const renderbuffer: unknown = context.getParameter(context.MAX_RENDERBUFFER_SIZE);
  const maxTexture = renderer.capabilities.maxTextureSize;
  return typeof renderbuffer === "number" ? Math.min(maxTexture, renderbuffer) : maxTexture;
};

/**
 * Encodes premultiplied RGBA rows (bottom-up) as PNG. With a background, pixels are composited over it in
 * sRGB so the exported background matches the viewport exactly (no tone mapping); without one, alpha is
 * straightened for PNG.
 */
const encodePng = async (
  pixels: Uint8Array,
  width: number,
  height: number,
  background: Color | null,
): Promise<Blob> => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("A 2D canvas is not available for PNG encoding.");
  const image = context.createImageData(width, height);
  const rowBytes = width * 4;
  for (let row = 0; row < height; row += 1) {
    // WebGL rows start at the bottom.
    const source = pixels.subarray((height - 1 - row) * rowBytes, (height - row) * rowBytes);
    image.data.set(source, row * rowBytes);
  }
  const data = image.data;
  if (background !== null) {
    const rgb = background.getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace);
    const back = [rgb.r * 255, rgb.g * 255, rgb.b * 255];
    for (let index = 0; index < data.length; index += 4) {
      const rest = 1 - (data[index + 3] ?? 255) / 255;
      for (let channel = 0; channel < 3; channel += 1)
        data[index + channel] = Math.min(
          255,
          Math.round((data[index + channel] ?? 0) + (back[channel] ?? 0) * rest),
        );
      data[index + 3] = 255;
    }
  } else {
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] ?? 255;
      if (alpha === 0 || alpha === 255) continue;
      const factor = 255 / alpha;
      data[index] = Math.min(255, Math.round((data[index] ?? 0) * factor));
      data[index + 1] = Math.min(255, Math.round((data[index + 1] ?? 0) * factor));
      data[index + 2] = Math.min(255, Math.round((data[index + 2] ?? 0) * factor));
    }
  }
  context.putImageData(image, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error("PNG encoding failed."));
      else resolve(blob);
    }, "image/png");
  });
};

export const renderPng = async (request: PngRequest): Promise<PngRender> => {
  const { renderer, scene, camera } = request;
  const limit = gpuSizeLimit(renderer);
  const requestedWidth = Math.max(1, Math.round(request.viewportWidth * request.scale));
  const requestedHeight = Math.max(1, Math.round(request.viewportHeight * request.scale));
  const fit = Math.min(1, limit / requestedWidth, limit / requestedHeight);
  const width = Math.max(1, Math.floor(requestedWidth * fit));
  const height = Math.max(1, Math.floor(requestedHeight * fit));

  const hdr = new WebGLRenderTarget(width, height, { type: HalfFloatType, samples: 4 });
  const output = new WebGLRenderTarget(width, height, { type: UnsignedByteType });
  const outputPass = new OutputPass();
  const previousTarget = renderer.getRenderTarget();
  const previousBackground = scene.background;
  const previousMask = camera.layers.mask;
  const previousClearColor = renderer.getClearColor(new Color());
  const previousClearAlpha = renderer.getClearAlpha();
  const pixels = new Uint8Array(width * height * 4);
  let readback: Promise<unknown>;
  try {
    camera.layers.set(request.modelLayer);
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(hdr);
    renderer.clear();
    renderer.render(scene, camera);
    outputPass.render(renderer, output, hdr, 0, false);
    // The read is issued synchronously; state is restored before awaiting so viewport frames stay intact.
    readback = renderer.readRenderTargetPixelsAsync(output, 0, 0, width, height, pixels);
  } finally {
    camera.layers.mask = previousMask;
    scene.background = previousBackground;
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    renderer.setRenderTarget(previousTarget);
  }
  try {
    await readback;
    const blob = await encodePng(
      pixels,
      width,
      height,
      request.transparentBackground ? null : request.background,
    );
    return { blob, width, height, capped: fit < 1 };
  } finally {
    outputPass.dispose();
    hdr.dispose();
    output.dispose();
  }
};
