// Context-aware toolbox (spec/builder/screens/floor-builder.md#context-aware-vertical-toolbox): tools per mode.
// Shortcuts follow SketchUp where it has an equivalent (Space Select, R, C, P, T, M, Q rotate, U push/pull).
import type { IconName } from "../../../design-system/components/Icon/icons";
import type { EditorMode, ToolId } from "../stores/uiStore";

/**
 * The toolbox level: a floor mode, the whole-house overview of a multi-floor house (Phase 16.4), or a roof's editing
 * level (Phase 19.1).
 */
export type ToolLevel = EditorMode | "house" | "roof" | "roofFace";

/** Toolbox section a tool belongs to; the toolbox draws a separator between sections. */
export type ToolGroup = "general" | "shape" | "wall" | "measure" | "view";

/** SketchUp's camera tools, last before Magnetic and Auto-select (Phase 5.13). */
const viewTools: readonly ToolDefinition[] = [
  {
    id: "orbit",
    group: "view",
    label: "Orbit: drag to turn the view (Shift pans)",
    icon: "orbit",
    shortcut: "O",
  },
  { id: "pan", group: "view", label: "Pan: drag to move the view", icon: "hand", shortcut: "H" },
];

export type ToolDefinition = Readonly<{
  id: ToolId;
  label: string;
  icon: IconName;
  group: ToolGroup;
  shortcut?: string;
}>;

/**
 * The toolbox for a mode. In the Carpet Editor (Phase 5.14, `carpet`) the Room Editor's wall tools are
 * hidden: only selection, shape, measuring, and view tools apply to a carpet's pieces.
 */
export const toolsForMode = (
  mode: ToolLevel,
  carpet = false,
  /** Wall face view: the tools for the face's features, and Pan. */
  face = false,
  /** A wall feature is open: the shape tools edit its shapes, like a carpet's pieces. */
  feature = false,
): readonly ToolDefinition[] => {
  if (mode === "area" && face && feature)
    return roomEditorTools().filter((tool) =>
      ["select", "nudge", "cornerEdit", "rectangle", "circle", "polygon", "pan"].includes(tool.id),
    );
  if (mode === "area" && face)
    return roomEditorTools()
      .filter((tool) =>
        ["select", "nudge", "rectangle", "circle", "polygon", "raiseWall", "pan"].includes(tool.id),
      )
      .map((tool) =>
        tool.id === "raiseWall" ? { ...tool, label: "Push/pull: set a feature's depth (out or in)" } : tool,
      );
  if (mode === "area" && carpet) return roomEditorTools().filter((tool) => tool.group !== "wall");
  if (mode === "area") return roomEditorTools();
  if (mode === "house") return houseTools();
  if (mode === "roof") return roofTools();
  if (mode === "roofFace") return roofFaceTools();
  return overviewTools();
};

/**
 * A roof's editing level (Phase 19.1): Select picks points and break lines, Move pulls them (↑ blue: up and down) or
 * moves them on the plan, Line draws break lines, and Rectangle, Circle and Polygon draw a new outline.
 */
const roofTools = (): readonly ToolDefinition[] => [
  {
    id: "select",
    group: "general",
    label: "Select roof points and lines",
    icon: "pointer",
    shortcut: "Space",
  },
  {
    id: "nudge",
    group: "general",
    label: "Move: pull points or lines (↑ up/down, → red, ← green)",
    icon: "move",
    shortcut: "M",
  },
  { id: "roofLine", group: "shape", label: "Line: draw a break line", icon: "edit", shortcut: "L" },
  { id: "rectangle", group: "shape", label: "Rectangle: a new outline", icon: "rectangle", shortcut: "R" },
  { id: "circle", group: "shape", label: "Circle: a new outline", icon: "circle", shortcut: "C" },
  { id: "polygon", group: "shape", label: "Polygon: a new outline", icon: "polygon", shortcut: "P" },
  ...viewTools,
];

/**
 * A roof face view (Phase 19.3): Select and Move holes and roof windows, Rectangle, Circle and Polygon draw holes,
 * Roof window places one; Pan (the view looks straight at the slope, so no Orbit).
 */
const roofFaceTools = (): readonly ToolDefinition[] => [
  {
    id: "select",
    group: "general",
    label: "Select holes and roof windows",
    icon: "pointer",
    shortcut: "Space",
  },
  {
    id: "nudge",
    group: "general",
    label: "Move: move holes and roof windows on the slope",
    icon: "move",
    shortcut: "M",
  },
  { id: "rectangle", group: "shape", label: "Rectangle: a hole", icon: "rectangle", shortcut: "R" },
  { id: "circle", group: "shape", label: "Circle: a hole", icon: "circle", shortcut: "C" },
  { id: "polygon", group: "shape", label: "Polygon: a hole", icon: "polygon", shortcut: "P" },
  { id: "roofWindow", group: "shape", label: "Roof window: place one", icon: "window", shortcut: "W" },
  { id: "pan", group: "view", label: "Pan: drag to move the view", icon: "hand", shortcut: "H" },
];

/** The toolbox level of the current UI state. */
export const toolLevelOf = (
  ui: Readonly<{
    houseOverview: boolean;
    focusRoofId: string | undefined;
    focusRoofFace?: Readonly<{ x: number; y: number }> | undefined;
    mode: EditorMode;
  }>,
): ToolLevel =>
  ui.houseOverview
    ? "house"
    : ui.focusRoofFace !== undefined
      ? "roofFace"
      : ui.focusRoofId !== undefined
        ? "roof"
        : ui.mode;

/** Whole-house overview (Phase 16.4): floors are groups; Select picks them, Nudge moves them. */
const houseTools = (): readonly ToolDefinition[] => [
  { id: "select", group: "general", label: "Select floors", icon: "pointer", shortcut: "Space" },
  {
    id: "nudge",
    group: "general",
    label: "Nudge: move the selected floors (↑ up/down, → red, ← green)",
    icon: "move",
    shortcut: "M",
  },
  ...viewTools,
];

const roomEditorTools = (): readonly ToolDefinition[] => {
  return [
    {
      id: "select",
      group: "general",
      label: "Select shapes, walls, and objects",
      icon: "pointer",
      shortcut: "Space",
    },
    {
      id: "nudge",
      group: "general",
      label: "Nudge: move shapes, objects, lights, and openings",
      icon: "move",
      shortcut: "M",
    },
    {
      id: "rotate",
      group: "general",
      label: "Rotate shapes, carpets, objects, and lights",
      icon: "rotate",
      shortcut: "Q",
    },
    {
      id: "cornerEdit",
      group: "shape",
      label: "Corner edit: move one corner",
      icon: "corner",
      shortcut: "V",
    },
    {
      id: "rectangle",
      group: "shape",
      label: "Rectangle (Shift: square)",
      icon: "rectangle",
      shortcut: "R",
    },
    { id: "circle", group: "shape", label: "Circle", icon: "circle", shortcut: "C" },
    { id: "polygon", group: "shape", label: "Polygon pencil", icon: "polygon", shortcut: "P" },
    {
      id: "raiseWall",
      group: "wall",
      label: "Push/pull: raise or change wall height",
      icon: "wall",
      shortcut: "U",
    },
    { id: "trimWall", group: "wall", label: "Trim or extend wall ends", icon: "trim", shortcut: "E" },
    { id: "splitWall", group: "wall", label: "Split wall", icon: "split", shortcut: "S" },
    {
      id: "fillWalls",
      group: "wall",
      label: "Fill walls: replace the room's walls with full walls around its outline",
      icon: "paintBucket",
      shortcut: "W",
    },
    { id: "tape", group: "measure", label: "Measuring tape", icon: "ruler", shortcut: "T" },
    ...viewTools,
  ];
};

const overviewTools = (): readonly ToolDefinition[] => {
  return [
    { id: "select", group: "general", label: "Select", icon: "pointer", shortcut: "Space" },
    {
      id: "nudge",
      group: "general",
      label: "Nudge: move rooms, objects, and lights",
      icon: "move",
      shortcut: "M",
    },
    {
      id: "rotateArea",
      group: "general",
      label: "Rotate rooms, carpets, objects, and lights",
      icon: "rotate",
      shortcut: "Q",
    },
    { id: "tape", group: "measure", label: "Measuring tape", icon: "ruler", shortcut: "T" },
    ...viewTools,
  ];
};

/** The tool a key selects in this mode ("Space" for the space bar, letters case-insensitive). */
export const toolForShortcut = (
  mode: ToolLevel,
  key: string,
  carpet = false,
  face = false,
  feature = false,
): ToolId | undefined => {
  const name = key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : undefined;
  if (name === undefined) return undefined;
  return toolsForMode(mode, carpet, face, feature).find((tool) => tool.shortcut === name)?.id;
};

/** A tool a key selects in some level but not in this one (Phase 7.1: say so instead of doing nothing). */
export const unavailableToolForShortcut = (key: string): ToolDefinition | undefined => {
  const name = key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : undefined;
  if (name === undefined) return undefined;
  return [...roomEditorTools(), ...overviewTools(), ...roofTools(), ...roofFaceTools()].find(
    (tool) => tool.shortcut === name,
  );
};
