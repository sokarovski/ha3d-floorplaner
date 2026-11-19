// <homeplan-panel>: the panel_custom element (spec/home-assistant/viewer-mvp.md#loading-in-home-assistant).
// `hass` only feeds the store; this element re-renders on panel/narrow changes and its own phase.
import { LitElement, css, html } from "lit";
import type { TemplateResult } from "lit";
import Type from "typebox";
import { compileValidator } from "@shared/domain/validation/ajv";
import { createHassStore } from "./hassStore";
import type { Hass } from "./hassStore";
import { createDevHouseSource } from "./houseSource";
import type { HouseSource, ViewerSetup } from "./houseSource";
import { tokens } from "./styles/tokens";

const PanelConfig = Type.Object({
  mode: Type.Literal("dev"),
  api_base: Type.String({ minLength: 1 }),
  /**
   * Dev only: show this house instead of the setup's, without saving the setup (the harness's `?house=`, so a test
   * house can be checked without changing which house the viewer setup shows).
   */
  house_id: Type.Optional(Type.String({ minLength: 1 })),
});
const validateConfig = compileValidator(PanelConfig);

type PanelInfo = Readonly<{ config?: unknown }>;

type Phase =
  { kind: "loading" } | { kind: "setup" } | { kind: "viewer" } | { kind: "error"; message: string };

export class HomeplanPanel extends LitElement {
  static override styles = [
    tokens,
    css`
      :host {
        position: relative;
        display: block;
        /* HA's ha-panel-custom wrapper has no height of its own, so 100% would collapse to 0. */
        height: 100vh;
        height: 100dvh;
        background: var(--primary-background-color, #fafafa);
      }
      .center {
        height: 100%;
        display: grid;
        place-items: center;
        padding: 24px;
        text-align: center;
        color: var(--hp-muted);
      }
      .error {
        color: var(--hp-error);
      }
      .renders {
        position: absolute;
        right: 12px;
        bottom: 8px;
        font-size: 11px;
        color: var(--hp-muted);
      }
    `,
  ];

  private readonly store = createHassStore();
  private source: HouseSource | null = null;
  private apiBase = "";
  private setup: ViewerSetup = { houseId: null, testEntityId: null };
  /** Dev only (`house_id`): the house shown instead of the setup's; the setup itself is unchanged. */
  private houseOverride: string | null = null;
  private phase: Phase = { kind: "loading" };
  private isNarrow = false;
  private dev = false;
  private renders = 0;

  set hass(hass: Hass) {
    this.store.set(hass);
  }

  set narrow(narrow: boolean) {
    if (narrow === this.isNarrow) return;
    this.isNarrow = narrow;
    this.requestUpdate();
  }

  set panel(panel: PanelInfo) {
    const config = panel.config;
    if (!validateConfig(config)) {
      this.source = null;
      this.phase = {
        kind: "error",
        message: "panel_custom config needs mode: dev and api_base (for example http://<mac>:5173/api).",
      };
      this.requestUpdate();
      return;
    }
    if (config.api_base === this.apiBase) return;
    this.apiBase = config.api_base;
    this.houseOverride = config.house_id ?? null;
    // Only dev mode exists until production delivery is decided; it shows the render counters.
    this.dev = true;
    this.source = createDevHouseSource(config.api_base);
    void this.loadSetup();
  }

  private async loadSetup(): Promise<void> {
    if (this.source === null) return;
    this.phase = { kind: "loading" };
    this.requestUpdate();
    try {
      const setup = await this.source.readSetup();
      this.setup = this.houseOverride === null ? setup : { ...setup, houseId: this.houseOverride };
      this.phase = { kind: this.setup.houseId === null ? "setup" : "viewer" };
    } catch (error) {
      this.phase = {
        kind: "error",
        message: error instanceof Error ? error.message : "Could not reach the builder.",
      };
    }
    this.requestUpdate();
  }

  protected override render(): TemplateResult {
    this.renders += 1;
    const counter = this.dev ? html`<div class="renders">panel renders ${this.renders}</div>` : null;
    switch (this.phase.kind) {
      case "loading":
        return html`<div class="center">Loading Homeplan…</div>`;
      case "error":
        return html`<div class="center error">${this.phase.message}</div>`;
      case "setup":
        return html`<homeplan-setup-screen
            .source=${this.source ?? undefined}
            .setup=${this.setup}
            @setup-saved=${(event: CustomEvent<ViewerSetup>) => {
              this.setup = event.detail;
              this.phase = { kind: "viewer" };
              this.requestUpdate();
            }}
            @setup-cancel=${() => {
              this.phase = { kind: "viewer" };
              this.requestUpdate();
            }}
          ></homeplan-setup-screen
          >${counter}`;
      case "viewer":
        return html`<homeplan-viewer-screen
            .store=${this.store}
            .source=${this.source ?? undefined}
            .setup=${this.setup}
            .narrow=${this.isNarrow}
            .dev=${this.dev}
            @open-setup=${() => {
              this.phase = { kind: "setup" };
              this.requestUpdate();
            }}
          ></homeplan-viewer-screen
          >${counter}`;
    }
  }
}
