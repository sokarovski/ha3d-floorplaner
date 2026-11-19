// The room cards (spec/home-assistant/viewer-mvp.md#room-cards): opened beside the zoomed house, they show the cards
// of the room's tab of a Home Assistant dashboard, laid out as the dashboard lays them out, drawn over the 3D view
// with no panel (14.4: like the floor widgets, each card keeps HA's own surface, and only the cards take pointer
// events). The gear in the screen's top bar swaps them for the room settings that need the 3D view: the room's saved
// camera position and, when it has a presence entity, the corners its red light sweeps from (owner 2026-11-17). The
// dashboard, the room's tab, width and title, its bubbles, and its presence entity are set in Settings (Phase 10.9,
// bindingEditor.ts). The cards slide in from their side with the camera's spring and slide out again on close.
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, TemplateResult } from "lit";
import type { HaAreaPresenceValue, HaDashboardValue } from "@shared/domain/schemas/homeAssistant";
import { maxSweepCorners } from "@shared/domain/schemas/homeAssistant";
import { chosenTab, readViews, roomColumns, roomTitleShown, tabForArea } from "./dashboardViews";
import { loadHelpers, resolveCard } from "./dashboardCards";
import type { HassStore } from "./hassStore";
import { slideCurve, slideCurveFallback, slideDuration } from "./styles/slide";
import { tokens } from "./styles/tokens";
import { buildLayout, cardsWidthPx } from "./viewLayout";
import type { BuiltLayout } from "./viewLayout";

export class HomeplanAreaPanel extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    dashboard: { attribute: false },
    houseId: { attribute: false },
    areaId: { attribute: false },
    areaName: { attribute: false },
    haAreaName: { attribute: false },
    presence: { attribute: false },
    picking: { attribute: false },
    open: { attribute: false },
    compact: { attribute: false },
    settings: { attribute: false },
    cards: { attribute: false },
  };

  static override styles = [
    tokens,
    css`
      /*
       * No panel (owner 2026-11-18): only the cards are drawn, each on HA's card surface, and only they take pointer
       * events. Right of the house below the top bar's controls; a bottom sheet on a narrow screen. Away (no room
       * open) it sits off its side, hidden once the slide is over.
       */
      :host {
        position: absolute;
        top: 56px;
        right: 12px;
        bottom: 12px;
        width: min(var(--hp-panel-width, 340px), calc(100% - 24px));
        display: flex;
        flex-direction: column;
        gap: var(--hp-gap);
        pointer-events: none;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: none;
        transform: translateX(calc(100% + 12px));
        visibility: hidden;
        transition:
          transform ${slideDuration} ${slideCurveFallback},
          width 0.25s ease,
          visibility 0s linear ${slideDuration};
        transition:
          transform ${slideDuration} ${slideCurve},
          width 0.25s ease,
          visibility 0s linear ${slideDuration};
      }
      :host([data-compact]) {
        top: 40%;
        left: 12px;
        width: auto;
        transform: translateY(calc(100% + 12px));
      }
      :host([data-open]) {
        transform: none;
        visibility: visible;
        transition:
          transform ${slideDuration} ${slideCurveFallback},
          width 0.25s ease,
          visibility 0s;
        transition:
          transform ${slideDuration} ${slideCurve},
          width 0.25s ease,
          visibility 0s;
      }
      @media (prefers-reduced-motion: reduce) {
        :host,
        :host([data-open]) {
          transition: none;
        }
      }
      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }
      h2 {
        margin: 0;
        padding: 0 4px;
        font-size: 20px;
        font-weight: 500;
      }
      /* The room settings and messages sit on a card surface like the cards around them. */
      .surface {
        pointer-events: auto;
        padding: 16px;
        border-radius: var(--hp-radius);
        background: var(--ha-card-background, var(--hp-surface));
        box-shadow: var(--hp-shadow);
      }
      [hidden] {
        display: none !important;
      }
      .message {
        color: var(--hp-muted);
      }
      .message[data-error] {
        color: var(--hp-error);
      }
      .settings {
        flex: none;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 18px;
        overflow-wrap: anywhere;
      }
      .settings > *,
      ::slotted(*) {
        min-width: 0;
        max-width: 100%;
      }
      h3 {
        margin: 0 0 8px;
        font-size: 14px;
        font-weight: 500;
        color: var(--hp-muted);
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
      }
      .secondary {
        border: none;
        background: transparent;
        padding: 8px 14px;
        cursor: pointer;
        color: var(--hp-accent);
        font-weight: 500;
      }
      .hint {
        color: var(--hp-muted);
        font-size: 13px;
      }
    `,
  ];

  declare store: HassStore | undefined;
  declare dashboard: HaDashboardValue;
  declare houseId: string | null;
  declare areaId: string;
  declare areaName: string;
  /** The name of the HA area paired with the room (or matched), the tab's second name; null when none. */
  declare haAreaName: string | null;
  /** The room's presence / intrusion binding (8.6), or undefined: then there are no sweep corners to choose. */
  declare presence: HaAreaPresenceValue | undefined;
  /** Sweep corners are being chosen by tapping the room in 3D. */
  declare picking: boolean;
  /** A room is open: the cards are shown; false slides them away (keeping the last room's cards meanwhile). */
  declare open: boolean;
  /** A narrow screen (under 700 px): a bottom sheet. */
  declare compact: boolean;
  /** The gear in the top bar is on: the room settings replace the cards. */
  declare settings: boolean;
  /** The room has a tab (15.6): without one no cards are built and no message is shown. */
  declare cards: boolean;
  private message: Readonly<{ text: string; error: boolean }> | null = { text: "Loading…", error: false };
  private mounted = "";
  private unsubscribe: (() => void) | null = null;
  private built: BuiltLayout | null = null;
  private token = 0;
  constructor() {
    super();
    this.dashboard = { urlPath: null, areaTabs: {}, areaViews: {}, areaColumns: {} };
    this.houseId = null;
    this.areaId = "";
    this.areaName = "";
    this.haAreaName = null;
    this.presence = undefined;
    this.picking = false;
    this.open = false;
    this.compact = false;
    this.settings = false;
    this.cards = true;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.token += 1;
    this.mounted = "";
  }

  private fit(): void {
    this.built?.fit(roomColumns(this.dashboard, this.houseId, this.areaId));
  }

  private key(): string {
    const tab = chosenTab(this.dashboard, this.houseId, this.areaId) ?? "";
    return [this.dashboard.urlPath ?? "", tab, this.houseId ?? "", this.areaId, this.haAreaName ?? ""].join(
      "|",
    );
  }

  protected override willUpdate(): void {
    this.style.setProperty(
      "--hp-panel-width",
      `${String(cardsWidthPx(roomColumns(this.dashboard, this.houseId, this.areaId)))}px`,
    );
    this.toggleAttribute("data-compact", this.compact);
  }

  protected override updated(): void {
    if (this.open !== this.hasAttribute("data-open")) {
      // Lay out where the cards are now first, so cards created open still slide in.
      this.getBoundingClientRect();
      this.toggleAttribute("data-open", this.open);
    }
    // Rebuilt only when the room or its tab changes, not when the saved camera does; kept while sliding away.
    this.fit();
    if (this.open && this.cards && this.areaId !== "" && this.key() !== this.mounted) void this.mountCards();
  }

  private show(text: string | null, error = false): void {
    this.message = text === null ? null : { text, error };
    this.requestUpdate();
  }

  /** Reads the dashboard, builds the matching tab's layout with HA's card factory, and feeds the cards `hass`. */
  private async mountCards(): Promise<void> {
    this.mounted = this.key();
    const token = ++this.token;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.built = null;
    const host = this.renderRoot.querySelector(".cards");
    const hass = this.store?.current();
    if (host === null || hass === null || hass === undefined) return;
    host.replaceChildren();
    const urlPath = this.dashboard.urlPath;
    if (urlPath === null) {
      this.show(null);
      return;
    }
    this.show("Loading…");
    try {
      const view = tabForArea(
        await readViews(hass, urlPath),
        chosenTab(this.dashboard, this.houseId, this.areaId),
        this.areaName,
        this.haAreaName,
      );
      if (token !== this.token) return;
      if (view === null) {
        // The hint to choose a tab is in Settings only (15.6); the live view shows nothing.
        console.warn(`[homeplan] dashboard "${urlPath}" has no tab for "${this.areaName}"`);
        this.show(null);
        return;
      }
      const helpers = await loadHelpers();
      const built = await buildLayout(view.layout, (card) => resolveCard(helpers, card));
      if (token !== this.token) return;
      // Only the cards take pointer events; the gaps between them reach the canvas.
      for (const card of built.cards) card.style.pointerEvents = "auto";
      host.replaceChildren(built.root);
      this.built = built;
      this.fit();
      const push = (): void => {
        const current = this.store?.current();
        if (current !== null && current !== undefined)
          for (const card of built.cards) Reflect.set(card, "hass", current);
      };
      push();
      this.unsubscribe = this.store?.subscribeHass(push) ?? null;
      this.show(built.cards.length === 0 ? `The "${this.areaName}" tab has no cards yet.` : null);
    } catch (error) {
      if (token !== this.token) return;
      console.warn(`[homeplan] could not read dashboard "${urlPath}"`, error);
      this.show(null);
    }
  }

  // ---- settings ----------------------------------------------------------------------------------

  /** Which corners the red light sweeps from while the room's presence is active (saved at once). */
  private renderCorners(presence: HaAreaPresenceValue): TemplateResult {
    const corners = presence.corners;
    const summary =
      corners === undefined
        ? "The two corners farthest from the door (opposite corners without a door)."
        : corners.length === 0
          ? "No corners: the room only tints red."
          : `${String(corners.length)} of up to ${String(maxSweepCorners)} corners chosen.`;
    return html`<section>
      <h3>Sweep corners</h3>
      <div class="hint">Where the red light sweeps from while presence or intrusion is active.</div>
      <div class="row">
        <button
          class="button"
          aria-pressed=${String(this.picking)}
          @click=${() => {
            this.dispatchEvent(new CustomEvent<boolean>("corner-picking", { detail: !this.picking }));
          }}
        >
          ${this.picking ? "Done" : "Choose corners"}
        </button>
        ${
          corners === undefined
            ? nothing
            : html`<button
                class="secondary"
                @click=${() => {
                  this.dispatchEvent(new Event("default-corners"));
                }}
              >
                Default corners
              </button>`
        }
      </div>
      <div class="hint">
        ${this.picking ? `Tap near a corner of ${this.areaName}: red markers sweep, white ones do not.` : summary}
      </div>
    </section>`;
  }

  private renderSettings(): TemplateResult {
    const hasView =
      this.houseId !== null && this.dashboard.areaViews[this.houseId]?.[this.areaId] !== undefined;
    return html`
      <div class="settings surface">
        <section>
          <h3>Room position</h3>
          <div class="hint">
            Orbit, zoom (and pan with shift-drag) the house to the view you want, then save it.
          </div>
          <div class="row">
            <button
              class="button"
              @click=${() => {
                this.dispatchEvent(new Event("capture-view"));
              }}
            >
              Use this view as room position
            </button>
            ${
              hasView
                ? html`<button
                    class="secondary"
                    @click=${() => {
                      this.dispatchEvent(new Event("clear-view"));
                    }}
                  >
                    Automatic
                  </button>`
                : nothing
            }
          </div>
          <div class="hint">
            ${hasView ? "A saved position is used." : "The room is framed automatically."}
          </div>
        </section>
        ${this.presence === undefined ? nothing : this.renderCorners(this.presence)}
      </div>
    `;
  }

  protected override render(): TemplateResult {
    return html`
      ${
        this.cards && roomTitleShown(this.dashboard, this.houseId, this.areaId) && this.areaName !== ""
          ? html`<h2>${this.areaName}</h2>`
          : nothing
      }
      ${this.settings ? this.renderSettings() : nothing}
      ${
        this.message === null || this.settings || !this.cards
          ? nothing
          : html`<div class="message surface" ?data-error=${this.message.error}>${this.message.text}</div>`
      }
      <div class="cards" ?hidden=${this.settings}></div>
    `;
  }
}
