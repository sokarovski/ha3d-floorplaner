// Setup HA (Phase 21, dev harness only): the fake Home Assistant's entities, added and edited in this browser.
// Entities by domain on the left (+ adds one), the selected one on the right: its ID, name, area (a room name, so
// the viewer's room cards and suggestions find it), state and other attributes. Saving applies at once: the viewer
// and HA's cards get the new states (`fake-ha-changed`). Reset forgets every change and shows the demo entities.
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, TemplateResult } from "lit";
import type { FakeHaStore } from "./fakeHaStore";
import { onOffDomains } from "./fakeHaStore";
import { tokens } from "./styles/tokens";

type Draft = Readonly<{
  entityId: string;
  name: string;
  area: string;
  state: string;
  attributes: string;
}>;

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
        position: fixed;
        inset: 0;
        z-index: 10;
        display: grid;
        place-items: center;
        background: rgba(0, 0, 0, 0.32);
      }
      .dialog {
        display: grid;
        grid-template-columns: minmax(200px, 280px) 1fr;
        grid-template-rows: auto 1fr auto;
        width: min(920px, calc(100vw - 32px));
        height: min(640px, calc(100vh - 32px));
        border-radius: var(--hp-radius);
        background: var(--hp-surface);
        box-shadow: var(--hp-shadow);
        overflow: hidden;
      }
      header,
      footer {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--hp-divider);
      }
      footer {
        border-top: 1px solid var(--hp-divider);
        border-bottom: none;
        justify-content: flex-end;
      }
      header h2 {
        flex: 1;
        margin: 0;
        font-size: 18px;
        font-weight: 500;
      }
      nav {
        overflow: auto;
        border-right: 1px solid var(--hp-divider);
        padding: 8px 0;
      }
      nav h3 {
        display: flex;
        align-items: center;
        margin: 8px 16px 4px;
        font-size: 12px;
        font-weight: 500;
        color: var(--hp-muted);
        text-transform: uppercase;
      }
      nav h3 span {
        flex: 1;
      }
      nav button.item {
        display: block;
        width: 100%;
        padding: 6px 16px;
        border: none;
        background: none;
        text-align: left;
        cursor: pointer;
      }
      nav button.item[data-selected] {
        background: color-mix(in srgb, var(--hp-accent) 14%, transparent);
      }
      nav button.item small {
        display: block;
        color: var(--hp-muted);
      }
      .icon-button {
        border: none;
        background: none;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        padding: 2px 6px;
        border-radius: 999px;
      }
      .editor {
        overflow: auto;
        padding: 16px;
        display: grid;
        gap: 12px;
        align-content: start;
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
      }
      .note {
        color: var(--hp-muted);
        font-size: 13px;
        margin: 0;
      }
      footer .button,
      header .button {
        padding: 8px 14px;
        cursor: pointer;
      }
      .primary {
        background: var(--hp-accent);
        color: #fff;
      }
      .plain {
        background: transparent;
        color: var(--hp-accent);
        border: 1px solid var(--hp-divider);
      }
      .spacer {
        flex: 1;
      }
    `,
  ];

  static override properties: PropertyDeclarations = {
    store: { attribute: false },
    selected: { state: true },
    draft: { state: true },
    error: { state: true },
  };

  declare store: FakeHaStore | undefined;
  /** The entity being edited, or null for a new one. */
  declare selected: string | null;
  declare draft: Draft;
  declare error: string;

  constructor() {
    super();
    this.selected = null;
    this.draft = emptyDraft;
    this.error = "";
  }

  private select(entityId: string): void {
    const entry = this.store?.list().find((item) => item.entityId === entityId);
    if (entry === undefined) return;
    const { friendly_name: name, ...attributes } = entry.entity.attributes;
    this.selected = entityId;
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
    this.selected = null;
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
    if (store === undefined) return;
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
    if (this.selected === null && store.list().some((item) => item.entityId === entityId)) {
      this.error = `${entityId} already exists.`;
      return;
    }
    if (this.selected !== null && this.selected !== entityId) store.remove(this.selected);
    store.save(entityId, {
      state,
      attributes: { ...parsed, ...(name === "" ? {} : { friendly_name: name }) },
      area: area.trim() === "" ? null : area.trim(),
    });
    this.selected = entityId;
    this.error = "";
    this.changed();
  }

  private removeEntity(): void {
    if (this.store === undefined || this.selected === null) return;
    this.store.remove(this.selected);
    this.add(this.selected.split(".")[0] ?? "light");
    this.changed();
  }

  private reset(): void {
    if (this.store === undefined || !window.confirm("Forget every change and show the demo entities again?"))
      return;
    this.store.reset();
    this.add("light");
    this.changed();
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent("close"));
  }

  private field(key: keyof Draft, event: Event): void {
    this.draft = { ...this.draft, [key]: inputValue(event) };
  }

  private renderList(): TemplateResult {
    const entries = this.store?.list() ?? [];
    const domains = [
      ...new Set([...entries.map((item) => item.entityId.split(".")[0] ?? ""), "light", "switch"]),
    ]
      .filter((domain) => domain !== "")
      .sort();
    return html`<nav aria-label="Entities">
      ${domains.map(
        (domain) =>
          html`<h3>
              <span>${domain}</span>
              <button class="icon-button" title=${`Add a ${domain} entity`} @click=${() => this.add(domain)}>
                +
              </button>
            </h3>
            ${entries
              .filter((item) => item.entityId.startsWith(`${domain}.`))
              .map(
                (item) =>
                  html`<button
                    class="item"
                    ?data-selected=${item.entityId === this.selected}
                    @click=${() => this.select(item.entityId)}
                  >
                    ${item.entityId}${item.stored ? " •" : ""}
                    <small>${item.entity.state}${item.area === null ? "" : ` · ${item.area}`}</small>
                  </button>`,
              )}`,
      )}
    </nav>`;
  }

  private renderEditor(): TemplateResult {
    const { entityId, name, area, state, attributes } = this.draft;
    const domain = entityId.split(".")[0] ?? "";
    const areas = this.store?.areaNames() ?? [];
    return html`<section class="editor">
      <p class="note">
        ${this.selected === null ? "A new entity." : "Changes apply to the viewer and the cards when saved."}
        An area named like a room puts the entity in that room's cards and suggestions; • marks entities
        changed here.
      </p>
      <label
        >Entity ID
        <input
          .value=${entityId}
          @input=${(event: Event) => this.field("entityId", event)}
          spellcheck="false"
      /></label>
      <label>Name <input .value=${name} @input=${(event: Event) => this.field("name", event)} /></label>
      <label
        >Area
        <input list="fake-ha-areas" .value=${area} @input=${(event: Event) => this.field("area", event)} />
        <datalist id="fake-ha-areas">${areas.map((item) => html`<option value=${item}></option>`)}</datalist>
      </label>
      <label
        >State
        ${
          onOffDomains.has(domain)
            ? html`<select .value=${state} @change=${(event: Event) => this.field("state", event)}>
                ${["on", "off", "unavailable"].map(
                  (item) => html`<option value=${item} ?selected=${item === state}>${item}</option>`,
                )}
              </select>`
            : html`<input .value=${state} @input=${(event: Event) => this.field("state", event)} />`
        }
      </label>
      <label
        >Other attributes (JSON)
        <textarea
          .value=${attributes}
          @input=${(event: Event) => this.field("attributes", event)}
          spellcheck="false"
        ></textarea>
      </label>
      ${this.error === "" ? nothing : html`<p class="error" role="alert">${this.error}</p>`}
    </section>`;
  }

  override render(): TemplateResult {
    return html`<div class="dialog" role="dialog" aria-label="Setup HA">
      <header>
        <h2>Setup HA</h2>
        <button class="icon-button" title="Close" @click=${() => this.close()}>✕</button>
      </header>
      ${this.renderList()} ${this.renderEditor()}
      <footer>
        <button class="button plain" @click=${() => this.reset()}>Reset to demo entities</button>
        <span class="spacer"></span>
        ${
          this.selected === null
            ? nothing
            : html`<button class="button plain" @click=${() => this.removeEntity()}>Delete</button>`
        }
        <button class="button primary" @click=${() => this.save()}>Save</button>
      </footer>
    </div>`;
  }
}

if (customElements.get("homeplan-fake-ha-setup") === undefined)
  customElements.define("homeplan-fake-ha-setup", FakeHaSetup);
