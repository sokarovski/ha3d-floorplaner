# Home Assistant bindings

Updated: 2026-11-18 (Phase 13.5 state-mapping editor on HA selectors; Phase 13.6 light lumens and temperature overrides; Phase 13.7 floor level in Settings). Earlier: 2026-11-17 (Phase 9.7 state parameters; Phase 10.3 binding suggestions; Phase 10.4 tilt conventions; Phase 10.5 second entities, louvers, appliance doors).

Status: **resolved ([D25](../decisions.md#d25-home-assistant-bindings)), implemented (Phase 8.0).** Owner decisions Q1–Q3 (2026-11-16): the builder owns what a thing is, the HA mapping owns what it is doing now; bindings, conditions, and bubbles are authored in an Edit mode inside the [HA viewer](viewer-mvp.md) and stored in the installation-global preferences; conditions are a subset of Home Assistant's dashboard card conditions. The schema details, the nesting limit, and the editor layout are review inference; timings and limits are implementation conventions. Active work under [D23](../decisions.md#d23-ha-viewer-mvp) (viewer only; the builder has no HA UI).

## Model

One **binding** per bindable thing, keyed by the builder's stable ID, grouped by kind per house. Moving or renaming a thing keeps its binding; deleting it leaves an orphan binding that is ignored. A binding with nothing set is not stored.

| Kind | Key | Fields | Consumed by |
| --- | --- | --- | --- |
| `lights` | light ID | `stateEntityId?`, `tapAction?`, `holdAction?`, `doubleTapAction?`, `visibleWhen?` | 8.0: light state, gestures; `visibleWhen` false hides the light (Phase 21, owner: off, its fixture not drawn or picked, no gestures; before: drawn off) |
| `objects` | Areable object ID, or a door's or window's (wall opening) ID | same as lights, plus `states?` ([state parameters](#state-parameters)) | 8.3 object actions (Phase 21: HA's own defaults for its entity, see [viewer gestures](viewer-mvp.md#bindings-and-edit-mode); `visibleWhen` false: the object ignores gestures), 8.8 [TV screens](#tv-screens) (`stateEntityId` a `media_player`), 9.7 state parameters (doors, windows, blinds, appliance doors), 10.1 [opening gestures](#opening-gestures) |
| `effects` | ambient effect ID (`fx_`) | `visibleWhen?`, `variants?` | 8.4: [effects in the viewer](#effects-in-the-viewer) |
| `areas` | area ID | same as lights, plus `presence?` ([presence](#presence)) and `haAreaId?` (the HA area this room is, owner 2026-11-17; absent = matched automatically; a binding with only it is stored) | 8.1 room picking, 8.6 presence, suggestions/pickers and tab matching |
| `bubbles` | `{ rooms: { <area ID>: RoomBubble[] }, placed: { <bubble ID>: PlacedBubble } }` | see [bubbles](#bubbles) | 8.5 room and placed bubbles |
| `floors` (optional) | floor ID | `presenceWhen?` ([floor presence gate](#floor-presence-gate)) | presence / intrusion sweeps of the floor's rooms |

- **`stateEntityId`** (`string | null`, optional): the entity whose state the thing shows, and the default entity of its actions and of new condition tests. Null and absent both mean none (null is today's stored "unmapped" value).
- **`tapAction`, `holdAction`, `doubleTapAction`**: Home Assistant dashboard action objects as HA's action editor writes them (`{ action: "toggle" }`, `{ action: "more-info" }`, `{ action: "perform-action", perform_action, target, data }`, `navigate`, `url`, `none`); their other fields belong to HA and are kept as given ([actions](https://www.home-assistant.io/dashboards/actions/)). Gesture timing and defaults: [viewer MVP](viewer-mvp.md#bindings-and-edit-mode).
- **`visibleWhen`** (a [condition](#conditions), optional): the thing is shown and reacts only while it holds; absent means always. The condition editor offers **Always** (no condition), **Never** (stored as `{ "condition": "or", "conditions": [] }`, which no state meets, in HA's own card conditions too; Phase 21, owner: a fixed setting needs no entity) and **When…** (tests).
- **`variants`** (effects only for now, at most 8): `[{ when: Condition, …overrides }]`; the **first** variant whose `when` holds changes the look, none holding keeps the authored look. Effect overrides: `kind` (`swirl` | `vapour`), `color` (sRGB 0–255), `direction` (`up` | `forward`), `sizeMm` (100–3000). Absent overrides keep the authored value. Other kinds get variants when a milestone needs them, each with its own minimal override shape. Doors and blinds (Phase 9.7) did not need variants: they drive their template's state parameters ([state parameters](#state-parameters)).

Lights have no variants: what the lamp is (fixture, type, lumens, beam, colour capability, default temperature) is builder data in `house.json`; what it is doing now (on/off, brightness, colour within its capability) comes from its entity (Q1; [light state](light-state.md#card-boundary-and-precedence)).

- **`lumens`, `kelvin`** (lights only, optional; Phase 13.6, D25 Q1 amended 2026-11-18): installation-global re-adjustments of two house values without editing `house.json`, set in the light's Settings editor (**Light output**). `lumens` (above 0, at most 200 000) replaces the light's full output; the entity's brightness still scales it, once. `kelvin` (1500–9000 K; the editor steps by 50 K) replaces the default colour temperature, and applies only while the bound entity is no colour light: one that reports or supports a colour mode with a colour (`color_temp`, `hs`, `rgb`, `rgbw`, `rgbww`, `xy`) draws its live colour or temperature, and the field shows disabled with that reason. Absent keeps the house value; **Reset to the house value** removes the field. A light with only these fields set is kept when the bindings are pruned. Details: [light state](light-state.md#lumens-and-temperature-overrides).

```json
{
  "lights": {
    "l_6c2m9q0x1b": {
      "stateEntityId": "light.kitchen",
      "holdAction": { "action": "more-info" },
      "visibleWhen": { "condition": "state", "entity": "input_boolean.show_kitchen", "state": "on" }
    }
  },
  "objects": {
    "o_k2v9x7q1mz": { "stateEntityId": "climate.living_room", "tapAction": { "action": "more-info" } }
  },
  "effects": {
    "fx_p3n8c2w0ra": {
      "visibleWhen": {
        "condition": "state",
        "entity": "climate.living_room",
        "attribute": "hvac_action",
        "state": ["cooling", "heating"]
      },
      "variants": [
        {
          "when": { "condition": "state", "entity": "climate.living_room", "attribute": "hvac_action", "state": "heating" },
          "color": [226, 72, 52]
        }
      ]
    }
  },
  "areas": {}
}
```

## State parameters

Phase 9.7 (owner: doors, windows, and blinds get their Home Assistant binding with their states). A template marks the parameters that are live state with `x-homeplan.state: true` ([object templates: parameters](../builder/features/object-templates.md#parameters), [D26](../decisions.md#d26-self-describing-parametric-templates)): an open angle, a window's open mode, blinds closed, an appliance door, a toilet lid. An object binding may drive any of them from an entity. The app knows no door or blind: the template declares the parameter (its type, choices, limits), the binding maps an HA value onto that type. Wall openings (doors, windows) are bound under `objects` by their opening ID, like Areable objects.

`objects[id].states` (optional; bindings written before 9.7 stay valid) is keyed by the **parameter name**, one mapping per parameter:

| Field | Type | Meaning |
| --- | --- | --- |
| `entity` | entity ID, optional | the entity read; absent: the binding's `stateEntityId` |
| `attribute` | attribute name, optional | read this attribute; absent: the state (as the [conditions'](#conditions) `attribute` extension) |
| `map` | one of the four below | how the HA value becomes the parameter's value |
| `fallback` | `{ entity?, attribute?, map }`, optional (10.5) | a second entity, read only when the first gives no value (no match, no `otherwise`, unavailable); one level (a fallback has no fallback of its own) |

| `map.kind` | Fields | Result |
| --- | --- | --- |
| `table` | `cases: [{ state, value }]` (at most 16; `state` a string or a list), `otherwise?` | the value as text (numbers and booleans as text, as conditions compare) equals one of a case's states → its `value`; else `otherwise`; without `otherwise` the stored value stays |
| `threshold` | `at`, `atOrBelow`, `above` | a number at or below `at` → `atOrBelow`, above it → `above` |
| `linear` | `from: { start, end }`, `to: { start, end }` | a number mapped linearly from `from` onto `to`, clamped to `to` (`start` may be above `end`) |
| `band` (10.4) | `from`, `to`, `inside`, `outside` | a number from `from` to `to` (inclusive, either order) → `inside`, any other number → `outside` (a venetian blind: open around 50) |

Values are booleans, numbers, or text (a choice). A mapped value is checked against the parameter it drives (`stateParameterValue`): it must have the parameter's type and, for a choice, be one of its choices; numbers are clamped to the parameter's `minimum` / `maximum`. **No usable value keeps the stored value:** no entity, an entity HA does not know, a state of `unavailable` or `unknown`, a missing or null attribute, a non-number for `threshold` / `linear`, a `table` without a match or `otherwise`, a value of the wrong type, or a mapping for a parameter the template does not (or no longer) declare. `visibleWhen` does not gate state parameters (it gates gestures).

```json
{
  "objects": {
    "o_fr0ntd00r1": {
      "states": {
        "openAngleDeg": {
          "entity": "binary_sensor.front_door",
          "map": { "kind": "table", "cases": [{ "state": "on", "value": 90 }], "otherwise": 0 }
        }
      }
    },
    "o_k1tchenw1n": {
      "stateEntityId": "binary_sensor.kitchen_window",
      "states": {
        "openMode": { "map": { "kind": "table", "cases": [{ "state": "on", "value": "swing" }], "otherwise": "closed" } },
        "blindsClosed": {
          "entity": "cover.kitchen_blinds",
          "attribute": "current_tilt_position",
          "map": { "kind": "threshold", "at": 50, "atOrBelow": true, "above": false }
        }
      }
    },
    "o_ba1c0nyd0r": {
      "states": {
        "openPct": {
          "entity": "cover.balcony_door",
          "attribute": "current_position",
          "map": { "kind": "linear", "from": { "start": 0, "end": 100 }, "to": { "start": 0, "end": 100 } }
        }
      }
    }
  }
}
```

- **Door contact** (`binary_sensor.front_door`, `on` = open): `openAngleDeg` 90 while `on`, 0 otherwise (a value table; the two values are the open and closed angles).
- **Window contact** (`binary_sensor.kitchen_window`): `openMode` `swing` while `on`, else `closed` (a choice from a table). A separate tilt sensor or a three-state handle: see the 10.5 examples below.
- **Blinds** (`cover`): `blindsClosed` from `current_tilt_position` in one of the [tilt conventions](#tilt-conventions); HA's standard (0 shut … 100 open, so at or below 50 reads closed) is the default.
- **Locks do not open doors.** `lock.front_door` `unlocked` leaves the door closed; a lock binds a state parameter only when the owner wants its state shown: a lock that reports `open` (unlatched) can drive the open angle (`open` → 90, else 0), or a template choice parameter (for example a lock indicator with choices `locked` / `unlocked`) can show the lock state with a table.

**In the viewer:** the evaluator subscribes to each mapping's entity (`entitiesOf` includes them) and reports the object binding when one changes; the viewer computes the mapped values (`liveStateValues`) and the house viewer draws them instead of the stored parameter values (`parametersWithLiveStates`, checked against the template's declared state parameters, `templateStateParameterInfo`). Only an instance whose drawn parameters change gets a new parameter object, so the builder's instance layer re-resolves only that instance (`templateResize`, the same rules as the builder); the change animates (Phase 10.2, below), and when it ends no further frames are rendered. `house.json` is never written. Pure helpers: [`shared/domain/homeAssistant/stateParameters.ts`](../../shared/domain/homeAssistant/stateParameters.ts); schemas `HaStateMapping`, `HaStateMap` in [`shared/domain/schemas/homeAssistant.ts`](../../shared/domain/schemas/homeAssistant.ts).

**Animated state changes (Phase 10.2):** a changed instance eases from what is on screen to the new values over 600 ms (sine ease in and out) instead of jumping. It is generic: the animation blends **poses**, not parameters. The template's pose rules (`visible`, `rotate` angle and pivot offsets, `translate`) resolve under each weighted parameter set (`templateResize` option `pose`, [object templates: formulas](../builder/features/object-templates.md#formulas)) and the numbers they give are averaged by weight; the layout (size, contact, opening) comes from the new parameters, which pose rules never change. So a number state parameter (an open angle, `openPct`) eases directly, and a boolean or choice eases through the numbers its formulas give (`blindsClosed ? -80 : 0` eases the slats from 0° to −80°; a window's `openMode` swing eases `mainSwingDeg`). A part whose visibility differs between the two poses switches at the midpoint (it is shown while the sets showing it weigh at least half). A change that arrives mid-animation starts from the blend on screen (retarget), and any number of instances animate at once. An instance seen for the first time (the house loads, a template finishes loading) shows its state at once, as does every change when the system asks for reduced motion (`prefers-reduced-motion: reduce`). Framework-free: `src/renderer/stateAnimation.ts` (`createStateAnimator`, `blendPose`, `easeInOut`) and `InstanceLayer.setPoses` (each frame the animating instances get new geometry in their existing meshes; materials stay; an instance is rebuilt only at a visibility switch); the house viewer wires them in (`animateStates`, `stepStates`; one animation on the frame scheduler's `states` channel, Phase 15.3, so camera gestures never stop it), so the builder could use the same. Limit: a template that carries the same part on separate nodes for different states (window-casement's in-frame slats vs. the slats on the swung sash) switches those nodes at the midpoint, so the blinds jump from the frame to the sash halfway through a swing.

**Editor defaults** (`defaultStateMapping(domain, parameter, attributes)`, by the entity's domain and, where they matter, its attributes; the owner changes them; implementation conventions):

- `cover` → a boolean from `current_tilt_position` in HA's tilt convention (at or below 50 → true = closed), a number linearly from `current_position` 0–100 onto the parameter's range (a motorised sliding door), a choice `open` / `opening` → the last choice that is not the default.
- `lock` → only `open` counts (an open angle's maximum, a boolean true, the last other choice), `unlocked` does not.
- `climate` with a number (10.5, an AC's louver) → its `swing_mode` attribute through a value table built from `swing_modes` (`optionNumbers`): options that stop the louver (`off`, stop, fixed, none, closed) → the minimum, options that keep it swinging (`on`, swing, auto, both, vertical, horizontal, all, full) → the maximum, any other options (named positions) in their order spread evenly over the range (above the minimum when a stop option takes it). Without `swing_modes`: `off` → the minimum, otherwise the maximum.
- `input_select` / `select`, and a `sensor` with `options` (an enum such as a window handle; 10.5) → for a choice parameter each option to the choice it means (`choiceForOption`: the same value or title in any case; a value that starts the option, so `tilted` → `tilt`; `open` / `on` → the last choice that is not the default; `closed` / `off` / `shut` → the default; other options keep the stored value); for a number the options through `optionNumbers` (a select of louver positions). A select without `options` maps each choice to itself.
- `sensor` / `input_number` / `number` with a number → linearly 0–100 onto the range.
- Anything else (`binary_sensor`, `switch`, `input_boolean`, …) → `on` / `open` gives the maximum (an angle: at most 90°, 10.5, so a washer's 110° door opens like a door), true, or the last other choice; everything else the minimum, false, or the default.
- **A second entity** (`secondSource`, a choice parameter, 10.5): its domain's default with an on / off table's "on" turned to the last choice the first mapping does not give yet (the window's open sensor gives `swing`, so the tilted sensor gives `tilt`); the first mapping's `otherwise` is removed so it falls through, and removing the second entity puts the second's `otherwise` back.

**Examples per source (10.5):**

```json
{
  "objects": {
    "o_ba1c0nyd0r": {
      "states": {
        "openPct": { "entity": "binary_sensor.balcony_door", "map": { "kind": "table", "cases": [{ "state": ["on", "open"], "value": 100 }], "otherwise": 0 } }
      }
    },
    "o_s1id1ngm0t": {
      "states": {
        "openPct": { "entity": "cover.balcony_sliding_door", "attribute": "current_position", "map": { "kind": "linear", "from": { "start": 0, "end": 100 }, "to": { "start": 0, "end": 100 } } }
      }
    },
    "o_k1tchenw1n": {
      "states": {
        "openMode": {
          "entity": "binary_sensor.kitchen_window",
          "map": { "kind": "table", "cases": [{ "state": ["on", "open"], "value": "swing" }] },
          "fallback": {
            "entity": "binary_sensor.kitchen_window_tilted",
            "map": { "kind": "table", "cases": [{ "state": ["on", "open"], "value": "tilt" }], "otherwise": "closed" }
          }
        }
      }
    },
    "o_ch1ldw1ndw": {
      "states": {
        "openMode": {
          "entity": "sensor.children_window_handle",
          "map": { "kind": "table", "cases": [{ "state": "closed", "value": "closed" }, { "state": "tilted", "value": "tilt" }, { "state": "open", "value": "swing" }] }
        }
      }
    },
    "o_a1rc0nd1t1": {
      "stateEntityId": "climate.living_room_ac",
      "states": {
        "louverAngleDeg": {
          "attribute": "swing_mode",
          "map": { "kind": "table", "cases": [{ "state": "off", "value": 0 }, { "state": "vertical", "value": 60 }, { "state": "horizontal", "value": 60 }, { "state": "both", "value": 60 }] }
        }
      }
    },
    "o_a1rc0nd1t2": {
      "states": {
        "louverAngleDeg": {
          "entity": "select.living_room_ac_horizontal_position",
          "map": { "kind": "table", "cases": [{ "state": "off", "value": 0 }, { "state": "1", "value": 12 }, { "state": "2", "value": 24 }, { "state": "3", "value": 36 }, { "state": "4", "value": 48 }, { "state": "5", "value": 60 }, { "state": "swing", "value": 60 }] }
        }
      }
    },
    "o_wash1ngm4c": {
      "states": {
        "doorOpenDeg": { "entity": "binary_sensor.washing_machine_door", "map": { "kind": "table", "cases": [{ "state": ["on", "open"], "value": 90 }], "otherwise": 0 } }
      }
    }
  }
}
```

- **Sliding door** (`openPct`, 0 closed … 100 open): a contact sensor gives 100 while open and 0 while closed (it cannot tell how far); a motorised door's `cover` gives its `current_position` linearly.
- **Window, one contact:** open → `swing`, else `closed`. **Two sensors** (an "open" and a "tilted" contact): the open sensor first (`swing`, no otherwise), the tilted sensor as the `fallback` (`tilt`, otherwise `closed`): both off → closed, tilted → tilt, open → swing (also while the tilted sensor is on). An unavailable open sensor falls through to the tilted one. **A three-state handle** (`sensor` enum or `select` with `closed` / `tilted` / `open`): one table from its options.
- **AC louver** (`louverAngleDeg`, 0–60°): from the climate entity's `swing_mode` (swinging shows fully open; `off` closed; named positions spread), or from a `select` of positions such as "AC Horizontal Position" (`off`, `1`–`5`, `swing` → 0, 12, 24, 36, 48, 60, 60). A select whose options are all positions spreads them over the whole range (`top` / `middle` / `bottom` → 0, 30, 60).
- **Washer and dryer door** (`doorOpenDeg`, up to 110°): a door sensor opens it to 90° (the door default), closed 0. The toilet lid stays manual (no sensor exists for it).

### Tilt conventions

Phase 10.4. Covers report a slat tilt (`current_tilt_position`, 0–100) in different ways. A boolean state parameter read from that attribute (the built-in openings' `blindsClosed`) offers a **Tilt convention** instead of a bare threshold; each is an ordinary map, so stored bindings keep working and nothing else is stored (`tiltConventionMap`, `tiltConventionOf`, `tiltPositions` in [`stateParameters.ts`](../../shared/domain/homeAssistant/stateParameters.ts)):

| Convention | Map (for `blindsClosed`; a parameter whose name says "open" gets the values swapped) | Reads closed | Open / close slats |
| --- | --- | --- | --- |
| **0 = closed, 100 = open** (HA standard, the default) | `{ kind: "threshold", at: 50, atOrBelow: true, above: false }` | 0–50 | 100 / 0 |
| **100 = closed, 0 = open** | `{ kind: "threshold", at: 50, atOrBelow: false, above: true }` | 51–100 | 0 / 100 |
| **50 = open, 0 and 100 = closed** (venetian) | `{ kind: "band", from: 25, to: 75, inside: false, outside: true }` | 0–24 and 76–100 | 50 / 0 |

- A map that is none of these (a threshold at 40, say) shows as **Custom mapping** with the ordinary map editor; choosing **Custom mapping** also opens the editor for a convention's map. A mapping stored before 10.4 (the old default threshold) reads as the HA standard.
- **Preview:** next to the convention, "Tilt now: 37 → closed", live from the cover.
- **Tap** (an opening's default, [below](#opening-gestures)): `cover.toggle_tilt` for the standard and inverted conventions (HA flips between 0 and 100, which both read correctly). For a venetian blind (any `band` map on the tilt) toggling would go from 0 to 100, shut to shut, so the tap sets the tilt with `cover.set_cover_tilt_position`: to 0 while the tilt is inside the band (open), else to the band's middle (50); without a tilt reported it opens (50).
- **Test buttons:** where the cover's `supported_features` include setting the tilt position (`CoverEntityFeature.SET_TILT_POSITION`, 128), the State block shows **Open slats** / **Close slats** with the convention's tilts, labelled "Test on the real device: these buttons move <cover> in your home now". They call `cover.set_cover_tilt_position` at once (outside Save; nothing is stored) and report "Sent: tilt 50 to cover.…" or the error.
- **Position** (raising and lowering the blind) is not shown: the blinds stay fully lowered (Phase 9).

```json
{
  "o_d1n1ngw1nd": {
    "states": {
      "blindsClosed": {
        "entity": "cover.dining_venetian_blinds",
        "attribute": "current_tilt_position",
        "map": { "kind": "band", "from": 25, "to": 75, "inside": false, "outside": true }
      }
    }
  }
}
```

### Opening gestures

Phase 10.1. Outside Edit mode a door or window (a Wallable instance, bound under `objects` by its opening ID) takes tap, hold, and double tap like an object ([viewer: gestures](viewer-mvp.md#bindings-and-edit-mode)): its configured `tapAction` / `holdAction` / `doubleTapAction` runs, and its **Shown when** (`visibleWhen`) gates them as an object's (while it does not hold, the tap reaches the room). A gesture without a configured action takes the opening's default (`openingGestureAction`, `defaultOpeningAction` in [`stateParameters.ts`](../../shared/domain/homeAssistant/stateParameters.ts)):

- **Main entity** (`openingMainEntity`): the entity of the first state mapping (its own `entity`, else `stateEntityId`), where the blinds mapping (`blindsClosed`) counts last, since blinds are not the opening itself; else the binding's `stateEntityId`. A configured action without its own `entity` acts on `stateEntityId`, else the main entity.
- **Tap:** when the `blindsClosed` parameter is driven by a `cover` entity, `cover.toggle_tilt` on that cover (`{ action: "perform-action", perform_action: "cover.toggle_tilt", target: { entity_id } }`); for a venetian blind (a `band` map on `current_tilt_position`, 10.4) `cover.set_cover_tilt_position` instead (`data: { tilt_position }`: 0 while open, else 50; the viewer passes the live entities, `openingGestureAction(binding, gesture, getEntity)`); otherwise the main entity's more-info.
- **Hold:** the main entity's more-info (also on a blind).
- **Double tap:** nothing.
- **No main entity** (no binding, or no `stateEntityId` and no mapping with an entity) and no configured action: the opening takes no gestures and the tap falls through to its room, as before 10.1. A configured `none` takes nothing.

The parameter name `blindsClosed` is the one template convention these defaults read (the built-in openings, Phase 9); a template without it simply gets the more-info default.

```json
{
  "objects": {
    "o_fr0ntd00r1": { "states": { "openAngleDeg": { "entity": "binary_sensor.front_door", "map": { "kind": "table", "cases": [{ "state": "on", "value": 90 }], "otherwise": 0 } } } },
    "o_k1tchenw1n": {
      "states": {
        "openMode": { "entity": "binary_sensor.kitchen_window", "map": { "kind": "table", "cases": [{ "state": "on", "value": "swing" }], "otherwise": "closed" } },
        "blindsClosed": { "entity": "cover.kitchen_blinds", "attribute": "current_tilt_position", "map": { "kind": "threshold", "at": 50, "atOrBelow": true, "above": false } }
      }
    }
  }
}
```

The front door: tap and hold open `binary_sensor.front_door`'s more-info. The kitchen window: tap toggles the tilt of `cover.kitchen_blinds`, hold opens `binary_sensor.kitchen_window`'s more-info.

## Presence

A room's presence / intrusion setting (Phase 8.6, K18, owner decision Q6), `areas[areaId].presence`, optional (room bindings written before it stay valid):

| Field | Type | Meaning |
| --- | --- | --- |
| `entityId` | entity ID | the sensor: a `binary_sensor` (motion, occupancy) or an `alarm_control_panel` |
| `when` | [condition](#conditions), optional | when the room counts as active; absent: the entity's state is `on` or `triggered` |
| `corners` | `[{ x, y }]`, at most 8, optional | the sweep corners, outline corners in the area's own frame (mm); absent: the default two; empty: none (the room only tints) |

```json
{
  "areas": {
    "a_h4ll3w4y0x": {
      "presence": {
        "entityId": "binary_sensor.hallway_motion",
        "corners": [{ "x": 0, "y": 0 }, { "x": 3200, "y": 1400 }]
      }
    }
  }
}
```

- **Corners** are matched to the nearest corner of the room's current outline within 300 mm (implementation convention), so moving or turning the area keeps them; a stored corner with no outline corner near it is dropped. The default two are the corners farthest from the room's doors, or the two farthest apart in a room without doors.
- A room binding with only `presence` set is stored (the binding editor keeps it); removing the entity removes `presence`.
- Rendering, the corner picker, and the timings: [viewer MVP: presence and intrusion](viewer-mvp.md#presence-and-intrusion).

### Floor presence gate

Owner request (2026-11-18): a floor-level condition that must hold for any of the floor's rooms to sweep, for example only while the alarm is armed. It is `bindings[houseId].floors[floorId].presenceWhen`, a [condition](#conditions) (`HaFloorBinding`, `shared/domain/schemas/homeAssistant.ts`); `floors` and `presenceWhen` are optional, so bindings stored before it stay valid.

```json
{
  "floors": {
    "f_gr0und00001": {
      "presenceWhen": {
        "condition": "state",
        "entity": "alarm_control_panel.home",
        "state": ["armed_away", "armed_home", "armed_night", "armed_vacation"]
      }
    }
  }
}
```

- While `presenceWhen` does not hold, none of the floor's rooms sweeps or tints red, whatever their own presence entity says; corner picking still works. While it holds, or when it is absent, each room follows its own presence setting as before.
- The viewer evaluates it with the room presence (`presenceAllowed`, `shared/domain/homeAssistant/conditions.ts`; `intrusionRooms`, `ha-viewer/bindingEvaluator.ts`); the evaluator subscribes to its entities like any binding's, keyed `{ kind: "floors", id: floorId }`, so arming or disarming updates the sweeps at once. A room is mapped to its floor through the house document.
- Edited on the Settings **Floor node** under **Presence and intrusion** (the condition editor, **Always** when unset); a floor without a gate is not stored, and removing the last gate sends `floors: {}`.

## Bubbles

Phase 8.5, owner decision Q4: two kinds, one design ([viewer: bubbles](viewer-mvp.md#bubbles)). A bubble is a clickable binding (its entity, an action per gesture, `visibleWhen`) plus what it shows. Bubble IDs are `hb_` + 10 characters (`createId("hb")`), made by the viewer.

| Field | Values | Meaning |
| --- | --- | --- |
| `preset` | `temperature`, `humidity`, `light`, `presence`, `state`, `custom` | What it is for: sets the default icon (`mdi:thermometer`, `mdi:water-percent`, `mdi:lightbulb`, `mdi:motion-sensor`, `mdi:information-outline`, `mdi:circle-medium`), the format a new bubble starts with (`value`, `value`, `icon`, `icon`, `state`, `value`), and the light toggle's tap default |
| `stateEntityId?` | entity ID or null | The entity it shows, the default entity of its actions, and of new condition tests |
| `attribute?` | attribute name | Show this attribute instead of the state (no unit is added) |
| `icon?` | `ha-icon` name | Absent: the entity's `icon` attribute, else the preset's |
| `format` | `value`, `state`, `icon` | The value with `unit_of_measurement` (numbers to at most one decimal), the state in words (`not_home` → "Not home"), or the icon alone; a missing entity reads "Unavailable" |
| `style?` | `bubble` (absent), `bare` | A pill on the card colour, or icon (and text) without background |
| `tapAction?`, `holdAction?`, `doubleTapAction?` | HA action objects | Unset: tap opens the entity's more-info (a camera's live view), a `light` preset's tap toggles; hold and double tap do nothing |
| `visibleWhen?` | a [condition](#conditions) | Drawn and reacting only while it holds |

- **Room bubbles** (`rooms[areaId]`, at most 12 per room, in row order): each also has `id`. Drawn above the room, centred, in a row along its longest side, only while their condition holds.
- **Placed bubbles** (`placed[bubbleId]`): each also has `anchor`: `{ kind: "point", areaId, positionMm: { x, y, h } }` (plan mm on the shown floor), `{ kind: "object", objectId }`, or `{ kind: "light", lightId }`; an anchored bubble moves with its object or light. Always drawn unless `visibleWhen` fails. A bubble whose room, object, or light is missing or hidden is not drawn (and kept).
- Evaluation: the evaluator keys bubbles `{ kind: "bubbles", id }` and subscribes to their entities like any binding (`bubbleShown(bubble)`).

```json
{
  "bubbles": {
    "rooms": {
      "a_living0001": [
        { "id": "hb_t3m9q2x8ka", "preset": "temperature", "stateEntityId": "sensor.living_room_temperature", "format": "value" }
      ],
      "a_utility001": [
        {
          "id": "hb_w8c1n4v7pe",
          "preset": "state",
          "stateEntityId": "sensor.washing_machine_power",
          "icon": "mdi:washing-machine",
          "format": "value",
          "visibleWhen": { "condition": "numeric_state", "entity": "sensor.washing_machine_power", "above": 5 }
        }
      ]
    },
    "placed": {
      "hb_c5d2r9k0ty": {
        "preset": "custom",
        "stateEntityId": "camera.front_door",
        "icon": "mdi:cctv",
        "format": "icon",
        "style": "bare",
        "holdAction": { "action": "perform-action", "perform_action": "light.toggle", "target": { "entity_id": "light.porch" } },
        "anchor": { "kind": "point", "areaId": "a_hall000001", "positionMm": { "x": 1200, "y": 300, "h": 2100 } }
      }
    }
  }
}
```

Schemas: `HaRoomBubble`, `HaPlacedBubble`, `HaBubbleAnchor`, `HaHouseBubbles` in [`shared/domain/schemas/homeAssistant.ts`](../../shared/domain/schemas/homeAssistant.ts); content and defaults (pure): [`shared/domain/homeAssistant/bubbles.ts`](../../shared/domain/homeAssistant/bubbles.ts).

## Conditions

A subset of Home Assistant's [dashboard card conditions](https://www.home-assistant.io/dashboards/conditional/#card-conditions) with HA's own field names (Q3), so a condition can be copied between a Lovelace card and the viewer:

| Condition | Fields | Holds when |
| --- | --- | --- |
| `state` | `entity`, `state` (a string or a list) | the state is one of the values |
| `state` | `entity`, `state_not` (a string or a list) | the state is none of the values |
| `numeric_state` | `entity`, `above?`, `below?` (numbers) | the state is a number strictly above `above` and strictly below `below` |
| `and` | `conditions` | every inner condition holds (an empty list holds) |
| `or` | `conditions` | at least one inner condition holds (an empty list does not) |

- **`attribute` (extension):** `state` and `numeric_state` take an optional `attribute`; the test then reads that attribute instead of the state (for example a climate entity's `hvac_action` is `cooling`). HA's card conditions have no attribute field; HA's automation conditions do, with the same name. A number or boolean attribute compares as text (`brightness` `180` equals `"180"`; `false` equals `"false"`); a missing or null attribute equals nothing, so `state_not` holds.
- **Missing and unavailable entities** (as HA's frontend): an entity HA does not know reads as `unavailable`, so `state: "on"` fails and `state_not: "on"` holds. A state that is not a number (`unknown`, `unavailable`, empty) fails every `numeric_state` test.
- **Not in the subset:** `screen`, `user`, `location`, `time`, `not`, and entity IDs as `above`/`below`. `state` and `state_not` together are refused (HA allows one).
- **Nesting** (implementation convention): up to three levels, a group inside a group (`or` of `and`s, for example). The schema is written out to that depth rather than as a cyclic schema, so the preferences schema stays one plain JSON Schema.

Schema: `HaCondition` in [`shared/domain/schemas/homeAssistant.ts`](../../shared/domain/schemas/homeAssistant.ts).

## Evaluation

`shared/domain/homeAssistant/conditions.ts` is pure (no HA, no DOM):

- `evaluateCondition(condition, getEntity)`: whether it holds; `getEntity(entityId)` returns `{ state, attributes }` or undefined.
- `isShown(binding, getEntity)`: no `visibleWhen`, or it holds.
- `activeVariant(binding, getEntity)`: the first variant whose `when` holds, or null.
- `presenceActive(presence, getEntity)`: whether a room's presence holds (its `when`, else `presenceCondition`: the entity is `on` or `triggered`).
- `entitiesOf(binding)` / `conditionEntities(condition)`: every entity it reads (the state entity, `visibleWhen`, each variant's `when`, a room's presence entity and condition), for subscriptions. Action targets are read only when the action runs.

In the viewer, `ha-viewer/bindingEvaluator.ts` (`createBindingEvaluator(store)`) is the one service every consumer uses (lights now; objects, effects, bubbles, and presence in 8.3–8.6): `setBindings` subscribes **once per entity** any binding of the shown house uses (`hassStore.subscribeEntity`); when entities change it reports the bindings that depend on them, coalesced per task, and answers `shown(kind, id)`, `effectVariant(effectId)`, and `presenceActive(areaId)` from the live states. It also subscribes to the entities of each floor's [presence gate](#floor-presence-gate) (keyed `{ kind: "floors", id }`); `intrusionRooms(bindings, floorOf, lookup)` gives the rooms that sweep now. Nothing re-evaluates on unrelated entity changes.

**Only the shown floor is live** (Phase 16.3, [floor switch](viewer-mvp.md#floor-switch-transition)): the viewer hands the evaluator `floorBindings(bindings, shownFloor)` (`ha-viewer/floorNavigation.ts`), the bindings of what the shown floor holds: its lights, objects with their doors and windows, those objects' effects, its rooms (with presence), its room bubbles, placed bubbles anchored on its lights, objects, or rooms, and its own presence gate. A floor switch therefore replaces the subscriptions: the departing floor's entity listeners are dropped (HA's global state delivery and entities the destination also uses are unaffected, since the evaluator keeps one subscription per entity still used), and the destination's states, effects, bubbles, and sweeps are evaluated from HA's current state, never replayed. The whole-house view (Phase 18.1, which draws every floor complete) follows `houseBindings(bindings, floors)`: the lights and the objects, doors and windows of every floor (lamp states and live state parameters), and nothing else (no effects, rooms, bubbles, presence or gates). Settings still edits, saves, and lists every binding of the house; only the live evaluation is per floor.

### Effects in the viewer

Phase 8.4 (K1, K2, K10, K12). The viewer hands every bound effect's live state to the builder's effects layer (`setLive` in `src/renderer/effectsLayer.ts`, `setEffectStates` on `HouseViewer`):

- **Active** while its `visibleWhen` holds (absent: always) and the authored `enabled` is on. An inactive effect is hidden, has no timer, and requests no frames; when no effect is active the layer schedules nothing and the viewer renders only on camera, light, or house changes.
- **Look:** the first variant whose `when` holds overrides `kind`, `color`, `direction`, and `sizeMm`; none holding keeps the authored look. Variants do not activate an effect: to show nothing while idle, set **Runs when** (for example `hvac_action` is `cooling` or `heating`) and use variants only for the look.
- **Timing:** becoming active, or a new look while active, plays the effect once at once; then it keeps its 20 s cycle (its own phase). Becoming inactive mid-run hides it at once.
- **No binding** (no `effects[id]`): the effect plays as authored, every 20 s, as before Phase 8 (the builder never sets live states and keeps its own play / pause).
- **Re-evaluation:** the evaluator's change report (one subscription per entity) recomputes the bound effects whenever an entity they read changes; unrelated entities do nothing.

Examples: an AC's swirl with Runs when `climate.living_room` `hvac_action` is `cooling` or `heating`, variants `cooling` → blue `[56, 140, 236]` and `heating` → red `[226, 72, 52]` (idle and off show nothing); a radiator's swirl with Runs when `numeric_state` of `sensor.radiator_flow_temperature` above `35`.

## TV screens

Phase 8.8 (owner K17). An object shows what its TV is running when its template declares a [screen](../builder/features/object-templates.md#screens) and its binding's `stateEntityId` is a `media_player` entity. No new binding fields: the TV is bound in Edit mode like any object.

- **Lit** while the player's state is `on`, `playing`, `paused`, `idle`, or `buffering` and the binding's `visibleWhen` holds; `off`, `standby`, `unavailable`, `unknown`, a missing entity, or a failing `visibleWhen` show the authored dark screen.
- **Label (15.2, owner 2026-11-18; `ha-viewer/tvLabel.ts`, pure):** the first that exists of: the **running app** (`app_name`; else `app_id`), the **channel** (`media_channel`; else `media_title` when `media_content_type` is `channel`), the **input** (`source`, e.g. HDMI 1), else a neutral **On**. A package id (in `app_id`, or an `app_name` that is itself one) is looked up in a small data table of common Android TV / Google TV / Fire TV packages (Netflix, YouTube, YouTube Kids, Prime Video, Disney+, HBO Max, Apple TV, Spotify, Plex, Kodi, Twitch, VLC, Google Play Movies, Live Channels, Pluto TV, Viaplay, SkyShowtime, TiviMate, …; an exact package or a prefix followed by a dot; extend `knownApps`), and an unrecognised one is tidied, never shown with dots: the last non-generic segment, capitalised (`com.example.myapp` → "Myapp"). A generic source (`TV`, `Live TV`, `Antenna`, …) is used only when nothing better exists.
- **Picture:** the entity's `entity_picture` (the app icon or the artwork; HA serves it relative to its own origin, usually `/api/media_player_proxy/…?token=…`). It is resolved against the page (inside HA that is HA's origin, so it is same-origin), fetched with `fetch` and decoded, so the texture is never tainted. The artwork fills the 16:9 card (cropped to cover) and the label sits on a small dark strip along its bottom edge, readable on any picture; a picture that cannot be fetched (cross-origin without CORS, an HTTP error) falls back to the label alone, and that URL is not retried in the session.
- **Label alone:** without a picture, the label centered in white on a near-black 16:9 card (shrunk to fit).
- **Fit:** contain, centered, at most 94 % of the screen's width and height; unlit and not tone mapped (reads in the dark and in daylight); casts and receives no shadows; it is part of the object (it hides, reflects, and is picked with it). Renderer side: `createScreenLayer` (`src/renderer/screenLayer.ts`) and `InstanceLayer.screen`; HA side: `createTvScreens` (`ha-viewer/tvScreens.ts`).
- **On demand:** the screen is re-evaluated only when its binding's entities change (the evaluator), and a picture is loaded and a frame rendered only when what it shows changes (the picture URL, the text, or lit/dark); volume or position updates do nothing. No animation.
- **Not yet:** app icons for players that report an app without a picture (the label shows instead), and fading the picture with the room cutaway (8.2).

## Storage and migration

**Production integration:** [D27](../decisions.md#d27-production-ha-viewer-and-local-snapshots) moves production bindings, dashboard and viewer setup to HA storage, with [one-time import and conflict-aware writes](production-integration.md#one-time-configuration-migration). Existing HA values/empty maps win; subsequent house Upgrade never reapplies the seed. The unified House setup DEV MODE for code/data also keeps bindings/settings in HA: remote house refreshes never reload or write back binding preferences, and the same stable IDs retain mappings across local/remote selection. The binding schemas, stable IDs and changed-kind merge semantics remain shared. The preferences rules below describe the current standalone dev adapter.

HA configuration, never builder data: `preferences.homeAssistant.bindings[houseId] = { lights, objects, effects, areas, bubbles, floors? }` in the installation-global [preferences](../architecture/application-preferences.md) (Q2, [D12](../decisions.md#d12-user-identity-and-access)); `house.json` stays free of HA data ([D23](../decisions.md#d23-ha-viewer-mvp)).

- **Migration (additive, `schemaVersion` stays 1):** documents written before 8.0 have only `lights`. On read the server fills every house in with empty `objects`, `effects`, and `areas` (`migrateStoredBindings`, `shared/domain/homeAssistant/bindings.ts`); light bindings pass through unchanged (`{ stateEntityId, tapAction?, holdAction?, doubleTapAction? }` is still a valid light binding). Phase 8.5 is the same kind of additive step: a house without `bubbles` (or with only one of `rooms` / `placed`) gets the missing parts empty.
- **10.4 / 10.5 (additive):** the `band` map kind and a mapping's optional `fallback` are new union members and fields; every stored mapping stays valid and reads as before.
- **9.7 state parameters (additive):** `states` is an optional field of an object binding; stored documents stay valid and the merge is unchanged (a patch's `objects` replaces that house's objects whole). The binding popup sends `objects` with each binding's `states` as edited.
- **8.6 presence (additive):** `presence` is an optional field of a room binding, so stored documents stay valid and the server merge is unchanged: a patch's `areas` replaces that house's rooms whole, presence included. Presence is edited in Settings (Phase 10.9) and saved with its Save, which sends `areas` when a room changed.
- **Patch:** `PATCH /api/preferences` with `homeAssistant.bindings: { <houseId>: { <kind>?: … } }` merges by house and kind: each kind given (`lights`, `objects`, `effects`, `areas`, `bubbles`, `floors`) replaces that kind of that house whole; other kinds and houses are kept (`mergeBindings`, used by the server and the builder's preferences client). So a pre-8.0 client that sends only `lights` cannot erase the other kinds. Settings' Save (Phase 10.9, [saving](#saving)) sends only the kinds that changed, `bubbles` included when a room's bubble list changed; the bubble popup (a bubble tapped in Edit mode, or a placed bubble dragged) sends only `bubbles` at once.
- **Floor presence gate (additive, owner 2026-11-18):** `floors` is an optional kind of a house's bindings and `presenceWhen` an optional field of a floor binding. Stored documents without it stay valid; migration keeps a stored `floors` and adds none; a patch's `floors` replaces that house's floors whole and a patch without it keeps them (`mergeBindings`; the HA integration's merge spreads the given kinds the same way and validates with the generated schema). Snapshots and binding seeds carry it inside the house's bindings unchanged.
- **10.9 (no schema change):** Settings saves the same keys in the same shapes; only when they are written changed (one patch at Save instead of instant room-panel saves).
- **13.6 light overrides (additive):** `lumens` and `kelvin` are optional fields of a light binding, so stored documents stay valid and the merge is unchanged (a patch's `lights` replaces that house's lights whole). The HA integration validates them with the same generated schema.

## Editor

**Phase 11 integration setup:** House setup is part of the Settings screen's **House** node (owner, 2026-11-17: one Settings, no second sidebar). With no selected house, Setup your home opens the same Settings with only the House node. Use this house loads the house and Settings reopens on its House node with the new house's tree; no page reload. The single URL/DEV MODE, per-house Upgrade and Upgrade panel are owned by [production integration](production-integration.md#floor-builder-connection-and-house-selection). Unsaved settings are saved (after a confirm) or the house change is cancelled.

The viewer's light mapper became the binding editor (Q2):

- **Edit mode:** the pencil icon button in the viewer's top bar toggles it (highlighted while on). In Edit mode **Settings** (formerly List) and **Done** (primary) sit in the top bar next to the pencil, with a dismissible tip below the bar (owner, 2026-11-17). In Edit mode a tap picks the bubble under it (its bubble popup), else the light, else the Areable object (`instance:<id>` under its area group), else the room (8.1 pipeline); holds and double taps do nothing and no actions run. Placed bubbles have no button since the owner removed **Add Bubble** (2026-11-17); the placing function stays ([viewer: bubbles](viewer-mvp.md#bubbles)). Any other tap opens **Settings** with the tapped thing selected (Phase 10.9). Room bubbles are added under their room in Settings.
- **Settings split screen** (Phase 10.9, owner 2026-11-17; `ha-viewer/bindingEditor.ts`): a dialog of 90 % × 90 % of the viewport. The left third is the **Settings list** (below), the right two thirds the editor of the selected node, each scrolling on its own; one **Cancel** / **Save** footer serves the whole dialog. Opened from the bar it selects the **House** node; opened by a tap in Edit mode it selects the tapped thing, opens its room and group in the tree, and scrolls its row into view (the search is focused only when Settings opens from the bar). When the dialog would be at most 700 px wide (an implementation convention, measured on the viewport), one pane shows: the list, then the editor with **Back** (the list keeps its open rooms and search).
  - **House node** (`ha-viewer/houseSettings.ts`): **Dashboard** (which HA dashboard the room cards come from; the list needs an admin, else a typed URL path; HA's `select` selector, a plain select outside HA); in the integration, **House setup** above it (`connectionSettings.ts`). For a multi-floor house, **Main view** (Phase 16.1; HA's `select` selector, a plain select outside HA): **Whole house** (default) or a floor by name, stored by floor ID in `dashboard.mainViews[houseId]`, a draft saved with Save ([main view](viewer-mvp.md#floors-and-the-whole-house)); a stored floor that no longer exists shows as Whole house. The cutaway setting and **Swap house** were removed (owner, 2026-11-17). Choosing another dashboard drops this house's room and floor tabs (they belong to the old one). Below it, **Navigation** (Phase 14.6): Trackpad, Mouse, or Touch, with a line on what the chosen one does; installation-global, a draft saved with Save, and the device default while none is chosen ([viewer navigation](viewer-mvp.md#houseviewer)).
  - **Room editor** (owner 2026-11-17 order): **Home Assistant area** (HA's `area` selector, a plain select outside HA; stored as the room binding's optional `haAreaId`; unset shows the area matched automatically, from the room's entities' area, else the HA area named like the room), **Tab** (`ha-viewer/roomTabSetting.ts`: the chosen dashboard's tabs, or **Match by name**: the tab named like the room, else like its HA area) **Columns** (the room cards' width) and **Show room title** (14.4: the room's name above its cards; off by default), then the room's binding (**Suggest for this room**, **Entity and actions**, **Shown when**), **Room bubbles** (`roomBubbles.ts`; the kind to add is HA's `select` selector), and **Presence and intrusion** (`presenceSetting.ts`: entity and Active when, its title and description styled exactly like the editor's other section titles; the sweep corners are chosen with the gear in the top bar while the room is open, [viewer: presence](viewer-mvp.md#presence-and-intrusion)).
- **Thing editor** (a light, object, door, or window; before 10.9 the binding popup): the thing's name and kind ("Light in Kitchen"). Sections: **Entity and actions** (HA's `ha-form` with the `entity` selector, limited to `light` for lights, and `ui_action` for click, long click, and double click); for objects, doors, and windows **State** (9.7): one block per state parameter the template declares (title, help text, type in words, and **Now:** the mapped value live, or "stored value"), each with an Entity (HA's `entity` selector; plain select outside HA; empty = not driven; choosing one starts its domain's default mapping), an Attribute (empty: the state), and the Mapping (Value table with cases and Otherwise / Keep stored, Threshold, Band, or Linear range for numbers; values by the parameter's type: On / Off, a number, or the choice titles). Inside HA (Phase 13.5, owner 2026-11-18) every field of this block is an `ha-form` selector, as in the condition editor: the Attribute is HA's `attribute` selector for the entity (HA's friendly attribute names; plain text when the mapping has no entity), shown with **Mapping** (`select`) under a **Read** heading; a value table lists its **Cases**, each a row with **Remove**, **When the state (or attribute) is one of** (HA's `state` selector with `multiple`, the entity, and the attribute: the entity's states or the attribute's values) and its value, then **+ Add case** and **Otherwise** (with **Keep stored**); a threshold, band, or linear range is one form of `number` selectors and values; values are `select` selectors (On / Off, the choice titles) or `number` selectors with the parameter's limits and unit. One state is stored as text and several as a list, as before, so stored mappings load unchanged. Outside HA (the harness) the plain controls stay, with comma-separated states; a boolean read from `current_tilt_position` shows the **Tilt convention** (HA's `select` selector inside HA) with its live preview and, for a cover that can set its tilt, the **Open slats** / **Close slats** test buttons instead ([tilt conventions](#tilt-conventions), 10.4); a choice parameter has a **Second entity** (empty: none) with its own Attribute and Mapping, read when the first gives no value (10.5); **Shown when** (the condition editor); and for an object with ambient effects, **Ambient effects**: one block per effect with **Runs when** and **Variants** (each with its own condition and Kind / Colour / Direction / Size overrides; HA's `select`, `color_rgb`, and `number` selectors; Kind and Direction offer **Keep**, and the colour is set only with **Custom colour** switched on, which starts from the effect's authored colour, because HA's colour selector shows "no colour" as black, Phase 10.0). Effects are not pickable in 3D, so they are bound under their object. Changes are part of the Settings draft ([saving](#saving)).
- **Doors and windows** (9.7) are picked in Edit mode and listed under Objects, with the same editor as an object (entity, actions, **State**, **Shown when**). Outside Edit mode they take gestures (10.1, [opening gestures](#opening-gestures)); their **Shown when** gates those taps like an object's.
- **Thing editor, lights** (Phase 13.6): after **Entity and actions**, **Light output**: **Lumens** and **Temperature** (HA's `number` selectors, plain number inputs outside HA), each showing the house value until changed, with the house value and **Reset to the house value** once changed. Temperature is disabled with the reason while the bound entity is a colour light ([lights](#model)). Part of the Settings draft.
- **Floor node** (Phase 13.7, `ha-viewer/floorWidgetSetting.ts`): the shown floor, under House and above its rooms ([floor widgets](viewer-mvp.md#floor-widgets)): **Widget tab** (the chosen dashboard's tabs, or **None**, the default), **Position** (left, right, above, or below the house; right when unset) and **Columns** (1–2 beside, 1–4 above or below; changing the position clamps them). HA's `select` selectors, plain selects outside HA. Below them, **Presence and intrusion** (owner, 2026-11-18): the floor's [presence gate](#floor-presence-gate) in the condition editor (**Always** when unset), with a hint suggesting the alarm example. Both are part of the Settings draft.
- **Settings list:** the **House** node on top, then the shown floor's node (Phase 13.7: always, also for a one-floor house; its things are listed one step in under it), then every light, object, door, window, and room of the shown floor; a row selects its editor on the right (the selected row is highlighted). This is also how invisible lights without a pickable fixture are bound. Rows (Phase 10.9) show no entity text: a connected thing (an entity, a condition, states, effects, or a room's presence) has a small link icon in HA's primary colour before its name, an unconnected one no icon and no reserved space (owner, 2026-11-17). Phase 10.8 (`ha-viewer/bindingList.ts`, drawn by `bindingEditor.ts`):
  - **Search** on top, focused when the list opens (like the floor planner's object search): it matches the thing's name, its room, the entities its binding uses (state entity, state mapping entities, a room's presence entity), and those entities' friendly names, ignoring case; every word must match, from the start of a word ("door" finds "Front door" but not "indoor"), while a word with "." or "_" (part of an entity id) may match anywhere. **×** clears it; Escape clears it first (an empty search lets Escape through).
  - **Expand all** / **Collapse all** beside it (one pill of two buttons, owner 2026-11-18): Expand all opens every room and group; Collapse all closes every room (a room opened afterwards shows its groups open). While searching they act on the matches for that search only. The list is always the tree (the earlier **Tree** / **Flat** switch and the flat list were removed, owner 2026-11-18). The tree lists the rooms in floor order. A room is one line (Phase 10.9): a **chevron** button (`aria-expanded`) that only opens or closes it, then the room name, a button that selects the room (its room editor shows on the right), with a small, not bold count right after it, "(2 of 28)", over the whole room (its own binding included). There is no separate "room as an item" row. An open room shows **Lights**, **Objects**, and **Doors and windows** (only non-empty groups), each a header button with its chevron and its own count in the same small style, open by default. Walls are not bindable, so their doors and windows form their own group.
  - While searching, the rooms and groups with matches open on their own, empty ones hide, and the counts stay those of the whole group; a header closed during a search stays closed only for that search. Nothing matching shows "No matches". Clearing the search restores the user's open rooms and groups.
  - **Open rows are not remembered** (owner, 2026-11-18): opened from the bar (on the House node), the tree starts fully collapsed; opened by a tap in Edit mode, only the tapped thing's room (and group) is opened to reveal it. Open rooms and closed groups last while Settings is open. The former `localStorage` keys `homeplan.haViewer.settingsView` and `homeplan.haViewer.settingsOpenRooms` are no longer read or written.
- **Condition editor:** a list of tests matched **all** (`and`) or **any** (`or`): Test (State is / State is not / Number between), Entity (`entity` selector; a new test starts with the binding's entity), Attribute (`attribute` selector; empty tests the state), and the values (`state` selector with `multiple`) or Above / Below (`number`). A condition the list cannot show (a group inside a group) opens as JSON; **Edit as JSON** is always available and validates against the schema. A badge shows **Now: met / not met**, updated live (one subscription per entity it reads); a variant that holds now is marked "active now".
- **Change events** (Phase 10.0): the editors report changes that may clear a value (`condition-change`, `effect-change`, `states-change`, `presence-change`) as `{ value }` (`ha-viewer/events.ts`), never as a bare `undefined` detail: a `CustomEvent` turns an undefined `detail` into `null`, which the parents stored and the preferences schema rejected, so before 10.0 no condition could be added or saved. `npm run ha:conditions` checks this.
- **Outside HA** (the harness): `loadHaForm()` resolves false and every field falls back to plain controls (selects of the fake entities, text, number, and colour inputs).
- **Suggestions** (Phase 10.3, [below](#suggestions); Phase 13.5: the room checklist names each entity by its friendly name, with the entity ID as secondary text): under the Entity of a light, object, door, or window and under each state parameter's Entity, up to three small chips with the best-fitting entities' names (owner 2026-11-17: compact; the entity ID, fit, and area are in the tooltip; the chip of the entity chosen now is marked). In HA 2026+, the editor also provides HA's Lit context `"related"` to HA's own entity pickers: the selected thing's suggested entities, and its room's HA area, so HA lists them first (then the area's other entities) instead of alphabetically; older HA ignores it. One click sets the entity; for a state parameter it also starts that domain's default mapping (as choosing it in the picker does). A room's editor (tapped in Edit mode, or its name in the Settings list) starts with **Suggest for this room**: a checklist of proposed bindings for the room's doors, windows, and objects (thing · parameter → entity, with the reason), all unticked; **Tick all** / **Untick all** and **Apply N** fill the ticked ones into the draft with their default mappings. Nothing is saved until **Save**; **Cancel** discards them.

### Saving

Phase 10.9 (`ha-viewer/settingsDraft.ts`, pure, checked by `npm run ha:conditions`). In the production adapter, the same draft saves to HA with its baseline config revision; a newly fetched revision must not be attached to a stale draft. Conflicts retain the draft for explicit reload/reapply ([production configuration](production-integration.md#state-ownership)). Binding/dashboard settings remain drafts until **Save**; the separate House setup URL/DEV MODE fields save immediately. Drafts include: the house's bindings (with room bubbles, presence, and the floors' presence gates), and the dashboard fields Settings edits (`urlPath`, `areaTabs`, `areaColumns`, from 13.7 the floor widgets' `floorTabs`, `floorColumns`, `floorPositions`, and from 14.4 the room titles' `areaTitles`, and from 16.1 the main views' `mainViews`; absent and empty compare equal; an empty `mainViews` is left out of the saved dashboard rather than stored empty); **Cancel** (or ×) discards it. Settings that used to save at once from the room panel follow this rule.

- **One patch:** Save compares the draft with what Settings opened with and sends one revision-aware `PATCH /api/preferences` (`HouseSource.saveSettings`; the dev source reads the latest revision and sends it as `expectedRevision`) with only the changed keys: `homeAssistant.bindings: { <houseId>: { <changed kinds> } }` (entries with nothing set are pruned first, as before; a room with only a presence is kept) and `homeAssistant.dashboard` when one of its Settings fields changed. Nothing changed sends nothing. The comparison ignores key order.
- **Dashboard:** the stored dashboard is replaced whole, so Save writes the draft's fields over the viewer's dashboard as it is now; a room position saved from the room's gear while Settings was open (during corner picking) is kept.
- **After Save** the viewer applies the saved bindings and dashboard at once (a room's new width resizes its open room cards and the house is framed beside them again; a changed title shows at once); a reload shows the saved values. A failed save keeps Settings open with the error in its footer.

### Suggestions

Pure ranking in [`shared/domain/homeAssistant/suggestions.ts`](../../shared/domain/homeAssistant/suggestions.ts) (`suggestEntities`, `roomProposals`, `roomHaArea`, `suggestionEntities`); generic: no template, door, or blind is named, only words, types, device classes, and features. Rules and weights are implementation conventions (Phase 10.3).

- **Entities read:** every entity in `hass.states` with its friendly name, `device_class`, `supported_features`, attributes, and state, and its **HA area**: the entity registry's `area_id`, else its device's (`hass.entities[id].device_id` → `hass.devices[device].area_id`), as HA resolves it; `hass.areas` gives the names. Hidden entities and configuration or diagnostic entities (`entity_category`) are left out. Without the registries (an older HA) the area rules simply do not apply.
- **The room's HA area** (`roomHaArea`): the area of the room binding's entities (its `stateEntityId`, then its presence entity), else the HA area whose name has all the room's words (lower case, singular, "'s" and "room" ignored, so "Second bedroom" finds "second bedroom"; the shortest such name wins); else none. There is no stored room → area link.
- **What a state parameter is** (`parameterKind`, from the words of its name and title, then its type, choices, and unit, first match): blind, shade, slat, curtain, shutter → **tilt**; louver, vane, flap, swing → **swing**; unit `%`, pct, percent, position, slide → **position**; a choice parameter about open or mode, or with choices such as tilt or swing → **open mode**; an angle (`°`) or open, door, lid, ajar, raised → **contact**; anything else by its type.
- **Fit** (3 the kind of entity meant, 2 a good stand-in, 1 possible; no fit: not suggested): contact → `binary_sensor` door / garage_door / opening 3 (on a thing whose name says window: window 3 and door 1, else door 3 and window 1), a `binary_sensor` without class 1, a door-like `cover` 2, other covers, locks, `input_boolean` 1; open mode → `binary_sensor` window / opening 3, a `select` / `input_select` (or enum `sensor`) whose `options` include the choices 3 (other selects 1), door sensors and covers 1; tilt → `cover` with tilt support (`supported_features` open / close / set tilt, or a `current_tilt_position`) 3, other covers 1; swing → `climate` with `swing_modes` (or the swing feature) 3, a `select` with options named for a louver position (position, swing, louver, vane, flap, horizontal, vertical: "AC Horizontal Position"; 10.5) 3 ("positions"), other selects 2, other climate and `fan` 1; position → `binary_sensor` door / garage_door / opening 3, window 2, a `cover` with position (set-position feature or `current_position`) 3 unless it is a blind, shade, curtain, shutter, or awning (1), `sensor` / `number` 1; other types: `binary_sensor` / `input_boolean` / `switch` for booleans, `sensor` / `number` for numbers, selects for choices. **Lights:** `light` only. **An object's entity:** device domains (climate, media player, fan, vacuum, switch, cover, sensor, …) 1, raised to 3 when the name points at the domain (AC, thermostat, radiator → climate; TV, speaker → media player; fan, purifier → fan; plug → switch; …). **A door's or window's entity:** contact sensors 3, covers 2, locks 1.
- **Score:** fit × 100, + 50 in the room's HA area, + the name: each word of the thing's name found in the entity's friendly name or ID counts 12 (3 for common words such as door, window, open, light), each further word of the room's name 6, at most 36. A few synonyms are joined (entrance → front, television → tv, lounge → living). Entities whose state is `unavailable` or `unknown` come after all others; ties go by entity ID. The chip reason is the fit's label (the device class, or "blind, tilt", "swing modes", "options"), the HA area's name, and "unavailable" where it applies.
- **Suggest for this room** (`roomProposals`): every state parameter without a mapping of the room's objects, doors, and windows whose template has loaded (a note counts those still loading) gets the best entity with fit 2 or 3 that is available, does not already drive a state parameter of any thing, and is in the room's HA area or shares a distinctive word with the thing's or room's name. One entity goes to one thing at most (a thing may use it for several parameters), the best-scoring pairs first, so a bathroom door sensor goes to the bathroom door rather than to the washing machine's door.
- **Harness:** the fake `hass` carries `entities`, `devices`, and `areas` for a sample home (the front door contact and lock on one device in the second bedroom, the kitchen window, the living-room blinds cover with tilt, the AC with swing modes, and a few distractors: bathroom and balcony door contacts, an unavailable dining window, a kitchen roller blind without tilt). From 10.4 and 10.5 one fake per state source: a venetian blind in the dining room (`cover.dining_venetian_blinds`, 50 = open, set tilt position), the kitchen window's second sensor (`binary_sensor.kitchen_window_tilted`), a three-state handle in the second bedroom (`sensor.children_window_handle`, enum closed / tilted / open), a motorised sliding door (`cover.balcony_sliding_door`, `current_position`), the AC's louver select (`select.living_room_ac_horizontal_position`, off / 1–5 / swing), and the washer's door sensor (`binary_sensor.washing_machine_door`); its fake services apply `cover.toggle_tilt`, `cover.set_cover_tilt_position`, `cover.set_cover_position`, and `select.select_option`.

## Verification

- `npm run ha:conditions` (`scripts/ha-conditions.ts`): `state` / `state_not` with one and several values; missing and unavailable entities; `attribute` with string, number, boolean, missing, and null values; `numeric_state` above / below / between / strict bounds / non-numeric states; `and` / `or` including empty and nested groups; `isShown`, `activeVariant`, `entitiesOf`; schema acceptance and refusals (both `state` and `state_not`, unknown conditions, four levels); the pre-8.0 migration keeping light bindings unchanged; patch merging by kind; presence (motion on / off, alarm triggered / armed, a missing entity, an own condition, `entitiesOf`, the room schema with and without presence, nine corners refused); the floor presence gate (absent, met with an armed alarm, not met with a disarmed one; only the gated floor's rooms stop; the schema with and without `floors`; migration and patch merging keep or clear it; the Settings draft prunes an empty floor binding and sends `floors: {}` when the last gate is removed); the Settings tree's search, grouping, and counts; floors and the whole house (16.1, 16.3): Up / Down order by elevation (ties in document order), Up from the top floor to the whole house, Down disabled at the bottom floor, switch directions, the main view (default whole house, a configured floor, a deleted floor falling back, a one-floor house, per-house storage and the Settings Save leaving an empty map out, the preference and snapshot schemas), and the shown floor's live bindings (only its own lights, rooms, bubbles, and gate; none in the whole-house view). `npm run viewer:focus` checks the sweep geometry (outline corners and bisectors, default corners with and without a door, stored-corner matching, toggling, the sensor inside the walls, the ±35° swing, reduced motion, tap-to-marker picking).
- The same script checks bubbles (8.5): the migration of houses without `bubbles` or with partial ones, patches with and without `bubbles`, the schema (room and placed bubbles; an unknown anchor refused), the text (value with unit and one decimal, attribute without unit, state in words, icon only, missing entity), the icon fallback order, and the default actions. Binding suggestions (10.3): the area from the device, hidden and diagnostic entities left out, the parameter kinds, the door, window, open mode, blinds, louver, and slide rankings, unavailable last, unfit entities never suggested, name similarity without an area, an object's and a light's entity, the room's HA area by entity and by name, and the room proposals (one entity per thing, mapped parameters and used entities skipped, synonyms), and that an accepted default mapping drives the parameter. Opening gestures (10.1): the main entity (first mapping, `stateEntityId` fallback, blinds last), tap and hold more-info, a `cover`-driven `blindsClosed` tap → `cover.toggle_tilt` with its target, a non-cover blinds entity → more-info, no entity → nothing, double tap → nothing, configured actions (including `none`) winning. Tilt conventions (10.4): each convention's reading at 0, 25, 50, 75, and 100, recognising each map (and the pre-10.4 default) and a custom one, the cover default, a parameter about open slats, the test tilts, the set-tilt feature, the `band` schema (and one refused), the venetian tap (open → 0, shut → 50, no tilt → 50, its target) while standard and inverted toggle, and hold staying more-info. State sources (10.5): the sliding door from a contact and from a cover's position, the window from one contact, two sensors (the second's default, all four combinations, an unavailable first), their subscriptions, the schema (a second entity accepted, a third refused), a three-state handle and option words, a select's titles, the louver from swing modes, named swing positions, a climate without swing modes, a select of positions and a plain select, the louver select's suggestion, and the washer door at 90° from a sensor (its whole range from a cover). `npm run viewer:focus` checks the room bubble frame (centroid, lift, longest side) and the screen row.
- The owner checked 8.0, 8.3, and 8.5 in the harness and in HA.
