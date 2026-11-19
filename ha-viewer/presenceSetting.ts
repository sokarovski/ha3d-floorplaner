// The room's presence / intrusion setting (Phase 8.6, K18, Q6; spec/home-assistant/bindings.md#presence): which
// entity (a motion or occupancy binary_sensor, or an alarm panel) makes red light sweep from the room's corners,
// and when it counts as active (default: "on" or "triggered"). Its own section in the room's Settings. Which corners
// sweep is chosen in the room panel's gear, by tapping the room in 3D (owner 2026-11-17: it needs the 3D view).
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, PropertyValues, TemplateResult } from "lit";
import {
  conditionEntities,
  presenceActive,
  presenceCondition,
} from "@shared/domain/homeAssistant/conditions";
import type { HaAreaPresenceValue, HaConditionValue } from "@shared/domain/schemas/homeAssistant";
import { maxSweepCorners } from "@shared/domain/schemas/homeAssistant";
import { entityIds, fieldStyles, formValue, text, valueOf } from "./formHelpers";
import { loadHaForm } from "./haElements";
import { EntitiesController } from "./hassStore";
import type { HassStore } from "./hassStore";
import { tokens } from "./styles/tokens";
import { optionalChange } from "./events";
import type { OptionalChange } from "./events";

/** The entity domains a presence setting offers (motion / occupancy sensors and alarm panels). */
const presenceDomains = ["binary_sensor", "alarm_control_panel"] as const;

export type PresenceChangeEvent = CustomEvent<HaAreaPresenceValue | undefined>;

export class HomeplanPresenceSetting extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    presence: { attribute: false },
    areaName: { attribute: false },
  };

  static override styles = [
    tokens,
    fieldStyles,
    css`
      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }
      :host {
        min-width: 0;
        max-width: 100%;
        display: grid;
        gap: 8px;
      }
      /*
       * The section title and its description look exactly like the room editor's other sections (bindingEditor.ts
       * h3 and .subtitle); the heading's margin sits on the row so the "now" badge centres on the title.
       */
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 16px 0 4px;
      }
      h3 {
        margin: 0;
        font-size: 15px;
        font-weight: 500;
      }
      .subtitle {
        font-size: 13px;
        color: var(--hp-muted);
      }
      .now {
        margin-left: auto;
        font-size: 12px;
        padding: 2px 10px;
        border-radius: 999px;
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.06));
        color: var(--hp-muted);
      }
      .now[data-active] {
        background: var(--error-color, #db4437);
        color: var(--text-primary-color, #fff);
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
      }
      .button[aria-pressed="true"] {
        background: var(--error-color, #db4437);
      }
    `,
  ];

  declare store: HassStore | undefined;
  declare presence: HaAreaPresenceValue | undefined;
  declare areaName: string;
  private haForm = false;
  private entities: EntitiesController | null = null;

  constructor() {
    super();
    this.presence = undefined;
    this.areaName = "";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void loadHaForm().then((available) => {
      this.haForm = available;
      this.requestUpdate();
    });
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("store") && this.store !== undefined && this.entities === null)
      this.entities = new EntitiesController(this, this.store);
    // One subscription per entity it reads, for the live "now" badge.
    const presence = this.presence;
    this.entities?.setEntityIds(presence === undefined ? [] : conditionEntities(presenceCondition(presence)));
  }

  private emit(presence: HaAreaPresenceValue | undefined): void {
    this.dispatchEvent(optionalChange<HaAreaPresenceValue>("presence-change", presence));
  }

  private setEntity(entityId: string | undefined): void {
    const current = this.presence;
    if (entityId === current?.entityId) return;
    if (entityId === undefined) {
      this.emit(undefined);
      return;
    }
    // A new entity keeps the chosen corners; its condition starts over (the default "on" / "triggered").
    this.emit({ entityId, ...(current?.corners === undefined ? {} : { corners: current.corners }) });
  }

  private setWhen(when: HaConditionValue | undefined): void {
    const current = this.presence;
    if (current === undefined) return;
    const { when: _previous, ...rest } = current;
    this.emit(when === undefined ? rest : { ...rest, when });
  }

  private renderEntity(): TemplateResult {
    const entityId = this.presence?.entityId;
    if (this.haForm)
      return html`<ha-form
        .hass=${this.store?.current()}
        .data=${{ entity: entityId }}
        .schema=${[{ name: "entity", selector: { entity: { filter: { domain: [...presenceDomains] } } } }]}
        .computeLabel=${() => "Presence / intrusion entity"}
        @value-changed=${(event: Event) => {
          const value = formValue(event);
          if (value !== null) this.setEntity(text(value.entity));
        }}
      ></ha-form>`;
    const options = presenceDomains.flatMap((domain) => entityIds(this.store, domain));
    return html`<label>
      Presence / intrusion entity
      <select
        @change=${(event: Event) => {
          this.setEntity(text(valueOf(event)));
        }}
      >
        <option value="" ?selected=${entityId === undefined}>None</option>
        ${
          entityId !== undefined && !options.includes(entityId)
            ? html`<option value=${entityId} selected>${entityId}</option>`
            : nothing
        }
        ${options.map((id) => html`<option value=${id} ?selected=${id === entityId}>${id}</option>`)}
      </select>
    </label>`;
  }

  private renderCorners(presence: HaAreaPresenceValue): TemplateResult {
    const corners = presence.corners;
    const summary =
      corners === undefined
        ? "Sweeps from the default corners (the two farthest from the door)."
        : corners.length === 0
          ? "No corners: the room only tints red."
          : `Sweeps from ${String(corners.length)} of up to ${String(maxSweepCorners)} chosen corners.`;
    return html`<div class="hint">
      ${summary} Choose the corners in the room's panel: tap ${this.areaName}, then its gear.
    </div>`;
  }

  protected override render(): TemplateResult {
    const presence = this.presence;
    const store = this.store;
    const active =
      presence !== undefined &&
      store !== undefined &&
      presenceActive(presence, (entityId) => store.entity(entityId));
    return html`
      <div class="head">
        <h3>Presence and intrusion</h3>
        ${
          presence === undefined
            ? nothing
            : html`<span class="now" ?data-active=${active}>${active ? "Now: active" : "Now: clear"}</span>`
        }
      </div>
      <div class="subtitle">
        While the entity is active, red light sweeps across the room from its chosen corners, unless the
        floor's presence condition (on the floor's node) does not hold.
      </div>
      ${this.renderEntity()}
      ${
        presence === undefined
          ? nothing
          : html`
              <div class="hint">Active when</div>
              <homeplan-condition-editor
                .store=${this.store}
                .haForm=${this.haForm}
                .condition=${presence.when}
                .defaultEntity=${presence.entityId}
                .emptyText=${'State is "on" or "triggered"'}
                @condition-change=${(event: CustomEvent<OptionalChange<HaConditionValue>>) => {
                  this.setWhen(event.detail.value);
                }}
              ></homeplan-condition-editor>
              ${this.renderCorners(presence)}
            `
      }
    `;
  }
}
