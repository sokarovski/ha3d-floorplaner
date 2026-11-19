// Bubbles (Phase 8.5, spec/home-assistant/bindings.md#bubbles): what a bubble shows (icon, value or state) and
// what its gestures do by default, from its preset and its entity. Pure (no HA, no DOM), checked by
// `npm run ha:conditions`.
import type { ConditionEntity } from "./conditions";
import type {
  HaActionValue,
  HaBubbleContentValue,
  HaBubbleFormat,
  HaBubblePreset,
} from "../schemas/homeAssistant";

export type BubbleGesture = "tap" | "hold" | "doubleTap";

type PresetInfo = Readonly<{ label: string; icon: string; format: HaBubbleFormat }>;

/** Each preset's label, default icon (an `ha-icon` name), and default format. */
export const bubblePresets: Readonly<Record<HaBubblePreset, PresetInfo>> = {
  temperature: { label: "Temperature", icon: "mdi:thermometer", format: "value" },
  humidity: { label: "Humidity", icon: "mdi:water-percent", format: "value" },
  light: { label: "Light toggle", icon: "mdi:lightbulb", format: "icon" },
  presence: { label: "Presence", icon: "mdi:motion-sensor", format: "icon" },
  state: { label: "State", icon: "mdi:information-outline", format: "state" },
  custom: { label: "Custom", icon: "mdi:circle-medium", format: "value" },
};

/** A new bubble's content for a preset (no entity yet). */
export const newBubbleContent = (preset: HaBubblePreset): HaBubbleContentValue => ({
  preset,
  format: bubblePresets[preset].format,
});

/**
 * The action of a gesture without a configured one: a tap opens the entity's more-info (for a camera that is
 * HA's live view), except the light-toggle preset, whose tap toggles; hold and double tap do nothing.
 */
export const defaultBubbleAction = (preset: HaBubblePreset, gesture: BubbleGesture): HaActionValue =>
  gesture !== "tap"
    ? { action: "none" }
    : preset === "light"
      ? { action: "toggle" }
      : { action: "more-info" };

/** The icon shown: the bubble's own, else the entity's `icon` attribute, else the preset's. */
export const bubbleIcon = (content: HaBubbleContentValue, entity: ConditionEntity | undefined): string => {
  const own = entity?.attributes.icon;
  return content.icon ?? (typeof own === "string" && own !== "" ? own : bubblePresets[content.preset].icon);
};

/** A number as a bubble shows it: at most one decimal, without trailing zeros. */
const shortNumber = (value: number): string => String(Math.round(value * 10) / 10);

/** HA's raw state as words: `not_home` → "Not home". */
export const stateWords = (state: string): string => {
  const words = state.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * The text next to the icon, or null for none (`icon`, or nothing to show). `value`: the state (or attribute)
 * with the entity's `unit_of_measurement` when reading the state; a numeric value is shortened to one decimal.
 * `state`: the state (or attribute) in words. A missing entity reads "Unavailable" in either.
 */
export const bubbleText = (
  content: HaBubbleContentValue,
  entity: ConditionEntity | undefined,
): string | null => {
  if (content.format === "icon") return null;
  if (entity === undefined) return (content.stateEntityId ?? null) === null ? null : "Unavailable";
  const raw: unknown = content.attribute === undefined ? entity.state : entity.attributes[content.attribute];
  if (raw === undefined || raw === null) return null;
  const textValue =
    typeof raw === "string"
      ? raw
      : typeof raw === "number"
        ? shortNumber(raw)
        : typeof raw === "boolean"
          ? String(raw)
          : JSON.stringify(raw);
  if (content.format === "state") return stateWords(textValue);
  if (textValue === "unavailable" || textValue === "unknown") return stateWords(textValue);
  const numeric = Number(textValue);
  const shown = textValue.trim() !== "" && Number.isFinite(numeric) ? shortNumber(numeric) : textValue;
  const unit = entity.attributes.unit_of_measurement;
  return content.attribute === undefined && typeof unit === "string" && unit !== ""
    ? `${shown} ${unit}`
    : shown;
};

/** True when the bubble's entity is "on" (or an active state), so its icon takes the theme's active colour. */
export const bubbleActive = (entity: ConditionEntity | undefined): boolean =>
  entity !== undefined &&
  ["on", "open", "home", "playing", "heat", "cool", "detected"].includes(entity.state);
