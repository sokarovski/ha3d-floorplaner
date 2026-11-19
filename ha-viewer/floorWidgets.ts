// The floor widgets (Phase 13.7; spec/home-assistant/viewer-mvp.md#floor-widgets): the cards of the floor's chosen
// dashboard tab, drawn over the 3D view beside the house the way the room panel draws a room's tab, but with no
// panel: the area is transparent and each card keeps the surface HA gives it. Only the cards take pointer events;
// the gaps pass orbit, pan, zoom, and picking to the canvas. Left or right take 1–2 columns, top or bottom 1–4;
// on a narrow screen (under 700 px) they go below the house in at most 2 columns. While a room is open they slide
// away (14.4: toward the right with the camera's spring; widgets on the left leave by their own side, so they never
// cross the room cards), and the screen frames the house into the space they leave (`widgets-size`).
import { LitElement, css, html } from "lit";
import type { PropertyDeclarations, TemplateResult } from "lit";
import type { HaDashboardValue, HaFloorWidgetPositionValue } from "@shared/domain/schemas/homeAssistant";
import { loadHelpers, resolveCard } from "./dashboardCards";
import { floorColumns, floorPosition, floorTab, readViews } from "./dashboardViews";
import type { HassStore } from "./hassStore";
import { slideCurve, slideCurveFallback, slideDuration } from "./styles/slide";
import { buildLayout, cardsWidthPx } from "./viewLayout";
import type { BuiltLayout } from "./viewLayout";

/** The widget area's box, in CSS pixels; 0 × 0 while no card shows. */
export type WidgetsSize = Readonly<{ position: HaFloorWidgetPositionValue; width: number; height: number }>;

/** Most columns below the house on a narrow screen. */
const narrowColumns = 2;

export class HomeplanFloorWidgets extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    dashboard: { attribute: false },
    houseId: { attribute: false },
    floorId: { attribute: false },
    narrow: { attribute: false },
    away: { attribute: false },
  };

  static override styles = css`
    :host {
      position: absolute;
      box-sizing: border-box;
      /* No background (owner 2026-11-18): only the cards are drawn, and only they take pointer events. */
      pointer-events: none;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: none;
      width: min(var(--hp-widgets-width, 340px), calc(100% - 24px));
    }
    :host([hidden]) {
      display: none;
    }
    :host([data-position="left"]),
    :host([data-position="right"]) {
      top: 56px;
      bottom: 12px;
    }
    /* Left widgets start at the screen margin: the top bar's controls sit at the right (owner, 2026-11-18). */
    :host([data-position="left"]) {
      top: 12px;
      left: 12px;
    }
    :host([data-position="right"]) {
      right: 12px;
    }
    :host([data-position="top"]),
    :host([data-position="bottom"]) {
      left: 0;
      right: 0;
      margin-inline: auto;
      max-height: 40%;
    }
    :host([data-position="top"]) {
      top: 56px;
    }
    :host([data-position="bottom"]) {
      bottom: 12px;
    }
    :host([data-narrow]) {
      max-height: 50%;
    }
    /*
     * Away while a room is open (14.4): off the right edge (from a centred place, half the screen plus half their
     * own width), or off the left edge for widgets on the left; hidden once the slide is over.
     */
    :host {
      --hp-widgets-away: calc(100% + 12px);
      transition:
        transform ${slideDuration} ${slideCurveFallback},
        visibility 0s;
      transition:
        transform ${slideDuration} ${slideCurve},
        visibility 0s;
    }
    :host([data-position="left"]) {
      --hp-widgets-away: calc(-100% - 12px);
    }
    :host([data-position="top"]),
    :host([data-position="bottom"]) {
      --hp-widgets-away: calc(50% + var(--hp-screen-width, 100vw) / 2 + 12px);
    }
    :host([data-away]) {
      transform: translateX(var(--hp-widgets-away));
      visibility: hidden;
      transition:
        transform ${slideDuration} ${slideCurveFallback},
        visibility 0s linear ${slideDuration};
      transition:
        transform ${slideDuration} ${slideCurve},
        visibility 0s linear ${slideDuration};
    }
    @media (prefers-reduced-motion: reduce) {
      :host,
      :host([data-away]) {
        transition: none;
      }
    }
  `;

  declare store: HassStore | undefined;
  declare dashboard: HaDashboardValue;
  declare houseId: string | null;
  declare floorId: string | null;
  declare narrow: boolean;
  /** A room is open: the widgets slide away (and keep their size for when it closes). */
  declare away: boolean;
  private mounted = "";
  private built: BuiltLayout | null = null;
  private unsubscribe: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private token = 0;
  private reported = "";

  constructor() {
    super();
    this.dashboard = { urlPath: null, areaTabs: {}, areaViews: {}, areaColumns: {} };
    this.houseId = null;
    this.floorId = null;
    this.narrow = false;
    this.away = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.resizeObserver = new ResizeObserver(() => {
      this.report();
    });
    this.resizeObserver.observe(this);
    // HA may detach and re-attach the panel: the cards are built again.
    this.mounted = "";
    if (this.hasUpdated) this.requestUpdate();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.token += 1;
    this.mounted = "";
  }

  /** Where the widgets sit: the chosen position, or below the house on a narrow screen. */
  private position(): HaFloorWidgetPositionValue {
    return this.narrow || this.floorId === null
      ? "bottom"
      : floorPosition(this.dashboard, this.houseId, this.floorId);
  }

  private columns(): number {
    const columns = this.floorId === null ? 1 : floorColumns(this.dashboard, this.houseId, this.floorId);
    return this.narrow ? Math.min(columns, narrowColumns) : columns;
  }

  private tab(): string | undefined {
    return this.floorId === null ? undefined : floorTab(this.dashboard, this.houseId, this.floorId);
  }

  private key(): string {
    return [this.dashboard.urlPath ?? "", this.tab() ?? "", this.houseId ?? "", this.floorId ?? ""].join("|");
  }

  protected override willUpdate(): void {
    this.dataset.position = this.position();
    this.toggleAttribute("data-narrow", this.narrow);
    this.toggleAttribute("data-away", this.away);
    // On a narrow screen the cards take the whole width (the 24 px gutter is the host's own limit).
    this.style.setProperty(
      "--hp-widgets-width",
      this.narrow ? "100%" : `${String(cardsWidthPx(this.columns()))}px`,
    );
  }

  protected override updated(): void {
    this.built?.fit(this.columns());
    if (this.key() !== this.mounted) void this.mountCards();
    // A new position or width; hiding or showing the area (a room opened or closed) is seen by the observer.
    this.report();
  }

  /** Tells the screen the widget area's box, so it frames the house into the rest (only when it changes). */
  private report(): void {
    const box = this.getBoundingClientRect();
    const empty = this.hidden || this.built === null || this.built.cards.length === 0;
    const size: WidgetsSize = {
      position: this.position(),
      width: empty ? 0 : Math.round(box.width),
      height: empty ? 0 : Math.round(box.height),
    };
    const key = `${size.position}|${String(size.width)}|${String(size.height)}`;
    if (key === this.reported) return;
    this.reported = key;
    this.dispatchEvent(new CustomEvent<WidgetsSize>("widgets-size", { detail: size }));
  }

  /** Builds the floor's tab with HA's card factory and feeds the cards `hass`; no tab shows nothing. */
  private async mountCards(): Promise<void> {
    this.mounted = this.key();
    const token = ++this.token;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.built = null;
    const host = this.renderRoot.querySelector(".cards");
    const hass = this.store?.current();
    const urlPath = this.dashboard.urlPath;
    const tab = this.tab();
    host?.replaceChildren();
    this.report();
    if (host === null || hass === null || hass === undefined || urlPath === null || tab === undefined) return;
    try {
      const view = (await readViews(hass, urlPath)).find((candidate) => candidate.key === tab) ?? null;
      if (token !== this.token) return;
      if (view === null) {
        console.warn(`[homeplan] dashboard "${urlPath}" has no tab "${tab}" for the floor widgets`);
        return;
      }
      const helpers = await loadHelpers();
      const built = await buildLayout(view.layout, (card) => resolveCard(helpers, card));
      if (token !== this.token) return;
      // Only the cards take pointer events; the gaps between them reach the canvas.
      for (const card of built.cards) card.style.pointerEvents = "auto";
      host.replaceChildren(built.root);
      this.built = built;
      built.fit(this.columns());
      const push = (): void => {
        const current = this.store?.current();
        if (current !== null && current !== undefined)
          for (const card of built.cards) Reflect.set(card, "hass", current);
      };
      push();
      this.unsubscribe = this.store?.subscribeHass(push) ?? null;
      this.report();
    } catch (error) {
      if (token === this.token) console.warn("[homeplan] could not draw the floor widgets", error);
    }
  }

  protected override render(): TemplateResult {
    return html`<div class="cards"></div>`;
  }
}
