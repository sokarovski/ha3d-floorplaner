import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, TemplateResult } from "lit";
import type { HouseCardValue } from "@shared/contracts/houses";
import type {
  ConnectionValue,
  CopyMetadataValue,
  FrontendManifestValue,
  IntegrationJobValue,
  SourceStatusValue,
} from "@shared/contracts/homeplanIntegration";
import { createConnectionMemory } from "./connectionMemory";
import type { MemoryState } from "./connectionMemory";
import { fieldStyles, formValue, numberOf } from "./formHelpers";
import { loadHaForm } from "./haElements";
import type { HassStore } from "./hassStore";
import type { IntegrationClient } from "./integrationClient";
import { SourceError } from "./houseSource";
import { tokens } from "./styles/tokens";
import { availableRenderers, deviceRenderer, saveDeviceRenderer } from "./three/renderers";
import type { ViewerRenderer } from "./three/renderers";

/**
 * The Settings pages for the builder connection (Phase 21, owner 2026-11-20): Floor planners (the builders this
 * Home Assistant knows, one the default), Houses (local copies and the default floor planner's houses) and Panels
 * (the viewer that runs: shipped, downloaded, or offered by the floor planner). `footer` is the row of icon
 * buttons at the bottom left of Settings: it connects to the default floor planner in the background when
 * Settings opens and opens a page with a `settings-page` event.
 */
export type SettingsPage = "floorPlanners" | "houses" | "panels";
/** The Settings footer's tabs: House (the dialog's own tree of things) and the connection pages. */
export type SettingsTab = "house" | "setupHa" | SettingsPage;
/** `plannerList`: the Floor planners tab's tree (the floor planners, + to add one). */
export type ConnectionView = "footer" | "plannerList" | SettingsPage;

/** What Connect last found, kept for this browser session (15.12). */
type RememberedConnection = Readonly<{
  builderUrl: string | null;
  generation: number;
  houses: readonly HouseCardValue[];
  offer: FrontendManifestValue | null;
  statuses: readonly (readonly [string, SourceStatusValue | string])[];
}>;

type FrontendState = Readonly<{
  shipped: FrontendManifestValue;
  active: FrontendManifestValue | null;
  previous: FrontendManifestValue | null;
}>;

const remembered = createConnectionMemory<IntegrationClient, RememberedConnection>(() => Date.now());

/** Every view of the connection on screen hears when another one changed it (a connect, a saved list). */
const changes = new EventTarget();
const announce = (): void => {
  changes.dispatchEvent(new Event("change"));
};

/** mdi:server (Floor planners) */
const serverIcon =
  "M4,1H20A1,1 0 0,1 21,2V6A1,1 0 0,1 20,7H4A1,1 0 0,1 3,6V2A1,1 0 0,1 4,1M4,9H20A1,1 0 0,1 21,10V14A1,1 0 0,1 20,15H4A1,1 0 0,1 3,14V10A1,1 0 0,1 4,9M4,17H20A1,1 0 0,1 21,18V22A1,1 0 0,1 20,23H4A1,1 0 0,1 3,22V18A1,1 0 0,1 4,17M9,5H10V3H9V5M9,13H10V11H9V13M9,21H10V19H9V21M5,3V5H7V3H5M5,11V13H7V11H5M5,19V21H7V19H5Z";
/** mdi:star (the default floor planner) */
const starIcon =
  "M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z";
/** mdi:plus (add a floor planner) */
const plusIcon = "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z";
/** mdi:home (House: the shown house's settings) */
const houseIcon = "M10,20V14H14V20H19V12H22L12,2L2,12H5V20H10Z";
/** mdi:tune (the dev harness's Setup HA tab, 21.18). */
const setupHaIcon =
  "M3,17V19H9V17H3M3,5V7H13V5H3M13,21V19H21V17H13V15H11V21H13M7,9V11H3V13H7V15H9V9H7M21,13V11H11V13H21M15,9H17V7H21V5H17V3H15V9Z";
/** mdi:home-city (Houses) */
const housesIcon =
  "M0,21V10L7.5,5L15,10V21H10V14H5V21H0M24,2V21H17V8.93L16,8.27V6H14V6.93L10,4.27V2H24M21,14H19V16H21V14M21,10H19V12H21V10M21,6H19V8H21V6Z";
/** mdi:monitor (Panels) */
const panelsIcon =
  "M21,16H3V4H21M21,2H3C1.89,2 1,2.89 1,4V16A2,2 0 0,0 3,18H10V20H8V22H16V20H14V18H21A2,2 0 0,0 23,16V4C23,2.89 22.1,2 21,2Z";

const icon = (path: string): TemplateResult =>
  html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d=${path}></path></svg>`;

const pageTitles: Readonly<Record<SettingsPage, string>> = {
  floorPlanners: "Floor planners",
  houses: "Houses",
  panels: "Panels",
};

export class HomeplanConnectionSettings extends LitElement {
  static override properties: PropertyDeclarations = {
    client: { attribute: false },
    selectedId: { attribute: false },
    guard: { attribute: false },
    view: { attribute: false },
    activePage: { attribute: false },
    planner: { attribute: false },
    houseAvailable: { attribute: false },
    store: { attribute: false },
    setupHa: { attribute: false },
  };
  static override styles = [
    tokens,
    fieldStyles,
    css`
      :host {
        display: grid;
        gap: 20px;
        min-width: 0;
      }
      :host([data-view="footer"]) {
        display: flex;
        gap: 4px;
      }
      section {
        display: grid;
        gap: 8px;
        min-width: 0;
      }
      h3 {
        margin: 8px 0 0;
        font-size: 15px;
        font-weight: 500;
      }
      input[type="url"] {
        width: 100%;
      }
      label.toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        color: var(--hp-text);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .list {
        display: grid;
        border-top: 1px solid var(--hp-divider);
      }
      .row {
        display: grid;
        gap: 4px;
        padding: 12px 0;
        border-bottom: 1px solid var(--hp-divider);
      }
      .row-name {
        font-weight: 500;
        overflow-wrap: anywhere;
      }
      .row[data-selected] .row-name {
        color: var(--hp-accent);
      }
      .status {
        font-size: 13px;
      }
      .status:empty {
        display: none;
      }
      .text-button:disabled,
      .page:disabled {
        opacity: 0.4;
        cursor: default;
      }
      a.text-button {
        text-decoration: none;
      }
      /* The Floor planners tree matches the House tree (bindingEditor.ts): rows, icons, the selected tint. */
      :host([data-view="plannerList"]) {
        display: grid;
        gap: 2px;
      }
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 48px;
        padding: 4px 4px 4px 8px;
      }
      .toolbar-title {
        font-weight: 500;
      }
      .icon-button {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: var(--hp-muted);
        cursor: pointer;
      }
      .icon-button:hover {
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.04));
      }
      .icon-button svg {
        width: 20px;
        height: 20px;
        fill: currentColor;
      }
      .item {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        padding: 6px 8px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--hp-text);
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .item:hover {
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.04));
      }
      .item[data-selected] {
        background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.14);
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
        fill: var(--hp-muted);
      }
      .link[data-default] svg {
        fill: var(--hp-accent);
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
      .area {
        font-size: 12px;
        color: var(--hp-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      input.file {
        display: none;
      }
      .page {
        position: relative;
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: var(--hp-muted);
        cursor: pointer;
      }
      .page[data-active] {
        color: var(--hp-accent);
        background: var(--hp-hover, rgba(127, 127, 127, 0.12));
      }
      .page svg {
        width: 22px;
        height: 22px;
        fill: currentColor;
      }
      .page .dot {
        position: absolute;
        right: 7px;
        bottom: 7px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        border: 2px solid var(--hp-surface, #fff);
        background: var(--hp-muted);
      }
      .page .dot[data-state="connected"] {
        background: var(--success-color, #43a047);
      }
      .page .dot[data-state="failed"] {
        background: var(--warning-color, #ffa600);
      }
    `,
  ];
  declare client: IntegrationClient | undefined;
  declare selectedId: string | null;
  declare guard: (() => Promise<boolean>) | undefined;
  declare view: ConnectionView;
  declare activePage: SettingsTab | null;
  /** The selected floor planner on the Floor planners tab: its URL, "new" (add one), or null (the default). */
  declare planner: string | null;
  /** Whether a house is shown, so the House tab can open. */
  declare houseAvailable: boolean;
  /** Home Assistant's state, for ha-form's own controls. */
  declare store: HassStore | undefined;
  /** The footer offers Setup HA after House (the dev harness's fake HA, 21.18); without a client, only those two. */
  declare setupHa: boolean;
  /** Whether HA's ha-form is available (inside Home Assistant), so fields use HA's own controls. */
  private haForm = false;
  /** The Homeplan app's address while discovery announces it: that floor planner cannot be deleted. */
  private discoveredUrl: string | null = null;
  /** An uploaded archive waiting for Replace (Home Assistant already has a copy of that house). */
  private pendingArchive: Blob | null = null;
  /** The other floor planners' houses (read only), by URL; a string is the error. */
  private otherHouses = new Map<string, readonly HouseCardValue[] | string>();
  private connection: ConnectionValue = {
    builderUrl: null,
    devMode: false,
    generation: 0,
    origin: null,
    servers: [],
  };
  private urlDraft = "";
  private remoteHouses: readonly HouseCardValue[] = [];
  private localHouses: readonly HouseCardValue[] = [];
  private copies = new Map<string, CopyMetadataValue>();
  private sourceStatuses = new Map<string, SourceStatusValue | string>();
  private offer: FrontendManifestValue | null = null;
  /** With no URL yet: this browser's computer as the builder (its IP as HA sees it, the builder's dev port). */
  private proposal: string | null = null;
  private frontend: FrontendState | null = null;
  private busy = false;
  private error: string | null = null;
  private message = "";
  private job: IntegrationJobValue | null = null;
  private reloadRequired = false;
  private alive = false;
  private pending: Promise<void> = Promise.resolve();
  /** Whether the shown houses come from memory, and how current they are (15.12). */
  private memoryState: MemoryState | null = null;
  private refreshing = false;
  /** This device's renderer choice being edited on the Panels page (21.11), applied with a reload. */
  private renderers: readonly ViewerRenderer[] = [];
  private rendererId = "";
  private rendererSettings: Record<string, number> = {};
  private readonly onChange = (): void => {
    void this.perform(() => this.refresh(), false);
  };

  constructor() {
    super();
    this.selectedId = null;
    this.view = "houses";
    this.activePage = null;
    this.planner = null;
    this.houseAvailable = false;
    this.setupHa = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.alive = true;
    changes.addEventListener("change", this.onChange);
    if (this.view !== "footer" && this.view !== "plannerList")
      void loadHaForm().then((available) => {
        this.haForm = available;
        this.requestUpdate();
      });
    void this.initialize();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.alive = false;
    changes.removeEventListener("change", this.onChange);
  }
  protected override willUpdate(): void {
    this.dataset.view = this.view;
    // The Panels tab may reuse an element first shown as another page: its renderer list is read when it shows.
    if (this.view === "panels" && this.renderers.length === 0) {
      this.renderers = availableRenderers();
      const current = deviceRenderer();
      this.rendererId = current.id;
      this.rendererSettings = { ...current.currentSettings() };
    }
    if (this.view === "houses" && this.otherHouses.size === 0 && this.connection.servers.length > 0)
      void this.loadOtherHouses();
  }
  /** Shows the remembered result at once; a result for another URL or source generation is dropped. */
  private applyRemembered(): void {
    const client = this.client;
    const view = client === undefined ? undefined : remembered.view(client);
    if (client === undefined || view === undefined) {
      this.memoryState = null;
      return;
    }
    const { value } = view;
    if (value.builderUrl !== this.connection.builderUrl || value.generation !== this.connection.generation) {
      remembered.forget(client);
      this.memoryState = null;
      return;
    }
    this.remoteHouses = value.houses;
    this.offer = value.offer;
    this.sourceStatuses = new Map(value.statuses);
    this.memoryState = view.state;
  }
  private remember(): void {
    if (this.client === undefined) return;
    remembered.remember(this.client, {
      builderUrl: this.connection.builderUrl,
      generation: this.connection.generation,
      houses: this.remoteHouses,
      offer: this.offer,
      statuses: [...this.sourceStatuses],
    });
    this.memoryState = "connected";
  }
  /**
   * When Settings opens (the footer view): connect to the default floor planner without blocking, the first time
   * too, and again on every opening after a success (15.12); not when no floor planner is saved.
   */
  private async backgroundRefresh(): Promise<void> {
    const client = this.client;
    if (client === undefined || this.connection.builderUrl === null || this.busy || this.refreshing) return;
    if (remembered.view(client) !== undefined && !remembered.autoRefresh(client)) return;
    this.refreshing = true;
    this.requestUpdate();
    try {
      const state = await client.connection();
      const result = await client.connect(state.revision);
      if (!this.alive || result.generation !== this.connection.generation) return;
      this.remoteHouses = result.houses;
      this.offer = result.frontendOffer;
      await this.checkSources();
      this.remember();
      announce();
    } catch {
      remembered.markFailed(client);
      this.memoryState = remembered.view(client)?.state ?? "notRefreshed";
      announce();
    } finally {
      this.refreshing = false;
      this.requestUpdate();
    }
  }
  private async initialize(): Promise<void> {
    await this.perform(async () => {
      await this.refresh();
      if (this.view === "footer") return;
      const jobs = await this.client?.jobs();
      const active = jobs?.jobs.find((job) => job.status === "pending" || job.status === "running");
      if (active !== undefined) {
        await this.track(active);
        await this.changed(active.houseId);
      }
    });
    if (this.view === "footer") void this.backgroundRefresh();
  }
  private async refresh(): Promise<void> {
    if (this.client === undefined) return;
    const [state, config, frontend] = await Promise.all([
      this.client.connection(),
      this.client.config(),
      this.client.frontend(),
    ]);
    this.connection = state.connection;
    this.discoveredUrl = state.discoveredUrl;
    this.urlDraft = state.connection.builderUrl ?? "";
    this.copies = new Map(Object.entries(config.configuration.houses));
    this.frontend = frontend;
    const { HouseListResponse } = await import("@shared/contracts/houses");
    this.localHouses = (await this.client.request(HouseListResponse, ["houses"])).houses;
    this.applyRemembered();
    if (state.connection.builderUrl === null && this.proposal === null && this.view === "floorPlanners") {
      try {
        this.proposal = builderUrlFor((await this.client.clientAddress()).address);
      } catch {
        // Only a convenience: without it the URL is typed.
      }
    }
    this.requestUpdate();
  }
  private perform(action: () => Promise<void>, clearMessage = true): Promise<void> {
    const next = this.pending.then(async () => {
      if (!this.alive) return;
      this.busy = true;
      this.error = null;
      if (clearMessage) this.message = "";
      this.requestUpdate();
      try {
        await action();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "The operation failed.";
      } finally {
        this.busy = false;
        this.requestUpdate();
      }
    });
    this.pending = next;
    return next;
  }
  private async allowed(): Promise<boolean> {
    return this.guard === undefined || (await this.guard());
  }
  /** One connection edit, refused when the settings changed elsewhere; a new source drops what was found. */
  private async saveConnection(
    patch: Readonly<{ builderUrl?: string | null; devMode?: boolean; servers?: readonly string[] }>,
  ): Promise<void> {
    if (this.client === undefined) return;
    const current = await this.client.connection();
    if (JSON.stringify(current.connection) !== JSON.stringify(this.connection))
      throw new Error("Connection settings changed elsewhere. Reopen Settings and try again.");
    const { servers, ...rest } = patch;
    const saved = await this.client.saveConnection(current.revision, {
      ...rest,
      ...(servers === undefined ? {} : { servers: [...servers] }),
    });
    if (this.connection.generation !== saved.connection.generation) {
      this.remoteHouses = [];
      this.sourceStatuses.clear();
      this.offer = null;
      this.memoryState = null;
      remembered.forget(this.client);
    }
    this.dispatchEvent(
      new CustomEvent("configuration-advanced", {
        detail: { previous: current.revision, next: saved.revision },
        bubbles: true,
        composed: true,
      }),
    );
    this.connection = saved.connection;
    this.urlDraft = saved.connection.builderUrl ?? "";
  }
  private async connect(): Promise<void> {
    if (this.client === undefined) return;
    const state = await this.client.connection();
    if (state.connection.generation !== this.connection.generation)
      throw new Error("The default floor planner changed. Reopen Settings and connect again.");
    let result;
    try {
      result = await this.client.connect(state.revision);
    } catch (error) {
      remembered.markFailed(this.client);
      if (this.memoryState !== null) this.memoryState = "notRefreshed";
      announce();
      throw error;
    }
    if (result.generation !== state.connection.generation || !this.alive) return;
    this.connection = state.connection;
    this.remoteHouses = result.houses;
    this.offer = result.frontendOffer;
    await this.checkSources();
    this.remember();
    announce();
    this.message =
      result.houses.length === 0
        ? "Connected. It has no houses yet."
        : "Connected. Its houses are under Houses.";
  }
  /** Adds a floor planner; the first one becomes the default and connects. */
  private async addPlanner(url: string): Promise<void> {
    const trimmed = url.trim();
    if (trimmed === "" || !(await this.allowed())) return;
    if (this.connection.builderUrl === null) {
      await this.saveConnection({ builderUrl: trimmed });
      await this.connect();
    } else await this.saveConnection({ servers: [...this.connection.servers, trimmed] });
    this.urlDraft = "";
    this.message ||= "Floor planner added.";
    announce();
  }
  /** Makes a listed floor planner the default (the previous default stays listed) and connects to it. */
  private async makeDefault(url: string): Promise<void> {
    if (!(await this.allowed())) return;
    await this.saveConnection({ builderUrl: url });
    announce();
    await this.connect();
  }
  /** Deletes a floor planner; deleting the default makes the next one the default (or leaves none). */
  private async removePlanner(url: string): Promise<void> {
    if (!(await this.allowed())) return;
    const rest = this.connection.servers.filter((server) => server !== url);
    if (url === this.connection.builderUrl) {
      const [next = null, ...others] = rest;
      await this.saveConnection({ builderUrl: next, servers: others });
    } else await this.saveConnection({ servers: rest });
    this.otherHouses.delete(url);
    this.message = "Floor planner deleted.";
    this.selectPlanner(null);
    announce();
  }
  /** Reads a floor planner that is not the default: reachable, and how many houses it has. */
  private async checkPlanner(url: string): Promise<void> {
    if (this.client === undefined) return;
    const result = await this.client.peek(url);
    this.otherHouses.set(url, result.houses);
    this.message = `Reachable · ${String(result.houses.length)} ${result.houses.length === 1 ? "house" : "houses"}.`;
  }
  /** The other floor planners' houses, read in the background (Houses tab). */
  private async loadOtherHouses(): Promise<void> {
    const client = this.client;
    if (client === undefined) return;
    for (const url of this.connection.servers) this.otherHouses.set(url, []);
    await Promise.all(
      this.connection.servers.map(async (url) => {
        try {
          this.otherHouses.set(url, (await client.peek(url)).houses);
        } catch (error) {
          this.otherHouses.set(url, error instanceof Error ? error.message : "Floor planner unavailable.");
        }
        this.requestUpdate();
      }),
    );
  }
  private async removeCopy(houseId: string): Promise<void> {
    if (this.client === undefined || !(await this.allowed())) return;
    await this.client.removeCopy(houseId);
    this.message = "Copy removed.";
    await this.refresh();
    announce();
  }
  /** Saves Home Assistant's copy of a house as a house archive (.zip) in the browser's downloads. */
  private async download(houseId: string, name: string): Promise<void> {
    if (this.client === undefined) return;
    const blob = await this.client.houseArchive(houseId);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${name.replace(/[\\/:*?"<>|]+/g, "-").trim() || houseId}.zip`;
    link.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(link.href);
    }, 60000);
    this.message = "House archive downloaded.";
  }
  /** Uploads a house archive; a conflict with an existing copy waits for Replace. */
  private async upload(archive: Blob, replace: boolean): Promise<void> {
    if (this.client === undefined || !(await this.allowed())) return;
    try {
      const result = await this.client.importArchive(archive, replace);
      this.pendingArchive = null;
      this.message =
        result.outcome === "unchanged"
          ? "That copy is already in Home Assistant."
          : result.outcome === "upgraded"
            ? "The copy was replaced from the archive."
            : "House added from the archive. Choose Use this house to show it.";
      await this.changed(result.houseId);
    } catch (error) {
      if (error instanceof SourceError && error.status === 409) {
        this.pendingArchive = archive;
        return;
      }
      throw error;
    }
  }
  /** Uses a house from another floor planner: that floor planner becomes the default first. */
  private async useFrom(url: string, houseId: string): Promise<void> {
    if (!(await this.allowed())) return;
    await this.saveConnection({ builderUrl: url });
    announce();
    await this.connect();
    await this.use(houseId);
    this.otherHouses.clear();
  }
  private selectPlanner(url: string | null): void {
    this.dispatchEvent(new CustomEvent("planner-select", { detail: url, bubbles: true, composed: true }));
  }
  private async checkSources(): Promise<void> {
    const client = this.client;
    if (client === undefined) return;
    const houses = [
      ...new Map([...this.localHouses, ...this.remoteHouses].map((house) => [house.id, house])).values(),
    ];
    for (let index = 0; index < houses.length; index += 4) {
      await Promise.all(
        houses.slice(index, index + 4).map(async (house) => {
          try {
            this.sourceStatuses.set(house.id, await client.sourceStatus(house.id));
          } catch (error) {
            this.sourceStatuses.set(
              house.id,
              error instanceof Error ? error.message : "Floor planner unavailable.",
            );
          }
        }),
      );
    }
  }
  private async toggleDev(next: boolean): Promise<void> {
    if (!(await this.allowed())) return;
    await this.saveConnection({ devMode: next });
    this.reloadRequired = true;
    this.message = "DEV MODE saved. Reload the page to switch panel code and house transport together.";
  }
  private async track(initial: IntegrationJobValue): Promise<void> {
    if (this.client === undefined) return;
    this.job = initial;
    this.requestUpdate();
    while (this.alive && (this.job.status === "pending" || this.job.status === "running")) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 1000);
      });
      if (!this.isConnected) return;
      this.job = (await this.client.job(initial.id)).job;
      this.requestUpdate();
    }
    if (this.job.status === "failed" || this.job.status === "canceled")
      throw new Error(
        this.job.error?.message ??
          (this.job.kind === "panelUpgrade"
            ? "The panel download was canceled; the current panel is unchanged."
            : "The upgrade was canceled; the previous local copy is unchanged."),
      );
    this.message =
      this.job.outcome === "unchanged"
        ? "Already up to date."
        : this.job.kind === "panelUpgrade"
          ? "Panel downloaded and checked."
          : "Verified local copy upgraded.";
  }
  private async changed(houseId: string | null, selection = false): Promise<void> {
    await this.refresh();
    announce();
    this.dispatchEvent(
      new CustomEvent("house-loaded", { detail: { houseId, selection }, bubbles: true, composed: true }),
    );
  }
  private async use(houseId: string): Promise<void> {
    if (this.client === undefined || !(await this.allowed())) return;
    const state = await this.client.connection();
    if (state.connection.generation !== this.connection.generation)
      throw new Error("The default floor planner changed. Reopen Settings and connect again.");
    const result = await this.client.useHouse(houseId, state.revision, state.connection.generation);
    if ("job" in result) await this.track(result.job);
    await this.changed(houseId, true);
  }
  private async upgrade(houseId: string): Promise<void> {
    if (this.client === undefined || !(await this.allowed())) return;
    const state = await this.client.connection();
    if (state.connection.generation !== this.connection.generation)
      throw new Error("The default floor planner changed. Connect again before upgrading.");
    const status = this.sourceStatuses.get(houseId);
    await this.track(
      (
        await this.client.upgradeHouse(
          houseId,
          state.connection.generation,
          typeof status === "object" ? status.sourceRevisionId : undefined,
        )
      ).job,
    );
    await this.checkSources();
    await this.changed(houseId);
  }
  private async upgradePanel(): Promise<void> {
    if (this.client === undefined || !(await this.allowed())) return;
    const state = await this.client.connection();
    await this.track((await this.client.upgradeFrontend(state.connection.generation)).job);
    this.reloadRequired = true;
    this.message = "Panel downloaded. Reload the page to use it.";
    await this.refresh();
  }
  private async usePrevious(): Promise<void> {
    if (this.client === undefined || !(await this.allowed())) return;
    const state = await this.client.connection();
    await this.client.usePreviousFrontend(state.revision);
    this.reloadRequired = true;
    this.message = "Back to the previous panel. Reload the page to use it.";
    await this.refresh();
  }
  private async useShipped(): Promise<void> {
    if (this.client === undefined || !(await this.allowed())) return;
    const state = await this.client.connection();
    await this.client.restoreFrontend(state.revision);
    this.reloadRequired = true;
    this.message = "Back to the panel shipped with the integration. Reload the page to use it.";
    await this.refresh();
  }
  private openPage(page: SettingsTab): void {
    this.dispatchEvent(new CustomEvent("settings-page", { detail: page, bubbles: true, composed: true }));
  }

  // ---- rendering ----------------------------------------------------------------------------------------------

  private connectedState(): "connected" | "failed" | "none" {
    if (this.connection.builderUrl === null) return "none";
    if (this.memoryState === "connected") return "connected";
    return this.memoryState === null && this.refreshing ? "none" : "failed";
  }
  private renderFooter(): TemplateResult {
    const state = this.connectedState();
    const housesReady = state === "connected" || this.localHouses.length > 0;
    const plannerTitle =
      state === "connected"
        ? "Floor planners · connected"
        : state === "failed"
          ? "Floor planners · not connected"
          : "Floor planners";
    return html`<button
        class="page"
        title=${this.houseAvailable ? "House" : "House · choose a house first"}
        aria-label="House"
        ?disabled=${!this.houseAvailable}
        ?data-active=${this.activePage === "house"}
        @click=${() => {
          this.openPage("house");
        }}
      >
        ${icon(houseIcon)}
      </button>
      ${
        this.setupHa
          ? html`<button
              class="page"
              title="Setup HA"
              aria-label="Setup HA"
              ?data-active=${this.activePage === "setupHa"}
              @click=${() => {
                this.openPage("setupHa");
              }}
            >
              ${icon(setupHaIcon)}
            </button>`
          : nothing
      }
      ${this.client === undefined ? nothing : this.renderConnectionTabs(state, housesReady, plannerTitle)}`;
  }
  private renderConnectionTabs(
    state: "connected" | "failed" | "none",
    housesReady: boolean,
    plannerTitle: string,
  ): TemplateResult {
    return html`<button
        class="page"
        title=${plannerTitle}
        aria-label=${plannerTitle}
        ?data-active=${this.activePage === "floorPlanners"}
        @click=${() => {
          this.openPage("floorPlanners");
        }}
      >
        ${icon(serverIcon)}<span class="dot" data-state=${state}></span>
      </button>
      <button
        class="page"
        title=${housesReady ? "Houses" : "Houses · connect a floor planner first"}
        aria-label="Houses"
        ?disabled=${!housesReady}
        ?data-active=${this.activePage === "houses"}
        @click=${() => {
          this.openPage("houses");
        }}
      >
        ${icon(housesIcon)}
      </button>
      <button
        class="page"
        title="Panels"
        aria-label="Panels"
        ?data-active=${this.activePage === "panels"}
        @click=${() => {
          this.openPage("panels");
        }}
      >
        ${icon(panelsIcon)}
      </button>`;
  }
  private renderFeedback(): TemplateResult {
    return html`<div class="status" role="status">${this.message}</div>
      ${this.error === null ? nothing : html`<span class="error" role="alert">${this.error}</span>`}`;
  }
  private renderMemory(): TemplateResult | typeof nothing {
    if (this.connection.builderUrl === null) return nothing;
    const text =
      this.memoryState === null
        ? this.refreshing
          ? "Connecting…"
          : "Not connected"
        : this.memoryState === "connected"
          ? this.refreshing
            ? "Connected · refreshing…"
            : "Connected"
          : this.memoryState === "notRefreshed"
            ? "Not refreshed · showing the last result"
            : this.refreshing
              ? "Not connected · refreshing…"
              : "Not connected · showing the last result (older than 15 minutes)";
    return html`<span class="hint" role="status">${text}</span>`;
  }
  private renderOpen(url: string, label = "Open"): TemplateResult {
    return html`<a class="text-button" href=${plannerPage(url)} target="_blank" rel="noopener noreferrer"
      >${label}</a
    >`;
  }
  /**
   * The default floor planner is the Homeplan app (found by discovery, or its address typed in): not a dev Floor
   * Builder, so no DEV MODE (owner), unless it is on already, so it can be turned off.
   */
  private devModeHidden(): boolean {
    const url = this.connection.builderUrl;
    const app =
      this.connection.origin === "discovered" ||
      (url !== null && (url === this.discoveredUrl || isAppPlanner(url)));
    return app && !this.connection.devMode;
  }
  private renderDevToggle(): TemplateResult {
    return html`${this.field(
        "devMode",
        "DEV MODE",
        { boolean: {} },
        this.connection.devMode,
        (value) => {
          if (typeof value === "boolean" && value !== this.connection.devMode)
            void this.perform(() => this.toggleDev(value));
        },
        html`<label class="toggle"
          ><input
            type="checkbox"
            .checked=${this.connection.devMode}
            ?disabled=${this.busy}
            @change=${(event: Event) => {
              if (event.target instanceof HTMLInputElement) {
                const enabled = event.target.checked;
                void this.perform(() => this.toggleDev(enabled));
              }
            }}
          />DEV MODE</label
        >`,
      )}
      <span class="hint">
        Loads the panel code and the house's current (unsaved) state from the default floor planner on every
        page load. Off uses the copies stored in Home Assistant. Takes effect after a page reload.
      </span>`;
  }
  /**
   * One field: HA's own control (ha-form with a selector, like the House settings) inside Home Assistant, else the
   * plain fallback (the harness).
   */
  private field(
    name: string,
    label: string,
    selector: Readonly<Record<string, unknown>>,
    value: unknown,
    apply: (value: unknown) => void,
    fallback: TemplateResult,
  ): TemplateResult {
    return this.haForm
      ? html`<ha-form
          .hass=${this.store?.current()}
          .data=${{ [name]: value }}
          .schema=${[{ name, selector }]}
          .computeLabel=${() => label}
          @value-changed=${(event: Event) => {
            const form = formValue(event);
            if (form !== null) apply(form[name]);
          }}
        ></ha-form>`
      : fallback;
  }
  private plannerUrls(): string[] {
    const builderUrl = this.connection.builderUrl;
    return [...(builderUrl === null ? [] : [builderUrl]), ...this.connection.servers];
  }
  /** The selected floor planner: "new", or a listed URL (the default when none is chosen). */
  private selectedPlanner(): string {
    const urls = this.plannerUrls();
    if (this.planner === "new" || urls.length === 0) return "new";
    return this.planner !== null && urls.includes(this.planner) ? this.planner : (urls[0] ?? "new");
  }
  /** The Floor planners tab's tree: every floor planner (the default starred) and + to add one. */
  private renderPlannerList(): TemplateResult {
    const selected = this.selectedPlanner();
    return html`<div class="toolbar">
        <span class="toolbar-title">Floor planners</span>
        <button
          class="icon-button"
          title="Add a floor planner"
          aria-label="Add a floor planner"
          @click=${() => {
            this.selectPlanner("new");
          }}
        >
          ${icon(plusIcon)}
        </button>
      </div>
      ${this.plannerUrls().map((url) => {
        const isDefault = url === this.connection.builderUrl;
        return html`<button
          class="item"
          ?data-selected=${selected === url}
          aria-current=${selected === url ? "true" : "false"}
          @click=${() => {
            this.selectPlanner(url);
          }}
        >
          <span class="link" ?data-default=${isDefault} title=${isDefault ? "Default" : ""}
            >${icon(isDefault ? starIcon : serverIcon)}</span
          >
          <span class="names">
            <span class="name">${plannerName(url)}</span>
            <span class="area"
              >${isDefault ? "Default · " : ""}${url === this.discoveredUrl ? "Found automatically" : hostOf(url)}</span
            >
          </span>
        </button>`;
      })}
      <button
        class="item"
        ?data-selected=${selected === "new"}
        @click=${() => {
          this.selectPlanner("new");
        }}
      >
        <span class="link">${icon(plusIcon)}</span>
        <span class="names"><span class="name">Add a floor planner</span></span>
      </button>`;
  }
  private renderAddPlanner(): TemplateResult {
    return html`<section>
      <h3>Add a floor planner</h3>
      ${this.field(
        "url",
        "Floor planner URL",
        { text: { type: "url" } },
        this.urlDraft,
        (value) => {
          this.urlDraft = typeof value === "string" ? value : "";
        },
        html`<label
          >Floor planner URL<input
            type="url"
            .value=${this.urlDraft}
            placeholder="http://builder-host:5173/"
            ?disabled=${this.busy}
            @input=${(event: Event) => {
              if (event.target instanceof HTMLInputElement) this.urlDraft = event.target.value;
            }}
            @keydown=${(event: KeyboardEvent) => {
              if (event.key === "Enter") void this.perform(() => this.addPlanner(this.urlDraft));
            }}
        /></label>`,
      )}
      <span class="hint">
        Its address as Home Assistant reaches it (not localhost), for example http://builder-host:5173/. The
        first one becomes the default; nothing is copied until you choose a house.
      </span>
      <div class="actions">
        <button
          class="button"
          ?disabled=${this.busy || this.urlDraft.trim() === ""}
          @click=${() => void this.perform(() => this.addPlanner(this.urlDraft))}
        >
          Add
        </button>
        ${
          this.proposal !== null
            ? html`<button
                class="text-button"
                ?disabled=${this.busy}
                @click=${() => {
                  const proposal = this.proposal;
                  if (proposal !== null) void this.perform(() => this.addPlanner(proposal));
                }}
              >
                Use this computer: ${this.proposal}
              </button>`
            : nothing
        }
      </div>
    </section>`;
  }
  private renderFloorPlanners(): TemplateResult {
    const url = this.selectedPlanner();
    if (url === "new") return html`${this.renderFeedback()} ${this.renderAddPlanner()}`;
    const isDefault = url === this.connection.builderUrl;
    const found = url === this.discoveredUrl;
    return html`${this.renderFeedback()}
      <section>
        <h3>${isDefault ? "★ " : ""}${plannerName(url)}</h3>
        <span class="hint">${url}</span>
        ${
          found
            ? html`<span class="hint" data-origin="discovered"
                >Found automatically: the Homeplan app on this Home Assistant. It stays listed while the app
                is installed.</span
              >`
            : nothing
        }
        ${isDefault ? this.renderMemory() : nothing}
        <div class="actions">
          <button
            class="button"
            ?disabled=${this.busy || isDefault}
            title=${isDefault ? "This is the default floor planner" : "Use this floor planner by default"}
            @click=${() => void this.perform(() => this.makeDefault(url))}
          >
            ${isDefault ? "★ Default" : "☆ Make default"}
          </button>
          <button
            class="text-button"
            ?disabled=${this.busy}
            @click=${() => void this.perform(() => (isDefault ? this.connect() : this.checkPlanner(url)))}
          >
            ${this.busy && this.job === null ? "Connecting…" : "Connect"}
          </button>
          ${this.renderOpen(url)}
          <button
            class="text-button"
            ?disabled=${this.busy || found}
            title=${found ? "Remove the Homeplan app in Settings → Apps to remove it here" : "Delete this floor planner"}
            @click=${() => void this.perform(() => this.removePlanner(url))}
          >
            Delete
          </button>
        </div>
        ${
          found
            ? html`<span class="hint">To delete it, remove the Homeplan app (Settings → Apps).</span>`
            : nothing
        }
      </section>
      ${
        isDefault && !this.devModeHidden()
          ? html`<section>
              <h3>Development</h3>
              ${this.renderDevToggle()}
            </section>`
          : nothing
      }
      ${this.renderReload()}`;
  }
  /** Where a copy came from, in words: an archive, the default or another floor planner, or one no longer listed. */
  private sourceLabel(url: string): string {
    if (url === "archive") return "an uploaded house archive";
    if (url === this.connection.builderUrl) return `${plannerName(url)} (the default floor planner)`;
    if (this.connection.servers.includes(url)) return plannerName(url);
    return `${hostOf(url)}, a floor planner no longer listed`;
  }
  /** A copy Home Assistant holds: where it came from, its Save, and what can be done with it. */
  private renderHouse(house: HouseCardValue): TemplateResult {
    const copy = this.copies.get(house.id);
    const selected = this.selectedId === house.id;
    const fromDefault = copy?.sourceUrl === this.connection.builderUrl;
    const source = fromDefault ? this.sourceStatuses.get(house.id) : undefined;
    const listedSource =
      copy !== undefined && copy.sourceUrl !== "archive" && this.connection.servers.includes(copy.sourceUrl)
        ? copy.sourceUrl
        : null;
    return html`<div class="row" ?data-selected=${selected}>
      <span class="row-name"
        >${house.status === "ok" ? house.name : house.id}${selected ? " · Shown" : ""}</span
      >
      ${
        copy === undefined
          ? nothing
          : html`<span class="hint">From ${this.sourceLabel(copy.sourceUrl)}</span>
              <span class="hint"
                >Save of ${new Date(copy.savedAt).toLocaleString()} · copied
                ${new Date(copy.importedAt).toLocaleString()}</span
              >`
      }
      ${
        source === undefined
          ? nothing
          : typeof source === "string"
            ? html`<span class="error">${source}</span>`
            : html`<span class="hint"
                >${
                  source.relation === "same"
                    ? "Up to date with the floor planner"
                    : source.relation === "newer"
                      ? "A newer Save is available: Upgrade"
                      : "A different Save is on the floor planner"
                }</span
              >`
      }
      ${house.status === "invalid" ? html`<span class="error">${house.problem.message}</span>` : nothing}
      <div class="actions">
        <button
          class="button"
          ?disabled=${this.busy || house.status !== "ok" || selected}
          @click=${() => void this.perform(() => this.use(house.id))}
        >
          ${selected ? "Shown" : "Show this house"}
        </button>
        ${
          fromDefault
            ? html`<button
                class="text-button"
                ?disabled=${this.busy}
                @click=${() => void this.perform(() => this.upgrade(house.id))}
              >
                Upgrade
              </button>`
            : listedSource !== null
              ? html`<button
                  class="text-button"
                  ?disabled=${this.busy}
                  title="Upgrades come from where the copy came from"
                  @click=${() => void this.perform(() => this.makeDefault(listedSource))}
                >
                  Make ${plannerName(listedSource)} the default to upgrade
                </button>`
              : nothing
        }
        <button
          class="text-button"
          ?disabled=${this.busy}
          title="Download Home Assistant's copy as a house archive (.zip)"
          @click=${() =>
            void this.perform(() => this.download(house.id, house.status === "ok" ? house.name : house.id))}
        >
          Download
        </button>
        <button
          class="text-button"
          ?disabled=${this.busy || selected}
          title=${selected ? "The shown house cannot be removed" : "Remove Home Assistant's copy"}
          @click=${() => void this.perform(() => this.removeCopy(house.id))}
        >
          Remove copy
        </button>
      </div>
    </div>`;
  }
  /** A house on a floor planner that Home Assistant has no copy of: Use copies it (another planner becomes default). */
  private renderRemoteHouse(house: HouseCardValue, url: string): TemplateResult {
    const isDefault = url === this.connection.builderUrl;
    return html`<div class="row">
      <span class="row-name">${house.status === "ok" ? house.name : house.id}</span>
      ${isDefault ? nothing : html`<span class="hint">Using it makes ${plannerName(url)} the default floor planner.</span>`}
      <div class="actions">
        <button
          class="text-button"
          ?disabled=${this.busy || house.status !== "ok"}
          @click=${() => void this.perform(() => (isDefault ? this.use(house.id) : this.useFrom(url, house.id)))}
        >
          Copy and show
        </button>
      </div>
    </div>`;
  }
  private renderHouses(): TemplateResult {
    const builderUrl = this.connection.builderUrl;
    const copied = this.localHouses.filter((house) => this.copies.has(house.id));
    const copiedIds = new Set(copied.map((house) => house.id));
    const fresh = this.remoteHouses.filter((house) => !copiedIds.has(house.id));
    const transferring =
      this.job !== null && (this.job.status === "pending" || this.job.status === "running");
    // Create your house: the Homeplan app on this Home Assistant, whether or not it is the default floor planner.
    const appPlanner = this.plannerUrls().find(isAppPlanner);
    return html`${this.renderFeedback()}
      <section>
        <h3>Connected floor planner</h3>
        ${
          builderUrl === null
            ? html`<span class="hint">None: add a floor planner to get houses.</span>
                <div class="actions">
                  <button
                    class="text-button"
                    @click=${() => {
                      this.openPage("floorPlanners");
                    }}
                  >
                    Floor planners
                  </button>
                </div>`
            : html`<span class="row-name">★ ${plannerName(builderUrl)} · ${hostOf(builderUrl)}</span>
                ${this.renderMemory()}
                <div class="actions">
                  <button
                    class="text-button"
                    ?disabled=${this.busy}
                    @click=${() => void this.perform(() => this.connect())}
                  >
                    Check again
                  </button>
                  ${this.renderOpen(builderUrl, isAppPlanner(builderUrl) ? "Create or edit a house" : "Open")}
                  <button
                    class="text-button"
                    @click=${() => {
                      this.openPage("floorPlanners");
                    }}
                  >
                    Change
                  </button>
                </div>`
        }
        ${
          transferring && this.job !== null
            ? html`<div class="actions">
                <span class="hint"
                  >Copying · ${this.job.stage ?? ""} · ${this.job.filesDone}/${this.job.filesTotal}
                  files</span
                >
                <button
                  class="text-button"
                  @click=${() => {
                    if (this.client !== undefined && this.job !== null) void this.client.cancel(this.job.id);
                  }}
                >
                  Cancel
                </button>
              </div>`
            : nothing
        }
      </section>
      <section>
        <h3>In Home Assistant</h3>
        <span class="hint"
          >The copies Home Assistant keeps. The viewer shows one of them, even without a floor planner.</span
        >
        ${
          copied.length === 0
            ? html`<span class="hint">None yet.</span>`
            : html`<div class="list">${copied.map((house) => this.renderHouse(house))}</div>`
        }
      </section>
      ${
        builderUrl === null
          ? nothing
          : html`<section>
              <h3>On ${plannerName(builderUrl)}, not copied yet</h3>
              ${
                fresh.length > 0
                  ? html`<div class="list">
                      ${fresh.map((house) => this.renderRemoteHouse(house, builderUrl))}
                    </div>`
                  : this.remoteHouses.length > 0
                    ? html`<span class="hint">Every house on it is in Home Assistant.</span>`
                    : html`<span class="hint"
                        >${this.memoryState === null ? "Not connected." : "No houses."}</span
                      >`
              }
            </section>`
      }
      ${this.connection.servers.map((url) => this.renderOtherHouses(url, copiedIds))}
      ${
        copied.length === 0 && this.remoteHouses.length === 0 && appPlanner !== undefined
          ? html`<section>
              <h3>Create your house</h3>
              <div class="actions">
                <a class="button" href=${plannerPage(appPlanner)} target="_blank" rel="noopener noreferrer"
                  >Create your house</a
                >
              </div>
            </section>`
          : nothing
      }
      ${this.renderUpload()}`;
  }
  private renderUpload(): TemplateResult {
    return html`<section>
      <h3>Upload a house</h3>
      <span class="hint">
        A house archive (.zip) downloaded here or from a Floor Builder becomes a copy in Home Assistant.
      </span>
      <input
        class="file"
        type="file"
        accept=".zip,application/zip"
        @change=${(event: Event) => {
          const input = event.target;
          if (!(input instanceof HTMLInputElement)) return;
          const file = input.files?.[0];
          input.value = "";
          if (file !== undefined) void this.perform(() => this.upload(file, false));
        }}
      />
      <div class="actions">
        <button
          class="button"
          ?disabled=${this.busy}
          @click=${() => {
            const input = this.renderRoot.querySelector("input.file");
            if (input instanceof HTMLInputElement) input.click();
          }}
        >
          Choose a house archive…
        </button>
      </div>
      ${
        this.pendingArchive === null
          ? nothing
          : html`<span class="hint">Home Assistant already has a copy of this house.</span>
              <div class="actions">
                <button
                  class="button"
                  ?disabled=${this.busy}
                  @click=${() => {
                    const archive = this.pendingArchive;
                    if (archive !== null) void this.perform(() => this.upload(archive, true));
                  }}
                >
                  Replace the copy
                </button>
                <button
                  class="text-button"
                  @click=${() => {
                    this.pendingArchive = null;
                    this.requestUpdate();
                  }}
                >
                  Cancel
                </button>
              </div>`
      }
    </section>`;
  }
  /** Another floor planner's houses that Home Assistant has no copy of. */
  private renderOtherHouses(url: string, copiedIds: ReadonlySet<string>): TemplateResult {
    const houses = this.otherHouses.get(url);
    const fresh =
      typeof houses === "string" || houses === undefined
        ? houses
        : houses.filter((house) => !copiedIds.has(house.id));
    return html`<section>
      <h3>On ${plannerName(url)} (${hostOf(url)}), not copied yet</h3>
      ${
        fresh === undefined
          ? nothing
          : typeof fresh === "string"
            ? html`<span class="error">${fresh}</span>`
            : fresh.length === 0
              ? html`<span class="hint">Nothing new.</span>`
              : html`<div class="list">${fresh.map((house) => this.renderRemoteHouse(house, url))}</div>`
      }
    </section>`;
  }
  private renderPanels(): TemplateResult {
    const frontend = this.frontend;
    const running = frontend?.active ?? frontend?.shipped ?? null;
    const integrationVersion = frontend?.shipped.version ?? null;
    const offer = this.offer;
    const needs =
      offer !== null &&
      integrationVersion !== null &&
      newerVersion(offer.minimumIntegrationVersion, integrationVersion)
        ? offer.minimumIntegrationVersion
        : null;
    const runningOffer = offer !== null && running !== null && offer.bundleId === running.bundleId;
    const builderUrl = this.connection.builderUrl;
    return html`${this.renderFeedback()}
      <section>
        <h3>Running</h3>
        <span class="hint">
          ${running === null ? "…" : html`${frontend?.active === null ? "Shipped with the integration" : "Downloaded"} · ${running.version} · ${running.bundleId.slice(0, 10)}`}
        </span>
        ${
          frontend !== null && frontend.active !== null
            ? html`<span class="hint"
                  >Shipped with the integration · ${frontend.shipped.version} ·
                  ${frontend.shipped.bundleId.slice(0, 10)}</span
                >
                <div class="actions">
                  <button
                    class="text-button"
                    ?disabled=${this.busy}
                    @click=${() => void this.perform(() => this.useShipped())}
                  >
                    Use the shipped panel
                  </button>
                </div>`
            : nothing
        }
        ${
          frontend?.previous == null
            ? nothing
            : html`<span class="hint"
                  >Previous panel · ${frontend.previous.version} ·
                  ${frontend.previous.bundleId.slice(0, 10)}</span
                >
                <div class="actions">
                  <button
                    class="text-button"
                    ?disabled=${this.busy}
                    @click=${() => void this.perform(() => this.usePrevious())}
                  >
                    Use the previous panel
                  </button>
                </div>`
        }
      </section>
      <section>
        <h3>From the default floor planner</h3>
        ${
          builderUrl === null
            ? html`<span class="hint">No floor planner yet, so nothing is offered.</span>`
            : offer === null
              ? html`<span class="hint"
                  >${plannerName(builderUrl)} offers no panel, or could not be reached.</span
                >`
              : html`<span class="hint"
                    >${plannerName(builderUrl)} offers ${offer.version} · ${offer.bundleId.slice(0, 10)}</span
                  >
                  ${
                    needs !== null
                      ? html`<span class="error"
                          >It needs integration ${needs} or newer; this Home Assistant has
                          ${integrationVersion}. Update the integration first.</span
                        >`
                      : runningOffer
                        ? html`<span class="hint">This panel is already running.</span>`
                        : nothing
                  }`
        }
        <div class="actions">
          <button
            class="button"
            ?disabled=${this.busy || offer === null || needs !== null || runningOffer}
            @click=${() => void this.perform(() => this.upgradePanel())}
          >
            Upgrade panel
          </button>
          ${
            builderUrl === null
              ? nothing
              : html`<button
                  class="text-button"
                  ?disabled=${this.busy}
                  @click=${() => void this.perform(() => this.connect())}
                >
                  Check again
                </button>`
          }
        </div>
        ${
          this.job !== null && this.job.kind === "panelUpgrade" && this.job.status === "running"
            ? html`<span class="hint"
                >Downloading · ${this.job.stage ?? ""} · ${this.job.filesDone}/${this.job.filesTotal}
                files</span
              >`
            : nothing
        }
      </section>
      ${this.renderDevice()} ${this.renderReload()}`;
  }
  /** This device's renderer (21.11): stored in this browser; any change applies with a reload. */
  private renderDevice(): TemplateResult {
    const chosen = this.renderers.find((renderer) => renderer.id === this.rendererId) ?? this.renderers[0];
    const stored = deviceRenderer();
    const changed =
      chosen !== undefined &&
      (chosen.id !== stored.id ||
        JSON.stringify(this.rendererSettings) !== JSON.stringify(stored.currentSettings()));
    const choose = (id: unknown): void => {
      const next = this.renderers.find((renderer) => renderer.id === id);
      if (next === undefined || next.id === this.rendererId) return;
      this.rendererId = next.id;
      this.rendererSettings = { ...next.currentSettings() };
      this.requestUpdate();
    };
    return html`<section>
      <h3>This device</h3>
      ${this.field(
        "renderer",
        "Renderer",
        {
          select: {
            mode: "dropdown",
            options: this.renderers.map((renderer) => ({ value: renderer.id, label: renderer.label })),
          },
        },
        this.rendererId,
        choose,
        html`<label
          >Renderer<select
            @change=${(event: Event) => {
              if (event.target instanceof HTMLSelectElement) choose(event.target.value);
            }}
          >
            ${this.renderers.map(
              (renderer) =>
                html`<option value=${renderer.id} ?selected=${renderer.id === this.rendererId}>
                  ${renderer.label}
                </option>`,
            )}
          </select></label
        >`,
      )}
      ${
        chosen === undefined
          ? nothing
          : html`<span class="hint">${chosen.description}</span>
              <span class="hint"><strong>Best for:</strong> ${chosen.bestFor}</span>
              <span class="hint"><strong>Trade-offs:</strong> ${chosen.tradeOffs}</span>`
      }
      ${(chosen?.settingsSchema() ?? []).map((setting) => {
        const value = this.rendererSettings[setting.key] ?? setting.defaultValue;
        const scale = setting.percent ? 100 : 1;
        const set = (raw: unknown): void => {
          const number = numberOf(raw);
          if (number === undefined) return;
          this.rendererSettings = { ...this.rendererSettings, [setting.key]: number / scale };
          this.requestUpdate();
        };
        return html`${this.field(
            setting.key,
            setting.label,
            {
              number: {
                min: setting.min * scale,
                max: setting.max * scale,
                step: setting.step * scale,
                mode: "slider",
                ...(setting.percent ? { unit_of_measurement: "%" } : {}),
              },
            },
            Math.round(value * scale * 100) / 100,
            set,
            html`<label
              >${setting.label} · ${String(Math.round(value * scale))}${setting.percent ? " %" : ""}<input
                type="range"
                min=${setting.min * scale}
                max=${setting.max * scale}
                step=${setting.step * scale}
                .value=${String(value * scale)}
                @input=${(event: Event) => {
                  if (event.target instanceof HTMLInputElement) set(event.target.value);
                }}
            /></label>`,
          )} <span class="hint">${setting.hint}</span>`;
      })}
      <span class="hint"
        >Stored in this browser only: each device (a wall tablet, a phone) keeps its own.</span
      >
      <div class="actions">
        <button
          class="button"
          ?disabled=${!changed}
          @click=${() => {
            if (chosen !== undefined && saveDeviceRenderer(chosen.id, this.rendererSettings))
              location.reload();
            else {
              this.error = "This browser does not allow storing the choice.";
              this.requestUpdate();
            }
          }}
        >
          Apply and reload
        </button>
      </div>
    </section>`;
  }
  private renderReload(): TemplateResult | typeof nothing {
    return this.reloadRequired
      ? html`<div class="actions">
          <button
            class="button"
            @click=${() => {
              location.reload();
            }}
          >
            Reload page
          </button>
        </div>`
      : nothing;
  }
  protected override render(): TemplateResult {
    switch (this.view) {
      case "footer":
        return this.renderFooter();
      case "plannerList":
        return this.renderPlannerList();
      case "floorPlanners":
        return this.renderFloorPlanners();
      case "panels":
        return this.renderPanels();
      case "houses":
        return this.renderHouses();
    }
  }
}

/** A settings page's title (the editor pane's heading). */
export const settingsPageTitle = (page: SettingsPage): string => pageTitles[page];

/** The builder's dev server (Vite, port 5173) on the given IP; IPv6 goes in brackets. */
const builderUrlFor = (address: string | null): string | null =>
  address === null ? null : `http://${address.includes(":") ? `[${address}]` : address}:5173/`;

/**
 * A Homeplan app on this Home Assistant: the Supervisor hostname of an app slug (`<repository>_homeplan` becomes
 * `<repository>-homeplan`) on the app's port, as discovery announces it.
 */
const appHost = /^([a-z0-9]+)-homeplan$/;

const parsed = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

const isAppPlanner = (url: string): boolean => {
  const address = parsed(url);
  return address !== null && address.port === "8099" && appHost.test(address.hostname);
};

/**
 * Where Open goes: an app found on this Home Assistant opens as its sidebar page (`/<slug>`, through HA's ingress,
 * since its own address is only reachable inside HA); any other floor planner opens at its address.
 */
const plannerPage = (url: string): string => {
  const address = parsed(url);
  if (address === null || !isAppPlanner(url)) return url;
  return `${window.location.origin}/${address.hostname.replace(/-/g, "_")}`;
};

/** A floor planner's host and port (its tree subtitle). */
const hostOf = (url: string): string => parsed(url)?.host ?? url;

/** A short name for a floor planner: the Homeplan app, or its host and port. */
const plannerName = (url: string): string => {
  if (isAppPlanner(url)) return "Homeplan app";
  const address = parsed(url);
  return address === null ? url : address.host;
};

/** True when version `a` (x.y.z) is newer than `b`. */
const newerVersion = (a: string, b: string): boolean => {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
};
