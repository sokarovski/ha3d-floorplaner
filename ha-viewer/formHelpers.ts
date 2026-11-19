// Helpers shared by the binding editor's forms: reading HA's ha-form events, the plain controls used outside
// Home Assistant (the harness), and their styles.
import { css } from "lit";
import type { HassStore } from "./hassStore";

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The whole form value of an ha-form `value-changed` (a plain Event with a `detail`, HA's fireEvent helper). */
export const formValue = (event: Event): Readonly<Record<string, unknown>> | null => {
  const detail: unknown = Reflect.get(event, "detail");
  const value: unknown = isRecord(detail) ? detail.value : null;
  return isRecord(value) ? value : null;
};

export const text = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/** A finite number from a form field (a number, or numeric text); undefined when empty or not a number. */
export const numberOf = (value: unknown): number | undefined => {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
};

/** The entity IDs HA knows, optionally of one domain, sorted (for the plain entity select). */
export const entityIds = (store: HassStore | undefined, domain?: string): readonly string[] =>
  Object.keys(store?.current()?.states ?? {})
    .filter((id) => domain === undefined || id.startsWith(`${domain}.`))
    .sort();

/** The element an input or select event came from, when it has a value. */
export const valueOf = (event: Event): string | null => {
  const target = event.target;
  return target instanceof HTMLSelectElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
    ? target.value
    : null;
};

export const fieldStyles = css`
  label {
    display: grid;
    gap: 4px;
    font-size: 13px;
    color: var(--hp-muted);
  }
  select,
  input,
  textarea {
    font: inherit;
    color: var(--hp-text);
    background: var(--input-fill-color, var(--secondary-background-color, #f5f5f5));
    border: none;
    border-bottom: 1px solid var(--hp-divider);
    border-radius: 6px 6px 0 0;
    padding: 10px 12px;
    min-width: 0;
  }
  input[type="color"] {
    padding: 2px 4px;
    height: 40px;
  }
  textarea {
    font-family: var(--ha-font-family-code, ui-monospace, monospace);
    font-size: 12px;
    min-height: 96px;
    resize: vertical;
  }
  .text-button {
    border: none;
    background: transparent;
    color: var(--hp-accent);
    font-weight: 500;
    padding: 6px 10px;
    border-radius: 999px;
    cursor: pointer;
  }
  .hint {
    font-size: 12px;
    color: var(--hp-muted);
  }
  .error {
    font-size: 12px;
    color: var(--hp-error);
  }
`;
