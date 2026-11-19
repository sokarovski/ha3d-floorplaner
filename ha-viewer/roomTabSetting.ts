// A room's cards in the Settings room editor (Phase 10.9; spec/home-assistant/viewer-mvp.md#room-cards): which tab
// of the chosen dashboard holds this room's cards ("Match by name" by default), and below it how many section
// columns wide its room cards are (owner 2026-11-17: a room setting), and whether the room's title shows above its
// cards (14.4, hidden by default). Changes go up as a draft of the whole dashboard setting (`dashboard-change`); the
// binding editor saves it with everything else.
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, TemplateResult } from "lit";
import type { HaDashboardValue } from "@shared/domain/schemas/homeAssistant";
import {
  chosenTab,
  readViews,
  roomColumns,
  roomTitleShown,
  tabForArea,
  withRoomColumns,
  withRoomTab,
  withRoomTitle,
} from "./dashboardViews";
import type { DashboardView } from "./dashboardViews";
import { fieldStyles, formValue, valueOf } from "./formHelpers";
import type { HassStore } from "./hassStore";
import { tokens } from "./styles/tokens";

/** The select-selector value standing for "match the tab by name". */
const autoValue = "__auto__";
const columnOptions = [
  { value: "1", label: "1 column" },
  { value: "2", label: "2 columns" },
];

export class HomeplanRoomTabSetting extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    haForm: { attribute: false },
    dashboard: { attribute: false },
    houseId: { attribute: false },
    areaId: { attribute: false },
    areaName: { attribute: false },
    haAreaName: { attribute: false },
  };

  static override styles = [
    tokens,
    fieldStyles,
    css`
      :host {
        display: grid;
        gap: 8px;
        min-width: 0;
      }
      select {
        width: 100%;
      }
      .check {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--hp-text);
        font-size: 14px;
      }
    `,
  ];

  declare store: HassStore | undefined;
  declare haForm: boolean;
  declare dashboard: HaDashboardValue;
  declare houseId: string | null;
  declare areaId: string;
  declare areaName: string;
  /** The room's HA area name (chosen or matched), the tab's second name; null when none. */
  declare haAreaName: string | null;
  private views: readonly DashboardView[] | null = null;
  private error: string | null = null;
  /** The dashboard whose tabs are loaded (or loading). */
  private viewsFor: string | null = null;
  private token = 0;

  constructor() {
    super();
    this.haForm = false;
    this.dashboard = { urlPath: null, areaTabs: {}, areaViews: {}, areaColumns: {} };
    this.houseId = null;
    this.areaId = "";
    this.areaName = "";
    this.haAreaName = null;
  }

  protected override updated(): void {
    // The tabs of the chosen dashboard, read again when the (draft) dashboard changes.
    if (this.dashboard.urlPath !== this.viewsFor) void this.loadViews();
  }

  private async loadViews(): Promise<void> {
    const hass = this.store?.current();
    const urlPath = this.dashboard.urlPath;
    const token = ++this.token;
    this.viewsFor = urlPath;
    this.views = null;
    this.error = null;
    this.requestUpdate();
    if (hass === null || hass === undefined || urlPath === null) return;
    try {
      const views = await readViews(hass, urlPath);
      if (token === this.token) this.views = views;
    } catch (error) {
      if (token === this.token)
        this.error =
          error instanceof Error
            ? `Could not read the dashboard: ${error.message}`
            : "Could not read the dashboard.";
    }
    this.requestUpdate();
  }

  private choose(tab: string): void {
    const houseId = this.houseId;
    if (houseId === null || tab === (chosenTab(this.dashboard, houseId, this.areaId) ?? "")) return;
    this.dispatchEvent(
      new CustomEvent<HaDashboardValue>("dashboard-change", {
        detail: withRoomTab(this.dashboard, houseId, this.areaId, tab),
      }),
    );
  }

  private chooseColumns(columns: 1 | 2): void {
    const houseId = this.houseId;
    if (houseId === null || columns === roomColumns(this.dashboard, houseId, this.areaId)) return;
    this.dispatchEvent(
      new CustomEvent<HaDashboardValue>("dashboard-change", {
        detail: withRoomColumns(this.dashboard, houseId, this.areaId, columns),
      }),
    );
  }

  private chooseTitle(shown: boolean): void {
    const houseId = this.houseId;
    if (houseId === null || shown === roomTitleShown(this.dashboard, houseId, this.areaId)) return;
    this.dispatchEvent(
      new CustomEvent<HaDashboardValue>("dashboard-change", {
        detail: withRoomTitle(this.dashboard, houseId, this.areaId, shown),
      }),
    );
  }

  /** Show room title (14.4): HA's boolean selector, or a plain checkbox outside HA. */
  private renderTitle(): TemplateResult {
    const shown = roomTitleShown(this.dashboard, this.houseId, this.areaId);
    if (this.haForm)
      return html`<ha-form
        .hass=${this.store?.current()}
        .data=${{ title: shown }}
        .schema=${[{ name: "title", selector: { boolean: {} } }]}
        .computeLabel=${() => "Show room title"}
        @value-changed=${(event: Event) => {
          const value = formValue(event);
          if (value !== null) this.chooseTitle(value.title === true);
        }}
      ></ha-form>`;
    return html`<label class="check">
      <input
        type="checkbox"
        .checked=${shown}
        @change=${(event: Event) => {
          if (event.target instanceof HTMLInputElement) this.chooseTitle(event.target.checked);
        }}
      />
      Show room title
    </label>`;
  }

  /** The panel width: HA's select selector, or a plain select outside HA. */
  private renderColumns(): TemplateResult {
    const columns = String(roomColumns(this.dashboard, this.houseId, this.areaId));
    if (this.haForm)
      return html`<ha-form
        .hass=${this.store?.current()}
        .data=${{ columns }}
        .schema=${[{ name: "columns", selector: { select: { options: columnOptions, mode: "dropdown" } } }]}
        .computeLabel=${() => "Columns"}
        @value-changed=${(event: Event) => {
          const value = formValue(event);
          if (value !== null) this.chooseColumns(value.columns === "2" ? 2 : 1);
        }}
      ></ha-form>`;
    return html`<label>
      Columns
      <select
        @change=${(event: Event) => {
          this.chooseColumns(valueOf(event) === "2" ? 2 : 1);
        }}
      >
        ${columnOptions.map(
          (option) =>
            html`<option value=${option.value} ?selected=${option.value === columns}>
              ${option.label}
            </option>`,
        )}
      </select>
    </label>`;
  }

  private renderPicker(views: readonly DashboardView[]): TemplateResult {
    const chosen = chosenTab(this.dashboard, this.houseId, this.areaId) ?? "";
    if (this.haForm)
      return html`<ha-form
        .hass=${this.store?.current()}
        .data=${{ tab: chosen === "" ? autoValue : chosen }}
        .schema=${[
          {
            name: "tab",
            selector: {
              select: {
                options: [
                  { value: autoValue, label: "Match by name" },
                  ...views.map((view) => ({ value: view.key, label: view.label })),
                ],
                mode: "dropdown",
              },
            },
          },
        ]}
        .computeLabel=${() => `Tab for ${this.areaName}`}
        @value-changed=${(event: Event) => {
          const value = formValue(event);
          if (value !== null && typeof value.tab === "string")
            this.choose(value.tab === autoValue ? "" : value.tab);
        }}
      ></ha-form>`;
    return html`<label>
      Tab for ${this.areaName}
      <select
        @change=${(event: Event) => {
          this.choose(valueOf(event) ?? "");
        }}
      >
        <option value="" ?selected=${chosen === ""}>Match by name</option>
        ${views.map(
          (view) => html`<option value=${view.key} ?selected=${view.key === chosen}>${view.label}</option>`,
        )}
      </select>
    </label>`;
  }

  private renderTab(): TemplateResult {
    if (this.dashboard.urlPath === null)
      return html`<div class="hint">Choose a dashboard first (House, at the top of the list).</div>`;
    if (this.error !== null) return html`<div class="error">${this.error}</div>`;
    const views = this.views;
    const chosen = chosenTab(this.dashboard, this.houseId, this.areaId);
    const missing = views !== null && tabForArea(views, chosen, this.areaName, this.haAreaName) === null;
    return html`${views === null ? html`<div class="hint">Loading tabs…</div>` : this.renderPicker(views)}
    ${
      views !== null && chosen === undefined
        ? html`<div class="hint">
            Match by name: the tab whose path or title is
            "${this.areaName}"${
              this.haAreaName === null || this.haAreaName === this.areaName
                ? ""
                : `, else "${this.haAreaName}"`
            }.
          </div>`
        : nothing
    }
    ${
      missing
        ? html`<div class="hint">
            No tab is set for ${this.areaName}: it opens full-screen, without cards. Choose a tab above to
            show cards beside the room.
          </div>`
        : nothing
    }`;
  }

  protected override render(): TemplateResult {
    return html`${this.renderTab()} ${this.renderColumns()}
      <div class="hint">How many section columns wide this room's cards are.</div>
      ${this.renderTitle()}
      <div class="hint">The room's name above its cards.</div>`;
  }
}
