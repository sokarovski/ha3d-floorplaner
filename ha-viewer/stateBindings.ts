// An object's state-parameter bindings (Phase 9.7, spec/home-assistant/bindings.md#state-parameters), edited in
// the object's binding popup: one block per live-state parameter its template declares (title, type, choices,
// limits from the metadata), each with an entity, an optional attribute, and how the value maps onto the
// parameter (a value table, a threshold, a linear range, or a band), and for a choice parameter an optional second
// entity read when the first gives no value (10.5). A boolean read from a cover's tilt offers the tilt conventions
// with a live preview and test buttons that move the real cover (10.4). Nothing here knows a door or a blind.
// Inside Home Assistant every field is an ha-form selector (13.5): entity, attribute (HA's friendly attribute
// names), Is one of (the entity's states or attribute values), mapping kind, numbers, values, and the tilt
// convention, laid out as titled sections; plain controls otherwise (the harness).
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, PropertyValues, TemplateResult } from "lit";
import {
  defaultStateMap,
  defaultStateMapping,
  mappedStateValue,
  mappingEntity,
  secondSource,
  sourceValue,
  stateParameterValue,
  supportsTiltPosition,
  tiltAttribute,
  tiltClosedValue,
  tiltConventionMap,
  tiltConventionOf,
  tiltConventions,
  tiltPositions,
} from "@shared/domain/homeAssistant/stateParameters";
import type {
  HaStateMappingValue,
  HaStateMapValue,
  HaStateSourceValue,
  HaStateValueValue,
} from "@shared/domain/schemas/homeAssistant";
import { maxStateCases } from "@shared/domain/schemas/homeAssistant";
import type { TemplateStateParameter } from "@shared/domain/templates/metadata";
import type { EntitySuggestion } from "@shared/domain/homeAssistant/suggestions";
import { entityIds, fieldStyles, formValue, numberOf, text, valueOf } from "./formHelpers";
import { EntitiesController } from "./hassStore";
import type { HassStore } from "./hassStore";
import { tokens } from "./styles/tokens";
import { optionalChange } from "./events";

/** A binding's state mappings by parameter name. */
export type StateMappings = Readonly<Record<string, HaStateMappingValue>>;

/** The best entities for a parameter (10.3), best first. */
export type StateSuggester = (parameter: TemplateStateParameter) => readonly EntitySuggestion[];

/** The value standing for "Keep the stored value" in a choice. */
const keepStored = "__keep__";

const kindLabels: readonly (readonly [HaStateMapValue["kind"], string])[] = [
  ["table", "Value table"],
  ["threshold", "Threshold"],
  ["band", "Band (between two numbers)"],
  ["linear", "Linear range"],
];

/** The convention select's value for a mapping of its own. */
const customTiltOption = "custom";

const domainOf = (entityId: string): string => entityId.split(".")[0] ?? "";

/** The parameter's type in words: "On / off", "Number 0–90 °", "Closed, Tilt, or Swing". */
const typeText = (parameter: TemplateStateParameter): string => {
  if (parameter.type === "boolean") return "On / off";
  if (parameter.type === "number") {
    const range =
      parameter.minimum === undefined || parameter.maximum === undefined
        ? ""
        : ` ${String(parameter.minimum)}–${String(parameter.maximum)}`;
    return `Number${range}${parameter.unit === undefined ? "" : ` ${parameter.unit}`}`;
  }
  return (parameter.choices ?? []).map((choice) => choice.title).join(" / ");
};

/** A parameter value in words (for "Now:"). */
const valueText = (parameter: TemplateStateParameter, value: HaStateValueValue): string => {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "number")
    return `${String(Math.round(value * 10) / 10)}${parameter.unit === undefined ? "" : ` ${parameter.unit}`}`;
  return parameter.choices?.find((choice) => choice.value === value)?.title ?? value;
};

/** A form value read back as the parameter's type. */
const parsedValue = (parameter: TemplateStateParameter, raw: string): HaStateValueValue | undefined => {
  if (parameter.type === "boolean") return raw === "true" ? true : raw === "false" ? false : undefined;
  if (parameter.type === "number") return numberOf(raw);
  return raw === "" ? undefined : raw;
};

/** A case's states as stored: one state as text, several as a list, none as "" (the list needs one). */
const storedStates = (states: readonly string[]): string | string[] =>
  states.length <= 1 ? (states[0] ?? "") : [...states];

/** A case's states as a list (the HA state selector's value); "" is none. */
const statesList = (state: string | readonly string[]): readonly string[] =>
  typeof state === "string" ? (state === "" ? [] : [state]) : state;

/** The plain fallback's comma-separated states (outside Home Assistant). */
const statesText = (state: string | readonly string[]): string => statesList(state).join(", ");

const statesOf = (value: string): string | string[] =>
  storedStates(
    value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== ""),
  );

/** The state selector's value read back: its texts, without empty ones. */
const selectedStates = (value: unknown): readonly string[] =>
  typeof value === "string"
    ? value === ""
      ? []
      : [value]
    : Array.isArray(value)
      ? value.filter((part): part is string => typeof part === "string" && part !== "")
      : [];

/** One ha-form field. */
type FormField = Readonly<{ name: string; selector: Readonly<Record<string, unknown>> }>;

/** HA's selector for one value of the parameter's type; `keep` adds "Keep stored" to a choice. */
const valueSelector = (
  parameter: TemplateStateParameter,
  keep: boolean,
): Readonly<Record<string, unknown>> => {
  if (parameter.type === "number")
    return {
      number: {
        mode: "box",
        step: "any",
        ...(parameter.minimum === undefined ? {} : { min: parameter.minimum }),
        ...(parameter.maximum === undefined ? {} : { max: parameter.maximum }),
        ...(parameter.unit === undefined ? {} : { unit_of_measurement: parameter.unit }),
      },
    };
  const options =
    parameter.type === "boolean"
      ? [
          { value: "true", label: "On" },
          { value: "false", label: "Off" },
        ]
      : (parameter.choices ?? []).map((choice) => ({ value: choice.value, label: choice.title }));
  return {
    select: {
      mode: "dropdown",
      options: keep ? [{ value: keepStored, label: "Keep stored" }, ...options] : options,
    },
  };
};

/** A value as its selector holds it. */
const selectorValue = (
  parameter: TemplateStateParameter,
  value: HaStateValueValue | undefined,
  keep: boolean,
): unknown => {
  if (parameter.type === "number") return typeof value === "number" ? value : undefined;
  return value === undefined ? (keep ? keepStored : undefined) : String(value);
};

/** A selector's value read back as the parameter's type; undefined for none (or Keep stored). */
const selectorRead = (parameter: TemplateStateParameter, raw: unknown): HaStateValueValue | undefined => {
  if (parameter.type === "number") return numberOf(raw);
  return typeof raw === "string" && raw !== keepStored ? parsedValue(parameter, raw) : undefined;
};

const numberField = (name: string): FormField => ({
  name,
  selector: { number: { mode: "box", step: "any" } },
});

/** A source with a new attribute (undefined: read the state) and map. */
const withSource = <S extends HaStateSourceValue>(
  source: S,
  attribute: string | undefined,
  map: HaStateMapValue,
): Omit<S, "attribute" | "map"> & HaStateSourceValue => {
  const { attribute: _previous, map: _map, ...rest } = source;
  return attribute === undefined ? { ...rest, map } : { ...rest, attribute, map };
};

export class HomeplanStateBindings extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    haForm: { attribute: false },
    parameters: { attribute: false },
    states: { attribute: false },
    defaultEntity: { attribute: false },
    suggest: { attribute: false },
  };

  static override styles = [
    tokens,
    fieldStyles,
    css`
      :host {
        display: grid;
        gap: 10px;
      }
      .parameter {
        display: grid;
        gap: 8px;
        padding: 12px;
        border-radius: 12px;
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.03));
      }
      .head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
      }
      .title {
        font-weight: 500;
      }
      .now {
        font-size: 12px;
        color: var(--hp-muted);
        white-space: nowrap;
      }
      .now[data-live] {
        color: var(--success-color, #43a047);
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .test,
      .second {
        display: grid;
        gap: 8px;
      }
      .second {
        padding-top: 8px;
        border-top: 1px solid var(--hp-divider);
      }
      .case {
        display: grid;
        grid-template-columns: 1.4fr 1fr auto;
        gap: 8px;
        align-items: end;
      }
      /* Inside HA (13.5): the mapping as titled sections, each case a row like the condition editor's tests. */
      .section {
        display: grid;
        gap: 8px;
      }
      .section-title {
        margin-top: 4px;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--hp-muted);
      }
      .case-row {
        display: grid;
        gap: 4px;
        padding: 8px 8px 8px 12px;
        border-left: 3px solid var(--hp-divider);
      }
      .case-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        color: var(--hp-muted);
      }
      .preview {
        font-size: 12px;
        color: var(--hp-muted);
      }
      .preview[data-live] {
        color: var(--success-color, #43a047);
      }
    `,
  ];

  declare store: HassStore | undefined;
  declare haForm: boolean;
  /** The template's state parameters; null while the template loads. */
  declare parameters: readonly TemplateStateParameter[] | null;
  declare states: StateMappings | undefined;
  /** The binding's entity: what a mapping without its own entity reads, and the first entity offered. */
  declare defaultEntity: string | null;
  /** Suggested entities per parameter (10.3); one click picks one with its domain's default mapping. */
  declare suggest: StateSuggester;
  private entities: EntitiesController | null = null;
  /** Blinds parameters whose tilt mapping is edited by hand although it matches a convention. */
  private customTilt = new Set<string>();
  /** The last tilt test's outcome per parameter ("Sent: tilt 50", or the error). */
  private tiltTest = new Map<string, string>();

  constructor() {
    super();
    this.haForm = false;
    this.parameters = null;
    this.states = undefined;
    this.defaultEntity = null;
    this.suggest = () => [];
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("store") && this.store !== undefined && this.entities === null)
      this.entities = new EntitiesController(this, this.store);
    // "Now:" follows the mapped entities.
    const ids = Object.values(this.states ?? {}).flatMap((mapping) =>
      [mapping, ...(mapping.fallback === undefined ? [] : [mapping.fallback])].flatMap((source) => {
        const id = mappingEntity(source, this.defaultEntity);
        return id === null ? [] : [id];
      }),
    );
    this.entities?.setEntityIds(ids);
  }

  private emit(states: StateMappings): void {
    this.dispatchEvent(
      optionalChange<StateMappings>("states-change", Object.keys(states).length === 0 ? undefined : states),
    );
  }

  private setMapping(name: string, mapping: HaStateMappingValue | undefined): void {
    const others = Object.fromEntries(Object.entries(this.states ?? {}).filter(([key]) => key !== name));
    this.emit(mapping === undefined ? others : { ...others, [name]: mapping });
  }

  /** A new entity starts with its domain's default mapping; none removes the mapping. */
  private setEntity(parameter: TemplateStateParameter, entityId: string | undefined): void {
    if (entityId === undefined) {
      this.setMapping(parameter.name, undefined);
      return;
    }
    const current = this.states?.[parameter.name];
    if (current !== undefined && mappingEntity(current, this.defaultEntity) === entityId) return;
    this.setMapping(parameter.name, {
      entity: entityId,
      ...defaultStateMapping(domainOf(entityId), parameter, this.attributesOf(entityId)),
    });
  }

  private attributesOf(entityId: string): Readonly<Record<string, unknown>> {
    return this.store?.entity(entityId)?.attributes ?? {};
  }

  /**
   * A second entity for a choice parameter (10.5): its domain's default with a choice the first does not give,
   * and the first mapping's Otherwise moves to it, so the first falls through; none removes it (its Otherwise
   * goes back to the first).
   */
  private setSecondEntity(
    parameter: TemplateStateParameter,
    mapping: HaStateMappingValue,
    entityId: string | undefined,
  ): void {
    const { fallback, ...first } = mapping;
    if (entityId === undefined) {
      const otherwise = fallback?.map.kind === "table" ? fallback.map.otherwise : undefined;
      const restored =
        first.map.kind === "table" && first.map.otherwise === undefined && otherwise !== undefined
          ? { ...first, map: { ...first.map, otherwise } }
          : first;
      this.setMapping(parameter.name, restored);
      return;
    }
    if (fallback !== undefined && mappingEntity(fallback, this.defaultEntity) === entityId) return;
    const next = secondSource(domainOf(entityId), parameter, first, this.attributesOf(entityId));
    this.setMapping(parameter.name, { ...next.first, fallback: { entity: entityId, ...next.fallback } });
  }

  private renderEntity(
    entity: string | null,
    set: (entityId: string | undefined) => void,
    label = "Entity",
  ): TemplateResult {
    if (this.haForm)
      return html`<ha-form
        .hass=${this.store?.current()}
        .data=${{ entity: entity ?? undefined }}
        .schema=${[{ name: "entity", selector: { entity: {} } }]}
        .computeLabel=${() => `${label} (empty: not driven)`}
        @value-changed=${(event: Event) => {
          const value = formValue(event);
          if (value !== null) set(text(value.entity));
        }}
      ></ha-form>`;
    return html`<label>
      ${label}
      <select
        @change=${(event: Event) => {
          set(text(valueOf(event)));
        }}
      >
        <option value="" ?selected=${entity === null}>Not driven</option>
        ${entityIds(this.store).map(
          (id) => html`<option value=${id} ?selected=${id === entity}>${id}</option>`,
        )}
      </select>
    </label>`;
  }

  /** One HA form: its fields, their labels and helpers, and the whole value on every change. */
  private form(
    data: Readonly<Record<string, unknown>>,
    schema: readonly FormField[],
    labels: Readonly<Record<string, string>>,
    change: (value: Readonly<Record<string, unknown>>) => void,
    helpers: Readonly<Record<string, string>> = {},
  ): TemplateResult {
    return html`<ha-form
      .hass=${this.store?.current()}
      .data=${data}
      .schema=${schema}
      .computeLabel=${(item: { name: string }) => labels[item.name] ?? item.name}
      .computeHelper=${(item: { name: string }) => helpers[item.name] ?? ""}
      @value-changed=${(event: Event) => {
        const value = formValue(event);
        if (value !== null) change(value);
      }}
    ></ha-form>`;
  }

  /** The label of a value field, with the parameter's unit for a number. */
  private valueLabel(parameter: TemplateStateParameter, label: string): string {
    return parameter.type === "number" && parameter.unit !== undefined
      ? `${label} (${parameter.unit})`
      : label;
  }

  /** A control for one value of the parameter's type; `keep` adds "Keep the stored value". */
  private renderValue(
    parameter: TemplateStateParameter,
    label: string,
    value: HaStateValueValue | undefined,
    set: (value: HaStateValueValue | undefined) => void,
    keep = false,
  ): TemplateResult {
    if (this.haForm)
      return this.form(
        { value: selectorValue(parameter, value, keep) },
        [{ name: "value", selector: valueSelector(parameter, keep) }],
        { value: this.valueLabel(parameter, label) },
        (changed) => {
          const next = selectorRead(parameter, changed.value);
          // A number left empty keeps the stored value only where that is offered.
          if (next !== undefined || keep) set(next);
        },
        keep && parameter.type === "number" ? { value: "Empty keeps the stored value" } : {},
      );
    if (parameter.type === "number")
      return html`<label>
        ${label}${parameter.unit === undefined ? "" : ` (${parameter.unit})`}
        <input
          type="number"
          min=${parameter.minimum ?? ""}
          max=${parameter.maximum ?? ""}
          placeholder=${keep ? "keeps stored" : ""}
          .value=${typeof value === "number" ? String(value) : ""}
          @change=${(event: Event) => {
            set(parsedValue(parameter, valueOf(event) ?? ""));
          }}
        />
      </label>`;
    const options: readonly (readonly [string, string])[] =
      parameter.type === "boolean"
        ? [
            ["true", "On"],
            ["false", "Off"],
          ]
        : (parameter.choices ?? []).map((choice) => [choice.value, choice.title] as const);
    const current = value === undefined ? keepStored : String(value);
    return html`<label>
      ${label}
      <select
        @change=${(event: Event) => {
          const raw = valueOf(event) ?? keepStored;
          set(raw === keepStored ? undefined : parsedValue(parameter, raw));
        }}
      >
        ${keep ? html`<option value=${keepStored} ?selected=${current === keepStored}>Keep stored</option>` : nothing}
        ${options.map(
          ([option, title]) =>
            html`<option value=${option} ?selected=${option === current}>${title}</option>`,
        )}
      </select>
    </label>`;
  }

  /**
   * The mapping inside Home Assistant (13.5), with HA's selectors: a value table as cases (each **Is one of** the
   * entity's states or the attribute's values, and its value) and Otherwise; a threshold, band, or linear range as
   * one form of numbers and values.
   */
  private renderMapHaForm(
    parameter: TemplateStateParameter,
    mapping: HaStateSourceValue,
    entity: string | null,
    setMap: (map: HaStateMapValue) => void,
  ): TemplateResult {
    const map = mapping.map;
    const read = (raw: unknown): HaStateValueValue | undefined => selectorRead(parameter, raw);
    const valueField = (name: string): FormField => ({ name, selector: valueSelector(parameter, false) });
    const label = (text: string): string => this.valueLabel(parameter, text);
    if (map.kind === "table") {
      const fallback = defaultStateMap("table", parameter);
      const fallbackValue = fallback.kind === "table" ? (fallback.cases[0]?.value ?? true) : true;
      const subject = mapping.attribute === undefined ? "the state" : "the attribute";
      const setCase = (index: number, state: string | string[], value: HaStateValueValue): void => {
        setMap({
          ...map,
          cases: map.cases.map((other, at) => (at === index ? { ...other, state, value } : other)),
        });
      };
      return html`<div class="section">
        <span class="section-title">Cases</span>
        ${map.cases.length === 0 ? html`<span class="hint">No cases yet: Otherwise decides.</span>` : nothing}
        ${map.cases.map(
          (entry, index) =>
            html`<div class="case-row">
              <div class="case-head">
                <span
                  >Case ${index + 1}${statesList(entry.state).length === 0 ? " (choose a state)" : ""}</span
                >
                <button
                  class="text-button"
                  title="Remove this case"
                  @click=${() => {
                    setMap({ ...map, cases: map.cases.filter((_, at) => at !== index) });
                  }}
                >
                  Remove
                </button>
              </div>
              ${this.form(
                { state: [...statesList(entry.state)], value: selectorValue(parameter, entry.value, false) },
                [
                  {
                    name: "state",
                    selector: {
                      state: {
                        multiple: true,
                        ...(entity === null ? {} : { entity_id: entity }),
                        ...(mapping.attribute === undefined ? {} : { attribute: mapping.attribute }),
                      },
                    },
                  },
                  valueField("value"),
                ],
                { state: `When ${subject} is one of`, value: label(`Then ${parameter.title}`) },
                (value) => {
                  setCase(index, storedStates(selectedStates(value.state)), read(value.value) ?? entry.value);
                },
              )}
            </div>`,
        )}
        <div>
          <button
            class="text-button"
            ?disabled=${map.cases.length >= maxStateCases}
            @click=${() => {
              setMap({ ...map, cases: [...map.cases, { state: "", value: fallbackValue }] });
            }}
          >
            + Add case
          </button>
        </div>
        ${this.renderValue(
          parameter,
          "Otherwise",
          map.otherwise,
          (value) => {
            const { otherwise: _previous, ...rest } = map;
            setMap(value === undefined ? rest : { ...rest, otherwise: value });
          },
          true,
        )}
      </div>`;
    }
    if (map.kind === "threshold")
      return html`<div class="section">
        <span class="section-title">Threshold</span>
        ${this.form(
          {
            at: map.at,
            atOrBelow: selectorValue(parameter, map.atOrBelow, false),
            above: selectorValue(parameter, map.above, false),
          },
          [numberField("at"), valueField("atOrBelow"), valueField("above")],
          { at: "Threshold", atOrBelow: label("At or below it"), above: label("Above it") },
          (value) => {
            setMap({
              ...map,
              at: numberOf(value.at) ?? map.at,
              atOrBelow: read(value.atOrBelow) ?? map.atOrBelow,
              above: read(value.above) ?? map.above,
            });
          },
        )}
      </div>`;
    if (map.kind === "band")
      return html`<div class="section">
        <span class="section-title">Band</span>
        ${this.form(
          {
            from: map.from,
            to: map.to,
            inside: selectorValue(parameter, map.inside, false),
            outside: selectorValue(parameter, map.outside, false),
          },
          [numberField("from"), numberField("to"), valueField("inside"), valueField("outside")],
          {
            from: "From",
            to: "To",
            inside: label("From … to (inclusive)"),
            outside: label("Outside"),
          },
          (value) => {
            setMap({
              ...map,
              from: numberOf(value.from) ?? map.from,
              to: numberOf(value.to) ?? map.to,
              inside: read(value.inside) ?? map.inside,
              outside: read(value.outside) ?? map.outside,
            });
          },
        )}
      </div>`;
    const title = label(parameter.title);
    return html`<div class="section">
      <span class="section-title">Linear range</span>
      ${this.form(
        {
          fromStart: map.from.start,
          fromEnd: map.from.end,
          toStart: map.to.start,
          toEnd: map.to.end,
        },
        [numberField("fromStart"), numberField("fromEnd"), numberField("toStart"), numberField("toEnd")],
        {
          fromStart: "HA value from",
          fromEnd: "HA value to",
          toStart: `${title} from`,
          toEnd: `${title} to`,
        },
        (value) => {
          setMap({
            ...map,
            from: {
              start: numberOf(value.fromStart) ?? map.from.start,
              end: numberOf(value.fromEnd) ?? map.from.end,
            },
            to: { start: numberOf(value.toStart) ?? map.to.start, end: numberOf(value.toEnd) ?? map.to.end },
          });
        },
        { toEnd: "Values in between are mapped proportionally and clamped to this range." },
      )}
    </div>`;
  }

  private renderMap(
    parameter: TemplateStateParameter,
    mapping: HaStateSourceValue,
    setMap: (map: HaStateMapValue) => void,
  ): TemplateResult {
    const map = mapping.map;
    const fallback = defaultStateMap("table", parameter);
    const fallbackValue = fallback.kind === "table" ? (fallback.cases[0]?.value ?? true) : true;
    if (map.kind === "table")
      return html`
        ${map.cases.map(
          (entry, index) =>
            html`<div class="case">
              <label>
                When ${mapping.attribute ?? "the state"} is (comma-separated)
                <input
                  .value=${statesText(entry.state)}
                  @change=${(event: Event) => {
                    const cases = map.cases.map((other, at) =>
                      at === index ? { ...other, state: statesOf(valueOf(event) ?? "") } : other,
                    );
                    setMap({ ...map, cases });
                  }}
                />
              </label>
              ${this.renderValue(parameter, "Value", entry.value, (value) => {
                if (value === undefined) return;
                setMap({
                  ...map,
                  cases: map.cases.map((other, at) => (at === index ? { ...other, value } : other)),
                });
              })}
              <button
                class="text-button"
                title="Remove this case"
                @click=${() => {
                  setMap({ ...map, cases: map.cases.filter((_, at) => at !== index) });
                }}
              >
                Remove
              </button>
            </div>`,
        )}
        <div>
          <button
            class="text-button"
            ?disabled=${map.cases.length >= maxStateCases}
            @click=${() => {
              setMap({ ...map, cases: [...map.cases, { state: "", value: fallbackValue }] });
            }}
          >
            + Add case
          </button>
        </div>
        ${this.renderValue(
          parameter,
          "Otherwise",
          map.otherwise,
          (value) => {
            const { otherwise: _previous, ...rest } = map;
            setMap(value === undefined ? rest : { ...rest, otherwise: value });
          },
          true,
        )}
      `;
    if (map.kind === "threshold")
      return html`<div class="grid">
        <label>
          At or below
          <input
            type="number"
            .value=${String(map.at)}
            @change=${(event: Event) => {
              const at = numberOf(valueOf(event));
              if (at !== undefined) setMap({ ...map, at });
            }}
          />
        </label>
        ${this.renderValue(parameter, "Value at or below", map.atOrBelow, (value) => {
          if (value !== undefined) setMap({ ...map, atOrBelow: value });
        })}
        <span class="hint">Above the threshold:</span>
        ${this.renderValue(parameter, "Value above", map.above, (value) => {
          if (value !== undefined) setMap({ ...map, above: value });
        })}
      </div>`;
    if (map.kind === "band")
      return html`<div class="grid">
        <label>
          From
          <input
            type="number"
            .value=${String(map.from)}
            @change=${(event: Event) => {
              const from = numberOf(valueOf(event));
              if (from !== undefined) setMap({ ...map, from });
            }}
          />
        </label>
        <label>
          To
          <input
            type="number"
            .value=${String(map.to)}
            @change=${(event: Event) => {
              const to = numberOf(valueOf(event));
              if (to !== undefined) setMap({ ...map, to });
            }}
          />
        </label>
        ${this.renderValue(parameter, "Value from … to (inclusive)", map.inside, (value) => {
          if (value !== undefined) setMap({ ...map, inside: value });
        })}
        ${this.renderValue(parameter, "Value outside", map.outside, (value) => {
          if (value !== undefined) setMap({ ...map, outside: value });
        })}
      </div>`;
    type Range = Readonly<{ start: number; end: number }>;
    const range = (
      label: string,
      value: Range,
      apply: (value: Range) => HaStateMapValue,
    ): TemplateResult => html`
      <label>
        ${label} from
        <input
          type="number"
          .value=${String(value.start)}
          @change=${(event: Event) => {
            const number = numberOf(valueOf(event));
            if (number !== undefined) setMap(apply({ ...value, start: number }));
          }}
        />
      </label>
      <label>
        ${label} to
        <input
          type="number"
          .value=${String(value.end)}
          @change=${(event: Event) => {
            const number = numberOf(valueOf(event));
            if (number !== undefined) setMap(apply({ ...value, end: number }));
          }}
        />
      </label>
    `;
    const title = `${parameter.title}${parameter.unit === undefined ? "" : ` (${parameter.unit})`}`;
    return html`<div class="grid">
      ${range("HA value", map.from, (from) => ({ ...map, from }))}
      ${range(title, map.to, (to) => ({ ...map, to }))}
    </div>`;
  }

  /** Attribute, Mapping kind, and the map of one source (the mapping itself or its second entity). */
  private renderSource(
    parameter: TemplateStateParameter,
    source: HaStateSourceValue,
    setSource: (attribute: string | undefined, map: HaStateMapValue) => void,
    listId: string,
    showMap = true,
  ): TemplateResult {
    const store = this.store;
    const entity = mappingEntity(source, this.defaultEntity);
    const attributes = entity === null ? [] : Object.keys(store?.entity(entity)?.attributes ?? {}).sort();
    const setMap = (map: HaStateMapValue): void => {
      setSource(source.attribute, map);
    };
    if (this.haForm) {
      const kinds = kindLabels.filter(([kind]) => kind !== "linear" || parameter.type === "number");
      return html`<div class="section">
          <span class="section-title">Read</span>
          ${this.form(
            { attribute: source.attribute, kind: source.map.kind },
            [
              {
                name: "attribute",
                // HA's attribute selector names the entity's attributes as HA does; with no entity, plain text.
                selector: entity === null ? { text: {} } : { attribute: { entity_id: entity } },
              },
              ...(showMap
                ? [
                    {
                      name: "kind",
                      selector: {
                        select: {
                          mode: "dropdown",
                          options: kinds.map(([value, label]) => ({ value, label })),
                        },
                      },
                    },
                  ]
                : []),
            ],
            { attribute: "Attribute (optional)", kind: "Mapping" },
            (value) => {
              const attribute = text(value.attribute);
              if (attribute !== source.attribute) {
                setSource(attribute, source.map);
                return;
              }
              const kind = kinds.find(([option]) => option === value.kind)?.[0];
              if (kind !== undefined && kind !== source.map.kind) setMap(defaultStateMap(kind, parameter));
            },
            { attribute: "Empty reads the entity's state." },
          )}
        </div>
        ${showMap ? this.renderMapHaForm(parameter, source, entity, setMap) : nothing}`;
    }
    return html`<div class="grid">
        <label>
          Attribute (empty: the state)
          <input
            list=${listId}
            .value=${source.attribute ?? ""}
            @change=${(event: Event) => {
              setSource(text(valueOf(event)?.trim()), source.map);
            }}
          />
          <datalist id=${listId}>${attributes.map((name) => html`<option value=${name}></option>`)}</datalist>
        </label>
        ${
          showMap
            ? html`<label>
                Mapping
                <select
                  @change=${(event: Event) => {
                    const kind = kindLabels.find(([value]) => value === valueOf(event))?.[0];
                    if (kind !== undefined && kind !== source.map.kind)
                      setMap(defaultStateMap(kind, parameter));
                  }}
                >
                  ${kindLabels
                    .filter(([kind]) => kind !== "linear" || parameter.type === "number")
                    .map(
                      ([kind, label]) =>
                        html`<option value=${kind} ?selected=${kind === source.map.kind}>${label}</option>`,
                    )}
                </select>
              </label>`
            : nothing
        }
      </div>
      ${showMap ? this.renderMap(parameter, source, setMap) : nothing}`;
  }

  /**
   * The tilt conventions of a boolean read from a cover's tilt (10.4): the convention, the tilt now and what it
   * reads, and, where the cover can set its tilt, test buttons that move the real cover.
   */
  private renderTilt(
    parameter: TemplateStateParameter,
    mapping: HaStateMappingValue,
    entity: string | null,
  ): TemplateResult {
    const store = this.store;
    const recognised = tiltConventionOf(mapping.map, parameter);
    const convention = this.customTilt.has(parameter.name) ? null : recognised;
    const tilt =
      store === undefined
        ? undefined
        : sourceValue(mapping, this.defaultEntity, (entityId) => store.entity(entityId));
    const read =
      store === undefined
        ? undefined
        : mappedStateValue(mapping, this.defaultEntity, (entityId) => store.entity(entityId));
    const shut = tiltClosedValue(parameter);
    const preview =
      typeof tilt === "number"
        ? `Tilt now: ${String(tilt)} → ${read === undefined ? "no value" : read === shut ? "closed" : "open"}`
        : "Tilt now: no value (the cover reports no tilt)";
    const cover = entity !== null && domainOf(entity) === "cover" ? entity : null;
    const canSet = cover !== null && supportsTiltPosition(this.attributesOf(cover));
    const positions = tiltPositions(mapping.map, parameter);
    const test = (tiltPosition: number): void => {
      const hass = store?.current();
      if (hass === null || hass === undefined || cover === null) return;
      this.tiltTest.set(parameter.name, `Sending tilt ${String(tiltPosition)}…`);
      this.requestUpdate();
      hass
        .callService(
          "cover",
          "set_cover_tilt_position",
          { tilt_position: tiltPosition },
          { entity_id: cover },
        )
        .then(() => {
          this.tiltTest.set(parameter.name, `Sent: tilt ${String(tiltPosition)} to ${cover}.`);
        })
        .catch((error: unknown) => {
          this.tiltTest.set(
            parameter.name,
            `Not sent: ${error instanceof Error ? error.message : "Home Assistant refused the call"}.`,
          );
        })
        .finally(() => {
          this.requestUpdate();
        });
    };
    const pick = (value: unknown): void => {
      const picked = tiltConventions.find((info) => info.id === value);
      if (picked === undefined) {
        if (this.customTilt.has(parameter.name) || convention === null) return;
        this.customTilt.add(parameter.name);
        this.requestUpdate();
        return;
      }
      if (picked.id === convention) return;
      this.customTilt.delete(parameter.name);
      this.setMapping(parameter.name, { ...mapping, map: tiltConventionMap(picked.id, parameter) });
    };
    const conventionControl = this.haForm
      ? html`<div class="section">
          ${this.form(
            { convention: convention ?? customTiltOption },
            [
              {
                name: "convention",
                selector: {
                  select: {
                    mode: "dropdown",
                    options: [
                      ...tiltConventions.map((info) => ({ value: info.id, label: info.title })),
                      { value: customTiltOption, label: "Custom mapping" },
                    ],
                  },
                },
              },
            ],
            { convention: "Tilt convention" },
            (value) => {
              pick(value.convention);
            },
          )}
          <span class="preview" ?data-live=${read !== undefined}>${preview}</span>
        </div>`
      : null;
    return html`${
      conventionControl ??
      html`<div class="grid">
        <label>
          Tilt convention
          <select
            @change=${(event: Event) => {
              pick(valueOf(event));
            }}
          >
            ${tiltConventions.map(
              (info) =>
                html`<option value=${info.id} ?selected=${info.id === convention}>${info.title}</option>`,
            )}
            <option value=${customTiltOption} ?selected=${convention === null}>Custom mapping</option>
          </select>
        </label>
        <span class="now" ?data-live=${read !== undefined}>${preview}</span>
      </div>`
    }
    ${
      canSet
        ? html`<div class="test">
            <span class="hint">Test on the real device: these buttons move ${cover} in your home now.</span>
            <div>
              <button
                class="text-button"
                @click=${() => {
                  test(positions.open);
                }}
              >
                Open slats (tilt ${positions.open})
              </button>
              <button
                class="text-button"
                @click=${() => {
                  test(positions.closed);
                }}
              >
                Close slats (tilt ${positions.closed})
              </button>
            </div>
            ${
              this.tiltTest.has(parameter.name)
                ? html`<span class="hint">${this.tiltTest.get(parameter.name)}</span>`
                : nothing
            }
          </div>`
        : nothing
    }`;
  }

  private renderParameter(parameter: TemplateStateParameter): TemplateResult {
    const mapping = this.states?.[parameter.name];
    const entity = mapping === undefined ? null : mappingEntity(mapping, this.defaultEntity);
    const store = this.store;
    const now =
      mapping === undefined || store === undefined
        ? undefined
        : stateParameterValue(
            parameter,
            mappedStateValue(mapping, this.defaultEntity, (entityId) => store.entity(entityId)),
          );
    const tilt = mapping !== undefined && parameter.type === "boolean" && mapping.attribute === tiltAttribute;
    const conventionShown =
      tilt && !this.customTilt.has(parameter.name) && tiltConventionOf(mapping.map, parameter) !== null;
    const fallback = mapping?.fallback;
    const second = fallback === undefined ? null : mappingEntity(fallback, this.defaultEntity);
    return html`<div class="parameter">
      <div class="head">
        <span class="title">${parameter.title}</span>
        ${
          mapping === undefined
            ? html`<span class="now">${typeText(parameter)}</span>`
            : html`<span class="now" ?data-live=${now !== undefined}>
                Now: ${now === undefined ? "stored value (no usable state)" : valueText(parameter, now)}
              </span>`
        }
      </div>
      ${parameter.description === undefined ? nothing : html`<span class="hint">${parameter.description}</span>`}
      ${this.renderEntity(entity, (entityId) => {
        this.setEntity(parameter, entityId);
      })}
      <homeplan-entity-suggestions
        .suggestions=${this.suggest(parameter)}
        .current=${entity}
        @suggestion-pick=${(event: CustomEvent<string>) => {
          this.setEntity(parameter, event.detail);
        }}
      ></homeplan-entity-suggestions>
      ${
        mapping === undefined
          ? nothing
          : html`${this.renderSource(
              parameter,
              mapping,
              (attribute, map) => {
                this.setMapping(parameter.name, withSource(mapping, attribute, map));
              },
              `attributes-${parameter.name}`,
              !conventionShown,
            )}
            ${tilt ? this.renderTilt(parameter, mapping, entity) : nothing}`
      }
      ${
        mapping === undefined || parameter.choices === undefined
          ? nothing
          : html`<div class="second">
              <span class="hint">
                A second entity is read when the first gives no value: for example the window's "open" sensor
                first, its "tilted" sensor second.
              </span>
              ${this.renderEntity(
                second,
                (entityId) => {
                  this.setSecondEntity(parameter, mapping, entityId);
                },
                "Second entity",
              )}
              ${
                fallback === undefined
                  ? nothing
                  : this.renderSource(
                      parameter,
                      fallback,
                      (attribute, map) => {
                        this.setMapping(parameter.name, {
                          ...mapping,
                          fallback: withSource(fallback, attribute, map),
                        });
                      },
                      `attributes-${parameter.name}-second`,
                    )
              }
            </div>`
      }
    </div>`;
  }

  protected override render(): TemplateResult {
    const parameters = this.parameters;
    if (parameters === null) return html`<span class="hint">Loading the object's model…</span>`;
    if (parameters.length === 0)
      return html`<span class="hint">This object's template declares no state parameters.</span>`;
    return html`${parameters.map((parameter) => this.renderParameter(parameter))}`;
  }
}
