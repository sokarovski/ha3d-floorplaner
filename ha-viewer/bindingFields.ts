// A binding's entity and gesture actions (D25, spec/home-assistant/bindings.md#editor): HA's own ha-form with
// the entity and ui_action selectors when available, plain selects outside Home Assistant (the harness).
import { LitElement, css, html } from "lit";
import type { PropertyDeclarations, TemplateResult } from "lit";
import { HaAction } from "@shared/domain/schemas/homeAssistant";
import type { HaActionValue } from "@shared/domain/schemas/homeAssistant";
import type { EntitySuggestion } from "@shared/domain/homeAssistant/suggestions";
import { compileValidator } from "@shared/domain/validation/ajv";
import { entityIds, fieldStyles, formValue, text, valueOf } from "./formHelpers";
import type { HassStore } from "./hassStore";
import { tokens } from "./styles/tokens";

/** The clickable part of a binding this element edits. */
export type ClickableFields = Readonly<{
  stateEntityId?: string | null;
  tapAction?: HaActionValue;
  holdAction?: HaActionValue;
  doubleTapAction?: HaActionValue;
}>;

const validateAction = compileValidator(HaAction);
const actionOf = (value: unknown): HaActionValue | undefined => (validateAction(value) ? value : undefined);

const gestures = [
  ["tap_action", "tapAction", "Click action"],
  ["hold_action", "holdAction", "Long click action"],
  ["double_tap_action", "doubleTapAction", "Double click action"],
] as const;

const fallbackActions = [
  ["", "Default"],
  ["toggle", "Toggle"],
  ["more-info", "More info"],
  ["none", "Nothing"],
] as const;

/** Fields with the given values; absent values are left out, so an empty binding stays empty. */
const fieldsOf = (
  entity: string | undefined,
  actions: Readonly<Partial<Record<"tapAction" | "holdAction" | "doubleTapAction", HaActionValue>>>,
): ClickableFields => ({
  ...(entity === undefined ? {} : { stateEntityId: entity }),
  ...(actions.tapAction === undefined ? {} : { tapAction: actions.tapAction }),
  ...(actions.holdAction === undefined ? {} : { holdAction: actions.holdAction }),
  ...(actions.doubleTapAction === undefined ? {} : { doubleTapAction: actions.doubleTapAction }),
});

export class HomeplanBindingFields extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    haForm: { attribute: false },
    fields: { attribute: false },
    domain: { attribute: false },
    entityLabel: { attribute: false },
    suggestions: { attribute: false },
  };

  static override styles = [
    tokens,
    fieldStyles,
    css`
      :host {
        display: grid;
        gap: 12px;
      }
    `,
  ];

  declare store: HassStore | undefined;
  declare haForm: boolean;
  declare fields: ClickableFields;
  /** Limits the entity picker to one domain (lights: `light`). */
  declare domain: string | undefined;
  declare entityLabel: string;
  /** The best entities for this binding (10.3), shown as chips under the entity. */
  declare suggestions: readonly EntitySuggestion[];

  constructor() {
    super();
    this.haForm = false;
    this.fields = {};
    this.domain = undefined;
    this.entityLabel = "Entity";
    this.suggestions = [];
  }

  private emit(fields: ClickableFields): void {
    this.dispatchEvent(new CustomEvent<ClickableFields>("fields-change", { detail: fields }));
  }

  private actions(): Readonly<
    Partial<Record<"tapAction" | "holdAction" | "doubleTapAction", HaActionValue>>
  > {
    return {
      tapAction: this.fields.tapAction,
      holdAction: this.fields.holdAction,
      doubleTapAction: this.fields.doubleTapAction,
    };
  }

  private renderSuggestions(): TemplateResult {
    return html`<homeplan-entity-suggestions
      .suggestions=${this.suggestions}
      .current=${this.fields.stateEntityId ?? null}
      @suggestion-pick=${(event: CustomEvent<string>) => {
        this.emit(fieldsOf(event.detail, this.actions()));
      }}
    ></homeplan-entity-suggestions>`;
  }

  /** The entity and the actions in two forms, so the suggestions sit under the entity. */
  private renderHaForm(): TemplateResult {
    const entitySchema = [
      {
        name: "entity",
        selector: { entity: this.domain === undefined ? {} : { filter: { domain: this.domain } } },
      },
    ];
    const actionSchema = gestures.map(([name]) => ({ name, selector: { ui_action: {} } }));
    const labels: Readonly<Record<string, string>> = {
      entity: this.entityLabel,
      ...Object.fromEntries(gestures.map(([name, , label]) => [name, label])),
    };
    const data: Record<string, unknown> = {};
    for (const [formKey, key] of gestures) data[formKey] = this.fields[key];
    return html`<ha-form
        .hass=${this.store?.current()}
        .data=${{ entity: this.fields.stateEntityId ?? undefined }}
        .schema=${entitySchema}
        .computeLabel=${(item: { name: string }) => labels[item.name] ?? item.name}
        @value-changed=${(event: Event) => {
          const value = formValue(event);
          if (value !== null) this.emit(fieldsOf(text(value.entity), this.actions()));
        }}
      ></ha-form>
      ${this.renderSuggestions()}
      <ha-form
        .hass=${this.store?.current()}
        .data=${data}
        .schema=${actionSchema}
        .computeLabel=${(item: { name: string }) => labels[item.name] ?? item.name}
        @value-changed=${(event: Event) => {
          const value = formValue(event);
          if (value !== null)
            this.emit(
              fieldsOf(this.fields.stateEntityId ?? undefined, {
                tapAction: actionOf(value.tap_action),
                holdAction: actionOf(value.hold_action),
                doubleTapAction: actionOf(value.double_tap_action),
              }),
            );
        }}
      ></ha-form>`;
  }

  private renderFallback(): TemplateResult {
    const entity = this.fields.stateEntityId ?? null;
    const actions = this.actions();
    return html`
      <label>
        ${this.entityLabel}
        <select
          @change=${(event: Event) => {
            this.emit(fieldsOf(text(valueOf(event)), actions));
          }}
        >
          <option value="" ?selected=${entity === null}>None</option>
          ${entityIds(this.store, this.domain).map(
            (id) => html`<option value=${id} ?selected=${id === entity}>${id}</option>`,
          )}
        </select>
      </label>
      ${this.renderSuggestions()}
      ${gestures.map(
        ([, key, label]) => html`
          <label>
            ${label}
            <select
              @change=${(event: Event) => {
                const chosen = text(valueOf(event));
                this.emit(
                  fieldsOf(entity ?? undefined, {
                    ...actions,
                    [key]: chosen === undefined ? undefined : { action: chosen },
                  }),
                );
              }}
            >
              ${[
                ...fallbackActions,
                // An action set in HA (for example perform-action) is kept and shown by its name.
                ...(fallbackActions.some(([value]) => value === (this.fields[key]?.action ?? ""))
                  ? []
                  : [[this.fields[key]?.action ?? "", this.fields[key]?.action ?? ""] as const]),
              ].map(
                ([value, name]) =>
                  html`<option value=${value} ?selected=${(this.fields[key]?.action ?? "") === value}>
                    ${name}
                  </option>`,
              )}
            </select>
          </label>
        `,
      )}
    `;
  }

  protected override render(): TemplateResult {
    return this.haForm ? this.renderHaForm() : this.renderFallback();
  }
}
