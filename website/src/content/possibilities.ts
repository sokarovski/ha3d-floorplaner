// Everything the "See all possibilities" page lists, grouped by product. Each entry is a shipped capability
// described in plain language; nothing planned or experimental belongs here.
import type { IconName } from "../../../src/design-system/components/Icon/icons";
import type { ScreenshotName } from "./screenshots";

export type Capability = Readonly<{
  icon: IconName;
  title: string;
  text: string;
}>;

export type CapabilityMedia = Readonly<{
  name: ScreenshotName;
  kind: "still" | "clip";
}>;

export type CapabilityGroup = Readonly<{
  id: string;
  title: string;
  lead?: string;
  media?: readonly CapabilityMedia[];
  items: readonly Capability[];
}>;

export const viewerGroups: readonly CapabilityGroup[] = [
  {
    id: "viewer-light",
    title: "Light and shadow",
    lead: "Lamps in the model shine the way your real lights do right now.",
    media: [
      { name: "ha-light-toggle", kind: "clip" },
      { name: "viewer-night-lights", kind: "clip" },
    ],
    items: [
      {
        icon: "light",
        title: "Your real lights in 3D",
        text: "Each linked light shows its Home Assistant state: on or off, its brightness, and its colour or colour temperature.",
      },
      {
        icon: "wall",
        title: "Light stays in its room",
        text: "Lamps cast shadows, so walls keep their light in the room, just as in the builder.",
      },
      {
        icon: "window",
        title: "Daylight through the windows",
        text: "By day, windows let sky light into the rooms behind them.",
      },
      {
        icon: "sun",
        title: "Lamps you can see by day",
        text: "Switching a lamp makes a visible difference in daylight too, not only at night.",
      },
      {
        icon: "lightOff",
        title: "Never invents light",
        text: "A light without an entity, or whose entity is unavailable, is drawn off.",
      },
      {
        icon: "settings",
        title: "Tune a lamp in Home Assistant",
        text: "Adjust a light's lumens and colour temperature in the panel's Settings without editing the house.",
      },
    ],
  },
  {
    id: "viewer-sun",
    title: "Day, night and the sun",
    media: [{ name: "viewer-night", kind: "still" }],
    items: [
      {
        icon: "sun",
        title: "The real sun at your house",
        text: "The sun's position comes from Home Assistant's own sun, or from its configured location. The house's north turns it onto the plan.",
      },
      {
        icon: "rotate",
        title: "Shadows follow the sun",
        text: "Shadows move through the day; the sun is read again whenever it changes and every minute.",
      },
      {
        icon: "moon",
        title: "Night falls",
        text: "After sunset a deep night backdrop fades in and your lamps carry the scene.",
      },
      {
        icon: "eye",
        title: "Light and dark themes",
        text: "The backdrop follows Home Assistant's light or dark theme.",
      },
    ],
  },
  {
    id: "viewer-openings",
    title: "Doors, windows and blinds",
    lead: "Moving parts of the model follow the sensors and covers you link them to.",
    media: [{ name: "viewer-door-open", kind: "still" }],
    items: [
      {
        icon: "door",
        title: "Doors that open",
        text: "Link a door contact and the door swings open in 3D when the real one opens.",
      },
      {
        icon: "window",
        title: "Windows open or tilt",
        text: "A window shows closed, tilted or open, following a contact or handle sensor.",
      },
      {
        icon: "menu",
        title: "Blinds from covers",
        text: "Venetian blinds follow a cover's tilt, and tapping the window opens or closes the slats.",
      },
      {
        icon: "move",
        title: "Sliding and motorised doors",
        text: "A sliding or motorised door can follow a cover's position, from closed to fully open.",
      },
      {
        icon: "sofa",
        title: "Other moving parts",
        text: "Any moving part an object declares, such as an appliance door or a toilet lid, can follow an entity.",
      },
      {
        icon: "play",
        title: "Smooth changes",
        text: "Doors, windows and blinds ease into their new position, and jump straight there when reduced motion is on.",
      },
    ],
  },
  {
    id: "viewer-presence",
    title: "Presence and security",
    media: [{ name: "ha-presence", kind: "clip" }],
    items: [
      {
        icon: "eye",
        title: "Presence sweep",
        text: "A room sweeps with red light cones and a faint red tint while a motion sensor or an alarm reports someone there.",
      },
      {
        icon: "corner",
        title: "Choose the corners",
        text: "Pick in 3D the corners the sweep starts from, or keep the default two farthest from the doors.",
      },
      {
        icon: "warning",
        title: "Only when armed",
        text: "A floor can sweep only while a condition holds, for example while the alarm is armed.",
      },
      {
        icon: "info",
        title: "Presence bubble",
        text: "Add a bubble above a room that shows only while presence is active.",
      },
      {
        icon: "pause",
        title: "Calm with reduced motion",
        text: "With reduced motion the cones stand still and do not pulse.",
      },
    ],
  },
  {
    id: "viewer-floors",
    title: "Floors, rooms and the whole house",
    media: [
      { name: "ha-house", kind: "still" },
      { name: "ha-room", kind: "still" },
    ],
    items: [
      {
        icon: "home",
        title: "The whole house",
        text: "A house with several floors opens on the whole house: every floor complete, its lamps live and the roof on top.",
      },
      {
        icon: "layers",
        title: "Floor by floor",
        text: "Tap a floor, or use Up and Down, to ride between floors like a lift on the outside of the house.",
      },
      {
        icon: "settings",
        title: "Choose the main view",
        text: "Open on the whole house, or straight on the floor you use most.",
      },
      {
        icon: "frame",
        title: "Zoom into a room",
        text: "Tap a room: the camera flies to an angle that sees inside, and walls in the way fade out.",
      },
      {
        icon: "pointer",
        title: "Remember a room's view",
        text: "Save a camera position for a room, or let the viewer frame it automatically.",
      },
      {
        icon: "hand",
        title: "Navigate like the builder",
        text: "Trackpad, mouse or touch, with buttons to look straight down, turn the view by 90° and fit it to the screen.",
      },
    ],
  },
  {
    id: "viewer-cards",
    title: "Cards, bubbles and actions",
    media: [
      { name: "ha-widgets", kind: "still" },
      { name: "ha-more-info", kind: "still" },
    ],
    items: [
      {
        icon: "frame",
        title: "Room cards",
        text: "Opening a room shows that room's tab of a dashboard you choose, in one or two columns. A room without a tab opens full-screen.",
      },
      {
        icon: "grid",
        title: "Floor widgets",
        text: "A floor can show a dashboard tab's cards beside the house, on the left, right, top or bottom.",
      },
      {
        icon: "info",
        title: "Value bubbles",
        text: "Small bubbles above a room show temperature, humidity, presence, a light toggle or any state. A camera bubble opens its live view.",
      },
      {
        icon: "pointer",
        title: "Tap, hold, double tap",
        text: "Each gesture runs a Home Assistant action: toggle, more info, perform an action, navigate, open a URL or Assist. A light toggles on tap by default.",
      },
      {
        icon: "frame",
        title: "Home Assistant's own controls",
        text: "Hold a light or device to open Home Assistant's native more-info dialog, with every option it has, such as an AC's target temperature, mode, fan and swing.",
      },
      {
        icon: "eye",
        title: "Shown when",
        text: "Show a light, object or bubble only when a condition holds, written like Home Assistant's card conditions.",
      },
      {
        icon: "search",
        title: "Entity suggestions",
        text: "Settings suggests matching entities, using the room's Home Assistant area, device types and names.",
      },
      {
        icon: "edit",
        title: "One Settings place",
        text: "In Edit mode, one searchable tree holds the house, its floor, rooms and things; everything saves together.",
      },
    ],
  },
  {
    id: "viewer-devices",
    title: "Your devices at work",
    lead: "Things in the model show what the real devices are doing.",
    media: [
      { name: "device-tv-on", kind: "still" },
      { name: "device-air-purifier", kind: "still" },
      { name: "device-ac-heating", kind: "still" },
    ],
    items: [
      {
        icon: "monitor",
        title: "See your TV being on",
        text: "A TV shows the running app's artwork, or the app, channel or input name, while it is on.",
      },
      {
        icon: "wind",
        title: "See your air purifier working",
        text: "Swirls rise over an air purifier while it runs, and stop when it is off.",
      },
      {
        icon: "wind",
        title: "See your AC heating",
        text: "Red swirls while an AC heats, blue while it cools, and nothing when it is idle. A radiator or water heater can do the same.",
      },
    ],
  },
  {
    id: "viewer-local",
    title: "Works on its own in Home Assistant",
    items: [
      {
        icon: "folder",
        title: "A private local copy",
        text: "Home Assistant keeps a complete copy of the house, so viewing and controlling keep working with the builder stopped.",
      },
      {
        icon: "restore",
        title: "Upgrade when you are ready",
        text: "After you Save a new version in the builder, Upgrade copies it in. Your links and cards stay.",
      },
      {
        icon: "export",
        title: "Upgrade panel",
        text: "Bring a newer viewer from the builder into Home Assistant, then reload to use it.",
      },
      {
        icon: "home",
        title: "Found automatically",
        text: "While the Homeplan app is running, Home Assistant discovers it; there is no address to type.",
      },
      {
        icon: "settings",
        title: "Your links stay in Home Assistant",
        text: "Entity links and dashboard choices are Home Assistant settings; the house file holds no Home Assistant data.",
      },
      {
        icon: "image",
        title: "Calm loading",
        text: "The house appears already framed; furniture and textures then load gradually under a thin progress bar.",
      },
      {
        icon: "code",
        title: "DEV MODE for developers",
        text: "Load the viewer code and the working house straight from a running builder, with a visible local fallback.",
      },
    ],
  },
];

export const builderGroups: readonly CapabilityGroup[] = [
  {
    id: "builder-draw",
    title: "Draw and measure",
    lead: "Measured rooms, drawn with SketchUp-like tools.",
    media: [{ name: "builder-room-properties", kind: "still" }],
    items: [
      {
        icon: "rectangle",
        title: "Rooms from measurements",
        text: "Draw rooms with Rectangle, Circle and the Polygon pencil, and type exact sizes as you go.",
      },
      {
        icon: "corner",
        title: "Irregular rooms",
        text: "Corner edit moves single corners, so a room can take any shape.",
      },
      {
        icon: "ruler",
        title: "Any unit",
        text: "Work in mm, cm, m, inches or feet; entries in another unit convert as you type.",
      },
      {
        icon: "magnet",
        title: "Snapping",
        text: "Snap to corners, edges, midpoints, centres and guides, with axis locks. Click, lock, type a distance, commit.",
      },
      {
        icon: "ruler",
        title: "Tape and guides",
        text: "The tape measure leaves guide lines and points to draw against.",
      },
      {
        icon: "rotate",
        title: "Move and rotate",
        text: "Move rooms and objects with snapping, and rotate them with grips that snap to 90°.",
      },
    ],
  },
  {
    id: "builder-walls",
    title: "Walls, doors and windows",
    items: [
      {
        icon: "wall",
        title: "Walls from edges",
        text: "Raise walls from a room's straight or curved edges, with their own thickness, height, and inside and outside materials.",
      },
      {
        icon: "split",
        title: "Wall tools",
        text: "Push/pull, Trim/extend, Split and Fill walls reshape walls directly in 3D.",
      },
      {
        icon: "layers",
        title: "Shared walls merge",
        text: "Push two rooms together: they snap to touching, then to one shared wall.",
      },
      {
        icon: "door",
        title: "Doors and windows",
        text: "Place doors and windows from the gallery; they cut the wall and size to it.",
      },
      {
        icon: "reliefBox",
        title: "Wall features",
        text: "Draw boxes, niches, arches or flat painted shapes on a wall face.",
      },
      {
        icon: "eyeOff",
        title: "Walls off and hiding",
        text: "Trace the walls on the floor to align rooms, hide things for a while, or save them as Hidden.",
      },
    ],
  },
  {
    id: "builder-furnish",
    title: "Furnish and light",
    media: [{ name: "planner-detail", kind: "still" }],
    items: [
      {
        icon: "sofa",
        title: "More than 80 objects to furnish with",
        text: "Seating, tables, beds, storage, kitchen, bathroom, appliances, electronics, decor, plants and garden, with doors, windows, stairs and fences in their own galleries.",
      },
      {
        icon: "properties",
        title: "Objects that adapt",
        text: "Objects resize sensibly, so legs stay in the corners, and offer their own options such as finishes.",
      },
      {
        icon: "carpet",
        title: "Carpets",
        text: "Lay carpets and rugs of any shape on a room's floor.",
      },
      {
        icon: "cube",
        title: "Object groups",
        text: "Group a table with its chairs, lamp and rug, and move or turn them as one.",
      },
      {
        icon: "light",
        title: "Every kind of light",
        text: "Pendants, floor lamps, spots and invisible sources, with lumens, lamp types and colour or tunable white.",
      },
      {
        icon: "lightFocus",
        title: "LED strips",
        text: "Straight strips with their own length, width and the direction they shine.",
      },
      {
        icon: "lightOff",
        title: "Light groups",
        text: "Switch, dim or colour a group of lights in one step.",
      },
      {
        icon: "wind",
        title: "Ambient effects",
        text: "Small swirls and vapour on appliances, such as cold air blowing from an AC.",
      },
    ],
  },
  {
    id: "builder-galleries",
    title: "Galleries, materials and your own models",
    media: [{ name: "builder-gallery", kind: "still" }],
    items: [
      {
        icon: "search",
        title: "Object gallery",
        text: "Thumbnails, search, built-in or this house's objects, and categories. Enter places the first match.",
      },
      {
        icon: "image",
        title: "Texture gallery",
        text: "Choose a surface texture from the built-in textures or your own house images.",
      },
      {
        icon: "paintBucket",
        title: "Material presets",
        text: "Built-in oak, walnut and ash, tiles, granite, decking, lawn, paving and roofing. Save your own surfaces as presets.",
      },
      {
        icon: "upload",
        title: "Your own images",
        text: "Upload JPEG, PNG or WebP images for floors, walls and objects at their real tile size, or show one in a picture frame.",
      },
      {
        icon: "edit",
        title: "Import your own models",
        text: "Bring in GLB, glTF or STL files and set their scale, orientation, resizing and materials in the Object Editor.",
      },
      {
        icon: "history",
        title: "Object versions",
        text: "Each saved object is a version; placed objects keep theirs until you update them.",
      },
    ],
  },
  {
    id: "builder-outside",
    title: "Gardens and yards",
    media: [
      { name: "builder-garden", kind: "still" },
      { name: "viewer-yard", kind: "still" },
    ],
    items: [
      {
        icon: "yard",
        title: "Yards",
        text: "Add a yard to the ground floor: a lawn you shape with the same tools as a room.",
      },
      {
        icon: "gate",
        title: "Fences and gates",
        text: "Picket, metal panel, hedge, timber slats, trellis or wire mesh along the edges, with gates where doors go.",
      },
      {
        icon: "carpet",
        title: "Pathways",
        text: "Draw paved paths inside a yard.",
      },
      {
        icon: "yard",
        title: "Trees and plants",
        text: "Five kinds of tree, shrubs and planters, with adjustable height and width.",
      },
      {
        icon: "light",
        title: "Outdoor wall lights",
        text: "Lanterns, up-and-down lights and bulkheads on outside walls.",
      },
      {
        icon: "roof",
        title: "Canopies",
        text: "Attach a canopy over a terrace or balcony, on any floor.",
      },
    ],
  },
  {
    id: "builder-floors",
    title: "Floors, stairs and roofs",
    media: [
      { name: "builder-whole-house", kind: "still" },
      { name: "builder-first-floor", kind: "still" },
    ],
    items: [
      {
        icon: "layers",
        title: "Many floors",
        text: "Add floors and see the whole house stacked. Move a floor with snapping so it rests on the walls below.",
      },
      {
        icon: "grid",
        title: "Slabs",
        text: "Each floor has a slab with its own thickness and material.",
      },
      {
        icon: "stairs",
        title: "Stairs and floor openings",
        text: "Straight and L-shaped stairs and floor openings cut the floors they reach automatically.",
      },
      {
        icon: "roof",
        title: "Roofs of any shape",
        text: "Pull up points and fold lines for gable, hip, shed or mixed roofs, in tiles, slate or metal, open or closed underneath.",
      },
      {
        icon: "wall",
        title: "Walls meet the roof",
        text: "Walls rise to the roof and are cut by it; a single wall can opt out.",
      },
      {
        icon: "window",
        title: "Roof windows and skylights",
        text: "Place roof windows and flat skylights, cut holes, and add steps in a roof.",
      },
    ],
  },
  {
    id: "builder-view",
    title: "Sun, view and navigation",
    media: [{ name: "builder-evening", kind: "still" }],
    items: [
      {
        icon: "sun",
        title: "Location, north and time",
        text: "Set the house's location, its north, and a fixed or the current date and time for the sun.",
      },
      {
        icon: "moon",
        title: "Day or night preview",
        text: "View the house in its own sun, a bright day or at night, and switch all lights off for a look.",
      },
      {
        icon: "orbit",
        title: "Top and 3D",
        text: "Orbit, pan and zoom with a trackpad or mouse, switch to Top view, and Fit to screen.",
      },
      {
        icon: "eye",
        title: "Focus on one room",
        text: "Double-click into a room to edit it; the other rooms fade or hide.",
      },
      {
        icon: "settings",
        title: "Light, dark and grid",
        text: "Light, dark or automatic appearance, and an optional ground grid.",
      },
    ],
  },
  {
    id: "builder-history",
    title: "History and safety",
    media: [{ name: "builder-history", kind: "still" }],
    items: [
      {
        icon: "undo",
        title: "Undo and Redo",
        text: "Every edit is a named step you can undo and redo.",
      },
      {
        icon: "save",
        title: "Save makes a revision",
        text: "Save records a Git revision of the house, with an optional note.",
      },
      {
        icon: "history",
        title: "Compare and restore",
        text: "Browse revisions, compare one with the current house, and restore it as a new revision.",
      },
      {
        icon: "home",
        title: "Houses",
        text: "Create, rename, clone, trash and restore houses. Permanent deletion is only in the Trash, after a confirmation.",
      },
      {
        icon: "folder",
        title: "Plain folders",
        text: "Each house is a folder with its JSON, images and history; back it up by copying the folder.",
      },
      {
        icon: "copy",
        title: "Demo houses",
        text: "Three demo houses on first start: a city apartment, a garden bungalow and a family house.",
      },
    ],
  },
];

export const builderExport: CapabilityGroup = {
  id: "builder-export",
  title: "Export and run",
  items: [
    {
      icon: "export",
      title: "PNG export",
      text: "Export the view at 1×, 2× or 4×, optionally with a transparent background.",
    },
    {
      icon: "image",
      title: "Photorealistic render",
      text: "On a local install with Blender 4, render the floor view photorealistically. The Home Assistant app does not include it.",
    },
    {
      icon: "home",
      title: "Runs your way",
      text: "On your own computer, or as a Home Assistant app opened from the sidebar.",
    },
  ],
};
