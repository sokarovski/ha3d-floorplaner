// Runs Home Assistant dashboard actions from the viewer (spec/home-assistant/viewer-mvp.md#bindings-and-edit-mode):
// the same action objects HA's action editor produces (tap_action and friends). Implemented here because the
// panel is not a Lovelace dashboard, whose hass-action handler is not available to it.
import type { HaActionValue } from "@shared/domain/schemas/homeAssistant";
import type { Hass } from "./hassStore";

export type Gesture = "tap" | "hold" | "doubleTap";

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return Object.fromEntries(Object.entries(value));
};

/** The action for a gesture when none is configured: like HA's tile/button cards. */
export const defaultAction = (gesture: Gesture): HaActionValue =>
  gesture === "tap"
    ? { action: "toggle" }
    : gesture === "hold"
      ? { action: "more-info" }
      : { action: "none" };

/** The domains HA's frontend toggles on a tap by default (its `DOMAINS_TOGGLE`). */
const toggleDomains: ReadonlySet<string> = new Set([
  "fan",
  "input_boolean",
  "light",
  "switch",
  "group",
  "automation",
  "humidifier",
  "valve",
]);

/**
 * Home Assistant's own default for a gesture on an entity (its button and tile cards; Phase 21, owner: every thing
 * with an entity behaves like HA by default): a tap toggles a toggleable entity and opens more-info for any other,
 * a hold opens more-info, a double tap does nothing. Objects use it (an AC's climate entity opens more-info, as
 * before); a light's default is the same for its light entity.
 */
export const haDefaultAction = (entityId: string | null, gesture: Gesture): HaActionValue =>
  gesture === "tap"
    ? {
        action: entityId !== null && toggleDomains.has(entityId.split(".")[0] ?? "") ? "toggle" : "more-info",
      }
    : gesture === "hold"
      ? { action: "more-info" }
      : { action: "none" };

/** host: an element inside HA's DOM, so composed events (more-info) reach HA's dialog manager. */
export const runAction = async (
  host: HTMLElement,
  hass: Hass,
  action: HaActionValue,
  entityId: string | null,
): Promise<void> => {
  const field = (name: string): unknown => Reflect.get(action, name);
  const entity = text(field("entity")) ?? entityId;
  switch (action.action) {
    case "toggle": {
      if (entity === null) return;
      const domain = entity.split(".")[0] ?? "homeassistant";
      await hass.callService(domain, "toggle", { entity_id: entity });
      return;
    }
    case "more-info": {
      if (entity === null) return;
      host.dispatchEvent(
        new CustomEvent("hass-more-info", { detail: { entityId: entity }, bubbles: true, composed: true }),
      );
      return;
    }
    case "perform-action":
    case "call-service": {
      const name = text(field("perform_action")) ?? text(field("service"));
      const [domain, service] = name?.split(".", 2) ?? [];
      if (domain === undefined || service === undefined) return;
      const data = record(field("data")) ?? record(field("service_data")) ?? {};
      const target = record(field("target"));
      await hass.callService(domain, service, data, target);
      return;
    }
    case "navigate": {
      const path = text(field("navigation_path"));
      if (path === undefined) return;
      window.history.pushState(null, "", path);
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      return;
    }
    case "url": {
      const url = text(field("url_path"));
      if (url === undefined) return;
      // Only web links: http(s) and relative URLs (never javascript:, data: and similar schemes).
      const protocol = new URL(url, window.location.href).protocol;
      if (protocol === "http:" || protocol === "https:") window.open(url, "_blank", "noopener");
      return;
    }
    default:
      // "none", and "assist" (not supported in the viewer yet).
      return;
  }
};
