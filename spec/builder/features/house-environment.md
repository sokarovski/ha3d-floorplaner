# House environment: location, north, and sunlight

Updated: 2026-11-18.

Status: MVP Phase 1. Central house location and orientation, current or chosen render time, calculated sunlight, and the London date/time fallback are owner requirements. Defaults below are resolved; library choices are implementation conventions.

## Purpose and scope

Configure the house's geographic context once, then use its location, north orientation, date, and time to position the sun and inform daylight rendering throughout the house.

This is a house-level environment shared by all floors and areas. It is separate from the area-owned lamps and invisible artificial sources described in [materials and objects](materials-and-objects.md).

## House inputs

| Input | Purpose | Default when not supplied |
| --- | --- | --- |
| Approximate location | Latitude/longitude for solar calculations | London, United Kingdom |
| House timezone | Interpret the chosen local date/time, including daylight saving | `Europe/London` for the default London location |
| North orientation | Direction of geographic north relative to the drawn plan | `0°`, north toward the top of the plan |
| Time mode | Follow the current instant or use a fixed render datetime | Fixed, so the requested fallback is used |
| Fixed local date | Season/day of year for the render | `2020-06-01` |
| Fixed local time | Local civil clock time for the render | `12:00:00` |

Use the requested default setup when the house has no environment settings. Fill missing values without overwriting explicitly supplied values. For a custom location, resolve/confirm its timezone rather than silently keeping London's timezone. Changing location must make any retained date/time and timezone changes visible.

### Approximate location selection

The `location` property editor edits latitude, longitude, and the IANA time zone (the browser's list, searchable). New houses start in London (51.5074°, −0.1278°, `Europe/London`); anyone elsewhere looks up their coordinates on a map and pastes them (owner, 2026-11-17: the bundled GeoNames country → city picker from Phase 1 was removed). Houses saved before keep their old `countryCode` and `city` labels until the location is next edited; they are optional, never written, and not shown.

London's coordinates are latitude `51.5074`, longitude `-0.1278` in decimal degrees. Positive values are north/east, negative south/west. Approximate city coordinates are sufficient; no street address is needed.

### North orientation

Controls: the numeric **North** angle (0–360°) in the house properties. The plan shows a north compass beside the active floor's bounds, and the [view gizmo](../screens/floor-builder.md#camera-controls-and-view-choices) carries an N tick at the same angle. Dragging the compass to set north is not implemented; the angle field is the only control. Store one house-level value; floors and areas inherit the same geographic frame.

Convention: `northRotationDeg` is the clockwise angle of geographic north from the plan's upward direction in a top-down view. `0°` points up and `90°` points right. Normalize angles consistently. The mathematical axis mapping into Three.js remains part of the renderer adapter.

Changing north changes the geographic orientation used for sunlight; it must not rotate the authored room coordinates or move the camera. The compass is an editor helper and should be excluded from final images. This control uses geographic north, not an assumed magnetic-compass reading.

## Time selection and deterministic rendering

- **Current time:** derive solar conditions from the current absolute instant and display that instant in the house timezone. The house timezone can differ from the browser, backend host, or editor user's timezone.
- **Fixed render time:** let the user choose the full local calendar date and time in the house timezone, independent of the current date.
- Switching to current time does not erase the last fixed render datetime.
- Resolve local date/time with IANA timezone rules, including historical daylight-saving offsets. Invalid or ambiguous DST transition times require explicit handling rather than silently using the host timezone.
- Preserve the selected local datetime/timezone and resolve a UTC instant for calculation. Persist local datetime plus timezone as the source, and freeze the resolved UTC instant in each export's metadata.
- At export start, capture one effective instant, location, north orientation, and environment settings. Every image in that export set uses that snapshot even if current-time mode continues updating in the editor.

The requested default is **1 June 2020 at 12:00 London local time**. In `Europe/London`, this is `2020-06-01T12:00:00+01:00`, equivalent to `2020-06-01T11:00:00Z`. Interpret noon as civil clock noon; do not replace it with the calculated instant of solar noon. The historical offset has been checked with the local IANA timezone database.

## Solar calculations

Calculate solar azimuth and elevation from the resolved instant and geographic coordinates, then transform that direction into the house's plan/world frame using north orientation.

Recommended application conventions:

- **Azimuth:** degrees clockwise from geographic north (`0°` north, `90°` east, `180°` south, `270°` west).
- **Elevation/altitude:** degrees above the horizon; negative values place the sun below it.
- Keep a single adapter responsible for library angle units, azimuth origin, direction, and any atmospheric-refraction convention. These must not be assumed interchangeable across libraries or versions.

These direction conventions are consistent with NOAA's solar-position definitions. [NOAA definitions](https://gml.noaa.gov/grad/solcalc/azel.html). The application's positive-east longitude convention differs from the obsolete positive-west inputs on that legacy NOAA page; use explicit conversions when comparing against it.

**Library (implementation convention):** SunCalc **2.1.4**, pinned. It returns azimuth in degrees clockwise from north and the apparent (refraction-corrected) altitude in degrees, which is already the application convention; SunCalc 1.x used radians from south, so its examples do not apply. The one adapter is `shared/domain/environment/sun.ts`; it adds the plan-frame direction from `northRotationDeg` and records `suncalc-2.1.4 (apparent altitude)` as the solar calculation version. [SunCalc documentation](https://github.com/mourner/suncalc).

Read-only diagnostics in the house properties: sun azimuth, elevation, and **Day** (elevation above 0°), **Twilight** (down to −6°), or **Night**. Sunrise/sunset readouts are not shown. Local times are resolved with the IANA rules in `shared/domain/environment/timeZones.ts`: a time inside a DST gap is reported as invalid, and an ambiguous fall-back time uses the earlier offset.

## Rendering the sun and sky

Browser preview as built (implementation conventions; `src/renderer/lighting.ts`, `src/features/floor-builder/services/sunLighting.ts`):

- **Sun:** one shadow-casting `DirectionalLight` (2048² PCF shadow map fitted to the active floor's bounds). Full intensity `2.4` at elevation 6° and above, fading linearly to 0 at the horizon, off below it. Without a resolvable environment the default sun comes from the south-east about 50° up.
- **Sky:** a `HemisphereLight` fill, not a sky shader or environment map, so there are no sky reflections. The fill fades from day (`2.1`) to a faint night ambient (`0.12`; `0.3` until Phase 8.9) with daylight, and the day/night exposure policy in [lighting](lighting.md#preview-renderer-conventions) keeps lamps readable at night. AgX tone mapping (ACES until Phase 8.9), shared with the HA viewer and the photoreal render.

Recommended behaviour, which the remaining bullets describe:

- Use a shadow-casting directional light for direct sunlight. Three.js supports directional lights for sunlight; its adapter must set the light/target relationship from the computed direction. [Directional light documentation](https://threejs.org/docs/pages/DirectionalLight.html).
- Use a sky/environment model for diffuse daylight and reflections, synchronized with the same sun direction. A visible sky alone does not guarantee that materials receive matching environment lighting. [Three.js sky/sun example](https://threejs.org/examples/webgl_shaders_sky.html).
- Account for geometry, wall openings, glazing, and shadows when daylight reaches interiors. The chosen renderer's capabilities determine how indirect illumination is approximated or traced.
- Respect the [open-top visualization rule](roof-cutouts.md#rules-that-still-hold): ceilings are never rendered, and a floor's roof is drawn (and casts shadows) only in the whole-house views ([roofs](roofs.md#where-roofs-are-drawn)); in floor views it only trims and raises the walls, never an automatically inserted hidden shadow-caster. Any additional occlusion model needs a separate explicit design.
- Disable direct above-horizon sunlight when the sun is below the horizon. Twilight sky contribution follows the selected environment model rather than an assumption that all light disappears at sunset.
- Keep the environment sun separate from artificial fixture visibility and area-light grouping.
- Use the same effective solar direction and environment snapshot in browser preview and any offline-render adapter.

Position and datetime determine solar geometry; they do not uniquely determine exact brightness, sky color, cloud cover, or atmospheric clarity. Recommended initial environment is a documented clear-sky model with consistent exposure. Weather lookup, turbidity/cloud controls, and atmospheric tuning are post-MVP; there is no weather API.

Do not promise measured real-world illumination from a correct sun direction alone. The aim is plausible, geographically and seasonally consistent daylight with the selected rendering model.

## Storage and editor integration

Storage is an `environment` object in `house.json`, inherited by floor/area renderers. Property names below match `HouseEnvironment` in `shared/domain/schemas/house.ts` (`timeMode` is `fixed` or `current`; seconds are optional in `fixedLocalDateTime`); do not duplicate house location/north/time settings on every floor.

```json
{
  "environment": {
    "location": {
      "latitudeDeg": 51.5074,
      "longitudeDeg": -0.1278,
      "timeZone": "Europe/London"
    },
    "northRotationDeg": 0,
    "sun": {
      "timeMode": "fixed",
      "fixedLocalDateTime": "2020-06-01T12:00:00"
    }
  }
}
```

The controls are in the house properties (select the House row in the tree), generated from the House schema ([object models](../object-models.md#house-housejson)). The location fields and compass need visual design but no new builder screen.

Export metadata records the effective location (with timezone), north angle, time mode and fixed local time, the resolved simulation instant (UTC, frozen once per export), sun azimuth/elevation, the solar calculation version, and the sky model (`src/features/floor-builder/services/exportMetadata.ts`). A wall-clock render timestamp and the depicted simulation time are distinct metadata values.

## Verification scenarios

- An unconfigured house uses London and fixed `2020-06-01 12:00` in `Europe/London`, resolving to `11:00Z` for the requested default date.
- Opening the same fixed scene on hosts in different timezones produces the same sun direction.
- Changing the date or location updates sun elevation/azimuth; changing north rotates the sun relative to the house without moving room geometry.
- Changing north by `90°` rotates the geographic frame by the documented amount with consistent shadow direction.
- Changing floors preserves the house's location, north, and effective render time.
- Current-time mode follows the current instant; an export freezes one simulation instant for all of its images.
- Night disables direct solar light, while twilight and sky illumination follow the environment policy independently of artificial sources.
- Compare selected dates/locations against an independent reference with explicit agreement on angle units, timezone, and refraction conventions.
