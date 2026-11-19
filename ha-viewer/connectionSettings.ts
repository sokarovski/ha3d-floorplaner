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
import { fieldStyles } from "./formHelpers";
import type { IntegrationClient } from "./integrationClient";
import { tokens } from "./styles/tokens";

/** What Connect last found, kept for this browser session (15.12). */
type RememberedConnection = Readonly<{
  builderUrl: string | null;
  generation: number;
  houses: readonly HouseCardValue[];
  offer: FrontendManifestValue | null;
  statuses: readonly (readonly [string, SourceStatusValue | string])[];
}>;

const remembered = createConnectionMemory<IntegrationClient, RememberedConnection>(() => Date.now());

export class HomeplanConnectionSettings extends LitElement {
  static override properties: PropertyDeclarations = {
    client: { attribute: false },
    selectedId: { attribute: false },
    guard: { attribute: false },
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
      section {
        display: grid;
        gap: 8px;
        min-width: 0;
      }
      h3 {
        margin: 0;
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
      .houses {
        display: grid;
        border-top: 1px solid var(--hp-divider);
      }
      .house {
        display: grid;
        gap: 4px;
        padding: 12px 0;
        border-bottom: 1px solid var(--hp-divider);
      }
      .house-name {
        font-weight: 500;
      }
      .house[data-selected] .house-name {
        color: var(--hp-accent);
      }
      .status {
        font-size: 13px;
      }
      .status:empty {
        display: none;
      }
      .text-button:disabled {
        opacity: 0.4;
        cursor: default;
      }
    `,
  ];
  declare client: IntegrationClient | undefined;
  declare selectedId: string | null;
  declare guard: (() => Promise<boolean>) | undefined;
  private connection: ConnectionValue = { builderUrl: null, devMode: false, generation: 0, origin: null };
  private urlDraft = "";
  private remoteHouses: readonly HouseCardValue[] = [];
  private localHouses: readonly HouseCardValue[] = [];
  private copies = new Map<string, CopyMetadataValue>();
  private sourceStatuses = new Map<string, SourceStatusValue | string>();
  private offer: FrontendManifestValue | null = null;
  /** With no URL yet: this browser's computer as the builder (its IP as HA sees it, the builder's dev port). */
  private proposal: string | null = null;
  private localFrontend: FrontendManifestValue | null = null;
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

  override connectedCallback(): void {
    super.connectedCallback();
    this.alive = true;
    void this.initialize();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.alive = false;
  }
  /** Shows the remembered result at once; a result for another URL or source generation is dropped. */
  private applyRemembered(): void {
    const client = this.client;
    const view = client === undefined ? undefined : remembered.view(client);
    if (client === undefined || view === undefined) return;
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
  /** Every opening: refresh the remembered connection without blocking (not when no URL is saved). */
  private async backgroundRefresh(): Promise<void> {
    const client = this.client;
    if (client === undefined || this.connection.builderUrl === null || this.busy || this.refreshing) return;
    if (!remembered.autoRefresh(client)) return;
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
    } catch {
      remembered.markFailed(client);
      if (this.memoryState !== null) this.memoryState = "notRefreshed";
    } finally {
      this.refreshing = false;
      this.requestUpdate();
    }
  }
  private async initialize(): Promise<void> {
    await this.perform(async () => {
      await this.refresh();
      const jobs = await this.client?.jobs();
      const active = jobs?.jobs.find((job) => job.status === "pending" || job.status === "running");
      if (active !== undefined) {
        await this.track(active);
        await this.changed(active.houseId);
      }
      this.applyRemembered();
    });
    void this.backgroundRefresh();
  }
  private async refresh(): Promise<void> {
    if (this.client === undefined) return;
    const [state, config, frontend] = await Promise.all([
      this.client.connection(),
      this.client.config(),
      this.client.frontend(),
    ]);
    const oldUrl = this.connection.builderUrl;
    this.connection = state.connection;
    if (this.urlDraft === "" || this.urlDraft === oldUrl) this.urlDraft = state.connection.builderUrl ?? "";
    this.copies = new Map(Object.entries(config.configuration.houses));
    this.localFrontend = frontend.active ?? frontend.shipped;
    const { HouseListResponse } = await import("@shared/contracts/houses");
    this.localHouses = (await this.client.request(HouseListResponse, ["houses"])).houses;
    if (state.connection.builderUrl === null && this.proposal === null) {
      try {
        this.proposal = builderUrlFor((await this.client.clientAddress()).address);
      } catch {
        // Only a convenience: without it the URL is typed.
      }
    }
    this.requestUpdate();
  }
  private perform(action: () => Promise<void>): Promise<void> {
    const next = this.pending.then(async () => {
      if (!this.alive) return;
      this.busy = true;
      this.error = null;
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
  private async saveUrl(): Promise<void> {
    if (this.client === undefined || this.urlDraft.trim() === (this.connection.builderUrl ?? "")) return;
    if (!(await this.allowed())) return;
    const current = await this.client.connection();
    if (JSON.stringify(current.connection) !== JSON.stringify(this.connection))
      throw new Error("Connection settings changed elsewhere. Reopen House setup and reapply your edit.");
    const saved = await this.client.saveConnection(current.revision, {
      builderUrl: this.urlDraft.trim() || null,
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
    this.message = "URL saved. Press Connect to list houses.";
  }
  private async connect(): Promise<void> {
    await this.saveUrl();
    if (this.client === undefined) return;
    const state = await this.client.connection();
    if (state.connection.generation !== this.connection.generation)
      throw new Error("The source changed. Reopen House setup and Connect again.");
    let result;
    try {
      result = await this.client.connect(state.revision);
    } catch (error) {
      remembered.markFailed(this.client);
      if (this.memoryState !== null) this.memoryState = "notRefreshed";
      throw error;
    }
    if (result.generation !== state.connection.generation || !this.alive) return;
    this.connection = state.connection;
    this.remoteHouses = result.houses;
    this.offer = result.frontendOffer;
    await this.checkSources();
    this.remember();
    this.message =
      result.houses.length === 0 ? "Connected. No houses found." : "Connected. Choose Use this house below.";
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
              error instanceof Error ? error.message : "Builder unavailable.",
            );
          }
        }),
      );
    }
  }
  private async toggleDev(next: boolean): Promise<void> {
    if (this.client === undefined || !(await this.allowed())) return;
    await this.saveUrl();
    const current = await this.client.connection();
    if (JSON.stringify(current.connection) !== JSON.stringify(this.connection))
      throw new Error("Connection settings changed elsewhere. Reopen House setup and reapply your edit.");
    const saved = await this.client.saveConnection(current.revision, { devMode: next });
    this.dispatchEvent(
      new CustomEvent("configuration-advanced", {
        detail: { previous: current.revision, next: saved.revision },
        bubbles: true,
        composed: true,
      }),
    );
    this.connection = saved.connection;
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
        this.job.error?.message ?? "The upgrade was canceled; the previous local copy is unchanged.",
      );
    this.message = this.job.outcome === "unchanged" ? "Already up to date." : "Verified local copy upgraded.";
  }
  private async changed(houseId: string | null, selection = false): Promise<void> {
    await this.refresh();
    this.dispatchEvent(
      new CustomEvent("house-loaded", { detail: { houseId, selection }, bubbles: true, composed: true }),
    );
  }
  private async use(houseId: string): Promise<void> {
    if (this.client === undefined || !(await this.allowed())) return;
    const state = await this.client.connection();
    if (state.connection.generation !== this.connection.generation)
      throw new Error("The source changed. Reopen House setup and Connect again.");
    const result = await this.client.useHouse(houseId, state.revision, state.connection.generation);
    if ("job" in result) await this.track(result.job);
    await this.changed(houseId, true);
  }
  private async upgrade(houseId: string): Promise<void> {
    if (this.client === undefined || !(await this.allowed())) return;
    const state = await this.client.connection();
    if (state.connection.generation !== this.connection.generation)
      throw new Error("The source changed. Connect again before upgrading.");
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
  private renderHouse(house: HouseCardValue): TemplateResult {
    const copy = this.copies.get(house.id);
    const source = this.sourceStatuses.get(house.id);
    const selected = this.selectedId === house.id;
    return html`<div class="house" ?data-selected=${selected}>
      <span class="house-name"
        >${house.status === "ok" ? house.name : house.id}${selected ? " · Shown" : ""}</span
      >
      ${copy === undefined ? html`<span class="hint">No copy in Home Assistant yet.</span>` : html`<span class="hint">Copy of the Save from ${new Date(copy.savedAt).toLocaleString()} · ${copy.sourceRevisionId.slice(0, 10)}</span>`}
      ${source === undefined ? nothing : typeof source === "string" ? html`<span class="error">${source}</span>` : html`<span class="hint">${source.relation === "same" ? "Up to date with the builder" : source.relation === "newer" ? "A newer Save is available" : source.relation === "different" ? "A different Save is available" : "Saved house available"} · ${source.sourceRevisionId.slice(0, 10)}</span>`}
      ${house.status === "invalid" ? html`<span class="error">${house.problem.message}</span>` : nothing}
      <div class="actions">
        <button
          class="button"
          ?disabled=${this.busy || house.status !== "ok" || selected}
          @click=${() => void this.perform(() => this.use(house.id))}
        >
          Use this house
        </button>
        <button
          class="text-button"
          ?disabled=${this.busy || this.connection.builderUrl === null}
          @click=${() => void this.perform(() => this.upgrade(house.id))}
        >
          Upgrade
        </button>
      </div>
    </div>`;
  }
  private renderMemory(): TemplateResult | typeof nothing {
    if (this.memoryState === null) return nothing;
    const text =
      this.memoryState === "connected"
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
  private renderDevToggle(): TemplateResult {
    return html`<label class="toggle"
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
      >
      <span class="hint">
        Loads the panel code and the house's current (unsaved) state from the builder on every page load. Off
        uses the copies stored in Home Assistant. Takes effect after a page reload.
      </span>`;
  }
  protected override render(): TemplateResult {
    const houses = new Map([...this.localHouses, ...this.remoteHouses].map((house) => [house.id, house]));
    const transferring =
      this.job !== null && (this.job.status === "pending" || this.job.status === "running");
    return html`<section>
        <h3>House setup</h3>
        <label
          >Floor Builder URL<input
            type="url"
            .value=${this.urlDraft}
            placeholder="http://builder-host:5173/"
            ?disabled=${this.busy}
            @input=${(event: Event) => {
              if (event.target instanceof HTMLInputElement) this.urlDraft = event.target.value;
            }}
            @change=${() => void this.perform(() => this.saveUrl())}
            @keydown=${(event: KeyboardEvent) => {
              if (event.key === "Enter") void this.perform(() => this.connect());
            }}
        /></label>
        ${
          this.proposal !== null && this.urlDraft.trim() === ""
            ? html`<div class="actions">
                <button
                  class="text-button"
                  ?disabled=${this.busy}
                  @click=${() => {
                    if (this.proposal === null) return;
                    this.urlDraft = this.proposal;
                    void this.perform(() => this.saveUrl());
                  }}
                >
                  Use this computer: ${this.proposal}
                </button>
              </div>`
            : nothing
        }
        ${
          this.connection.origin === "discovered" && this.urlDraft.trim() === this.connection.builderUrl
            ? html`<span class="hint" data-origin="discovered"
                >Found automatically: the Homeplan app on this Home Assistant.</span
              >`
            : nothing
        }
        <span class="hint">
          The builder's address as Home Assistant reaches it (not localhost). Connect lists its houses;
          nothing is copied until Use this house.
        </span>
        <div class="actions">
          <button
            class="button"
            ?disabled=${this.busy || this.urlDraft.trim() === ""}
            @click=${() => void this.perform(() => this.connect())}
          >
            ${this.busy && this.job === null ? "Connecting…" : "Connect"}
          </button>
        </div>
        <div class="status" role="status">${this.message}</div>
        ${this.renderMemory()}
        ${this.error === null ? nothing : html`<span class="error" role="alert">${this.error}</span>`}
      </section>
      <section>
        <h3>Houses</h3>
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
        ${
          houses.size === 0
            ? html`<span class="hint">No houses yet. Enter the Floor Builder URL and press Connect.</span>`
            : html`<div class="houses">${[...houses.values()].map((house) => this.renderHouse(house))}</div>`
        }
      </section>
      <section>
        <h3>Development</h3>
        ${
          this.connection.origin === "discovered" && !this.connection.devMode
            ? html`<span class="hint" data-origin="discovered"
                >DEV MODE is for a Floor Builder running on your own computer.</span
              >`
            : this.renderDevToggle()
        }
      </section>
      <section>
        <h3>Panel</h3>
        <span class="hint">
          This panel ${this.localFrontend?.version ?? "…"} ·
          ${this.localFrontend?.bundleId.slice(0, 10) ?? ""}
          ${this.offer === null ? nothing : html`<br />Builder offers ${this.offer.version} · ${this.offer.bundleId.slice(0, 10)}`}
        </span>
        <div class="actions">
          <button
            class="text-button"
            ?disabled=${this.busy || this.offer === null}
            @click=${() =>
              void this.perform(async () => {
                if (this.client === undefined || !(await this.allowed())) return;
                const state = await this.client.connection();
                await this.track((await this.client.upgradeFrontend(state.connection.generation)).job);
                this.reloadRequired = true;
                this.message = "Panel upgraded. Reload the page to use it.";
                await this.refresh();
              })}
          >
            Upgrade panel
          </button>
          ${this.reloadRequired ? html`<button class="button" @click=${() => location.reload()}>Reload page</button>` : nothing}
        </div>
      </section>`;
  }
}

/** The builder's dev server (Vite, port 5173) on the given IP; IPv6 goes in brackets. */
const builderUrlFor = (address: string | null): string | null =>
  address === null ? null : `http://${address.includes(":") ? `[${address}]` : address}:5173/`;
