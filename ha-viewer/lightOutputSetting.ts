// A light's output re-adjusted from Home Assistant (Phase 13.6; spec/home-assistant/light-state.md#lumens-and-
// temperature-overrides), in the light's Settings editor: **Lumens** and **Temperature**, each showing the house
// value until changed, with **Reset to the house value**. A colour entity's live colour wins, so Temperature is then
// disabled with the reason. Changes go up as a draft (`light-output-change`); Settings' Save stores them beside the
// light's binding. `house.json` is never edited.
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, TemplateResult } from "lit";
import { haLightKelvin, haLightLumens } from "@shared/domain/schemas/homeAssistant";
import { fieldStyles, formValue, numberOf, valueOf } from "./formHelpers";
import { EntitiesController } from "./hassStore";
import type { HassStore } from "./hassStore";
import { entityColourMode, validKelvin, validLumens } from "./lightOutput";
import type { HouseLightOutput } from "./lightOutput";
import { tokens } from "./styles/tokens";

/** The overrides of one light; an absent field keeps the house value. */
export type LightOutputOverrides = Readonly<{ lumens?: number; kelvin?: number }>;

const lumensText = (lumens: number): string => `${lumens.toLocaleString()} lm`;

export class HomeplanLightOutputSetting extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    haForm: { attribute: false },
    entityId: { attribute: false },
    house: { attribute: false },
    lumens: { attribute: false },
    kelvin: { attribute: false },
  };

  static override styles = [
    tokens,
    fieldStyles,
    css`
      :host {
        display: grid;
        gap: 12px;
      }
      .field {
        display: grid;
        gap: 4px;
      }
      .foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 32px;
      }
    `,
  ];

  declare store: HassStore | undefined;
  declare haForm: boolean;
  /** The light's bound entity (its colour mode decides whether Temperature applies). */
  declare entityId: string | null;
  declare house: HouseLightOutput | undefined;
  declare lumens: number | undefined;
  declare kelvin: number | undefined;
  private entities: EntitiesController | null = null;

  constructor() {
    super();
    this.haForm = false;
    this.entityId = null;
    this.house = undefined;
    this.lumens = undefined;
    this.kelvin = undefined;
  }

  protected override willUpdate(): void {
    if (this.store !== undefined && this.entities === null)
      this.entities = new EntitiesController(this, this.store);
    // The colour mode is followed live: a colour light turned on reports it.
    this.entities?.setEntityIds(this.entityId === null ? [] : [this.entityId]);
  }

  private emit(next: LightOutputOverrides): void {
    this.dispatchEvent(new CustomEvent<LightOutputOverrides>("light-output-change", { detail: next }));
  }

  /** A new lumens value; the house value (or none) removes the override. */
  private setLumens(value: number | undefined): void {
    const house = this.house;
    const lumens = validLumens(value);
    if (lumens === undefined && value !== undefined) return;
    const { lumens: _previous, ...rest } = this.current();
    this.emit(lumens === undefined || lumens === house?.lumens ? rest : { ...rest, lumens });
  }

  private setKelvin(value: number | undefined): void {
    const house = this.house;
    const kelvin = validKelvin(value);
    if (kelvin === undefined && value !== undefined) return;
    const { kelvin: _previous, ...rest } = this.current();
    // An RGB light has no temperature of its own, so any temperature is an override there.
    this.emit(
      kelvin === undefined || (kelvin === house?.kelvin && house.mode !== "rgb") ? rest : { ...rest, kelvin },
    );
  }

  private current(): LightOutputOverrides {
    return {
      ...(this.lumens === undefined ? {} : { lumens: this.lumens }),
      ...(this.kelvin === undefined ? {} : { kelvin: this.kelvin }),
    };
  }

  private renderNumber(
    options: Readonly<{
      name: string;
      label: string;
      value: number;
      min: number;
      max: number;
      step: number;
      unit: string;
      disabled: boolean;
      set: (value: number | undefined) => void;
    }>,
  ): TemplateResult {
    if (this.haForm)
      return html`<ha-form
        .hass=${this.store?.current()}
        .data=${{ [options.name]: options.value }}
        .disabled=${options.disabled}
        .schema=${[
          {
            name: options.name,
            selector: {
              number: {
                min: options.min,
                max: options.max,
                step: options.step,
                mode: "box",
                unit_of_measurement: options.unit,
              },
            },
          },
        ]}
        .computeLabel=${() => options.label}
        @value-changed=${(event: Event) => {
          const value = formValue(event);
          if (value !== null) options.set(numberOf(value[options.name]));
        }}
      ></ha-form>`;
    return html`<label>
      ${options.label} (${options.unit})
      <input
        type="number"
        min=${options.min}
        max=${options.max}
        step=${options.step}
        ?disabled=${options.disabled}
        .value=${String(options.value)}
        @change=${(event: Event) => {
          options.set(numberOf(valueOf(event)));
        }}
      />
    </label>`;
  }

  private renderReset(changed: boolean, reset: () => void, houseText: string): TemplateResult {
    return html`<div class="foot">
      <span class="hint">${changed ? `House value: ${houseText}.` : "The house value."}</span>
      ${
        changed
          ? html`<button
              class="text-button"
              @click=${() => {
                reset();
              }}
            >
              Reset to the house value
            </button>`
          : nothing
      }
    </div>`;
  }

  protected override render(): TemplateResult {
    const house = this.house;
    if (house === undefined)
      return html`<span class="hint">This light's house values are not available.</span>`;
    const colourMode =
      this.entityId === null ? null : entityColourMode(this.store?.entity(this.entityId)?.attributes);
    const houseKelvin = house.mode === "rgb" ? "an RGB colour" : `${String(house.kelvin)} K`;
    return html`
      <div class="field">
        ${this.renderNumber({
          name: "lumens",
          label: "Lumens",
          value: this.lumens ?? house.lumens,
          min: 1,
          max: haLightLumens.maximum,
          step: 1,
          unit: "lm",
          disabled: false,
          set: (value) => {
            this.setLumens(value);
          },
        })}
        ${this.renderReset(
          this.lumens !== undefined,
          () => {
            this.setLumens(undefined);
          },
          lumensText(house.lumens),
        )}
        <span class="hint">The entity's brightness dims this output.</span>
      </div>
      <div class="field">
        ${this.renderNumber({
          name: "kelvin",
          label: "Temperature",
          value: this.kelvin ?? house.kelvin,
          min: haLightKelvin.minimum,
          max: haLightKelvin.maximum,
          step: haLightKelvin.step,
          unit: "K",
          disabled: colourMode !== null,
          set: (value) => {
            this.setKelvin(value);
          },
        })}
        ${
          colourMode === null
            ? this.renderReset(
                this.kelvin !== undefined,
                () => {
                  this.setKelvin(undefined);
                },
                houseKelvin,
              )
            : html`<span class="hint">
                  Not used: ${this.entityId ?? "the entity"} is a colour light (colour mode ${colourMode}), so
                  its own colour or colour temperature is
                  drawn.${
                    this.kelvin === undefined
                      ? ""
                      : ` A saved ${String(this.kelvin)} K applies only without it.`
                  }
                </span>
                ${
                  this.kelvin === undefined
                    ? nothing
                    : html`<div>
                        <button
                          class="text-button"
                          @click=${() => {
                            this.setKelvin(undefined);
                          }}
                        >
                          Reset to the house value
                        </button>
                      </div>`
                }`
        }
      </div>
    `;
  }
}
