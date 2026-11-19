// The viewer's navigation setting (Phase 14.6, spec/home-assistant/viewer-mvp.md#houseviewer): Trackpad, Mouse, or
// Touch, installation-global in the dashboard setting (owner, 2026-11-18) and saved with Settings' Save. Absent, it
// follows the device: Touch where the only pointer is coarse (a wall tablet or a phone; `touchFirstDevice` in
// touchDevice.ts), else Trackpad. Pure (no DOM), so `npm run ha:conditions` checks it.
import type { HaDashboardValue, HaNavigationValue } from "@shared/domain/schemas/homeAssistant";

/** The choices in Settings → House → Navigation, in order, with their labels and what each does. */
export const navigationChoices: readonly Readonly<{
  value: HaNavigationValue;
  label: string;
  hint: string;
}>[] = [
  {
    value: "trackpad",
    label: "Trackpad",
    hint: "Two-finger scroll orbits, Shift + scroll pans, pinch zooms at the pointer; drag orbits, Shift + drag pans.",
  },
  {
    value: "mouse",
    label: "Mouse",
    hint: "The wheel zooms at the pointer; middle-drag or drag orbits, Shift while dragging pans.",
  },
  {
    value: "touch",
    label: "Touch",
    hint: "One finger orbits, two fingers pan, pinch zooms; a tap still opens rooms and runs actions.",
  },
];

/** The navigation in effect: the stored choice, else Touch on a touch-first device and Trackpad otherwise. */
export const effectiveNavigation = (dashboard: HaDashboardValue, touchFirst: boolean): HaNavigationValue =>
  dashboard.navigation ?? (touchFirst ? "touch" : "trackpad");

/** The dashboard setting with a navigation chosen in Settings (stored even when it equals the device default). */
export const withNavigation = (
  dashboard: HaDashboardValue,
  navigation: HaNavigationValue,
): HaDashboardValue => ({
  ...dashboard,
  navigation,
});

/**
 * How wheel events read in each mode (the builder's gesture map, D16): Trackpad as the trackpad map, Mouse as the
 * mouse map; Touch as the mouse map too, since a touch device's occasional wheel is a mouse's.
 */
export const wheelNavigation = (navigation: HaNavigationValue): "trackpad" | "mouse" =>
  navigation === "trackpad" ? "trackpad" : "mouse";
