// Stable packaged HA host. It never evaluates two viewer implementations in one document.
import { createIntegrationClient, integrationUrl } from "./integrationClient";
import type { Hass } from "./hassStore";
import type { IntegrationContext, MountedViewer } from "./integrationContext";
import type { BootstrapValue } from "@shared/contracts/homeplanIntegration";

const recoveryKey = "homeplan.nextLoadLocal";
type ViewerModule = Readonly<{
  protocol: number;
  apiProtocol: number;
  mount: (host: HTMLElement, context: IntegrationContext) => MountedViewer;
}>;
const viewerModule = (value: unknown): value is ViewerModule =>
  typeof value === "object" &&
  value !== null &&
  "protocol" in value &&
  value.protocol === 1 &&
  "apiProtocol" in value &&
  value.apiProtocol === 1 &&
  "mount" in value &&
  typeof value.mount === "function";

class HomeplanLoader extends HTMLElement {
  private hassValue: Hass | null = null;
  private isNarrow = false;
  private instance: MountedViewer | null = null;
  private started = false;
  private generation = 0;
  private recovering = false;
  private bootstrap: BootstrapValue | null = null;
  private readonly client = createIntegrationClient(() => this.hassValue);
  private readonly container = document.createElement("div");

  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(this.container);
  }
  set hass(value: Hass) {
    this.hassValue = value;
    this.instance?.setHass(value);
    void this.start();
  }
  set narrow(value: boolean) {
    this.isNarrow = value;
    this.instance?.setNarrow(value);
  }
  set panel(_value: unknown) {
    void this.start();
  }
  connectedCallback(): void {
    void this.start();
  }
  disconnectedCallback(): void {
    this.generation += 1;
    this.started = false;
    this.instance?.dispose();
    this.instance = null;
  }

  private showRecovery(message: string): void {
    this.instance?.dispose();
    this.instance = null;
    const box = document.createElement("div");
    box.style.cssText =
      "padding:32px;font:16px system-ui;color:var(--primary-text-color);background:var(--primary-background-color);min-height:100dvh;box-sizing:border-box";
    const description = document.createElement("p");
    description.textContent = message;
    const link = document.createElement("a");
    link.href = "/config/integrations";
    link.textContent = "Open Devices & services → Homeplan → Configure";
    box.append(description, link);
    if (this.hassValue?.user?.is_admin === true) {
      const button = document.createElement("button");
      button.textContent = "Disable DEV MODE and restore packaged frontend";
      button.addEventListener("click", () => {
        void (async () => {
          button.disabled = true;
          try {
            const connection = await this.client.connection();
            const saved = await this.client.saveConnection(connection.revision, { devMode: false });
            await this.client.restoreFrontend(saved.revision);
            location.reload();
          } catch (error) {
            description.textContent =
              error instanceof Error ? error.message : "Use native Configure to recover.";
            button.disabled = false;
          }
        })();
      });
      box.append(document.createElement("br"), button);
    }
    this.container.replaceChildren(box);
  }
  private fallback(error: unknown, remote: boolean): void {
    if (this.recovering) return;
    const message = remote
      ? "Local fallback — development server unavailable or incompatible. DEV MODE is still enabled; refresh to retry remote."
      : "Recovered packaged frontend after a local viewer load failure.";
    if (!this.isConnected) return;
    if (!remote && this.bootstrap?.frontend.active === null) {
      this.showRecovery(error instanceof Error ? error.message : message);
      return;
    }
    this.recovering = true;
    try {
      if (sessionStorage.getItem(recoveryKey) !== null) {
        this.showRecovery(message);
        return;
      }
      sessionStorage.setItem(recoveryKey, JSON.stringify({ message, packaged: !remote }));
      location.reload();
    } catch {
      this.showRecovery(`${message} Open native Configure to disable DEV MODE or restore packaged files.`);
    }
  }
  private async start(): Promise<void> {
    const hass = this.hassValue;
    if (this.started || !this.isConnected || hass?.fetchWithAuth === undefined) return;
    this.started = true;
    const generation = ++this.generation;
    let localRecovery: { message: string; packaged: boolean } | null = null;
    try {
      const raw = sessionStorage.getItem(recoveryKey);
      if (raw !== null) {
        sessionStorage.removeItem(recoveryKey);
        const value: unknown = JSON.parse(raw);
        if (
          typeof value === "object" &&
          value !== null &&
          "message" in value &&
          typeof value.message === "string" &&
          "packaged" in value &&
          typeof value.packaged === "boolean"
        )
          localRecovery = { message: value.message, packaged: value.packaged };
      }
    } catch {
      /* Storage may be disabled; native recovery remains available. */
    }
    let remote = false;
    try {
      const bootstrap = await this.client.bootstrap();
      if (generation !== this.generation) return;
      this.bootstrap = bootstrap;
      remote = bootstrap.connection.devMode && localRecovery === null;
      if (remote && bootstrap.viewer.houseId !== null) {
        await this.client.fetchPrivate(
          `${integrationUrl("remote", "houses", bootstrap.viewer.houseId, "document")}?generation=${String(bootstrap.connection.generation)}`,
        );
      }
      const chosen =
        localRecovery?.packaged === true
          ? { ...bootstrap, frontend: { ...bootstrap.frontend, active: null } }
          : bootstrap;
      const url = new URL(this.client.moduleUrl(chosen, remote));
      url.searchParams.set(
        "load",
        // A cache-buster that also works on plain-http HA (crypto.randomUUID needs a secure context).
        remote
          ? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
          : (chosen.frontend.active ?? chosen.frontend.shipped).bundleId,
      );
      const exported: unknown = await import(/* @vite-ignore */ url.href);
      if (!viewerModule(exported))
        throw new Error("The viewer does not support this integration's loader/API protocol.");
      if (generation !== this.generation || this.hassValue === null) return;
      this.instance = exported.mount(this.container, {
        client: this.client,
        bootstrap,
        remote,
        message: localRecovery?.message ?? bootstrap.recovery,
        hass: this.hassValue,
        narrow: this.isNarrow,
        fail: (error) => {
          if (localRecovery !== null)
            this.showRecovery(
              error instanceof Error ? error.message : "No usable local copy; open native recovery.",
            );
          else this.fallback(error, remote);
        },
      });
      if (typeof this.instance.dispose !== "function" || typeof this.instance.setHass !== "function")
        throw new Error("The frontend mount handshake is invalid.");
    } catch (error) {
      if (generation !== this.generation) return;
      if (localRecovery !== null)
        this.showRecovery(error instanceof Error ? error.message : localRecovery.message);
      else this.fallback(error, remote);
    }
  }
}

if (customElements.get("homeplan-panel") === undefined)
  customElements.define("homeplan-panel", HomeplanLoader);
