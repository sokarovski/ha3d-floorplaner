// TV screens (Phase 8.8, 15.2, spec/home-assistant/bindings.md#tv-screens): an object bound to a `media_player` shows,
// while the player is on, what it is running: the label (app, else live-TV channel, else input, else "On"; see
// tvLabel.ts) alone on a dark card, or over the entity's artwork (`entity_picture`) as a small strip along its
// bottom edge. Off, standby, unavailable, or a failing `visibleWhen` show the authored dark screen. A picture is
// loaded only when the picture changes, so unrelated attribute updates (position, volume) cost nothing.
import type { ScreenImage } from "../src/renderer/screenLayer";
import type { HassEntity } from "./hassStore";
import { tvContent } from "./tvLabel";

/** The text picture's size (px, 16:9) and look (implementation conventions). */
const textWidthPx = 640;
const textHeightPx = 360;
const textBackground = "#07080c";
const textColor = "#f2f4f8";

export type TvScreens = Readonly<{
  /** Re-evaluates one object's screen from its bound entity (null: none) and whether its binding is shown. */
  update: (objectId: string, entity: HassEntity | undefined, shown: boolean) => void;
  /** Darkens every screen it lit (new bindings or a new house). */
  clear: () => void;
}>;

type Want = Readonly<{ key: string; picture: string | null; label: string }>;

/** What a media_player's screen should show now, or null for dark. */
const wanted = (entity: HassEntity | undefined, shown: boolean): Want | null => {
  if (entity === undefined || !shown) return null;
  const content = tvContent(entity.entity_id, entity.state, entity.attributes);
  if (content === null) return null;
  // HA serves entity pictures relative to its own origin (the panel runs on HA's page, so this is same-origin).
  const picture = content.picture === null ? null : new URL(content.picture, window.location.href).href;
  return {
    key: picture === null ? `text:${content.label}` : `picture:${picture}|${content.label}`,
    picture,
    label: content.label,
  };
};

/** The strip along the artwork's bottom edge (implementation convention). */
const stripHeightPx = 56;

/** The artwork filling the 16:9 card (cropped to cover) with the label on a dark strip along its bottom edge. */
const artworkImage = (artwork: ScreenImage, label: string): ScreenImage | null => {
  const canvas = document.createElement("canvas");
  canvas.width = textWidthPx;
  canvas.height = textHeightPx;
  const context = canvas.getContext("2d");
  if (context === null) return null;
  context.fillStyle = textBackground;
  context.fillRect(0, 0, textWidthPx, textHeightPx);
  const scale = Math.max(textWidthPx / artwork.width, textHeightPx / artwork.height);
  const width = artwork.width * scale;
  const height = artwork.height * scale;
  context.drawImage(artwork.source, (textWidthPx - width) / 2, (textHeightPx - height) / 2, width, height);
  context.fillStyle = "rgba(7, 8, 12, 0.78)";
  context.fillRect(0, textHeightPx - stripHeightPx, textWidthPx, stripHeightPx);
  let size = 30;
  const font = (px: number): string => `600 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  context.font = font(size);
  while (size > 14 && context.measureText(label).width > textWidthPx * 0.9) {
    size -= 2;
    context.font = font(size);
  }
  context.fillStyle = textColor;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, textWidthPx / 2, textHeightPx - stripHeightPx / 2, textWidthPx * 0.94);
  return { source: canvas, width: textWidthPx, height: textHeightPx };
};

/** The app name centered on a dark 16:9 card, shrunk to fit. */
const textImage = (label: string): ScreenImage | null => {
  const canvas = document.createElement("canvas");
  canvas.width = textWidthPx;
  canvas.height = textHeightPx;
  const context = canvas.getContext("2d");
  if (context === null) return null;
  context.fillStyle = textBackground;
  context.fillRect(0, 0, textWidthPx, textHeightPx);
  let size = 96;
  const font = (px: number): string => `600 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  context.font = font(size);
  while (size > 24 && context.measureText(label).width > textWidthPx * 0.85) {
    size -= 4;
    context.font = font(size);
  }
  context.fillStyle = textColor;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, textWidthPx / 2, textHeightPx / 2, textWidthPx * 0.9);
  return { source: canvas, width: textWidthPx, height: textHeightPx };
};

/**
 * Fetches a picture and decodes it. Fetching (rather than an <img> pointing at the URL) keeps the texture
 * untainted: a same-origin or CORS-enabled picture loads, anything else fails and falls back to text.
 */
const loadPicture = async (url: string): Promise<ScreenImage> => {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    if (image.naturalWidth === 0 || image.naturalHeight === 0) throw new Error("empty picture");
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const createTvScreens = (show: (objectId: string, image: ScreenImage | null) => void): TvScreens => {
  /** The key each lit screen shows (or is loading). */
  const current = new Map<string, string>();
  const failed = new Set<string>();
  /** Decoded artwork by URL, so a label change over the same picture does not fetch it again. */
  const loaded = new Map<string, ScreenImage>();

  const showText = (objectId: string, label: string): void => {
    show(objectId, textImage(label));
  };

  return {
    update: (objectId, entity, shown) => {
      const want = wanted(entity, shown);
      const key = want?.key ?? null;
      if ((current.get(objectId) ?? null) === key) return;
      if (want === null) {
        current.delete(objectId);
        show(objectId, null);
        return;
      }
      current.set(objectId, want.key);
      const picture = want.picture;
      if (picture === null || failed.has(picture)) {
        showText(objectId, want.label);
        return;
      }
      const cached = loaded.get(picture);
      if (cached !== undefined) {
        show(objectId, artworkImage(cached, want.label) ?? cached);
        return;
      }
      loadPicture(picture)
        .then((image) => {
          loaded.set(picture, image);
          if (current.get(objectId) === want.key) show(objectId, artworkImage(image, want.label) ?? image);
        })
        .catch((error: unknown) => {
          failed.add(picture);
          console.warn("[homeplan] TV picture could not be loaded; showing the label", picture, error);
          if (current.get(objectId) === want.key) showText(objectId, want.label);
        });
    },
    clear: () => {
      for (const objectId of current.keys()) show(objectId, null);
      current.clear();
    },
  };
};
