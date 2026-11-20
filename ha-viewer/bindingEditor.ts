// The Settings screen (D25, spec/home-assistant/bindings.md#editor; Phase 10.9 split screen): the tree of every
// bindable thing on the shown floor on the left (search, Expand all / Collapse all), and the editor of the selected
// one on the right: a light's, object's (with its ambient effects and state parameters, 9.7), door's or window's
// binding; a room's binding, dashboard tab, room bubbles, and presence; the floor's widgets and presence gate; or
// the House node (dashboard, panel width and, in the HA integration, House setup: Floor Builder URL, DEV MODE, the
// house list with Use this house / Upgrade, and the panel upgrade). Opened by tapping the thing in Edit mode (it is then selected) or from the Settings button; in
// the integration also from **Setup your home** before any house exists (then only the House node shows).
// Everything is a draft until Save, which writes every changed preferences key in one patch (settingsDraft.ts).
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, PropertyValues, TemplateResult } from "lit";
import { emptyHouseBindings } from "@shared/domain/schemas/homeAssistant";
import type {
  HaAreaPresenceValue,
  HaActionValue,
  HaConditionValue,
  HaDashboardValue,
  HaEffectBindingValue,
  HaFloorBindingValue,
  HaHouseBindingsValue,
  HaLightBindingValue,
  HaRoomBubbleValue,
} from "@shared/domain/schemas/homeAssistant";
import type { TemplateStateParameter } from "@shared/domain/templates/metadata";
import { defaultStateMapping, mappingEntity } from "@shared/domain/homeAssistant/stateParameters";
import { roomHaArea, roomProposals, suggestEntities } from "@shared/domain/homeAssistant/suggestions";
import type {
  EntitySuggestion,
  RoomProposal,
  SuggestionContext,
} from "@shared/domain/homeAssistant/suggestions";
import { haDefaultAction } from "./haActions";
import { settingsPageTitle } from "./connectionSettings";
import type { SettingsPage, SettingsTab } from "./connectionSettings";
import type { ClickableFields } from "./bindingFields";
import { kindLabels } from "./bindingTargets";
import type { BindingTarget, TargetKind } from "./bindingTargets";
import { fieldStyles, formValue, valueOf } from "./formHelpers";
import { loadHaForm } from "./haElements";
import type { HassStore } from "./hassStore";
import type { HouseSource } from "./houseSource";
import type { IntegrationClient } from "./integrationClient";
import type { StateMappings } from "./stateBindings";
import type { LightOutputOverrides } from "./lightOutputSetting";
import { tokens } from "./styles/tokens";
import type { OptionalChange } from "./events";
import { suggestionData } from "./entitySuggestions";
import {
  bindingTree,
  countText,
  floorSelection,
  houseSelection,
  isSelected,
  revealKeys,
  searchWords,
} from "./bindingList";
import type { ListItem, SettingsSelection, TreeGroup, TreeRoom } from "./bindingList";
import { prunedBindings, settingsPatch } from "./settingsDraft";

/** The clickable bindings (lights, objects, rooms) share one shape. */
type Clickable = HaLightBindingValue;

/** Which thing Settings opens on; null opens it on the House node (and, on a narrow screen, the list). */
export type EditorTarget = Readonly<{ kind: TargetKind; id: string }> | null;

/** What a Save stored: the house's bindings and, when it changed, the dashboard setting. */
export type SettingsSaved = Readonly<{ bindings: HaHouseBindingsValue; dashboard: HaDashboardValue | null }>;

/** At or under this dialog width the split screen falls back to one pane with Back (implementation convention). */
const narrowWidthPx = 700;

const closeIcon =
  "M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z";
const backIcon = "M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z";
const chevronIcon = "M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z";
const searchIcon =
  "M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z";
/** mdi:link */
const linkIcon =
  "M3.9,12C3.9,10.29 5.29,8.9 7,8.9H11V7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H11V15.1H7C5.29,15.1 3.9,13.71 3.9,12M8,13H16V11H8V13M17,7H13V8.9H17C18.71,8.9 20.1,10.29 20.1,12C20.1,13.71 18.71,15.1 17,15.1H13V17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7Z";
/** mdi:unfold-more-horizontal (Expand all, as in HA's own editors; 16.12) */
const expandAllIcon =
  "M12,18.17L8.83,15L7.42,16.41L12,21L16.59,16.41L15.17,15M12,5.83L15.17,9L16.58,7.59L12,3L7.41,7.59L8.83,9L12,5.83Z";
/** mdi:unfold-less-horizontal (Collapse all; 16.12) */
const collapseAllIcon =
  "M16.59,5.41L15.17,4L12,7.17L8.83,4L7.41,5.41L12,10M7.41,18.59L8.83,20L12,16.83L15.17,20L16.58,18.59L12,14L7.41,18.59Z";
/** mdi:home */
const homeIcon = "M10,20V14H14V20H19V12H22L12,2L2,12H5V20H10Z";
/** mdi:layers (the floor, 13.7) */
const floorIcon =
  "M12,16L19.36,10.27L21,9L12,2L3,9L4.63,10.27M12,18.54L4.62,12.81L3,14.07L12,21.07L21,14.07L19.37,12.8L12,18.54Z";

/** The floor Settings lists (the one the viewer shows): its rooms sit under it in the tree (13.7). */
export type SettingsFloor = Readonly<{ id: string; name: string }>;

const icon = (path: string): TemplateResult =>
  html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d=${path}></path></svg>`;

/**
 * What each gesture does while it is not set (Phase 21), shown as "Default action (…)": HA's own default for the
 * thing's entity (haActions.ts); a door or window opens its entity's more-info on a tap or hold (10.1).
 */
const gestureDefaults = (
  target: BindingTarget,
  entityId: string | null,
): Readonly<Partial<Record<"tapAction" | "holdAction" | "doubleTapAction", HaActionValue["action"]>>> =>
  // A room's tap opens the room; its gesture fields show no HA default.
  target.kind === "areas"
    ? {}
    : target.opening === true
      ? { tapAction: "more-info", holdAction: "more-info", doubleTapAction: "none" }
      : {
          tapAction: haDefaultAction(target.kind === "lights" ? (entityId ?? "light.") : entityId, "tap")
            .action,
          holdAction: "more-info",
          doubleTapAction: "none",
        };

/** The footer pages' subtitles (Phase 21). */
const pageSubtitles: Readonly<Record<SettingsPage, string>> = {
  floorPlanners: "The Floor Builders this Home Assistant connects to; the default one is used.",
  houses: "Choose the house the viewer shows, from Home Assistant's copies or the default floor planner.",
  panels: "The viewer code that runs: shipped with the integration, or downloaded from a floor planner.",
};

const emptyDashboard = (): HaDashboardValue => ({
  urlPath: null,
  areaTabs: {},
  areaViews: {},
  areaColumns: {},
});

/** A room's proposed bindings (10.3) and which of them are ticked. */
type RoomSuggestions = Readonly<{
  roomId: string;
  proposals: readonly RoomProposal<TemplateStateParameter>[];
  ticked: ReadonlySet<string>;
  /** Things whose template is still loading (they get no proposal yet). */
  loading: number;
}>;

/**
 * What HA's own entity pickers (HA 2026+) sort first, provided under HA's Lit context key "related": entities
 * named here rank first, then entities in the areas named here (owner 2026-11-17: suggestions on top of HA's list).
 */
type RelatedContext = Readonly<{ entities: Set<string>; devices: Set<string>; areas: Set<string> }>;
type RelatedCallback = (value: RelatedContext, unsubscribe?: () => void) => void;

const emptyRelated: RelatedContext = { entities: new Set(), devices: new Set(), areas: new Set() };

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && [...a].every((value) => b.has(value));

/** A Lit context request (the community protocol HA's elements use) for HA's "related" context. */
const relatedRequest = (
  event: Event,
): Readonly<{ callback: (...args: readonly unknown[]) => void; subscribe: boolean }> | null => {
  if (!("context" in event) || event.context !== "related") return null;
  if (!("callback" in event) || typeof event.callback !== "function") return null;
  const callback = event.callback;
  return {
    callback: (...args) => {
      Reflect.apply(callback, undefined, args);
    },
    subscribe: "subscribe" in event && event.subscribe === true,
  };
};

const proposalKey = (proposal: RoomProposal<TemplateStateParameter>): string =>
  `${proposal.itemId}\u0000${proposal.parameter.name}`;

export class HomeplanBindingEditor extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    source: { attribute: false },
    houseId: { attribute: false },
    targets: { attribute: false },
    target: { attribute: false },
    stateParametersOf: { attribute: false },
    dashboard: { attribute: false },
    integrationClient: { attribute: false },
    floor: { attribute: false },
    floors: { attribute: false },
  };

  static override styles = [
    tokens,
    fieldStyles,
    css`
      :host {
        position: fixed;
        inset: 0;
        z-index: 10;
        display: grid;
        place-items: center;
        background: rgba(0, 0, 0, 0.32);
      }
      :host([hidden]) {
        display: none;
      }
      .dialog {
        width: 90vw;
        height: 90vh;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        background: var(--hp-surface);
        border-radius: var(--ha-dialog-border-radius, 24px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        overflow: hidden;
      }
      :host([data-narrow]) .dialog {
        width: calc(100vw - 16px);
        height: calc(100vh - 16px);
        border-radius: 16px;
      }
      header {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 16px 12px 8px 16px;
        border-bottom: 1px solid var(--hp-divider);
      }
      .titles {
        flex: 1;
        display: grid;
        gap: 2px;
        padding-left: 8px;
        min-width: 0;
      }
      h2 {
        margin: 0;
        font-size: 22px;
        font-weight: 400;
      }
      .subtitle {
        font-size: 13px;
        color: var(--hp-muted);
      }
      /* The split screen (10.9): the tree on the left third, the selected thing's editor on the right. */
      .split {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
        min-height: 0;
      }
      :host([data-narrow]) .split,
      .split[data-single] {
        grid-template-columns: minmax(0, 1fr);
      }
      :host([data-narrow]) .split[data-pane="editor"] .tree-pane,
      :host([data-narrow]) .split[data-pane="tree"] .editor-pane {
        display: none;
      }
      .tree-pane,
      .editor-pane {
        min-height: 0;
        overflow: auto;
        overscroll-behavior: contain;
      }
      .tree-pane {
        padding: 0 12px 16px;
        border-right: 1px solid var(--hp-divider);
      }
      :host([data-narrow]) .tree-pane {
        border-right: none;
      }
      .editor-pane {
        padding: 0 24px 24px;
        display: grid;
        gap: 8px;
        align-content: start;
      }
      .editor-head {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 12px 0 8px;
        background: var(--hp-surface);
        border-bottom: 1px solid var(--hp-divider);
      }
      .editor-head .titles {
        padding-left: 0;
      }
      .editor-head h2 {
        font-size: 20px;
      }
      h3 {
        margin: 16px 0 4px;
        font-size: 15px;
        font-weight: 500;
      }
      /* Tree rows: the link icon when connected, then the name. */
      .item,
      .room-row,
      .head {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        padding: 6px 8px;
        border: none;
        border-radius: 8px;
        background: transparent;
        text-align: left;
        cursor: pointer;
      }
      .item:hover,
      .room-name:hover,
      .head:hover {
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.04));
      }
      .item[data-selected],
      .room-row[data-selected] {
        background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.14);
      }
      .room-row {
        padding: 0;
        cursor: default;
      }
      .room-row .room-name {
        flex: 1;
        min-width: 0;
        display: flex;
        /* One line, centred like the chevron (owner, 2026-11-17: baseline left it looking like a missing second row). */
        align-items: center;
        gap: 6px;
        min-height: 40px;
        padding: 6px 8px 6px 2px;
        border: none;
        border-radius: 8px;
        background: transparent;
        text-align: left;
        font-weight: 500;
        cursor: pointer;
      }
      .room-row .chevron {
        flex: none;
        width: 32px;
        height: 32px;
        margin-left: 2px;
        border: none;
        border-radius: 50%;
        background: transparent;
        display: grid;
        place-items: center;
        cursor: pointer;
      }
      .chevron svg,
      .head svg {
        flex: none;
        width: 20px;
        height: 20px;
        fill: var(--hp-muted);
        transition: transform 0.15s;
      }
      .chevron[aria-expanded="true"] svg,
      .head[aria-expanded="true"] svg {
        transform: rotate(90deg);
      }
      .count {
        font-size: 12px;
        font-weight: 400;
        letter-spacing: normal;
        text-transform: none;
        color: var(--hp-muted);
        white-space: nowrap;
      }
      .group-head {
        padding-left: 30px;
        min-height: 32px;
        gap: 6px;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--hp-muted);
      }
      .group-body .item {
        padding-left: 56px;
      }
      .link {
        flex: none;
        width: 18px;
        height: 18px;
        display: inline-grid;
        place-items: center;
      }
      .link svg {
        width: 18px;
        height: 18px;
        fill: var(--hp-accent);
      }
      .house-row .link svg {
        fill: var(--hp-muted);
      }
      /* The floor's rooms sit one step in under it (13.7). */
      .floor-row {
        padding-left: 20px;
      }
      .floor-body {
        padding-left: 12px;
      }
      .names {
        display: grid;
        gap: 2px;
        min-width: 0;
      }
      .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .house-row .name {
        font-weight: 500;
      }
      .area {
        font-size: 12px;
        color: var(--hp-muted);
      }
      .toolbar {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        padding: 12px 0 8px;
        background: var(--hp-surface);
      }
      .search {
        flex: 1 1 160px;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 4px;
        padding-left: 10px;
        background: var(--input-fill-color, var(--secondary-background-color, #f5f5f5));
        border-bottom: 1px solid var(--hp-divider);
        border-radius: 6px 6px 0 0;
        color: var(--hp-muted);
      }
      .search > svg {
        flex: none;
        width: 20px;
        height: 20px;
        fill: currentColor;
      }
      .search input {
        flex: 1;
        min-width: 0;
        border: none;
        background: transparent;
        padding: 10px 4px;
      }
      .search input:focus {
        outline: none;
      }
      .search:focus-within {
        border-bottom-color: var(--hp-accent);
      }
      .search input::-webkit-search-cancel-button {
        display: none;
      }
      .search .icon-button {
        width: 32px;
        height: 32px;
        color: var(--hp-muted);
      }
      .search .icon-button svg {
        width: 18px;
        height: 18px;
      }
      /* Expand all / Collapse all: one pill of two icon buttons beside the search (16.12). */
      .tree-actions {
        flex: none;
        display: inline-flex;
        padding: 2px;
        border: 1px solid var(--hp-divider);
        border-radius: 999px;
      }
      .tree-actions .icon-button {
        width: 32px;
        height: 32px;
        color: var(--hp-muted);
      }
      .tree-actions .icon-button svg {
        width: 20px;
        height: 20px;
      }
      .tree-actions .icon-button:focus-visible {
        outline: 2px solid var(--primary-color, #03a9f4);
        outline-offset: 1px;
      }
      .tree-actions button:hover {
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.04));
        color: var(--hp-text);
      }
      .effect {
        display: grid;
        gap: 8px;
        padding: 12px;
        border-radius: 12px;
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.03));
      }
      .effect-name {
        font-weight: 500;
      }
      .empty,
      .message {
        padding: 24px 4px;
        color: var(--hp-muted);
      }
      .message[data-error] {
        color: var(--hp-error);
        padding: 8px 4px;
      }
      .proposal {
        display: flex;
        align-items: baseline;
        gap: 10px;
        padding: 6px 4px;
        font-size: 14px;
        color: var(--hp-text);
        border-bottom: 1px solid var(--hp-divider);
      }
      .proposal input {
        flex: none;
      }
      .proposal .entity-name {
        font-weight: 500;
      }
      /* The entity ID is secondary to its friendly name (13.5). */
      .proposal .entity {
        font-family: var(--ha-font-family-code, ui-monospace, monospace);
        font-size: 12px;
        color: var(--hp-muted);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      footer {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 8px;
        padding: 12px 20px 16px;
        border-top: 1px solid var(--hp-divider);
      }
      footer .message {
        padding: 0;
      }
      /* Floor planners, Houses, Panels (Phase 21): icon buttons at the bottom left. */
      footer .pages {
        margin-right: auto;
        display: flex;
      }
    `,
  ];

  declare store: HassStore | undefined;
  declare source: HouseSource | undefined;
  declare houseId: string | null;
  declare targets: readonly BindingTarget[];
  declare target: EditorTarget;
  /** An object's or opening's declared state parameters (9.7), or null while its template loads. */
  declare stateParametersOf: (instanceId: string) => readonly TemplateStateParameter[] | null;
  /** The viewer's dashboard setting now (a room position saved meanwhile is kept by Save). */
  declare dashboard: HaDashboardValue;
  /** The HA integration's client: the House node then also holds House setup (Phase 11). */
  declare integrationClient: IntegrationClient | undefined;
  /** The shown floor, the level between House and its rooms (13.7); null before a house is shown. */
  declare floor: SettingsFloor | null;
  /** Every floor of the house, lowest first: House → Main view (16.1) lists them when there are several. */
  declare floors: readonly SettingsFloor[];
  /** The bindings as loaded (what Save compares the draft with) and as edited. */
  private saved: HaHouseBindingsValue | null = null;
  private draft: HaHouseBindingsValue | null = null;
  /** The dashboard setting as Settings opened with it, and as edited (dashboard, panel width, room tabs). */
  private savedDashboard: HaDashboardValue = emptyDashboard();
  private dashboardDraft: HaDashboardValue = emptyDashboard();
  private haForm = false;
  private saving = false;
  private error: string | null = null;
  /** The House node or the thing shown on the right. */
  private selection: SettingsSelection = houseSelection;
  /** On a narrow screen only one pane shows: the list, or the editor with Back. */
  private narrow = false;
  private pane: "tree" | "editor" = "tree";
  /**
   * The footer tab (Phase 21): House (the tree of things, saved with Save) or a connection page, Floor planners
   * (a tree of floor planners), Houses or Panels, whose actions apply at once.
   */
  private tab: SettingsTab = "house";
  /** The floor planner selected on the Floor planners tab: its URL, "new" to add one, null for the default. */
  private planner: string | null = null;
  private resizeObserver: ResizeObserver | null = null;
  /** The selected row is scrolled into view after the next render (opened by a tap in Edit mode). */
  private revealPending = false;
  /** The open room's proposals (10.3), null until **Suggest for this room**. */
  private roomSuggestions: RoomSuggestions | null = null;
  /** What applying the proposals did, shown in the room until it closes. */
  private applied: Readonly<{ roomId: string; count: number }> | null = null;
  /** HA's "related" context as last provided, and the pickers subscribed to it. */
  private related: RelatedContext = emptyRelated;
  private readonly relatedSubscribers = new Set<RelatedCallback>();
  /** The list's search (10.8). */
  private query = "";
  /** The tree's open rooms: none when Settings opens (a tapped thing's room is opened to reveal it). */
  private openRooms: ReadonlySet<string> = new Set();
  /** Groups the user closed (`room/group`); groups start open. */
  private closedGroups: ReadonlySet<string> = new Set();
  /** Rooms and groups closed during the current search; a new search opens every match again. */
  private searchClosed: ReadonlySet<string> = new Set();
  /** The list was visible last time (the search is focused when the list shows). */
  private listShown = false;

  constructor() {
    super();
    this.houseId = null;
    this.targets = [];
    this.target = null;
    this.stateParametersOf = () => null;
    this.dashboard = emptyDashboard();
    this.floor = null;
    this.floors = [];
    this.addEventListener("context-request", (event) => {
      this.provideRelated(event);
    });
  }

  /** HA's entity pickers in this editor ask for their "related" context: they list these entities first. */
  private provideRelated(event: Event): void {
    const request = relatedRequest(event);
    if (request === null) return;
    event.stopPropagation();
    if (!request.subscribe) {
      request.callback(this.related);
      return;
    }
    const callback: RelatedCallback = (value, unsubscribe) => {
      request.callback(value, unsubscribe);
    };
    this.relatedSubscribers.add(callback);
    callback(this.related, () => {
      this.relatedSubscribers.delete(callback);
    });
  }

  /** The selected thing's suggestions and its room's HA area, for HA's pickers; subscribers hear changes. */
  private updateRelated(): void {
    const target = this.selectedTarget();
    const roomId = target === undefined ? null : target.kind === "areas" ? target.id : target.areaId;
    const areaId = roomId === null ? null : this.haAreaOf(roomId);
    const next: RelatedContext = {
      entities: new Set(
        target === undefined ? [] : this.entitySuggestions(target).map((item) => item.entityId),
      ),
      devices: new Set(),
      areas: new Set(areaId === null ? [] : [areaId]),
    };
    if (sameSet(next.entities, this.related.entities) && sameSet(next.areas, this.related.areas)) return;
    this.related = next;
    for (const callback of this.relatedSubscribers) callback(next);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.observeSize();
    this.savedDashboard = this.dashboard;
    this.dashboardDraft = this.dashboard;
    void this.load();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  protected override firstUpdated(): void {
    this.observeSize();
  }

  /** Follows the host's width (narrow layout); re-created when HA re-attaches the editor. */
  private observeSize(): void {
    if (this.resizeObserver !== null || this.renderRoot.querySelector(".dialog") === null) return;
    const measure = (): void => {
      // The host covers the viewport; the dialog would be 90 % of it.
      const narrow = this.clientWidth * 0.9 <= narrowWidthPx;
      if (narrow === this.narrow) return;
      this.narrow = narrow;
      this.toggleAttribute("data-narrow", narrow);
      this.requestUpdate();
    };
    this.resizeObserver = new ResizeObserver(measure);
    this.resizeObserver.observe(this);
    measure();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("target")) this.select(this.target, true);
  }

  private async load(): Promise<void> {
    if (this.source === undefined || this.houseId === null) return;
    try {
      const [bindings, haForm] = await Promise.all([this.source.readBindings(this.houseId), loadHaForm()]);
      this.savedDashboard = await this.source.readDashboard();
      this.dashboardDraft = this.savedDashboard;
      this.saved = bindings;
      this.draft = structuredClone(bindings);
      this.haForm = haForm;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not load the bindings.";
    }
    this.requestUpdate();
  }

  private close(): void {
    this.dispatchEvent(new Event("close"));
  }

  private hasUnsavedChanges(): boolean {
    if (this.houseId === null || this.draft === null || this.saved === null) return false;
    return (
      settingsPatch({
        houseId: this.houseId,
        savedBindings: this.saved,
        draftBindings: this.draft,
        savedDashboard: this.savedDashboard,
        draftDashboard: this.dashboardDraft,
        currentDashboard: this.dashboard,
      }) !== null
    );
  }

  /** House setup asks before replacing the shown house: unsaved settings are saved first, or it is cancelled. */
  private async saveBeforeSwitch(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) return true;
    if (!window.confirm("Save your unsaved settings first? Cancel keeps them and stops this.")) return false;
    await this.persist();
    return this.error === null;
  }

  /** Save: one preferences patch with every changed key; nothing is sent when nothing changed. Closes Settings. */
  private async save(): Promise<void> {
    await this.persist();
    if (this.error === null) this.close();
  }

  private async persist(): Promise<void> {
    const draft = this.draft;
    const saved = this.saved;
    if (this.source === undefined || this.houseId === null || draft === null || saved === null) return;
    const patch = settingsPatch({
      houseId: this.houseId,
      savedBindings: saved,
      draftBindings: draft,
      savedDashboard: this.savedDashboard,
      draftDashboard: this.dashboardDraft,
      currentDashboard: this.dashboard,
    });
    this.saving = true;
    this.error = null;
    this.requestUpdate();
    try {
      if (patch !== null) await this.source.saveSettings(patch);
      if (patch !== null)
        this.dispatchEvent(
          new CustomEvent<SettingsSaved>("settings-saved", {
            detail: { bindings: prunedBindings(draft), dashboard: patch.dashboard ?? null },
          }),
        );
      this.saved = prunedBindings(draft);
      this.draft = structuredClone(this.saved);
      this.savedDashboard = this.dashboardDraft;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not save the settings.";
    }
    this.saving = false;
    this.requestUpdate();
  }

  /** Selects a thing (or with null the House node); from outside (a tap in Edit mode) its row is revealed. */
  private select(target: EditorTarget, reveal: boolean): void {
    const found =
      target === null
        ? undefined
        : this.targets.find((item) => item.kind === target.kind && item.id === target.id);
    this.selection = found === undefined ? houseSelection : { kind: found.kind, id: found.id };
    this.tab = "house";
    this.pane = target === null ? "tree" : "editor";
    if (found !== undefined && reveal) {
      const keys = revealKeys(found);
      if (!this.openRooms.has(keys.room)) this.openRooms = new Set([...this.openRooms, keys.room]);
      const group = keys.group;
      if (group !== null && this.closedGroups.has(group))
        this.closedGroups = new Set([...this.closedGroups].filter((key) => key !== group));
      this.revealPending = true;
    }
    this.requestUpdate();
  }

  private selectHouse(): void {
    this.selection = houseSelection;
    this.tab = "house";
    this.pane = "editor";
    this.requestUpdate();
  }

  private selectFloor(): void {
    this.selection = floorSelection;
    this.tab = "house";
    this.pane = "editor";
    this.requestUpdate();
  }

  private clickable(kind: TargetKind, id: string): Clickable {
    return this.draft?.[kind][id] ?? {};
  }

  private setClickable(kind: TargetKind, id: string, binding: Clickable): void {
    const draft = this.draft ?? emptyHouseBindings();
    this.draft = { ...draft, [kind]: { ...draft[kind], [id]: binding } };
    this.requestUpdate();
  }

  /** Stores (or with undefined removes) an object's state mappings; its other fields are kept. */
  private setStates(objectId: string, states: StateMappings | undefined): void {
    const draft = this.draft ?? emptyHouseBindings();
    const { states: _previous, ...rest } = draft.objects[objectId] ?? {};
    this.draft = {
      ...draft,
      objects: {
        ...draft.objects,
        [objectId]: states === undefined ? rest : { ...rest, states: { ...states } },
      },
    };
    this.requestUpdate();
  }

  private setEffect(effectId: string, binding: HaEffectBindingValue | undefined): void {
    const draft = this.draft ?? emptyHouseBindings();
    const others = Object.fromEntries(Object.entries(draft.effects).filter(([id]) => id !== effectId));
    this.draft = { ...draft, effects: binding === undefined ? others : { ...others, [effectId]: binding } };
    this.requestUpdate();
  }

  /** Stores (or with undefined removes) a room's presence setting (8.6); the room's other fields are kept. */
  private setPresence(areaId: string, presence: HaAreaPresenceValue | undefined): void {
    const draft = this.draft ?? emptyHouseBindings();
    const { presence: _previous, ...rest } = draft.areas[areaId] ?? {};
    this.draft = {
      ...draft,
      areas: { ...draft.areas, [areaId]: presence === undefined ? rest : { ...rest, presence } },
    };
    this.requestUpdate();
  }

  /** Sets (or with undefined removes) the floor's presence gate; an emptied floor binding is pruned on Save. */
  private setPresenceGate(floorId: string, presenceWhen: HaConditionValue | undefined): void {
    const draft = this.draft ?? emptyHouseBindings();
    const floor: HaFloorBindingValue = presenceWhen === undefined ? {} : { presenceWhen };
    this.draft = { ...draft, floors: { ...draft.floors, [floorId]: floor } };
    this.requestUpdate();
  }

  private haAreaName(roomId: string): string | null {
    const areaId = this.haAreaOf(roomId);
    return suggestionData(this.store).areas.find((area) => area.id === areaId)?.name ?? null;
  }

  /** The room's HA area chosen, or (undefined) matched again. */
  private setRoomHaArea(areaId: string, haAreaId: string | undefined): void {
    const draft = this.draft ?? emptyHouseBindings();
    const { haAreaId: _previous, ...rest } = draft.areas[areaId] ?? {};
    this.draft = {
      ...draft,
      areas: { ...draft.areas, [areaId]: haAreaId === undefined ? rest : { ...rest, haAreaId } },
    };
    this.requestUpdate();
  }

  private setRoomBubbles(areaId: string, list: readonly HaRoomBubbleValue[]): void {
    const draft = this.draft ?? emptyHouseBindings();
    const rooms = Object.fromEntries(Object.entries(draft.bubbles.rooms).filter(([id]) => id !== areaId));
    this.draft = {
      ...draft,
      bubbles: { ...draft.bubbles, rooms: list.length === 0 ? rooms : { ...rooms, [areaId]: [...list] } },
    };
    this.requestUpdate();
  }

  private setDashboard(next: HaDashboardValue): void {
    this.dashboardDraft = next;
    this.requestUpdate();
  }

  /**
   * The HA area of a room: the one chosen for it (owner 2026-11-17), else its binding's entities' area, else the
   * HA area named like it (10.3).
   */
  private haAreaOf(roomId: string): string | null {
    const room = this.targets.find((target) => target.kind === "areas" && target.id === roomId);
    const binding = this.draft?.areas[roomId];
    if (binding?.haAreaId !== undefined) return binding.haAreaId;
    const ids = [binding?.stateEntityId ?? null, binding?.presence?.entityId ?? null].filter(
      (id): id is string => id !== null,
    );
    const data = suggestionData(this.store);
    return roomHaArea(room?.name ?? "", ids, data.entities, data.areas);
  }

  private suggestionContext(target: BindingTarget): SuggestionContext {
    const room = this.targets.find((other) => other.kind === "areas" && other.id === target.areaId);
    return { name: target.name, roomName: room?.name ?? "", areaId: this.haAreaOf(target.areaId) };
  }

  /** The best entities for the binding's own entity: lights, objects, doors, and windows (10.3). */
  private entitySuggestions(target: BindingTarget): readonly EntitySuggestion[] {
    if (target.kind === "areas") return [];
    return suggestEntities(
      target.kind === "lights" ? { kind: "light" } : { kind: "object", opening: target.opening === true },
      this.suggestionContext(target),
      suggestionData(this.store).entities,
    );
  }

  /** Proposals for every unmapped state parameter of the room's objects, doors, and windows. */
  private suggestForRoom(room: BindingTarget): void {
    const draft = this.draft;
    if (draft === null) return;
    let loading = 0;
    const items = this.targets
      .filter((target) => target.kind === "objects" && target.areaId === room.id)
      .flatMap((target) => {
        const parameters = this.stateParametersOf(target.id);
        if (parameters === null) loading += 1;
        if (parameters === null || parameters.length === 0) return [];
        return [
          {
            id: target.id,
            name: target.name,
            parameters,
            mapped: Object.keys(draft.objects[target.id]?.states ?? {}),
          },
        ];
      });
    // Entities that already drive a state parameter somewhere are not proposed again.
    const used = new Set(
      Object.values(draft.objects).flatMap((binding) =>
        Object.values(binding.states ?? {}).flatMap((mapping) => {
          const id = mappingEntity(mapping, binding.stateEntityId);
          return id === null ? [] : [id];
        }),
      ),
    );
    const proposals = roomProposals(
      items,
      { name: room.name, areaId: this.haAreaOf(room.id) },
      suggestionData(this.store).entities,
      used,
    );
    this.roomSuggestions = { roomId: room.id, proposals, ticked: new Set(), loading };
    this.applied = null;
    this.requestUpdate();
  }

  private setTicked(ticked: ReadonlySet<string>): void {
    if (this.roomSuggestions === null) return;
    this.roomSuggestions = { ...this.roomSuggestions, ticked };
    this.requestUpdate();
  }

  /** Fills the draft with the ticked proposals (each with its domain's default mapping); Save keeps them. */
  private applyProposals(): void {
    const suggestions = this.roomSuggestions;
    const draft = this.draft;
    if (suggestions === null || draft === null) return;
    const chosen = suggestions.proposals.filter((proposal) => suggestions.ticked.has(proposalKey(proposal)));
    const objects = { ...draft.objects };
    for (const proposal of chosen) {
      const binding = objects[proposal.itemId] ?? {};
      const entityId = proposal.suggestion.entityId;
      objects[proposal.itemId] = {
        ...binding,
        states: {
          ...binding.states,
          [proposal.parameter.name]: {
            entity: entityId,
            ...defaultStateMapping(
              entityId.split(".")[0] ?? "",
              proposal.parameter,
              this.store?.entity(entityId)?.attributes,
            ),
          },
        },
      };
    }
    this.draft = { ...draft, objects };
    this.roomSuggestions = null;
    this.applied = { roomId: suggestions.roomId, count: chosen.length };
    this.requestUpdate();
  }

  private renderRoomSuggestions(room: BindingTarget): TemplateResult {
    const suggestions = this.roomSuggestions?.roomId === room.id ? this.roomSuggestions : null;
    const applied = this.applied?.roomId === room.id ? this.applied : null;
    const button = html`<div class="actions">
      <button
        class="text-button"
        @click=${() => {
          this.suggestForRoom(room);
        }}
      >
        ${suggestions === null ? "Suggest for this room" : "Suggest again"}
      </button>
    </div>`;
    if (suggestions === null)
      return html`${button}
      ${
        applied === null
          ? nothing
          : html`<span class="hint">
              Filled in ${String(applied.count)} ${applied.count === 1 ? "binding" : "bindings"}; open a thing
              to check its mapping, then Save to keep them.
            </span>`
      }`;
    const { proposals, ticked } = suggestions;
    const loading =
      suggestions.loading === 0
        ? nothing
        : html`<span class="hint">
            ${String(suggestions.loading)} ${suggestions.loading === 1 ? "thing is" : "things are"} still
            loading its model; suggest again in a moment.
          </span>`;
    if (proposals.length === 0)
      return html`${button}
        <span class="hint">
          Nothing to propose: every door, window, and object here with state parameters is connected, or no
          entity in this room's Home Assistant area (or named like it) fits.
        </span>
        ${loading}`;
    return html`${button}
      <span class="hint">Tick the bindings to fill in; nothing is saved until you press Save.</span>
      ${proposals.map((proposal) => {
        const key = proposalKey(proposal);
        return html`<label class="proposal">
          <input
            type="checkbox"
            .checked=${ticked.has(key)}
            @change=${(event: Event) => {
              const next = new Set(ticked);
              if (event.target instanceof HTMLInputElement && event.target.checked) next.add(key);
              else next.delete(key);
              this.setTicked(next);
            }}
          />
          <span>
            ${proposal.itemName} · ${proposal.parameter.title} →
            <span class="entity-name">${proposal.suggestion.name}</span>
            ${
              proposal.suggestion.name === proposal.suggestion.entityId
                ? nothing
                : html`<span class="entity">${proposal.suggestion.entityId}</span>`
            }
            <span class="hint">(${proposal.suggestion.reason})</span>
          </span>
        </label>`;
      })}
      ${loading}
      <div class="actions">
        <button
          class="text-button"
          @click=${() => {
            this.setTicked(
              ticked.size === proposals.length ? new Set() : new Set(proposals.map(proposalKey)),
            );
          }}
        >
          ${ticked.size === proposals.length ? "Untick all" : "Tick all"}
        </button>
        <button
          class="button"
          ?disabled=${ticked.size === 0}
          @click=${() => {
            this.applyProposals();
          }}
        >
          Apply ${String(ticked.size)}
        </button>
      </div>`;
  }

  private summary(target: BindingTarget): string {
    const binding = this.clickable(target.kind, target.id);
    const parts = [
      binding.stateEntityId ?? null,
      binding.visibleWhen === undefined ? null : "conditional",
      target.kind === "objects" && this.draft?.objects[target.id]?.states !== undefined ? "states" : null,
      target.effects.some((effect) => this.draft?.effects[effect.id] !== undefined) ? "effects" : null,
      target.kind === "areas" && this.draft?.areas[target.id]?.presence !== undefined ? "presence" : null,
    ].filter((part): part is string => part !== null);
    return parts.length === 0 ? "Not connected" : parts.join(" · ");
  }

  /** The entities a thing's binding uses, which the search matches by ID and friendly name. */
  private listItem(target: BindingTarget): ListItem {
    const binding = this.clickable(target.kind, target.id);
    const states = target.kind === "objects" ? (this.draft?.objects[target.id]?.states ?? {}) : {};
    const presence =
      target.kind === "areas" ? (this.draft?.areas[target.id]?.presence?.entityId ?? null) : null;
    const entityIds = [
      ...new Set(
        [
          binding.stateEntityId ?? null,
          ...Object.values(states).map((mapping) => mappingEntity(mapping, binding.stateEntityId)),
          presence,
        ].filter((id): id is string => id !== null),
      ),
    ];
    const entityNames = entityIds.flatMap((id) => {
      const name = this.store?.entity(id)?.attributes.friendly_name;
      return typeof name === "string" ? [name] : [];
    });
    return { target, entityIds, entityNames, connected: this.summary(target) !== "Not connected" };
  }

  private open(target: BindingTarget): void {
    this.selection = { kind: target.kind, id: target.id };
    this.tab = "house";
    this.pane = "editor";
    this.requestUpdate();
  }

  /** The link icon of a connected thing; nothing for an unconnected one (owner, 2026-11-17: no empty slot). */
  private linkSlot(connected: boolean): TemplateResult | typeof nothing {
    return connected
      ? html`<span class="link" title="Connected" role="img" aria-label="Connected">${icon(linkIcon)}</span>`
      : nothing;
  }

  private renderRow(item: ListItem): TemplateResult {
    const selected = isSelected(this.selection, item.target);
    return html`<button
      class="item"
      ?data-selected=${selected}
      aria-current=${selected ? "true" : "false"}
      @click=${() => {
        this.open(item.target);
      }}
    >
      ${this.linkSlot(item.connected)}
      <span class="names">
        <span class="name">${item.target.name}</span>
      </span>
    </button>`;
  }

  /** The House node at the top of the list: settings of the whole viewer and house. */
  private renderHouseRow(): TemplateResult {
    const selected = this.selection.kind === "house";
    return html`<button
      class="item house-row"
      ?data-selected=${selected}
      aria-current=${selected ? "true" : "false"}
      @click=${() => {
        this.selectHouse();
      }}
    >
      <span class="link">${icon(homeIcon)}</span>
      <span class="names">
        <span class="name">House</span>
        <span class="area">${this.houseId === null ? "Houses" : "Room cards, main view, navigation"}</span>
      </span>
    </button>`;
  }

  /** The floor row under House (13.7): its widgets; the floor's rooms are listed under it. */
  private renderFloorRow(floor: SettingsFloor): TemplateResult {
    const selected = this.selection.kind === "floor";
    return html`<button
      class="item house-row floor-row"
      ?data-selected=${selected}
      aria-current=${selected ? "true" : "false"}
      @click=${() => {
        this.selectFloor();
      }}
    >
      <span class="link">${icon(floorIcon)}</span>
      <span class="names">
        <span class="name">${floor.name}</span>
        <span class="area">Floor widgets and presence</span>
      </span>
    </button>`;
  }

  private setQuery(query: string): void {
    this.query = query;
    this.searchClosed = new Set();
    this.requestUpdate();
  }

  /** Opens or closes a tree room or group; while searching only for this search. */
  private toggle(key: string, open: boolean, room: boolean): void {
    const flip = (set: ReadonlySet<string>, add: boolean): ReadonlySet<string> => {
      const next = new Set(set);
      if (add) next.add(key);
      else next.delete(key);
      return next;
    };
    if (searchWords(this.query).length > 0) this.searchClosed = flip(this.searchClosed, open);
    else if (room) this.openRooms = flip(this.openRooms, !open);
    else this.closedGroups = flip(this.closedGroups, open);
    this.requestUpdate();
  }

  /**
   * Expand all opens every room and group; Collapse all closes every room (a room opened later shows its groups
   * open). While searching it acts on the matches only, for this search.
   */
  private setAllOpen(open: boolean): void {
    const rooms = this.targets.filter((target) => target.kind === "areas").map((target) => target.id);
    if (searchWords(this.query).length > 0) this.searchClosed = new Set(open ? [] : rooms);
    else {
      this.openRooms = new Set(open ? rooms : []);
      this.closedGroups = new Set();
    }
    this.requestUpdate();
  }

  private renderToolbar(): TemplateResult {
    return html`<div class="toolbar">
      <div class="search">
        ${icon(searchIcon)}
        <input
          type="search"
          placeholder="Search"
          aria-label="Search lights, objects, doors, windows, and rooms"
          .value=${this.query}
          @input=${(event: Event) => {
            this.setQuery(event.target instanceof HTMLInputElement ? event.target.value : "");
          }}
          @keydown=${(event: KeyboardEvent) => {
            // Escape clears the search first; only an empty search lets it through.
            if (event.key !== "Escape" || this.query === "") return;
            event.preventDefault();
            event.stopPropagation();
            this.setQuery("");
          }}
        />
        ${
          this.query === ""
            ? nothing
            : html`<button
                class="icon-button"
                title="Clear the search"
                aria-label="Clear the search"
                @click=${() => {
                  this.setQuery("");
                  const input = this.renderRoot.querySelector(".search input");
                  if (input instanceof HTMLElement) input.focus();
                }}
              >
                ${icon(closeIcon)}
              </button>`
        }
      </div>
      <div class="tree-actions" role="group" aria-label="Tree">
        <button
          class="icon-button"
          title="Expand all"
          aria-label="Expand all"
          @click=${() => {
            this.setAllOpen(true);
          }}
        >
          ${icon(expandAllIcon)}
        </button>
        <button
          class="icon-button"
          title="Collapse all"
          aria-label="Collapse all"
          @click=${() => {
            this.setAllOpen(false);
          }}
        >
          ${icon(collapseAllIcon)}
        </button>
      </div>
    </div>`;
  }

  private renderGroup(room: TreeRoom, group: TreeGroup, searching: boolean): TemplateResult {
    const key = `${room.id}/${group.key}`;
    const open = !(searching ? this.searchClosed : this.closedGroups).has(key);
    return html`<button
        class="head group-head"
        aria-expanded=${String(open)}
        @click=${() => {
          this.toggle(key, open, false);
        }}
      >
        ${icon(chevronIcon)}
        <span>${group.title}</span>
        <span class="count">${countText(group.connected, group.total)}</span>
      </button>
      ${open ? html`<div class="group-body">${group.items.map((item) => this.renderRow(item))}</div>` : nothing}`;
  }

  /** A room is one line: the chevron opens or closes it, the name selects it (its editor shows on the right). */
  private renderTree(items: readonly ListItem[]): TemplateResult {
    const rooms = bindingTree(items, this.query);
    const searching = searchWords(this.query).length > 0;
    if (rooms.length === 0) return html`<div class="empty">No matches</div>`;
    return html`${rooms.map((room) => {
      const open = searching ? !this.searchClosed.has(room.id) : this.openRooms.has(room.id);
      const selected =
        this.selection.kind === "areas" && "id" in this.selection && this.selection.id === room.id;
      const roomTarget = this.targets.find((target) => target.kind === "areas" && target.id === room.id);
      return html`<div class="room-row" ?data-selected=${selected}>
          <button
            class="chevron"
            aria-expanded=${String(open)}
            aria-label=${`${open ? "Close" : "Open"} ${room.name}`}
            title=${open ? "Close" : "Open"}
            @click=${() => {
              this.toggle(room.id, open, true);
            }}
          >
            ${icon(chevronIcon)}
          </button>
          <button
            class="room-name"
            aria-current=${selected ? "true" : "false"}
            @click=${() => {
              if (roomTarget !== undefined) this.open(roomTarget);
            }}
          >
            <span class="name">${room.name}</span>
            <span class="count">${countText(room.connected, room.total)}</span>
          </button>
        </div>
        ${
          open && room.groups.length > 0
            ? html`<div class="room-body">
                ${room.groups.map((group) => this.renderGroup(room, group, searching))}
              </div>`
            : nothing
        }`;
    })}`;
  }

  private renderList(): TemplateResult {
    if (this.houseId === null) return this.renderHouseRow();
    if (this.draft === null) return html`<div class="empty">Loading…</div>`;
    const items = this.targets.map((target) => this.listItem(target));
    const things =
      this.targets.length === 0
        ? html`<div class="empty">
            ${
              this.floor === null && this.floors.length > 1
                ? "The whole house view has nothing to connect: open a floor to connect its things."
                : "This floor has nothing to connect."
            }
          </div>`
        : this.renderTree(items);
    // House, then the floor, then its rooms (13.7), also for a one-floor house.
    return html`${this.renderToolbar()} ${this.renderHouseRow()}
    ${
      this.floor === null
        ? things
        : html`${this.renderFloorRow(this.floor)}
            <div class="floor-body">${things}</div>`
    }`;
  }

  /** The room editor's own sections after its binding: its dashboard tab, room bubbles, and presence. */
  /** The room's cards, first in its editor (owner 2026-11-17): its dashboard tab, then its panel width. */
  /** Which HA area the room is: HA's area picker (or a plain select), with what matching found meanwhile. */
  private renderRoomHaArea(room: BindingTarget): TemplateResult {
    const chosen = this.draft?.areas[room.id]?.haAreaId;
    const areas = suggestionData(this.store).areas;
    const matchedId = this.haAreaOf(room.id);
    const matched = areas.find((area) => area.id === matchedId)?.name ?? null;
    const hint =
      chosen !== undefined
        ? "Chosen for this room."
        : matched === null
          ? "No Home Assistant area matches this room yet; choose one for better suggestions."
          : `Matched automatically: ${matched}. Choose one to make it fixed.`;
    const picker = this.haForm
      ? html`<ha-form
          .hass=${this.store?.current()}
          .data=${chosen === undefined ? {} : { area: chosen }}
          .schema=${[{ name: "area", selector: { area: {} } }]}
          .computeLabel=${() => "Home Assistant area"}
          @value-changed=${(event: Event) => {
            const value = formValue(event)?.area;
            this.setRoomHaArea(room.id, typeof value === "string" && value !== "" ? value : undefined);
          }}
        ></ha-form>`
      : html`<label>
          Home Assistant area
          <select
            @change=${(event: Event) => {
              const value = valueOf(event);
              this.setRoomHaArea(room.id, value === null || value === "" ? undefined : value);
            }}
          >
            <option value="" ?selected=${chosen === undefined}>Match automatically</option>
            ${areas.map(
              (area) => html`<option value=${area.id} ?selected=${area.id === chosen}>${area.name}</option>`,
            )}
          </select>
        </label>`;
    return html`<h3>Home Assistant area</h3>
      <div class="subtitle">
        The HA area this room is: its entities come first in suggestions and pickers, and its dashboard tab
        may be named like it.
      </div>
      ${picker}
      <div class="subtitle">${hint}</div>`;
  }

  private renderRoomCards(room: BindingTarget): TemplateResult {
    return html`
      ${this.renderRoomHaArea(room)}
      <h3>Tab</h3>
      <div class="subtitle">
        Which tab of the dashboard (House) shows this room's cards in the room panel.
      </div>
      <homeplan-room-tab-setting
        .store=${this.store}
        .haForm=${this.haForm}
        .dashboard=${this.dashboardDraft}
        .houseId=${this.houseId}
        .areaId=${room.id}
        .areaName=${room.name}
        .haAreaName=${this.haAreaName(room.id)}
        @dashboard-change=${(event: CustomEvent<HaDashboardValue>) => {
          this.setDashboard(event.detail);
        }}
      ></homeplan-room-tab-setting>
    `;
  }

  private renderRoomSettings(room: BindingTarget): TemplateResult {
    const presence = this.draft?.areas[room.id]?.presence;
    return html`
      <h3>Room bubbles</h3>
      <div class="subtitle">
        Shown above the room, in a row along its longest side, while each one's condition holds.
      </div>
      <homeplan-room-bubbles
        .store=${this.store}
        .bubbles=${this.draft?.bubbles.rooms[room.id] ?? []}
        .areaName=${room.name}
        @room-bubbles-change=${(event: CustomEvent<readonly HaRoomBubbleValue[]>) => {
          this.setRoomBubbles(room.id, event.detail);
        }}
      ></homeplan-room-bubbles>
      <homeplan-presence-setting
        .store=${this.store}
        .presence=${presence}
        .areaName=${room.name}
        @presence-change=${(event: CustomEvent<OptionalChange<HaAreaPresenceValue>>) => {
          this.setPresence(room.id, event.detail.value);
        }}
      ></homeplan-presence-setting>
    `;
  }

  /**
   * The house's own settings (Room cards, Main view, Navigation). The builder connection lives on the footer's pages
   * (Phase 21); before any house is shown, the House node shows the Houses page.
   */
  private renderHouse(): TemplateResult | typeof nothing {
    if (this.houseId === null) return this.renderConnectionPage("houses");
    return html`${
      this.draft === null
        ? nothing
        : html`<homeplan-house-settings
            .store=${this.store}
            .haForm=${this.haForm}
            .dashboard=${this.dashboardDraft}
            .houseId=${this.houseId}
            .floors=${this.floors}
            @dashboard-change=${(event: CustomEvent<HaDashboardValue>) => {
              this.setDashboard(event.detail);
            }}
          ></homeplan-house-settings>`
    }`;
  }

  /** A connection page (Floor planners, Houses, Panels; Phase 21) with the shown house and the save guard. */
  private renderConnectionPage(page: SettingsPage): TemplateResult | typeof nothing {
    return this.integrationClient === undefined
      ? nothing
      : html`<homeplan-connection-settings
          .client=${this.integrationClient}
          .view=${page}
          .store=${this.store}
          .selectedId=${this.houseId}
          .guard=${() => this.saveBeforeSwitch()}
          @settings-page=${(event: CustomEvent<SettingsTab>) => {
            this.openTab(event.detail);
          }}
        ></homeplan-connection-settings>`;
  }

  /** The shown tab: House needs a shown house; before one exists, Houses. */
  private shownTab(): SettingsTab {
    return this.tab === "house" && this.houseId === null ? "houses" : this.tab;
  }

  private openTab(tab: SettingsTab): void {
    this.tab = tab;
    this.pane = tab === "floorPlanners" ? "tree" : "editor";
    this.requestUpdate();
  }

  /** A connection tab's pane: its heading and page (Floor planners: the selected floor planner). */
  private renderTabEditor(page: SettingsPage): TemplateResult {
    return html`
      <div class="editor-head">
        ${page === "floorPlanners" ? this.renderBack() : nothing}
        <span class="titles">
          <h2>${settingsPageTitle(page)}</h2>
          <span class="subtitle">${pageSubtitles[page]}</span>
        </span>
      </div>
      ${
        this.integrationClient === undefined
          ? nothing
          : html`<homeplan-connection-settings
              .client=${this.integrationClient}
              .view=${page}
              .store=${this.store}
              .planner=${this.planner}
              .selectedId=${this.houseId}
              .guard=${() => this.saveBeforeSwitch()}
              @settings-page=${(event: CustomEvent<SettingsTab>) => {
                this.openTab(event.detail);
              }}
              @planner-select=${(event: CustomEvent<string | null>) => {
                this.planner = event.detail;
                this.requestUpdate();
              }}
            ></homeplan-connection-settings>`
      }
    `;
  }

  /** The dialog body for the shown tab. */
  private renderBody(): TemplateResult {
    const tab = this.shownTab();
    if (tab === "house")
      return html`<div class="split" data-pane=${this.pane}>
        <nav class="tree-pane" aria-label="Things to set up">${this.renderList()}</nav>
        <section class="editor-pane">${this.renderEditor()}</section>
      </div>`;
    if (tab === "floorPlanners")
      return html`<div class="split" data-pane=${this.pane}>
        <nav class="tree-pane" aria-label="Floor planners">
          ${
            this.integrationClient === undefined
              ? nothing
              : html`<homeplan-connection-settings
                  .client=${this.integrationClient}
                  .view=${"plannerList"}
                  .planner=${this.planner}
                  @planner-select=${(event: CustomEvent<string | null>) => {
                    this.planner = event.detail;
                    this.pane = "editor";
                    this.requestUpdate();
                  }}
                ></homeplan-connection-settings>`
          }
        </nav>
        <section class="editor-pane">${this.renderTabEditor("floorPlanners")}</section>
      </div>`;
    return html`<div class="split" data-single>
      <section class="editor-pane">${this.renderTabEditor(tab)}</section>
    </div>`;
  }

  /** On a narrow screen the editor covers the list: a back button returns to it. */
  private renderBack(): TemplateResult | typeof nothing {
    return this.narrow
      ? html`<button
          class="icon-button"
          title="Back to the list"
          aria-label="Back to the list"
          @click=${() => {
            this.pane = "tree";
            this.requestUpdate();
          }}
        >
          ${icon(backIcon)}
        </button>`
      : nothing;
  }

  private selectedTarget(): BindingTarget | undefined {
    const selection = this.selection;
    return "id" in selection
      ? this.targets.find((item) => item.kind === selection.kind && item.id === selection.id)
      : undefined;
  }

  /**
   * The floor editor (13.7): which tab's cards show beside the house on this floor, how wide, and where; and its
   * presence gate (owner, 2026-11-18), when the floor's rooms may sweep at all.
   */
  private renderFloor(floor: SettingsFloor): TemplateResult {
    return html`<h3>Floor widgets</h3>
      <div class="subtitle">
        Cards of a dashboard tab drawn over the 3D view beside the house, without a panel; the house fits into
        the rest. They hide while a room is open.
      </div>
      <homeplan-floor-widget-setting
        .store=${this.store}
        .haForm=${this.haForm}
        .dashboard=${this.dashboardDraft}
        .houseId=${this.houseId}
        .floorId=${floor.id}
        .floorName=${floor.name}
        @dashboard-change=${(event: CustomEvent<HaDashboardValue>) => {
          this.setDashboard(event.detail);
        }}
      ></homeplan-floor-widget-setting>
      <h3>Presence and intrusion</h3>
      <div class="subtitle">
        The rooms of this floor sweep red only while this condition holds; otherwise none of them sweeps or
        tints, whatever their own presence entities say. For example, only while the alarm is armed: State of
        your alarm_control_panel is armed_away, armed_home, armed_night, or armed_vacation.
      </div>
      <homeplan-condition-editor
        .store=${this.store}
        .haForm=${this.haForm}
        .condition=${this.draft?.floors?.[floor.id]?.presenceWhen}
        .defaultEntity=${null}
        .emptyText=${"Always"}
        @condition-change=${(event: CustomEvent<OptionalChange<HaConditionValue>>) => {
          this.setPresenceGate(floor.id, event.detail.value);
        }}
      ></homeplan-condition-editor>`;
  }

  private renderEditor(): TemplateResult {
    const target = this.selectedTarget();
    const floor = this.selection.kind === "floor" ? this.floor : null;
    const title = target?.name ?? floor?.name ?? "House";
    const subtitle =
      floor !== null
        ? "Floor: widgets beside the house and when its rooms sweep."
        : target === undefined
          ? "Settings for the whole viewer and this house."
          : `${kindLabels[target.kind]}${target.areaName === "" ? "" : ` in ${target.areaName}`}`;
    return html`
      <div class="editor-head">
        ${this.renderBack()}
        <span class="titles">
          <h2>${title}</h2>
          <span class="subtitle">${subtitle}</span>
        </span>
      </div>
      ${
        this.draft === null && this.houseId !== null
          ? html`<div class="empty">Loading…</div>`
          : floor !== null && this.houseId !== null
            ? this.renderFloor(floor)
            : target === undefined || this.draft === null
              ? this.renderHouse()
              : html`${target.kind === "areas" ? this.renderRoomCards(target) : nothing}
                ${this.renderDetail(target)}
                ${target.kind === "areas" ? this.renderRoomSettings(target) : nothing}`
      }
    `;
  }

  private renderDetail(target: BindingTarget): TemplateResult {
    const binding = this.clickable(target.kind, target.id);
    const entity = binding.stateEntityId ?? null;
    const entityLabel =
      target.kind === "lights"
        ? "Home Assistant light (state)"
        : target.opening === true
          ? "Entity (the default for the state parameters below and the actions)"
          : target.kind === "objects"
            ? "Entity (for example the AC's climate entity)"
            : "Entity (for example the room's presence or temperature)";
    return html`
      ${
        target.kind === "areas"
          ? html`<h3>Suggest for this room</h3>
              <div class="subtitle">
                Proposes entities for the doors, windows, and objects here whose state parameters are not
                connected yet, from this room's Home Assistant area and names.
              </div>
              ${this.renderRoomSuggestions(target)}`
          : nothing
      }
      <h3>Entity and actions</h3>
      <homeplan-binding-fields
        .store=${this.store}
        .haForm=${this.haForm}
        .fields=${binding}
        .domain=${target.kind === "lights" ? "light" : undefined}
        .entityLabel=${entityLabel}
        .defaults=${gestureDefaults(target, binding.stateEntityId ?? null)}
        .suggestions=${this.entitySuggestions(target)}
        @fields-change=${(event: CustomEvent<ClickableFields>) => {
          // The entity and actions are replaced; everything else (the condition, a room's presence) is kept.
          const {
            stateEntityId: _entity,
            tapAction: _tap,
            holdAction: _hold,
            doubleTapAction: _doubleTap,
            ...kept
          } = binding;
          this.setClickable(target.kind, target.id, { ...kept, ...event.detail });
        }}
      ></homeplan-binding-fields>
      ${
        target.kind === "lights"
          ? html`<h3>Light output</h3>
              <div class="subtitle">
                Re-adjust this lamp from Home Assistant without editing the house; saved with Save. The
                house's values stay the defaults.
              </div>
              <homeplan-light-output
                .store=${this.store}
                .haForm=${this.haForm}
                .entityId=${entity}
                .house=${target.light}
                .lumens=${binding.lumens}
                .kelvin=${binding.kelvin}
                @light-output-change=${(event: CustomEvent<LightOutputOverrides>) => {
                  const { lumens: _lumens, kelvin: _kelvin, ...rest } = binding;
                  this.setClickable(target.kind, target.id, { ...rest, ...event.detail });
                }}
              ></homeplan-light-output>`
          : nothing
      }
      ${
        target.kind === "objects"
          ? html`<h3>State</h3>
              <div class="subtitle">
                Live values from Home Assistant for the parameters the template marks as state (an open angle,
                an open mode, blinds closed). The 3D view draws them instead of the stored values; an
                unavailable entity keeps the stored value.
              </div>
              <homeplan-state-bindings
                .store=${this.store}
                .haForm=${this.haForm}
                .parameters=${this.stateParametersOf(target.id)}
                .states=${this.draft?.objects[target.id]?.states}
                .defaultEntity=${entity}
                .suggest=${(parameter: TemplateStateParameter) =>
                  suggestEntities(
                    { kind: "state", parameter },
                    this.suggestionContext(target),
                    suggestionData(this.store).entities,
                  )}
                @states-change=${(event: CustomEvent<OptionalChange<StateMappings>>) => {
                  this.setStates(target.id, event.detail.value);
                }}
              ></homeplan-state-bindings>`
          : nothing
      }
      <h3>Shown when</h3>
      <div class="subtitle">
        ${
          target.kind === "lights"
            ? "While the condition does not hold, the light is hidden: off, not drawn, and it ignores clicks."
            : target.opening === true
              ? "While the condition does not hold, the door or window ignores clicks (they reach its room)."
              : target.kind === "objects"
                ? "While the condition does not hold, the object ignores clicks (they reach its room)."
                : "Used by room bubbles and presence (8.5, 8.6)."
        }
      </div>
      <homeplan-condition-editor
        .store=${this.store}
        .haForm=${this.haForm}
        .condition=${binding.visibleWhen}
        .defaultEntity=${entity}
        .emptyText=${"Always"}
        @condition-change=${(event: CustomEvent<OptionalChange<HaConditionValue>>) => {
          const { visibleWhen: _previous, ...rest } = binding;
          const visibleWhen = event.detail.value;
          this.setClickable(target.kind, target.id, {
            ...rest,
            ...(visibleWhen === undefined ? {} : { visibleWhen }),
          });
        }}
      ></homeplan-condition-editor>
      ${
        target.effects.length === 0
          ? nothing
          : html`<h3>Ambient effects</h3>
              <div class="subtitle">
                When each effect runs and how it looks by state (applied in the 3D view from 8.4).
              </div>
              ${target.effects.map(
                (effect) =>
                  html`<div class="effect">
                    <span class="effect-name">${effect.name}</span>
                    <homeplan-effect-binding
                      .store=${this.store}
                      .haForm=${this.haForm}
                      .name=${effect.name}
                      .authoredColor=${effect.color}
                      .binding=${this.draft?.effects[effect.id]}
                      .defaultEntity=${entity}
                      @effect-change=${(event: CustomEvent<OptionalChange<HaEffectBindingValue>>) => {
                        this.setEffect(effect.id, event.detail.value);
                      }}
                    ></homeplan-effect-binding>
                  </div>`,
              )}`
      }
    `;
  }

  protected override updated(): void {
    this.updateRelated();
    const listVisible = this.draft !== null && (!this.narrow || this.pane === "tree");
    // The search is focused whenever the list shows (as the floor planner's object picker does), except when
    // Settings opened on a tapped thing beside it.
    if (listVisible && !this.listShown && (this.target === null || this.narrow)) {
      const input = this.renderRoot.querySelector(".search input");
      if (input instanceof HTMLElement) input.focus();
    }
    this.listShown = listVisible;
    if (this.revealPending && this.draft !== null) {
      this.revealPending = false;
      const row = this.renderRoot.querySelector(".tree-pane [data-selected]");
      if (row instanceof HTMLElement) row.scrollIntoView({ block: "center" });
    }
  }

  protected override render(): TemplateResult {
    return html`
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Settings">
        <header>
          <span class="titles">
            <h2>Settings</h2>
            <span class="subtitle">
              Tap a light, object, door, window, or room in Edit mode, or choose one here.
            </span>
          </span>
          <button
            class="icon-button"
            title="Close"
            @click=${() => {
              this.close();
            }}
          >
            ${icon(closeIcon)}
          </button>
        </header>
        ${this.renderBody()}
        <footer>
          <span class="pages">
            ${
              this.integrationClient === undefined
                ? nothing
                : html`<homeplan-connection-settings
                    .client=${this.integrationClient}
                    .view=${"footer"}
                    .activePage=${this.shownTab()}
                    .houseAvailable=${this.houseId !== null}
                    @settings-page=${(event: CustomEvent<SettingsTab>) => {
                      this.openTab(event.detail);
                    }}
                  ></homeplan-connection-settings>`
            }
          </span>
          ${this.error === null ? nothing : html`<span class="message" data-error>${this.error}</span>`}
          <button
            class="text-button"
            @click=${() => {
              this.close();
            }}
          >
            ${this.houseId === null || this.shownTab() !== "house" ? "Close" : "Cancel"}
          </button>
          ${
            this.houseId === null || this.shownTab() !== "house"
              ? nothing
              : html`<button
                  class="button"
                  ?disabled=${this.draft === null || this.saving}
                  @click=${() => void this.save()}
                >
                  ${this.saving ? "Saving…" : "Save"}
                </button>`
          }
        </footer>
      </div>
    `;
  }
}
