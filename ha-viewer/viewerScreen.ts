// The viewer screen: the stage fills the panel, with a thin top bar (spec/home-assistant/viewer-mvp.md#viewer-screen)
// and Edit mode for Home Assistant bindings (spec/home-assistant/bindings.md#editor): object actions (8.3), and
// room and placed bubbles drawn over the canvas (8.5, bubbleOverlay.ts).
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, PropertyValues, TemplateResult } from "lit";
import { defaultBubbleAction } from "@shared/domain/homeAssistant/bubbles";
import { createId } from "@shared/domain/ids";
import { emptyHouseBindings } from "@shared/domain/schemas/homeAssistant";
import type {
  HaActionValue,
  HaAreaViewValue,
  HaBubbleAnchorValue,
  HaBubbleContentValue,
  HaDashboardValue,
  HaEffectVariantValue,
  HaHouseBindingsValue,
  HaAreaPresenceValue,
  HaSweepCornerValue,
  HaHouseBubblesValue,
  HaRoomBubbleValue,
  HaStateValueValue,
} from "@shared/domain/schemas/homeAssistant";
import { liveStateValues, openingGestureAction } from "@shared/domain/homeAssistant/stateParameters";
import { HomeplanBubbleOverlay } from "./bubbleOverlay";
import type { BubbleGestureDetail, BubbleItem, BubbleMoveDetail } from "./bubbleOverlay";
import type { GestureTarget } from "./gestures";
import type { EditorTarget, SettingsSaved } from "./bindingEditor";
import { createBindingEvaluator, intrusionRooms } from "./bindingEvaluator";
import type { BindingEvaluator } from "./bindingEvaluator";
import { bindingTargets } from "./bindingTargets";
import { viewerFloor } from "./viewerFloor";
import { createTvScreens } from "./tvScreens";
import type { BindingTarget } from "./bindingTargets";
import { readEditTipHidden, writeEditTipHidden } from "./editTipSetting";
import { readViews, roomColumns, roomHasTab, without } from "./dashboardViews";
import type { DashboardView } from "./dashboardViews";
import { compactWidthPx, roomFrameInsets, widgetGapPx, widgetMarginPx } from "./roomInsets";
import { suggestionData } from "./entitySuggestions";
import { roomHaArea } from "@shared/domain/homeAssistant/suggestions";
import { entityColourMode } from "./lightOutput";
import { defaultAction, defaultObjectAction, runAction } from "./haActions";
import { loadHaForm } from "./haElements";
import type { Gesture } from "./haActions";
import type { HassEntity, HassStore } from "./hassStore";
import type { IntegrationClient } from "./integrationClient";
import type { HouseSource, ViewerSetup } from "./houseSource";
import { sunPositionAt } from "@shared/domain/environment/sun";
import { tokens } from "./styles/tokens";
import { HouseViewer, noInsets } from "./three/houseViewer";
import type { FrameInsets, LightState, LoadProgress, ViewPreset } from "./three/houseViewer";
import { loadTimingRequested } from "./three/loadTiming";
import { createSwatchMemory } from "./swatchMemory";
import { effectiveNavigation } from "./navigationSetting";
import { touchFirstDevice } from "./touchDevice";
import type { WidgetsSize } from "./floorWidgets";
import type { SettingsFloor } from "./bindingEditor";
import type { EffectLive } from "../src/renderer/effectsLayer";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { HouseDocument } from "@shared/domain/schemas/house";
import { floorsByElevation } from "@shared/domain/house/floorPlacement";
import {
  floorBindings,
  houseBindings,
  floorView,
  initialView,
  isMultiFloor,
  mainViewOf,
  sameView,
  stepBetween,
  stepView,
  wholeHouse,
} from "./floorNavigation";
import type { FloorStep, ViewerView } from "./floorNavigation";

const menuIcon = "M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z";

/** Backdrop shift per radian of camera tilt, as a fraction of its height (implementation convention). */
const backdropParallax = 0.05;

/** mdi:cog (the room settings, in the top bar while a room is open, 14.4) and mdi:close */
const cogIcon =
  "M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z";
const closeIcon =
  "M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z";

/**
 * How far the backdrop's glow follows the free area the house is framed in (14.5): this share of the way from the
 * screen centre to the free area's centre (implementation convention, to tune with the owner).
 */
const backdropFollow = 0.35;

/**
 * The view buttons (14.6), the builder's own camera-button icons (src/design-system Icon `lookDown`,
 * `rotateQuarter`, `frame`; stroke paths on a 24 × 24 grid), so both hosts show the same buttons.
 */
const viewButtons: readonly Readonly<{ preset: ViewPreset; title: string; path: string }>[] = [
  {
    preset: "top",
    title: "Look straight down, then fit",
    path: "M12 3a6 4 0 0 0-6 4 6 4 0 0 0 12 0 6 4 0 0 0-6-4zM12 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM12 12v4M10 14.5l2 2 2-2M4 19h16",
  },
  {
    preset: "turn",
    title: "Rotate the view 90°, then fit",
    path: "M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M12 8v4h4",
  },
  { preset: "fit", title: "Fit to screen", path: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" },
];

/**
 * The floor controls (16.1) beside the view buttons, multi-floor houses only: the whole house, a floor up, a floor
 * down; stroke paths on the same 24 × 24 grid.
 */
const floorButtons: readonly Readonly<{ control: "house" | FloorStep; title: string; path: string }>[] = [
  { control: "house", title: "Whole house", path: "M4 11.5 12 5l8 6.5M6.5 9.5V19h11V9.5M10 19v-4.5h4V19" },
  { control: "up", title: "Up a floor", path: "M6 14.5l6-6 6 6" },
  { control: "down", title: "Down a floor", path: "M6 9.5l6 6 6-6" },
];

/** How long a floor's name shows after a switch (ms, implementation convention). */
const floorNameMs = 1600;

/** mdi:pencil (Edit mode, D25) */
const editIcon =
  "M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z";

const gestureKeys = { tap: "tapAction", hold: "holdAction", doubleTap: "doubleTapAction" } as const;

const rgbOf = (value: unknown): readonly [number, number, number] | null => {
  if (!Array.isArray(value)) return null;
  const r: unknown = value[0];
  const g: unknown = value[1];
  const b: unknown = value[2];
  return typeof r === "number" && typeof g === "number" && typeof b === "number" ? [r, g, b] : null;
};

/**
 * An HA light entity as a 3D light state; null when unknown or unavailable (the light is then drawn off). The
 * binding's overrides (13.6): `lumens` always replaces the house output; `kelvin` is the default temperature
 * only while the entity is no colour light (a colour light's live colour or colour temperature wins).
 */
const lightStateOf = (
  entity: HassEntity | undefined,
  overrides: Readonly<{ lumens?: number; kelvin?: number }>,
): LightState | null => {
  if (entity === undefined || (entity.state !== "on" && entity.state !== "off")) return null;
  const on = entity.state === "on";
  const brightness = entity.attributes.brightness;
  const mode = entity.attributes.color_mode;
  const kelvin = entity.attributes.color_temp_kelvin;
  const rgb = on && mode !== "color_temp" && mode !== "white" ? rgbOf(entity.attributes.rgb_color) : null;
  const liveKelvin = on && mode === "color_temp" && typeof kelvin === "number" ? kelvin : null;
  const colour = entityColourMode(entity.attributes) !== null;
  return {
    on,
    brightness: on && typeof brightness === "number" ? Math.min(Math.max(brightness / 255, 0), 1) : null,
    rgb,
    kelvin: liveKelvin ?? (colour || rgb !== null ? null : (overrides.kelvin ?? null)),
    lumens: overrides.lumens ?? null,
  };
};

/** A variant's look overrides (its `when` dropped); absent fields keep the authored value. */
const variantOverrides = (variant: HaEffectVariantValue): NonNullable<EffectLive["overrides"]> => ({
  kind: variant.kind,
  color: variant.color,
  direction: variant.direction,
  sizeMm: variant.sizeMm,
});

/** The top bar's height, kept clear above the floor widgets (px). */
const widgetTopPx = 56;

/** The screen insets the floor widgets take, so the house is framed into the rest (13.7). */
const widgetInsets = (size: WidgetsSize | null, width: number, height: number): FrameInsets => {
  if (size === null || size.width === 0 || size.height === 0 || width === 0 || height === 0) return noInsets;
  const across = Math.min((size.width + widgetMarginPx + widgetGapPx) / width, 0.7);
  if (size.position === "left") return { ...noInsets, left: across };
  if (size.position === "right") return { ...noInsets, right: across };
  if (size.position === "top")
    return { ...noInsets, top: Math.min((size.height + widgetTopPx + widgetGapPx) / height, 0.6) };
  return { ...noInsets, bottom: Math.min((size.height + widgetMarginPx + widgetGapPx) / height, 0.6) };
};

/** How often the sun is re-read when HA has no `sun.sun` entity (the position is then computed from HA's location). */
const solarRefreshMs = 60_000;

type Solar = Readonly<{ azimuthDeg: number; elevationDeg: number; night: boolean }>;

/**
 * The real sun for the viewer: Home Assistant's `sun.sun` entity (azimuth, elevation, above/below horizon) when
 * it exists, else the position computed now from HA's configured location, else null (the house's own sun).
 */
const solarOf = (store: HassStore | undefined): Solar | null => {
  const sun = store?.entity("sun.sun");
  const azimuth = sun?.attributes.azimuth;
  const elevation = sun?.attributes.elevation;
  if (typeof azimuth === "number" && typeof elevation === "number")
    return { azimuthDeg: azimuth, elevationDeg: elevation, night: sun?.state === "below_horizon" };
  const config = store?.current()?.config;
  if (typeof config?.latitude === "number" && typeof config.longitude === "number") {
    const position = sunPositionAt(new Date(), config.latitude, config.longitude, 0);
    return {
      azimuthDeg: position.azimuthDeg,
      elevationDeg: position.elevationDeg,
      night: position.elevationDeg < 0,
    };
  }
  return null;
};

/** The bubble popup of the viewer screen: a placed bubble (new or existing), or a room bubble tapped in Edit mode. */
type BubbleEditing =
  | Readonly<{
      kind: "placed";
      id: string;
      content: HaBubbleContentValue;
      anchor: HaBubbleAnchorValue;
      isNew: boolean;
    }>
  | Readonly<{ kind: "room"; id: string; areaId: string; content: HaBubbleContentValue }>;

/** A bubble's content without its ID (room) or anchor (placed). */
const contentOf = (bubble: HaBubbleContentValue): HaBubbleContentValue => {
  const {
    preset,
    format,
    stateEntityId,
    tapAction,
    holdAction,
    doubleTapAction,
    visibleWhen,
    attribute,
    icon: iconName,
    style,
  } = bubble;
  return {
    preset,
    format,
    ...(stateEntityId === undefined ? {} : { stateEntityId }),
    ...(tapAction === undefined ? {} : { tapAction }),
    ...(holdAction === undefined ? {} : { holdAction }),
    ...(doubleTapAction === undefined ? {} : { doubleTapAction }),
    ...(visibleWhen === undefined ? {} : { visibleWhen }),
    ...(attribute === undefined ? {} : { attribute }),
    ...(iconName === undefined ? {} : { icon: iconName }),
    ...(style === undefined ? {} : { style }),
  };
};

const icon = (path: string): TemplateResult =>
  html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d=${path}></path></svg>`;

export class HomeplanViewerScreen extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    source: { attribute: false },
    setup: { attribute: false },
    narrow: { attribute: false },
    dev: { attribute: false },
    openArea: { attribute: false },
    integrationClient: { attribute: false },
  };

  static override styles = [
    tokens,
    css`
      :host {
        position: relative;
        display: block;
        height: 100%;
        overflow: hidden;
        --hp-stage-sky: #ffffff;
        --hp-stage-horizon: #dcdee2;
        --hp-stage-floor: #f4f5f7;
      }
      :host([data-dark]) {
        --hp-stage-sky: #2a2c30;
        --hp-stage-horizon: #141517;
        --hp-stage-floor: #34363b;
      }
      /*
       * The stage backdrop, fixed to the screen: a sky fading to the horizon colour and a large
       * half-ellipse floor rising from the bottom edge, lighter where the house stands. It is oversized so
       * the tilt parallax (--hp-backdrop-shift, set by the viewer) never shows its edges. The glow and the
       * floor follow the free area the house is framed in part of the way (--hp-orb-dx, --hp-orb-dy, 14.5).
       */
      .backdrop {
        position: absolute;
        inset: -8%;
        transform: translateY(var(--hp-backdrop-shift, 0%));
        background:
          radial-gradient(
            ellipse 33% 19% at calc(50% + var(--hp-orb-dx, 0px)) calc(64% + var(--hp-orb-dy, 0px)),
            var(--hp-stage-floor) 0%,
            transparent 100%
          ),
          radial-gradient(
            ellipse 67% 55% at calc(50% + var(--hp-orb-dx, 0px)) calc(93% + var(--hp-orb-dy, 0px)),
            var(--hp-stage-floor) 0%,
            var(--hp-stage-horizon) 97%,
            transparent 100%
          ),
          linear-gradient(var(--hp-stage-sky) 0%, var(--hp-stage-horizon) 60%, var(--hp-stage-horizon) 100%);
      }
      /*
       * Night (the sun below the horizon, from Home Assistant), over the day backdrop: deep space, near-black with no
       * stars, fixed on screen (owner: no parallax for the sky), and a dim
       * moonlit floor disc that alone follows the tilt parallax like the day floor. Both fade in over 2 s.
       */
      .night-sky,
      .night-floor {
        position: absolute;
        opacity: 0;
        transition: opacity 2s ease;
        pointer-events: none;
      }
      .night-sky {
        inset: 0;
        /* Deep space, not a sky (Phase 8.10, owner): no stars, near-black to a very dark blue-grey. */
        background: linear-gradient(#000000 0%, #05070c 45%, #0b0e16 100%);
      }
      .night-floor {
        inset: -8%;
        transform: translateY(var(--hp-backdrop-shift, 0%));
        background:
          radial-gradient(
            ellipse 33% 19% at calc(50% + var(--hp-orb-dx, 0px)) calc(64% + var(--hp-orb-dy, 0px)),
            rgba(140, 152, 182, 0.22) 0%,
            transparent 100%
          ),
          radial-gradient(
            ellipse 67% 55% at calc(50% + var(--hp-orb-dx, 0px)) calc(93% + var(--hp-orb-dy, 0px)),
            #3f4555 0%,
            #232835 70%,
            #0b0e16 97%,
            transparent 100%
          );
      }
      :host([data-night]) .night-sky,
      :host([data-night]) .night-floor {
        opacity: 1;
      }
      canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        touch-action: none;
        cursor: grab;
        transition: opacity 0.35s ease;
      }
      /* The house model fades in once its shaders compiled and its first shadow pass is drawn (15.1). */
      canvas[data-preparing] {
        opacity: 0;
      }
      /*
       * Loading of the separate objects and textures after the opening (15.1, owner): a thin bar under the house, in
       * the free area the house is framed in, fading out when everything has loaded. Its fill is a CSS variable set by
       * the viewer's progress callback, without a Lit render.
       */
      .load-bar {
        position: absolute;
        left: calc(50% + (var(--hp-free-left, 0px) - var(--hp-free-right, 0px)) / 2);
        bottom: calc(20px + var(--hp-free-bottom, 0px));
        width: min(160px, 40%);
        height: 3px;
        transform: translateX(-50%);
        border-radius: 2px;
        background: var(--hp-divider);
        overflow: hidden;
        opacity: 0;
        transition: opacity 0.6s ease;
        pointer-events: none;
      }
      :host([data-loading]) .load-bar {
        opacity: 1;
      }
      .load-bar > span {
        display: block;
        height: 100%;
        width: calc(var(--hp-load-done, 0) * 100%);
        background: var(--hp-accent);
        border-radius: inherit;
        transition: width 0.3s ease;
      }
      canvas:active,
      canvas[data-camera-drag] {
        cursor: grabbing;
      }
      .bar {
        position: absolute;
        inset: 0 0 auto 0;
        display: flex;
        align-items: center;
        gap: var(--hp-gap);
        padding: 8px 12px;
        pointer-events: none;
      }
      .bar > * {
        pointer-events: auto;
      }
      .spacer {
        flex: 1;
      }
      /* The Edit button and the Edit mode buttons sit together in the top bar on a surface, so they stay
         visible over the night sky (owner, 2026-11-17). */
      .edit-button,
      .bar-button {
        background: var(--hp-surface);
        box-shadow: var(--hp-shadow);
      }
      .bar-button {
        border: none;
        border-radius: 999px;
        padding: 8px 16px;
        color: var(--hp-accent);
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .bar-button.primary,
      .icon-button[aria-pressed="true"] {
        background: var(--hp-accent);
        color: var(--text-primary-color, #fff);
      }
      /* Edit mode (D25): a pill under the bar says what a tap does now. */
      .edit-hint {
        position: absolute;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 6px 4px 16px;
        border-radius: 999px;
        background: var(--hp-surface);
        box-shadow: var(--hp-shadow);
        font-size: 13px;
        white-space: nowrap;
      }
      /* The Edit mode tip under the pill (owner 2026-11-16): dismissible, and can be hidden for good. */
      .edit-tip {
        position: absolute;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 4px 4px 12px;
        border-radius: 8px;
        background: var(--hp-surface);
        box-shadow: var(--hp-shadow);
        color: var(--hp-muted);
        font-size: 12px;
        width: max-content;
        max-width: min(520px, calc(100% - 32px));
      }
      .edit-tip button {
        border: none;
        background: transparent;
        color: var(--hp-accent);
        font: inherit;
        font-weight: 500;
        padding: 4px 8px;
        border-radius: 6px;
        cursor: pointer;
      }
      .edit-hint button {
        border: none;
        background: transparent;
        color: var(--hp-accent);
        font-weight: 500;
        padding: 6px 12px;
        border-radius: 999px;
        cursor: pointer;
      }
      /* Dev only (Phase 8.4): 3D frames rendered and seconds since the last one (idle effects request none). */
      .frames {
        position: absolute;
        right: 12px;
        bottom: 26px;
        pointer-events: none;
        font-size: 11px;
        color: var(--hp-muted);
        font-variant-numeric: tabular-nums;
      }
      /*
       * The view buttons (14.6): bottom-left of the free area the house is framed in (bottom-right while widgets take
       * the left side, top-left while they take the bottom), so they keep clear of the floor
       * widgets and the room cards and glide with them (--hp-free-left, --hp-free-bottom follow the sprung insets).
       */
      .view-buttons {
        position: absolute;
        left: calc(12px + var(--hp-free-left, 0px));
        bottom: calc(12px + var(--hp-free-bottom, 0px));
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      :host([data-view-buttons-right]) .view-buttons {
        left: auto;
        right: calc(12px + var(--hp-free-right, 0px));
      }
      :host([data-view-buttons-top]) .view-buttons {
        bottom: auto;
        top: calc(56px + var(--hp-free-top, 0px));
      }
      .view-buttons[hidden] {
        display: none;
      }
      /* The floor controls (16.1) sit above the view buttons, a little apart. */
      .view-buttons .floor-gap {
        height: 4px;
      }
      .view-buttons .icon-button:disabled {
        opacity: 0.4;
        cursor: default;
      }
      /* The floor's name, shown briefly on a switch (16.1). */
      .floor-name {
        position: absolute;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        padding: 6px 16px;
        border-radius: 999px;
        background: var(--hp-surface);
        box-shadow: var(--hp-shadow);
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
      }
      .floor-name[data-shown] {
        opacity: 1;
      }
      .view-buttons .icon-button {
        background: var(--hp-surface);
        box-shadow: var(--hp-shadow);
      }
      .view-buttons .icon-button svg {
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .message {
        position: absolute;
        inset: auto 0 32px 0;
        text-align: center;
        color: var(--hp-muted);
      }
      .message[data-error] {
        color: var(--hp-error);
      }
    `,
  ];

  declare store: HassStore | undefined;
  declare source: HouseSource | undefined;
  declare setup: ViewerSetup;
  declare narrow: boolean;
  declare dev: boolean;
  /** The HA integration's client (Phase 11): Settings' House node then holds House setup. */
  declare integrationClient: IntegrationClient | undefined;
  /** The area whose room cards are open beside the zoomed house, or null. */
  declare openArea: Readonly<{ id: string; name: string }> | null;
  /** The room the cards show: the open one, or the last one while its cards slide away (14.4); null before any. */
  private cardsArea: Readonly<{ id: string; name: string }> | null = null;
  /** The gear in the top bar is on: the room settings (position, sweep corners) replace the room's cards. */
  private roomSettings = false;
  /** The open room has a dashboard tab (15.6); without one it opens full-screen with no cards or insets. */
  private roomHasCards = false;
  /** The tabs of the dashboard, read on opening a room; a read that failed is not kept. */
  private roomViews: Readonly<{ urlPath: string; views: readonly DashboardView[] }> | null = null;
  private openToken = 0;
  private areaNames = new Map<string, string>();
  /** Each room's floor ID (every floor of the house), for the floors' presence gates. */
  private areaFloors = new Map<string, string>();
  private roomDashboard: HaDashboardValue = { urlPath: null, areaTabs: {}, areaViews: {}, areaColumns: {} };
  private viewer: HouseViewer | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unsubscribeMeta: (() => void) | null = null;
  private unsubscribeSun: (() => void) | null = null;
  private solarTimer = 0;
  private status: { kind: "loading" | "ready" } | { kind: "error"; message: string } = { kind: "loading" };
  private loadToken = 0;
  /** The shown floor's bindable things (lights, objects with their effects, rooms), for the binding editor. */
  private targets: readonly BindingTarget[] = [];
  /** The shown floor (the viewer shows one at a time): Settings' floor level and its widgets (13.7). */
  private shownFloor: SettingsFloor | null = null;
  /** The floor widgets' last box, while they show (13.7). */
  private widgetsSize: WidgetsSize | null = null;
  /** The screen is narrower than 700 px (the widgets go below the house). */
  private compact = false;
  /** Edit mode (D25): taps open bindings instead of running gestures. */
  private editing = false;
  /** The binding editor: closed (undefined), the list (null), or one thing. */
  private editorTarget: EditorTarget | undefined = undefined;
  private bindings: HaHouseBindingsValue = emptyHouseBindings();
  private lightStates = new Map<string, LightState>();
  /** Live state-parameter values by object or opening ID (9.7), with their text for change checks. */
  private instanceStates = new Map<
    string,
    Readonly<{ values: Readonly<Record<string, HaStateValueValue>>; key: string }>
  >();
  /** Live conditions and entity subscriptions of every binding (one per entity), for 8.0 and later consumers. */
  private evaluator: BindingEvaluator | null = null;
  private unsubscribeEvaluator: (() => void) | null = null;
  /** The Edit mode tip: shown, asking to hide it for good, or closed for this session (owner 2026-11-16). */
  private editTip: "shown" | "confirm" | "closed" = readEditTipHidden() ? "closed" : "shown";
  /** Dev frame counter (Phase 8.4): frames rendered, when the last one was, and its 1 s readout timer. */
  private frameCount = 0;
  private lastFrameAt = 0;
  private frameTimer = 0;
  /** TV screens (Phase 8.8): objects bound to a media_player show its running app. */
  private readonly tvScreens = createTvScreens((objectId, image) => {
    this.viewer?.setScreenImage(objectId, image);
  });
  /**
   * The room whose sweep corners are being chosen (8.6), or null: Settings is hidden meanwhile, taps on the house
   * toggle the room's corners in Settings' draft, and Done brings Settings back on the room (10.9).
   */
  private cornerPickingArea: string | null = null;
  /** Corners were tapped since picking started (Done then saves them). */
  private cornersChanged = false;
  /** Edit mode placing: the next tap places a bubble (8.5). No button starts it since the owner removed "Add Bubble" (2026-11-17); the function stays. */
  private placing = false;
  private bubbleEditing: BubbleEditing | null = null;
  private overlay: HomeplanBubbleOverlay | null = null;
  /** HA's ha-form is available (inside HA), for the bubble popup; plain controls otherwise. */
  private haForm = false;
  /** The loaded house and what of it is shown: the whole house or one floor (16.1). */
  private house: HouseDocument | null = null;
  private view: ViewerView | null = null;
  /** The shown floor as drawn (hidden things removed), or null in the whole-house view. */
  private shownFloorValue: BuildingFloorValue | null = null;
  /** The bindings the live evaluator follows: only the shown floor's (16.3); `bindings` keeps every floor's. */
  private liveBindings: HaHouseBindingsValue = emptyHouseBindings();
  /** The name shown briefly after a floor switch, while shown. */
  private floorName: string | null = null;
  private floorNameShown = false;
  private floorNameTimer = 0;

  constructor() {
    super();
    this.setup = { houseId: null, testEntityId: null };
    this.narrow = false;
    this.dev = false;
    this.openArea = null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void loadHaForm().then((available) => {
      this.haForm = available;
    });
    // HA may detach and re-attach the panel; the viewer is rebuilt after the next render.
    if (this.hasUpdated) this.requestUpdate();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.unsubscribeMeta?.();
    this.unsubscribeMeta = null;
    this.unsubscribeSun?.();
    this.unsubscribeSun = null;
    window.clearInterval(this.solarTimer);
    window.clearInterval(this.frameTimer);
    window.clearTimeout(this.floorNameTimer);
    this.unsubscribeEvaluator?.();
    this.unsubscribeEvaluator = null;
    this.evaluator?.dispose();
    this.evaluator = null;
    if (this.viewer !== null) {
      this.viewer.dispose();
      this.viewer = null;
      // Disposing forces the canvas's WebGL context lost; a re-attach rebuilds on a fresh canvas so the new
      // renderer gets a live context (the canvas is static template content with no Lit bindings).
      this.renderRoot.querySelector("canvas")?.replaceWith(document.createElement("canvas"));
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    const overlay = this.renderRoot.querySelector("homeplan-bubble-overlay");
    this.overlay = overlay instanceof HomeplanBubbleOverlay ? overlay : null;
    const canvas = this.renderRoot.querySelector("canvas");
    if (canvas === null || this.source === undefined) return;
    if (this.viewer === null) {
      const viewer = new HouseViewer(canvas, {
        assets: this.source,
        onFloorSelect: (floorId) => {
          this.goTo(floorView(floorId));
        },
        onTilt: (tilt) => {
          // Tilt parallax: tilting down toward the floor lowers the backdrop slightly (owner preference),
          // set directly as a CSS variable without a Lit render.
          const shift = backdropParallax * Math.min(Math.max(tilt, -1), 1);
          this.style.setProperty("--hp-backdrop-shift", `${(shift * 100).toFixed(3)}%`);
        },
        onGesture: (target, gesture) => {
          this.runGesture(target, gesture);
        },
        objectActs: (objectId) => this.objectActs(objectId),
        onFrame: () => {
          this.overlay?.reposition();
        },
        onInsets: (insets) => {
          this.followFreeArea(insets);
        },
        onEditTap: (clientX, clientY) => this.placeTap(clientX, clientY),
        onAreaSelect: (areaId) => {
          this.selectArea(areaId);
        },
        onAreaDismiss: () => {
          this.closeArea();
        },
        hasDoubleTap: (target) => this.hasDoubleTap(target),
        onEditPick: (pick) => {
          this.openEditor(pick);
        },
        onRender: () => {
          this.frameCount += 1;
          this.lastFrameAt = performance.now();
        },
        onCornerPick: (areaId, corners) => {
          this.setSweepCorners(areaId, corners);
        },
        onLoadProgress: (progress) => {
          this.showLoadProgress(progress);
        },
        swatches: createSwatchMemory(),
        timing: this.dev || loadTimingRequested(),
      });
      if (this.dev) {
        // Written straight into the readout once a second, never through a Lit render (K12 check).
        this.frameTimer = window.setInterval(() => {
          const readout = this.renderRoot.querySelector(".frames");
          if (readout === null) return;
          const idle = Math.floor((performance.now() - this.lastFrameAt) / 1000);
          // Phase 21.1: the renderer's resources and the slowest render of the last second.
          readout.textContent = `3D frames ${String(this.frameCount)} · idle ${String(idle)} s · ${viewer.debugStats()}`;
        }, 1000);
      }
      viewer.setEditMode(this.editing);
      this.viewer = viewer;
      // The overlay gets the viewer as its projector on the next render.
      this.requestUpdate();
      this.resizeObserver = new ResizeObserver(() => {
        viewer.resize(this.clientWidth, this.clientHeight);
        // The floor widgets slide this far (14.4).
        this.style.setProperty("--hp-screen-width", `${String(this.clientWidth)}px`);
        const compact = this.clientWidth <= compactWidthPx;
        if (compact !== this.compact) {
          this.compact = compact;
          this.requestUpdate();
        }
        this.applyWidgetInsets();
        // An open room's cards keep their pixel width (or become a sheet): the house is framed beside them again.
        if (this.openArea !== null) viewer.setRoomInsets(this.roomInsets());
      });
      this.resizeObserver.observe(this);
      viewer.resize(this.clientWidth, this.clientHeight);
      const applyTheme = (): void => {
        const dark = this.store?.darkMode() ?? false;
        this.toggleAttribute("data-dark", dark);
        viewer.setDarkMode(dark);
      };
      this.unsubscribeMeta = this.store?.subscribeMeta(applyTheme) ?? null;
      applyTheme();
      // The real sun (owner 2026-11-16): shadows follow HA's sun, and the backdrop turns to night below the horizon.
      const applySun = (): void => {
        const solar = solarOf(this.store);
        viewer.setSolar(
          solar === null ? null : { azimuthDeg: solar.azimuthDeg, elevationDeg: solar.elevationDeg },
        );
        this.toggleAttribute("data-night", solar?.night ?? false);
      };
      this.unsubscribeSun = this.store?.subscribeEntity("sun.sun", applySun) ?? null;
      this.solarTimer = window.setInterval(applySun, solarRefreshMs);
      applySun();
      void this.loadHouse();
    } else if (changed.has("setup")) {
      void this.loadHouse();
    }
  }

  private async loadHouse(): Promise<void> {
    const houseId = this.setup.houseId;
    if (this.source === undefined || houseId === null) return;
    const token = ++this.loadToken;
    this.status = { kind: "loading" };
    this.requestUpdate();
    try {
      const { document } = await this.source.loadHouse(houseId);
      // Bindings first, then the house and its live states in one task: a bound effect never plays authored first.
      const dashboard = await this.source.readDashboard();
      const bindings = await this.source.readBindings(houseId);
      if (token !== this.loadToken || this.viewer === null) return;
      // A multi-floor house opens on its main view (16.1): the whole house, or the floor House settings chose.
      const view = initialView(document.floors, mainViewOf(dashboard, houseId));
      if (view === null) throw new Error("The house has no floors.");
      this.house = document;
      this.view = null;
      this.areaFloors = new Map(
        document.floors.flatMap((each) => each.areas.map((area): [string, string] => [area.id, each.id])),
      );
      this.roomDashboard = dashboard;
      this.bindings = bindings;
      this.applyNavigation();
      this.showView(view, null);
      this.status = { kind: "ready" };
    } catch (error) {
      if (token !== this.loadToken) return;
      this.status = {
        kind: "error",
        message: error instanceof Error ? error.message : "Could not load the house.",
      };
    }
    this.requestUpdate();
  }

  /**
   * Shows the whole house or one floor (16.1), with the slide when `step` is given (16.3). An open room closes first
   * (the floor controls act on floors). Settings' things, the room names, and the live bindings follow the shown
   * floor, so the departing floor's HA listeners are released and the destination's start from HA's current state.
   * A view that fails to build leaves the previous one shown.
   */
  private showView(view: ViewerView, step: FloorStep | null): void {
    const house = this.house;
    const viewer = this.viewer;
    if (house === null || viewer === null) return;
    const previous = this.view;
    this.stopCornerPicking();
    this.openToken += 1;
    this.openArea = null;
    this.cardsArea = null;
    this.roomSettings = false;
    try {
      viewer.showView(house, view, step);
    } catch (error) {
      if (previous === null || sameView(previous, view)) throw error;
      console.error("[homeplan] could not show the view", error);
      viewer.showView(house, previous, null);
      this.flashFloorName(`Could not open ${this.viewName(view)}`);
      return;
    }
    this.view = view;
    const floor = view.kind === "floor" ? house.floors.find((each) => each.id === view.floorId) : undefined;
    // Settings lists only what the 3D view shows: no saved-hidden rooms, things, or lights.
    const shown = floor === undefined ? null : viewerFloor(floor);
    this.shownFloorValue = shown;
    this.areaNames = new Map((shown?.areas ?? []).map((area) => [area.id, area.name]));
    this.shownFloor = floor === undefined ? null : { id: floor.id, name: floor.name };
    this.targets = shown === null ? [] : bindingTargets(shown);
    this.applyBindings(this.bindings);
    if (step !== null) this.flashFloorName(this.viewName(view));
    this.requestUpdate();
  }

  /** Goes to another view (a floor tapped in the whole house, the house control), sliding the right way. */
  private goTo(next: ViewerView): void {
    const house = this.house;
    const view = this.view;
    if (house === null || view === null || sameView(view, next)) return;
    this.showView(next, stepBetween(house.floors, view, next));
  }

  /** Up or Down (16.1): the next floor by elevation; Up from the top floor is the whole house. */
  private stepFloor(step: FloorStep): void {
    const house = this.house;
    const view = this.view;
    if (house === null || view === null) return;
    const next = stepView(house.floors, view, step);
    if (next !== null) this.showView(next, step);
  }

  private viewName(view: ViewerView): string {
    if (view.kind === "house") return "Whole house";
    return this.house?.floors.find((floor) => floor.id === view.floorId)?.name ?? "Floor";
  }

  /** Shows a floor's name (or a message) briefly under the top bar. */
  private flashFloorName(text: string): void {
    this.floorName = text;
    this.floorNameShown = true;
    window.clearTimeout(this.floorNameTimer);
    this.floorNameTimer = window.setTimeout(() => {
      this.floorNameShown = false;
      this.requestUpdate();
    }, floorNameMs);
    this.requestUpdate();
  }

  /** The house's floors for Settings (Main view, 16.1), lowest first. */
  private settingsFloors(): readonly SettingsFloor[] {
    return floorsByElevation(this.house?.floors ?? []).map((floor) => ({ id: floor.id, name: floor.name }));
  }

  private renderFloorButtons(): TemplateResult | typeof nothing {
    const house = this.house;
    const view = this.view;
    if (house === null || view === null || !isMultiFloor(house.floors)) return nothing;
    return html`${floorButtons.map((button) => {
        const disabled =
          button.control === "house"
            ? view.kind === "house"
            : stepView(house.floors, view, button.control) === null;
        return html`<button
          class="icon-button"
          title=${button.title}
          aria-label=${button.title}
          ?disabled=${disabled}
          @click=${() => {
            if (button.control === "house") this.goTo(wholeHouse);
            else this.stepFloor(button.control);
          }}
        >
          ${icon(button.path)}
        </button>`;
      })} <span class="floor-gap"></span>`;
  }

  private selectArea(areaId: string): void {
    const token = ++this.openToken;
    const urlPath = this.roomDashboard.urlPath;
    if (urlPath === null) {
      this.openRoom(areaId, []);
      return;
    }
    const cached = this.roomViews;
    if (cached !== null && cached.urlPath === urlPath) {
      this.openRoom(areaId, cached.views);
      // Read again for the next opening, so a tab added in HA is found without a reload.
      void this.readRoomViews(urlPath);
      return;
    }
    void this.readRoomViews(urlPath).then((views) => {
      if (token === this.openToken) this.openRoom(areaId, views);
    });
  }

  /** The dashboard's tabs; a read error (no websocket, no dashboard) is a console warning and no tabs (15.6). */
  private async readRoomViews(urlPath: string): Promise<readonly DashboardView[]> {
    const hass = this.store?.current();
    if (hass === null || hass === undefined) {
      console.warn(`[homeplan] no Home Assistant connection to read dashboard "${urlPath}"`);
      return [];
    }
    try {
      const views = await readViews(hass, urlPath);
      this.roomViews = { urlPath, views };
      return views;
    } catch (error) {
      console.warn(`[homeplan] could not read dashboard "${urlPath}"`, error);
      return [];
    }
  }

  private openRoom(areaId: string, views: readonly DashboardView[]): void {
    if (this.cornerPickingArea !== null && this.cornerPickingArea !== areaId) this.stopCornerPicking();
    if (this.openArea?.id !== areaId) this.roomSettings = false;
    this.openArea = { id: areaId, name: this.areaNames.get(areaId) ?? "Area" };
    this.cardsArea = this.openArea;
    const houseId = this.setup.houseId;
    this.roomHasCards = roomHasTab(
      views,
      this.roomDashboard,
      houseId,
      areaId,
      this.openArea.name,
      this.roomHaAreaName(areaId),
    );
    // Framed beside the room's cards from the start (14.1, 14.4); a room without a tab has no insets (15.6).
    this.viewer?.focusArea(
      areaId,
      houseId === null ? null : (this.roomDashboard.areaViews[houseId]?.[areaId] ?? null),
      this.roomInsets(),
    );
    this.requestUpdate();
  }

  /**
   * The part of the screen the open room's cards cover (14.4): on a wide screen their column width beside the house
   * plus the screen margin and a gap, as the floor widgets (at most 70 %); under 700 px the bottom sheet.
   */
  private roomInsets(): FrameInsets {
    return roomFrameInsets(this.clientWidth, this.roomHasCards, this.openColumns(this.roomDashboard));
  }

  /**
   * The backdrop's glow follows the free area the house is framed in part of the way (14.5), with the camera's
   * sprung insets, so it moves in step with the house; written as CSS variables without a Lit render.
   */
  private followFreeArea(insets: FrameInsets): void {
    const dx = (backdropFollow * (insets.left - insets.right) * this.clientWidth) / 2;
    const dy = (backdropFollow * (insets.top - insets.bottom) * this.clientHeight) / 2;
    this.style.setProperty("--hp-orb-dx", `${dx.toFixed(1)}px`);
    this.style.setProperty("--hp-orb-dy", `${dy.toFixed(1)}px`);
    // The view buttons sit in a bottom corner of the free area (14.6): the left one, or the right one while the
    // left side is taken (owner, 2026-11-18: left-placed floor widgets put the buttons at the right).
    this.style.setProperty("--hp-free-left", `${(insets.left * this.clientWidth).toFixed(1)}px`);
    this.style.setProperty("--hp-free-right", `${(insets.right * this.clientWidth).toFixed(1)}px`);
    this.style.setProperty("--hp-free-bottom", `${(insets.bottom * this.clientHeight).toFixed(1)}px`);
    this.style.setProperty("--hp-free-top", `${(insets.top * this.clientHeight).toFixed(1)}px`);
    // Owner, 2026-11-18: widgets on the left put the buttons bottom-right; widgets at the bottom, top-left.
    this.toggleAttribute("data-view-buttons-right", insets.left > insets.right + 0.01);
    this.toggleAttribute(
      "data-view-buttons-top",
      insets.left <= insets.right + 0.01 && insets.bottom > insets.top + 0.01,
    );
  }

  /**
   * The load bar (15.1): shown while separate objects and textures remain after the opening, its fill the share done;
   * written as an attribute and CSS variables without a Lit render.
   */
  private showLoadProgress(progress: LoadProgress): void {
    const loading = progress.stage === "loading" && progress.remaining > 0 && progress.total > 0;
    this.toggleAttribute("data-loading", loading);
    const done = progress.total === 0 ? 1 : Math.min(Math.max(1 - progress.remaining / progress.total, 0), 1);
    this.style.setProperty("--hp-load-done", done.toFixed(3));
    const bar = this.renderRoot.querySelector(".load-bar");
    if (bar === null) return;
    bar.setAttribute("aria-valuenow", String(Math.round(done * 100)));
    bar.setAttribute(
      "title",
      loading ? `Loading objects and textures: ${String(progress.remaining)} left` : "Loaded",
    );
  }

  /** The navigation from Settings → House (14.6), or the device default while none is chosen. */
  private applyNavigation(): void {
    this.viewer?.setNavigation(effectiveNavigation(this.roomDashboard, touchFirstDevice()));
  }

  /** The floor widgets changed size: the whole floor is framed into the space they leave (13.7). */
  private setWidgetsSize(size: WidgetsSize): void {
    // While a room is open the widgets are away; the floor keeps their space for when it closes.
    if (this.openArea !== null) return;
    this.widgetsSize = size;
    this.applyWidgetInsets();
  }

  private applyWidgetInsets(): void {
    if (this.openArea !== null) return;
    this.viewer?.setFloorInsets(widgetInsets(this.widgetsSize, this.clientWidth, this.clientHeight));
  }

  /** The name of the HA area paired with a room (else matched by its entities' area or its name), or null. */
  private roomHaAreaName(areaId: string): string | null {
    const binding = this.bindings.areas[areaId];
    const data = suggestionData(this.store);
    const entityIds = [binding?.stateEntityId ?? null, binding?.presence?.entityId ?? null].filter(
      (id): id is string => id !== null,
    );
    const haAreaId =
      binding?.haAreaId ?? roomHaArea(this.areaNames.get(areaId) ?? "", entityIds, data.entities, data.areas);
    return data.areas.find((area) => area.id === haAreaId)?.name ?? null;
  }

  /** The open room's panel width in section columns (one when no room is open). */
  private openColumns(dashboard: HaDashboardValue): 1 | 2 {
    return this.openArea === null ? 1 : roomColumns(dashboard, this.setup.houseId, this.openArea.id);
  }

  /** Saves the room dashboard setting; the panel shows it at once and a failed save is reported in the console. */
  private saveRoomDashboard(next: HaDashboardValue): void {
    const widthChanged = this.openColumns(next) !== this.openColumns(this.roomDashboard);
    this.roomDashboard = next;
    if (widthChanged) this.viewer?.setRoomInsets(this.roomInsets());
    this.requestUpdate();
    this.source?.saveDashboard(next).catch((error: unknown) => {
      console.error("[homeplan] could not save the room dashboard", error);
    });
  }

  /** Stores (or with null removes) the saved camera of the open room. */
  private saveRoomView(view: HaAreaViewValue | null): void {
    const houseId = this.setup.houseId;
    const area = this.openArea;
    if (houseId === null || area === null) return;
    const others = without(this.roomDashboard.areaViews[houseId], area.id);
    const mine = view === null ? others : { ...others, [area.id]: view };
    this.saveRoomDashboard({
      ...this.roomDashboard,
      areaViews: { ...this.roomDashboard.areaViews, [houseId]: mine },
    });
  }

  private closeArea(): void {
    this.openToken += 1;
    this.stopCornerPicking();
    this.openArea = null;
    this.roomSettings = false;
    this.viewer?.focusArea(null);
  }

  /** The live evaluator (created with the store); light states follow the bindings that changed. */
  private bindingEvaluator(): BindingEvaluator | null {
    if (this.evaluator !== null || this.store === undefined) return this.evaluator;
    const evaluator = createBindingEvaluator(this.store);
    this.unsubscribeEvaluator = evaluator.subscribe((changed) => {
      let lights = false;
      let bubbles = false;
      let states = false;
      for (const key of changed)
        if (key.kind === "lights") {
          this.updateLight(key.id);
          lights = true;
        } else if (key.kind === "objects") {
          this.updateScreen(key.id);
          if (this.updateInstanceState(key.id)) states = true;
        } else if (key.kind === "bubbles") bubbles = true;
      if (lights) this.viewer?.setLightStates(new Map(this.lightStates));
      // Doors, windows, and blinds (9.7): only a changed drawn value re-resolves its instance.
      if (states) this.viewer?.setInstanceStates(this.instanceStateValues());
      if (changed.some((key) => key.kind === "effects")) this.viewer?.setEffectStates(this.effectStates());
      if (changed.some((key) => key.kind === "areas" || key.kind === "floors")) this.updateIntrusion();
      // Bubbles appear, disappear, and change value live (8.5); only the overlay content re-renders.
      if (bubbles) this.requestUpdate();
    });
    this.evaluator = evaluator;
    return evaluator;
  }

  /** False while a light's `visibleWhen` does not hold (it is then drawn off and ignores gestures). */
  private lightShown(lightId: string): boolean {
    return this.evaluator?.shown("lights", lightId) ?? true;
  }

  /**
   * One light's 3D state from its entity. No usable state (no entity; entity missing, unknown, or unavailable;
   * or its condition does not hold) draws the light off (Phase 7.9, owner; D25).
   */
  private updateLight(lightId: string): void {
    const binding = this.bindings.lights[lightId];
    const entityId = binding?.stateEntityId ?? null;
    const state =
      entityId === null || binding === undefined || !this.lightShown(lightId)
        ? null
        : lightStateOf(this.store?.entity(entityId), binding);
    if (state === null) this.lightStates.delete(lightId);
    else this.lightStates.set(lightId, state);
  }

  /**
   * Live states of the bound effects (Phase 8.4): active while `visibleWhen` holds (or is absent), with the first
   * holding variant's overrides. Effects without a binding are left out and play as authored.
   */
  private effectStates(): ReadonlyMap<string, EffectLive> {
    const evaluator = this.evaluator;
    const states = new Map<string, EffectLive>();
    if (evaluator === null) return states;
    for (const effectId of Object.keys(this.liveBindings.effects)) {
      const variant = evaluator.effectVariant(effectId);
      states.set(effectId, {
        active: evaluator.shown("effects", effectId),
        overrides: variant === null ? null : variantOverrides(variant),
      });
    }
    return states;
  }

  /**
   * Hands the house's bindings to the evaluator, which subscribes once per entity used; a change updates only
   * the bindings that depend on it (lights and effects in 3D now; objects and rooms from 8.3, 8.5, 8.6).
   */
  private applyBindings(bindings: HaHouseBindingsValue): void {
    this.bindings = bindings;
    // Only the shown floor's bindings are followed (16.3); the whole-house view follows every floor's lights and
    // things (18.1), which it draws live.
    const live =
      this.view?.kind === "house" && this.house !== null
        ? houseBindings(
            bindings,
            this.house.floors.map((floor) => viewerFloor(floor)),
          )
        : floorBindings(bindings, this.shownFloorValue);
    this.liveBindings = live;
    this.lightStates = new Map();
    const evaluator = this.bindingEvaluator();
    if (evaluator === null) return;
    evaluator.setBindings(live);
    for (const lightId of Object.keys(live.lights)) this.updateLight(lightId);
    this.viewer?.setLightStates(new Map(this.lightStates));
    this.viewer?.setEffectStates(this.effectStates());
    this.tvScreens.clear();
    this.instanceStates = new Map();
    for (const objectId of Object.keys(live.objects)) {
      this.updateScreen(objectId);
      this.updateInstanceState(objectId);
    }
    this.viewer?.setInstanceStates(this.instanceStateValues());
    this.updateIntrusion();
    // The bubble overlay follows the new bubbles (8.5).
    this.requestUpdate();
  }

  /** The rooms whose presence / intrusion is active now sweep (8.6); the others stop (no timer, no frames). */
  private updateIntrusion(): void {
    const evaluator = this.evaluator;
    // A floor whose presence gate does not hold (owner, 2026-11-18) sweeps and tints none of its rooms.
    const rooms =
      evaluator === null
        ? []
        : intrusionRooms(this.liveBindings, (areaId) => this.areaFloors.get(areaId), evaluator.lookup);
    this.viewer?.setIntrusion(rooms);
  }

  /** A room's presence with new sweep corners (undefined: the default ones), applied at once; null if it has none. */
  private withCorners(
    areaId: string,
    corners: readonly HaSweepCornerValue[] | undefined,
  ): HaAreaPresenceValue | null {
    const binding = this.bindings.areas[areaId];
    const presence = binding?.presence;
    if (binding === undefined || presence === undefined) return null;
    const { corners: _previous, ...rest } = presence;
    const next = corners === undefined ? rest : { ...rest, corners: [...corners] };
    this.applyBindings({
      ...this.bindings,
      areas: { ...this.bindings.areas, [areaId]: { ...binding, presence: next } },
    });
    return next;
  }

  /** A tap toggled a corner of the picking room: the markers follow; Done saves. */
  private setSweepCorners(areaId: string, corners: readonly HaSweepCornerValue[]): void {
    const presence = this.withCorners(areaId, corners);
    if (presence === null) return;
    this.cornersChanged = true;
    this.viewer?.setCornerPicking({ areaId, corners: presence.corners });
  }

  /** "Choose corners" in the room panel's gear (owner 2026-11-17): taps on the room toggle its corners. */
  private startCornerPicking(areaId: string): void {
    this.cornerPickingArea = areaId;
    this.cornersChanged = false;
    this.viewer?.setCornerPicking({ areaId, corners: this.bindings.areas[areaId]?.presence?.corners });
    this.requestUpdate();
  }

  /** Corner picking off; changed corners are saved at once, like the room position. */
  private stopCornerPicking(): void {
    if (this.cornerPickingArea === null) return;
    this.cornerPickingArea = null;
    this.viewer?.setCornerPicking(null);
    if (this.cornersChanged) this.saveAreas();
    this.cornersChanged = false;
    this.requestUpdate();
  }

  /** "Default corners": the room sweeps from its default corners again, saved at once. */
  private defaultCorners(areaId: string): void {
    if (this.withCorners(areaId, undefined) === null) return;
    if (this.cornerPickingArea === areaId) this.viewer?.setCornerPicking({ areaId, corners: undefined });
    this.saveAreas();
    this.requestUpdate();
  }

  /** The rooms' bindings saved now (the room panel's own settings); a failed save is reported in the console. */
  private saveAreas(): void {
    const houseId = this.setup.houseId;
    if (houseId === null) return;
    this.source
      ?.saveSettings({ bindings: { [houseId]: { areas: this.bindings.areas } } })
      .catch((error: unknown) => {
        console.error("[homeplan] could not save the sweep corners", error);
      });
  }

  /** A Settings Save (10.9): the saved bindings and dashboard take effect at once. */
  private applySettings(saved: SettingsSaved): void {
    this.applyBindings(saved.bindings);
    const dashboard = saved.dashboard;
    if (dashboard === null) return;
    const widthChanged = this.openColumns(dashboard) !== this.openColumns(this.roomDashboard);
    this.roomDashboard = dashboard;
    this.applyNavigation();
    if (widthChanged) this.viewer?.setRoomInsets(this.roomInsets());
    this.requestUpdate();
  }

  /**
   * An object's or opening's live state parameters from its binding's `states` (9.7); true when they changed. An
   * unknown or unavailable entity maps to nothing, so the stored value is drawn.
   */
  private updateInstanceState(objectId: string): boolean {
    const binding = this.bindings.objects[objectId];
    const values =
      binding === undefined ? {} : liveStateValues(binding, (entityId) => this.store?.entity(entityId));
    const key = JSON.stringify(values);
    if ((this.instanceStates.get(objectId)?.key ?? "{}") === key) return false;
    if (key === "{}") this.instanceStates.delete(objectId);
    else this.instanceStates.set(objectId, { values, key });
    return true;
  }

  private instanceStateValues(): ReadonlyMap<string, Readonly<Record<string, HaStateValueValue>>> {
    return new Map([...this.instanceStates].map(([id, state]) => [id, state.values]));
  }

  /** An object's screen from its bound entity (only media_player entities light a screen). */
  private updateScreen(objectId: string): void {
    const entityId = this.bindings.objects[objectId]?.stateEntityId ?? null;
    this.tvScreens.update(
      objectId,
      entityId === null ? undefined : this.store?.entity(entityId),
      this.evaluator?.shown("objects", objectId) ?? true,
    );
  }

  stateParametersFor(instanceId: string) {
    return this.viewer?.stateParameters(instanceId) ?? null;
  }

  applyExternalSettings(settings: SettingsSaved): void {
    this.applySettings(settings);
  }

  private setEditing(editing: boolean): void {
    // The tip comes back each time Edit mode opens, unless it was hidden for good.
    if (editing && !this.editing && this.editTip !== "shown" && !readEditTipHidden()) this.editTip = "shown";
    this.editing = editing;
    this.placing = false;
    this.viewer?.setEditMode(editing);
    this.requestUpdate();
  }

  /** Opens Settings on the House node (the integration reopens it after Use this house reloads the scene). */
  openSettings(): void {
    this.openEditor(null);
  }

  /** Opens the binding editor on one thing, or (null) on the list. */
  private openEditor(target: EditorTarget): void {
    this.editorTarget = target;
    this.requestUpdate();
  }

  /**
   * What a gesture on a light, object, or bubble runs, or null for nothing: the configured action, else its
   * default (a light: tap toggles, hold opens more-info; an AC: tap opens more-info, 8.3; a door or window: tap
   * and hold open its main entity's more-info, a tap toggles the tilt of a cover driving its blinds, 10.1, a
   * venetian blind's between shut and 50, 10.4; a bubble: tap opens more-info, a light toggle toggles, 8.5).
   * Unmapped lights, unbound objects, and things whose Shown when does not hold do nothing.
   */
  private gestureAction(
    target: GestureTarget,
    gesture: Gesture,
  ): Readonly<{ action: HaActionValue; entityId: string | null }> | null {
    const key = gestureKeys[gesture];
    if (target.kind === "light") {
      const binding = this.bindings.lights[target.id];
      if (binding === undefined || !this.lightShown(target.id)) return null;
      return { action: binding[key] ?? defaultAction(gesture), entityId: binding.stateEntityId ?? null };
    }
    if (target.kind === "object") {
      const binding = this.bindings.objects[target.id];
      if (binding === undefined || !(this.evaluator?.shown("objects", target.id) ?? true)) return null;
      if (this.isOpening(target.id))
        return openingGestureAction(binding, gesture, (entityId) => this.store?.entity(entityId));
      const configured = binding[key];
      const entityId = binding.stateEntityId ?? null;
      // A default action needs the object's entity (an AC without one falls through to its room).
      if (configured === undefined && entityId === null) return null;
      const action = configured ?? defaultObjectAction(this.viewer?.objectKind(target.id) ?? null, gesture);
      return action.action === "none" ? null : { action, entityId };
    }
    const bubble = this.findBubble(target.id);
    if (bubble === null || !(this.evaluator?.bubbleShown(bubble.content) ?? true)) return null;
    const action = bubble.content[key] ?? defaultBubbleAction(bubble.content.preset, gesture);
    return action.action === "none" ? null : { action, entityId: bubble.content.stateEntityId ?? null };
  }

  /** A door or window on a wall (a Wallable instance; bound under `objects`, 9.7). */
  private isOpening(objectId: string): boolean {
    return this.targets.some((target) => target.opening === true && target.id === objectId);
  }

  /** Objects, doors, and windows take gestures only with an action (8.3, 10.1); others let the tap through. */
  private objectActs(objectId: string): boolean {
    const target: GestureTarget = { kind: "object", id: objectId };
    return (["tap", "hold", "doubleTap"] as const).some(
      (gesture) => this.gestureAction(target, gesture) !== null,
    );
  }

  private hasDoubleTap(target: GestureTarget): boolean {
    const configured =
      target.kind === "light"
        ? this.bindings.lights[target.id]?.doubleTapAction
        : target.kind === "object"
          ? this.bindings.objects[target.id]?.doubleTapAction
          : this.findBubble(target.id)?.content.doubleTapAction;
    return (
      configured !== undefined &&
      configured.action !== "none" &&
      this.gestureAction(target, "doubleTap") !== null
    );
  }

  /** Runs a gesture's action (configured or default) on a light, an object, or a bubble. */
  private runGesture(target: GestureTarget, gesture: Gesture): void {
    const hass = this.store?.current();
    const resolved = this.gestureAction(target, gesture);
    if (resolved === null || hass === null || hass === undefined) return;
    runAction(this, hass, resolved.action, resolved.entityId).catch((error: unknown) => {
      console.error("[homeplan] action failed", error);
    });
  }

  // ---- bubbles (8.5) -------------------------------------------------------------------------------

  /** A room or placed bubble by its ID, with where it lives. */
  private findBubble(id: string): Readonly<{
    content: HaBubbleContentValue;
    areaId: string | null;
    anchor: HaBubbleAnchorValue | null;
  }> | null {
    const placed = this.bindings.bubbles.placed[id];
    if (placed !== undefined) return { content: placed, areaId: null, anchor: placed.anchor };
    for (const [areaId, list] of Object.entries(this.bindings.bubbles.rooms)) {
      const bubble = list.find((candidate) => candidate.id === id);
      if (bubble !== undefined) return { content: bubble, areaId, anchor: null };
    }
    return null;
  }

  /** The bubbles to draw: those whose condition holds; in Edit mode every bubble (the others faded). */
  private bubbleItems(): readonly BubbleItem[] {
    const shown = (content: HaBubbleContentValue): boolean => this.evaluator?.bubbleShown(content) ?? true;
    const items: BubbleItem[] = [];
    // The shown floor's bubbles only (16.3).
    for (const [areaId, list] of Object.entries(this.liveBindings.bubbles.rooms))
      for (const bubble of list) {
        const holds = shown(bubble);
        if (holds || this.editing)
          items.push({ id: bubble.id, content: bubble, place: { kind: "room", areaId }, dimmed: !holds });
      }
    for (const [id, bubble] of Object.entries(this.liveBindings.bubbles.placed)) {
      const holds = shown(bubble);
      if (holds || this.editing)
        items.push({ id, content: bubble, place: { kind: "placed", anchor: bubble.anchor }, dimmed: !holds });
    }
    return items;
  }

  /** Stores the house's bubbles at once (only the `bubbles` kind is patched); a failure goes to the console. */
  private saveBubbles(next: HaHouseBubblesValue): void {
    const houseId = this.setup.houseId;
    if (houseId === null) return;
    this.applyBindings({ ...this.bindings, bubbles: next });
    this.source?.saveBindings(houseId, { bubbles: next }).catch((error: unknown) => {
      console.error("[homeplan] could not save the bubbles", error);
    });
  }

  private saveRoomBubbles(areaId: string, list: readonly HaRoomBubbleValue[]): void {
    const rooms = without(this.bindings.bubbles.rooms, areaId);
    this.saveBubbles({
      ...this.bindings.bubbles,
      rooms: list.length === 0 ? rooms : { ...rooms, [areaId]: [...list] },
    });
  }

  /** Edit mode after "Add Bubble": the tap places a new bubble on the light, object, or point under it. */
  private placeTap(clientX: number, clientY: number): boolean {
    if (!this.placing) return false;
    const anchor = this.viewer?.placeAt(clientX, clientY) ?? null;
    if (anchor === null) return true;
    this.placing = false;
    this.bubbleEditing = {
      kind: "placed",
      id: createId("hb"),
      content: { preset: "custom", format: "icon" },
      anchor,
      isNew: true,
    };
    this.requestUpdate();
    return true;
  }

  /** Edit mode: a tap on a bubble opens it. */
  private editBubble(id: string): void {
    const bubble = this.findBubble(id);
    if (bubble === null) return;
    this.bubbleEditing =
      bubble.anchor !== null
        ? { kind: "placed", id, content: contentOf(bubble.content), anchor: bubble.anchor, isNew: false }
        : { kind: "room", id, areaId: bubble.areaId ?? "", content: contentOf(bubble.content) };
    this.requestUpdate();
  }

  /** Edit mode: a placed bubble dropped at a screen point is re-anchored there (a light, object, or point). */
  private moveBubble(detail: BubbleMoveDetail): void {
    const placed = this.bindings.bubbles.placed[detail.id];
    const anchor = this.viewer?.placeAt(detail.clientX, detail.clientY) ?? null;
    if (placed === undefined || anchor === null) {
      this.overlay?.reposition();
      return;
    }
    this.saveBubbles({
      ...this.bindings.bubbles,
      placed: { ...this.bindings.bubbles.placed, [detail.id]: { ...placed, anchor } },
    });
  }

  private saveEditedBubble(content: HaBubbleContentValue): void {
    const editing = this.bubbleEditing;
    this.bubbleEditing = null;
    if (editing === null) return;
    const bubbles = this.bindings.bubbles;
    if (editing.kind === "placed")
      this.saveBubbles({
        ...bubbles,
        placed: { ...bubbles.placed, [editing.id]: { ...contentOf(content), anchor: editing.anchor } },
      });
    else
      this.saveRoomBubbles(
        editing.areaId,
        (bubbles.rooms[editing.areaId] ?? []).map((bubble) =>
          bubble.id === editing.id ? { id: bubble.id, ...contentOf(content) } : bubble,
        ),
      );
  }

  private deleteEditedBubble(): void {
    const editing = this.bubbleEditing;
    this.bubbleEditing = null;
    if (editing === null) return;
    const bubbles = this.bindings.bubbles;
    if (editing.kind === "placed")
      this.saveBubbles({ ...bubbles, placed: without(bubbles.placed, editing.id) });
    else
      this.saveRoomBubbles(
        editing.areaId,
        (bubbles.rooms[editing.areaId] ?? []).filter((bubble) => bubble.id !== editing.id),
      );
  }

  /** Where the edited bubble sits, in words. */
  private bubblePlaceText(editing: BubbleEditing): string {
    const name = (kind: "lights" | "objects", id: string): string =>
      this.targets.find((target) => target.kind === kind && target.id === id)?.name ?? "it";
    if (editing.kind === "room")
      return `Room bubble above ${this.areaNames.get(editing.areaId) ?? "the room"} (edit the list in Settings, under the room)`;
    const anchor = editing.anchor;
    return anchor.kind === "light"
      ? `Placed on the light ${name("lights", anchor.lightId)}`
      : anchor.kind === "object"
        ? `Placed on ${name("objects", anchor.objectId)}`
        : `Placed at a point in ${this.areaNames.get(anchor.areaId) ?? "the room"}; drag it to move`;
  }

  /** The tip under the Edit mode pill: what a tap does, with × to close it (and an offer to hide it for good). */
  private renderEditTip(): TemplateResult | typeof nothing {
    if (this.editTip === "closed") return nothing;
    if (this.editTip === "confirm")
      return html`<div class="edit-tip" role="status">
        <span>Hide this tip for good?</span>
        <button
          @click=${() => {
            writeEditTipHidden();
            this.editTip = "closed";
            this.requestUpdate();
          }}
        >
          Hide for good
        </button>
        <button
          @click=${() => {
            this.editTip = "closed";
            this.requestUpdate();
          }}
        >
          Just now
        </button>
      </div>`;
    return html`<div class="edit-tip" role="status">
      <span
        >Tap a light, object, door, window, room, or bubble to connect it. <b>Settings</b> lists everything
        and switches the house; room bubbles, tabs, and presence are set under the room there.</span
      >
      <button
        title="Close the tip"
        aria-label="Close the tip"
        @click=${() => {
          this.editTip = "confirm";
          this.requestUpdate();
        }}
      >
        ×
      </button>
    </div>`;
  }

  /**
   * The open room's controls (14.4), where the pencil sits otherwise and styled like it: the gear (Room position,
   * Sweep corners; it swaps the room's cards for them) and close.
   */
  private renderRoomControls(): TemplateResult {
    // The website's live demo saves nothing, so it has no room settings (position and sweep corners save at once).
    return html`${
        this.source?.readOnly === true
          ? nothing
          : html`<button
              class="icon-button edit-button"
              title="Room settings: position and sweep corners"
              aria-pressed=${String(this.roomSettings)}
              @click=${() => {
                this.roomSettings = !this.roomSettings;
                this.requestUpdate();
              }}
            >
              ${icon(cogIcon)}
            </button>`
      }
      <button
        class="icon-button edit-button"
        title="Close the room"
        @click=${() => {
          this.closeArea();
        }}
      >
        ${icon(closeIcon)}
      </button>`;
  }

  protected override render(): TemplateResult {
    return html`
      <div class="backdrop"></div>
      <div class="night-sky"></div>
      <div class="night-floor"></div>
      <canvas></canvas>
      <div
        class="load-bar"
        role="progressbar"
        aria-label="Loading objects and textures"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <span></span>
      </div>
      <homeplan-floor-widgets
        ?hidden=${this.status.kind !== "ready"}
        .away=${this.openArea !== null}
        .store=${this.store}
        .dashboard=${this.roomDashboard}
        .houseId=${this.setup.houseId}
        .floorId=${this.shownFloor?.id ?? null}
        .narrow=${this.compact}
        @widgets-size=${(event: CustomEvent<WidgetsSize>) => {
          this.setWidgetsSize(event.detail);
        }}
      ></homeplan-floor-widgets>
      <homeplan-bubble-overlay
        ?data-passive=${this.cornerPickingArea !== null}
        .store=${this.store}
        .items=${this.bubbleItems()}
        .editing=${this.editing}
        .projector=${this.viewer}
        @bubble-gesture=${(event: CustomEvent<BubbleGestureDetail>) => {
          this.runGesture({ kind: "bubble", id: event.detail.id }, event.detail.gesture);
        }}
        @bubble-edit=${(event: CustomEvent<string>) => {
          this.editBubble(event.detail);
        }}
        @bubble-move=${(event: CustomEvent<BubbleMoveDetail>) => {
          this.moveBubble(event.detail);
        }}
      ></homeplan-bubble-overlay>
      <div class="view-buttons" ?hidden=${this.status.kind !== "ready"}>
        ${this.renderFloorButtons()}
        ${viewButtons.map(
          (button) =>
            html`<button
              class="icon-button"
              title=${button.title}
              aria-label=${button.title}
              @click=${() => {
                this.viewer?.viewPreset(button.preset);
              }}
            >
              ${icon(button.path)}
            </button>`,
        )}
      </div>
      <div class="bar">
        ${
          this.narrow
            ? html`<button
                class="icon-button"
                title="Menu"
                @click=${() => {
                  this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
                }}
              >
                ${icon(menuIcon)}
              </button>`
            : nothing
        }
        <span class="spacer"></span>
        ${
          this.editing && !this.placing && this.cornerPickingArea === null
            ? html`<button
                  class="bar-button"
                  @click=${() => {
                    this.openEditor(null);
                  }}
                >
                  Settings
                </button>
                <button
                  class="bar-button primary"
                  @click=${() => {
                    this.setEditing(false);
                  }}
                >
                  Done
                </button>`
            : nothing
        }
        ${
          this.openArea !== null
            ? this.renderRoomControls()
            : (this.source?.integration !== true && this.source?.readOnly !== true) ||
                this.store?.current()?.user?.is_admin === true
              ? html` <button
                  class="icon-button edit-button"
                  title=${this.editing ? "Done editing" : "Edit Home Assistant bindings"}
                  aria-pressed=${String(this.editing)}
                  ?disabled=${this.status.kind !== "ready" || this.cornerPickingArea !== null}
                  @click=${() => {
                    this.setEditing(!this.editing);
                  }}
                >
                  ${icon(editIcon)}
                </button>`
              : nothing
        }
      </div>
      ${this.dev ? html`<span class="frames">3D frames 0</span>` : nothing}
      <div class="floor-name" role="status" ?data-shown=${this.floorNameShown}>${this.floorName ?? ""}</div>
      ${
        this.editing
          ? this.placing
            ? html`<div class="edit-hint" role="status">
                <span>Tap where the bubble goes: a point in a room, an object, or a light</span>
                <button
                  @click=${() => {
                    this.placing = false;
                    this.requestUpdate();
                  }}
                >
                  Cancel
                </button>
              </div>`
            : html` ${this.renderEditTip()}`
          : nothing
      }
      ${
        this.cornerPickingArea !== null
          ? html`<div class="edit-hint" role="status">
              <span>
                Tap near a corner of ${this.areaNames.get(this.cornerPickingArea) ?? "the room"} to add or
                remove it: red markers sweep, white ones do not
              </span>
              <button
                @click=${() => {
                  this.stopCornerPicking();
                }}
              >
                Done
              </button>
            </div>`
          : nothing
      }
      ${
        this.status.kind === "loading"
          ? html`<div class="message">Loading house…</div>`
          : this.status.kind === "error"
            ? html`<div class="message" data-error>${this.status.message}</div>`
            : nothing
      }
      ${
        this.cardsArea === null
          ? nothing
          : html`<homeplan-area-panel
              .store=${this.store}
              .dashboard=${this.roomDashboard}
              .houseId=${this.setup.houseId}
              .areaId=${this.cardsArea.id}
              .areaName=${this.cardsArea.name}
              .haAreaName=${this.roomHaAreaName(this.cardsArea.id)}
              .presence=${this.bindings.areas[this.cardsArea.id]?.presence}
              .picking=${this.cornerPickingArea === this.cardsArea.id}
              .open=${this.openArea !== null && (this.roomHasCards || this.roomSettings)}
              .cards=${this.roomHasCards}
              .compact=${this.compact}
              .settings=${this.roomSettings}
              @corner-picking=${(event: CustomEvent<boolean>) => {
                const areaId = this.openArea?.id;
                if (areaId === undefined) return;
                if (event.detail) this.startCornerPicking(areaId);
                else this.stopCornerPicking();
              }}
              @default-corners=${() => {
                const areaId = this.openArea?.id;
                if (areaId !== undefined) this.defaultCorners(areaId);
              }}
              @capture-view=${() => {
                const view = this.viewer?.currentView();
                if (view !== undefined) this.saveRoomView(view);
              }}
              @clear-view=${() => {
                this.saveRoomView(null);
              }}
            ></homeplan-area-panel>`
      }
      ${
        this.editorTarget !== undefined
          ? html`<homeplan-binding-editor
              .store=${this.store}
              .source=${this.source}
              .houseId=${this.setup.houseId}
              .targets=${this.targets}
              .target=${this.editorTarget}
              .stateParametersOf=${(instanceId: string) => this.viewer?.stateParameters(instanceId) ?? null}
              .dashboard=${this.roomDashboard}
              .integrationClient=${this.integrationClient}
              .floor=${this.shownFloor}
              .floors=${this.settingsFloors()}
              @close=${() => {
                this.editorTarget = undefined;
                this.requestUpdate();
              }}
              @settings-saved=${(event: CustomEvent<SettingsSaved>) => {
                this.applySettings(event.detail);
              }}
            ></homeplan-binding-editor>`
          : nothing
      }
      ${
        this.bubbleEditing === null
          ? nothing
          : html`<homeplan-bubble-editor
              .store=${this.store}
              .haForm=${this.haForm}
              .content=${this.bubbleEditing.content}
              .heading=${
                this.bubbleEditing.kind === "placed" && this.bubbleEditing.isNew ? "New bubble" : "Bubble"
              }
              .subtitle=${this.bubblePlaceText(this.bubbleEditing)}
              .removable=${this.bubbleEditing.kind === "room" || !this.bubbleEditing.isNew}
              @close=${() => {
                this.bubbleEditing = null;
                this.requestUpdate();
              }}
              @bubble-save=${(event: CustomEvent<HaBubbleContentValue>) => {
                this.saveEditedBubble(event.detail);
              }}
              @bubble-delete=${() => {
                this.deleteEditedBubble();
              }}
            ></homeplan-bubble-editor>`
      }
    `;
  }
}
