import { LitElement, css, html, nothing } from "lit";
import type { TemplateResult } from "lit";
import { keyed } from "lit/directives/keyed.js";
import type { HouseDocument } from "@shared/domain/schemas/house";
import { createHassStore } from "./hassStore";
import type { Hass } from "./hassStore";
import type { IntegrationContext } from "./integrationContext";
import type { HouseSource, ViewerSetup } from "./houseSource";
import { createIntegrationHouseSource } from "./integrationSource";
import { HomeplanViewerScreen } from "./viewerScreen";
import { tokens } from "./styles/tokens";

export class HomeplanIntegrationApp extends LitElement {
  static override styles = [
    tokens,
    css`
      :host {
        display: flex;
        width: 100%;
        height: 100dvh;
        min-height: 400px;
        background:
          radial-gradient(ellipse 110% 65% at 50% 105%, #f7f8fb 0, #e2e5eb 68%, transparent 69%),
          linear-gradient(#fff, #dbe1e9);
      }
      :host([data-dark]) {
        background:
          radial-gradient(ellipse 110% 65% at 50% 105%, #1f2530 0, #111820 68%, transparent 69%),
          linear-gradient(#090d15, #263242);
      }
      .scene {
        position: relative;
        flex: 1;
        min-width: 0;
      }
      .empty {
        height: 100%;
        display: grid;
        place-content: center;
        justify-items: center;
        gap: 16px;
        padding: 24px;
      }
      /* Top left (owner): the top right holds the viewer's own buttons (Settings, Edit). */
      .bar {
        position: absolute;
        z-index: 5;
        inset: 12px auto auto 12px;
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        padding: 8px 12px;
        border-radius: 18px;
        background: var(--hp-surface);
        box-shadow: var(--hp-shadow);
        max-width: calc(100% - 24px);
      }
      /* On a phone the viewer's top bar starts with Home Assistant's menu button: the note starts after it. */
      .bar[data-narrow] {
        inset: 12px auto auto 60px;
        max-width: calc(100% - 72px);
      }
      .menu {
        position: absolute;
        inset: 12px auto auto 12px;
        border: 0;
        background: transparent;
        font-size: 20px;
        cursor: pointer;
      }
      .message {
        font-size: 12px;
        max-width: 32rem;
      }
      button {
        cursor: pointer;
      }
      .error {
        color: var(--hp-error);
      }
    `,
  ];
  private readonly store = createHassStore();
  private context: IntegrationContext | null = null;
  private source: HouseSource | null = null;
  private setup: ViewerSetup = { houseId: null, testEntityId: null };
  private document: HouseDocument | null = null;
  /** Settings opened from **Setup your home** before any house exists (only its House node shows). */
  private setupOpen = false;
  private sceneKey = 0;
  private token = 0;
  private error: string | null = null;
  private narrow = false;
  /** A running DEV MODE session lost an asset/data request: the scene stays, marked stale (production-integration.md). */
  private stale = false;
  /** The startup note was closed (until the next page load). */
  private messageClosed = false;
  /** The setup dialog (no house yet) opens on this tab (the startup note's Open settings: Panels). */
  private setupTab: "panels" | undefined = undefined;

  constructor() {
    super();
    // House setup lives in the Settings House node, inside the viewer (or the setup dialog); its events are composed.
    this.addEventListener("configuration-advanced", (event) => {
      if (event instanceof CustomEvent && isRevisionStep(event.detail))
        this.source?.acceptConfigRevision?.(event.detail.previous, event.detail.next);
    });
    this.addEventListener("house-loaded", (event) => {
      if (event instanceof CustomEvent && isHouseLoaded(event.detail))
        void this.selectionChanged(event.detail.houseId, event.detail.selection);
    });
  }

  configure(context: IntegrationContext): void {
    this.context = context;
    this.narrow = context.narrow;
    this.setHass(context.hass);
    this.setup = context.bootstrap.viewer;
    if (this.setup.houseId !== null) void this.loadSelection(this.setup.houseId, false);
    this.requestUpdate();
  }
  setHass(hass: Hass): void {
    const before = this.store.current();
    this.store.set(hass);
    this.toggleAttribute("data-dark", hass.themes?.darkMode === true);
    if (before?.user?.is_admin !== hass.user?.is_admin) this.requestUpdate();
  }
  setNarrow(narrow: boolean): void {
    this.narrow = narrow;
    this.requestUpdate();
  }
  dispose(): void {
    this.token += 1;
    this.source?.dispose?.();
    this.remove();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.token += 1;
    this.source?.dispose?.();
  }
  private viewer(): HomeplanViewerScreen | null {
    const element = this.renderRoot.querySelector("homeplan-viewer-screen");
    return element instanceof HomeplanViewerScreen ? element : null;
  }
  /** Loads the selected house into a new scene; `reopenSettings` puts Settings back on its House node after. */
  private async loadSelection(houseId: string, reopenSettings: boolean): Promise<void> {
    const context = this.context;
    if (context === null) return;
    const token = ++this.token;
    const source = createIntegrationHouseSource(
      context.client,
      context.remote,
      // A failed first load falls back to the local copy; once a scene shows, keep it and mark it stale.
      (error) => {
        if (this.document === null) context.fail(error);
        else this.markStale();
      },
      () => {
        this.markStale();
      },
    );
    try {
      const { document } = await source.loadHouse(houseId);
      const setup = await source.readSetup();
      if (token !== this.token) {
        source.dispose?.();
        return;
      }
      const old = this.source;
      this.source = source;
      this.document = document;
      this.setup = { ...setup, houseId };
      this.setupOpen = false;
      this.sceneKey += 1;
      this.error = null;
      this.stale = false;
      this.requestUpdate();
      await this.updateComplete;
      old?.dispose?.();
      if (reopenSettings) this.viewer()?.openSettings();
    } catch (error) {
      source.dispose?.();
      if (token !== this.token) return;
      this.error = error instanceof Error ? error.message : "Could not load this house.";
      this.requestUpdate();
    }
  }
  private markStale(): void {
    if (this.stale) return;
    this.stale = true;
    this.requestUpdate();
  }
  /** Loads the selected house again after a failure (13.1). */
  private retry(): void {
    const houseId = this.setup.houseId;
    this.error = null;
    this.requestUpdate();
    if (houseId !== null) void this.loadSelection(houseId, false);
  }
  private async selectionChanged(houseId: string | null, selection: boolean): Promise<void> {
    if (this.context === null) return;
    const config = await this.context.client.config();
    const selected = config.configuration.viewer.houseId;
    if (selected === null) return;
    if (selected !== this.setup.houseId || selection || (houseId === selected && !this.context.remote))
      await this.loadSelection(selected, true);
  }
  /** Opens Settings on Panels (the startup note): in the viewer when a house is shown, else the setup dialog. */
  private openPanels(): void {
    this.messageClosed = true;
    const screen = this.renderRoot.querySelector("homeplan-viewer-screen");
    if (screen instanceof HomeplanViewerScreen) screen.openSettings("panels");
    else {
      this.setupTab = "panels";
      this.setupOpen = true;
    }
    this.requestUpdate();
  }

  protected override render(): TemplateResult {
    const context = this.context;
    const admin = this.store.current()?.user?.is_admin === true;
    const message = context === null ? null : context.remote ? "DEV MODE — Remote" : context.message;
    // 13.1: until configured, and while a selected house loads, only the backdrop shows; the Setup button
    // appears only when there is certainly no house, or (for an admin) after a failed load.
    const failed = this.error !== null;
    const noHouse = context !== null && this.setup.houseId === null;
    const setupButton = html`<button
      class="button"
      @click=${() => {
        this.setupOpen = true;
        this.requestUpdate();
      }}
    >
      Setup your home
    </button>`;
    return html`<main class="scene">
      ${
        this.source === null || this.document === null
          ? html`<div class="empty">
              ${
                failed
                  ? html`<p class="error">${this.error}</p>
                      <button
                        class="button"
                        @click=${() => {
                          this.retry();
                        }}
                      >
                        Retry
                      </button>
                      ${admin ? setupButton : nothing}`
                  : noHouse
                    ? admin
                      ? setupButton
                      : html`<span>Ask an HA administrator to set up your home.</span>`
                    : nothing
              }
              ${
                this.narrow
                  ? html`<button
                      class="menu"
                      aria-label="Home Assistant menu"
                      @click=${() => {
                        this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
                      }}
                    >
                      ☰
                    </button>`
                  : nothing
              }
            </div>`
          : keyed(
              this.sceneKey,
              html`<homeplan-viewer-screen
                .store=${this.store}
                .source=${this.source}
                .setup=${this.setup}
                .narrow=${this.narrow}
                .dev=${false}
                .integrationClient=${admin ? context?.client : undefined}
              ></homeplan-viewer-screen>`,
            )
      }
      ${
        this.stale && context?.remote === true
          ? html`<div class="bar" role="status">
              <span class="message error"
                >Development server unavailable — some of this view may be out of date.</span
              >
              <button
                @click=${() => {
                  context.fail(new Error("A development server request failed during the session."));
                }}
              >
                Reload using local copy
              </button>
            </div>`
          : message === null || this.messageClosed
            ? nothing
            : html`<div class="bar" role="status" ?data-narrow=${this.narrow}>
                <span class="message">${message}</span>
                ${
                  context?.remote === true
                    ? html`<button @click=${() => location.reload()}>Retry remote</button>`
                    : admin
                      ? html`<button
                          @click=${() => {
                            this.openPanels();
                          }}
                        >
                          Open settings
                        </button>`
                      : nothing
                }
                <button
                  aria-label="Close"
                  title="Close"
                  @click=${() => {
                    this.messageClosed = true;
                    this.requestUpdate();
                  }}
                >
                  ✕
                </button>
              </div>`
      }
      ${
        this.setupOpen && admin && context !== null && this.document === null
          ? html`<homeplan-binding-editor
              .store=${this.store}
              .houseId=${null}
              .integrationClient=${context.client}
              .initialTab=${this.setupTab}
              @close=${() => {
                this.setupOpen = false;
                this.setupTab = undefined;
                this.requestUpdate();
              }}
            ></homeplan-binding-editor>`
          : nothing
      }
    </main>`;
  }
}

const isRevisionStep = (value: unknown): value is { previous: number; next: number } =>
  typeof value === "object" &&
  value !== null &&
  "previous" in value &&
  typeof value.previous === "number" &&
  "next" in value &&
  typeof value.next === "number";

const isHouseLoaded = (value: unknown): value is { houseId: string | null; selection: boolean } =>
  typeof value === "object" &&
  value !== null &&
  "houseId" in value &&
  (value.houseId === null || typeof value.houseId === "string") &&
  "selection" in value &&
  typeof value.selection === "boolean";
