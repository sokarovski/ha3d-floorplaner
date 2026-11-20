// Home Assistant's own default dashboard actions (Phase 21): what a gesture on an entity does when nothing is set,
// as HA's button and tile cards. Pure: the viewer (ha-viewer/haActions.ts) and the checks use it.
import type { HaActionValue } from "../schemas/homeAssistant";

/** A tap, a hold, or a double tap. */
export type DefaultGesture = "tap" | "hold" | "doubleTap";

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
export const haDefaultAction = (entityId: string | null, gesture: DefaultGesture): HaActionValue =>
  gesture === "tap"
    ? {
        action: entityId !== null && toggleDomains.has(entityId.split(".")[0] ?? "") ? "toggle" : "more-info",
      }
    : gesture === "hold"
      ? { action: "more-info" }
      : { action: "none" };
