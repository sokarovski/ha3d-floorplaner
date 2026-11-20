// Everything the "Learn More" page lists, grouped by product. Each entry is a shipped capability
// described in plain language; nothing planned or experimental belongs here.
import type { IconName } from "../../../src/design-system/components/Icon/icons";
import type { ScreenshotName } from "./screenshots";

// A capability card leads with either a small icon or, for a few close-ups, its own picture (no caption).
export type Capability = Readonly<
  { title: string; text: string } & (
    { icon: IconName; image?: never } | { image: ScreenshotName; icon?: never }
  )
>;

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
    ],
  },
];

export const builderGroups: readonly CapabilityGroup[] = [
  {
    id: "builder-draw",
    title: "Draw and measure",
    lead: "Measured rooms, drawn with precise, easy tools.",
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
