// Setup HA (Phase 21.16/21.18, dev harness only): Settings' second tab in the fake Home Assistant. On the left,
// Controls (the harness's step buttons, dark mode, day and night, the renderer, demo bubbles, the last action) and
// the entities by domain (+ adds one); on the right, the selected page. An entity has its ID, name, area (a room
// name, so the viewer's room cards and suggestions find it), state and other attributes. Every change applies at
// once (`fake-ha-changed`): the viewer and HA's cards get the new states. The same is scriptable through
// `window.homeplan` (fakeHaBridge.ts).
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, TemplateResult } from "lit";
import type { FakeHaStore } from "./fakeHaStore";
import { onOffDomains } from "./fakeHaStore";
import { formValue } from "./formHelpers";
import { tokens } from "./styles/tokens";

/** One harness control: a button on the Controls page (and a `run_control` ID on window.homeplan). */
export type FakeHaControl = Readonly<{ id: string; label: string; group: string; run: () => void }>;

type Draft = Readonly<{
  entityId: string;
  name: string;
  area: string;
  state: string;
  attributes: string;
}>;

/** The page shown: Controls, an entity (its ID), or a new entity. */
type Page = Readonly<{ kind: "controls" }> | Readonly<{ kind: "entity"; entityId: string | null }>;

const emptyDraft: Draft = {
  entityId: "light.new_light",
  name: "New light",
  area: "",
  state: "off",
  attributes: "{}",
};

const entityIdPattern = /^[a-z_]+\.[a-z0-9_]+$/;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const inputValue = (event: Event): string =>
  event.target instanceof HTMLInputElement ||
  event.target instanceof HTMLSelectElement ||
  event.target instanceof HTMLTextAreaElement
    ? event.target.value
    : "";

export class FakeHaSetup extends LitElement {
  static override styles = [
    tokens,
    css`
      :host {
        display: grid;
        grid-template-columns: minmax(180px, 260px) 1fr;
        min-height: 0;
        container-type: inline-size;
      }
      nav {
        overflow: auto;
        border-right: 1px solid var(--hp-divider);
        padding: 8px 8px 16px 0;
      }
      nav h3 {
        display: flex;
        align-items: center;
        margin: 12px 0 4px 12px;
        font-size: 12px;
        font-weight: 500;
        color: var(--hp-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      nav h3 span {
        flex: 1;
      }
      .item {
        display: block;
        width: 100%;
        padding: 6px 12px;
        border: none;
        border-radius: 8px;
        background: none;
        text-align: left;
        cursor: pointer;
        overflow-wrap: anywhere;
      }
      .item:hover {
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.05));
      }
      .item[data-selected] {
        background: color-mix(in srgb, var(--hp-accent) 14%, transparent);
      }
      .item small {
        display: block;
        color: var(--hp-muted);
      }
      .add {
        width: 28px;
        height: 28px;
        font-size: 18px;
      }
      .page {
        overflow: auto;
        padding: 16px;
        display: grid;
        gap: 14px;
        align-content: start;
      }
      .group h4 {
        margin: 0 0 6px;
        font-size: 13px;
        font-weight: 500;
        color: var(--hp-muted);
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .chip {
        padding: 6px 12px;
        border: 1px solid var(--hp-divider);
        border-radius: 999px;
        background: var(--hp-surface);
        cursor: pointer;
      }
      .chip:hover {
        border-color: var(--hp-accent);
      }
      .last {
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.05));
        font-family: ui-monospace, monospace;
        font-size: 12px;
      }
      label {
        display: grid;
        gap: 4px;
        font-size: 13px;
        color: var(--hp-muted);
      }
      input,
      select,
      textarea {
        font: inherit;
        color: var(--hp-text);
        padding: 8px 10px;
        border: 1px solid var(--hp-divider);
        border-radius: 4px;
        background: var(--hp-surface);
      }
      textarea {
        min-height: 140px;
        font-family: ui-monospace, monospace;
        font-size: 12px;
      }
      .error {
        color: var(--hp-error);
        margin: 0;
      }
      .note {
        color: var(--hp-muted);
        font-size: 13px;
        margin: 0;
      }
      .actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      .plain {
        background: transparent;
        color: var(--hp-accent);
        border: 1px solid var(--hp-divider);
      }
      @container (max-width: 560px) {
        :host {
          grid-template-columns: 1fr;
          grid-template-rows: minmax(0, 40%) 1fr;
        }
        nav {
          border-right: none;
          border-bottom: 1px solid var(--hp-divider);
        }
      }
    `,
  ];

  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    currentHass: { attribute: false },
    controls: { attribute: false },
    lastAction: { attribute: false },
    page: { state: true },
    draft: { state: true },
    error: { state: true },
  };

  declare store: FakeHaStore | undefined;
  /** The fake HA's hass for HA's own fields (ha-form, once Settings has loaded it). */
  declare currentHass: (() => unknown) | undefined;
  declare controls: readonly FakeHaControl[];
  declare lastAction: string;
  declare page: Page;
  declare draft: Draft;
  declare error: string;

  constructor() {
    super();
    this.controls = [];
    this.lastAction = "none";
    this.page = { kind: "controls" };
    this.draft = emptyDraft;
    this.error = "";
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Settings loads HA's ha-form (haElements.ts); the fields switch to it once it is defined.
    if (customElements.get("ha-form") === undefined)
      void customElements.whenDefined("ha-form").then(() => {
        this.requestUpdate();
      });
  }

  private select(entityId: string): void {
    const entry = this.store?.list().find((item) => item.entityId === entityId);
    if (entry === undefined) return;
    const { friendly_name: name, ...attributes } = entry.entity.attributes;
    this.page = { kind: "entity", entityId };
    this.error = "";
    this.draft = {
      entityId,
      name: typeof name === "string" ? name : "",
      area: entry.area ?? "",
      state: entry.entity.state,
      attributes: JSON.stringify(attributes, null, 2),
    };
  }

  private add(domain: string): void {
    this.page = { kind: "entity", entityId: null };
    this.error = "";
    this.draft = {
      ...emptyDraft,
      entityId: `${domain}.new_${domain}`,
      name: `New ${domain.replace(/_/g, " ")}`,
      state: onOffDomains.has(domain) ? "off" : "",
    };
  }

  private changed(): void {
    this.dispatchEvent(new CustomEvent("fake-ha-changed", { bubbles: true, composed: true }));
  }

  private save(): void {
    const store = this.store;
    if (store === undefined || this.page.kind !== "entity") return;
    const replacing = this.page.entityId;
    const { entityId, name, area, state, attributes } = this.draft;
    if (!entityIdPattern.test(entityId)) {
      this.error = "The entity ID is domain.object_id, in lowercase letters, digits and _ (light.desk_lamp).";
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(attributes === "" ? "{}" : attributes);
    } catch {
      this.error = "The attributes are not valid JSON.";
      return;
    }
    if (!isRecord(parsed)) {
      this.error = "The attributes are a JSON object.";
      return;
    }
    if (replacing !== entityId && store.list().some((item) => item.entityId === entityId)) {
      this.error = `${entityId} already exists.`;
      return;
    }
    if (replacing !== null && replacing !== entityId) store.remove(replacing);
    store.save(entityId, {
      state,
      attributes: { ...parsed, ...(name === "" ? {} : { friendly_name: name }) },
      area: area.trim() === "" ? null : area.trim(),
    });
    this.page = { kind: "entity", entityId };
    this.error = "";
    this.changed();
  }

  private removeEntity(): void {
    if (this.store === undefined || this.page.kind !== "entity" || this.page.entityId === null) return;
    this.store.remove(this.page.entityId);
    this.page = { kind: "controls" };
    this.changed();
  }

  private reset(): void {
    if (this.store === undefined || !window.confirm("Forget every change and show the demo entities again?"))
      return;
    this.store.reset();
    this.page = { kind: "controls" };
    this.changed();
  }

  private field(key: keyof Draft, event: Event): void {
    this.draft = { ...this.draft, [key]: inputValue(event) };
  }

  private renderNav(): TemplateResult {
    const entries = this.store?.list() ?? [];
    const domains = [
      ...new Set([...entries.map((item) => item.entityId.split(".")[0] ?? ""), "light", "switch"]),
    ]
      .filter((domain) => domain !== "")
      .sort();
    const selected = this.page.kind === "entity" ? this.page.entityId : null;
    return html`<nav aria-label="Setup HA">
      <button
        class="item"
        ?data-selected=${this.page.kind === "controls"}
        @click=${() => {
          this.page = { kind: "controls" };
        }}
      >
        Controls
        <small>Step buttons, display, renderer</small>
      </button>
      ${domains.map(
        (domain) =>
          html`<h3>
              <span>${domain}</span>
              <button
                class="icon-button add"
                title=${`Add a ${domain} entity`}
                aria-label=${`Add a ${domain} entity`}
                @click=${() => {
                  this.add(domain);
                }}
              >
                +
              </button>
            </h3>
            ${entries
              .filter((item) => item.entityId.startsWith(`${domain}.`))
              .map(
                (item) =>
                  html`<button
                    class="item"
                    ?data-selected=${item.entityId === selected}
                    @click=${() => {
                      this.select(item.entityId);
                    }}
                  >
                    ${item.entityId}${item.stored ? " •" : ""}
                    <small>${item.entity.state}${item.area === null ? "" : ` · ${item.area}`}</small>
                  </button>`,
              )}`,
      )}
    </nav>`;
  }

  private renderControls(): TemplateResult {
    const groups = [...new Set(this.controls.map((control) => control.group))];
    return html`<section class="page">
      <p class="note">
        Each button changes the fake entities (or the harness) at once. Scripts can do the same through
        <code>window.homeplan</code> (<code>window.homeplan.describe()</code> lists the tools).
      </p>
      <div class="last" role="status">Last action: ${this.lastAction}</div>
      ${groups.map(
        (group) =>
          html`<div class="group">
            <h4>${group}</h4>
            <div class="chips">
              ${this.controls
                .filter((control) => control.group === group)
                .map(
                  (control) =>
                    html`<button
                      class="chip"
                      @click=${() => {
                        control.run();
                        this.requestUpdate();
                      }}
                    >
                      ${control.label}
                    </button>`,
                )}
            </div>
          </div>`,
      )}
      <div class="group">
        <h4>Entities</h4>
        <p class="note">Entities changed here are marked •; they are kept in this browser.</p>
        <div class="chips">
          <button
            class="chip"
            @click=${() => {
              this.reset();
            }}
          >
            Reset to demo entities
          </button>
        </div>
      </div>
    </section>`;
  }

  /** Entity ID, name, area and state: HA's own fields (ha-form) when Settings has loaded them, else plain ones. */
  private renderFields(areas: readonly string[], domain: string): TemplateResult {
    const { entityId, name, area, state, attributes } = this.draft;
    const hass = this.currentHass?.();
    if (customElements.get("ha-form") !== undefined && hass !== undefined) {
      const labels: Readonly<Record<string, string>> = {
        entityId: "Entity ID",
        name: "Name",
        area: "Area (a room name)",
        state: "State",
        attributes: "Other attributes (JSON)",
      };
      return html`<ha-form
        .hass=${hass}
        .data=${{ entityId, name, area, state, attributes }}
        .schema=${[
          { name: "entityId", required: true, selector: { text: {} } },
          { name: "name", selector: { text: {} } },
          {
            name: "area",
            selector: { select: { options: areas, custom_value: true, mode: "dropdown" } },
          },
          {
            name: "state",
            selector: onOffDomains.has(domain)
              ? { select: { options: ["on", "off", "unavailable"], mode: "dropdown" } }
              : { text: {} },
          },
          { name: "attributes", selector: { text: { multiline: true } } },
        ]}
        .computeLabel=${(field: Readonly<{ name: string }>) => labels[field.name] ?? field.name}
        @value-changed=${(event: Event) => {
          const value = formValue(event);
          if (value === null) return;
          const read = (key: string): string => {
            const each = value[key];
            return typeof each === "string" ? each : "";
          };
          this.draft = {
            ...this.draft,
            entityId: read("entityId"),
            name: read("name"),
            area: read("area"),
            state: read("state"),
            attributes: read("attributes"),
          };
        }}
      ></ha-form>`;
    }
    return html`<label
        >Entity ID
        <input
          .value=${entityId}
          @input=${(event: Event) => {
            this.field("entityId", event);
          }}
          spellcheck="false"
      /></label>
      <label
        >Name
        <input
          .value=${name}
          @input=${(event: Event) => {
            this.field("name", event);
          }}
      /></label>
      <label
        >Area
        <input
          list="fake-ha-areas"
          .value=${area}
          @input=${(event: Event) => {
            this.field("area", event);
          }}
        />
        <datalist id="fake-ha-areas">${areas.map((item) => html`<option value=${item}></option>`)}</datalist>
      </label>
      <label
        >State
        ${
          onOffDomains.has(domain)
            ? html`<select
                .value=${state}
                @change=${(event: Event) => {
                  this.field("state", event);
                }}
              >
                ${["on", "off", "unavailable"].map(
                  (item) => html`<option value=${item} ?selected=${item === state}>${item}</option>`,
                )}
              </select>`
            : html`<input
                .value=${state}
                @input=${(event: Event) => {
                  this.field("state", event);
                }}
              />`
        }
      </label>
      <label
        >Other attributes (JSON)
        <textarea
          .value=${attributes}
          @input=${(event: Event) => {
            this.field("attributes", event);
          }}
          spellcheck="false"
        ></textarea>
      </label>`;
  }

  private renderEntity(): TemplateResult {
    const { entityId } = this.draft;
    const domain = entityId.split(".")[0] ?? "";
    const areas = this.store?.areaNames() ?? [];
    const existing = this.page.kind === "entity" && this.page.entityId !== null;
    return html`<section class="page">
      <p class="note">
        ${existing ? "Saved changes apply to the viewer and the cards at once." : "A new entity."} An area
        named like a room puts the entity in that room's cards and suggestions.
      </p>
      ${this.renderFields(areas, domain)}
      ${this.error === "" ? nothing : html`<p class="error" role="alert">${this.error}</p>`}
      <div class="actions">
        ${
          existing
            ? html`<button
                class="button plain"
                @click=${() => {
                  this.removeEntity();
                }}
              >
                Delete
              </button>`
            : nothing
        }
        <button
          class="button"
          @click=${() => {
            this.save();
          }}
        >
          Save
        </button>
      </div>
    </section>`;
  }

  override render(): TemplateResult {
    return html`${this.renderNav()}
    ${this.page.kind === "controls" ? this.renderControls() : this.renderEntity()}`;
  }
}

if (customElements.get("homeplan-fake-ha-setup") === undefined)
  customElements.define("homeplan-fake-ha-setup", FakeHaSetup);
