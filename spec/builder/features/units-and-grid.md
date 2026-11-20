# Editor settings: appearance, ground grid, and measurement units

Updated: 2026-11-19.

Status: MVP Phase 1. The following are owner requirements: Light/Dark/Auto appearance, a ground-plane grid, a saved project length unit (default mm), mixed-unit input with realtime conversion, and **1 internal unit = 1 mm** with fractions. Display formatting follows [D16](../../decisions.md#d16-interaction-defaults-and-support-limits).

House-wide geographic location, north orientation, and current/fixed sunlight time are specified separately in [house environment](house-environment.md). They describe the house and its rendered conditions rather than only its editing display.

## Appearance

Provide Light, Dark, and Auto in settings. Auto follows the system appearance and is the default. Since Phase 5.9 the choice is a three-state segmented control with sun, moon, and monitor icons, and every setting applies immediately (no Save button). Phase 5.5 added a **Colours** choice next to it: the Blue (default), Graphite, and Green presets, or Custom with five base colours (neutral, accent, danger, warning, success) from which the role tokens are derived ([design system](../../design-system/README.md), owner decision in Phase 5). The settings form also has the **Navigation** choice (Trackpad, default, or Mouse) for the gesture map ([D16](../../decisions.md#d16-interaction-defaults-and-support-limits)). Persist the chosen application preference, including the distinction between Auto and its resolved theme. Use the [design-system tokens and theme rules](../../design-system/README.md) consistently for panels, controls, menus, and editor helpers.

This is an interface preference, separate from the house's saved dimensional unit and render environment. Changing it must not change materials, light states, sun position, or final house-render colors. Use the [global application preferences JSON](../../architecture/application-preferences.md) and browser cache, with immediate local updates and selective synchronization.

## Ground-plane perspective guide

Provide an editor setting to enable subtle wireframe-like grid lines on the bottom/ground reference plane so users can understand the perspective, orientation, and scale of the editing field.

- The requested scope is the bottom plane, without additional vertical or enclosing reference planes.
- Keep the guide visually subtle so it does not obscure flooring, materials, selection, or objects.
- Treat the grid as an editor helper, independent of model materials and wall geometry.
- Show/hide must not change model geometry or the camera.
- Exclude the grid from final PNGs, photorealistic renders, and geometry exports.
- The grid follows the active floor's own local editing plane. The MVP always displays one building floor, so no whole-house stacked-view elevation is needed.

This is a reference-plane grid, not a requirement to turn every object into a wireframe. Grid visibility is independent of the Magnetic checkbox. Grid snapping is not an MVP feature.

The grid is on by default (`editor.showGroundGrid`, [object models](../object-models.md#application-preferences-settings-form)). Its color is the `grid` design token. Spacing, major/minor lines, and zoom-adaptive density are implementation conventions; if spacing adapts with zoom, it must still represent consistent physical distances. As built (`src/renderer/groundGrid.ts`): 1 m minor and 5 m major lines drawn in a shader on a large plane 4 mm below the floor, anti-aliased and faded with distance from the floor's centre; minor lines fade out when they get denser than a few pixels, so the spacing never changes meaning.

## Project display and input unit

Every house project has a **`units` property**, available as `project.units`, defaulting to **`"mm"`**. All floors and areas inherit it. Expose these required CAD unit choices:

| Display unit | Conversion to internal millimeters |
| --- | --- |
| Millimeter (`mm`) | `1 mm = 1` internal unit |
| Centimeter (`cm`) | `1 cm = 10` internal units |
| Meter (`m`) | `1 m = 1000` internal units |
| Inch (`in`) | `1 in = 25.4` internal units, exactly |
| Foot (`ft`) | `1 ft = 304.8` internal units, exactly |

Apply the chosen unit to dimensional property fields and measurement readouts across area shapes, walls, openings, ornaments, carpets, and light placement. Dimensionless values and other quantities such as Kelvin or lumens retain their own units.

It is the **Units** field in the house properties' General group (next to **Default wall height**, see [object models](../object-models.md#house-housejson)). Persist `units` directly on the house/project metadata object, with values `mm`, `cm`, `m`, `in`, or `ft`, not as an application preference. In `house.json`, the property is:

```json
{
  "units": "mm"
}
```

This is a project metadata fragment, not a complete house document. New projects initialize the property to `"mm"`; older project documents without it resolve to `"mm"`. Changing `project.units` changes display/input behavior, not the physical geometry or canonical dimension values.

## Mixed-unit entry in every length property

- Every length-valued property field accepts a value in any supported length unit, independently of the project's chosen unit. This includes template-defined fields and the [measuring tape](measurement-guides.md), not only a dedicated conversion tool.
- Explicit unit suffixes override the project unit for that input: for example `1.5m`, `150cm`, `2 in`, or `3ft`.
- A number without a suffix uses the project's current unit.
- Convert a complete valid input in realtime and show its equivalent in the project unit. Validate template limits using the canonical physical value.
- On commit, present the dimension in the project unit and store the canonical metric value. The input suffix does not switch the project's default unit.
- Typing behavior: keep the raw draft while the user types and show the live converted result alongside it; normalize the field on commit. Do not rewrite `1.5m` midway through entry or apply an incomplete/invalid expression as geometry.

Examples:

| Project unit | Typed value | Project-unit result | Internal millimeters |
| --- | --- | --- | --- |
| `mm` | `1.5m` | `1500 mm` | `1500` |
| `cm` | `2 in` | `5.08 cm` | `50.8` |
| `m` | `3ft` | `0.9144 m` | `914.4` |
| `in` | `254mm` | `10 in` | `254` |
| `ft` | `304.8mm` | `1 ft` | `304.8` |

Use one shared parser/converter across property panels, template fields, roof profiles, and tape input. Parsing is case-insensitive unit symbols with optional whitespace and familiar full-name aliases, including meter/metre, centimeter/centimetre, millimeter/millimetre, inch/inches, and foot/feet.

Changing the project unit must not rescale the house or save dimensions back from rounded display values. Template limits and snapping distances retain the same physical meaning. Permit fractional millimeters; the millimeter base does not require integer rounding.

Inputs use compatible quantity units: length fields accept these length units, while light output, temperature, angles, and any future area/volume fields use their respective quantity rules. Display uses enough decimals to resolve about 0.1 mm (mm 1, cm 2, m 4, in 3, ft 4) with trailing zeros trimmed and `.` as the decimal separator ([D16](../../decisions.md#d16-interaction-defaults-and-support-limits)). Fractional-inch notation, feet-and-inches compound syntax, arithmetic expressions, and additional units are post-MVP.

## Canonical metric model

Confirmed intent: all model mathematics use one consistent metric coordinate system, even when the user enters inches. Avoid arbitrary units without a defined physical scale.

**Confirmed base: one model unit equals one millimeter.** This matches the illustrative `positionMm`, `widthMm`, and `heightMm` fields. Allow fractional millimeters; a base unit of one millimeter does not require rounding every dimension to an integer. A bare “1 unit” always has this physical meaning, regardless of project display units.

Use this base for model coordinates, lengths, radii, wall heights/thicknesses, offsets, shape combination, cutouts, attachments, and geometric tolerances. Keep area/volume values dimensionally consistent if introduced later. Define geometric tolerances separately from display rounding.

Pixels are screen/image units whose relationship to model distances changes with zoom and projection; they are not the physical model unit. A pica is a typography unit, not another name for a millimeter or pixel. Neither term should be used for the internal base unit.

Renderer/export adapters may convert metric scale at their boundary. For a renderer operating in meters, use `renderMeters = modelMillimeters / 1000`, including attenuation distances and physical material sizing. Convert interactions back before changing the model. An STL export needs a documented scale convention because the format does not declare units; it must not depend silently on the display preference. See the [floor data model](../model.md).

## Verification scenarios

- Toggling the ground grid changes only the guide's visibility, independently of Magnetic.
- Exported final images and geometry exclude the grid.
- New projects default to `mm`; a changed project unit survives reload and is shared by its floors/areas.
- Switching among mm/cm/m/in/ft preserves dimensions and placement, changing only the saved project unit and presentation.
- A `2.5 in` input produces `63.5 mm` internally, and template constraints evaluate the converted physical dimension.
- Each example in the mixed-unit table produces the documented live project-unit result across ordinary and template-defined length properties.
- Unsuffixed input uses the project unit; explicit input units neither change that setting nor corrupt partially typed values.
- Display rounding and repeated unit changes do not accumulate geometric drift.
- Millimeter authoring geometry and meter-based rendering agree on scale and light placement.
