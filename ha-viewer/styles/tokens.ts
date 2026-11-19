// Shared viewer styles: Home Assistant theme variables with fallbacks, plus viewer-only values.
import { css } from "lit";

export const tokens = css`
  :host {
    --hp-gap: 12px;
    --hp-radius: var(--ha-card-border-radius, 12px);
    --hp-surface: var(--card-background-color, #fff);
    --hp-text: var(--primary-text-color, #212121);
    --hp-muted: var(--secondary-text-color, #727272);
    --hp-divider: var(--divider-color, rgba(0, 0, 0, 0.12));
    --hp-accent: var(--primary-color, #03a9f4);
    --hp-error: var(--error-color, #db4437);
    --hp-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.08));
    font-family: var(--ha-font-family-body, Roboto, system-ui, sans-serif);
    color: var(--hp-text);
    box-sizing: border-box;
  }
  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }
  button {
    font: inherit;
    color: inherit;
  }
  .button {
    border: none;
    border-radius: 999px;
    padding: 8px 18px;
    background: var(--hp-accent);
    color: var(--text-primary-color, #fff);
    font-weight: 500;
    cursor: pointer;
  }
  .button[disabled] {
    opacity: 0.4;
    cursor: default;
  }
  .icon-button {
    border: none;
    background: transparent;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: inline-grid;
    place-items: center;
    cursor: pointer;
    color: var(--hp-text);
  }
  .icon-button:hover {
    background: var(--secondary-background-color, rgba(0, 0, 0, 0.05));
  }
  .icon-button svg {
    width: 24px;
    height: 24px;
    fill: currentColor;
  }
`;
