// A floor's widgets in the Settings floor editor (Phase 13.7; spec/home-assistant/viewer-mvp.md#floor-widgets):
// **Tab** (a tab of the house's dashboard; None by default, so the floor shows no widgets), **Columns** and
// **Position** (left or right take 1–2 columns, top or bottom 1–4; changing the position clamps the columns).
// Changes go up as a draft of the whole dashboard setting (`dashboard-change`); the binding editor saves it.
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, TemplateResult } from "lit";
import { haFloorWidgetPositions } from "@shared/domain/schemas/homeAssistant";
import type { HaDashboardValue, HaFloorWidgetPositionValue } from "@shared/domain/schemas/homeAssistant";
import {
  floorColumns,
  floorPosition,
  floorTab,
  maxFloorColumns,
  readViews,
  withFloorColumns,
  withFloorPosition,
  withFloorTab,
} from "./dashboardViews";
import type { DashboardView } from "./dashboardViews";
import { fieldStyles, formValue, valueOf } from "./formHelpers";
import type { HassStore } from "./hassStore";
import { tokens } from "./styles/tokens";

/** The select value standing for "no widgets". */
const noneValue = "__none__";

const positionLabels: Readonly<Record<HaFloorWidgetPositionValue, string>> = {
  left: "Left of the house",
  right: "Right of the house",
  top: "Above the house",
  bottom: "Below the house",
};

const positionOf = (value: unknown): HaFloorWidgetPositionValue | undefined =>
  haFloorWidgetPositions.find((position) => position === value);

type Option = Readonly<{ value: string; label: string }>;

export class HomeplanFloorWidgetSetting extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    haForm: { attribute: false },
    dashboard: { attribute: false },
    houseId: { attribute: false },
    floorId: { attribute: false },
    floorName: { attribute: false },
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
    `,
  ];

  declare store: HassStore | undefined;
  declare haForm: boolean;
  declare dashboard: HaDashboardValue;
  declare houseId: string | null;
  declare floorId: string;
  declare floorName: string;
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
    this.floorId = "";
    this.floorName = "";
  }

  protected override updated(): void {
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

  private change(next: (houseId: string) => HaDashboardValue): void {
    const houseId = this.houseId;
    if (houseId === null) return;
    this.dispatchEvent(new CustomEvent<HaDashboardValue>("dashboard-change", { detail: next(houseId) }));
  }

  /** One select: HA's select selector inside HA, a plain select outside. */
  private renderSelect(
    name: string,
    label: string,
    value: string,
    options: readonly Option[],
    set: (value: string) => void,
  ): TemplateResult {
    if (this.haForm)
      return html`<ha-form
        .hass=${this.store?.current()}
        .data=${{ [name]: value }}
        .schema=${[{ name, selector: { select: { options, mode: "dropdown" } } }]}
        .computeLabel=${() => label}
        @value-changed=${(event: Event) => {
          const changed = formValue(event)?.[name];
          if (typeof changed === "string" && changed !== value) set(changed);
        }}
      ></ha-form>`;
    return html`<label>
      ${label}
      <select
        @change=${(event: Event) => {
          const changed = valueOf(event);
          if (changed !== null && changed !== value) set(changed);
        }}
      >
        ${options.map(
          (option) =>
            html`<option value=${option.value} ?selected=${option.value === value}>${option.label}</option>`,
        )}
      </select>
    </label>`;
  }

  private renderTab(): TemplateResult {
    if (this.dashboard.urlPath === null)
      return html`<div class="hint">Choose a dashboard first (House, at the top of the list).</div>`;
    if (this.error !== null) return html`<div class="error">${this.error}</div>`;
    const views = this.views;
    if (views === null) return html`<div class="hint">Loading tabs…</div>`;
    const chosen = floorTab(this.dashboard, this.houseId, this.floorId);
    const missing = chosen !== undefined && !views.some((view) => view.key === chosen);
    return html`${this.renderSelect(
      "tab",
      `Widget tab for ${this.floorName}`,
      chosen ?? noneValue,
      [
        { value: noneValue, label: "None (no widgets)" },
        ...(missing ? [{ value: chosen, label: `${chosen} (not in this dashboard)` }] : []),
        ...views.map((view) => ({ value: view.key, label: view.label })),
      ],
      (tab) => {
        this.change((houseId) =>
          withFloorTab(this.dashboard, houseId, this.floorId, tab === noneValue ? "" : tab),
        );
      },
    )}
    ${missing ? html`<div class="error">The chosen tab is no longer in the dashboard; no widgets show.</div>` : nothing}`;
  }

  protected override render(): TemplateResult {
    const position = floorPosition(this.dashboard, this.houseId, this.floorId);
    const columns = floorColumns(this.dashboard, this.houseId, this.floorId);
    const max = maxFloorColumns(position);
    const columnOptions = Array.from({ length: max }, (_, index) => ({
      value: String(index + 1),
      label: index === 0 ? "1 column" : `${String(index + 1)} columns`,
    }));
    const shown = floorTab(this.dashboard, this.houseId, this.floorId) !== undefined;
    return html`${this.renderTab()}
      ${this.renderSelect(
        "position",
        "Position",
        position,
        haFloorWidgetPositions.map((value) => ({ value, label: positionLabels[value] })),
        (value) => {
          const next = positionOf(value);
          if (next !== undefined)
            this.change((houseId) => withFloorPosition(this.dashboard, houseId, this.floorId, next));
        },
      )}
      ${this.renderSelect("columns", "Columns", String(columns), columnOptions, (value) => {
        this.change((houseId) => withFloorColumns(this.dashboard, houseId, this.floorId, Number(value)));
      })}
      <div class="hint">
        ${
          shown
            ? `Left and right take up to 2 section columns, above and below up to 4. The house fits into the space the cards leave; under 700 px they go below it in at most 2 columns.`
            : "Choose a tab to show its cards beside the house on this floor."
        }
      </div>`;
  }
}
