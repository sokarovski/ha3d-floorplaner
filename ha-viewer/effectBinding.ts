// One ambient effect's binding (D25, spec/home-assistant/bindings.md#editor), edited under its object: when it
// runs (`visibleWhen`) and variants that change its look while their condition holds (kind, colour, direction,
// size). Applied by the effects layer in 8.4; here they are stored and evaluated live (the active variant is marked).
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, PropertyValues, TemplateResult } from "lit";
import { activeVariant, entitiesOf } from "@shared/domain/homeAssistant/conditions";
import type {
  HaConditionValue,
  HaEffectBindingValue,
  HaEffectVariantValue,
} from "@shared/domain/schemas/homeAssistant";
import { fieldStyles, formValue, numberOf, valueOf } from "./formHelpers";
import { EntitiesController } from "./hassStore";
import type { HassStore } from "./hassStore";
import { tokens } from "./styles/tokens";
import { optionalChange } from "./events";
import type { OptionalChange } from "./events";

/** The "keep the authored value" choice; not empty, because HA's select shows an empty value as blank. */
const keep = "keep";

type Rgb = [number, number, number];

const rgbOf = (value: unknown): Rgb | undefined => {
  if (!Array.isArray(value)) return undefined;
  const r: unknown = value[0];
  const g: unknown = value[1];
  const b: unknown = value[2];
  const channel = (part: unknown): number | undefined =>
    typeof part === "number" && Number.isFinite(part)
      ? Math.min(Math.max(Math.round(part), 0), 255)
      : undefined;
  const red = channel(r);
  const green = channel(g);
  const blue = channel(b);
  return red === undefined || green === undefined || blue === undefined ? undefined : [red, green, blue];
};

const hex = (rgb: readonly number[]): string =>
  `#${rgb.map((part) => part.toString(16).padStart(2, "0")).join("")}`;

const rgbOfHex = (value: string | null): Rgb | undefined => {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value ?? "");
  if (match === null) return undefined;
  return [parseInt(match[1] ?? "0", 16), parseInt(match[2] ?? "0", 16), parseInt(match[3] ?? "0", 16)];
};

/** A variant's overrides from form values; empty choices keep the authored value. */
const overridesOf = (
  when: HaConditionValue,
  value: Readonly<Record<string, unknown>>,
): HaEffectVariantValue => {
  const color = rgbOf(value.color);
  const sizeMm = numberOf(value.sizeMm);
  return {
    when,
    ...(value.kind === "swirl" || value.kind === "vapour" ? { kind: value.kind } : {}),
    ...(color === undefined ? {} : { color }),
    ...(value.direction === "up" || value.direction === "forward" ? { direction: value.direction } : {}),
    ...(sizeMm === undefined ? {} : { sizeMm: Math.min(Math.max(sizeMm, 100), 3000) }),
  };
};

/** Nothing set: the binding is not stored. */
const isEmpty = (binding: HaEffectBindingValue): boolean =>
  binding.visibleWhen === undefined && (binding.variants ?? []).length === 0;

export class HomeplanEffectBinding extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    haForm: { attribute: false },
    name: { attribute: false },
    binding: { attribute: false },
    defaultEntity: { attribute: false },
    authoredColor: { attribute: false },
  };

  static override styles = [
    tokens,
    fieldStyles,
    css`
      :host {
        display: grid;
        gap: 10px;
      }
      h4 {
        margin: 4px 0 0;
        font-size: 13px;
        font-weight: 500;
      }
      .variant {
        display: grid;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--hp-divider);
      }
      .variant[data-active] {
        border-color: var(--success-color, #43a047);
      }
      .variant-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
      }
      .plain {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
    `,
  ];

  declare store: HassStore | undefined;
  declare haForm: boolean;
  declare name: string;
  declare binding: HaEffectBindingValue | undefined;
  declare defaultEntity: string | null;
  /** The effect's authored colour, where a variant's custom colour starts. */
  declare authoredColor: readonly number[];
  private entities: EntitiesController | null = null;

  constructor() {
    super();
    this.haForm = false;
    this.name = "Effect";
    this.binding = undefined;
    this.defaultEntity = null;
    this.authoredColor = [255, 255, 255];
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("store") && this.store !== undefined && this.entities === null)
      this.entities = new EntitiesController(this, this.store);
    // The active-variant mark follows the variants' entities.
    this.entities?.setEntityIds(entitiesOf({ variants: this.binding?.variants ?? [] }));
  }

  private emit(binding: HaEffectBindingValue): void {
    this.dispatchEvent(
      optionalChange<HaEffectBindingValue>("effect-change", isEmpty(binding) ? undefined : binding),
    );
  }

  private current(): HaEffectBindingValue {
    return this.binding ?? {};
  }

  private setVariants(variants: readonly HaEffectVariantValue[]): void {
    const { visibleWhen } = this.current();
    this.emit({
      ...(visibleWhen === undefined ? {} : { visibleWhen }),
      ...(variants.length === 0 ? {} : { variants: [...variants] }),
    });
  }

  private setVariant(index: number, variant: HaEffectVariantValue): void {
    this.setVariants(
      (this.current().variants ?? []).map((current, at) => (at === index ? variant : current)),
    );
  }

  private renderOverrides(variant: HaEffectVariantValue, index: number): TemplateResult {
    if (this.haForm) {
      const schema = [
        {
          name: "kind",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: keep, label: "Keep" },
                { value: "swirl", label: "Swirl" },
                { value: "vapour", label: "Vapour" },
              ],
            },
          },
        },
        // HA's colour selector shows "no colour" as black, so a switch decides whether the variant sets one.
        { name: "customColor", selector: { boolean: {} } },
        ...(variant.color === undefined ? [] : [{ name: "color", selector: { color_rgb: {} } }]),
        {
          name: "direction",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: keep, label: "Keep" },
                { value: "up", label: "Up" },
                { value: "forward", label: "Forward" },
              ],
            },
          },
        },
        {
          name: "sizeMm",
          selector: { number: { min: 100, max: 3000, step: 10, mode: "box", unit_of_measurement: "mm" } },
        },
      ];
      const labels: Readonly<Record<string, string>> = {
        kind: "Kind",
        customColor: "Custom colour (off keeps the authored colour)",
        color: "Colour",
        direction: "Direction",
        sizeMm: "Size",
      };
      return html`<ha-form
        .hass=${this.store?.current()}
        .data=${{
          kind: variant.kind ?? keep,
          customColor: variant.color !== undefined,
          color: variant.color,
          direction: variant.direction ?? keep,
          sizeMm: variant.sizeMm,
        }}
        .schema=${schema}
        .computeLabel=${(item: { name: string }) => labels[item.name] ?? item.name}
        @value-changed=${(event: Event) => {
          const value = formValue(event);
          if (value === null) return;
          // Switching the custom colour on starts from the authored colour; off removes it.
          const color =
            value.customColor === true ? (rgbOf(value.color) ?? rgbOf([...this.authoredColor])) : undefined;
          this.setVariant(index, overridesOf(variant.when, { ...value, color }));
        }}
      ></ha-form>`;
    }
    const values: Record<string, unknown> = {
      kind: variant.kind,
      color: variant.color,
      direction: variant.direction,
      sizeMm: variant.sizeMm,
    };
    const set = (name: string, value: unknown): void => {
      this.setVariant(index, overridesOf(variant.when, { ...values, [name]: value }));
    };
    return html`<div class="plain">
      <label>
        Kind
        <select
          @change=${(event: Event) => {
            set("kind", valueOf(event));
          }}
        >
          <option value=${keep} ?selected=${variant.kind === undefined}>Keep</option>
          <option value="swirl" ?selected=${variant.kind === "swirl"}>Swirl</option>
          <option value="vapour" ?selected=${variant.kind === "vapour"}>Vapour</option>
        </select>
      </label>
      <label>
        Direction
        <select
          @change=${(event: Event) => {
            set("direction", valueOf(event));
          }}
        >
          <option value=${keep} ?selected=${variant.direction === undefined}>Keep</option>
          <option value="up" ?selected=${variant.direction === "up"}>Up</option>
          <option value="forward" ?selected=${variant.direction === "forward"}>Forward</option>
        </select>
      </label>
      <label>
        Colour
        <span>
          <input
            type="color"
            .value=${hex(variant.color ?? this.authoredColor)}
            @change=${(event: Event) => {
              set("color", rgbOfHex(valueOf(event)));
            }}
          />
          ${
            variant.color === undefined
              ? html`<span class="hint">keeps the authored colour</span>`
              : html`<button
                  class="text-button"
                  @click=${() => {
                    set("color", undefined);
                  }}
                >
                  Keep authored
                </button>`
          }
        </span>
      </label>
      <label>
        Size (mm, empty keeps)
        <input
          type="number"
          min="100"
          max="3000"
          step="10"
          .value=${variant.sizeMm === undefined ? "" : String(variant.sizeMm)}
          @change=${(event: Event) => {
            set("sizeMm", valueOf(event));
          }}
        />
      </label>
    </div>`;
  }

  protected override render(): TemplateResult {
    const binding = this.current();
    const variants = binding.variants ?? [];
    const store = this.store;
    const active = store === undefined ? null : activeVariant(binding, (entityId) => store.entity(entityId));
    return html`
      <h4>Runs when</h4>
      <homeplan-condition-editor
        .store=${this.store}
        .haForm=${this.haForm}
        .condition=${binding.visibleWhen}
        .defaultEntity=${this.defaultEntity}
        .emptyText=${"Always runs"}
        @condition-change=${(event: CustomEvent<OptionalChange<HaConditionValue>>) => {
          const visibleWhen = event.detail.value;
          this.emit({
            ...(visibleWhen === undefined ? {} : { visibleWhen }),
            ...(variants.length === 0 ? {} : { variants: [...variants] }),
          });
        }}
      ></homeplan-condition-editor>
      <h4>Variants (the first whose condition holds changes the look)</h4>
      ${variants.map(
        (variant, index) =>
          html`<div class="variant" ?data-active=${variant === active}>
            <div class="variant-head">
              <span>Variant ${index + 1}${variant === active ? " · active now" : ""}</span>
              <button
                class="text-button"
                @click=${() => {
                  this.setVariants(variants.filter((_, at) => at !== index));
                }}
              >
                Remove
              </button>
            </div>
            <homeplan-condition-editor
              .store=${this.store}
              .haForm=${this.haForm}
              .condition=${variant.when}
              .defaultEntity=${this.defaultEntity}
              .emptyText=${"Add a test"}
              @condition-change=${(event: CustomEvent<OptionalChange<HaConditionValue>>) => {
                // A variant needs a condition; while it has none it keeps its last one.
                const when = event.detail.value;
                if (when !== undefined) this.setVariant(index, { ...variant, when });
              }}
            ></homeplan-condition-editor>
            ${this.renderOverrides(variant, index)}
          </div>`,
      )}
      <div>
        <button
          class="text-button"
          ?disabled=${variants.length >= 8}
          @click=${() => {
            const entity = this.defaultEntity;
            // A new variant starts with a test on the object's entity (or an always-true empty group).
            const when: HaConditionValue =
              entity === null
                ? { condition: "and", conditions: [] }
                : { condition: "state", entity, state: "on" };
            this.setVariants([...variants, { when }]);
          }}
        >
          + Add variant
        </button>
        ${variants.length === 0 ? html`<span class="hint">No variants: the authored look.</span>` : nothing}
      </div>
    `;
  }
}
