# Light state in Home Assistant

Updated: 2026-11-19. Earlier: 2026-11-18 (Phase 13.6: lumens and temperature overrides from HA Settings).

Status: post-MVP design notes ([D15](../decisions.md#d15-card-interaction-and-state-policy)). Moved here from the [lighting specification](../builder/features/lighting.md) so that MVP feature documents contain only builder behavior. The builder MVP authors light identity, capabilities, and defaults; everything below is card/runtime work.

## Card boundary and precedence

**Who owns what (owner decision Q1, 2026-11-16; [D25](../decisions.md#d25-home-assistant-bindings)):** the **builder owns what the lamp is**: fixture, light type (tungsten, halogen, LED, fluorescent, neon; [lamp types](../builder/features/lighting.md#lamp-types)), full-output lumens, beam, colour capability, and default colour temperature, all in `house.json`. The **HA mapping owns what it is doing now**: which entity, on/off, brightness, and colour or temperature within the lamp's capability, plus the gesture actions and when it is shown ([bindings](bindings.md)). Home Assistant never sets the light type, and a light binding has no look overrides (no variants). **Amended 2026-11-18** (owner, Phase 13.6; [D25](../decisions.md#d25-home-assistant-bindings) Q1): HA Settings may re-adjust the full-output lumens and, for a light whose entity is no colour light, the default colour temperature, as installation-global overrides beside the light's binding ([below](#lumens-and-temperature-overrides)); type, fixture, beam, and colour capability stay builder-owned and `house.json` is never edited. In the viewer today: on/off, `brightness`/255, and `rgb_color` or `color_temp_kelvin` (clamped to 1500–9000 K) replace the authored defaults, with the overrides applied; everything else stays authored.

## Lumens and temperature overrides

Owner (2026-11-18, Phase 13.6): lights expose two of their settings to HA so they can be re-adjusted without editing the house.

- **Where:** the light's editor in HA Settings (Edit mode tap, or the Settings tree), **Light output**: **Lumens** and **Temperature**, saved with Settings' Save. Each field shows the house value until changed; a changed one shows the house value and **Reset to the house value**. Setting a field back to the house value removes the override.
- **Storage:** the light binding's optional `lumens` and `kelvin` (`homeAssistant.bindings[houseId].lights[lightId]`; [bindings](bindings.md#model)), installation-global. Bounds are the builder's own: lumens above 0 and at most 200 000; 1500–9000 K, edited in 50 K steps.
- **Lumens** applies to every light: it replaces the authored `outputLumens`, and the entity's brightness still scales it once (the renderer's effective flux is output × brightness; nothing else dims it).
- **Temperature** replaces the default colour temperature (the authored one, a lamp type's white, or the fixed 3000 K white; an RGB-authored light is then drawn as that white) only while the bound entity is no colour light. An entity that reports a colour mode with a colour (`color_mode` of `color_temp`, `hs`, `rgb`, `rgbw`, `rgbww`, or `xy`), or lists one in `supported_color_modes` (also reported while it is off), is a colour light: its live colour or colour temperature wins (owner: not for RGBW lights, they control warmth themselves), and the field is shown disabled with that reason (a stored value is kept and can be reset).
- **Applying:** the viewer folds the overrides into the light's effective state where the HA state is applied (`lightStateOf` in `ha-viewer/viewerScreen.ts`, `withState` in `ha-viewer/three/houseViewer.ts`); a Save applies them at once through the same light update as an entity change. A light without a usable entity state stays off, as before. Code: `ha-viewer/lightOutput.ts`, `ha-viewer/lightOutputSetting.ts`.

Keep click, long-click, and double-click controllable IDs stable when a light switches color modes. The object remains a light; its gesture declarations do not need to change with every supported state attribute.

The builder exports light identity, render capabilities, and defaults as visual-state metadata alongside scene data. The Home Assistant card owns entity selection, capability discovery, state subscription, conversion, controls, and outgoing actions. This extends the data collected by the builder without making it responsible for Home Assistant interconnection.

Recommended effective-state policy:

1. Start from the authored scene defaults, or an explicit builder render preset when rendering offline.
2. In the card, apply valid state from the bound Home Assistant entity for the fields it provides and the scene supports.
3. Missing/unsupported fields retain authored values. For example, an on/off-only entity can switch a scene light while the scene supplies color and its full-output level.
4. An explicit off state or zero brightness remains off/zero; it must not be replaced by a default through a truthiness check.
5. Select color as a complete mode/value pair. Respect the active entity color mode; do not combine a current RGB value with a stale temperature value.
6. For unbound, unknown, or unavailable entities, the light is drawn **off** (owner, 2026-11-16; implemented in the [HA viewer MVP](viewer-mvp.md), Phase 7.9). State availability visible in the card and last-known-state behaviour remain open for later.

The card should derive adjustable controls from the bound device's capabilities; it must not offer unsupported physical operations merely because the renderer can display RGB. Where scene/device capabilities differ, use a documented conversion/fallback rather than silently changing the physical device's capabilities. Home Assistant supplies on/off, brightness, color mode, and supported temperature/color attributes; adapter details remain card work. [Home Assistant light properties](https://contributors.home-assistant.io/core/entities/light/).

Brightness mappings must respect the source encoding and apply brightness only as intended; do not inadvertently double-dim colors during normalization. Full-output lumens are authored calibration, not assumed to be supplied by every Home Assistant light entity.

Group override precedence is a separate post-MVP decision. Do not let this per-light policy silently define how overlapping groups combine.

In MVP, light groups are builder bulk-edit sets with no override layer ([D08](../decisions.md#d08-lighting-and-groups)). Mapping them to HA groups and defining runtime group precedence belongs here when HA work starts.

## Live 3D versus layered image rendering

Live 3D can update emitter color/output from effective state. Pre-rendered PNGs cannot automatically reproduce arbitrary RGB lighting merely by assigning new metadata. Image mode needs an explicit strategy, such as finite color presets or evaluated compositing/color-basis renders; simple tinting is only an approximation, particularly for indirect light and colored surfaces.

Freeze effective light states and the house sun/environment snapshot when producing a render set. Supported image-mode color/brightness behavior and its accuracy remain to be specified; do not imply that every RGB state is already covered by the baseline PNG export.

