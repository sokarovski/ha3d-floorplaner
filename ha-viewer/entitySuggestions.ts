// Binding suggestions in the editor (Phase 10.3, spec/home-assistant/bindings.md#suggestions): HA's entities with
// their areas, read once per `hass` object, and the small chips that show a field's best entities by their names
// (owner 2026-11-17: compact; the entity ID, fit and area are in the tooltip); one click picks one. The ranking is
// shared (`suggestions.ts`).
import { LitElement, css, html, nothing } from "lit";
import type { PropertyDeclarations, TemplateResult } from "lit";
import { haAreas, suggestionEntities } from "@shared/domain/homeAssistant/suggestions";
import type { EntitySuggestion, HaArea, SuggestionEntity } from "@shared/domain/homeAssistant/suggestions";
import type { Hass, HassStore } from "./hassStore";
import { tokens } from "./styles/tokens";

/** HA's entities and areas as the ranking reads them. */
export type SuggestionData = Readonly<{ entities: readonly SuggestionEntity[]; areas: readonly HaArea[] }>;

const empty: SuggestionData = { entities: [], areas: [] };
const cache = new WeakMap<Hass, SuggestionData>();

/** The entities and areas of the store's current `hass` (computed once per `hass` object). */
export const suggestionData = (store: HassStore | undefined): SuggestionData => {
  const hass = store?.current() ?? null;
  if (hass === null) return empty;
  const cached = cache.get(hass);
  if (cached !== undefined) return cached;
  const data = { entities: suggestionEntities(hass.states, hass), areas: haAreas(hass) };
  cache.set(hass, data);
  return data;
};

/** A row of suggestion chips; a click fires `suggestion-pick` with the entity ID. */
export class HomeplanEntitySuggestions extends LitElement {
  static override properties: PropertyDeclarations = {
    suggestions: { attribute: false },
    current: { attribute: false },
  };

  static override styles = [
    tokens,
    css`
      :host {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      .label {
        font-size: 12px;
        color: var(--hp-muted);
      }
      button {
        font: inherit;
        font-size: 12px;
        line-height: 16px;
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--hp-divider);
        background: transparent;
        color: var(--hp-text);
        cursor: pointer;
      }
      button[aria-pressed="true"] {
        border-color: var(--hp-accent);
        color: var(--hp-accent);
      }
      button[data-unavailable] {
        opacity: 0.6;
      }
    `,
  ];

  declare suggestions: readonly EntitySuggestion[];
  /** The field's entity now (its chip shows as chosen). */
  declare current: string | null;

  constructor() {
    super();
    this.suggestions = [];
    this.current = null;
  }

  private hint(suggestion: EntitySuggestion): string {
    return [
      suggestion.entityId,
      suggestion.reason,
      suggestion.sameArea ? "in this room's Home Assistant area" : null,
      suggestion.nameMatches.length === 0 ? null : `name matches: ${suggestion.nameMatches.join(", ")}`,
      suggestion.available ? null : "unavailable now",
    ]
      .filter((part): part is string => part !== null)
      .join("; ");
  }

  protected override render(): TemplateResult | typeof nothing {
    if (this.suggestions.length === 0) return nothing;
    return html`<span class="label">Suggested:</span> ${this.suggestions.map(
        (suggestion) =>
          html`<button
            type="button"
            aria-pressed=${suggestion.entityId === this.current ? "true" : "false"}
            ?data-unavailable=${!suggestion.available}
            title=${this.hint(suggestion)}
            @click=${() => {
              this.dispatchEvent(new CustomEvent<string>("suggestion-pick", { detail: suggestion.entityId }));
            }}
          >
            ${suggestion.name}
          </button>`,
      )}`;
  }
}
