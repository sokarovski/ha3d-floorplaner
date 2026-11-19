// The Settings screen's House node (Phase 10.9, spec/home-assistant/viewer-mvp.md#bindings-and-edit-mode): settings
// of the whole viewer and house: which HA dashboard the room cards come from (each room's tab and panel width are
// room settings, owner 2026-11-17). Changes go up as drafts (`dashboard-change`); the binding editor saves them
// with everything else; so does the viewer's Navigation (Phase 14.6: Trackpad, Mouse, Touch; installation-global).
// Main view (Phase 16.1): for a multi-floor house, whether it opens on the whole house (the default) or on one
// floor; per house, keyed by floor ID, a draft saved with the rest (`mainViews` in the dashboard setting).
// The room cutaway is always the fade (the 8.2a experiment ended, owner 2026-11-17); houses
// are switched in House setup (Phase 11), not here.
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, TemplateResult } from "lit";
import type { HaDashboardValue, HaNavigationValue } from "@shared/domain/schemas/homeAssistant";
import { defaultDashboardPath, listDashboards, withDashboardPath } from "./dashboardViews";
import type { DashboardInfo } from "./dashboardViews";
import { fieldStyles, formValue, valueOf } from "./formHelpers";
import type { HassStore } from "./hassStore";
import { effectiveNavigation, navigationChoices, withNavigation } from "./navigationSetting";
import { mainViewOf, withMainView } from "./floorNavigation";
import type { SettingsFloor } from "./bindingEditor";
import { touchFirstDevice } from "./touchDevice";
import { tokens } from "./styles/tokens";

/** The select-selector value standing for "no dashboard". */
const noneValue = "__none__";
/** The Main view value standing for the whole house (16.1). */
const houseValue = "__house__";

export class HomeplanHouseSettings extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    haForm: { attribute: false },
    dashboard: { attribute: false },
    houseId: { attribute: false },
    floors: { attribute: false },
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
      select,
      input {
        width: 100%;
      }
    `,
  ];

  declare store: HassStore | undefined;
  declare haForm: boolean;
  declare dashboard: HaDashboardValue;
  declare houseId: string | null;
  /** The house's floors, lowest first; Main view shows only when there are several (16.1). */
  declare floors: readonly SettingsFloor[];
  private dashboards: readonly DashboardInfo[] | null = null;
  /** The dashboard list needs an admin; without it the URL path is typed instead. */
  private listFailed = false;

  constructor() {
    super();
    this.haForm = false;
    this.dashboard = { urlPath: null, areaTabs: {}, areaViews: {}, areaColumns: {} };
    this.houseId = null;
    this.floors = [];
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadDashboards();
  }

  private async loadDashboards(): Promise<void> {
    const hass = this.store?.current();
    if (hass === null || hass === undefined || this.dashboards !== null) return;
    try {
      this.dashboards = await listDashboards(hass);
    } catch {
      this.listFailed = true;
      this.dashboards = [{ urlPath: defaultDashboardPath, title: "Overview" }];
    }
    this.requestUpdate();
  }

  private change(next: HaDashboardValue): void {
    this.dispatchEvent(new CustomEvent<HaDashboardValue>("dashboard-change", { detail: next }));
  }

  private chooseDashboard(urlPath: string | null): void {
    if (urlPath !== this.dashboard.urlPath)
      this.change(withDashboardPath(this.dashboard, this.houseId, urlPath));
  }

  private chooseNavigation(value: string | null): void {
    const choice = navigationChoices.find((candidate) => candidate.value === value);
    if (choice === undefined || choice.value === this.dashboard.navigation) return;
    this.change(withNavigation(this.dashboard, choice.value));
  }

  private chooseMainView(value: string | null): void {
    const houseId = this.houseId;
    if (houseId === null || value === null) return;
    const floorId = value === houseValue || !this.floors.some((floor) => floor.id === value) ? null : value;
    if (floorId === mainViewOf(this.dashboard, houseId)) return;
    this.change(withMainView(this.dashboard, houseId, floorId));
  }

  /**
   * Settings → House → Main view (16.1), multi-floor houses only: Whole house (the default) or a floor by name. A
   * stored floor that no longer exists shows (and opens) as Whole house.
   */
  private renderMainView(): TemplateResult | typeof nothing {
    if (this.floors.length < 2) return nothing;
    const stored = mainViewOf(this.dashboard, this.houseId);
    const current = this.floors.some((floor) => floor.id === stored) && stored !== null ? stored : houseValue;
    const options = [
      { value: houseValue, label: "Whole house" },
      ...this.floors.map((floor) => ({ value: floor.id, label: floor.name })),
    ];
    const field = this.haForm
      ? html`<ha-form
          .hass=${this.store?.current()}
          .data=${{ mainView: current }}
          .schema=${[{ name: "mainView", selector: { select: { options, mode: "dropdown" } } }]}
          .computeLabel=${() => "Main view"}
          @value-changed=${(event: Event) => {
            const value = formValue(event);
            if (value !== null && typeof value.mainView === "string") this.chooseMainView(value.mainView);
          }}
        ></ha-form>`
      : html`<label>
          Main view
          <select
            @change=${(event: Event) => {
              this.chooseMainView(valueOf(event));
            }}
          >
            ${options.map(
              (option) =>
                html`<option value=${option.value} ?selected=${option.value === current}>
                  ${option.label}
                </option>`,
            )}
          </select>
        </label>`;
    return html`<section>
      <h3>Main view</h3>
      ${field}
      <div class="hint">
        What the viewer opens on: the whole house (tap a floor to open it), or one floor. Up and Down beside
        the view buttons switch floors.
      </div>
    </section>`;
  }

  /** Settings → House → Navigation (14.6): how drags, the wheel, and touches move the camera. */
  private renderNavigation(): TemplateResult {
    const current: HaNavigationValue = effectiveNavigation(this.dashboard, touchFirstDevice());
    const hint = navigationChoices.find((choice) => choice.value === current)?.hint ?? "";
    const field = this.haForm
      ? html`<ha-form
          .hass=${this.store?.current()}
          .data=${{ navigation: current }}
          .schema=${[
            {
              name: "navigation",
              selector: {
                select: {
                  options: navigationChoices.map((choice) => ({ value: choice.value, label: choice.label })),
                  mode: "dropdown",
                },
              },
            },
          ]}
          .computeLabel=${() => "Navigation"}
          @value-changed=${(event: Event) => {
            const value = formValue(event);
            if (value !== null && typeof value.navigation === "string")
              this.chooseNavigation(value.navigation);
          }}
        ></ha-form>`
      : html`<label>
          Navigation
          <select
            @change=${(event: Event) => {
              this.chooseNavigation(valueOf(event));
            }}
          >
            ${navigationChoices.map(
              (choice) =>
                html`<option value=${choice.value} ?selected=${choice.value === current}>
                  ${choice.label}
                </option>`,
            )}
          </select>
        </label>`;
    return html`<section>
      <h3>Navigation</h3>
      ${field}
      <div class="hint">${hint}</div>
    </section>`;
  }

  /** The dashboard as HA's own form (a select, or a text field when the list needs an admin). */
  private renderHaForm(dashboards: readonly DashboardInfo[]): TemplateResult {
    const urlPath = this.dashboard.urlPath;
    const options = [
      { value: noneValue, label: "None" },
      ...dashboards.map((dashboard) => ({
        value: dashboard.urlPath,
        label: `${dashboard.title} (${dashboard.urlPath})`,
      })),
    ];
    if (urlPath !== null && !dashboards.some((dashboard) => dashboard.urlPath === urlPath))
      options.push({ value: urlPath, label: urlPath });
    const schema = [
      {
        name: "dashboard",
        selector: this.listFailed ? { text: {} } : { select: { options, mode: "dropdown" } },
      },
    ];
    const labels: Readonly<Record<string, string>> = {
      dashboard: this.listFailed ? "Dashboard URL path (for example homeplan)" : "Dashboard",
    };
    return html`<ha-form
      .hass=${this.store?.current()}
      .data=${{
        dashboard: this.listFailed ? (urlPath ?? "") : (urlPath ?? noneValue),
      }}
      .schema=${schema}
      .computeLabel=${(item: { name: string }) => labels[item.name] ?? item.name}
      @value-changed=${(event: Event) => {
        const value = formValue(event);
        if (value === null) return;
        const dashboard = typeof value.dashboard === "string" ? value.dashboard.trim() : "";
        const next = dashboard === "" || dashboard === noneValue ? null : dashboard;
        this.chooseDashboard(next);
      }}
    ></ha-form>`;
  }

  private renderPlain(dashboards: readonly DashboardInfo[]): TemplateResult {
    const urlPath = this.dashboard.urlPath;
    const known = dashboards.some((dashboard) => dashboard.urlPath === urlPath);
    return html`
      <label>
        Dashboard
        <select
          @change=${(event: Event) => {
            const value = valueOf(event);
            this.chooseDashboard(value === null || value === "" ? null : value);
          }}
        >
          <option value="" ?selected=${urlPath === null}>None</option>
          ${urlPath !== null && !known ? html`<option value=${urlPath} selected>${urlPath}</option>` : nothing}
          ${dashboards.map(
            (dashboard) =>
              html`<option value=${dashboard.urlPath} ?selected=${dashboard.urlPath === urlPath}>
                ${dashboard.title} (${dashboard.urlPath})
              </option>`,
          )}
        </select>
      </label>
      ${
        this.listFailed
          ? html`<div class="hint">
                Home Assistant only lists dashboards for admins. Type the URL path instead:
              </div>
              <input
                .value=${urlPath ?? ""}
                placeholder="for example homeplan"
                @change=${(event: Event) => {
                  this.chooseDashboard((valueOf(event) ?? "").trim() || null);
                }}
              />`
          : nothing
      }
    `;
  }

  protected override render(): TemplateResult {
    const dashboards = this.dashboards;
    return html`
      <section>
        <h3>Room cards</h3>
        <div class="hint">
          The dashboard whose tabs hold each room's cards. Each room's tab and panel width are in that room's
          settings.
        </div>
        ${
          dashboards === null
            ? html`<div class="hint">Loading dashboards…</div>`
            : this.haForm
              ? this.renderHaForm(dashboards)
              : this.renderPlain(dashboards)
        }
      </section>
      ${this.renderMainView()} ${this.renderNavigation()}
    `;
  }
}
