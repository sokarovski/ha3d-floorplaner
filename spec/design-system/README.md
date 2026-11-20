# Design system, themes, and React conventions

Updated: 2026-11-19.

Status: a reusable design system, named light/dark tokens, Light/Dark/Auto settings, data-attribute styling, `.tw.css` filenames, and the React conventions below are owner requirements. Tailwind is the selected MVP styling engine under D13. The visual rules (§1), the two-level colours (§3), instant settings, segmented choices, and Yes/No toggles are owner decisions from the Phase 5 redesign (5.5–5.10 and follow-up rounds). The component list in §7 is what exists in `src/design-system/`; exact token values are implementation conventions.

The owner also requires an unlisted `/ds` documentation application with colors, theme-authoring guidance, individual component pages, live examples, props, and View source dialogs. The [workbench specification](workbench.md) owns those pages and their acceptance criteria. [Frontend architecture](../architecture/frontend-architecture.md) owns route and module conventions.

## 1. Visual direction and scope

Owner direction (Phase 5.6, after iOS grouped lists, Gmail's Material 3 surfaces, and Bootstrap's spacing): a calm, spacious interface that separates areas with **surface tone and space, not lines**. The house viewport remains the central content. Reuse the same components and tokens across Houses, editor panels, settings, menus, and forms. The rules:

1. Regions are surfaces: the app background is `canvas`; panels are `surface` cards (12 px radius) on it with an 8 px gap. No 1 px borders between header, toolbox, tree, and properties, under panel headers, or between property groups.
2. Borders are the exception: only where equal surfaces touch and space cannot separate them (a drop zone's dashed outline), never `border-strong` around regions.
3. Stack vertically on a 4 / 8 / 12 / 16 / 24 / 32 px scale: 16 px panel padding, 12 px between fields, 16–24 px between groups.
4. Controls are 36 px tall (`--size-control`), tree rows 32 px, toolbox buttons 40 px; body text 14 px, labels 13 px.
5. Fields are filled (`input`), not outlined; focus shows a 2 px `focus` ring; invalid shows a `danger` ring plus the message.
6. Titles are sentence case, 13–15 px semibold in `foreground` (no grey uppercase). Hierarchy in the property panel (Phase 19.7): panel title 15 px, collapsible group header 14 px with its chevron, section title 13 px (no chevron), field labels 13 px regular in `muted`.
7. Hover and press are a state layer (the foreground at 6–14 % as an inset tint) that works on any background; selection is a rounded tinted pill (`selection`), never an outline box; the active tool is a tonal pill.
8. Only floating things cast a shadow (`--shadow-floating`): menus, popovers, tooltips, popups, the toolbox rail, viewport overlays.
9. Radii: 8 px controls (`--radius-control`), 12 px cards (`--radius-card`), 16 px popups (`--radius-popup`), full pills for segmented controls and chips.

UI theme changes affect interface chrome and editor helpers, not house materials, physical lighting, sun settings, or exported photorealistic images. A dark interface must not silently turn a daytime scene into a nighttime scene.

## 2. Theme settings

Provide a saved application appearance preference with three values:

| Setting | Effective theme |
| --- | --- |
| Light | Always light |
| Dark | Always dark |
| Auto | Follow the operating system/browser `prefers-color-scheme` preference and react to changes |

Recommended default is **Auto**. Persist the chosen preference separately from the resolved theme: `auto` remains `auto` even when it currently resolves to dark. Use the [global preferences JSON and browser cache](../architecture/application-preferences.md), with immediate local application and selective synchronization. Theme is a global application preference, separate from the house's physical/project settings.

Resolve the theme near application startup to avoid a visibly incorrect initial theme. Put the effective `data-theme="light"` or `data-theme="dark"` on a UI root with `data-ui-root`. Apply theme tokens there, including to menus/dialog portals mounted under the same root. Set the appropriate native `color-scheme` for browser controls.

Use one small theme controller and a settings control, connected to the shared preference service. Components inherit CSS variables; they should not each subscribe to theme state or require a nested theme provider. A shared store/hook or a single narrowly scoped provider can be used if necessary. Home Assistant card theme inheritance is a separate future integration decision.

Tailwind documents attribute-driven themes and system preference detection; the proposed controller uses that mechanism without requiring theme-specific utility strings in React. [Tailwind dark-mode documentation](https://tailwindcss.com/docs/dark-mode).

## 3. Semantic color tokens

Use semantic roles rather than component-local hex colors or palette names such as `slate-900`. Proposed convention:

- Runtime variable: `--ui-color-<role>`.
- Tailwind theme alias: `--color-<role>`.
- Utilities used inside CSS: for example `bg-surface`, `text-foreground`, `border-border`.

**Two levels (owner, Phase 5.5):** a **colour scheme** is five base colours (`neutral`, `accent`, `danger`, `warning`, `success`). Every role below is **derived** from them for light and dark by one function (`src/design-system/tokens/colorScheme.ts`): each base becomes a 12-step OKLCH ramp per theme (even perceived lightness; step 9 the solid colour, 11–12 text), roles map to ramp steps, `hover`/`pressed` are state layers of the foreground, and text roles are nudged until they reach WCAG AA (4.5:1) against their background. `guide` and `axis-*` are fixed (their meaning must not change). The theme controller writes the derived roles as `--ui-color-*` on the UI root (instant scheme changes, cached for first paint); `npm run styles:sync` writes the default scheme into `tokens.tw.css`; the `/ds` Colors page and the renderer's selection colours use the same derivation. Presets: **Blue** (default), **Graphite**, **Green**, or **Custom** base colours (`appearance.colorScheme`, `appearance.customColors`). The values below are the default Blue scheme as derived at the time of writing; the derivation, not this table, is authoritative. The viewport's selection colours come from the same scheme (`helperAccent`); in dark mode the selection fill on floors and walls uses the deep solid accent rather than a pale tint, while light mode keeps its tint (owner, Phase 5 follow-up, second round).

Roles; every role has a light and dark value:

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| `canvas` | `#F5F7FA` | `#0F0F10` | Application background |
| `surface` | `#FFFFFF` | `#161719` | Panels, cards, toolbox |
| `surface-raised` | `#FFFFFF` | `#272C32` | Menus, popovers, dialogs |
| `input` | `#EBEFF5` | `#202327` | Input backgrounds |
| `foreground` | `#232933` | `#EAF3FE` | Main text/icons |
| `muted` | `#4F5C6F` | `#BAC9DE` | Secondary text |
| `disabled-foreground` | `#64748B` | `#616D7E` | Disabled labels/icons |
| `border` | `#D5DDE8` | `#3A424C` | Subtle separators |
| `border-strong` | `#99A6B8` | `#616D7E` | Control outlines where stronger contrast is needed |
| `hover` | `rgb(35 41 51 / 6%)` | `rgb(234 243 254 / 8%)` | Neutral hover surface |
| `pressed` | `rgb(35 41 51 / 10%)` | `rgb(234 243 254 / 14%)` | Pressed neutral controls |
| `primary` | `#1D4ED8` | `#8CB0FB` | Primary action background |
| `primary-hover` | `#0D39C3` | `#A9C4FC` | Primary action hover |
| `on-primary` | `#FFFFFF` | `#0F0F10` | Primary action text/icons |
| `selection` | `#E7EFFE` | `#192A4E` | Selected tree item/tool |
| `on-selection` | `#234FC0` | `#ECF2FE` | Selection text/icons |
| `focus` | `#1D4ED8` | `#A9C4FC` | Keyboard focus indicator |
| `danger` | `#BE1E1F` | `#FBB2A8` | Error/destructive text/icons and filled danger actions |
| `danger-hover` | `#AA1115` | `#FEEEEB` | Filled danger action hover |
| `on-danger` | `#FFFFFF` | `#150D0C` | Filled danger action text/icons |
| `danger-surface` | `#FEF4F3` | `#361916` | Error surface |
| `success` | `#056E2E` | `#7EE193` | Success text/icons |
| `success-surface` | `#EEFBEF` | `#152819` | Success surface |
| `warning` | `#864908` | `#FCB67F` | Warning text/icons |
| `warning-surface` | `#FEF5EE` | `#2F1F11` | Warning surface |
| `info` | `#234FC0` | `#AEC7FC` | Informational text/icons |
| `info-surface` | `#F3F7FF` | `#17223A` | Informational surface |
| `overlay` | `rgb(35 41 51 / 35%)` | `rgb(0 0 0 / 60%)` | Modal backdrop |
| `grid` | `rgb(79 92 111 / 20%)` | `rgb(186 201 222 / 18%)` | Subtle editor grid |
| `guide` | `#7C3AED` | `#C4B5FD` | Construction guides and markers |
| `axis-x` | `#DC2626` | `#F87171` | Red (plan x) axis: inference cues, view gizmo |
| `axis-y` | `#16A34A` | `#4ADE80` | Green (plan y) axis: inference cues, view gizmo |
| `axis-z` | `#2563EB` | `#60A5FA` | Blue (vertical) axis: inference cues, view gizmo |

Treat the table as the complete color-role set, emitted in both themes from the scheme. New semantic tokens must add both variants. Palette refinements remain open; implementation must verify text/control contrast in their actual pairings. Color must not be the only indication of selection, errors, or disabled state.

Declare matching non-color tokens for shared typography, spacing, radii, control sizes, shadows, and layer order. Baseline (Phase 5.6): system sans-serif UI, monospace for numeric readouts, a `0.25rem` spacing step, `--radius-control` 0.5rem, `--radius-card` 0.75rem, `--radius-popup` 1rem, `--size-control` 2.25rem, a `3.5rem` toolbox, `--shadow-raised` and `--shadow-floating`. They are UI dimensions independent of CAD model units.

## 4. Tailwind and stylesheet organization

Use a compatible stable Tailwind release when implementing; verify its directives and pin the chosen version. Every authored Tailwind stylesheet uses the **`.tw.css`** suffix, including tokens, the entry stylesheet, component files, and layout styles.

For a component identified by `data-toolbox`, use **`datatoolbox.tw.css`**. Use correctly spelled, consistent names: `data-toolbox` and `data-toolbox-vertical` in both React and CSS.

The Button example uses **`button.tw.css`** and `data-button` selectors. A `data` filename prefix is not necessary for every component; the required suffix is `.tw.css`. Keep each component's base and variant rules together in its named stylesheet.

The [source layout](examples.md#source-layout) shows the organization. `npm run styles:sync` regenerates the `app.tw.css` import list from every `.tw.css` file and writes the default scheme into `tokens.tw.css`.

Recommended compilation: import Tailwind, tokens, and component `.tw.css` files from one `app.tw.css` entry, and import that entry once from the app. Component rules share that Tailwind compilation context. If a stylesheet is processed separately, use Tailwind's `@reference` mechanism for the shared theme/utilities rather than duplicating the Tailwind output. [Tailwind directives](https://tailwindcss.com/docs/functions-and-directives).

### Token mapping pattern

The [token mapping excerpt](examples.md#token-mapping-excerpt) shows part of `tokens.tw.css`. Implementation must emit **all** token pairs from the palette table.

`@theme inline` maps semantic runtime variables to Tailwind utilities while allowing their values to change at the UI root. [Tailwind theme variables](https://tailwindcss.com/docs/theme).

## 5. Component selectors and prop-driven styling

React exposes the component identity and styling states as `data-*` attributes. The component's stylesheet owns styling through attribute selectors and `@apply`.

- Root identity: `[data-toolbox]`, `[data-button]`, `[data-input]`, and equivalent component names.
- Boolean styling modifiers: `[data-toolbox][data-toolbox-vertical]`.
- Emit an empty attribute when a boolean state applies and `undefined` when it does not; do not emit a false-valued string that still matches an attribute-presence selector.
- Use native selectors such as `:hover`, `:focus-visible`, and `:disabled` for native states. Use named `data-*` modifiers for component variants, active tool state, orientation, and other prop-driven presentation.
- Keep base/variant/state rules in the component's `.tw.css` file. Responsive rules belong there as well.
- Compose layout, typography, colors, and states with `@apply` and semantic tokens. Raw custom-property declarations belong in token definitions; ordinary CSS is permitted for properties or runtime numeric values that Tailwind cannot express cleanly.
- Do not concatenate utility classes in React. Do not introduce `clsx`, `classnames`, or variant-class builders for component styling. Repeated utility strings in JSX are also replaced by the component's data selectors.
- Data attributes are styling hooks, not replacements for semantic HTML, native `disabled`, labels, or ARIA behavior.

The [Toolbox CSS example](examples.md#toolbox-css) demonstrates these selectors in `datatoolbox.tw.css`, imported through the shared entry.

The editor uses the vertical variant on the left. A horizontal variant illustrates prop styling and does not reintroduce a top toolbox requirement.

## 6. React and TypeScript rules

These are required coding conventions:

- One component per file, with one named component export from that file.
- Every component is a named arrow function assigned to a descriptive constant.
- Use strongly typed props, event contracts, refs, and return values under TypeScript strict mode. Use explicit unions for finite variants; avoid `any` and untyped component interfaces.
- Do not define components inline inside other components, inside render expressions, or as short anonymous component functions. Extract each reusable/rendered component into its own file.
- Ordinary typed event handlers and iteration callbacks are not additional component definitions; keep them readable and extract complex logic.
- Keep React plain: compose named components, use explicit props, and separate model/geometry logic from UI rendering.
- Avoid excessive context providers. Prefer local state, explicit props, and narrowly scoped stores/hooks; introduce a provider only for a real shared dependency.

The [Toolbox component example](examples.md#toolbox-component) demonstrates named typed props and conditional attribute presence.

### File layout: imports, props, component

Every component file (`.tsx`) has exactly three sections, always in this order (owner requirement):

1. **Imports:** every import, at the top of the file. Type-only imports use `import type`.
2. **Props definition:** one `<ComponentName>Props` type describing the component's inputs.
3. **Component definition and export:** one `export const <ComponentName> = (...): ReactElement => ...` arrow function, typed with its props.

```tsx
// 1. Imports
import type { ReactElement } from "react";
import { Button } from "../Button/Button";

// 2. Props definition
type ConfirmBarProps = Readonly<{
  label: string;
  onConfirm: () => void;
}>;

// 3. Component definition and export
export const ConfirmBar = ({ label, onConfirm }: ConfirmBarProps): ReactElement => (
  <div data-confirm-bar="">
    <Button variant="primary" onClick={onConfirm}>
      {label}
    </Button>
  </div>
);
```

Nothing else sits at file level in a component file: no second component, no helper component, no module-level mutable state, no code after the export, and no default export. The numbered comments above are only for illustration; real files don't need them.

- **One component per file.** A piece of JSX that deserves a name becomes its own file with the same three sections. A sub-part is never a second component in the same file.
- **No inline components:** never define a component inside another component, inside JSX, inside a `map`, or as an anonymous function passed as a prop or child.
- **Logic stays out of the component file.** Pure helpers, formatting, geometry, and constants that are not props go into a typed module (`.ts`) in their owning layer ([frontend architecture](../architecture/frontend-architecture.md#utilities-business-logic-and-repositories)) and are imported. Event handlers and small derived values inside the component body are fine.
- **Clean code, no shortcuts:** no `any`, no `as` casts to silence the compiler, no `@ts-ignore` or `@ts-expect-error`, no `eslint-disable`, and no non-null `!` to skip a real check. No `className` string building and no inline `style` for styling ([§5](#5-component-selectors-and-prop-driven-styling)). No workaround that hides a problem: if a type, rule, or library doesn't fit, fix the type or design, or raise it in the spec.
- **Readable formatting:** Prettier formats the code and ESLint enforces these rules ([D13](../decisions.md#d13-application-stack)). Names are full words; props are destructured in the parameter list with their defaults.

A component with no inputs, such as a route page, omits section 2 and takes no parameters (implementation convention). The props type stays in the component's own file, directly above the component. Domain types that several files share (for example `ImageEntry`) live in their domain module and are imported. Exporting the props type is allowed when another file needs it; the component remains the file's only runtime export.

Non-component modules (`.ts`: services, stores, schemas, geometry) follow the same spirit: imports first, then types, then the exported functions or constants, with one clear responsibility per file.

### Button variant pattern

Use one reusable `<Button />` component with a typed variant prop. Each variant maps to an explicit data attribute; the component does not construct Tailwind class strings. The proposed initial variants are `primary`, `secondary`, and `danger`, with `primary` as the default.

See the illustrative [Button component](examples.md#button-component) and corresponding [Button CSS](examples.md#button-css), imported into the shared Tailwind entry.

Consumer markup remains descriptive, for example `<Button variant="danger">Delete house</Button>`. Adding or adjusting a variant changes its typed contract and CSS selectors, rather than scattering conditional class lists across feature screens. The example illustrates presentation; destructive-action behavior follows its own feature specification.

Reuse this pattern for sizes, panel variants, selected tool state, and other component props. Mutually exclusive variants are represented by a typed union, so contradictory attributes are not independently toggled by callers. All referenced semantic color utilities must be mapped in the complete theme token file, including `danger-hover` and `on-danger`.

## 7. Initial component responsibilities

These are the shared components in `src/design-system/` (components, forms, property editors), each in its own folder with its `.tw.css` file. Each has a `/ds` page ([workbench](workbench.md)).

| Component family | Responsibility |
| --- | --- |
| `SwatchPicker` | One choice among named finishes as round colour swatches with names (Phase 9.1, template material presets); a React Aria RadioGroup; textured finishes show fine lines, custom choices a colour wheel |
| `FormField` | Label, control association, description, required/validation feedback; `layout` stacked, inline, or section (Phase 19.7: the label is a section title); `labelHidden` keeps the label for screen readers only (Phase 5.8) |
| `Input` | Typed native text/input behavior and standard visual states (filled, focus ring, invalid). A `suffix` (unit) and two decorative adornment slots inside the field (Phase 5.8): `start` (a short label such as "W", an axis letter, an icon) and `end` (a `Keycap`, an icon). Clicking an adornment focuses the input; the accessible name stays the full label |
| `LengthInput` | Shared length parsing, raw edit draft, live unit conversion, and commit behavior from the unit spec, with an optional `start` adornment; used by the length and vector editors |
| `Keycap` | A keyboard key or chord as a hint, e.g. inside a field's end slot (Phase 5.8) |
| `Icon` | One named icon from the shared set (`sm`/`md`/`lg`); decorative unless it has a `label` |
| Property editors | `TextPropEditor`, `NumberPropEditor`, `LengthPropEditor`, `AnglePropEditor`, `SelectPropEditor`, `SegmentedPropEditor`, `MultiSelectPropEditor`, `TogglePropEditor`, `SliderPropEditor`, `ColorPropEditor`, `Vector2LengthPropEditor`, `DateTimePropEditor`, `FilePropEditor`, `ReadOnlyPropEditor`: one file each, registered by editor name in `genericEditors.ts`, all following the [editor contract](../builder/property-system.md#editor-contract) (schema node, value, preview, commit, mixed, error). Domain editors (`material`, `materialChoice`, `image`, `location`, `reference`, `templateVersion`, `lampPower`; the Object Editor's `nodeRef`) live in feature code. `EditorMessage` shows an editor's inline error. `QuickPicks` (Phase 9.1): suggested values as a compact chip row under a length, number, or angle field (a React Aria ToggleButtonGroup); the editors show it when the schema has `x-homeplan.quickPicks`. `SliderPropEditor` (Phase 7.7, owner: "the range slider looks ugly"): a 6 px rounded rail, an accent fill from the start to the value, an 18 px solid white thumb with a soft shadow that grows slightly while hovered or dragged, a focus ring for the keyboard, a muted fill when disabled, and the value as an editable number box on the right |
| `PropertyPanel` / `PropertyGroup` | The live use of `SchemaForm` for the selection: each committed field reports one commit. It has no knowledge of house data ([property system](../builder/property-system.md)). The panel header is the selection's name after a list icon, or "3 items: 2 Carpets, 1 Light" for several. A `PropertyGroup` with a catalog `groupId` remembers its collapsed state for the session across types (Phase 5.7) |
| `SchemaField` / `SchemaFieldList` | `SchemaForm`'s internals: one field with its editor, and a flat list of groups, each bound to one object (declared groups, then one group per nested object, placed after the group it belongs to; a group with one field uses that field's title once). Consecutive inline-labelled fields share one row ("Width × Depth") |
| `Button` / `IconButton` | Native action control (React Aria `Button`, `onPress`), variants `primary` (filled), `secondary` (tonal), `danger`, `ghost` (quiet); sizes `sm`/`md`; disabled and `busy` (spinner) states; accessible icon label |
| `Menu` / `MenuItem` | Anchored actions, keyboard navigation, focus/close behavior; items carry an icon, shortcut, disabled, or `danger`; one component per file |
| `MenuButton` | Dropdown: a button (text or icon, such as the tree's `+`) that opens an anchored `Menu`, with `aria-haspopup`/`aria-expanded`, arrow-key navigation, Escape to close, and focus returned to the button. It receives its items as props, so feature code decides which entries appear (for example the allowed child types of a tree row) |
| `IconSelectMenu` | Several mutually exclusive icon choices grouped into one icon trigger (current choice's icon plus a chevron; optionally tonal when "on"). Its menu lists the choices with a check, then optional commands after a separator. Used for the builder's Sun view and Lights (Phase 13.2); meant for grouping toolbox tools later |
| `Tree` / `TreeItem` | The house tree: expandable pill rows with name selection (single or multiple), double-click/Enter action, disabled rows, and per-row action slots (magnifier, `MenuButton` for Add, trash), keyboard navigation, and visible selection |
| `Panel` | A `surface` card with an optional sentence-case title and `icon`, header actions, scrolling, and padding |
| `Toolbox` / `ToolButton` | Vertical (or horizontal) floating rail with context-aware tools and a tonal active pill. `Toolbox` `footer` pins buttons at the bottom while the tools above scroll (the camera buttons). `ToolButton` shows a shortcut tooltip, a dashed `temporary` ring while a key holds the state, and an optional corner `badge` (Shift cue, Phase 5.3) |
| `Tooltip` | Hover/focus label with an optional shortcut, placed on any side |
| `Banner` | Tinted message surface (`info`, `success`, `warning`, `danger`) with optional actions; no border |
| `Spinner` | Indeterminate progress with an accessible label |
| `EditorLayout` | Canvas with card regions and 8 px gaps: header, toolbox floating over the viewport's left edge, central viewport, upper-right overview, lower-right properties (right column 25 rem), and floating status toasts |
| `ViewGizmo` | Viewport orientation tripod: red X, green Y, blue Z as seen from the camera (the caller projects them), farther axes dimmed, optional north mark; with `onAxis` the tips are buttons with tooltips (Phase 4.6) |
| `Popup` | The one modal container: header (title, close), body, and footer (Cancel/Save or a custom footer); focus trap, Escape, themed portal. See [§8](#8-forms-and-popups) |
| `SchemaForm` | The form builder: renders a JSON Schema with registered property editors, in live or buffered mode. See [§8](#8-forms-and-popups) |
| `FormPopup` | `Popup` + buffered `SchemaForm`: values object in, validated values out. Its body is `FormPopupDialog`; closing a dirty form opens `DiscardChangesPopup`. See [§8](#8-forms-and-popups) |

**Choice controls (owner, Phase 5.9 and follow-up):** a single choice with 2–3 options is a pill-shaped **segmented** control (React Aria `ToggleButtonGroup`, optional icons per option); more options, or a `searchable` choice, use a dropdown; `Choice`'s `editor` option forces either. Every yes/no field (`toggle`) is a compact **Yes / No** segmented control at the field's right edge; Mixed selects neither. The app has no switches or checkboxes (Phase 5 follow-up). The former `ThemeSetting` component is retired.

**Shared property groups (Phase 5.7):** group titles, order, and icons come from one catalog (`shared/domain/schemas/propertyGroups.ts`), so every type's General, Placement, Size, Appearance, and other groups look and collapse the same. Groups have no background or inner margin; fields use the full width. **Sections (Phase 19.7, owner):** inside a group, a composite editor (material, material choice, location) is a section: its title is a 13 px semibold `foreground` heading with 12 px extra space above it (none for the group's first field), so stacked editors (a roof's Top, Underside and Sides materials) read as separate blocks; space separates them, not lines. A composite editor that is its group's only field keeps the group title and shows no section title. The same applies in popups. `/ds` shows it under PropertyPanel, Stacked sections. The [property system](../builder/property-system.md) owns the catalog and multi-selection rules.

The `/ds` feature composes `SourceCodePopup` from `Popup` and code-display primitives (with a custom footer: Copy and Close). Its example registry and source content belong to documentation feature code rather than the generic design-system library. Every implemented component in this table, including constituent controls, needs its own catalog page; proposed names alone do not establish an implemented public API.

`MenuButton` and `Tree` are required by the tree's Add menus ([Floor Builder](../builder/screens/floor-builder.md#adding-children-from-the-tree)). Additional subcomponents follow the same one-file/one-component convention. Not built: a `SearchField` variant (Phase 5.8 proposal, left to the owner's choice). Keep model-specific properties and tool relevance in feature code, not hard-coded into generic controls.

Use keyboard-visible focus, associated labels/error descriptions, meaningful button names, and consistent disabled behavior. Keep menus/popovers in the correct theme scope and make them usable without a mouse. Accessible behavior comes from **React Aria Components** ([D13](../decisions.md#d13-application-stack)): `Popup` wraps its Modal/Dialog, `Menu`/`MenuButton` its Menu and MenuTrigger, `Tree` its Tree, and `SliderPropEditor` its Slider. Each wrapper is our own named component; it is styled through our data selectors and React Aria's `data-*` state attributes, never through its default styles or class strings.

## 8. Forms and popups

The schema-driven form mechanism built for the property panel ([D18](../decisions.md#d18-property-schemas-and-the-property-panel)) is the application's **only** form builder. Every form, including popups such as Upload image, New house, or Save as preset, is a values object plus a configuration object rendered by the same component and editors. No screen hand-codes a form (owner requirement, fourth pass).

### The configuration object is a JSON Schema

A form's configuration is a JSON Schema with `x-homeplan` annotations, exactly like an object type's property schema ([property system](../builder/property-system.md#metadata-standard-keywords-first)): fields, labels, editors, groups, order, limits, defaults, `visibleWhen`, and `required`. Form-level options sit in the root `x-homeplan`:

| Root `x-homeplan` field | Meaning |
| --- | --- |
| `title` | Popup title |
| `submitLabel` / `cancelLabel` | Footer button labels (default Save / Cancel) |
| `description` | Optional text above the fields |
| `size` | `sm`, `md` (default), or `lg` minimum popup width; the popup widens to fit its footer buttons and footer buttons wrap on narrow screens (owner, 2026-11-15: buttons must never be cut off) |

Illustrative Upload image form:

```json
{
  "$id": "urn:homeplan:form:upload-image:1",
  "type": "object",
  "x-homeplan": { "title": "Upload image", "submitLabel": "Upload" },
  "properties": {
    "file": {
      "type": "string", "title": "Image", "contentMediaType": "image/*",
      "x-homeplan": { "editor": "file", "accept": ["image/jpeg", "image/png", "image/webp"], "maxBytes": 26214400 }
    },
    "name": {
      "type": "string", "title": "Name", "minLength": 1, "maxLength": 120,
      "x-homeplan": { "editor": "text", "placeholder": "From the file name" }
    }
  },
  "required": ["file"]
}
```

Schemas for forms live in `shared/domain/schemas/forms/`, next to the object type schemas. A form may also reuse an object type's schema directly, or a subset of it.

### `SchemaForm`: one form builder, two modes

`SchemaForm` walks the schema, picks each field's editor from the registry, and lays out groups. It receives `schema`, `value`, `registry`, `projectUnit`, and `errors`.

| Mode | Used by | Behavior |
| --- | --- | --- |
| `live` | `PropertyPanel` | Each committed field calls `onCommit(path, value)`, which becomes one undoable command. No Save/Cancel ([property system](../builder/property-system.md#editing-live-with-undo)) |
| `buffered` | `FormPopup` | Field commits update a local draft copy of the values. Nothing leaves the form until Save calls `onSubmit(values)`. Cancel discards the draft |

Both modes use the same editors, the same editor contract, and the same Ajv validation.

### `Popup`

The design system's single modal container. Every modal in the application, form or not, is a `Popup`.

| Prop | Type | Behavior |
| --- | --- | --- |
| `open` | `boolean` | Controlled by the caller |
| `title` | `string` | Shown in the header, also the accessible name |
| `onClose` | `() => void` (optional) | Header close button, Escape, and Cancel all call it. Omitted, the popup is non-dismissable: no close button or default Cancel, Escape does nothing, and the custom `footer` must offer the way out (for example the save-conflict choice) |
| `children` | `ReactNode` | Body; scrolls when taller than the viewport |
| `onSave` | `() => void` (optional) | Shows the default footer's Save button |
| `saveLabel`, `cancelLabel` | `string` | Default Save / Cancel |
| `saveDisabled`, `busy` | `boolean` | Disables Save; `busy` shows progress and blocks closing |
| `footer` | `ReactNode` (optional) | Replaces the default footer with custom components, such as Copy + Close or a Danger button |
| `size` | `'sm' \| 'md' \| 'lg'` | Minimum width; grows to fit the footer |

- **Header:** title on the left, an `IconButton` close on the right.
- **Footer:** by default Cancel (secondary) and Save (primary), right-aligned. Without `onSave` and without `footer`, only Cancel/Close is shown.
- **Behavior:** focus moves into the popup and is trapped, and focus returns to the opener on close. Escape closes it unless `busy` or there is no `onClose`. Rendered in a portal under the themed UI root. Clicking the backdrop does not close it, so typed input is never lost.

### `FormPopup`

`FormPopup` composes `Popup` and a buffered `SchemaForm`. It is the component every popup form uses.

| Prop | Type | Behavior |
| --- | --- | --- |
| `open` | `boolean` | Controlled by the caller |
| `schema` | `JSONSchema` | The configuration object |
| `values` | `T` | Initial values; schema `default`s fill missing fields |
| `onSubmit` | `(values: T) => Promise<void>` | Called on Save after the whole form validates. While pending, the popup is `busy`. A rejected promise keeps it open and shows the error |
| `onCancel` | `() => void` | Called on Cancel, close, and Escape |
| `registry` | editor registry (optional) | Defaults to the application registry, so domain editors such as `image` work in popups too |
| `footer` | `ReactNode` (optional) | Custom footer, passed through to `Popup` |

- **Save** validates the whole draft with Ajv. Errors appear on their fields, and Save does nothing else.
- **Server errors:** a `400 validation` response ([API](../architecture/api.md#conventions)) carries JSON Pointers, and `FormPopup` maps them back onto the matching fields. Any other error shows in a `danger` banner above the footer.
- **Unsaved changes:** closing a dirty form asks "Discard changes?" first.
- **Typing:** `T` is the TypeScript type generated from the same schema, so `values` and `onSubmit` are typed.

### Feature form components

Each concrete form is one small named component in its feature folder that **owns everything specific to that form**: it imports its schema, builds the initial values, calls its service in `onSubmit`, and renders `FormPopup`. The caller only controls `open`.

```tsx
// src/features/floor-builder/components/UploadImagePopup.tsx
import type { ReactElement } from "react";
import { FormPopup } from "../../../design-system/components/FormPopup/FormPopup";
import type { ImageEntry } from "../../../../shared/domain/images/imageEntry";
import { uploadImageSchema } from "../../../../shared/domain/schemas/forms/uploadImage";
import type { UploadImageForm } from "../../../../shared/domain/schemas/forms/uploadImage";
import { useImageService } from "../hooks/useImageService";

type UploadImagePopupProps = Readonly<{
  open: boolean;
  houseId: string;
  onClose: () => void;
  onUploaded: (image: ImageEntry) => void;
}>;

export const UploadImagePopup = ({ open, houseId, onClose, onUploaded }: UploadImagePopupProps): ReactElement => {
  const images = useImageService();

  const submit = async (values: UploadImageForm): Promise<void> => {
    const image = await images.upload(houseId, values.file, values.name);
    onUploaded(image);
    onClose();
  };

  return (
    <FormPopup open={open} schema={uploadImageSchema} values={{}} onSubmit={submit} onCancel={onClose} />
  );
};
```

This keeps one rule: the design system knows schemas and editors, the feature component knows the service, and the screen only decides when the popup is open. There is no global popup manager or provider. A screen holds `open` in local state, or in its editor-session UI store when a toolbar and a tree row can both open the same popup.

### MVP forms

| Form | Schema source | Submit |
| --- | --- | --- |
| New house | form schema: `name` | `POST /api/houses` |
| Rename house (Houses screen) | House schema subset: `name` | `PATCH /api/houses/:id` |
| Upload image | form schema: `file`, `name` | `POST …/images` |
| Rename image | form schema: `name` | `PATCH …/images/:id` |
| Save as preset | form schema: `name` | model command adding to `materialPresets` |
| Save with note | form schema: `message` (optional) | `POST …/revisions` |
| Settings | the preferences schema (`homeAssistant` hidden), live | preferences service (`PATCH /api/preferences`) |
| Export PNG | form schema: size preset (1×/2×/4×), transparent background, save to project | browser export, then optional `POST …/exports` |
| Import model (Phase 2) | form schema: `file`, and for STL `unit` or one known dimension, `upAxis`, `frontAxis` (`visibleWhen` STL) | `POST …/templates` |

Confirmations without fields, such as Delete house or Restore revision, are a plain `Popup` with a custom footer (Cancel + a `danger` Button).

**Settings apply instantly** (owner, Phase 5.9): the Settings popup is a plain `Popup` with `SchemaForm` in **live** mode and one **Done** button; each change goes to the preferences service at once (applied locally, synced in the background). Preference forms are live; forms that create, rename, or destroy something stay buffered `FormPopup`s. Theme is a segmented Light / Dark / Auto control with icons; the colour scheme a segmented Blue / Graphite / Green / Custom (Custom shows the five base colours, seeded from the scheme in use). The former `ThemeSetting` component is retired: the generic segmented editor replaces it (`/ds/components/theme-setting` redirects to `/ds/property-editors/segmented`).

### `/ds` documentation

`/ds/components/popup`, `/ds/components/schema-form`, and `/ds/components/form-popup` each get a page with live examples, including every MVP form above rendered with fixture values and a fake `onSubmit`, plus the editor for each field type ([workbench](workbench.md)).

## 9. Implementation verification

- Light and dark each define every semantic color role, with no component-local theme literals.
- Auto follows system changes; explicit Light/Dark settings override them and survive reload.
- Theme changes leave house geometry, materials, and physical/render lighting unchanged.
- Attribute presence correctly follows typed props; an inactive boolean modifier is absent from the DOM.
- Production CSS contains all imported attribute-selector rules and resolves `@apply` against the shared semantic theme.
- React components use no class-string concatenation, inline component definitions, or multiple component exports per file.
- Every component file has exactly three sections in order: imports, the props type, and the one exported component.
- Shared controls and editor layout remain readable and keyboard usable in both themes.
- Every form in the application renders through `SchemaForm`; every modal is a `Popup`.
- A `FormPopup` with invalid values never calls `onSubmit`; a rejected `onSubmit` keeps the popup open with its draft; server field errors land on their fields.
- Cancel, close, and Escape leave the caller's values untouched.

This document specifies conventions and records the implemented components; the source in `src/design-system/` is authoritative for exact props.
