// What a TV's screen says (Phase 15.2, spec/home-assistant/bindings.md#tv-screens). Pure: no DOM, no Home Assistant
// store, so scripts/ha-conditions.ts checks it. Priority (owner, 2026-11-18): the running app, then the live-TV
// channel, then the input (HDMI 1), then a neutral "On".

/** media_player states in which the screen is lit (HA's MediaPlayerState). */
const litStates = new Set(["on", "playing", "paused", "idle", "buffering"]);

/**
 * Known app packages (Android TV, Google TV, Fire TV, and common integration ids) and their names. A package
 * matches exactly or as a prefix followed by a dot (`com.netflix.ninja`, `com.google.android.youtube.tv`).
 * Data only: add a row to teach the viewer a new app. Longer packages win over shorter prefixes.
 */
const knownApps: Readonly<Record<string, string>> = {
  "com.netflix": "Netflix",
  "com.google.android.youtube.tvkids": "YouTube Kids",
  "com.google.android.youtube.tv": "YouTube",
  "com.google.android.youtube.tvunplugged": "YouTube TV",
  "com.google.android.youtube": "YouTube",
  "com.amazon.amazonvideo.livingroom": "Prime Video",
  "com.amazon.avod": "Prime Video",
  "com.disney.disneyplus": "Disney+",
  "com.hbo.hbonow": "HBO Max",
  "com.wbd.stream": "HBO Max",
  "com.hbo.hbomax": "HBO Max",
  "com.apple.atve": "Apple TV",
  "com.apple.tv": "Apple TV",
  "com.spotify": "Spotify",
  "com.plexapp": "Plex",
  "org.xbmc.kodi": "Kodi",
  "tv.twitch": "Twitch",
  "org.videolan.vlc": "VLC",
  "com.google.android.videos": "Google Play Movies",
  "com.google.android.tv": "Live Channels",
  "com.google.android.apps.tv.launcherx": "Google TV",
  "tv.pluto": "Pluto TV",
  "com.viaplay": "Viaplay",
  "com.skyshowtime": "SkyShowtime",
  "com.hulu": "Hulu",
  "com.amazon.tv.launcher": "Fire TV",
  "com.amazon.firetv": "Fire TV",
  "com.ivy.ivy": "Smart IPTV",
  "ar.tvplayer.tv": "TiviMate",
  "com.sling": "Sling TV",
  "com.crunchyroll": "Crunchyroll",
  "com.paramount": "Paramount+",
  "com.cbs": "Paramount+",
  "com.peacocktv": "Peacock",
  "com.discovery": "Discovery+",
  "com.mubi": "MUBI",
  "com.vimeo": "Vimeo",
  "com.dazn": "DAZN",
  "com.tubitv": "Tubi",
  "com.amazon.music": "Amazon Music",
  "com.google.android.music": "YouTube Music",
  "com.google.android.apps.youtube.music": "YouTube Music",
  "com.google.android.apps.tv.dreamx": "Ambient mode",
};

const knownByLength: readonly (readonly [string, string])[] = Object.entries(knownApps).sort(
  (a, b) => b[0].length - a[0].length,
);

/** Sources that name no particular input; a better label wins over them. */
const genericSources = new Set([
  "tv",
  "live tv",
  "livetv",
  "antenna",
  "cable",
  "broadcast",
  "tuner",
  "digital tv",
]);

/** Trailing package segments that say nothing about the app. */
const genericSegments = new Set([
  "app",
  "apps",
  "android",
  "androidtv",
  "tv",
  "mobile",
  "client",
  "main",
  "release",
  "prod",
  "production",
  "ui",
  "free",
  "lite",
]);

const packagePattern = /^[a-z][a-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/** Whether a string looks like an Android package id (`com.example.myapp`) rather than a name. */
export const isPackageId = (value: string): boolean => packagePattern.test(value);

/** The name of a recognised package, or null. */
export const knownAppName = (packageId: string): string | null => {
  const id = packageId.toLowerCase();
  for (const [prefix, name] of knownByLength) {
    if (id === prefix || id.startsWith(`${prefix}.`)) return name;
  }
  return null;
};

const capitalised = (word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

/** An unrecognised package as a readable name, never with dots: `com.example.myapp` is "Myapp". */
export const tidyPackageName = (packageId: string): string => {
  const segments = packageId.split(".").filter((segment) => segment !== "");
  let index = segments.length - 1;
  while (index > 0 && genericSegments.has((segments[index] ?? "").toLowerCase())) index -= 1;
  const base = segments[index] ?? packageId;
  const words = base.split(/[_-]+/).filter((word) => word !== "");
  return words.map(capitalised).join(" ");
};

/** A package id as a name (recognised, else tidied); a plain name unchanged. */
const readable = (value: string): string =>
  isPackageId(value) ? (knownAppName(value) ?? tidyPackageName(value)) : value;

export type TvContent = Readonly<{
  /** The label: app, channel, input, or "On". */
  label: string;
  /** The entity's artwork URL as supplied (unresolved), or null. */
  picture: string | null;
}>;

/** What a media_player's screen shows, or null while it is dark (not lit, or not a media_player). */
export const tvContent = (
  entityId: string,
  state: string,
  attributes: Readonly<Record<string, unknown>>,
): TvContent | null => {
  if (!entityId.startsWith("media_player.") || !litStates.has(state)) return null;
  const appName = text(attributes.app_name);
  const appId = text(attributes.app_id);
  const source = text(attributes.source);
  const channel =
    text(attributes.media_channel) ??
    (text(attributes.media_content_type)?.toLowerCase() === "channel" ? text(attributes.media_title) : null);
  // A recognised package beats a raw app_name that is itself a package id; a plain app_name beats app_id.
  const fromAppName = appName === null ? null : readable(appName);
  const fromAppId = appId === null ? null : readable(appId);
  const appLabel = appName !== null && !isPackageId(appName) ? appName : (fromAppId ?? fromAppName);
  const inputLabel = source !== null && !genericSources.has(source.toLowerCase()) ? readable(source) : null;
  const genericLabel = source !== null && inputLabel === null ? source : null;
  return {
    label: appLabel ?? channel ?? inputLabel ?? genericLabel ?? "On",
    picture: text(attributes.entity_picture),
  };
};
