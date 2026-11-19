// Shared materials for guides and tool overlays: solid/dashed lines per tone, screen-sized point markers,
// and translucent fills. Dash lengths are kept constant in screen pixels via setDashScale.
import {
  CanvasTexture,
  Color,
  DoubleSide,
  LineBasicMaterial,
  LineDashedMaterial,
  MeshBasicMaterial,
  PointsMaterial,
  SRGBColorSpace,
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { HelperPalette } from "./helperPalette";
import type { OverlayTone } from "./runtimeTypes";

export type MarkerShape =
  | "dot"
  | "cross"
  | "light"
  | "dotBold"
  | "crossBold"
  /** Light pins (Phase 5.11): a disc with the light type's icon cut out. */
  | "pinPoint"
  | "pinSpot"
  | "pinLinear";

export type HelperMaterials = Readonly<{
  line: (tone: OverlayTone, dashed: boolean) => LineBasicMaterial;
  /** A screen-space line `widthPx` CSS pixels wide (Phase 19.5: roof outlines, break lines, hole outlines). */
  wideLine: (tone: OverlayTone, dashed: boolean, widthPx: number) => LineMaterial;
  marker: (shape: MarkerShape, tone: OverlayTone, sizePx: number) => PointsMaterial;
  /** A new fill material owned by the caller (dispose it with the primitive). */
  fill: (tone: OverlayTone, opacity: number) => MeshBasicMaterial;
  setPalette: (palette: HelperPalette) => void;
  /** Millimetres per CSS pixel at the view target; dashed lines keep a constant on-screen rhythm. */
  setDashScale: (mmPerPixel: number) => void;
  setPixelRatio: (pixelRatio: number) => void;
  /** The drawing buffer's size in CSS px (wide lines are measured against it). */
  setResolution: (width: number, height: number) => void;
  dispose: () => void;
}>;

const dashPx = 9;
const gapPx = 6;
export const helperRenderOrder = 20;

const markerTexture = (shape: MarkerShape): CanvasTexture => {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.strokeStyle = "#ffffff";
    context.fillStyle = "#ffffff";
    context.lineCap = "round";
    if (shape === "pinPoint" || shape === "pinSpot" || shape === "pinLinear") {
      // A filled disc (tinted by the tone) with the type's icon cut out, readable on any background.
      context.beginPath();
      context.arc(size / 2, size / 2, size * 0.47, 0, Math.PI * 2);
      context.fill();
      context.globalCompositeOperation = "destination-out";
      context.lineWidth = size * 0.08;
      context.lineJoin = "round";
      if (shape === "pinPoint") {
        // A bulb: round glass over a short base.
        context.beginPath();
        context.arc(size / 2, size * 0.42, size * 0.17, 0, Math.PI * 2);
        context.fill();
        context.fillRect(size * 0.42, size * 0.58, size * 0.16, size * 0.14);
      } else if (shape === "pinSpot") {
        // A spot: a cone widening downward.
        context.beginPath();
        context.moveTo(size * 0.42, size * 0.24);
        context.lineTo(size * 0.58, size * 0.24);
        context.lineTo(size * 0.74, size * 0.74);
        context.lineTo(size * 0.26, size * 0.74);
        context.closePath();
        context.fill();
      } else {
        // A linear strip: a long bar.
        context.fillRect(size * 0.2, size * 0.43, size * 0.6, size * 0.14);
      }
      context.globalCompositeOperation = "source-over";
    } else if (shape === "light") {
      context.lineWidth = size * 0.08;
      context.beginPath();
      context.arc(size / 2, size / 2, size * 0.2, 0, Math.PI * 2);
      context.fill();
      for (let ray = 0; ray < 8; ray += 1) {
        const angle = (ray * Math.PI) / 4;
        context.moveTo(size / 2 + Math.cos(angle) * size * 0.3, size / 2 + Math.sin(angle) * size * 0.3);
        context.lineTo(size / 2 + Math.cos(angle) * size * 0.46, size / 2 + Math.sin(angle) * size * 0.46);
      }
      context.stroke();
    } else if (shape === "dot" || shape === "dotBold") {
      // Bold (hovered handle): the same sprite size, filled further out so it reads heavier.
      context.beginPath();
      context.arc(size / 2, size / 2, size * (shape === "dotBold" ? 0.44 : 0.3), 0, Math.PI * 2);
      context.fill();
    } else {
      context.lineWidth = size * (shape === "crossBold" ? 0.22 : 0.12);
      context.beginPath();
      context.moveTo(size * 0.2, size * 0.2);
      context.lineTo(size * 0.8, size * 0.8);
      context.moveTo(size * 0.8, size * 0.2);
      context.lineTo(size * 0.2, size * 0.8);
      context.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

export const createHelperMaterials = (initialPalette: HelperPalette): HelperMaterials => {
  let palette = initialPalette;
  let pixelRatio = 1;
  let mmPerPixel = 10;
  const lines = new Map<string, Readonly<{ material: LineBasicMaterial; tone: OverlayTone }>>();
  const markers = new Map<
    string,
    Readonly<{ material: PointsMaterial; tone: OverlayTone; sizePx: number }>
  >();
  const wideLines = new Map<string, Readonly<{ material: LineMaterial; tone: OverlayTone }>>();
  let resolution = { width: 1, height: 1 };
  const textures: Record<MarkerShape, CanvasTexture> = {
    dot: markerTexture("dot"),
    cross: markerTexture("cross"),
    light: markerTexture("light"),
    dotBold: markerTexture("dotBold"),
    crossBold: markerTexture("crossBold"),
    pinPoint: markerTexture("pinPoint"),
    pinSpot: markerTexture("pinSpot"),
    pinLinear: markerTexture("pinLinear"),
  };

  const toneColor = (tone: OverlayTone): Color => new Color(palette.tones[tone]);

  const applyDash = (material: LineDashedMaterial): void => {
    material.dashSize = dashPx * mmPerPixel;
    material.gapSize = gapPx * mmPerPixel;
  };

  return {
    line: (tone, dashed) => {
      const key = `${tone}|${dashed ? "dashed" : "solid"}`;
      const existing = lines.get(key);
      if (existing !== undefined) return existing.material;
      const options = {
        color: toneColor(tone),
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      };
      const material = dashed ? new LineDashedMaterial(options) : new LineBasicMaterial(options);
      if (material instanceof LineDashedMaterial) applyDash(material);
      lines.set(key, { material, tone });
      return material;
    },
    wideLine: (tone, dashed, widthPx) => {
      const key = `${tone}|${dashed ? "dashed" : "solid"}|${String(widthPx)}`;
      const existing = wideLines.get(key);
      if (existing !== undefined) return existing.material;
      const material = new LineMaterial({
        color: toneColor(tone).getHex(),
        linewidth: widthPx,
        worldUnits: false,
        dashed,
        dashSize: dashPx * mmPerPixel,
        gapSize: gapPx * mmPerPixel,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      material.resolution.set(resolution.width, resolution.height);
      wideLines.set(key, { material, tone });
      return material;
    },
    marker: (shape, tone, sizePx) => {
      const key = `${shape}|${tone}|${String(sizePx)}`;
      const existing = markers.get(key);
      if (existing !== undefined) return existing.material;
      const material = new PointsMaterial({
        color: toneColor(tone),
        map: textures[shape],
        size: sizePx * pixelRatio,
        sizeAttenuation: false,
        transparent: true,
        alphaTest: 0.05,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      markers.set(key, { material, tone, sizePx });
      return material;
    },
    fill: (tone, opacity) =>
      new MeshBasicMaterial({
        color: toneColor(tone),
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
    setPalette: (next) => {
      palette = next;
      for (const entry of lines.values()) entry.material.color.set(next.tones[entry.tone]);
      for (const entry of markers.values()) entry.material.color.set(next.tones[entry.tone]);
      for (const entry of wideLines.values()) entry.material.color.set(next.tones[entry.tone]);
    },
    setDashScale: (next) => {
      mmPerPixel = next;
      for (const entry of lines.values())
        if (entry.material instanceof LineDashedMaterial) applyDash(entry.material);
      for (const entry of wideLines.values()) {
        entry.material.dashSize = dashPx * next;
        entry.material.gapSize = gapPx * next;
      }
    },
    setPixelRatio: (next) => {
      pixelRatio = next;
      for (const entry of markers.values()) entry.material.size = entry.sizePx * next;
    },
    setResolution: (width, height) => {
      resolution = { width: Math.max(1, width), height: Math.max(1, height) };
      for (const entry of wideLines.values())
        entry.material.resolution.set(resolution.width, resolution.height);
    },
    dispose: () => {
      for (const entry of lines.values()) entry.material.dispose();
      for (const entry of wideLines.values()) entry.material.dispose();
      wideLines.clear();
      for (const entry of markers.values()) entry.material.dispose();
      textures.dot.dispose();
      textures.cross.dispose();
      textures.light.dispose();
      lines.clear();
      markers.clear();
    },
  };
};
