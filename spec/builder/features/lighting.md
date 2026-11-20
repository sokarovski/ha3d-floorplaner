# Lighting: fixtures, linear sources, color modes, and groups

Updated: 2026-11-19. Earlier: 2026-11-18 (Phase 17.3 wall-mounted lights, outside wall lights; Phase 15.5 sky light through windows and the indoor sky fill; Phase 15.4 strip gloss).

Status: MVP Phase 1; lamp types, natural strips, fixture emitters, and the calibration below are Phase 8.9. The following are owner requirements: area-owned visible and invisible sources, fixture attachments, adjustable output and color, light groups, linear lighting, and RGB. Units, emitters, shadows, and group behavior are resolved in [D08](../../decisions.md#d08-lighting-and-groups). Pins, handles, and the light controls were added in Phase 5 (5.11, 5.12 and a follow-up). Field names match `shared/domain/schemas/light.ts`.

Home Assistant entity state, card precedence, and image-mode lighting are post-MVP and live in [light state in Home Assistant](../../home-assistant/light-state.md).

**Boundary (owner decision Q1, 2026-11-16):** this specification owns **what the lamp is**: fixture, type, full-output lumens, beam, colour capability, and default colour temperature. A Home Assistant binding owns only **what it is doing now** (which entity, on/off, brightness, colour or temperature within the lamp's capability, actions); it never sets lumens or type. Bindings live in the viewer's preferences, never in `house.json` ([bindings](../../home-assistant/bindings.md), [D25](../../decisions.md#d25-home-assistant-bindings)).

## Ownership, fixtures, and emitters

Every artificial fixture or invisible local light source belongs to an area. The geographic sun/sky is a separate house-level [environment](house-environment.md).

- **Visible fixture:** choose from a predefined bank, for example Pendant Light 1/2 or Floor Lamp 1/2. Render its fixture model together with its light source.
- Each fixture template declares its default attachment, such as a virtual overhead/ceiling mounting reference for a pendant or flooring for a floor lamp. This never generates a visible ceiling. The overhead reference is a height above the floor (default: the area's tallest wall height). It does not follow a roof's slope; a light above the roof's underside is flagged ([roofs: window limit](roofs.md#window-limit), Phase 19.2).
- **Light shapes:** `point` shines in all directions, `spot` is a beam aimed by heading and tilt with a beam angle and soft edge (downlights, track lights, reading lamps), and `linear` is a straight strip. Spot cones follow glTF `KHR_lights_punctual`, so fixture templates can carry them ([object models](../object-models.md#light)).
- **Invisible source:** place a light freely in 3D within the area's coordinate context, without a visible fixture model, and adjust its output and supported temperature/RGB properties.
- Both kinds remain selectable and editable. Editor markers for invisible sources must not appear in final images.

`fixtureVisible` controls whether the fixture mesh exists in the rendered scene; it is separate from whether the light is enabled. An invisible source can still illuminate the scene. Hiding fixture geometry must not accidentally disable its emitter. The template may define one or more emitters and their positions relative to the fixture.

## Wall-mounted lights (Phase 17.3)

Owner request (2026-11-18, Phase 17.3): lights on outside walls. Before 17.3 a light had no wall attachment at all: it was a free point (position, elevation, heading) whose fixture was always hung from its top (or laid face down for a strip), so a sconce could only be approximated by dragging the point next to a wall, and nothing kept it on the wall's outer face. Wall-hosted **objects** already chose a face (`attachment.hostSide`), but objects do not emit light.

**Model** (`shared/domain/schemas/light.ts`, optional, no version change): `mount` (`"free"` when absent, or `"wall"`), `wallId` (a wall of the light's own area) and `wallSide` (`"interior"` or `"exterior"`), in the Placement group as **Mount**, **Wall** and **Wall side** (the last two shown for Mount = Wall). The stored `positionMm` stays the truth for the plan point: a wall-mounted light is projected onto the chosen face line (clamped to the wall's span) at its elevation, so it follows its wall when the wall moves or changes thickness (`lightWallMount`, `shared/domain/lighting/wallMount.ts`). If the wall is deleted or orphaned the light is drawn where it is stored, as a free light.

**Editing** (one undo step each):

- **Mount → Wall** mounts the light on the nearest wall of its area, on the side the light is on (outside the wall's middle line = exterior), snaps its position onto that face and turns its heading to the face's outward normal (a linear light's heading runs along the wall). **Mount → Free** drops the wall fields. Changing **Wall** or **Wall side** snaps it onto the new face (property-command rules, `applyLightMountRules`).
- **Choosing a fixture** whose template mounts only on walls (`attachment.hosts: ["wall"]`) also mounts a free light on the nearest wall, on the template's `defaultHostSide` (the outdoor fixtures declare `"exterior"`), else the side it is on (`chooseFixtureCommand`).
- **Move** slides a wall-mounted light along its face (the dragged point is projected onto the face; the heading is kept, so an aimed spot stays aimed); **Raise** sets its height as before. Rotate and Aim still edit the heading, which only aims a spot: the fixture always faces out of the wall.

**Rendering:** a wall-mounted point or spot light stands its fixture on the face like a wall-hosted object (back contact at the projected point and elevation, front = the face normal); its emitter is the template's `KHR_lights_punctual` node (the bulb in front of the wall). Without a fixture emitter (no fixture, a hidden fixture, or a template without a light node) it shines 100 mm in front of the face (`wallMountClearanceMm`), clear of its own wall's shadow. A wall-mounted strip keeps its face-down mounting at the face point.

**Outdoors:** nothing confines an artificial light to its room except the shadow maps ([light confinement](#light-confinement)), so a light on an outside wall's exterior face lights the facade and the ground around it, and its own wall keeps it out of the room (and an interior one stays inside). The Phase 15.5 indoor mask ([sky light](#sky-light-through-windows-phase-155)) only changes the sky fill and the sun on indoor fragments; it never dims or confines artificial lights, so an exterior light is unaffected by it, and its fixture model (outside the room outline) counts as outdoors. The light still belongs to its area (tree, groups, Home Assistant bindings); it uses a shadow slot like any other emitter.

**Built-in outdoor fixtures** (`scripts/templates/outdoor.ts`, category Lighting, `hosts: ["wall"]`, back contact, `defaultHostSide: "exterior"`, finishes black / anthracite / bronze / white): **Wall Lantern** (`wall-lantern`, glazed coach lantern on an arm, 600 lm 2700 K, default elevation 1.8 m), **Up-Down Wall Light** (`wall-up-down`, a cylinder with glowing ends, 700 lm 3000 K; one point emitter, so it lights the wall all round rather than in two beams), **Bulkhead Light** (`bulkhead-light`, oval opal diffuser behind an eyelid grille, 800 lm 4000 K). They also appear in the object picker under Lighting, as every fixture template does (placed as an object they do not emit).

Known limits: the template's light defaults (lumens, Kelvin) and default elevation are not copied onto the light when a fixture is chosen (true of every fixture); a light can only mount on walls of its own area (a lantern for a facade belongs to the room behind it); arc walls use the span's chord; there is no ceiling or eave, so an exterior light under a roof overhang that is not modelled lights the facade above it too.

## Output units

The owner's original “lux” setting expresses adjustable light strength. It is resolved as lamp output in **lumens** ([D08](../../decisions.md#d08-lighting-and-groups)). The quantities differ:

| Quantity | Meaning and use |
| --- | --- |
| Lumens (lm) | Total emitted light; a useful user-facing setting for lamp output |
| Candela (cd) | Directional luminous intensity; used by Three.js point and spot light intensity |
| Lux (lx) | Illuminance reaching a surface; a target lux control needs a specified measurement surface/distance and a conversion policy |
| Kelvin (K) | Color temperature/warmth; lower values are warmer, higher values cooler |

The UX is lamp output in lumens plus Kelvin or RGB color controls according to declared capabilities, converted to renderer settings by the light adapter ([D08](../../decisions.md#d08-lighting-and-groups)). Never store an unlabeled `lux` number as point-light intensity. Three.js point/spot lights also expose luminous power in lumens. [Point light documentation](https://threejs.org/docs/pages/PointLight.html), [spot light documentation](https://threejs.org/docs/pages/SpotLight.html), [Khronos light units](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_lights_punctual/README.md).

Because the model's authoring dimensions are in millimeters, rendering adapters must consistently convert geometry and attenuation distances into their physical rendering units; otherwise lighting values will not behave as intended. Preview and offline adapters need visual/photometric comparison rather than an assumption that identical numeric settings produce identical pixels.

Store temperature values in Kelvin and RGB values with an explicit color-space/channel convention. Use one active color mode at a time. The following sections define structured color state and authored defaults.

## One semantic light model

Keep the object identified as a **light**, independently of fixture shape, emitter geometry, and color capabilities. Point-like bulbs and linear strips can both be lights; either can be fixed white, tunable white, RGB, or support combined capabilities according to its template.

The builder declares what its renderer can display. It does not claim anything about a physical device's capabilities, which is post-MVP card work.

Visual capabilities:

| Capability | Builder and renderer behavior |
| --- | --- |
| On/off | Enable or disable emitted light independently of fixture-mesh visibility |
| Brightness | Scale the configured full-output level |
| Fixed white | Use a configured fixed white appearance; no adjustable color mode is implied |
| Color temperature | Render adjustable warm/cool white from Kelvin values, with template-defined limits |
| RGB | Render an explicit color |
| Combined modes | Allow both temperature and RGB modes on one light, with one active mode at a time |

Mode names are application semantics. Kelvin-to-RGB conversion is an implementation convention of the light adapter.

## Linear lighting

Support linear sources such as LED strips or linear fixtures in addition to bulb-like emitters. Geometry and color are independent: a strip can use tunable white or RGB without becoming a different interaction/control type.

A linear light is a straight segment with editable length, emitting width, placement, orientation, and attachment context, with visible strip geometry or as an invisible source like any other light. Mounting targets are walls, flooring, or virtual overhead references as allowed by the template. Ceilings are never rendered; see [roofs](roofs.md#where-roofs-are-drawn).

**Facing** (Phase 13.3, implementation choice): a strip shines one way, set by `geometry.facingDeg`, the direction turned about the strip's own long axis, whole degrees 0–360. 0° is straight down (absent means 0°, the look before 13.3, so existing houses are unchanged), 90° horizontal to the **left** of the heading (looking along the heading from above; the right-hand rule about the heading), 180° straight up, 270° to the right. Rotate (Q) still turns the line in plan; the facing turns with it. A strip fixture template (back contact, mounted face down) is turned by the facing about its length too. The shared helper is `shared/domain/lighting/linearFacing.ts`.

MVP linear lights are straight. Multi-segment routes, bends, per-pixel/addressable colors, and animated effects are post-MVP. One strip can be represented by several renderer emitters while remaining one logical light.

### Rendering choices

- Browser preview (Phase 12, owner decision 2026-11-18): one **strip term** per strip plus 1–3 shadow-casting **carriers**, paired with emissive strip geometry (the emitting face, length × Width). The strip term is the diffuse light of a one-sided rectangle of the strip's length and Width, evaluated analytically in every PBR material, so a nearby wall or counter shows one continuous band, brightest nearest the strip and fading smoothly, at any distance; it casts no shadow and is confined by a reach and a clip plane. The carriers keep the far field confined by walls and provide occlusion. Details, numbers and limits are under [strip light](#strip-light-phase-154). History: until 7.10 a strip was a `RectAreaLight` ([D08](../../decisions.md#d08-lighting-and-groups)), which lit the rooms behind its walls; 7.10 used carriers alone (a row of blobs, owner K11); 8.9 added a row of unshadowed fill spots ([natural strips](#natural-strips-phase-89)), which still showed separate blobs on a wall a few centimetres away. Carriers, the term and the emissive strip shine along the facing (Phase 13.3, [facing reach](#facing-reach-phase-133)).
- The user sets only what a real strip has: Length, Width (the strip or diffuser width), Facing, Lumens and colour/temperature (owner requirement). Shares, reach, carriers and shader slots are internal renderer conventions with no user-facing setting.
- If a light is ever sampled into several emitters, the samples must share the configured total output rather than multiplying it by the sample count.
- A glowing material alone does not supply the required scene illumination in the baseline raster-rendered preview. Keep visible emission and actual lighting synchronized; path-traced/offline adapters may use emissive geometry differently.
- Output is total lumens for the logical light. A per-meter input is post-MVP, with explicit conversion using the strip length. Emitter type and shadow policy follow [D08](../../decisions.md#d08-lighting-and-groups); falloff and performance limits are implementation conventions.

### Natural strips (Phase 8.9)

Historical: Phase 12 replaced the fill row described here with the [strip term](#strip-light-phase-154); the carriers and the height rule remain.

Owner feedback (K11, 2026-11-16): "the LED strip in the house looks unnatural". Cause: the 7.10 carriers are `round(length / 1.5 m)` points, so a 2.7 m kitchen strip (1120 lm, about 0.6 m above the counter) was two point lights 1.35 m apart. Measured with the preview's own falloff (a script integrating the 150° smoothstep cone, decay 2) against an ideal Lambertian line source of the same flux, as the ratio of brightest to darkest point along the middle 80 % of the strip:

| Strip, surface below | Ideal line | 7.10 carriers | 8.9 carriers + fill |
| --- | --- | --- | --- |
| 2.7 m, 0.3 m below | 1.12 | 72 (two hot spots, dark between) | 2.0 |
| 2.7 m, 0.6 m below (a kitchen counter) | 1.29 | 3.0 | 1.44 |
| 2.7 m, 1.0 m below | 1.38 | 1.37 | 1.33 |
| 2.0 m, 0.6 m below | 1.36 | 10.5 (one carrier) | 2.3 |

Brightness under the middle of that strip went from 0.67 to 1.01 of the ideal line source. Choices considered:

- **`RectAreaLight` for the look, carriers for confinement:** rejected. The area light's share still lights the neighbouring rooms through walls (about 14 % of the under-strip level on a floor 3 m away behind a wall, times its share), and its two LTC lookup textures take two texture units in every lit material, which would cut the shadow budget from 9 to 7 on the reference GPU, where the 9 slots are exactly used (7 point lights and the strip's 2 carriers, measured in the Phase 7.10a light-confinement experiment).
- **More shadow-casting carriers:** rejected for the same budget: every carrier is one texture unit.
- **Chosen: unshadowed fill with a limited reach.** `SpotLight.distance` fades the fill to zero at its reach `R = min(1.4 m, height above the floor − 0.1 m)` (Three.js window `(1 − (d/R)⁴)²`, decay 2), so the fill can never reach a floor, its own or the neighbour's through a wall; it lights only what is near the strip and above the floor (a counter, the wall behind, a shelf). It costs no texture units, only per-fragment light evaluations (the 2.7 m strip becomes 2 carriers + 8 fills).

Conventions: carriers `round(length / 1500 mm)`, 1–3; fill `ceil(length / 350 mm)`, 2–12; every sample a downward 150° cone (half-angle 75°) with penumbra 1 at peak candela `lm / (π · (1 − cos 75°))` of its share. The fill takes 75 % of the output for strips 0.7–1.8 m above the floor, fading linearly to 0 between 0.7 and 0.4 m and between 1.8 and 2.3 m; carriers take the rest (all of it for plinth and ceiling strips, whose surfaces are far enough away for the carriers to look even, or where the fill could not reach anything). Carrier shadows use a PCF radius of 3 texels, softer than a point light's. Known limits: the fill's flux that would have travelled beyond its reach is not added back (a strip 0.7–1.8 m up lights the floor below it with its carriers' 25 % only, usually under a counter anyway), and the fill can still reach an object within 1.4 m on the other side of a thin wall at the strip's height.

### Facing reach (Phase 13.3)

Phase 12 keeps these rules for the [strip term](#strip-light-phase-154): the probe rays and the middle-ray decision below are unchanged, the term's share is its own (85 % rather than the fill's 75 %, all of it within 0.2 m of the wall), and "reaches the wall plus 60 mm" became a clip plane at the wall's face plus 60 mm (the floor rule: a plane 0.1 m above the floor). The text below is the 13.3 fill version.

At 0° the fill rule above is unchanged. For any other facing the renderer measures each fill sample's ray along the facing to the first wall face (the RealAllWalls mesh, up to 2.3 m; furniture is ignored, so a strip in a bed recess sees the wall it faces), and compares it with the distance along the facing to the floor plane (`height / cos` of the angle from straight down; none at or beyond 90°):

- **A wall first:** that sample's fill reaches the wall plus 60 mm (less than any wall's thickness), so it lights the wall's face and not what is behind it; reach at most 1.4 m. The fill share is 75 %, fading to 0 between 1.8 and 2.3 m of the middle sample's wall distance.
- **Otherwise the floor rule:** the floor distance along the facing replaces the height in the share (75 % between 0.7 and 1.8 m, as above), and the reach stops 0.1 m short of the nearest floor point inside the 150° cone (`height / cos(angle from down − 75°) − 0.1 m`). A strip facing sideways or up that meets no wall within 2.3 m has no fill; its carriers take all of the output.

The measured distances (rounded to 10 mm) are part of the light's rebuild key, so moving a wall refreshes a facing strip. Carriers are unchanged (shadow-casting, unlimited range, aimed along the facing). Known limit, as for the 0° fill: a fill facing a wall can still reach a neighbour's floor or object within its reach through a side wall.

**Export:** the render-scene export keeps writing each carrier as a point light of its share (positions do not depend on the facing), so the photoreal render relies on Blender's own shadows for the direction; the emissive strip and any strip fixture are exported with their facing. The HA viewer uses the same renderer, so it matches the builder.

### Strip light (Phase 15.4)

Owner decision (2026-11-18) after strip-light research: one continuous, physically placed strip light. The strip stays at its real position and facing; nothing is moved away from surfaces. Source: rules and a CPU mirror in `src/renderer/linearStrip.ts`, the shader in `src/renderer/stripShading.ts`, the split in `src/renderer/lightsLayer.ts`; checked by `npm run strips:check` (`scripts/check-strip-light.ts`).

**The term.** A strip is a one-sided rectangle of its Length × Width facing along its facing. Its diffuse light is the exact Lambertian form factor of that rectangle, the same maths Three.js r187 uses for a `RectAreaLight`'s diffuse term (`LTC_Evaluate` with an identity matrix: four edge terms with the rational θ/sin θ fit and the horizon-clipped sphere approximation; no LTC textures, so no texture units), times the radiance `L = Φ / (π · A)` of the term's share Φ over the rectangle's area A, times the preview scale. It is added to the material's direct diffuse light, and its glossy highlight to the direct specular light (see **Gloss** below); nothing lights the back of the emitting face, and a receiver facing away (a wall's back face) gets nothing. Narrower than 2 mm, the rectangle is evaluated 2 mm wide with the same flux (an internal numerical floor; float32 error measured below 0.1 % at 1–3 m).

**Shader.** Every `MeshStandardMaterial`/`MeshPhysicalMaterial` in the scene gets one patch, injected after `#include <lights_fragment_begin>` (view-space `geometryPosition`/`geometryNormal`, the `material` struct and `reflectedLight` exist there). Strip data are uniform arrays in world space (centre and reach, half length, half width, radiance, clip plane), moved into view space with the fragment shader's `viewMatrix`, so the builder viewport, the HA viewer, its glass reflection and the PNG export all see the same light. The slot count is fixed per floor: the strip count rounded up to 4, 8 or 16 (`HP_STRIPS`). Dimming, recolouring or switching a strip off only writes uniforms (a dark or unused slot has zero radiance and is skipped), so no program recompiles; adding a strip past a slot step, or another strip structure change, recompiles once. A floor with more than 16 strips gives the 17th and later strips (document order) to their carriers. Material patches compose through `src/renderer/materialPatches.ts` (named patches, joined program cache keys); the HA room cutaway uses the same composer. The hosts call `LightsLayer.beforeRender(scene)` before each render, which patches new materials and writes the uniforms (they follow area previews).

**Gloss** (Phase 15.4, owner 2026-11-18: shiny counters show the strip's reflection). A representative point (Karis 2013): the point of the rectangle closest to the reflected view ray, evaluated with Three.js's own `BRDF_GGX`, times the receiver's irradiance from the whole rectangle (π · L · form factor, with the term's reach, clip plane and weight) and a widening normalization (α/α'_length) · (α/α'_width), α'_k = min(α + min(h_k / (√π · d), 0.45), 1) for the rectangle's half extent h_k at distance d (α = roughness², roughness at least 0.045). The √π makes a small mirror-like surface reflect the rectangle's radiance × Fresnel; the cap 0.45 keeps a long strip's streak near the right energy (without it a 2.7 m strip 0.6 m up kept 44–75 %). No LTC textures, so no texture units. Shader in `src/renderer/rectLightShading.ts` (shared with the [sky portals](#sky-light-through-windows-phase-155)), CPU mirror and brute-force reference in `src/renderer/rectSpecular.ts`. Measured by `npm run strips:check` (Three.js GGX integrated over the rectangle, dielectric F0 0.04, summed over the receivers one camera sees): streak energy 0.94/0.94/0.83/0.75 of the reference at roughness 0.1/0.3/0.5/0.8 for the 2.7 m strip 0.6 m over a counter, 0.89/0.97/0.84 at 0.1/0.3/0.5 for a 2 m strip 0.3 m up, and 1.19/1.15/0.99 at 0.1/0.2/0.4 for a 0.9 × 1.2 m window over a glossy floor; the brightest point is within 0.8–1.4× of the reference.

**Confinement** (the Phase 8.9 and 13.3 rules, measured to the segment rather than to samples):

| Case | Reach (from the segment) | Clip plane | Share of the output |
| --- | --- | --- | --- |
| Facing 0° (down), or the floor rule of 13.3 | `min(1.4 m, height − 0.1 m)` (13.3: `height / cos(angle − 75°) − 0.1 m`) | 0.1 m above the floor: never reaches a floor, its own or a neighbour's through a wall | 85 % for 0.7–1.8 m above the floor (along the facing for a tilted strip), fading to 0 between 0.7 and 0.4 m and between 1.8 and 2.3 m |
| Facing a wall (the middle probe ray meets a wall before the floor plane) | `max(1.4 m, 2 × (wall distance + 60 mm))` | The wall face (its normal from the probe) plus 60 mm: lights the face, never what is behind it | 100 % within 0.2 m of the wall, 85 % from 0.4 m, fading to 0 between 1.8 and 2.3 m |
| Facing sideways or up, meeting neither | — | — | 0: carriers take all of it |

The weight is 1 to half the reach and fades by smoothstep to 0 at it; the clip plane fades over its last 30 mm; a receiver within 5 mm in front of the emitting face is faded in (a strip fixture's own profile stays unlit). The plan (share, rounded reach and plane) is part of the light's rebuild key, so moving a wall refreshes a facing strip.

**Carriers** take the rest of the output (`round(length / 1500 mm)`, 1–3, 150° cones, shadow-casting, unlimited range), for the far field and for occlusion. Their cones make a band uneven, so they keep only what the term cannot reach: on the 2.7 m strip 0.6 m over a counter, the 85 % term share takes the band's ripple against the ideal line from 1.40 (8.9 fill row) to 1.23 at about the same brightness (−4 % under the middle). A strip whose term takes all of the output (within 0.2 m of the wall it faces) draws no carriers and casts no shadows; nothing stands between it and the surface it lights. The total output is always the light's lumens: share + carriers.

**Measured (CPU model of the shader, `npm run strips:check`; Lambertian receivers, no tone mapping).** A 2 m, 12 mm strip facing a wall: the band is as even as the ideal line source along the middle 80 % (term/ideal max/min 1.000 at 30/50/100/200 mm; absolute max/min 1.00/1.00/1.02/1.10, the ideal line's own end falloff), its half-height at half maximum within 6 % of the ideal line (24/39/78/154 mm), brightness at its middle within 2 %, total flux on the wall 98–102 % of the share, and exactly nothing on a 75 or 100 mm wall's back face or in the room behind it. Over a counter (2.7 m strip, 0.3/0.6/1.0 m below; 2.0 m strip, 0.6 m below) the band is more even than the 8.9 fill row in every case (ripple against the ideal line 1.68/1.23/1.07/1.44 versus 2.04/1.40/1.17/1.69).

**Export:** the render-scene export writes each carrier as a point light of `lm / carriers` (the whole output), including the carriers a strip does not draw in the preview; the strip term is preview-only, like the fill was. The emissive strip and any strip fixture are exported with their facing.

**Limits:**

- Gloss is a representative-point approximation: a rough surface under a long strip reflects about 75–85 % of the exact energy, and the highlight has no shadows either; the carriers' own highlights remain.
- The term has no shadows: an object between the strip and the surface it lights does not shade it; the carriers' shadows shade only the carriers' share.
- Facing down, the term can still light an object above the floor plane in the next room within its reach through a side wall (as the fill could); the strip's ends now reach that far, so near a side wall it is brighter than the fill was (CPU probe 0.1 m behind a wall 0.15 m past the strip's end: 111 lx against the fill's 44 lx). Wall faces and floors in that room stay dark.
- One clip plane per strip: a strip facing two walls at different distances (across a corner) is clipped at the middle ray's wall.
- The term's flux beyond its reach is not added back (a strip 1 m above a counter lights it to about 64 % of the ideal line, as before).

## Lamp types

Owner decision Q1 (Phase 8, 2026-11-16): the builder owns what the lamp is, Home Assistant only what it is doing. A light may name its **lamp type** (`lampType`, optional): `tungsten`, `halogen`, `ledWarm`, `ledNeutral`, `ledCool`, `fluorescent`, or `neon` (LED neon flex). Absent means an untyped light, drawn exactly as before 8.9; there is no schema version bump. Both fields are in the light's **Light** property group (D18); the data and rules live in `shared/domain/lighting/lampTypes.ts`.

| Type | White | Colour rendering tint (linear RGB) | Presets (W → lm) |
| --- | --- | --- | --- |
| Tungsten | 2700 K | none | 25 → 220, 40 → 470, 60 → 800, 75 → 1055, 100 → 1521 |
| Halogen | 2900 K | none | 18 → 235, 28 → 370, 42 → 630, 53 → 840, 70 → 1180 |
| LED warm white | 2700 K | none | 2.5 → 250, 4.9 → 470, 8.5 → 806, 11 → 1055, 14 → 1521, 18 → 2000, 24 → 2600 |
| LED neutral white | 4000 K | none | as LED warm white |
| LED cool daylight | 6500 K | none | as LED warm white |
| Fluorescent | 4000 K | 0.96, 1.03, 0.97 (slight green) | 8 → 400, 11 → 600, 15 → 900, 18 → 1350, 36 → 3350, 58 → 5200 |
| Neon (LED flex) | 2200 K, or sRGB (255, 90, 40) when the light can show RGB | none | 5 → 200, 10 → 400, 15 → 600, 20 → 800, 30 → 1200 |

The presets are typical rated values of household lamps (A60 tungsten, eco-halogen, LED replacements and strips, CFL and T8 tubes, LED neon flex at about 40 lm/W); output between presets is interpolated linearly and beyond them extrapolated at the end preset's efficacy.

- **Choosing a type** (one property command, [D18](../../decisions.md#d18-property-schemas-and-the-property-panel)): sets the colour mode to the type's white (`colorTemperature` at its Kelvin when the light has that mode; neon's RGB when it has `rgb`; otherwise `fixedWhite`), and snaps the output to the preset nearest the current output (compared as ratios), so the light keeps about its brightness: 800 lm becomes Tungsten 60 W · 800 lm, LED warm 8.5 W · 806 lm.
- **Lamp power** (`lampWatts`, optional, W): the `lampPower` editor lists the type's presets as "8.5 W · 806 lm" (plus the current value when it is not a preset); choosing one sets the output to its lumens. It is disabled until a type is chosen. Editing **Output** directly keeps the power in step (watts at the type's efficacy, to 0.1 W). Light-group bulk edits do not touch the output, so they do not change the power either.
- **Rendering:** a typed fixed-white light shows its type's white instead of 3000 K; a white of a typed light (fixed white or colour temperature) is multiplied by the type's tint before the luminance normalization, so the tint never changes the output. A typed **spot** light's lumens are the real lamp's, so its beam carries them (see the spot row under [preview renderer conventions](#preview-renderer-conventions)); untyped spots keep the glTF isotropic convention.
- **Boundary:** Home Assistant never sets the type, lumens, or power; it switches the light, dims it, and picks a colour within its capability ([light state](../../home-assistant/light-state.md)).

## Authored defaults and offline previews

The builder must be able to preview/render lights without any Home Assistant connection. Store valid authored values for:

- Enabled state and brightness.
- Full-output light strength, using the [output-unit policy](#output-units).
- Default color mode and its color-temperature or RGB value.
- Template limits and rendering capabilities.

Brightness is a multiplier from `0` to `1`; RGB input uses explicit sRGB channel values from `0` to `255`, converted consistently for rendering. Kelvin and RGB are alternative active color modes, not two tints to multiply together. The stored color keeps the Kelvin and RGB values side by side with one `mode`; only the active mode's value is shown and applied, so switching modes back restores the earlier value.

Schema defaults and limits (implementation conventions): output 800 lm (above 0, at most 200 000), brightness 1, temperature 3000 K (1500–9000 K, step 50), color mode Fixed white, render capabilities at least one mode; a spot's tilt 0–180° (default 0), beam angle 1–160° (default 40°), and soft edge 0–1 (default 0.3); a linear light's length 1000 mm, width 12 mm, and facing 0° (optional, whole degrees 0–360; the angle field shows 0° when absent). A fixture template can supply other values. The example below shows the stored shape.

```json
{
  "id": "l_strip00001",
  "name": "Strip 1",
  "fixture": null,
  "fixtureVisible": true,
  "geometry": { "type": "linear", "lengthMm": 2000, "widthMm": 12, "facingDeg": 90 },
  "positionMm": { "x": 1200, "y": 800 },
  "elevationMm": 2300,
  "rotationDeg": 0,
  "spot": { "tiltDeg": 0, "beamAngleDeg": 40, "softEdge": 0.3 },
  "renderCapabilities": { "colorModes": ["colorTemperature", "rgb"] },
  "defaults": {
    "enabled": true,
    "brightness": 1,
    "outputLumens": 1200,
    "color": { "mode": "colorTemperature", "kelvin": 3000, "rgb": [255, 180, 100] }
  }
}
```

`positionMm` is area-relative, `elevationMm` is the height above the floor, and `rotationDeg` is the heading. Optional `lampType` and `lampWatts` ([lamp types](#lamp-types)) follow the same shape, e.g. `"lampType": "ledWarm", "lampWatts": 14` with `"outputLumens": 1521`. `spot` is stored for every light and used only by spot lights; `lengthMm`/`widthMm` and the optional `facingDeg` only by linear ones (the Facing field shows only for a linear light). The example's strip shines horizontally to the left of its heading. `fixture` is a template reference (`{ "templateId", "templateVersion" }`) or `null` for an invisible source. Fixed white is `{ "mode": "fixedWhite" }`, rendered as 3000 K. Brightness is always available, so it is not a declared capability.

## Planned LED strip performance (Phase 12)

Status: **proposal** (owner request, 2026-11-17), except that the owner's 2026-11-18 decision replaced the fill row with the [strip term](#strip-light-phase-154), which is implemented. Delivery, measurements and acceptance of the rest are open. This section owns the proposed rendering behavior; where it mentions fill samples or sample reduction, read the strip term (one evaluation per strip, no spotlights); global shadow-update conventions elsewhere on this page still describe the current implementation until replaced and verified.

### Preserve the authored light

A strip remains one light with one stable ID, total full-output lumens, brightness and colour. Optimized samples, shader slots, occlusion/depth caches and dirty flags are transient renderer resources, never house data, a new asset format or HA configuration. Sampling changes preserve the total configured flux and existing carrier/fill energy split unless a separately measured calibration change is documented. Lowering output/exposure or removing fixtures/shadows is not proof of an optimization.

The aim is to preserve the even near-surface band, end falloff, fixture glow, RGB/Kelvin behavior, PBR material response and existing wall/doorway confinement. Current short-reach fill can leak onto a nearby object through a thin wall, and over-budget carriers can leak; record these existing limits in comparisons rather than claiming physically exact occlusion. Hiding an authored fixture is still distinct from switching its light off. Do not cull a source simply because its fixture is offscreen or its owning room is unfocused: it may illuminate visible receivers through a doorway.

### Three separate costs

1. **State-change work:** effective HA value → light sync → allocations → fixture glow → shadow invalidation → shader topology. Existing reference-identity rebuilding makes colour/dimming more expensive than the geometry requires.
2. **Shadow generation:** render relevant casters from each dirty light. A point shadow has six faces; a spotlight has one light-space view. The fragment texture-unit budget is a separate constraint from view count, map memory and geometry draws. A valid depth map need not change when the lamp's colour or intensity changes.
3. **Steady frame shading:** the forward PBR shader evaluates the spotlight list on lit fragments. Unshadowed fills still have this cost, including the extra HA glass-stage render. Static shadows alone cannot solve poor warm orbit performance with many strips. Emitters are not inherently one additional geometry draw call each.

Before Phase 12's strip term, the 2.7 m kitchen example was two carriers plus eight fills (10 samples; now two carriers plus one strip term); the 6 m cap is three plus twelve (15). These counts come from source, not GPU profiling. Ten kitchen-length strips would add 100 spotlight samples before ordinary lamps, even though only a capped subset of carriers casts shadows.

### Update resources by meaning

Compare effective rendered values, rather than only object identity or whole-document serialization. A new HA event with the same effective lamp output must schedule no light work. Preserve existing distinctions for disabled, unavailable, hidden-by-condition, fixed-white, RGB and Kelvin states.

Keep entry/root/emitter/target/shadow resources for colour and intensity edits. Update glow, emissive/placeholder material, pin state and export flux metadata in place. Transform updates reuse compatible resources but dirty their shadow geometry. Only structural changes (new/deleted light, geometry type, changed sample topology or fixture-emitter structure) rebuild the affected resources. Templates loading later and changes to the rendered fixture's emitter mouth count as transform/structure changes even if the authored light has not changed.

### Proposed shadow invalidation

Use the renderer-wide update gate plus public per-light dirty flags. Maps must be allocated and rendered once before sampling; an off lamp can defer a missing map, but its next enable must initialize it. Both hosts and their asynchronous paths follow one framework-free invalidation policy.

| Change | Main image | Shadow depth work |
| --- | --- | --- |
| Effective lamp values unchanged | No light render request | None |
| Brightness/RGB/Kelvin only, existing topology/assignment and valid map | Update uniforms/glow | None |
| On/off, existing topology/assignment and valid geometry generation | Update emission | None; if topology/assignment changes, initialize newly required maps |
| Light position/aim, beam projection, source range affecting shadow camera | Update affected emitters | Its affected shadow maps |
| Length/sample topology or shadow-slot reassignment | Update/rebuild affected representation | New/repositioned/reassigned maps before use |
| Wall/door/window/blind/object movement, geometry, casting/alpha-cutout/displacement changes | Update scene | Initially all potentially affected maps; conservative all-caster invalidation is valid |
| Sun direction or fitted sun-shadow bounds | Update sun/exposure as needed | Sun maps; artificial maps only if their geometry/projection also changed |
| Albedo/roughness/emissive change with unchanged silhouette/depth/casting | Update material | None |
| Camera orbit/pan/zoom, selection/pins/overlay | Draw as needed | None under current floor-fitted shadow cameras |
| Floor/house replacement, late asset readiness, context recreation | Update/rebuild scene | Initialize affected maps; never reuse another scene's map |
| Isolation/walls visibility, export override, reflection/auxiliary visibility changes affecting casters | Draw relevant view | Invalidate affected geometry; restore normal-view validity afterwards |

An open door can expose another room's lights. An occluder invalidation cannot be restricted to its authored area without a proven influence test. Any future tighter dirty-region tracking must include previous and new bounds, cross-room influence, template geometry and an unknown→conservative fallback. Colour-only changes do not need spatial indexing. Timer-driven shadow refresh is not part of the proposal.

### Stable counts require measurement

Implemented in Phase 16.6 as the [stable light topology](#stable-light-topology-phase-166). The all-off, one-on, and many-on frame-cost comparison below is still to be measured. Three.js's program key depends on light/shadow counts. Test a bounded stable active-floor representation with zero-intensity off lights, rather than changing `visible`/`castShadow` on every fade. This can trade warm compilation hitches for extra per-fragment work and memory; it is not automatically faster when most lamps are off. Compare warm all-off, one-on and many-on cases and distinguish one-time shader warm-up from recurring updates.

Do not repeatedly re-rank shadow owners by dimmed flux during a brightness slider movement. Evaluate a stable authored-output/ID policy versus allocation at active-set changes. Fixed ownership may waste slots on off lamps; reassignment may alter shader counts and must invalidate map ownership. Retain the measured floor-wide texture cap and a clear over-budget behavior. More shadow carriers do not remove the texture limit; pooling alone does not make shadow maps or shader loops free.

### Reduce fill only within measured visual error

Superseded (owner decision 2026-11-18): the fill row was replaced by the [strip term](#strip-light-phase-154), so there are no fill samples left to reduce. Kept for the record.

First retain the known carrier confinement and compare fewer weighted fill samples against the current row and a high-quality reference. Normalize weights to the same total output. Check near and far receivers, strip ends, shiny materials, occluders and adjacent-wall leakage at the same exposure. A surface 0.3 m below a long strip is a harder case than a floor far below it. Select the smallest count/profile that passes recorded tolerances, rather than assuming two samples suffice.

If adaptation is necessary, compute it from stable geometry/receiver bounds on scene changes, with conservative handling of unknown/near surfaces and hysteresis while editing. Avoid camera-driven per-frame topology changes and popping. A reduction from ten to six sample lights is a 40% sample-count reduction, **not a promised 40% frame-time saving**. Retain the original profile if the alternative fails visual or measured performance gates.

### Larger alternatives: gated experiments

| Candidate | Potential benefit | Required proof / reason not to start here |
| --- | --- | --- |
| In-place state updates + selective shadows | Removes redundant resource/depth work while retaining the existing model | First priority; it does not remove warm fill-light shading cost |
| Smaller weighted/adaptive fill row | Uses ordinary Three.js materials with fewer spotlight evaluations | Must preserve uniformity, total energy and near/glossy appearance |
| Specialized finite-line near-fill shader, retaining carrier visibility | Could replace generic repeated spotlight setup with a line-specific integral/approximation | Diffuse/specular and visibility approximations need evaluation; one function is not automatically cheaper, and a single carrier's shadow is not exact visibility for every point along a line |
| Static receiver/visibility or unit-light basis cache | Moves expensive work away from every frame; colour/brightness can scale/combine a reusable basis | Independent lamps need independent information; cache cost can scale with light count × receiver texels. Doors/furniture/geometry invalidate occlusion, metal highlights depend on view, and a final baked RGB image loses independent live control |
| `RectAreaLight` alone or added to carriers | Continuous-looking emitter with existing PBR support | It has no WebGL shadow support; adding a shadowed light does not shadow the area light's contribution, so the previous wall-leak regression returns |
| Lower shadow resolution or pixel ratio | May reduce bandwidth/fill cost on constrained devices | Does not fix unnecessary rebuilds, total spotlight count or compilation. Resolution 1024→512 quarters map texels, not geometry-view count or guaranteed frame time; assess only after profiling |

For scale, ten 1024² RGBA16F per-strip basis textures would occupy about **80 MiB** before mipmaps, depth, staging or other lights (illustrative arithmetic, not measured allocation). A one-time bake of final illumination is therefore not the default for independently controlled HA lamps. Any cache is renderer-owned, bounded, revision/generation-aware and disposed on scene replacement; no lighting bake is added to saves/snapshots by this phase.

Promote a custom path only if simpler changes miss the agreed budget and a bounded prototype wins in target scenes. It must integrate with existing PBR/glTF material customizations, clipping/cutaway, reflection and shader program keys without editing Three.js internals. Keep a documented material/capability fallback. Do not add a required new backend, WebGPU dependency or lighting library merely to run the experiment.

### Verification and delivery

Measure CPU state work, real/available asynchronous GPU timing, warm/cold shader behavior, light/shadow view counts and resource lifetime separately. Fixed viewport/DPR, actual GPU/browser/Three.js versions, source revision, camera, sun and effective light states accompany comparisons. Report median and tail latency across repeated runs and quality samples before tone mapping; software-rendered headless checks establish correctness, not hardware speedup. The target device/frame budget and visual tolerances are chosen and recorded in Phase 12.0.

Exact invariants include no resource replacement on ordinary warm colour/dimming edits; no new shadow depth render for colour alone under unchanged valid assignment; no light render request for equivalent effective state; no stale map after occluder or ownership changes; bounded resources after warm-up and disposal. When an optimization uses stable topology, warm dim/recolour must not churn shader programs. Performance gains must exceed observed run-to-run variation and preserve the accepted appearance.

Apply the chosen framework-free path to builder and viewer together. Maintain full-flux linear-carrier export metadata when samples are reused; preview fills stay excluded from the separate offline render graph. Verify viewport PNG, offline exports and the Phase 11 packaged/downloaded/dev viewer entry paths. Proposed changes remain unimplemented until those checks and reference-house evidence are recorded.

Primary references: [LightShadow per-light update controls](https://threejs.org/docs/pages/LightShadow.html), [shadow-map rendering cost](https://threejs.org/manual/pages/shadows.html), [RectAreaLight limitations](https://threejs.org/docs/pages/RectAreaLight.html). The installed pinned Three.js source is the implementation reference for shader keys and shadow behavior.

## Preview renderer conventions

Implementation conventions of the browser preview's light adapter ([D08](../../decisions.md#d08-lighting-and-groups)); source: `src/renderer/lightColor.ts`, `src/renderer/lightsLayer.ts`, `src/renderer/lighting.ts`.

| Topic | Convention |
| --- | --- |
| Effective output | `outputLumens × brightness`; a disabled light emits nothing (its fixture stays visible) |
| Point light | `PointLight`, intensity in candela `= lm / 4π`, decay 2, no range limit |
| Spot light | `SpotLight`, `angle = beamAngle / 2`, `penumbra = softEdge`, tilt 0 = straight down, 90 = horizontal along the heading. Untyped: candela `= lm / 4π` (an isotropic bulb masked by the cone, as in glTF/Blender exports). Typed ([lamp types](#lamp-types), Phase 8.9): the cone emits exactly the lamp's lumens, candela `= lm / Ω` with `Ω = 2π · (1 − (cos a + cos(a · (1 − penumbra))) / 2)`, the integral of Three.js's smoothstep cone (a 40° beam with soft edge 0.3 is about 44× brighter on axis than the isotropic convention, as a real 40° downlight is). Three.js's own `SpotLight.power` setter (`lm / π`) is not used |
| Linear light | Phase 12 ([strip light](#strip-light-phase-154)): one analytic strip term (one-sided Length × Width rectangle, Width at least 2 mm in the maths, radiance `lm · share / (π · A)`; no shadows; reach from the segment and one clip plane: 0.1 m above the floor, or the faced wall + 60 mm) plus carriers `round(lengthMm / 1500)` (1–3), shadow-casting, each a 150° cone (half-angle 75°) along the facing, penumbra 1, peak candela `= lm / (π · (1 − cos 75°))` of their share, evenly spaced. Term share 85 % for strips 0.7–1.8 m above the floor (or from the faced wall), 0 below 0.4 m and above 2.3 m, linear in between; 100 % within 0.2 m of the faced wall (no carriers drawn); carriers take the rest. Shader slots per floor: strip count rounded up to 4/8/16, at most 16. Emissive strip geometry. The render-scene export writes each carrier as a point light of `lm / carriers` and leaves the term out |
| Preview scale | Every emitter intensity is multiplied by a fixed preview calibration factor of `0.1` (`0.2` until 8.9), because the baseline sun and sky are not in physical lux. Reasoning (8.9): on a floor of albedo 0.7, middle grey (radiance 0.18) sat at about 4 lx at `0.2`, two stops brighter than a phone exposing a lamp-lit room at night (about 18 lx), so every surface near a lamp clipped; at `0.1` middle grey is at about 8 lx. Examples at night: a table 1 m under an 800 lm pendant shows sRGB 0.84 (was 0.91, Neutral in HA 0.99), the floor 2.3 m under an 800 lm ceiling light 0.57, a kitchen counter under the 1120 lm strip 0.97 → 0.90 from front to back (335 → 114 lx, a real task-light level) |
| Day/night exposure | Daylight `d = sun intensity / default sun intensity` (0–1). The sun and sky are multiplied by `g = 1 + (G − 1)d` and tone-mapping exposure is `1/g`, so daylit scenes look the same while lamps appear G× weaker at full daylight than at night. `G = 3` (Phase 14.2, owner 2026-11-18: by day a lamp made no visible difference; it was 10). Night and the daylit look do not depend on G; the render-scene/Blender export stays in physical units. At night the sky falls to a faint ambient of `0.12` (`0.3` until 8.9): an unlit floor at night shows sRGB ≈ 0.15 under AgX, about what 0.3 gave under ACES |
| Indoor sky fill (Phase 15.5, owner 2026-11-18) | Inside a room under its shadow-only ceiling the hemisphere fill and the HA viewer's image-based fill (irradiance and scene-environment reflections; mirrors keep theirs) are multiplied by `1 − 0.4 · d`: the bounce floor 0.6 in full daylight (about 0.7 stop darker), unchanged at night. The direct sun on indoor surfaces is × `1 + d` and windows light their rooms as sky portals, so contrast comes from added light. See [sky light through windows](#sky-light-through-windows-phase-155) |
| Sun through windows (Phase 15.5, owner 2026-11-18) | See-through template parts (glTF alpha blend below 0.6 opacity, or physical transmission above 0.5: clear glass) cast no shadows, so the sun reaches rooms through windows and glazed doors; blinds, frames and tinted panels still cast them. Each room with walls at least 2 m high gets an invisible, shadow-only ceiling at its tallest wall's height (no colour, no depth, never picked, hidden with Walls off, not exported), so the sun no longer shines over wall tops onto floors (`floorScene.ts` `isShadowOnly`) |
| Tone mapping | AgX (Phase 8.9) in the builder viewport, the template preview, PNG export, and the HA viewer; before, ACES in the builder and Neutral in the viewer. At exposure 1 AgX puts middle grey where ACES did (sRGB ≈ 0.50) but rolls highlights off over about 6.5 stops: radiance 1.5 / 2.8 / 5 shows 0.85 / 0.91 / 0.95 (ACES 0.93 / 0.97 / 0.99, Neutral 0.97 / 0.99 / 0.99), and bright warm light desaturates towards white as on film instead of turning orange. The photoreal render already uses AgX (`src/renderer/lighting.ts`, `previewToneMapping`) |
| Fixed white | 3000 K untyped; a typed light's type white |
| Kelvin → RGB | Tanner Helland's curve fit of blackbody colors (1000–40000 K), times a typed lamp's tint, then normalized to relative luminance 1 so a temperature change does not change perceived output |
| RGB | sRGB 0–255 linearized and normalized to a maximum channel of 1; lumens are the white-equivalent output, tinted |
| Shadows | Every emitter of a giving light casts shadows (a linear light's strip term never does), up to the shadow budget `min(10, maxTextures − 7)` (9 on the common 16 texture units; 7 units stay free for the sun's map and up to six material maps). Emitters are ordered by their flux (a linear carrier counts its share), ties by light ID and sample index; emitters past the budget shine through walls. Point shadow maps are 512 px per cube face, spot maps 1024 px; near 0.05 m, far 60 m, bias −0.0008, normal bias 0.02; PCF radius 1 texel, 3 for linear carriers |
| Shadow updates | Static: `shadowMap.autoUpdate` is off. Every scene change (content sync, light change, previews, isolation, sun, walls on/off, export) redraws all shadow maps once; camera moves, resizes, hover, pins, and tool overlays reuse them |
| Fixture emitters | A visible fixture with a template renders the template; its `KHR_lights_punctual` node, else its linear emitter node, places the emitter; a template with neither emits from the centre of its model face opposite its contact, 10 mm out (an overhead fixture's bottom). Fixture meshes cast no shadows. K15 (Phase 8.9): a **spot** light, and a **point** light in an overhead fixture whose opening (the smaller half-size of the model across the aim) is narrower than the emitter's depth to the mouth (a tube downlight), moves along its aim (straight down for a point light) to 10 mm outside the model's bounds, at most 250 mm. Deep in a tube the unshadowed emitter lit the tube's inside at near range (up to Three.js's 1/d² clamp at 0.1 m), which read as a white disc: "the light source deep in the tube". A wide shade (the built-in pendant: 200 mm half-size, bulb 150 mm deep) keeps its bulb inside. Before 8.9 a template without an emitter node also showed the 45 mm placeholder sphere inside its model |
| Fixture glow | Every emissive glTF material of a visible fixture is copied per fixture: emissive colour = the light's colour (maximum channel 1) × the template emissive's maximum channel, strength = the template's, at most 3, × brightness, 0 when the light gives no light (Lights off, disabled, HA off). So lenses, diffusers, bulbs, and shades glow in the light's colour and go dark with it, and a 6× bulb no longer reads as a separate hot spot (`setFixtureGlow`, fed by `LightsLayer.fixtureGlow` in both hosts) |
| Markers | A visible fixture without a rendered template (loading or failed) shows a 45 mm placeholder sphere in the light's colour (exported). An invisible source shows a screen-sized editor marker (pickable, never exported). A linear light's strip is 4 mm thick |
| Pins | Badge hit 13 px, capsule at least 8 px either side, floor dot 8 px, stem 5 px; pin geometry is lifted 3 mm off the floor (`src/renderer/lightPins.ts`) |
| Handles | Move hit 7 px, other handles 11 px, Raise snaps within 10 px, Stretch minimum 50 mm, Aim tilt at most 80°, Aim ring 16 px, Face arrow 44 px snapping to 15° (`src/features/floor-builder/tools/lightSelectOps.ts`) |

## Sky light through windows (Phase 15.5)

Owner decision (2026-11-18, Phase 15.5: "make sun patches real"): the bright morning light in a real living room is daylight from the sky through a window, and the sky fill used to be applied evenly everywhere, unblocked by walls or ceilings, so windows added nothing and rooms looked flat. Now indoors the sky fill falls to a bounce floor and every exterior window or glazed door lights its room with sky light. Owner feedback on the first tuning (2026-11-18, live builder: "the house during day looks like a house at night"): a daytime room in shade must still read as daytime (at most about a stop darker than before), and window-lit areas and sun patches must be brighter than before, so the contrast comes mostly from light added through the windows, not from light removed. Rules in `src/renderer/skyLight.ts`, shader and mask in `src/renderer/skyShading.ts` (both hosts create one and call `beforeRender()` before every render, PNG export included); checked by `npm run sky:check` (`scripts/check-sky-light.ts`).

**Indoors.** A fragment is indoors when it is inside a room that has a shadow-only ceiling (walls at least 2 m, [sun through windows](#preview-renderer-conventions)) and below that ceiling: the same rooms, so with Walls off (no ceilings) everything is outdoors and the view is as before. The rooms' outlines are rasterized into a top-down mask (RGBA8: room and ceiling height; 20 mm texels up to a 20 m floor, at most 1024 per side; grown 30 mm into outdoor texels so vertices lying on an outline count as indoor). It is looked up in the **vertex** shader, so it takes no fragment texture unit (those belong to the shadow maps): each vertex is moved 80 mm (dilation + one texel + 20 mm) along its normal first, so a wall's room-side face is indoors and its outer face and top are outdoors, and a flat varying makes each triangle wholly in or out. On the representative house the mask agreed with the side each wall face looks into for 99.2 % of the wall triangles between a room and anything else, and every floor-outline vertex was indoor. Only materials under the plan root are patched (floors, walls, instances); the HA stage, helpers and the template preview are unchanged.

**Indoor fill.** Indoors, the indirect diffuse light (hemisphere, ambient, image-based irradiance) and the scene-environment reflections are multiplied by `indoorFill(d) = 1 − (1 − 0.6) · d`, d the [daylight](#preview-renderer-conventions): 1 at night (night unchanged), the bounce floor 0.6 in full daylight. A first tuning at 0.06 (a sun patch 10× the shade, as in a real room) read as night (owner) and was raised: 0.6 keeps a room in shade 0.74 stop under the unblocked fill. Materials with their own environment map (mirrors) keep their reflection. Exposure policy, G and `daylight()` are unchanged; the HA viewer's `environmentIntensity` keeps its daylight rule and is reduced indoors by the same factor in the shader, so the builder and the viewer agree.

**Indoor sun.** The directional light (the sun, through clear glass and its shadow map) on indoor fragments is multiplied by `indoorSunGain(d) = 1 + (2 − 1) · d` (2 in full daylight, 1 at night), injected into Three.js's own `lights_fragment_begin` directional-light loop (the patch is named `sky` so it runs after the patches anchored there; if a Three.js upgrade changes that chunk the gain is skipped). With a morning sun at elevation 27° a sun patch on a floor is 3.11 against 2.80 before (+0.15 stop) and 2.9× its shade (1.6× before). Outdoors (stage, facades, wall tops) is unchanged.

The two gains are a **convention**, not physics: a real room's shade is a few percent of the outdoor light and the eye adapts; with one exposure for the whole dollhouse view, the preview keeps the shade near the outdoor fill and lifts the light that comes from outside instead.

**Sky portals.** Every Wallable opening with clear glass ([see-through](#preview-renderer-conventions) template parts, the `shadowCasting.ts` rule; instance overrides excluded) in a wall of an indoor room, whose other side 400 mm beyond the glass is in no indoor room (interior glazing, such as a door onto the balcony, is not a portal), is a one-sided rectangle: the bounds of its glass panes at their mid plane, facing into the host room. Its radiance is

`L = k · τ · b · a · f(s) · E_v · d · g / π`,

k = 6 the portal gain (the indoor adaptation that keeps the bounce floor at 0.6, plus the window light's interreflection, which the preview does not simulate; with it a surface facing a bare window 1 m in is brighter than the unblocked fill was there), E_v the irradiance the day sky fill gives a vertical surface outdoors (the hemisphere light's horizontal-normal value, 1.19 before daylight and gain: the window passes in what the facade receives), τ the glass transmission (physical transmission, else 1 − opacity: the built-in clear glass 0.8), b the blind factor, a the glass share of the rectangle, d and g the daylight and exposure gain. f(s) = 1 + 0.8 · max(s, 0) − 0.2 · max(−s, 0), s = the opening's horizontal outward normal · the unit direction toward the sun (cos of the azimuth difference × cos of the elevation): up to 1.8 on the sun's side of the sky, 0.8 facing away. The colour runs linearly in max(s, 0) from a cool sky (linear RGB 0.86, 0.96, 1.18) to a warm one (1.08, 1.00, 0.88), both normalized to luminance 1, so a north window at 42° N is cool and even. The direct sun is not part of it: it already enters through clear glass with its shadow map. Blind factor (template parameters with their defaults, pose blends weighted, so an HA blind state animates it): venetian `blind`/`blinds` open 0.4, closed (`blindsClosed`) 0.02; a `shade` lowered by `shadeLoweredPct` passes `1 − lowered · 0.85`; otherwise 1.

The portal is evaluated with the strip term's maths (`src/renderer/rectLightShading.ts`): the rectangle's Lambertian form factor for diffuse light and the representative-point highlight for gloss (a shiny floor shows the window), unshadowed. Confinement: one-sided (nothing outside the glass), only indoor fragments, and only inside the room's box (its outline's bounds + 20 mm, floor to ceiling + 20 mm), so it never lights the next room through a wall or the outside. Slots: the floor's portal count rounded up to 4, 8 or 16 (at most 16, document order; further openings add no sky light). Sun, daylight and blind changes only write uniforms; a new portal past a slot step recompiles once.

**Measured** (`npm run sky:check`, CPU mirror of the shader, scene units with the exposure removed; "before" is the look before 15.5: the full fill everywhere; synthetic 4 × 5 m room, glass 0.8 × 1.2 m north and 1.6 × 1.2 m west, sill 0.95 m, τ 0.8, a 0.85; measured when 15.5 was built at a fixed location and two fixed times; the current check uses 21 June 09:00 and 16:00 at the checked house's location, so its printed values differ). Shade on a floor 1.07 against 1.79 before (−0.74 stop). Average over the room's floor and walls (100 mm grid, no sun patch in this room at 10:18): 0.96 against 1.37 before (−0.52 stop) with bare windows, −0.65 stop behind open slats. North window radiance (linear RGB) 1.16/1.29/1.59, cool; west 1.47 at 10:18 and 2.51 at 15:00 (the sun's side). A surface facing the north window 1 m in, 1.2 m up: 1.54 against 1.20 before and 0.72 on a far-corner wall (2.2×; 1.5× behind open slats). The floor near a window with a 0.95 m sill gains less (1.33 against 1.12 in the far corner: the window sees it at a grazing angle); the window's own reveal is 3.1. Open slats 0.40×, closed 0.02×, a shade 80 % lowered 0.32× of the bare window; nothing outside the glass or in the next room; nothing at night. Section C of the check runs on a demo house ("Demo: City apartment" by default) and reports each opening's portal.

**Limits:**

- The model has no obstructions outside: neighbouring buildings, trees and balcony roofs above an opening that are not modelled as rooms do not dim its sky light. So, per square metre, a west opening is never darker than a north one in the morning (the west sky is nearer the sun), and large glazed doors give proportionally more sky light than a small window.
- The indoor gains are calibrated by eye targets (owner, 2026-11-18), not physics: a sunlit room near large sun-side glass (the balcony) is bright, and AgX rolls its highlights off.
- Portals are unshadowed: furniture does not shade window light, and blinds act as one factor, not as slats.
- One box per room: in an L-shaped room the box also covers the notch, so a portal can reach a neighbouring room's floor there.
- Light from a room's windows does not pass on through an interior door or interior glazing into the next room, and there is no further interreflection than the bounce floor (a sunlit floor does not lift its room).
- During an area drag preview the mask and portals keep the room's previous place until the drag ends.
- The vertex mask is one more sampler in Three.js's per-program texture-unit counter: when a material already uses the full fragment budget (9 shadows + sun + 6 material maps on 16 units) Three.js logs a texture-unit warning; vertex units are separate, so it still renders.

**Yards (Phase 17.2):** a [yard](yards.md#rendering) has no shadow-only ceiling, whatever its fence height, so it is never in the indoor mask (`indoorRooms`) and is lit as the outdoors.

## Light confinement

Owner requirement (Phase 7.10, 2026-11-16: "a light in the corridor lights every room up"). In WebGL a light reaches every surface that faces it unless it casts shadows: walls stop light only through shadow maps. So every artificial emitter casts shadows (budget and map sizes in [preview renderer conventions](#preview-renderer-conventions)), linear lights included, and light still passes through open doorways and wall openings as it should. Shadow maps are static and redrawn only when the scene changes, so orbiting costs no shadow passes. The builder and the HA viewer share this ([renderer](../../architecture/renderer.md)).

Known limits: emitters past the shadow budget (a floor with more than 9 giving emitters on a 16-unit GPU) shine through walls, dimmest first; a linear light's strip term (Phase 15.4) never reaches a floor or what lies behind the wall it faces, but facing down it can light an object within its reach (at most 1.4 m) on the other side of a thin side wall; walls faded by an edit context cast no shadows, so light reaches the faded rooms while editing; there is no ceiling, so a light mounted **above** the wall tops can reach the next room over the wall. A light below the wall top cannot: a ray that clears a wall's top edge rises from there on and never reaches a floor or wall face lower than that top. All lights of the reference house sit between 1.5 m and 2.56 m under 2.6 m walls, so a derived ceiling was not needed (7.10a); it stays a candidate if lights above the walls become common.

## Stable light topology (Phase 16.6)

Owner report (2026-11-18): switching a light on or off the first time took a long time to show; later switches were fast. Cause (Three.js r187 source): every lit material's program is compiled for the number of visible point and spot lights and of shadow-casting ones per type (`WebGLPrograms` `numPointLights`, `numSpotLights`, `numPointLightShadows`, `numSpotLightShadows`; the renderer only gathers visible lights). The lights layer hid an off emitter (`visible = false`) and gave shadows only to emitters that were on, so the first switch into each new on/off combination recompiled every material in view; programs stay cached per material, so repeats were fast.

Rule (shared by the builder and the HA viewer, `lightsLayer.ts`):

- **Every emitter of the active floor stays in the scene.** Off (disabled, brightness 0, Lights toggle off, unmapped or off in HA) means intensity 0, not hidden. Export-only carriers stay hidden as before. The render-scene export already skips zero-intensity lights.
- **Strip slots** (`HP_STRIPS`, 4/8/16) are sized by the floor's strip terms whether they are on or off (unchanged; an off strip writes zero radiance).
- **Shadow slots:** min(budget, shadowed emitters) emitters always cast. The on emitters that the earlier rule picks (the brightest on emitters by flux, up to the budget, ties by light ID and sample index) always cast, so lights that are on look as before; the remaining slots go to off emitters by light ID. An off emitter's shadow map is drawn once when the emitter is built and not redrawn while it is off (`shadow.autoUpdate` follows on/off); an emitter that starts casting draws its map on the next shadow pass (`shadow.needsUpdate`).
- **Point/spot split:** Three.js counts point and spot shadows separately. Under the budget every emitter casts, so the split never moves. Over the budget the split starts from the authored output of all shadowed emitters (the top `budget` by `outputLumens`, ignoring on/off and brightness) and moves only when the lights that are on need more slots of one type than it has, by the least that fits. Each new split compiles once and is reused after that. The HA viewer precompiles the splits one step away in the background (see below).
- **Precompile:** the HA viewer compiles the whole scene in the background while it prepares the house (15.1). Because on/off no longer changes the topology, those programs serve every combination. Once loading is done it compiles the scene again (`renderer.compileAsync`) for the final topology (fixtures that loaded late can move emitters or strip shares), and over the budget also for the neighbouring shadow splits (`LightsLayer.withNeighbourSplits`). The builder draws at once and has no staged loading. Its first frame compiles the stable topology, and a split move over the budget compiles once in that frame.

**Whole-house views** (Phase 18.1, the HA whole house and the builder's overview): one lights layer lights every floor's lamps (each in its own floor's area group), so the same rule holds for the whole house: one topology per view. They use a smaller budget, `houseShadowBudget` = 4 (`setShadowBudget`; implementation convention by measurement): the brightest lamps that are on cast first, the rest shine unshadowed, since a point light's shadow is six passes over every floor's content. Unshadowed lamps are not confined by walls or slabs (a bright upper lamp can faintly light the floor below). Going back to a floor restores the floor budget (a different topology, compiled while that floor prepares).

The topology is still rebuilt when the floor's lights change: a light is added or removed, its type or strip share changes, or the floor is switched. `npm run lights:topology` checks the rule on synthetic floors under and over the budget: one topology key across on/off/brightness combinations under the budget; over it, fixed light, caster, and strip counts with only the split moving; off maps not redrawn; on-light intensity and shadow ownership identical to the earlier rule. Timing: with `localStorage["homeplan.loadTiming"] = "1"` (HA viewer: also dev mode), the console logs each light state change (HA) or Lights toggle and scene update (builder) with the time to the next frame and the program count before and after (`src/renderer/switchTiming.ts`).

## Finding and picking lights in the editor

Owner requirement (Phase 5.11): every light has a **pin**, an editor helper that is never exported: a round badge (about 22 px, constant on screen) with the light type's icon (bulb, spot, strip) at the light, a dashed stem down to the floor, and a floor dot. A linear light also has a capsule line along its strip. Badges are amber when the light gives light and grey when it is off. Pins are hit in **screen space**, before anything else: the badge (13 px), a linear light's capsule (at least 8 px either side of the strip, wider when the strip is), the floor dot (8 px), and the stem (5 px). So a 12 mm strip is clicked anywhere along its length, and lights win over floors, carpets, and objects there, as lights always did for their own geometry. Hovering a pin grows it and turns it the strong accent, and a tooltip names the light and its height ("Strip 1 · 2.30 m"). Where several pins are under the pointer, the tooltip says "1 of 3 · click again for the next", and repeated clicks on the same spot (within 4 px) cycle through them. A selected light's pin takes the selection accent and shows where it shines: a spot's beam ring on the floor (aim and beam angle from its tilt and height), a linear light's strip outline on the floor (moved sideways by its facing; none when it faces within 10° of horizontal or up). The header has two separate light switches (Phase 7.9, owner 2026-11-16: "all lights off, not just hide them"), both session-only: **Lights** on/off and a three-state **light controls** segment. **Lights** starts **off** in each editing session (owner, 2026-11-17). **Lights off** switches every artificial light off in the view: emitters and their shadows go dark, glowing strips and placeholders show unlit, fixtures and pins stay (pins turn grey); only the sun and sky fill remain. It never changes a light's saved **Enabled**, and PNG exports and photoreal renders use the saved state. The **light controls** (owner, Phase 5 follow-up; starts on **Hidden**, owner 2026-11-15) are **Hidden** (no pins or light handles, and pins are not picked; lights stay selectable by their fixtures and the tree), **Shown**, and **Focus** (everything else dims and only lights are pickable). The earlier fourth state "Off", which hid every visible part of the lights while they still shone, was removed in 7.9 because it read as "lights off"; hiding a fixture is [Hide](../screens/floor-builder.md) now. Light colour tints on badges are not used: the amber/grey state reads better on every floor.

### Light handles

Owner requirement (Phase 5.12): a selected light shows one handle per placement property, so nothing has to be typed. **Move** (a cross on the floor dot) moves it in the plan with floor inference; **Raise** (an up/down arrow halfway down the stem, 3D only, since Top sees the vertical end-on) sets its height, snapping to the room's wall heights, the house default height, and other lights' heights within 10 px; turning a light is **Rotate** (Q), as for every placed thing (owner, Phase 5 follow-up: the Turn grip was removed); **Stretch** (a linear light's two ends) changes its length with the other end fixed, or about the centre with Option (minimum 50 mm); **Aim** (a 16 px ring where a spot points on the floor) sets heading and tilt together from the point dragged (tilt up to 80°); **Face** (Phase 13.3, a 44 px arrow from a linear light's middle in the direction it shines) turns its facing about the strip's axis: the pointer ray meets the plane across the strip at its middle, and the angle there snaps to 15° steps (Ctrl: whole degrees); a dashed circle shows the turn. Top view sees the arrow from above, so there it is shown only while the strip faces at least 30° to one side (dragging then reads the sideways offset); otherwise use the Facing field. Raise applies to every selected light at once. Raise and Stretch take typed lengths, Face typed degrees (Enter commits). Each drag is one undo step. A light added from the tree starts at the room's centre, 100 mm under its highest wall (or the house default height), and follows the pointer until a click places it; Escape leaves it at the centre.

## Light groups

Light groups are in MVP Phase 1, as a selection and bulk-edit tool ([D08](../../decisions.md#d08-lighting-and-groups)):

- **Storage:** a group is a named list of stable light IDs, stored on its building floor in `house.json`. Lights are never duplicated or reparented, and each light stays under its area.
- **Scope:** a group may contain lights from any area on its floor. A light can belong to several groups.
- **Tree:** a **Light groups** row under the building floor lists groups (shown only once a group exists); selecting a group highlights its member lights in the viewport with the selection accent (Phase 7.3; before, this was a known gap). Each area's **Lights** row lists its lights; a disabled light's row is muted.
- **Bulk edit:** setting enabled, brightness, or color mode/value on a group writes that value to each member's own defaults in one undoable command. The group's panel shows a **Set on N members** section with Enabled, Brightness, and Color; values that differ between members show as Mixed. A color whose mode a member's capabilities don't include is skipped for that member, which keeps its own value.
- **No override layer:** groups have no state of their own, so overlapping memberships need no precedence rule.
- **Cleanup:** deleting a light removes it from its groups. Deleting a group never deletes lights.

HA group mapping and runtime group state are post-MVP ([light state in Home Assistant](../../home-assistant/light-state.md)).

## Verification scenarios

- A linear light changes length/placement without changing its logical identity or duplicating its total output.
- Fixed-white, tunable-white, RGB, and combined-capability lights preview without Home Assistant.
- Switching temperature/RGB mode updates the visible glow and illumination together and preserves the light's ID.
- Setting brightness on a group updates every member in one undo step; Undo restores each member's previous value.
- A light in two groups keeps the value from the most recent bulk edit; there is no hidden override.
- A corridor light lights the corridor and, through an open doorway, a little of the next room, but no neighbouring room through a wall; a linear light behaves the same ([light confinement](#light-confinement)).
- A 2.7 m strip 0.6 m above a counter lights it as an even band (no bright spots along the strip) with a soft edge, and the room behind the kitchen wall stays dark ([natural strips](#natural-strips-phase-89)).
- Choosing Lamp type LED warm white on an 800 lm light sets 2700 K and 8.5 W · 806 lm; choosing 14 W sets 1521 lm; Undo restores both in one step ([lamp types](#lamp-types)).
- Choosing the Wall Lantern fixture for a light in a room mounts it on the nearest wall's exterior face, facing out; at night it lights the facade and the ground outside and nothing in the room; Wall side → Interior moves it onto the room face, and then only the room is lit ([wall-mounted lights](#wall-mounted-lights-phase-173)).
- A spot or tube downlight shows no bright disc inside its fixture; its lens glows in the light's colour and goes dark when the light is off.
