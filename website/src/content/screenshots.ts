// Product captures shown on the page. Real captures go in website/public/screenshots/ under these file names;
// set `available` to true once the file is there. Until then the page shows a labelled placeholder.

export type ScreenshotName =
  | "planner-overview"
  | "builder-wide"
  | "planner-detail"
  | "ha-house"
  | "ha-room"
  | "ha-widgets"
  | "ha-light-toggle"
  | "ha-presence";

export type Screenshot = Readonly<{
  file: string;
  poster?: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  available: boolean;
}>;

export const screenshots: Readonly<Record<ScreenshotName, Screenshot>> = {
  "planner-overview": {
    file: "planner-overview.webp",
    width: 1320,
    height: 825,
    alt: "The Homeplan builder showing a furnished demo city apartment in 3D, with the house tree on the left and the properties panel on the right.",
    caption: "Planner overview: a furnished demo apartment in the builder.",
    available: true,
  },
  "builder-wide": {
    file: "builder-wide.webp",
    width: 1410,
    height: 617,
    alt: "Floor Builder: a furnished demo apartment in 3D with the house tree and properties.",
    caption: "Floor Builder: a furnished demo apartment in 3D with the house tree and properties.",
    available: true,
  },
  "planner-detail": {
    file: "planner-detail.webp",
    width: 1320,
    height: 825,
    alt: "A selected light in the demo apartment with its properties open in the builder.",
    caption: "Planner detail: select a room, object or light and edit its properties.",
    available: true,
  },
  "ha-house": {
    file: "ha-house.webp",
    width: 1320,
    height: 825,
    alt: "The Homeplan panel in Home Assistant showing the demo apartment in 3D.",
    caption: "In Home Assistant: the saved demo apartment in the Homeplan panel.",
    available: true,
  },
  "ha-room": {
    file: "ha-room.webp",
    width: 1320,
    height: 825,
    alt: "The Homeplan panel zoomed into the demo apartment's living room, with Home Assistant room cards beside the 3D view.",
    caption: "Room view: zoom into a room and use its Home Assistant controls at the side.",
    available: true,
  },
  "ha-widgets": {
    file: "ha-widgets.webp",
    width: 1320,
    height: 825,
    alt: "The demo apartment's bedroom open in the Homeplan panel, with a TV card and colour light-strip cards from Home Assistant beside the 3D room.",
    caption: "The bedroom with its Home Assistant cards: a TV and colour light strips.",
    available: true,
  },
  "ha-light-toggle": {
    file: "ha-light-toggle.gif",
    poster: "ha-light-toggle-poster.webp",
    width: 960,
    height: 600,
    alt: "In the Homeplan panel, the demo apartment zooms into the living room; a Home Assistant light card switches the light on and the room lights up, then off again.",
    caption: "Open a room, switch a real light from its card, and see it in 3D.",
    available: true,
  },
  "ha-presence": {
    file: "ha-presence.gif",
    poster: "ha-presence-poster.webp",
    width: 960,
    height: 600,
    alt: "A presence sensor detects someone in the living room and the room sweeps red in the Homeplan panel.",
    caption: "Presence: a motion sensor in Home Assistant sweeps the living room.",
    available: true,
  },
};

export const screenshotUrl = (file: string): string => `${import.meta.env.BASE_URL}screenshots/${file}`;
