// Room bubbles in the room settings (Phase 8.5, owner Q4; spec/home-assistant/viewer-mvp.md#bubbles): the room's
// list of bubbles (temperature, humidity, light toggle, presence, a state, custom), each with its entity, look,
// condition, and actions. Its own section of the area panel's settings. Changes go up as `room-bubbles-change`
// (the whole list); the viewer screen stores them in preferences and draws those whose condition holds.
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, TemplateResult } from "lit";
import { bubblePresets, newBubbleContent } from "@shared/domain/homeAssistant/bubbles";
import { createId } from "@shared/domain/ids";
import { haBubblePresets } from "@shared/domain/schemas/homeAssistant";
import type {
  HaBubbleContentValue,
  HaBubblePreset,
  HaRoomBubbleValue,
} from "@shared/domain/schemas/homeAssistant";
import { fieldStyles, formValue, valueOf } from "./formHelpers";
import { loadHaForm } from "./haElements";
import type { HassStore } from "./hassStore";
import { tokens } from "./styles/tokens";

/** At most this many bubbles per room (the schema's limit). */
const maxRoomBubbles = 12;

/** Which bubble the popup edits: an existing one by index, or a new one. */
type Editing = Readonly<{ index: number | null; content: HaBubbleContentValue }>;

export class HomeplanRoomBubbles extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    bubbles: { attribute: false },
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
      .row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 0;
        border-bottom: 1px solid var(--hp-divider);
      }
      .names {
        flex: 1;
        display: grid;
        gap: 2px;
        min-width: 0;
      }
      .name {
        font-weight: 500;
      }
      .detail {
        font-size: 12px;
        color: var(--hp-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .add {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .add select,
      .add ha-form {
        flex: 1;
        min-width: 0;
      }
    `,
  ];

  declare store: HassStore | undefined;
  declare bubbles: readonly HaRoomBubbleValue[];
  declare areaName: string;
  private preset: HaBubblePreset = "temperature";
  private editing: Editing | null = null;
  private haForm = false;

  constructor() {
    super();
    this.bubbles = [];
    this.areaName = "";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void loadHaForm().then((available) => {
      this.haForm = available;
      this.requestUpdate();
    });
  }

  private change(bubbles: readonly HaRoomBubbleValue[]): void {
    // Composed: the area panel's host hears it, outside its shadow root.
    this.dispatchEvent(
      new CustomEvent<readonly HaRoomBubbleValue[]>("room-bubbles-change", {
        detail: bubbles,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private save(content: HaBubbleContentValue): void {
    const editing = this.editing;
    this.editing = null;
    if (editing === null) return;
    const index = editing.index;
    if (index === null) this.change([...this.bubbles, { id: createId("hb"), ...content }]);
    else
      this.change(this.bubbles.map((bubble, at) => (at === index ? { id: bubble.id, ...content } : bubble)));
    this.requestUpdate();
  }

  private removeBubble(index: number): void {
    this.editing = null;
    this.change(this.bubbles.filter((_bubble, at) => at !== index));
    this.requestUpdate();
  }

  private move(index: number, by: -1 | 1): void {
    const target = index + by;
    const moved = this.bubbles[index];
    const other = this.bubbles[target];
    if (moved === undefined || other === undefined) return;
    this.change(this.bubbles.map((bubble, at) => (at === index ? other : at === target ? moved : bubble)));
  }

  private renderRow(bubble: HaRoomBubbleValue, index: number): TemplateResult {
    const details = [
      bubble.stateEntityId ?? "No entity",
      bubble.attribute ?? null,
      bubble.visibleWhen === undefined ? null : "conditional",
    ].filter((part): part is string => part !== null);
    return html`<div class="row">
      <span class="names">
        <span class="name">${bubblePresets[bubble.preset].label}</span>
        <span class="detail">${details.join(" · ")}</span>
      </span>
      <button
        class="text-button"
        title="Move earlier in the row"
        ?disabled=${index === 0}
        @click=${() => {
          this.move(index, -1);
        }}
      >
        ↑
      </button>
      <button
        class="text-button"
        @click=${() => {
          const { id: _id, ...content } = bubble;
          this.editing = { index, content };
          this.requestUpdate();
        }}
      >
        Edit
      </button>
    </div>`;
  }

  private choosePreset(value: unknown): void {
    this.preset = haBubblePresets.find((preset) => preset === value) ?? "temperature";
    this.requestUpdate();
  }

  /** Which kind of bubble Add makes: HA's select selector (owner 2026-11-17), a plain select outside HA. */
  private renderKind(): TemplateResult {
    if (this.haForm)
      return html`<ha-form
        .hass=${this.store?.current()}
        .data=${{ kind: this.preset }}
        .schema=${[
          {
            name: "kind",
            selector: {
              select: {
                options: haBubblePresets.map((preset) => ({
                  value: preset,
                  label: bubblePresets[preset].label,
                })),
                mode: "dropdown",
              },
            },
          },
        ]}
        .computeLabel=${() => "Bubble kind"}
        @value-changed=${(event: Event) => {
          this.choosePreset(formValue(event)?.kind);
        }}
      ></ha-form>`;
    return html`<select
      aria-label="Bubble kind"
      @change=${(event: Event) => {
        this.choosePreset(valueOf(event));
      }}
    >
      ${haBubblePresets.map(
        (preset) =>
          html`<option value=${preset} ?selected=${preset === this.preset}>
            ${bubblePresets[preset].label}
          </option>`,
      )}
    </select>`;
  }

  protected override render(): TemplateResult {
    const editing = this.editing;
    const index = editing?.index ?? null;
    return html`
      ${
        this.bubbles.length === 0
          ? html`<div class="hint">No bubbles yet.</div>`
          : this.bubbles.map((bubble, at) => this.renderRow(bubble, at))
      }
      ${
        this.bubbles.length >= maxRoomBubbles
          ? nothing
          : html`<div class="add">
              ${this.renderKind()}
              <button
                class="button"
                @click=${() => {
                  this.editing = { index: null, content: newBubbleContent(this.preset) };
                  this.requestUpdate();
                }}
              >
                Add bubble
              </button>
            </div>`
      }
      ${
        editing === null
          ? nothing
          : html`<homeplan-bubble-editor
              .store=${this.store}
              .haForm=${this.haForm}
              .content=${editing.content}
              .heading=${index === null ? "New room bubble" : "Room bubble"}
              .subtitle=${`Above ${this.areaName}, in a row along its longest side, while its condition holds`}
              .removable=${index !== null}
              @close=${() => {
                this.editing = null;
                this.requestUpdate();
              }}
              @bubble-save=${(event: CustomEvent<HaBubbleContentValue>) => {
                this.save(event.detail);
              }}
              @bubble-delete=${() => {
                if (index !== null) this.removeBubble(index);
              }}
            ></homeplan-bubble-editor>`
      }
    `;
  }
}
