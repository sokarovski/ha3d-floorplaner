# React state and resource access

Updated: 2026-11-17 (Phase 11 source/storage adapter).

Status: D13 is resolved. Zustand stores, typed fetch clients, and the state/resource boundaries below are selected for MVP. Server endpoint names and DTO schemas remain implementation contracts where feature specifications have not finalized them.

## Selected state tools

Use **Zustand** for shared client/editor state. Prefer vanilla store factories for editor sessions so React and the Three.js runtime can subscribe to the same state without putting React hooks in the renderer. React consumes stores through small typed selector hooks. Zustand supports React and non-React consumers; use the published API matching the pinned release. [Zustand documentation](https://zustand.docs.pmnd.rs/), [maintainer reference](https://github.com/pmndrs/zustand#using-zustand-without-react).

Keep local input drafts, popup state, and small isolated interactions in React state. Pure reducers/command functions remain useful for deterministic document changes; they are not the cross-component subscription, persistence, or async resource mechanism by themselves. Zustand does not automatically supply undo, revision conflicts, request cancellation, or reliable saving: those are explicit services/contracts.

“TanStack” names several products. TanStack Query handles server fetching/caching/synchronization; TanStack Store is a separate client-state library, and TanStack Router is another routing choice. They are not one required framework bundle. [Query overview](https://tanstack.com/query/latest/docs/framework/react/overview), [Store overview](https://tanstack.com/store/latest/docs/overview).

Start without TanStack Query because the first editor workflow can have explicit, bounded resource loading and one editable session. This is the selected MVP scope, not a claim that Query is intrinsically too large. Reconsider it when several screens need shared cached server resources, background freshness, invalidation, pagination, or repeated request-deduplication logic. Do not grow a generic query-cache framework inside Zustand to avoid that decision.

If Query is adopted later, let it own server snapshots/lists/jobs; Zustand continues owning the dirty editable session, UI selection, and commands. Never let a background query result replace unacknowledged edits.

## State ownership

| State | Owner and lifetime | Persistence |
| --- | --- | --- |
| URL and resource identity | Router | URL/history; no competing writable store field |
| Active editable house document | Editor-session document store (`documentStore.ts`), one authoritative in-memory model | Explicit revision-aware backend save |
| Object Editor template draft and its own undo history | `templateDraftStore.ts` (`src/features/object-editor/stores/`) | Saved as a template version; never in `house.json` |
| Selection, focus, mode (including the whole-house overview level, `houseOverview`, Phase 16.4), Magnetic, Auto-select, active tool, light controls, open group, panel state | Editor-session UI store (`src/features/floor-builder/stores/uiStore.ts`) | Session only |
| Dirty state, save status, acknowledged revisions, undo/redo metadata | Document store plus command/save service | House data saved; history lifetime follows the editing policy |
| Durable appearance/preferences and pending preference patches | Installation-global preference store/service | Allowlisted browser cache and preferences API |
| House list, image/template lists, job status | Feature resource state keyed by resource identity | Backend remains authoritative; bounded memory state initially |
| Field draft, menu open, source-dialog state | Local component state | Transient |
| Three.js objects, pointer/camera previews, GPU resources | Rendering runtime | Derived/transient; never JSON/store persistence |

Split stores by ownership/lifetime, not by creating a store for every component. The document store may use internal slices, but it contains only one current editable version of each loaded document. Do not maintain separate independently editable wall/floor/renderer copies.

Create one editor session per opened house context and dispose it after resolving unsaved work. A session holds the whole house document while editing and rendering one active floor. Only that floor is projected into the runtime scene; switching replaces its geometry and lights. Retaining documents does not imply a stacked scene or cross-floor elevations. Application preferences are installation-global. Clear/abort session resources on house changes; `/ds` demos create their own isolated fixture sessions when needed.

Use narrow stable selectors. A property field subscribes to its selected property/save status, not the complete house on each pointer movement. Render previews stay in the runtime, with throttled readouts and one committed command at operation completion. Public edit actions validate commands; UI callers do not use raw store `setState` to bypass invariants. Internal initialization/acknowledgment paths remain explicit typed operations.

Do not apply broad Zustand persistence middleware to the whole editor store. Browser caching follows the existing [preference policies](application-preferences.md); model saving goes through the backend. JSON serialization excludes functions and runtime resources by construction.

The [undo/redo service](../builder/undo-redo.md) records one forward/inverse patch transaction per committed model operation, with one house-session cursor across all floors. Keep history, save metadata, and the authored payload as separate store slices. Replaying patches emits ordinary model/dependency changes without recursively recording another history entry. Derived meshes, RealFloor, uploads, asset indexes, and server revisions never enter the undoable slice.

The MVP supports one active house editor. Do not add BroadcastChannel-style coordination, live cross-tab synchronization, or automatic merge/rebase for house edits. Expected server revisions remain a small file-integrity guard, with simple recovery if violated.

The [browser automation bridge](browser-automation.md) shares this same session and calls its command/save actions. Agent results are detached snapshots, edits check the session generation, and pending manual operations are preserved. Its window wrappers perform resource reads through the existing clients; the external agent does not issue backend requests directly.

## Client and API boundary

Use one typed `httpClient` configured at app startup with the API base URL, credentials policy, and a replaceable fetch implementation. Resource clients use it for houses, the house document, images, templates, preferences, and render jobs, as defined in the [API specification](api.md). Components do not build resource URLs or call `fetch` independently.

| Layer | Owns |
| --- | --- |
| Transport | Base URL resolution, path/query encoding, request headers/body, abort signals, status handling, runtime response decoding, error normalization |
| Resource client | Typed domain-resource methods and DTO mapping; no React/store imports |
| Feature service | Load/save orchestration, dirty/conflict rules, explicit refresh/invalidation, and store updates |
| React hook/page | Subscriptions, invocation, loading/empty/error/retry presentation |
| Server route/service/repository | Request/resource validation, domain/revision policy, then safe filesystem operations |

TypeScript types alone do not validate JSON. Parse external responses with JSON Schema validation (Ajv), sharing the same schemas as the server and the [property system](../builder/property-system.md). A generic `request<T>` cast is not validation. Server validation remains required even when the browser already checked an input.

Normalize errors into actionable categories: network, not found, validation, stale revision/conflict, unsupported version, payload too large, and server failure. The error envelope is defined in the [API specification](api.md#conventions). There is no authentication ([D12](../decisions.md#d12-user-identity-and-access)). Distinguish abort from a user-facing failure and preserve field-level validation details.

Pass `AbortSignal` through clients. Associate resource results with request/session IDs so a completed request cannot populate a different house after navigation. For identical overlapping reads, keep at most one in-flight request per resource key within the session; clear entries after completion/failure. A shared request is canceled by its owning session or when no consumers remain; one caller leaving must not abort another caller's needed data. Include backend/installation and resource IDs in keys; no profile identifier exists. This is a bounded load coordinator, not a generalized persistent cache.

Use explicit loading/ready/empty/error states. Refresh lists after successful creates/uploads; retain usable prior data during a refresh failure when appropriate. Do not automatically refetch the editable document on focus and overwrite the current working copy. Router loaders delegate to the same services and return route/session context rather than another independently editable document copy.

## Resource clients

| Client | Methods | Routes |
| --- | --- | --- |
| `houseClient` | `list`, `create`, `rename`, `trash`, `listTrash`, `restore`, `purge`; `loadDocument`, `saveDocument`; `createRevision`, `listRevisions`, `revisionDiff`, `restoreRevision` | [Houses, document, revisions](api.md#houses) |
| `imageClient` | `list`, `upload`, `rename`, `remove`, `fileUrl`, `thumbnailUrl` | [Images](api.md#images) |
| `templateClient` | `list` (built-in + house), `builtinUrl`, `houseTemplateUrl`, `baseUrl`, `sourceUrl`, `importModel`, `draft`, `saveVersion`, `remove` | [Templates](api.md#templates) |
| `preferencesClient` | `get`, `patch` | [Preferences](api.md#preferences) |
| `exportClient` | `save` (PNG export), `list`, `fileUrl` | [Exports](api.md#exports-and-renders) |
| `renderClient` | `capabilities`, `submit`, `job` (poll), `cancel` | [System, renders](api.md#exports-and-renders) |

All clients live in `src/api/` and share `httpClient.ts` and `apiError.ts` (the normalized error categories). The HA viewer has its own small fetch wrapper (`ha-viewer/houseSource.ts`) that validates responses with the same `shared/contracts/` schemas. Its [production adapter](../home-assistant/production-integration.md#viewer-data-adapter-and-private-assets) uses authenticated HA transport and HA-owned configuration; one shared URL/DEV MODE drives both frontend code and house transport, with local pinned resources when off or visibly falling back. Normal house selection publishes a single scene/sidebar update, while code changes require browser reload; the existing dev adapter continues to use builder preferences. Configuration conflict handling uses the editing baseline revision, and house/frontend Upgrade activates a verified local artifact without replacing concurrent binding/settings edits.

The [API specification](api.md) owns routes and payloads. Implement each shared request/response contract and backend handler alongside its client method. Asset URLs also use the configured resolver; they are not raw filesystem paths.

## Save and conflict example

1. A wall properties field commits a valid canonical dimension to a typed domain command.
2. The command validates the wall and hosted openings, producing an atomic document edit and dependency change set. The document store publishes it, records one undo step, and marks a local generation dirty.
3. The renderer subscribes to the change set and regenerates affected geometry. React subscribes to the values it displays.
4. The save service snapshots the relevant document and expected acknowledged server revision, then sends it through the house client.
5. The server validates the request and revision, serializes the house operation, and writes through its filesystem repository under the [persistence contract](persistence.md).
6. An acknowledgment advances the server revision and clears only the submitted generation. New edits remain dirty and are saved against the new server revision; the response must not replace them with an older snapshot.
7. A stale-revision response preserves local work and presents conflict recovery. A request whose write outcome is uncertain requires reconciliation before retry; ordinary cancellation does not prove the server failed to save. Implementation convention (`saveService.ts`): on a `409` the service reads the server document; if it equals the submitted document apart from `revision` (a retry after a lost acknowledgement), it adopts the server revision and continues silently, otherwise it shows the conflict.

Serialize document saves within a session. Freeze each payload; never send a live mutable store reference. Do not retry non-idempotent mutations automatically. Creation, uploads, and export requests need explicit idempotency/reconciliation behavior before retry support is claimed. The [editing lifecycle](../builder/editing-lifecycle.md) owns commit/cancel/undo behavior; the store choice does not resolve D09 by itself.

## Verification direction

- React and renderer see one committed wall edit and the same stable object identity.
- Editing another property does not force every panel to subscribe to the full document.
- Two read callers share one pending session load; failed/aborted loads can be retried without stuck entries.
- Navigating to another house ignores stale responses and disposes old runtime subscriptions.
- An older save acknowledgment cannot clear newer edits; conflict/offline/uncertain-write handling retains recoverable work.
- `/ds` examples use isolated data and do not change active house state or durable preferences.
- Introducing Query later assigns one owner to each resource cache; no background update overwrites dirty documents.
