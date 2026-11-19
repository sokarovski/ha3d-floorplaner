import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { baseColorsForm } from "@shared/domain/schemas/forms/schemeForms";
import { isSchemaNode, withValueAtPath } from "@shared/domain/schemas/schemaWalk";
import { Banner } from "../../../design-system/components/Banner/Banner";
import { Button } from "../../../design-system/components/Button/Button";
import { SchemaForm } from "../../../design-system/forms/SchemaForm/SchemaForm";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import {
  contrastPairs,
  contrastRatio,
  deriveTheme,
  hexToRgb,
  rampOf,
  schemeFromPreference,
  schemePresets,
} from "../../../design-system/tokens/colorScheme";
import type { BaseColors, SchemePreset } from "../../../design-system/tokens/colorScheme";
import { colorTokens } from "../../../design-system/tokens/colorTokens";
import { HexSwatch } from "../components/HexSwatch";
import { ThemeSandbox } from "../components/ThemeSandbox";

type RgbColors = Readonly<Record<keyof BaseColors, readonly number[]>>;

const toRgb = (scheme: BaseColors): RgbColors => {
  const channels = (hex: string): number[] => {
    const { r, g, b } = hexToRgb(hex);
    return [r, g, b].map((value) => Math.round(value * 255));
  };
  return {
    neutral: channels(scheme.neutral),
    accent: channels(scheme.accent),
    danger: channels(scheme.danger),
    warning: channels(scheme.warning),
    success: channels(scheme.success),
  };
};

const baseKeys: readonly (keyof BaseColors)[] = ["neutral", "accent", "danger", "warning", "success"];

const channelsOf = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const channels: number[] = [];
  for (const channel of value) {
    if (typeof channel !== "number") return undefined;
    channels.push(channel);
  }
  return channels;
};

/** The form's value as five RGB colours, or undefined when it is not one (never cast). */
const readColors = (value: unknown): RgbColors | undefined => {
  if (!isSchemaNode(value)) return undefined;
  const neutral = channelsOf(value.neutral);
  const accent = channelsOf(value.accent);
  const danger = channelsOf(value.danger);
  const warning = channelsOf(value.warning);
  const success = channelsOf(value.success);
  return neutral === undefined ||
    accent === undefined ||
    danger === undefined ||
    warning === undefined ||
    success === undefined
    ? undefined
    : { neutral, accent, danger, warning, success };
};
const presetNames: readonly SchemePreset[] = ["blue", "graphite", "green"];

export const DsThemesPage = (): ReactElement => {
  const [colors, setColors] = useState<RgbColors>(() => toRgb(schemePresets.blue));
  const scheme = useMemo(() => schemeFromPreference("custom", colors), [colors]);
  const themes = useMemo(
    () => ({ light: deriveTheme(scheme, "light"), dark: deriveTheme(scheme, "dark") }),
    [scheme],
  );
  return (
    <article data-ds-page="">
      <h1>Themes</h1>
      <p data-ds-lead="">
        Colours come in two levels (Phase 5.5): a scheme is five base colours, and every role token is derived
        from them for light and dark. Change a base colour below to see its ramps, the derived roles, and the
        contrast checks.
      </p>
      <h2>How a scheme becomes tokens</h2>
      <ol data-ds-list="">
        <li>
          Each base colour becomes a 12-step OKLCH ramp per theme: even perceived lightness, quiet tints at
          step 1, the solid colour at step 9, text at steps 11 and 12.
        </li>
        <li>
          Every one of the {colorTokens.length} roles maps to a ramp step (<code>colorScheme.ts</code>):
          surfaces from the neutral ramp, primary and selection from the accent ramp, and so on. Hover and
          pressed are state layers (the foreground at 6–14 %) that work on any surface. Axis and guide colours
          are fixed, because their meaning must not change with a scheme.
        </li>
        <li>Text roles are nudged in lightness until they reach WCAG AA (4.5:1) against their background.</li>
        <li>
          The theme controller writes the result as <code>--ui-color-&lt;role&gt;</code> on the UI root, so a
          scheme change applies at once. <code>npm run styles:sync</code> writes the default scheme into{" "}
          <code>tokens.tw.css</code> for first paint, and the same function feeds the Colors page and the
          viewport&apos;s selection colours.
        </li>
        <li>
          Users pick a preset (Blue, Graphite, Green) or Custom colours in Settings; the choice is an
          installation-wide preference.
        </li>
      </ol>
      <h2>Playground</h2>
      <div data-ds-example-stage="">
        {presetNames.map((name) => (
          <Button
            key={name}
            variant="secondary"
            onPress={() => {
              setColors(toRgb(schemePresets[name]));
            }}
          >
            {name.charAt(0).toUpperCase() + name.slice(1)}
          </Button>
        ))}
      </div>
      <SchemaForm
        schema={baseColorsForm}
        value={colors}
        registry={genericEditors}
        projectUnit="mm"
        mode="live"
        onCommit={(path, next) => {
          setColors((current) => readColors(withValueAtPath(current, path, next)) ?? current);
          return true;
        }}
      />
      <h3>Ramps</h3>
      <table data-ds-table="">
        <thead>
          <tr>
            <th scope="col">Base</th>
            <th scope="col">Light 1–12</th>
            <th scope="col">Dark 1–12</th>
          </tr>
        </thead>
        <tbody>
          {baseKeys.map((key) => (
            <tr key={key}>
              <td>{key}</td>
              {(["light", "dark"] as const).map((theme) => (
                <td key={theme}>
                  <span data-ds-ramp="">
                    {rampOf(scheme[key], theme).map((color, index) => (
                      <HexSwatch
                        key={color + String(index)}
                        color={color}
                        label={`${key} ${String(index + 1)}`}
                      />
                    ))}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Contrast</h3>
      <table data-ds-table="">
        <thead>
          <tr>
            <th scope="col">Text on background</th>
            <th scope="col">Light</th>
            <th scope="col">Dark</th>
          </tr>
        </thead>
        <tbody>
          {contrastPairs.map((pair) => (
            <tr key={`${pair.text}-${pair.background}`}>
              <td>
                {pair.text} on {pair.background}
              </td>
              {(["light", "dark"] as const).map((theme) => {
                const ratio = contrastRatio(
                  themes[theme][pair.text] ?? "#000",
                  themes[theme][pair.background] ?? "#FFF",
                );
                return (
                  <td key={theme} data-ds-contrast-fail={ratio < 4.5 ? "" : undefined}>
                    {ratio.toFixed(2)}:1 {ratio < 4.5 ? "fails AA" : "AA"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Derived roles</h3>
      <table data-ds-table="">
        <thead>
          <tr>
            <th scope="col">Role</th>
            <th scope="col">Light</th>
            <th scope="col">Dark</th>
          </tr>
        </thead>
        <tbody>
          {colorTokens.map((token) => (
            <tr key={token.role}>
              <td>{token.role}</td>
              {(["light", "dark"] as const).map((theme) => (
                <td key={theme}>
                  <HexSwatch color={themes[theme][token.role] ?? ""} label={`${token.role} ${theme}`} />{" "}
                  <code>{themes[theme][token.role]}</code>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Light, Dark, and Auto</h2>
      <ul data-ds-list="">
        <li>
          The saved preference (<code>appearance.theme</code>) is <code>light</code>, <code>dark</code>, or{" "}
          <code>auto</code>; Auto stays Auto even when it resolves to dark.
        </li>
        <li>
          The theme controller sets <code>data-theme</code> and the scheme&apos;s tokens on the{" "}
          <code>&lt;html data-ui-root&gt;</code> element, so menus and popups portalled to the body inherit
          them. A script in <code>index.html</code> applies the cached theme and tokens before first paint.
        </li>
        <li>
          Auto follows <code>prefers-color-scheme</code> and reacts to system changes.
        </li>
        <li>Theme never changes house materials, lighting, or exports.</li>
      </ul>
      <h2>Preview</h2>
      <p>These previews are sandboxed with the default scheme and never write the application preference.</p>
      <div data-ds-card-grid="">
        <ThemeSandbox theme="light">
          <div data-ds-example-stage="">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Banner tone="warning">Light warning</Banner>
          </div>
        </ThemeSandbox>
        <ThemeSandbox theme="dark">
          <div data-ds-example-stage="">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Banner tone="warning">Dark warning</Banner>
          </div>
        </ThemeSandbox>
      </div>
    </article>
  );
};
