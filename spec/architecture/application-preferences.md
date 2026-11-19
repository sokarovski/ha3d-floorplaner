# Global application preferences and browser-state synchronization

Updated: 2026-11-17 (Phase 11 implementation).

Status: D12 is resolved. There are no application users, accounts, profiles, ownership filters, or per-user preferences. All durable application data is global to the installation. JSON preferences, selected browser caches/session state, and occasional synchronization remain required; exact field/default/timing policies remain implementation details.

## Scope and storage

Use one global preferences document, `config/application-preferences.json`, outside the house-listing `data/` root. There is no `users` map, active profile, dummy local user, user ID, login, or role/permission model. The API returns the same preference resource to every application client.

Global ownership does not require flattening storage. Houses retain separate folders and house-owned image/template libraries; project units/environment stay with their house. These are organizational/resource boundaries, not access boundaries between people.

A user layer could be added later as a separate design/migration. Do not prebuild user abstractions or describe account support as a planned requirement for this version.

## State lifetimes

| State | Location | Sync policy |
| --- | --- | --- |
| Durable global application preferences | Backend JSON plus browser startup cache | Synchronize selected changed fields |
| Browser-local cache | Namespaced `localStorage` | Only allowlisted fields synchronize |
| Tab/session editor state | In-memory state or `sessionStorage` | Transient/session-local unless explicitly promoted |

“Global” describes the durable application data model. Active drags, raw form drafts, viewport state, and cached network responses remain local runtime state; they are not user profiles or an automatic shared editing feature. Cross-tab collaboration remains outside MVP.

**HA production ownership:** the production integration moves production viewer setup, dashboard and bindings into HA installation storage with a one-time import. These preference fields remain the standalone dev source and migration input; they are not synchronized back from HA. See [state ownership](../home-assistant/production-integration.md#state-ownership). The policies below describe existing builder persistence.

## Initial field policies

| Value | Recommended behavior |
| --- | --- |
| Theme choice (`light`, `dark`, `auto`) | Global durable preference; apply immediately and cache for startup |
| Resolved effective theme | Derive in each browser; retain saved `auto` rather than replacing it |
| Colour scheme (`appearance.colorScheme`: `blue`, `graphite`, `green`, `custom`; `appearance.customColors` for Custom) | Global durable preference, default `blue`; applies immediately (Phase 5.5) |
| Grid visibility (`editor.showGroundGrid`) | Global durable preference, default on |
| Navigation mode (`editor.navigation`: `trackpad`, `mouse`) | Global durable preference, default `trackpad` ([D16](../decisions.md#d16-interaction-defaults-and-support-limits)) |
| HA viewer setup (`homeAssistant.viewer`: `houseId`, `testEntityId`, both nullable) | Global durable preference, default both `null`; written only by the [HA viewer](../home-assistant/viewer-mvp.md#setup) and hidden from Settings ([D23](../decisions.md#d23-ha-viewer-mvp)) |
| HA bindings (`homeAssistant.bindings`: per house ID, `{ lights, objects, effects, areas, bubbles }`, the first four keyed by the builder's stable ID; a light, object, or room binding is `{ stateEntityId?, tapAction?, holdAction?, doubleTapAction?, visibleWhen? }` (a light also `lumens?`, `kelvin?`, Phase 13.6), an effect binding `{ visibleWhen?, variants? }`; `bubbles` is `{ rooms: { <areaId>: RoomBubble[] }, placed: { <bubbleId>: PlacedBubble } }` ([bubbles](../home-assistant/bindings.md#bubbles), Phase 8.5); actions are HA dashboard action objects kept as HA writes them, conditions a subset of HA card conditions; [bindings](../home-assistant/bindings.md), [D25](../decisions.md#d25-home-assistant-bindings)) | Global durable preference, default `{}`; written only by the [HA viewer's Edit mode](../home-assistant/viewer-mvp.md#bindings-and-edit-mode); hidden from Settings. HA configuration, never in `house.json` ([D23](../decisions.md#d23-ha-viewer-mvp)) |
| HA room-cards dashboard (`homeAssistant.dashboard`: `urlPath` nullable, `areaTabs` (tab name), `areaViews` (saved room camera: plan target, distance, azimuth, polar) and `areaColumns` (room panel width, 1 or 2 section columns; absent = 1) per house ID, per area ID; from 13.7 the optional floor widgets `floorTabs`, `floorColumns` (1–4) and `floorPositions` (`left`/`right`/`top`/`bottom`) per house ID, per floor ID ([floor widgets](../home-assistant/viewer-mvp.md#floor-widgets)); from 16.1 the optional `mainViews` (a floor ID per house ID, absent = whole house; [main view](../home-assistant/viewer-mvp.md#floors-and-the-whole-house)). The house-wide `panelColumns` before 2026-11-17 is dropped on read) | Global durable preference, default `{ "urlPath": null, "areaTabs": {}, "areaViews": {}, "areaColumns": {}, "floorTabs": {}, "floorColumns": {}, "floorPositions": {} }`; written only by the [HA viewer's room settings](../home-assistant/viewer-mvp.md#room-cards); hidden from Settings |
| Panel sizes/layout | The house tree's share of the right column, `editor.treeShare` (0.15–0.85, default 0.4; Phase 7.4, set by dragging the splitter, hidden in Settings). The right column itself is a fixed 25 rem |
| Last house/floor | Not remembered; the app opens on the Houses screen |
| Camera, selection, current tool, Magnetic, Auto-select, light controls | Session-local (editor UI store) |
| Drag previews and incomplete input | Transient, not synchronized |

A shared `auto` choice can resolve differently on devices with different system appearance. That creates no distinct durable preference records. A `/ds` preview theme stays scoped to the example and never writes global preferences.

House units, geometry, materials, north/location, lighting, assets, and derived RealFloor retain their existing ownership. Theme changes do not alter scene appearance or physical dimensions.

## Illustrative document

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "preferences": {
    "appearance": { "theme": "auto", "colorScheme": "blue" },
    "editor": { "showGroundGrid": true, "navigation": "trackpad" },
    "homeAssistant": { "viewer": { "houseId": null, "testEntityId": null }, "bindings": {}, "dashboard": { "urlPath": null, "areaTabs": {}, "areaViews": {}, "areaColumns": {}, "floorTabs": {}, "floorColumns": {}, "floorPositions": {} } }
  }
}
```

Defaults live in a typed schema (`shared/domain/schemas/preferences.ts`), with validation and migrations. The document revision is for this global resource; there is no per-profile revision. The Settings form is the same schema ([forms](../design-system/README.md#8-forms-and-popups)); the `homeAssistant` section is hidden there.

Implementation conventions: on read, each section is merged over its defaults, so a document written before a field existed stays valid (`schemaVersion` is 1). The one migration so far is additive (Phase 8.0, [D25](../decisions.md#d25-home-assistant-bindings)): bindings written with only `lights` get empty `objects`, `effects`, and `areas` per house on read, lights unchanged; likewise (Phase 8.5) a house without `bubbles` gets `{ rooms: {}, placed: {} }` ([bindings: storage and migration](../home-assistant/bindings.md#storage-and-migration)). A `schemaVersion` above 1 is refused with `422 unsupportedVersion`, and a corrupt file with `422 invalidDocument`; neither is replaced with defaults.

## Local updates and occasional synchronization

1. Load the backend/installation-scoped startup cache and apply eligible settings.
2. Fetch global preferences/revision; combine defaults with acknowledged data and explicitly pending local patches.
3. Apply edits locally immediately and mark only declared sync fields pending.
4. Batch patches after a debounce/periodic interval or explicit save; do not write on every render or pointer movement.
5. On acknowledgment, clear only the submitted changes. Newer edits remain pending.
6. Retain failed patches locally and retry/recover under the defined policy. Browser unload flushes are best effort only.

Use one installation-global preference service/store: Zustand plus a typed client. Namespace browser caches by application/backend, never by an invented user/profile ID. Do not dump the whole editor store into preferences or automatically persist every stored field.

Implementation conventions (`src/features/preferences/services/preferencesService.ts`): the whole acknowledged preferences document is cached in `localStorage` under `homeplan:preferences`, and the theme controller caches the derived colour roles for both themes so `index.html` applies them before first paint. Pending patches are sent 600 ms after the last change; a failure keeps them and retries with backoff from 1 s doubling to 30 s. A `409` refetches the revision and retries the same patch. If the startup read fails, it is retried with the same backoff; pending patches wait until a revision is known. Settings apply instantly ([design system](../design-system/README.md#8-forms-and-popups)). The HA viewer reads and writes the same document through `/api/preferences`.

## API and save integrity

Endpoints: `GET /api/preferences` and `PATCH /api/preferences` ([API](api.md)). Validate allowlisted fields and merge the intended patch into the current document rather than overwriting it with an old cache.

Use the global document revision and serialized atomic writes under the [persistence contract](persistence.md). On an unexpected stale revision, preserve pending edits, fetch current data, and reconcile/retry without silently overwriting unrelated fields. Exact same-field conflict behavior is an implementation policy, not a collaborative editing feature.

No identity resolver, account middleware, owner checks, or profile switching is required. Resource/schema/path validation still applies to all API requests. Deployment exposure is configured separately from the application data model.

## Verification

- There is one global preference record and no users/profiles in storage, routes, or stores.
- A global theme choice applies immediately, survives reload, and persists through the global API.
- Auto remains Auto; each browser derives its own effective appearance.
- Transient drafts and `/ds` theme previews do not produce durable preference patches.
- Failed sync retains edits; an older acknowledgment does not clear newer changes.
- Global patches preserve unrelated settings and house data.
