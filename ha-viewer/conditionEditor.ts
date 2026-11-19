// A condition editor (D25, spec/home-assistant/bindings.md#editor): a list of tests on entities (state is / is
// not, a number above / below, optionally on an attribute) matched all or any, edited with HA's ha-form selectors
// (entity, attribute, state, number) or plain controls in the harness. Conditions the list cannot show (groups
// inside groups) are edited as JSON. Shows whether the condition holds now, live.
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, PropertyValues, TemplateResult } from "lit";
import { conditionEntities, evaluateCondition } from "@shared/domain/homeAssistant/conditions";
import { HaCondition } from "@shared/domain/schemas/homeAssistant";
import type { HaConditionValue, HaEntityConditionValue } from "@shared/domain/schemas/homeAssistant";
import { compileValidator } from "@shared/domain/validation/ajv";
import { entityIds, fieldStyles, formValue, numberOf, text, valueOf } from "./formHelpers";
import { EntitiesController } from "./hassStore";
import type { HassStore } from "./hassStore";
import { tokens } from "./styles/tokens";
import { optionalChange } from "./events";

const validateCondition = compileValidator(HaCondition);

type Test = "state" | "state_not" | "numeric_state";

/** One test row as the form shows it; a row without an entity is incomplete and not saved. */
type Row = Readonly<{
  test: Test;
  entity: string;
  attribute: string;
  states: readonly string[];
  above: number | undefined;
  below: number | undefined;
}>;

type Simple = Readonly<{ match: "and" | "or"; rows: readonly Row[] }>;

const testLabels: readonly (readonly [Test, string])[] = [
  ["state", "State is"],
  ["state_not", "State is not"],
  ["numeric_state", "Number between"],
];

const list = (states: string | readonly string[]): readonly string[] =>
  typeof states === "string" ? [states] : states;

const rowOf = (condition: HaEntityConditionValue): Row => ({
  test:
    condition.condition === "numeric_state" ? "numeric_state" : "state" in condition ? "state" : "state_not",
  entity: condition.entity,
  attribute: condition.attribute ?? "",
  states:
    condition.condition === "numeric_state"
      ? []
      : "state" in condition
        ? list(condition.state)
        : list(condition.state_not),
  above: condition.condition === "numeric_state" ? condition.above : undefined,
  below: condition.condition === "numeric_state" ? condition.below : undefined,
});

/** The condition as a flat list of tests, or null when it has groups inside groups (edited as JSON). */
const simpleOf = (condition: HaConditionValue | undefined): Simple | null => {
  if (condition === undefined) return { match: "and", rows: [] };
  if (condition.condition !== "and" && condition.condition !== "or")
    return { match: "and", rows: [rowOf(condition)] };
  const rows: Row[] = [];
  for (const inner of condition.conditions) {
    if (inner.condition === "and" || inner.condition === "or") return null;
    rows.push(rowOf(inner));
  }
  return { match: condition.condition, rows };
};

const conditionOf = (row: Row): HaEntityConditionValue | null => {
  if (row.entity === "") return null;
  const attribute = row.attribute === "" ? {} : { attribute: row.attribute };
  if (row.test === "numeric_state")
    return {
      condition: "numeric_state",
      entity: row.entity,
      ...attribute,
      ...(row.above === undefined ? {} : { above: row.above }),
      ...(row.below === undefined ? {} : { below: row.below }),
    };
  const values = row.states.length === 1 ? (row.states[0] ?? "") : [...row.states];
  if (row.states.length === 0) return null;
  return row.test === "state"
    ? { condition: "state", entity: row.entity, ...attribute, state: values }
    : { condition: "state", entity: row.entity, ...attribute, state_not: values };
};

/** The complete rows as a condition: none is no condition, one is that test, more are a group. */
const fromSimple = (simple: Simple): HaConditionValue | undefined => {
  const conditions = simple.rows.flatMap((row) => conditionOf(row) ?? []);
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1 && simple.rows.length === 1) return conditions[0];
  return { condition: simple.match, conditions };
};

const statesOf = (value: unknown): readonly string[] =>
  typeof value === "string"
    ? value
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "")
    : Array.isArray(value)
      ? value.filter((part): part is string => typeof part === "string" && part !== "")
      : [];

const testOf = (value: unknown): Test =>
  value === "state_not" || value === "numeric_state" ? value : "state";

export class HomeplanConditionEditor extends LitElement {
  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    haForm: { attribute: false },
    condition: { attribute: false },
    defaultEntity: { attribute: false },
    emptyText: { attribute: false },
  };

  static override styles = [
    tokens,
    fieldStyles,
    css`
      :host {
        display: grid;
        gap: 8px;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .now {
        margin-left: auto;
        font-size: 12px;
        padding: 2px 10px;
        border-radius: 999px;
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.06));
        color: var(--hp-muted);
      }
      .now[data-met] {
        background: var(--success-color, #43a047);
        color: var(--text-primary-color, #fff);
      }
      .row {
        display: grid;
        gap: 8px;
        padding: 8px 8px 8px 12px;
        border-left: 3px solid var(--hp-divider);
      }
      .row-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        color: var(--hp-muted);
      }
      .plain {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .plain > .wide {
        grid-column: 1 / -1;
      }
    `,
  ];

  declare store: HassStore | undefined;
  declare haForm: boolean;
  declare condition: HaConditionValue | undefined;
  /** The entity a new test starts with (the binding's own entity). */
  declare defaultEntity: string | null;
  /** Shown when there is no condition. */
  declare emptyText: string;
  private simple: Simple = { match: "and", rows: [] };
  private json = false;
  private jsonText = "";
  private jsonError: string | null = null;
  /** The last condition this editor sent, so its own echo does not reset the rows being typed. */
  private emitted: HaConditionValue | undefined | null = null;
  private entities: EntitiesController | null = null;

  constructor() {
    super();
    this.haForm = false;
    this.condition = undefined;
    this.defaultEntity = null;
    this.emptyText = "Always";
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("store") && this.store !== undefined && this.entities === null)
      this.entities = new EntitiesController(this, this.store);
    if (changed.has("condition") && this.condition !== this.emitted) {
      const simple = simpleOf(this.condition);
      this.json = simple === null;
      this.simple = simple ?? { match: "and", rows: [] };
      this.jsonText = this.condition === undefined ? "" : JSON.stringify(this.condition, null, 2);
      this.jsonError = null;
    }
    // One subscription per entity the condition reads, for the live "now" badge.
    this.entities?.setEntityIds(this.condition === undefined ? [] : conditionEntities(this.condition));
  }

  private emit(condition: HaConditionValue | undefined): void {
    this.emitted = condition;
    this.dispatchEvent(optionalChange<HaConditionValue>("condition-change", condition));
  }

  private setSimple(simple: Simple): void {
    this.simple = simple;
    this.jsonText = "";
    this.emit(fromSimple(simple));
    this.requestUpdate();
  }

  private setRow(index: number, row: Row): void {
    this.setSimple({
      ...this.simple,
      rows: this.simple.rows.map((current, at) => (at === index ? row : current)),
    });
  }

  private addRow(): void {
    this.setSimple({
      ...this.simple,
      rows: [
        ...this.simple.rows,
        {
          test: "state",
          entity: this.defaultEntity ?? "",
          attribute: "",
          states: [],
          above: undefined,
          below: undefined,
        },
      ],
    });
  }

  private setJson(value: string): void {
    this.jsonText = value;
    if (value.trim() === "") {
      this.jsonError = null;
      this.emit(undefined);
      this.requestUpdate();
      return;
    }
    try {
      const parsed: unknown = JSON.parse(value);
      if (validateCondition(parsed)) {
        this.jsonError = null;
        this.emit(parsed);
      } else this.jsonError = "Not a supported condition (state, numeric_state, and, or).";
    } catch {
      this.jsonError = "Not valid JSON.";
    }
    this.requestUpdate();
  }

  private renderRowHaForm(row: Row, index: number): TemplateResult {
    const entityId = row.entity === "" ? undefined : row.entity;
    const attribute = row.attribute === "" ? undefined : row.attribute;
    const schema = [
      {
        name: "test",
        selector: {
          select: { mode: "dropdown", options: testLabels.map(([value, label]) => ({ value, label })) },
        },
      },
      { name: "entity", selector: { entity: {} } },
      ...(entityId === undefined
        ? []
        : [{ name: "attribute", selector: { attribute: { entity_id: entityId } } }]),
      ...(row.test === "numeric_state"
        ? [
            { name: "above", selector: { number: { mode: "box", step: "any" } } },
            { name: "below", selector: { number: { mode: "box", step: "any" } } },
          ]
        : [
            {
              name: "states",
              selector: { state: { entity_id: entityId, attribute, multiple: true } },
            },
          ]),
    ];
    const labels: Readonly<Record<string, string>> = {
      test: "Test",
      entity: "Entity",
      attribute: "Attribute (optional; the state when empty)",
      states: row.test === "state" ? "Is one of" : "Is none of",
      above: "Above",
      below: "Below",
    };
    return html`<ha-form
      .hass=${this.store?.current()}
      .data=${{
        test: row.test,
        entity: entityId,
        attribute,
        states: [...row.states],
        above: row.above,
        below: row.below,
      }}
      .schema=${schema}
      .computeLabel=${(item: { name: string }) => labels[item.name] ?? item.name}
      @value-changed=${(event: Event) => {
        const value = formValue(event);
        if (value === null) return;
        const entity = text(value.entity) ?? "";
        this.setRow(index, {
          test: testOf(value.test),
          entity,
          // A new entity has other attributes.
          attribute: entity === row.entity ? (text(value.attribute) ?? "") : "",
          states: statesOf(value.states),
          above: numberOf(value.above),
          below: numberOf(value.below),
        });
      }}
    ></ha-form>`;
  }

  private renderRowFallback(row: Row, index: number): TemplateResult {
    const set = (patch: Partial<Row>): void => {
      this.setRow(index, { ...row, ...patch });
    };
    return html`<div class="plain">
      <label>
        Test
        <select
          @change=${(event: Event) => {
            set({ test: testOf(valueOf(event)) });
          }}
        >
          ${testLabels.map(
            ([value, label]) =>
              html`<option value=${value} ?selected=${value === row.test}>${label}</option>`,
          )}
        </select>
      </label>
      <label>
        Entity
        <select
          @change=${(event: Event) => {
            set({ entity: valueOf(event) ?? "", attribute: "" });
          }}
        >
          <option value="" ?selected=${row.entity === ""}>Choose…</option>
          ${entityIds(this.store).map(
            (id) => html`<option value=${id} ?selected=${id === row.entity}>${id}</option>`,
          )}
        </select>
      </label>
      <label class="wide">
        Attribute (optional; the state when empty)
        <input
          .value=${row.attribute}
          placeholder="for example hvac_action"
          @change=${(event: Event) => {
            set({ attribute: (valueOf(event) ?? "").trim() });
          }}
        />
      </label>
      ${
        row.test === "numeric_state"
          ? html`<label>
                Above
                <input
                  type="number"
                  step="any"
                  .value=${row.above === undefined ? "" : String(row.above)}
                  @change=${(event: Event) => {
                    set({ above: numberOf(valueOf(event)) });
                  }}
                />
              </label>
              <label>
                Below
                <input
                  type="number"
                  step="any"
                  .value=${row.below === undefined ? "" : String(row.below)}
                  @change=${(event: Event) => {
                    set({ below: numberOf(valueOf(event)) });
                  }}
                />
              </label>`
          : html`<label class="wide">
              ${row.test === "state" ? "Is one of" : "Is none of"} (comma-separated)
              <input
                .value=${row.states.join(", ")}
                placeholder="for example on, or cooling, heating"
                @change=${(event: Event) => {
                  set({ states: statesOf(valueOf(event)) });
                }}
              />
            </label>`
      }
    </div>`;
  }

  private renderRows(): TemplateResult {
    const rows = this.simple.rows;
    return html`
      ${
        rows.length > 1
          ? html`<label>
              Match
              <select
                @change=${(event: Event) => {
                  this.setSimple({ ...this.simple, match: valueOf(event) === "or" ? "or" : "and" });
                }}
              >
                <option value="and" ?selected=${this.simple.match === "and"}>All tests (and)</option>
                <option value="or" ?selected=${this.simple.match === "or"}>Any test (or)</option>
              </select>
            </label>`
          : nothing
      }
      ${rows.map(
        (row, index) =>
          html`<div class="row">
            <div class="row-head">
              <span>Test ${index + 1}${row.entity === "" ? " (choose an entity)" : ""}</span>
              <button
                class="text-button"
                @click=${() => {
                  this.setSimple({ ...this.simple, rows: rows.filter((_, at) => at !== index) });
                }}
              >
                Remove
              </button>
            </div>
            ${this.haForm ? this.renderRowHaForm(row, index) : this.renderRowFallback(row, index)}
          </div>`,
      )}
    `;
  }

  protected override render(): TemplateResult {
    const condition = this.condition;
    const store = this.store;
    const met =
      condition === undefined || store === undefined
        ? null
        : evaluateCondition(condition, (entityId) => store.entity(entityId));
    return html`
      <div class="head">
        ${
          this.json
            ? nothing
            : html`<button
                class="text-button"
                @click=${() => {
                  this.addRow();
                }}
              >
                + Add test
              </button>`
        }
        <button
          class="text-button"
          ?disabled=${this.json && simpleOf(condition) === null}
          title=${this.json && simpleOf(condition) === null ? "Groups inside groups are edited as JSON" : ""}
          @click=${() => {
            const simple = this.json ? simpleOf(condition) : null;
            if (this.json && simple === null) return;
            this.json = !this.json;
            if (simple !== null) this.simple = simple;
            this.jsonText = condition === undefined ? "" : JSON.stringify(condition, null, 2);
            this.jsonError = null;
            this.requestUpdate();
          }}
        >
          ${this.json ? "Edit as tests" : "Edit as JSON"}
        </button>
        <span class="now" ?data-met=${met === true}>
          ${met === null ? this.emptyText : met ? "Now: met" : "Now: not met"}
        </span>
      </div>
      ${
        this.json
          ? html`<textarea
                .value=${this.jsonText}
                placeholder='{ "condition": "state", "entity": "climate.living_room", "attribute": "hvac_action", "state": "cooling" }'
                @input=${(event: Event) => {
                  this.setJson(valueOf(event) ?? "");
                }}
              ></textarea>
              ${this.jsonError === null ? nothing : html`<div class="error">${this.jsonError}</div>`}`
          : this.renderRows()
      }
    `;
  }
}
