# Design-system documentation application

Updated: 2026-11-19.

Status: the unlisted `/ds` route, design-system home, color/theme documentation, individual component pages, live examples, props, and View source popups are owner requirements. Route names below the root and the catalog organization are implementation conventions; the pages below are built (`src/features/design-system-docs/`, routes in `src/app/routes/designSystemRoutes.ts`).

## Access and layout

Provide `/ds` inside the same SPA as the builder. Omit it from normal house/editor navigation; a developer can open its URL directly. Once there, show a documentation sidebar with overview, colors, themes, conventions, and components. Direct links, refresh, back/forward navigation, and unknown-page handling must work.

“Unlisted” describes discoverability, not an access-control mechanism. The route follows the application's normal access policy. It is available in the regular application build; a development-only build restriction is not implied by hiding its navigation entry.

Use the actual shared design-system controls and layout primitives. Lazy-load documentation pages and source-example payloads so opening the builder does not require loading the component catalog. The router and asset resolver must honor the configured base path: logical `/ds` becomes `<app-base>/ds` (this matters for future add-on ingress).

## Page map

| Logical route | Content |
| --- | --- |
| `/ds` | Purpose, visual principles, getting started, documentation links, component catalog |
| `/ds/colors` | Semantic color roles, current token values, light/dark swatches, and intended foreground/background pairings |
| `/ds/themes` | How to define a complete theme, required token inventory, variable/utility mapping, Light/Dark/Auto behavior, and a preview |
| `/ds/conventions` | Typed components, data selectors, `.tw.css`, composition, accessibility, and links to architecture conventions |
| `/ds/components` | Browse every implemented shared component by name and purpose |
| `/ds/components/:componentSlug` | One component's contract, props, states, examples, source dialogs, and accessibility guidance |
| `/ds/property-editors` | The [property editor contract](../builder/property-system.md#editor-contract), the editor registry, the `x-homeplan` annotations, and which editor each schema type gets by default |
| `/ds/property-editors/:editorSlug` | One editor: live states (empty, valid, invalid, mixed, disabled, read-only), the schema snippet that selects it, commit/Escape behavior, and View source. Domain editors (`material`, `image`, `templateVersion`, `reference`, `location`, `nodeRef`, `lampPower`) use fixture data |
| `/ds/forms` | `SchemaForm` in live and buffered modes, `Popup` anatomy (header, body, default and custom footers), `FormPopup`, and every MVP form rendered with fixture values and a fake submit ([forms and popups](README.md#8-forms-and-popups)) |
| `/ds/property-panel` | A playground that renders fixture schemas (Wall, Light, a window template) as a live panel next to their JSON value and the commands each edit produces |
| `/ds/viewport` | The renderer playground: a fixture house in the real Three.js runtime (Top/3D, picking, helpers, sun) and the Object Editor's template preview. It lives in `src/features/viewport/` and is not in the sidebar |
| `/ds/components/theme-setting` | Redirects to `/ds/property-editors/segmented` (ThemeSetting was retired in Phase 5.9) |
| `/ds/*` (other) | A documentation not-found page |

The catalog lists implemented components. Planned components may appear in a clearly marked planned section, without an invented props API or a simulated implementation presented as real.

Built pages (2026-11-16): components `banner`, `button`, `discard-changes-popup`, `editor-layout`, `editor-message`, `form-field`, `form-popup`, `icon`, `icon-button`, `input`, `keycap`, `length-input`, `menu`, `menu-button`, `menu-item`, `panel`, `popup`, `property-group`, `property-panel`, `schema-form`, `spinner`, `tool-button`, `toolbox`, `tooltip`, `tree`, `tree-item`, `view-gizmo`; generic editors `text`, `number`, `length`, `angle`, `segmented`, `select`, `multiSelect`, `toggle`, `slider`, `color`, `vector2Length`, `dateTime`, `file`, `readOnly`; domain editors (fixture data) `material`, `image`, `location`, `reference`, `reference-multiple`, `templateVersion`, `fixture` (a light's fixture, the `templateVersion` editor), and `lampPower` (Phase 8.9; owner lamp type as fixture). Without their own page: `SchemaField`, `SchemaFieldList`, and `FormPopupDialog` (shown through `SchemaForm` and `FormPopup`), and the Object Editor's `nodeRef` editor. `/ds/property-panel` has no mixed-selection example yet (asked for by Phase 5.7).

## Colors and theme authoring

The [semantic color table](README.md#3-semantic-color-tokens) owns the required initial inventory. The running documentation should read the same token definitions/metadata used by the implementation, rather than maintaining an unrelated palette in page code.

The Themes page is also the colour-scheme playground (Phase 5.5): the Blue, Graphite, and Green presets, five base colours edited through `SchemaForm`, the derived 12-step ramps, every role in light and dark, and the WCAG contrast report. It reads the same derivation as the app (`src/design-system/tokens/colorScheme.ts`) and never writes preferences.

The theme page must explain:

1. Define every required `--ui-color-<role>` in light and dark variants, including foreground/on-color pairs, state surfaces, borders, focus, overlay, grid, and guides.
2. Map roles through `--color-<role>` theme aliases for semantic CSS utilities. Components consume roles, rather than embedding new hex colors or palette utilities.
3. Define the non-color tokens used by shared components: typography, spacing, radii, control sizes, shadows, and layer order.
4. Resolve Light/Dark/Auto at the application UI root and keep menus/dialogs in the same theme scope. Persist the choice independently from the resolved effective theme.
5. Check readable contrast, keyboard focus, disabled/selected/error states, and missing tokens. Adding a role requires all supported theme variants and documentation metadata.

Display each token's role, CSS name, light/dark value, swatch, and typical use. Show selected control previews in both themes. A local preview theme is sandboxed to the example, including its popup portal; it does not save an application preference or alter house materials and lighting. An explicit application theme control still follows the normal preference service.

Missing required values should produce a clear development/validation failure. Do not silently hide incomplete themes through an undocumented fallback. Theme examples should use the actual token machinery; changing a value should demonstrate the affected control appearances.

## Individual component page contract

Every shared component added to the system gets a separate page before being presented as ready for reuse. This includes constituent components such as `MenuItem` and `ToolButton`, not only their parent controls. Each page contains:

- Name, purpose, import path, and when to use it; note relevant composition constraints.
- A default live example, followed by supported variants and meaningful combinations.
- A props table with name, TypeScript type/union, required status, default, and behavior. Document children/slots, callbacks and their payloads, controlled/uncontrolled behavior, forwarded native props, refs, and deliberately unsupported props where applicable.
- Loading, disabled, validation/error, empty, selection, and focus examples as applicable; do not invent a state the component does not support.
- Keyboard interaction, accessible naming, label/error association, and theme behavior.
- View source for each example, plus related components and relevant usage caveats.

Keep the props reference aligned with exported TypeScript types. Generate straightforward metadata when useful and review manually described behavior with the same change. Do not duplicate the component itself for the documentation preview.

## Live examples and View source

Examples import and render the production component. Put each example component in its own named `.tsx` file, following the one-component-per-file convention. Keep documentation metadata in ordinary typed modules, not anonymous component definitions inside a registry.

Each example has a View source button opening an accessible dialog. The dialog shows the example's import and usage source, relevant stylesheet when needed, a short explanation of the selected props, and a copy action. Implementation source may be a separate tab; usage code is the default because it explains how to consume the component.

Load source text from explicitly registered example files at build time, for example through a raw-source import supported by the selected bundler. Render code as text; never evaluate edited strings or fetch arbitrary filesystem paths. The source displayed must correspond to the example being rendered. Include all companion files needed to understand a composed example and label excerpts or external dependencies.

The dialog has a meaningful title, keyboard close behavior, focus containment and restoration, readable scrolling, and copy feedback. It follows the active preview's theme context when launched inside a theme sandbox. Source display is a shared documentation component; do not implement a different popup in every component page.

## Catalog ownership and change workflow

Keep a typed registry of explicit component slugs, imported example references, source references, and documentation metadata. An unknown slug shows a useful not-found page; it must not be turned into a dynamic import or filesystem path.

When a component or prop changes, update its page/examples in the same change. Prefer metadata derived from the implementation; manually authored API explanations must be checked against its public types. A component implementation and its docs remain in their respective folders as defined in the [frontend architecture](../architecture/frontend-architecture.md).

Do not require Storybook or another standalone application for this feature. A separate tool can be evaluated later if the integrated catalog develops requirements it cannot reasonably satisfy.

## Acceptance scenarios

- `/ds` opens directly under the configured app base, including after refresh; normal house/editor menus omit the link.
- Colors and themes show the complete implemented token inventory with both theme variants.
- Each implemented shared component has a reachable page with accurate props, real examples, and useful source dialogs.
- Changing an example variant shows the same component behavior as in the builder; theme previews do not persist preference changes.
- View source displays the matching usage file, supports copying, closes with the keyboard, and restores focus.
- Documentation previews do not mutate real houses or call Home Assistant actions. Resource-dependent examples use explicitly labeled fixtures/test adapters.
- Broken component slugs, missing token values, and missing example/source registrations are visible during validation.
