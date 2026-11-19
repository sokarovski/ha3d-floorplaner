# Home Assistant display contract

Updated: 2026-11-19.

Status: a display extension with live-3D and/or layered-image presentation is the product direction. The broader card/image-mode packaging and published formats remain open. The panel's production integration/local-copy delivery and the HA app packaging are implemented separately ([production integration](production-integration.md), [app packaging](publishing.md#app-packaging-and-ingress)). The builder/card responsibility boundary is retained.

**Viewer MVP:** the first HA deliverable, a read-only dev-mode panel, is specified in [viewer-mvp.md](viewer-mvp.md) ([D23](../decisions.md#d23-ha-viewer-mvp)). Its one binding model for lights, objects, ambient effects, and rooms (entities, actions, HA card conditions, variants) is [bindings.md](bindings.md) ([D25](../decisions.md#d25-home-assistant-bindings)).

**Production viewer:** [production integration](production-integration.md) and [D27](../decisions.md#d27-production-ha-viewer-and-local-snapshots) specify gradient → Setup your home → House setup, one URL/Connect/house list, reactive house/sidebar selection, one DEV MODE for remote code and data with visible local fallback, per-house Upgrade and local Upgrade panel. HA owns configuration; Python changes still use normal integration updates. This is the active panel contract; broader card/image publishing stays deferred.

**MVP scope override:** this entire HA display/card contract is deferred beyond MVP. Keep it as future design context; the builder release requires no HA card, integration, entity connection, publishing, or add-on deployment.

## What the builder supplies

- Authored geometry and materials through a versioned scene snapshot, or a render set with the associated camera/lighting metadata.
- Stable house/object identities, declared gesture targets, and a matching [controllables manifest](controllables.md).
- Light render capabilities and authored defaults, independently of physical device capability.
- Required model/texture/template assets or an explicit packaged representation that can reproduce the scene.
- Image-mode interaction regions matched to the camera, dimensions, and scene snapshot.

The [export specification](../delivery/rendering-and-exports.md) owns output generation. The [deployment specification](../delivery/deployment.md) owns asset access and hosting.

## What the display owns

- Entity/action bindings and their persisted configuration.
- Home Assistant state subscriptions, capability discovery, and outgoing actions.
- Gesture recognition, hit testing, navigation conflicts, and popup behavior.
- Effective light state, using authored fallbacks under the selected [lighting policy](light-state.md#card-boundary-and-precedence).
- Responsive display, runtime camera policy, loading/errors, and compatibility feedback.

Builder gestures select/edit objects; they do not execute Home Assistant actions. Runtime state does not write back into authored light defaults. A visual-state target does not need to expose a click action.

For the future HA release, the proposed card view follows the one-active-floor model in either live 3D or image mode. A package may provide several floors for selection, but switching replaces the displayed floor. No stacked-floor overview or cross-floor lighting is implied. Interaction regions and camera/render metadata identify their floor.

## Proposed implementation

Evaluate a custom dashboard card using the shared geometry/rendering core. Home Assistant supports custom cards as custom elements; this does not require embedding the builder's React panels. For the active panel, the owner selected a backend custom integration in [D27](../decisions.md#d27-production-ha-viewer-and-local-snapshots); this section concerns the still-deferred dashboard card. [Custom card documentation](https://contributors.home-assistant.io/frontend/custom-ui/card/).

For image mode, evaluate generating configuration for the built-in Picture Elements card versus a dedicated compositing card. Built-in image/conditional support does not prove that the intended lighting composition and hit targeting are covered. [Picture Elements documentation](https://www.home-assistant.io/dashboards/picture-elements/).

## Configuration and runtime decisions

| Decision | What must be specified |
| --- | --- |
| Package selection | How the card identifies a house/export and supported format version |
| Bindings | One action target versus separate visual-state targets; stable binding keys and missing-control reporting |
| Camera/gestures | Fixed or movable camera; orbit/pan/zoom versus click/hold/double click |
| State fallback | Behavior for unbound, unknown, unavailable, and partially supported device attributes |
| Refresh | Whether exports are pinned or update automatically, and how removed targets appear |
| Independence | Whether the dashboard continues after the builder/add-on stops |
| Installation | Resource registration, distribution method, and any backend integration actually required |

These are [D01](../decisions.md#d01-first-useful-release), [D10](../decisions.md#d10-publishing-and-package-lifetime), and [D15](../decisions.md#d15-card-interaction-and-state-policy). They need an end-to-end prototype on the target Home Assistant setup.

## Acceptance direction

A minimal integration should load a published house, update one light from an entity, execute one configured gesture, and preserve bindings through an object rename/move and a fresh export. It should report missing targets/assets and unavailable device state without changing the authored house. Image-mode acceptance additionally depends on validated compositing and aligned interaction regions.
