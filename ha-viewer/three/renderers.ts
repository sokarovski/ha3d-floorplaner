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

/** One adjustable value of a renderer, shown as a slider (per device). */
export type RendererSetting = Readonly<{
  key: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  /** Shown as a percentage of the value (0.1 → 10 %). */
  percent: boolean;
}>;

export type RendererSettings = Readonly<Record<string, number>>;

/** One frame to draw: the WebGL renderer, the scene, and the camera already placed for this frame. */
export type RenderFrame = Readonly<{ renderer: WebGLRenderer; scene: Scene; camera: Camera }>;

export type RoomFade = "dither" | "fade";
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
  abstract readonly description: string;
  protected readonly settings: RendererSettings;

  constructor(settings: RendererSettings = {}) {
    this.settings = settings;
  }

  /** The values a device can adjust for this renderer. */
  settingsSchema(): readonly RendererSetting[] {
    return [];
  }

  /** Every setting's value on this device (for a picker). */
  currentSettings(): RendererSettings {
    return Object.fromEntries(
      this.settingsSchema().map((setting) => [setting.key, this.setting(setting.key)]),
    );
  }

  /** A setting's value on this device, within its range, else its default. */
  protected setting(key: string): number {
    const schema = this.settingsSchema().find((setting) => setting.key === key);
    if (schema === undefined) return Number.NaN;
    const value = this.settings[key];
    return typeof value === "number" && Number.isFinite(value)
      ? Math.min(schema.max, Math.max(schema.min, value))
      : schema.defaultValue;
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

/** The default: the room fade by dither, with an adjustable share of what stays visible. */
export class DitheredRenderer extends ViewerRenderer {
  readonly id: string = "dithered";
  readonly label: string = "Dithered";
  readonly description: string =
    "Fast. An open room fades the rest with a fine pixel pattern, without rebuilding anything.";

  override settingsSchema(): readonly RendererSetting[] {
    return [
      {
        key: "othersVisible",
        label: "Other rooms visible",
        hint: "How much of the other rooms stays drawn while a room is open (the walls in front of it stay a bit more).",
        min: 0.03,
        max: 0.5,
        step: 0.01,
        defaultValue: defaultDitherLevels.dimmed,
        percent: true,
      },
    ];
  }

  override ditherLevels(): DitherLevels {
    const others = this.setting("othersVisible");
    // The near walls keep 2.5 times as much (the default 10 % → 25 %), at most 75 %.
    return { dimmed: others, faded: Math.min(0.75, others * 2.5) };
  }
}

/** The earlier look: other rooms as transparent copies (smooth, but each room open rebuilds and compiles). */
export class SeeThroughRenderer extends DitheredRenderer {
  override readonly id: string = "seeThrough";
  override readonly label: string = "See-through";
  override readonly description: string =
    "Smooth transparency for the other rooms. Heavier: opening a room rebuilds walls and compiles shaders.";

  override settingsSchema(): readonly RendererSetting[] {
    return [];
  }

  override roomFade(): RoomFade {
    return "fade";
  }
}

/** For phones and older tablets: lower sharpness, fewer and smaller lamp shadows, no extra floors during a ride. */
export class LowPowerRenderer extends DitheredRenderer {
  override readonly id: string = "lowPower";
  override readonly label: string = "Low power";
  override readonly description: string =
    "Dithered, at 1.5× sharpness with 4 lamp shadows of lower resolution: less memory and battery.";

  override limits(): ViewerLimits {
    return lowLimits;
  }

  override floorsBelowDuringRide(): boolean {
    return false;
  }
}

/** Every renderer a device can pick, the default first. */
export const rendererList: readonly Readonly<{
  id: string;
  create: (settings: RendererSettings) => ViewerRenderer;
}>[] = [
  { id: "dithered", create: (settings) => new DitheredRenderer(settings) },
  { id: "seeThrough", create: (settings) => new SeeThroughRenderer(settings) },
  { id: "lowPower", create: (settings) => new LowPowerRenderer(settings) },
];

const choiceKey = "homeplan.renderer";
const settingsKey = (id: string): string => `homeplan.renderer.${id}`;

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const readSettings = (id: string): RendererSettings => {
  const raw = read(settingsKey(id));
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const values: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed))
      if (typeof value === "number" && Number.isFinite(value)) values[key] = value;
    return values;
  } catch {
    return {};
  }
};

/** A renderer by ID with this device's settings for it (unknown IDs fall back to the default). */
export const createRenderer = (id: string, settings: RendererSettings = readSettings(id)): ViewerRenderer => {
  const entry = rendererList.find((candidate) => candidate.id === id) ?? rendererList[0];
  return entry === undefined ? new DitheredRenderer(settings) : entry.create(settings);
};

/** This device's renderer and its settings (the default when nothing is stored or storage is blocked). */
export const deviceRenderer = (): ViewerRenderer => createRenderer(read(choiceKey) ?? "dithered");

/** Every renderer with this device's settings, for a picker. */
export const availableRenderers = (): readonly ViewerRenderer[] =>
  rendererList.map((entry) => entry.create(readSettings(entry.id)));

/** Stores this device's choice and the chosen renderer's settings; false when storage is blocked. */
export const saveDeviceRenderer = (id: string, settings: RendererSettings): boolean => {
  try {
    window.localStorage.setItem(choiceKey, id);
    window.localStorage.setItem(settingsKey(id), JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
};
