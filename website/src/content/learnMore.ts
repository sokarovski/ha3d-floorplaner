// The rewritten "Learn More" areas, in page order; their backgrounds alternate down the page.
// A "bullets" area is a title and short bullets on the left with one picture on the right.
// A "tiles" area is a title over a row of cards, each a small picture with a short heading under it.
import { pages } from "./pages";
import type { CapabilityMedia } from "./possibilities";
import type { ScreenshotName } from "./screenshots";

export type LearnMoreTile = Readonly<{
  title: string;
  image: ScreenshotName;
}>;

// A link button shown under an area's bullets.
export type LearnMoreAction = Readonly<{
  label: string;
  href: string;
}>;

export type LearnMoreArea = Readonly<
  { id: string; title: string } & (
    | { kind: "bullets"; bullets: readonly string[]; media: CapabilityMedia; action?: LearnMoreAction }
    | { kind: "tiles"; tiles: readonly LearnMoreTile[] }
  )
>;

export const learnMoreAreas: readonly LearnMoreArea[] = [
  {
    id: "viewer-light",
    title: "Light and shadow",
    kind: "bullets",
    bullets: [
      "Your real lights in 3D",
      "Daylight through the windows",
      "Lamps can be seen by day",
      "Tune a lamp in Home Assistant (lumens, warmth, etc.)",
    ],
    media: { name: "viewer-night-lights", kind: "clip" },
  },
  {
    id: "viewer-sun",
    title: "Day, night and the sun",
    kind: "bullets",
    bullets: [
      "The sun and shadows move through the day, using real data",
      "The house switches to night by itself when the sun entity says the sun is down",
      "Automatic dark mode changes the backdrop",
    ],
    media: { name: "viewer-day-night", kind: "clip" },
  },
  {
    id: "viewer-devices",
    title: "Your devices at work",
    kind: "tiles",
    tiles: [
      { title: "See your TV being on", image: "device-tv-on" },
      { title: "See your air purifier working", image: "device-air-purifier" },
      { title: "See your AC heating", image: "device-ac-heating" },
      { title: "See your washing machine door open", image: "device-washer-door" },
    ],
  },
  {
    id: "viewer-openings",
    title: "Doors, windows and blinds",
    kind: "bullets",
    bullets: [
      "Doors that open, including sliding and motorised doors",
      "Windows open or tilt",
      "Blinds follow your covers",
      "Other moving parts, like a toilet lid or an appliance door",
      "Smooth changes",
    ],
    media: { name: "viewer-door-open", kind: "still" },
  },
  {
    id: "viewer-presence",
    title: "Presence and security",
    kind: "bullets",
    bullets: [
      "A room sweeps with red light when someone is in it",
      "Choose, per room, which corner the sweep comes from",
      "Turn the sweeps on or off for the whole house with another entity, for example only while the alarm is armed",
      "Place a bubble above a room that shows when there is movement",
      "With reduced motion, the sweep stays calm",
    ],
    media: { name: "ha-presence", kind: "clip" },
  },
  {
    id: "viewer-floors",
    title: "Floors, rooms and the whole house",
    kind: "bullets",
    bullets: [
      "The whole house: every floor, with the roof on top",
      "Floor by floor, like a lift on the outside of the house",
      "Choose the main view: the whole house or your favourite floor",
      "Zoom into a room, and walls in the way fade out",
      "Remember a room's view",
      "Navigate like the builder, with trackpad, mouse or touch",
    ],
    media: { name: "ha-house", kind: "still" },
  },
  {
    id: "viewer-side-cards",
    title: "Side Cards",
    kind: "bullets",
    bullets: [
      "Open a room and its Home Assistant cards appear on the right of the screen, beside the 3D room",
      "Each room shows its own tab of a dashboard you choose, in one or two columns",
      "A floor can show cards too, on the left, right, top or bottom",
      "Use the cards you already have in your dashboards",
    ],
    media: { name: "ha-widgets", kind: "still" },
    action: { label: "Learn how to configure Side Cards", href: pages.sideCards },
  },
  {
    id: "viewer-cards",
    title: "Cards and actions",
    kind: "bullets",
    bullets: [
      "Hold a light or device to open Home Assistant's own card for it, with every option it has",
      "Tap, hold and double tap each run a Home Assistant action: toggle, more info, navigate, open a URL or Assist",
      "A light toggles on tap by default",
    ],
    media: { name: "ha-more-info", kind: "still" },
  },
  {
    id: "viewer-bubbles",
    title: "Bubbles",
    kind: "bullets",
    bullets: [
      "Small bubbles above a room show temperature, humidity, presence or any state",
      "A light bubble switches its light with a tap",
      "A camera bubble opens its live view",
      "Show a bubble only when a condition holds, for example when there is movement in the room",
    ],
    media: { name: "viewer-bubbles", kind: "still" },
  },
];
