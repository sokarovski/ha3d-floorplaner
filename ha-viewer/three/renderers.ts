// Viewer renderers (Phase 21.11, owner design 2026-11-20): a renderer takes the shown house and draws the screen.
// The viewer lists the renderers; each device picks one (stored in this browser, like the other per-device choices;
// D12: no per-user settings). A renderer defines the whole procedure: how a frame is drawn, how an open room fades
// the rest, the sharpness and shadow limits, the glass reflection, the backdrop, and which floors show during a
// floor switch. Renderers share code by extending a class and overriding only what differs. New renderers arrive as
// reviewed code (pull requests) added to `rendererList`; nothing is loaded at runtime.
//
// The choice is read once when a viewer starts; changing it reloads the page. Framework-free (Three.js types only).
import type { Camera, Scene, WebGLRenderer } from "three";
import { defaultDitherLevels } from "./ditherFade";
import type { DitherLevels } from "./ditherFade";

/** What a renderer limits (memory and fill rate). */
export type ViewerLimits = Readonly<{
  pixelRatioCap: number;
  /** null: the GPU's budget (`shadowBudget`). */
  floorShadowLamps: number | null;
  pointShadowSize: number;
}>;

/**
 * A renderer's editable fields (owner, 2026-11-20): each renderer class declares them in a static `fields` property,
 * keyed by the stored name; Settings → Panels shows them as a form when the renderer is chosen, and the values are
 * kept per device. Three types: a slider (a number in a range, optionally in %), a toggle (on or off) and a select
 * (one of a few options). A stored value that does not fit its field reads as the field's default.
 */
export type RendererField =
  | Readonly<{
      type: "slider";
      label: string;
      hint?: string;
      min: number;
      max: number;
      step: number;
      /** Shown after the value ("%", "px"). */
      unit?: string;
      defaultValue: number;
    }>
  | Readonly<{ type: "toggle"; label: string; hint?: string; defaultValue: boolean }>
  | Readonly<{
      type: "select";
      label: string;
      hint?: string;
      options: readonly Readonly<{ value: string; label: string }>[];
      defaultValue: string;
    }>;

export type RendererFields = Readonly<Record<string, RendererField>>;

/** A field's value: a number (slider), a boolean (toggle) or a string (select). */
export type RendererValue = number | boolean | string;
export type RendererValues = Readonly<Record<string, RendererValue>>;

/** The value if it fits the field (a slider's number is kept within its range), else the field's default. */
export const fieldValue = (field: RendererField, value: unknown): RendererValue => {
  switch (field.type) {
    case "slider":
      return typeof value === "number" && Number.isFinite(value)
        ? Math.min(field.max, Math.max(field.min, value))
        : field.defaultValue;
    case "toggle":
      return typeof value === "boolean" ? value : field.defaultValue;
    case "select":
      return field.options.some((option) => option.value === value) && typeof value === "string"
        ? value
        : field.defaultValue;
  }
};

/** Every field's value from stored ones (unknown keys dropped, missing or invalid ones at their default). */
export const fieldValues = (
  fields: RendererFields,
  stored: Readonly<Record<string, unknown>>,
): RendererValues =>
  Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, fieldValue(field, stored[key])]));

/** One frame to draw: the WebGL renderer, the scene, and the camera already placed for this frame. */
export type RenderFrame = Readonly<{ renderer: WebGLRenderer; scene: Scene; camera: Camera }>;

/** How an open room shows the rest: dithered, transparent copies, or not at all (every room stays solid). */
export type RoomFade = "dither" | "fade" | "none";
export type Backdrop = "orb" | "plain";

const standardLimits: ViewerLimits = { pixelRatioCap: 2, floorShadowLamps: null, pointShadowSize: 512 };
const lowLimits: ViewerLimits = { pixelRatioCap: 1.5, floorShadowLamps: 4, pointShadowSize: 256 };

/**
 * The base renderer: the viewer's standard procedure. Subclasses override what they do differently; every method
 * is called by the viewer, so a renderer can change any step.
 */
export abstract class ViewerRenderer {
  abstract readonly id: string;
  abstract readonly label: string;
  /** What it does, in a sentence. */
  abstract readonly description: string;
  /** Where it fits best (the picker shows it). */
  abstract readonly bestFor: string;
  /** What it costs or leaves out (the picker shows it). */
  abstract readonly tradeOffs: string;
  /** The renderer's editable fields: its class's static `fields`. */
  readonly fields: RendererFields;
  /** This device's values, one per field. */
  readonly values: RendererValues;

  constructor(fields: RendererFields, stored: Readonly<Record<string, unknown>> = {}) {
    this.fields = fields;
    this.values = fieldValues(fields, stored);
  }

  /** A slider's value (NaN for another field). */
  protected number(key: string): number {
    const value = this.values[key];
    return typeof value === "number" ? value : Number.NaN;
  }

  /** A toggle's value (false for another field). */
  protected flag(key: string): boolean {
    return this.values[key] === true;
  }

  /** A select's value ("" for another field). */
  protected choice(key: string): string {
    const value = this.values[key];
    return typeof value === "string" ? value : "";
  }

  limits(): ViewerLimits {
    return standardLimits;
  }

  /** How an open room fades the rest: the shader dither (one compile, nothing rebuilt) or transparent copies. */
  roomFade(): RoomFade {
    return "dither";
  }

  /** The dithered fade's levels: the share of pixels kept for the other rooms and for the room's near walls. */
  ditherLevels(): DitherLevels {
    return defaultDitherLevels;
  }

  /** The glass reflection under the house (it draws the house a second time). */
  reflection(): boolean {
    return false;
  }

  /** The stage behind the house: the soft glow and floor, or plain sky. */
  backdrop(): Backdrop {
    return "orb";
  }

  /** Whether a floor switch's ride shows the floors below the destination (else only the destination). */
  floorsBelowDuringRide(): boolean {
    return true;
  }

  /** Draws one frame. */
  draw(frame: RenderFrame): void {
    frame.renderer.render(frame.scene, frame.camera);
  }
}

/** Picture quality: the standard limits, or lower sharpness with fewer, smaller lamp shadows. */
const qualityField: RendererField = {
  type: "select",
  label: "Picture quality",
  hint: "Low power: 1.5× sharpness and 4 lamp shadows of lower resolution (at night the other lamps shine through walls); for older phones and wall tablets.",
  options: [
    { value: "standard", label: "Standard" },
    { value: "low", label: "Low power" },
  ],
  defaultValue: "standard",
};

const floorsBelowField: RendererField = {
  type: "toggle",
  label: "Show the floors below during a floor switch",
  hint: "Off draws only the new floor while the camera rides to it (lighter).",
  defaultValue: true,
};

/**
 * The default (owner, 2026-11-20: one renderer with fields instead of one per variant): an open room fades the rest
 * with the shader dither; how much stays visible goes from only the open room (0 %) to every room solid (100 %, no
 * fading at all); the open room's walls on the camera's side keep their own share; quality and the ride's floors
 * are fields too.
 */
export class DitheredRenderer extends ViewerRenderer {
  static readonly fields: RendererFields = {
    otherRooms: {
      type: "slider",
      label: "Other rooms visible",
      hint: "While a room is open: 0 % shows only that room, 100 % keeps every room solid (nothing fades).",
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
      defaultValue: 10,
    },
    nearWalls: {
      type: "slider",
      label: "Walls in front of the open room",
      hint: "How much of the open room's walls on your side stays drawn; 0 % lets you see straight in.",
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
      defaultValue: 25,
    },
    quality: qualityField,
    floorsBelow: floorsBelowField,
  };
  readonly id: string = "dithered";
  readonly label: string = "Dithered";
  readonly description: string =
    "An open room fades the rest with a fine pixel pattern, without rebuilding anything; how much stays visible is up to you.";
  readonly bestFor: string =
    "Every device: phones, tablets and desktops. The default. From 0 % (only the open room) to 100 % (nothing fades).";
  readonly tradeOffs: string =
    "Up close the faded rooms look like a fine dot pattern rather than smooth glass.";

  constructor(
    stored: Readonly<Record<string, unknown>> = {},
    fields: RendererFields = DitheredRenderer.fields,
  ) {
    super(fields, stored);
  }

  override limits(): ViewerLimits {
    return this.choice("quality") === "low" ? lowLimits : standardLimits;
  }

  override floorsBelowDuringRide(): boolean {
    return this.flag("floorsBelow");
  }

  override roomFade(): RoomFade {
    return this.number("otherRooms") >= 100 ? "none" : "dither";
  }

  override ditherLevels(): DitherLevels {
    const others = this.number("otherRooms") / 100;
    // The near walls never fade more than the other rooms.
    return { dimmed: others, faded: Math.max(others, this.number("nearWalls") / 100) };
  }
}

/** The earlier look: other rooms as transparent copies (smooth, but each room open rebuilds and compiles). */
export class SeeThroughRenderer extends DitheredRenderer {
  static override readonly fields: RendererFields = {
    quality: qualityField,
    floorsBelow: floorsBelowField,
  };
  override readonly id: string = "seeThrough";
  override readonly label: string = "See-through";
  override readonly description: string = "The other rooms turn smoothly transparent while a room is open.";
  override readonly bestFor: string = "Desktops and fast tablets, when the smooth look matters most.";
  override readonly tradeOffs: string =
    "Heavier: opening a room rebuilds walls and compiles shaders, which can stutter or crash a phone.";

  constructor(stored: Readonly<Record<string, unknown>> = {}) {
    super(stored, SeeThroughRenderer.fields);
  }

  override roomFade(): RoomFade {
    return "fade";
  }
}

/** Every renderer a device can pick, the default first, with its class's fields. */
export const rendererList: readonly Readonly<{
  id: string;
  fields: RendererFields;
  create: (stored: Readonly<Record<string, unknown>>) => ViewerRenderer;
}>[] = [
  { id: "dithered", fields: DitheredRenderer.fields, create: (stored) => new DitheredRenderer(stored) },
  { id: "seeThrough", fields: SeeThroughRenderer.fields, create: (stored) => new SeeThroughRenderer(stored) },
];

/**
 * Renderers that became fields of Dithered (owner, 2026-11-20): a device that chose one keeps its look, as the
 * Dithered renderer with these values.
 */
const merged: Readonly<Record<string, Readonly<{ id: string; values: RendererValues }>>> = {
  lowPower: { id: "dithered", values: { quality: "low", floorsBelow: false } },
  fullyVisible: { id: "dithered", values: { otherRooms: 100 } },
  roomOnly: { id: "dithered", values: { otherRooms: 0, nearWalls: 0 } },
};

const choiceKey = "homeplan.renderer";
const settingsKey = (id: string): string => `homeplan.renderer.${id}`;

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** A renderer's stored values in this browser (checked against its fields when the renderer is created). */
const readValues = (id: string): Readonly<Record<string, unknown>> => {
  const raw = read(settingsKey(id));
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed))
      : {};
  } catch {
    return {};
  }
};

/** A renderer by ID with these values (unknown IDs fall back to the default). */
export const createRenderer = (
  id: string,
  stored: Readonly<Record<string, unknown>> = readValues(id),
): ViewerRenderer => {
  const entry = rendererList.find((candidate) => candidate.id === id) ?? rendererList[0];
  return entry === undefined ? new DitheredRenderer(stored) : entry.create(stored);
};

/** This device's renderer and its values (the default when nothing is stored or storage is blocked). */
export const deviceRenderer = (): ViewerRenderer => {
  const id = read(choiceKey) ?? "dithered";
  const old = merged[id];
  return old === undefined
    ? createRenderer(id)
    : createRenderer(old.id, { ...readValues(old.id), ...old.values });
};

/** Every renderer with this device's values for it, for a picker (the chosen one as it runs). */
export const availableRenderers = (): readonly ViewerRenderer[] => {
  const current = deviceRenderer();
  return rendererList.map((entry) =>
    entry.id === current.id ? current : entry.create(readValues(entry.id)),
  );
};

/** Stores this device's choice and the chosen renderer's values; false when storage is blocked. */
export const saveDeviceRenderer = (id: string, values: RendererValues): boolean => {
  try {
    window.localStorage.setItem(choiceKey, id);
    window.localStorage.setItem(settingsKey(id), JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
};
