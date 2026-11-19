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
  | "ha-presence"
  | "viewer-night"
  | "viewer-night-lights"
  | "builder-garden"
  | "builder-whole-house"
  | "builder-first-floor"
  | "builder-gallery"
  | "builder-room-properties"
  | "builder-history"
  | "builder-evening"
  | "device-tv-on"
  | "device-air-purifier"
  | "device-ac-heating"
  | "ha-link-settings"
  | "ha-more-info"
  | "viewer-door-open"
  | "viewer-yard";

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
    width: 720,
    height: 450,
    alt: "In the Homeplan panel, the demo apartment zooms into the living room; a Home Assistant light card switches the light on and the room lights up, then off again.",
    caption: "Open a room, switch a real light from its card, and see it in 3D.",
    available: true,
  },
  "ha-presence": {
    file: "ha-presence.gif",
    poster: "ha-presence-poster.webp",
    width: 720,
    height: 450,
    alt: "A presence sensor detects someone in the living room and the room sweeps red in the Homeplan panel.",
    caption: "Presence: a motion sensor in Home Assistant sweeps the living room.",
    available: true,
  },
  "viewer-night": {
    file: "viewer-night.webp",
    width: 1100,
    height: 660,
    alt: "The demo city apartment in the viewer at night: the living area and kitchen lit warmly by their lamps, the other rooms dark.",
    caption: "The viewer at night: lamps carry the scene once the sun has set.",
    available: true,
  },
  "viewer-night-lights": {
    file: "viewer-night-lights.gif",
    poster: "viewer-night-lights-poster.webp",
    width: 720,
    height: 432,
    alt: "The demo city apartment in the viewer at night; two groups of lamps switch on and off in turn, lighting and darkening their rooms.",
    caption: "At night, lamps switching on and off light their own rooms.",
    available: true,
  },
  "builder-garden": {
    file: "builder-garden.webp",
    width: 840,
    height: 540,
    alt: "The demo garden bungalow in the builder: a lawn yard enclosed by a hedge with a gate, a paved path, potted trees and a covered terrace with a dining table.",
    caption: "Garden bungalow: hedge, lawn, path, trees and a covered terrace.",
    available: true,
  },
  "builder-whole-house": {
    file: "builder-whole-house.webp",
    width: 700,
    height: 620,
    alt: "The demo family house in the builder's whole-house view: two storeys under a tiled roof with a skylight, a canopy over the terrace, and a walled garden with a path.",
    caption: "Whole house: tiled roof with a skylight, terrace canopy and garden.",
    available: true,
  },
  "builder-first-floor": {
    file: "builder-first-floor.webp",
    width: 780,
    height: 560,
    alt: "The first floor of the demo family house opened on its own in the builder, showing its bedrooms, study corner and bathroom from above.",
    caption: "One floor opened on its own: the family house's first floor.",
    available: true,
  },
  "builder-gallery": {
    file: "builder-gallery.webp",
    width: 925,
    height: 640,
    alt: "The Add an object gallery in the builder: a search field, category chips with counts (83 objects in all), and thumbnail tiles grouped under Appliances, Bathroom and Beds.",
    caption: "The object gallery: search, categories and thumbnails.",
    available: true,
  },
  "builder-room-properties": {
    file: "builder-room-properties.webp",
    width: 1320,
    height: 772,
    alt: "The demo family house's ground floor in the builder, with its staircase; the study is selected and its properties show name, position, rotation and a walnut plank flooring texture.",
    caption: "Select a room and edit its placement and flooring in the properties panel.",
    available: true,
  },
  "builder-history": {
    file: "builder-history.webp",
    width: 648,
    height: 300,
    alt: "The builder's History window listing two saves with Restore buttons, and a comparison showing a room renamed from Study to Home office.",
    caption: "History: compare two saves and restore either one.",
    available: true,
  },
  "builder-evening": {
    file: "builder-evening.webp",
    width: 1320,
    height: 773,
    alt: "The demo family house in the builder at 21:00 in the evening sun, with the house's Sun settings: fixed or current time, date and time, sun azimuth and elevation.",
    caption: "Set the date and time and see where the sun stands over the house.",
    available: true,
  },
  "device-tv-on": {
    file: "device-tv-on.webp",
    width: 269,
    height: 237,
    alt: "A wall-mounted TV in the 3D living room with its screen on, showing what is playing, between two plants on the TV ledge.",
    caption: "See your TV being on.",
    available: true,
  },
  "device-air-purifier": {
    file: "device-air-purifier.webp",
    width: 122,
    height: 141,
    alt: "An air purifier in the 3D room with blue swirls rising from it while it runs.",
    caption: "See your air purifier working.",
    available: true,
  },
  "device-ac-heating": {
    file: "device-ac-heating.webp",
    width: 277,
    height: 194,
    alt: "A wall air conditioner in the 3D room with warm red swirls in front of it while it heats.",
    caption: "See your AC heating.",
    available: true,
  },
  "ha-link-settings": {
    file: "ha-link-settings.webp",
    width: 1484,
    height: 1088,
    alt: "The Homeplan panel's Settings in Home Assistant: a tree of the house, floor, room, lights and objects on the left, and a pendant light's entity, suggested entities, tap and hold actions, light output and a Shown when condition on the right.",
    caption: "Settings in Home Assistant: link a lamp to its entity, choose its actions, and tune its light.",
    available: true,
  },
  "ha-more-info": {
    file: "ha-more-info.webp",
    width: 884,
    height: 592,
    alt: "Home Assistant's own more-info dialog for the living room AC, opened from the 3D view: the current temperature, a heat target of 21 °C, and mode, fan and swing controls.",
    caption: "Hold a device to open Home Assistant's own controls for it.",
    available: true,
  },
  "viewer-door-open": {
    file: "viewer-door-open.webp",
    width: 647,
    height: 522,
    alt: "A door standing open in the 3D living room at night, following its door contact in Home Assistant.",
    caption: "A door opens in 3D when the real one does.",
    available: true,
  },
  "viewer-yard": {
    file: "viewer-yard.webp",
    width: 1320,
    height: 944,
    alt: "A demo house with its walled garden in the Homeplan viewer at night: lawn, a paved path, potted palms and a covered terrace with a dining table and a sofa.",
    caption: "You can even put your yard: the garden, terrace and path in Home Assistant at night.",
    available: true,
  },
};

export const screenshotUrl = (file: string): string => `${import.meta.env.BASE_URL}screenshots/${file}`;
