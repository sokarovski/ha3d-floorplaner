// The house picker (spec/home-assistant/viewer-mvp.md#setup): shown when no house is chosen, and from Edit mode's
// list (Swap house). The early test entity is gone (owner 2026-11-16); the stored field stays null.
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, TemplateResult } from "lit";
import type { HouseCardValue } from "@shared/contracts/houses";
import type { HouseSource, ViewerSetup } from "./houseSource";
import { tokens } from "./styles/tokens";

export type SetupSavedEvent = CustomEvent<ViewerSetup>;

export class HomeplanSetupScreen extends LitElement {
  static override properties: PropertyDeclarations = {
    source: { attribute: false },
    setup: { attribute: false },
  };

  static override styles = [
    tokens,
    css`
      :host {
        display: block;
        height: 100%;
        overflow: auto;
        padding: 24px 16px;
      }
      .card {
        max-width: 560px;
        margin: 0 auto;
        background: var(--hp-surface);
        border-radius: var(--hp-radius);
        box-shadow: var(--hp-shadow);
        padding: 20px 20px 16px;
        display: grid;
        gap: 18px;
      }
      h1 {
        margin: 0;
        font-size: 22px;
        font-weight: 400;
      }
      h2 {
        margin: 0 0 8px;
        font-size: 14px;
        font-weight: 500;
        color: var(--hp-muted);
      }
      .houses {
        display: grid;
        gap: 6px;
        max-height: 320px;
        overflow: auto;
      }
      .house {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border: 1px solid var(--hp-divider);
        border-radius: 10px;
        background: transparent;
        text-align: left;
        cursor: pointer;
      }
      .house[aria-pressed="true"] {
        border-color: var(--hp-accent);
        box-shadow: inset 0 0 0 1px var(--hp-accent);
      }
      .house[disabled] {
        opacity: 0.5;
        cursor: default;
      }
      .house small {
        margin-left: auto;
        color: var(--hp-muted);
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .text-button {
        border: none;
        background: transparent;
        color: var(--hp-accent);
        font: inherit;
        font-weight: 500;
        padding: 8px 14px;
        border-radius: 999px;
        cursor: pointer;
      }
      .error {
        color: var(--hp-error);
      }
    `,
  ];

  declare source: HouseSource | undefined;
  declare setup: ViewerSetup;
  private houses: readonly HouseCardValue[] | null = null;
  private error: string | null = null;
  private houseId: string | null = null;
  private saving = false;

  constructor() {
    super();
    this.setup = { houseId: null, testEntityId: null };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.houseId = this.setup.houseId;
    void this.loadHouses();
  }

  private async loadHouses(): Promise<void> {
    if (this.source === undefined) return;
    try {
      this.houses = await this.source.listHouses();
      this.error = null;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not load houses.";
    }
    this.requestUpdate();
  }

  private async save(): Promise<void> {
    if (this.source === undefined || this.houseId === null) return;
    const setup: ViewerSetup = { houseId: this.houseId, testEntityId: null };
    this.saving = true;
    this.requestUpdate();
    try {
      await this.source.saveSetup(setup);
      this.dispatchEvent(new CustomEvent<ViewerSetup>("setup-saved", { detail: setup }));
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not save the setup.";
    }
    this.saving = false;
    this.requestUpdate();
  }

  private renderHouse(house: HouseCardValue): TemplateResult {
    if (house.status === "invalid")
      return html`<button class="house" disabled>${house.id}<small>invalid</small></button>`;
    return html`
      <button
        class="house"
        aria-pressed=${String(this.houseId === house.id)}
        @click=${() => {
          this.houseId = house.id;
          this.requestUpdate();
        }}
      >
        ${house.name}<small>${house.floorCount} floor${house.floorCount === 1 ? "" : "s"}</small>
      </button>
    `;
  }

  protected override render(): TemplateResult {
    const swapping = this.setup.houseId !== null;
    return html`
      <div class="card">
        <h1>${swapping ? "Swap house" : "Choose a house"}</h1>
        <section>
          ${
            this.houses === null
              ? html`<div>Loading houses…</div>`
              : this.houses.length === 0
                ? html`<div>No houses yet. Create one in the builder.</div>`
                : html`<div class="houses">${this.houses.map((house) => this.renderHouse(house))}</div>`
          }
        </section>
        ${this.error === null ? nothing : html`<div class="error">${this.error}</div>`}
        <div class="actions">
          ${
            swapping
              ? html`<button
                  class="text-button"
                  @click=${() => {
                    this.dispatchEvent(new Event("setup-cancel"));
                  }}
                >
                  Cancel
                </button>`
              : nothing
          }
          <button
            class="button"
            ?disabled=${this.houseId === null || this.saving}
            @click=${() => void this.save()}
          >
            ${this.saving ? "Saving…" : swapping ? "Show this house" : "Show house"}
          </button>
        </div>
      </div>
    `;
  }
}
