# Ambient effects: swirls and vapour on objects

Updated: 2026-11-16.

Status: **resolved ([D24](../../decisions.md#d24-ambient-effects)) and implemented (Phase 7.11).** Owner requirement (2026-11-16): small animations that run every 20 seconds; for a start, wind-like swirls that play like a stop-motion animation for 3–4 seconds, red above a water heater or boiler (heating water), blue in front of an AC unit (blowing cold air), later water vapour above a dryer. Everything else (model, editing, the frame drawings) is review inference under "use your best judgement"; timings and shapes are implementation conventions.

## What it is

An **ambient effect** is a small animation attached to one Areable object that shows what the appliance is doing. It plays for 3.5 s, then nothing until its next 20 s cycle, so the house stays calm. Two kinds:

| Kind | Looks like | Typical use |
| --- | --- | --- |
| `swirl` | Three curled, wind-like strokes that wind up and drift along the effect's direction | Red rising above a water heater or boiler; blue blown out in front of an AC unit |
| `vapour` | Three soft wavy wisps that widen and fade as they rise | A dryer or kettle (not on any built-in yet) |

The effect is part of the object: it moves, turns, and hides with it (Walls off keeps wall-attached objects and their effects drawn in place). A free-standing effect in an area is post-MVP (P7).

## Model

An Areable instance (`area.objects[]`) may carry an optional `effects` array (at most 8). Older houses have none, so the house schema version is unchanged. Schema: `AmbientEffect` in `shared/domain/schemas/effects.ts`.

| Property | Value type | Meaning | Default (Add effect) | Editor |
| --- | --- | --- | --- | --- |
| `id` | ID, prefix `fx_` | stable effect ID | new | hidden |
| `kind` | `swirl` \| `vapour` | the drawing | `swirl` | segmented |
| `enabled` | boolean | plays or not; in the HA viewer a binding may also stop it ([effects in the viewer](../../home-assistant/bindings.md#effects-in-the-viewer)) | `true` | toggle |
| `direction` | `up` \| `forward` | rises, or travels along the object's front (its heading) | `up` | segmented |
| `offsetMm` | `{ x, y, h }` lengths | from the middle of the object's top face (`up`) or front face (`forward`), in the object's own axes: `x` right, `y` forward, `h` up | `{ 0, 0, 100 }` | length × 3 |
| `color` | sRGB 0–255 | stroke colour | red `[226, 72, 52]` | color |
| `sizeMm` | length, 100–3000 | about the drawing's length along its direction | 600 | length |

Anchoring to a face of the object's model box (rather than to its origin) keeps a default effect in the right place for any template and size: "up" starts at the top, "forward" at the front.

```json
{
  "id": "o_k2v9x7q1mz",
  "name": "Air Conditioner 1",
  "templateId": "air-conditioner",
  "templateVersion": 1,
  "effects": [
    {
      "id": "fx_p3n8c2w0ra",
      "kind": "swirl",
      "enabled": true,
      "direction": "forward",
      "offsetMm": { "x": 0, "y": 80, "h": -90 },
      "color": [56, 140, 236],
      "sizeMm": 700
    }
  ]
}
```

(Abridged: the instance's placement, parameters, flips, and overrides are omitted.)

### Template defaults (D17)

An Areable template may declare default effects in its scene `extras.homeplan.effects` (the same fields without `id`; [object templates](object-templates.md#asset-level)). Placing the template copies them onto the new instance with fresh IDs (`newAreableInstance`); later template versions do not change existing instances' effects. Built-ins: `air-conditioner` has a blue swirl blown forward out of its louver, and the new `water-heater` (a wall tank) has a red swirl rising above it. Duplicating an area gives the copied effects new IDs.

## Editing (D18)

- **Adding (owner, 2026-11-16):** the object's tree row has **+ → Effect**, like the Add menus on rooms, walls, and floors; the selection's **Actions** menu has **Add effect** too. Doors and windows (wall openings) take no effects.

The properties panel edits one object's fields and nested objects; it does not edit arrays of objects. So an effect is an **entity of its own** (kind `effect` in the [entity index](../model.md#document-tree-ids-and-the-entity-index)), edited through its own schema like a wall feature:

- **Tree:** each effect is a row under its object ("Swirl", "Vapour"; greyed when disabled). Selecting it shows its properties (General: Kind, Enabled; Direction; Offset; Appearance: Colour, Size). Delete removes it (row trash button or the ⋯ menu), with Undo.
- **Add:** with one object selected, the properties header's ⋯ Actions menu has **Add effect** (`effectActions.ts`): it adds a red swirl rising from the top and selects it.
- **Preview:** an effect plays once immediately when it, or its object, joins the selection, and whenever it is added or edited (the renderer sees its value change).
- **Play / pause (owner, 2026-11-16):** one global ▶/⏸ toggle in the builder header next to **Lights** (starts **paused**, owner 2026-11-16: no redraws without need; while paused the effects timer stops completely; the last choice is remembered in this browser, `localStorage` `homeplan.builder.effectsOn`, owner 2026-11-17). Pause hides every effect; play shows them and plays every effect once immediately, then they keep their 20 s cycle. There is no per-effect Play button.
- **Drawing fix (2026-11-16):** effect ribbons are drawn double-sided; a mirrored drawing (odd ID hash) reverses the triangle winding, and front-face culling had dropped such effects entirely (owner report: "I cannot see it").

## Rendering

`src/renderer/effectsLayer.ts`, framework-free and used by both the builder (`viewportRuntime.ts`) and the [HA viewer](../../home-assistant/viewer-mvp.md):

- **Frames:** each kind has 7 drawings, generated procedurally on first use (no asset format): ribbons in a unit 2D frame, each frame with the curls wound a little further and a fixed "hand-made" jitter. A run steps through them at 8 frames per second for 3.5 s (28 ticks), drifting 45 % of the size along the direction, with stepped fade-in and fade-out over the first and last two ticks.
- **Camera-facing:** a small shader turns the ribbons toward the camera, with their length along the direction as seen on screen (screen up when the direction points at the viewer). Each effect is mirrored or not by its ID, so neighbours differ.
- **Placement:** an effect's group sits next to its object's model group (same parent, same matrix, same visibility), refreshed before every frame; it is anchored to the model's box.
- **Timing:** every effect has a stable phase (a hash of its ID) within the 20 s period, so effects never fire together. One timer wakes only for the next frame of a running effect, or for the next start; nothing runs between runs.
- **Live state (HA viewer, Phase 8.4):** `setLive` marks effects active or inactive and applies a variant's `kind` / `color` / `direction` / `sizeMm` overrides ([bindings](../../home-assistant/bindings.md#effects-in-the-viewer)). An inactive effect is hidden and left out of the timer, so with every effect inactive nothing is scheduled and no frames are requested (K12). Activation or a new look plays once at once. Effects missing from the live map, and every effect in the builder, keep the authored behaviour.
- **Render on demand and shadows:** each effect frame requests a view-only frame (`redraw`, the camera path of Phase 7.10), never `invalidate`, so the static shadow maps are not redrawn for effects. Effect meshes cast no shadows.
- **Layers:** effects live on their own Three.js layer (2). The builder and HA viewer cameras enable it; PNG exports render only the model layer and the photoreal scene export takes only model-layer meshes, so effects are never in exports. They are not pickable. In the HA viewer they are hidden in the glass reflection.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, each enabled effect shows one still frame all the time and no timer runs; changing the setting applies at once.

## Implementation conventions

Period 20 s; run 3.5 s; 8 frames per second; 7 drawings per kind; drift 45 % of the size; fade steps 0.4 / 0.75 / 1; phase = FNV-1a hash of the ID modulo the period; at most 8 effects per object; default colours red `[226, 72, 52]`, blue `[56, 140, 236]`, vapour white `[236, 240, 244]`.

## Verification scenarios

- Placing the built-in Air Conditioner adds a blue forward swirl under its object row; placing the Water Heater adds a red swirl rising above it.
- Every 20 s each effect plays a 3–4 s stop-motion swirl; two effects do not start at the same time.
- Selecting the AC unit (or its Swirl row) plays the swirl at once; changing its colour, size, or direction plays it again.
- Moving or turning the object moves the effect with it; Walls off keeps a wall-mounted object and its effect drawn in place.
- Orbiting during a run is smooth, and a run does not redraw the shadow maps.
- With reduced motion turned on in the OS, each effect is a still drawing.
- A PNG export and a photoreal render show no effects.
- In the HA viewer the same effects play, out of sync.

## Post-MVP and later phases

- **Phase 8.4 (done):** effects follow Home Assistant conditions and variants in the HA viewer (AC cooling → blue swirl, heating → red, idle → none; a radiator above a flow temperature → red). The bindings are HA configuration in preferences, not `house.json` ([D25](../../decisions.md#d25-home-assistant-bindings)).
- Free-standing effects in an area, more kinds, per-effect timing, and a built-in dryer template.
