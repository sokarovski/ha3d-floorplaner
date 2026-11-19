// The bubble popup (Phase 8.5, spec/home-assistant/bindings.md#bubbles): edits one room or placed bubble: its
// preset, entity and tap / hold / double-tap actions (the binding fields), what it shows (attribute, icon,
// format, style), and when it is shown. HA's ha-form selectors (select, attribute, icon) inside Home Assistant;
// plain controls in the harness. It only edits a draft: the owner (room settings or the viewer screen) saves.
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, PropertyValues, TemplateResult } from "lit";
import { bubblePresets } from "@shared/domain/homeAssistant/bubbles";
import { haBubbleFormats, haBubblePresets } from "@shared/domain/schemas/homeAssistant";
import type {
  HaBubbleContentValue,
  HaBubbleFormat,
  HaBubblePreset,
  HaConditionValue,
} from "@shared/domain/schemas/homeAssistant";
import type { ClickableFields } from "./bindingFields";
import { fieldStyles, formValue, text, valueOf } from "./formHelpers";
import type { HassStore } from "./hassStore";
import { tokens } from "./styles/tokens";
import type { OptionalChange } from "./events";

const closeIcon =
  "M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z";

const formatLabels: Readonly<Record<HaBubbleFormat, string>> = {
  value: "Value (with unit)",
  state: "State as text",
  icon: "Icon only",
};

const styleOptions = [
  { value: "bubble", label: "Bubble" },
  { value: "bare", label: "Icon and text, no background" },
] as const;

const presetOf = (value: unknown): HaBubblePreset | undefined =>
  haBubblePresets.find((preset) => preset === value);
const formatOf = (value: unknown): HaBubbleFormat | undefined =>
  haBubbleFormats.find((format) => format === value);

export type BubbleSaveEvent = CustomEvent<HaBubbleContentValue>;

export class HomeplanBubbleEditor extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    haForm: { attribute: false },
    content: { attribute: false },
    heading: { attribute: false },
    subtitle: { attribute: false },
    removable: { attribute: false },
  };

  static override styles = [
    tokens,
    fieldStyles,
    css`
      :host {
        position: fixed;
        inset: 0;
        z-index: 12;
        display: grid;
        place-items: center;
        padding: 16px;
        background: rgba(0, 0, 0, 0.32);
      }
      .dialog {
        width: min(560px, 100%);
        max-height: min(88vh, 960px);
        display: grid;
        grid-template-rows: auto 1fr auto;
        background: var(--hp-surface);
        border-radius: var(--ha-dialog-border-radius, 24px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        overflow: hidden;
      }
      header {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 16px 12px 8px 24px;
      }
      .titles {
        flex: 1;
        display: grid;
        gap: 2px;
        min-width: 0;
      }
      h2 {
        margin: 0;
        font-size: 22px;
        font-weight: 400;
      }
      .subtitle {
        font-size: 13px;
        color: var(--hp-muted);
      }
      .body {
        overflow: auto;
        padding: 0 20px 16px;
        display: grid;
        gap: 12px;
        align-content: start;
      }
      h3 {
        margin: 12px 0 0;
        font-size: 15px;
        font-weight: 500;
      }
      footer {
        display: flex;
        gap: 8px;
        padding: 12px 20px 16px;
        border-top: 1px solid var(--hp-divider);
      }
      .spacer {
        flex: 1;
      }
      .danger {
        color: var(--hp-error);
      }
    `,
  ];

  declare store: HassStore | undefined;
  declare haForm: boolean;
  declare content: HaBubbleContentValue;
  declare heading: string;
  declare subtitle: string;
  /** Shows Delete (an existing bubble). */
  declare removable: boolean;
  private draft: HaBubbleContentValue = { preset: "temperature", format: "value" };

  constructor() {
    super();
    this.haForm = false;
    this.content = { preset: "temperature", format: "value" };
    this.heading = "Bubble";
    this.subtitle = "";
    this.removable = false;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("content")) this.draft = this.content;
  }

  private set(next: HaBubbleContentValue): void {
    this.draft = next;
    this.requestUpdate();
  }

  /** The look fields; empty values are left out. A new preset brings its default format. */
  private setLook(
    look: Readonly<{
      preset: HaBubblePreset;
      attribute: string | undefined;
      icon: string | undefined;
      format: HaBubbleFormat;
      bare: boolean;
    }>,
  ): void {
    const { attribute: _attribute, icon: _icon, style: _style, ...rest } = this.draft;
    const format = look.preset !== this.draft.preset ? bubblePresets[look.preset].format : look.format;
    this.set({
      ...rest,
      preset: look.preset,
      format,
      ...(look.attribute === undefined ? {} : { attribute: look.attribute }),
      ...(look.icon === undefined ? {} : { icon: look.icon }),
      ...(look.bare ? { style: "bare" as const } : {}),
    });
  }

  private emit(name: string, detail?: HaBubbleContentValue): void {
    this.dispatchEvent(
      detail === undefined ? new Event(name) : new CustomEvent<HaBubbleContentValue>(name, { detail }),
    );
  }

  private renderLookHaForm(): TemplateResult {
    const draft = this.draft;
    const entityId = draft.stateEntityId ?? undefined;
    const schema = [
      {
        name: "preset",
        selector: {
          select: {
            mode: "dropdown",
            options: haBubblePresets.map((preset) => ({ value: preset, label: bubblePresets[preset].label })),
          },
        },
      },
      {
        name: "format",
        selector: {
          select: {
            mode: "dropdown",
            options: haBubbleFormats.map((format) => ({ value: format, label: formatLabels[format] })),
          },
        },
      },
      ...(entityId === undefined
        ? []
        : [{ name: "attribute", selector: { attribute: { entity_id: entityId } } }]),
      { name: "icon", selector: { icon: {} } },
      { name: "style", selector: { select: { mode: "dropdown", options: styleOptions } } },
    ];
    const labels: Readonly<Record<string, string>> = {
      preset: "Kind",
      format: "Shows",
      attribute: "Attribute (optional; the state when empty)",
      icon: `Icon (empty: the entity's own, else ${bubblePresets[draft.preset].icon})`,
      style: "Style",
    };
    return html`<ha-form
      .hass=${this.store?.current()}
      .data=${{
        preset: draft.preset,
        format: draft.format,
        attribute: draft.attribute,
        icon: draft.icon,
        style: draft.style ?? "bubble",
      }}
      .schema=${schema}
      .computeLabel=${(item: { name: string }) => labels[item.name] ?? item.name}
      @value-changed=${(event: Event) => {
        const value = formValue(event);
        if (value === null) return;
        this.setLook({
          preset: presetOf(value.preset) ?? draft.preset,
          attribute: text(value.attribute),
          icon: text(value.icon),
          format: formatOf(value.format) ?? draft.format,
          bare: value.style === "bare",
        });
      }}
    ></ha-form>`;
  }

  private renderLookFallback(): TemplateResult {
    const draft = this.draft;
    const look = {
      preset: draft.preset,
      attribute: draft.attribute,
      icon: draft.icon,
      format: draft.format,
      bare: draft.style === "bare",
    };
    const entityId = draft.stateEntityId ?? null;
    const entity = entityId === null ? undefined : this.store?.entity(entityId);
    const attributes = Object.keys(entity?.attributes ?? {}).sort();
    return html`
      <label>
        Kind
        <select
          @change=${(event: Event) => {
            this.setLook({ ...look, preset: presetOf(valueOf(event)) ?? draft.preset });
          }}
        >
          ${haBubblePresets.map(
            (preset) =>
              html`<option value=${preset} ?selected=${preset === draft.preset}>
                ${bubblePresets[preset].label}
              </option>`,
          )}
        </select>
      </label>
      <label>
        Shows
        <select
          @change=${(event: Event) => {
            this.setLook({ ...look, format: formatOf(valueOf(event)) ?? draft.format });
          }}
        >
          ${haBubbleFormats.map(
            (format) =>
              html`<option value=${format} ?selected=${format === draft.format}>
                ${formatLabels[format]}
              </option>`,
          )}
        </select>
      </label>
      <label>
        Attribute (optional; the state when empty)
        <select
          @change=${(event: Event) => {
            this.setLook({ ...look, attribute: text(valueOf(event)) });
          }}
        >
          <option value="" ?selected=${draft.attribute === undefined}>State</option>
          ${[...new Set([...attributes, ...(draft.attribute === undefined ? [] : [draft.attribute])])].map(
            (name) => html`<option value=${name} ?selected=${name === draft.attribute}>${name}</option>`,
          )}
        </select>
      </label>
      <label>
        Icon (an ha-icon name; empty: the entity's own, else ${bubblePresets[draft.preset].icon})
        <input
          .value=${draft.icon ?? ""}
          placeholder=${bubblePresets[draft.preset].icon}
          @change=${(event: Event) => {
            this.setLook({ ...look, icon: text(valueOf(event)?.trim()) });
          }}
        />
      </label>
      <label>
        Style
        <select
          @change=${(event: Event) => {
            this.setLook({ ...look, bare: valueOf(event) === "bare" });
          }}
        >
          ${styleOptions.map(
            (option) =>
              html`<option value=${option.value} ?selected=${(draft.style ?? "bubble") === option.value}>
                ${option.label}
              </option>`,
          )}
        </select>
      </label>
    `;
  }

  protected override render(): TemplateResult {
    const draft = this.draft;
    const entity = draft.stateEntityId ?? null;
    return html`
      <div class="dialog" role="dialog" aria-modal="true" aria-label=${this.heading}>
        <header>
          <span class="titles">
            <h2>${this.heading}</h2>
            ${this.subtitle === "" ? nothing : html`<span class="subtitle">${this.subtitle}</span>`}
          </span>
          <button
            class="icon-button"
            title="Close"
            @click=${() => {
              this.emit("close");
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d=${closeIcon}></path></svg>
          </button>
        </header>
        <div class="body">
          <h3>Entity and actions</h3>
          <div class="subtitle">
            Unset, a tap opens the entity's more-info (a camera's live view); a light toggle's tap toggles it.
          </div>
          <homeplan-binding-fields
            .store=${this.store}
            .haForm=${this.haForm}
            .fields=${draft}
            .entityLabel=${"Entity"}
            @fields-change=${(event: CustomEvent<ClickableFields>) => {
              const {
                stateEntityId: _entity,
                tapAction: _tap,
                holdAction: _hold,
                doubleTapAction: _double,
                ...rest
              } = draft;
              // A new entity has other attributes.
              const sameEntity = (event.detail.stateEntityId ?? null) === entity;
              const { attribute: _attribute, ...withoutAttribute } = rest;
              this.set({ ...(sameEntity ? rest : withoutAttribute), ...event.detail });
            }}
          ></homeplan-binding-fields>
          <h3>Look</h3>
          ${this.haForm ? this.renderLookHaForm() : this.renderLookFallback()}
          <h3>Shown when</h3>
          <homeplan-condition-editor
            .store=${this.store}
            .haForm=${this.haForm}
            .condition=${draft.visibleWhen}
            .defaultEntity=${entity}
            .emptyText=${"Always"}
            @condition-change=${(event: CustomEvent<OptionalChange<HaConditionValue>>) => {
              const { visibleWhen: _previous, ...rest } = draft;
              const visibleWhen = event.detail.value;
              this.set({ ...rest, ...(visibleWhen === undefined ? {} : { visibleWhen }) });
            }}
          ></homeplan-condition-editor>
        </div>
        <footer>
          ${
            this.removable
              ? html`<button
                  class="text-button danger"
                  @click=${() => {
                    this.emit("bubble-delete");
                  }}
                >
                  Delete
                </button>`
              : nothing
          }
          <span class="spacer"></span>
          <button
            class="text-button"
            @click=${() => {
              this.emit("close");
            }}
          >
            Cancel
          </button>
          <button
            class="button"
            @click=${() => {
              this.emit("bubble-save", this.draft);
            }}
          >
            Save
          </button>
        </footer>
      </div>
    `;
  }
}
