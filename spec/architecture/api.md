# Backend API

Updated: 2026-11-17 (Phase 11 implemented transfer/integration contracts).

Status: resolved route map for MVP. With the house model, asset ownership, saving, and revisions settled ([D09](../decisions.md#d09-saving-cancellation-and-model-undo), [D12](../decisions.md#d12-user-identity-and-access), [D14](../decisions.md#d14-project-management-and-names)), this document is the single owner of `/api/` routes. Feature documents link here instead of listing routes. Request and response payloads are defined as TypeBox schemas in `shared/contracts/` (one module per section below, re-exported from `shared/contracts/index.ts`); the notes here summarize them. Route shapes, methods, and status codes are the contract. The existing builder routes are registered (checked against `server/routes/` and `server/app.ts`, 2026-11-16). The Phase 11 section below is implemented in the builder and separately packaged HA integration; owner installation/acceptance is pending. Builder and HA integration APIs are on different origins and have different authentication rules.

## Conventions

These conventions apply to the existing Fastify builder API. The [HA integration routes](#ha-integration-routes) use HA authentication/admin authorization and their separately listed errors; they do not change the builder's identity model.

- **Base:** every route is under `/api/`, served by Fastify on the same origin as the SPA. The base path is configurable ([frontend architecture](frontend-architecture.md#routing-conventions)).
- **No authentication:** there are no users or sessions ([D12](../decisions.md#d12-user-identity-and-access)). The backend binds to `localhost` by default ([deployment](../delivery/deployment.md)).
- **Request guards:** every `/api/` request must carry an accepted `Host` (DNS-rebinding guard), and a non-`GET`/`HEAD`/`OPTIONS` request with an `Origin` header must come from the `Host`'s own origin or a configured HA origin; otherwise `400 badRequest`. As a Home Assistant app (`SUPERVISOR_TOKEN` set) both checks are replaced by a peer-address check: only the Supervisor network (ingress proxy, HA Core) and loopback may call `/api/`, and a browser-marked cross-site write is refused. Accepted names, the switches that turn the Host check off, app mode, and the variables are in [deployment](../delivery/deployment.md#request-guards).
- **JSON:** request and response bodies are JSON unless noted. Uploads are `multipart/form-data` with one `file` part plus JSON fields.
- **Validation:** every request body, path parameter, and stored document is validated with Ajv against the shared JSON Schemas ([D18](../decisions.md#d18-property-schemas-and-the-property-panel)). IDs match `^[a-z]+_[a-z0-9]{6,}$` (for example `h_7f3k2q`, `img_9x2m1a`) and are never filesystem paths.
- **Revisions:** writes to `house.json` and the preferences document carry `expectedRevision`. A mismatch returns `409` with the current revision and never writes.
- **Validation in practice:** Fastify validates params, query strings, and JSON bodies with the one shared Ajv configuration (`shared/domain/validation/ajv.ts`), and checks every JSON response against its declared schema before sending it. Unknown body keys are rejected (`additionalProperties: false`), never stripped. Invalid route IDs fail with `400 validation` before any filesystem access. Query-string numbers are sent as digit strings. A JSON body is required wherever a body schema exists; send `{}` when every field is optional.
- **Errors:** one envelope for every non-2xx response:

```json
{
  "error": {
    "code": "staleRevision",
    "message": "The house was changed since it was loaded.",
    "details": { "currentRevision": 42 }
  }
}
```

| Status | `code` values | Client category ([state and data](state-and-data.md#client-and-api-boundary)) |
| --- | --- | --- |
| `400` | `validation` (with `details.errors`: JSON Pointer + message per field), `badRequest` | Validation |
| `404` | `notFound` | Not found |
| `409` | `staleRevision`, `referenced` (asset still in use), `nameTaken` | Conflict |
| `413` | `tooLarge` | Payload too large |
| `415` | `unsupportedMedia` | Validation |
| `422` | `unsupportedVersion` (schema version newer than the server), `invalidDocument` (corrupt file on disk) | Unsupported version |
| `500` | `internal` | Server failure |
| `503` | `unavailable` (for example no render backend configured) | Server failure |

## System

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness for development and process supervision |
| `GET` | `/api/capabilities` | Server limits and optional features: `uploadLimits: { image: { maxBytes, maxLongestSidePx, mediaTypes }, model: { maxBytes } }` ([D16](../decisions.md#d16-interaction-defaults-and-support-limits); 1 MB = 1024 × 1024 bytes), `photorealRender: { available, reason, renderer }` (`renderer` is `{ name, version }`, for example `blender-cycles` `4.0.2`, or null) |

## Houses

House metadata (ID, name, floor count, modified time, status) is read from each folder's `house.json` ([Houses screen](../builder/screens/houses.md)).

| Method | Route | Purpose | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/houses` | List house cards | Card metadata only; invalid houses appear with `status: "invalid"` |
| `POST` | `/api/houses` | Create a house `{ name }` | Creates the folder, `house.json` with `Etage1`, the Git repository, and the first commit. Returns `201` with the card |
| `POST` | `/api/houses/:houseId/clone` | Clone a house `{ name? }` | Owner request (Phase 7.13). Copies the source folder's current `house.json` (the last autosaved state, not unsaved editor changes), images, textures, and house templates into a new ID-named folder; Git history and `exports/` are not copied. Rewrites only `id`, `name` (default "<name> (copy)"), and `revision` (0), then starts a new repository with one commit "Cloned from <name> at revision <n>". The source is read under its house lock and never written. Returns `201` with the new card; `404` for an unknown house, `422` for an invalid source or name |
| `POST` | `/api/houses/import` | Upload house: a house archive (.zip) as a new house; multipart `file` (≤ 1 GiB) and optional `name` | Phase 21. The archive is a house snapshot as Home Assistant stores it (`manifest.json` and its files); every file is checked against the manifest (size, SHA-256) and unlisted files are refused. `201` returns the new house's card (new ID, revision 0, one commit). Without `name`, a name in use is `409 nameTaken` with `details.suggestion` (the name with the next free " (2)"…); the client asks to keep or change it. House images keep their IDs; house templates (`t_…`) are restored as saved versions (they render, but without their source draft they are not listed in the Object Editor); built-in assets come from the app; HA bindings are not imported. `houseArchiveService.ts` |
| `PATCH` | `/api/houses/:houseId` | Rename `{ name, expectedRevision }` | Changes `house.json` `name` only; returns the new revision |
| `DELETE` | `/api/houses/:houseId` | Move to trash | Folder move to `<storage-root>/trash/` |
| `GET` | `/api/trash/houses` | List trashed houses | |
| `POST` | `/api/trash/houses/:houseId/restore` | Restore from trash | `409 nameTaken` cannot happen because folders are ID-named |
| `DELETE` | `/api/trash/houses/:houseId` | Purge permanently | Separate explicit action ([D14](../decisions.md#d14-project-management-and-names)) |

Payload notes:

- A card is `{ status: "ok", id, name, floorCount, revision, modifiedAt }` or, for a folder whose `house.json` is missing, unreadable, invalid, or of a newer schema version, `{ status: "invalid", id, modifiedAt, problem: { code, message } }` (`code` is `invalidDocument` or `unsupportedVersion`). `modifiedAt` is the `house.json` modification time. A child of `data/` whose name is not a valid ID is listed as invalid too; no route can address it. `GET /api/houses` returns `{ houses }`, newest first.
- `PATCH` returns `{ revision, house }`; it refuses an invalid document with `422`. `DELETE` routes return `204`. Trash first stops the house's render jobs (queued and running ones end `canceled`) and no write to a trashed house recreates its folder: a request that was already running when the house was trashed fails with `404`. Purge also removes the house's frozen snapshot exports (`transfers/<houseId>/`) and its Home Assistant bindings from the preferences (one preferences revision, only when it had bindings); trash keeps both so a restore is complete. Restore returns the card. The trash list is `{ houses: [{ house, trashedAt }] }`, newest first.

Renaming from the Houses screen goes through `PATCH` because the Floor Builder is not open. Inside the Floor Builder, the name is an ordinary model edit saved with the document.

## House document

| Method | Route | Purpose | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/houses/:houseId/document` | Load `house.json` | Returns `{ revision, document }`. Migrates older schema versions in memory |
| `PUT` | `/api/houses/:houseId/document` | Working write `{ expectedRevision, document }` | The full validated document, never a patch ([D09](../decisions.md#d09-saving-cancellation-and-model-undo)). Returns `{ revision }`. Creates no Git commit |
| `POST` | `/api/houses/:houseId/revisions` | Save: create a Git revision `{ message? }` | Commits the folder as it is on disk; the client first sends any pending working write. Returns the revision `{ id, time, message, changedFiles }`. No-op (`200`, `created: false`) when nothing changed |
| `GET` | `/api/houses/:houseId/revisions` | History panel list | Newest first; paginated with `?before=<id>&limit=` |
| `GET` | `/api/houses/:houseId/revisions/:revisionId/diff` | JSON diff against the working state | Per changed file; `house.json` as a structured diff |
| `POST` | `/api/houses/:houseId/revisions/:revisionId/restore` | Restore a revision `{ expectedRevision }` | Writes that revision's files, commits "Restore to …", returns `{ revision, document }`. The client replaces its session and starts a new history baseline |

Payload notes:

- `PUT` validates the full document against the House schema; `document.id` must equal `:houseId`, and floor names must be unique case-insensitively (`400 validation` otherwise). The client's `document.revision` is ignored: the server stores `expectedRevision + 1` and returns it, so the stored `revision` always equals the acknowledged one. `PUT` refuses to overwrite an invalid or newer-version file (`422`). The JSON body limit is 64 MB.
- `POST /revisions` takes `{ message? }` (≤ 500 characters, whitespace collapsed to one line). It returns `201 { created: true, revision }` or `200 { created: false }`. `revision.message` is the subject line (the note, or `Save`); `changedFiles` are house-relative paths.
- `GET /revisions` returns `{ revisions, nextBefore }`; `limit` is 1–200 (default 50) and `nextBefore` is null on the last page.
- The diff is `{ revisionId, files: [{ path, status, format, changes?, truncated?, patch? }] }`, comparing the revision (old) with the working state (new). JSON files (`house.json`, `textures/images.json`) carry `changes: [{ pointer, kind: "added" | "removed" | "changed", before?, after? }]` (JSON Pointers, by key and array index, capped at 2000) and a unified line `patch` (jsdiff); binary files carry only their status. Unchanged files are skipped by Git blob ID without reading their content. Implementation convention: the `patch` is omitted (other fields unchanged; the contract has no separate flag) when either side is over 1 MB or jsdiff exceeds 20 000 edits or 1 s; JSON `changes` are still listed.
- Restore returns `{ revision, document, commit }`. The restored document gets a new, higher revision counter (current + 1), so the counter never goes backwards. A stale `expectedRevision` returns `409`; when the working `house.json` is corrupt, the check is skipped so a revision can always repair it, while a newer-version file is refused with `422`.

The document `revision` is an integer counter inside `house.json`. Git revision IDs are commit hashes. They are separate ([persistence](persistence.md#revision-history)).

## Images

The image index `textures/images.json` is server-owned ([D14](../decisions.md#d14-project-management-and-names)). No image route changes the document revision.

| Method | Route | Purpose | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/houses/:houseId/images` | List the image index | |
| `POST` | `/api/houses/:houseId/images` | Upload (multipart `file`, optional `name`) | JPEG/PNG/WebP, ≤ 25 MB, ≤ 8192 px ([D16](../decisions.md#d16-interaction-defaults-and-support-limits)); generates the thumbnail; returns `201` with the entry |
| `PATCH` | `/api/houses/:houseId/images/:imageId` | Rename `{ name }` | Display name only |
| `DELETE` | `/api/houses/:houseId/images/:imageId` | Delete | `409 referenced` if `house.json` references it; the client checks live history first |
| `GET` | `/api/houses/:houseId/images/:imageId/file` | Image bytes | Immutable per ID; long cache headers |
| `GET` | `/api/houses/:houseId/images/:imageId/thumbnail` | 256 px thumbnail | WebP, longest side ≤ 256 px |

**Built-in textures (Phase 17.1):** image IDs with the reserved prefix `builtinimg_` (catalog: `shared/domain/house/builtinMaterials.ts`) are app-owned textures in `server/builtin-materials/` (`<imageId>.png` and `<imageId>.thumb.webp`, generated by `npm run materials:build`). The `file` and `thumbnail` routes serve them for **any existing house** (`404` for an unknown house or built-in ID), so `house.json` references them exactly like uploads and the renderer and HA viewer need no second URL scheme. They are not house uploads: `GET /images` lists only the house's own index (clients take the built-in catalog from the shared module, as with built-in presets), and `PATCH`/`DELETE` of a built-in ID return `400 badRequest` (read-only). Because a built-in keeps its ID across app releases, its responses are `Cache-Control: no-cache` with a content-hash `ETag` (`304` on `If-None-Match`) instead of immutable caching.

Payload notes: an index entry is `{ id, name, originalFilename, mediaType, widthPx, heightPx, byteSize, file, thumbnail, createdAt }`, where `file` and `thumbnail` are house-relative paths. The list is `{ images }` in upload order. The upload's real type is sniffed from the bytes (`415 unsupportedMedia` for anything but JPEG/PNG/WebP); more than 25 MB returns `413 tooLarge`; a longest side above 8192 px returns `400 validation` at `/body/file`. `name` defaults to the filename without its extension. `409 referenced` lists the referencing JSON Pointers in `details.references`. File and thumbnail responses of uploads are `Cache-Control: public, max-age=31536000, immutable`.

## Templates

Built-in templates ship with the application; house templates live in `assets/templates/<template-id>/` ([D07](../decisions.md#d07-template-library-and-updates), [D17](../decisions.md#d17-object-asset-format-and-template-metadata)).

| Method | Route | Purpose | Phase |
| --- | --- | --- | --- |
| `GET` | `/api/houses/:houseId/templates` | The template picker list: built-ins and house templates, each with ID, label, kind, contract, versions, and a thumbnail | 1 |
| `GET` | `/api/templates/builtin/:templateId/v/:version` | A built-in `.glb` (`model/gltf-binary`; immutable cache in production, `no-cache` in development because `npm run templates:build` rewrites a version in place) | 1 |
| `GET` | `/api/templates/builtin/:templateId/thumbnail` | A built-in's front-elevation thumbnail (SVG, PNG, or WebP) | 1 |
| `GET` | `/api/houses/:houseId/templates/:templateId/v/:version` | A house template version's `.gltf` (`model/gltf+json`, immutable cache) | 2 |
| `GET` | `/api/houses/:houseId/templates/:templateId/base` | The normalized `base.gltf` (`model/gltf+json`): the imported model without Homeplan metadata or root transform, for previewing a draft before any version exists | 2 |
| `GET` | `/api/houses/:houseId/templates/:templateId/files/*` | Its relative files (`geometry.bin`, `textures/<name>`) | 2 |
| `GET` | `/api/houses/:houseId/templates/:templateId/thumbnail` | The generated front-elevation SVG of a house template | 2 |
| `POST` | `/api/houses/:houseId/templates` | Import (multipart GLB/glTF/STL ≤ 100 MB, plus `format` and, for STL, `unit` or `knownDimensionMm` + `knownAxis`, `upAxis`, `frontAxis`). Stores `source.*` and `geometry.bin`; returns `201 { templateId, draft }` with no saved version yet | 2 |
| `GET` | `/api/houses/:houseId/templates/:templateId/draft` | The stored draft `{ templateId, draft }`, for reopening in the Object Editor | 2 |
| `GET` | `/api/houses/:houseId/templates/:templateId/source` | The original upload, unchanged | 2 |
| `POST` | `/api/houses/:houseId/templates/:templateId/versions` | Save a version `{ metadata, rootTransform, nodeRules?, label? }`. Runs the glTF Validator and the metadata schema; returns `201 { version }` | 2 |
| `DELETE` | `/api/houses/:houseId/templates/:templateId` | Delete an unused template | 2; `409 referenced` while any instance or history entry uses it |

Payload notes: the list is `{ templates: [{ id, label, kind, contract, versions, source: "builtin" | "house", thumbnailUrl, category?, tags?, product? }] }`; `thumbnailUrl` is relative to the app's base URL (for example `api/templates/builtin/<id>/thumbnail`; the page's `<base href>` supplies the base path or ingress prefix), or null; `category`, `tags`, and `product` (Phase 9.1, for the picker's categories and search) are present when the template declares them. Built-in template IDs are slugs matching `^[a-z0-9]+(-[a-z0-9]+)*$` (for example `window-style-1`), not generated IDs. Built-ins live in `server/builtin-templates/<templateId>/` as `template.json` (`BuiltinTemplateManifest`: `id`, `label`, `kind`, `contract`, `versions`, optional `thumbnail` file name, and optional `category`, `tags`, `product` copied from the metadata), `v<N>.glb`, and the thumbnail; folders with an invalid manifest are skipped with a warning.

House template payload notes (Phase 2; schemas in `shared/contracts/templates.ts`):

- **Import fields:** `file` (≤ 100 MB) and `format`: `gltf` for a GLB or a self-contained glTF (every buffer and image URI must be a `data:` URI; external files are `400`), or `stl` (binary or ASCII). STL needs `unit` (`mm`, `cm`, `m`, `in`, `ft`) or `knownDimensionMm` with `knownAxis` (`x`/`y`/`z` after orientation); `upAxis` and `frontAxis` are signed source axes such as `+z` and `-y` (defaults `+z` and `-y`) and must be perpendicular. Numbers are decimal text.
- **Import checks:** `extensionsRequired` may list only `KHR_texture_transform`, `KHR_lights_punctual`, `KHR_mesh_quantization`, and the `KHR_materials_*` extensions Three.js reads (emissive strength, unlit, IOR, specular, transmission, volume, clearcoat, sheen); Draco, meshopt, and Basis textures are rejected with `400` until their decoders ship. Animations, skins, morph targets, cameras, extra scenes, and `KHR_materials_variants` are removed with warnings. Embedded textures must be PNG/JPEG/WebP within the image limits. Unnamed nodes and materials get `Node <n>` / `Material <n>`.
- **Draft:** `{ templateId, label, sourceFormat, sourceFile, nodes: [{ index, name, mesh, children }], rootNodes, materials, prefilledMetadata, metadataSource: "extras" | "default" | "version", nodeRules, rootTransform, rootMatrix, boundsMm: { min, max, size }, warnings, versions, createdAt }`. The node tree is a flat list with child indices. `prefilledMetadata` is the source's scene `extras.homeplan` when it passes `validateTemplateMetadata`, otherwise an `Areable` floor object (contact `bottom`, all axes `fixed`, one material slot per material; STL: `{ body: "Body" }`). After a save, the draft reflects the latest version.
- **Root transform:** `{ scale, upAxis, frontAxis }` (meters per source unit; the source axes that become glTF +Y and +Z). It is stored, not baked: each `vN.gltf` wraps the scene's nodes in one root node named `HomeplanRoot` whose `matrix` is the transform (omitted when identity). GLB/glTF imports start at `{ scale: 1, upAxis: "+y", frontAxis: "+z" }`.
- **Versions:** `metadata` is a `TemplateMetadata`; `nodeRules` (by node name) become node `extras.homeplan` (omitted: the draft's rules are kept); `label` overrides `metadata.label`. Metadata problems return `400 validation` at `/body/metadata/...` or `/body/nodeRules/<name>`; glTF Validator errors return `400` at `/gltf/...` with the validator code in the message. Versions are numbered from 1 and never rewritten.
- **Serving:** on disk `vN.gltf` references `geometry.bin` and `textures/<n>.<ext>` relative to its folder (any glTF viewer opens it). Over HTTP the URIs are rewritten so `GLTFLoader` resolves them against the document URL to `…/templates/:templateId/files/<uri>`: `vN.gltf` (served at `…/v/:version`) gets `../files/<uri>`, and `base.gltf` (served at `…/base`) gets `files/<uri>`. `files/*` serves only `geometry.bin` and `textures/<name>`.
- **List:** house templates with at least one saved version appear after the built-ins with `source: "house"`; drafts without a version are reopened by ID. `DELETE` returns `204`, or `409 referenced` with `details.references` (JSON Pointers) when any `templateId` in `house.json` names it; it removes the folder, which stays recoverable from Git history.

## Exports and renders

PNG preview/final images are rendered in the browser; the backend stores them when the user chooses save-to-project ([rendering and exports](../delivery/rendering-and-exports.md)).

| Method | Route | Purpose | Phase |
| --- | --- | --- | --- |
| `POST` | `/api/houses/:houseId/exports` | Save an export (multipart `preview`, `final`, `metadata` JSON) | 1 |
| `GET` | `/api/houses/:houseId/exports` | List exports | 1 |
| `GET` | `/api/houses/:houseId/exports/:exportId/:file` | `preview.png`, `final.png`, `metadata.json` | 1 |
| `DELETE` | `/api/houses/:houseId/exports/:exportId` | Delete an export | 1 |
| `POST` | `/api/houses/:houseId/renders` | Submit a photorealistic render job with the frozen snapshot (document, floor ID, camera, environment instant, asset versions). Returns `202 { jobId }`; `503` when unavailable | 2 |
| `GET` | `/api/houses/:houseId/renders/:jobId` | Job status `pending/running/completed/failed/canceled`, progress, and the result's export ID | 2 |
| `DELETE` | `/api/houses/:houseId/renders/:jobId` | Cancel | 2 |

Payload notes: the export `POST` takes `preview` and/or `final` PNG parts (at least one, each ≤ 100 MB, an implementation convention) and a `metadata` text field with `{ houseRevision, floorId, camera, renderSettings, renderer: { name, version }, simulationInstant, assetVersions? }`. The server stores `metadata.json` as `{ schemaVersion, id, houseId, createdAt, files: [{ name, widthPx, heightPx, byteSize }], metadata }`, returns it with `201`, and lists entries as `{ exports }`, newest first. Exports are ignored by Git.

Render job payload notes (schemas in `shared/contracts/renders.ts`):

- **Submit:** multipart `scene` (the active floor as GLB from Three's `GLTFExporter`, lights as `KHR_lights_punctual`, ≤ 256 MB) and `snapshot` (JSON text): `{ houseRevision, floorId, camera: { mode: "top" | "3d", position, target, up, fovDeg, orthoHeightM, aspect }, widthPx, heightPx (16–8192), environment: { sunDirectionWorld: [x, y, z], sunIntensity, timeInstant }, samples?, assetVersions? }`. Positions are Three.js world meters (y up); `sunDirectionWorld` points toward the sun. Returns `202 { jobId }`, `503 unavailable` without a renderer, `415` when `scene` is not a GLB.
- **Job:** `{ id, houseId, floorId, status, progress (0–1), stage, createdAt, startedAt, finishedAt, error, resultExportId }`. `error` is a fixed, sanitized message (for example `Blender exited with code 1. See the server log for details.`); file paths, Blender output and tracebacks are logged on the server only. `DELETE` cancels a pending or running job and returns the job (a finished job is returned unchanged). One job renders at a time; others wait in order.
- **Result:** a completed job saves an ordinary export (`final.png`, a ≤ 512 px `preview.png`, `metadata.json` with `renderer: { name: "blender-cycles", version }` and `renderSettings: { widthPx, heightPx, samples, device, engine, environment }`) and names it in `resultExportId`.
- **Storage:** `exports/renders/<jobId>/job.json` (`{ schemaVersion, job, snapshot }`, git-ignored with the rest of `exports/`). The uploaded scene and intermediate files are deleted when the job finishes. Job state is written under the house's write lock and only while the house is in `data/`.

Job state is persisted as JSON so an interrupted job is reported as `failed` after restart. Status is polled (about every 2 s, an implementation convention); there is no WebSocket in MVP. On startup, `pending` and `running` jobs become `failed` with `error: "Interrupted by a server restart"`, and a Blender process left by the previous server is killed.

## Preferences

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/preferences` | `{ revision, preferences }`, defaults merged |
| `PATCH` | `/api/preferences` | `{ expectedRevision, patch }` with allowlisted fields only ([application preferences](application-preferences.md)) |

Payload notes: `patch` may contain only `appearance.theme`, `appearance.colorScheme`, `appearance.customColors`, `editor.showGroundGrid`, `editor.navigation`, `homeAssistant.viewer` (the [HA viewer setup](../home-assistant/viewer-mvp.md#setup); its fields are merged), `homeAssistant.bindings` (the [HA bindings](../home-assistant/bindings.md#storage-and-migration), [D25](../decisions.md#d25-home-assistant-bindings): per listed house, each kind given (`lights`, `objects`, `effects`, `areas`, and since Phase 8.5 `bubbles`) replaces that kind whole; other kinds and houses are kept), and `homeAssistant.dashboard` (the [HA room-cards dashboard](../home-assistant/viewer-mvp.md#room-cards); replaced whole); any other key is `400 validation`. The patch is merged into the stored document, the merged document is validated against the preferences schema (`400 validation` with pointers under `/body/patch`, nothing written), and the response is the new `{ revision, preferences }`. A missing file reads as revision 0 with defaults.

## Phase 11: snapshot transfer and integration API

**Implemented.** Runtime/storage semantics are owned by [production integration](../home-assistant/production-integration.md). Contracts are authored in TypeBox and exported as JSON Schema for Python validation. This section owns both route maps so feature documents do not invent endpoints. All paths honor the respective deployment base.

### Builder source routes

These run on the existing **Fastify builder origin**, retaining its current no-auth/local deployment policy. They do not use HA tokens or expose Supervisor/ingress APIs. Only the integration's server-side source client needs them. No mutation here saves/edits the house or commits Git.

| Method | Route | Purpose/result |
| --- | --- | --- |
| `GET` | `/api/houses/:houseId/snapshot-source` | Latest explicit Save metadata; optional `baseRevisionId` query for ancestry comparison |
| `POST` | `/api/houses/:houseId/snapshots` | Freeze an export of current explicit Save; body `{ expectedSourceRevisionId? }`; return `201 { snapshotId, sourceRevisionId, expiresAt }` |
| `GET` | `/api/houses/:houseId/snapshots/:snapshotId/manifest` | Immutable manifest, including frozen migration metadata and resource map |
| `GET` | `/api/houses/:houseId/snapshots/:snapshotId/files/*` | Exactly one listed file's frozen bytes, not arbitrary house files |
| `GET` | `/api/viewer/frontend` | Latest available **production** frontend descriptor/compatibility; reports unavailable if no viewer artifact has been built |
| `GET` | `/api/viewer/frontend/:bundleId/manifest` | Immutable production frontend manifest |
| `GET` | `/api/viewer/frontend/:bundleId/files/*` | Declared immutable executable/frontend asset bytes only |

Extend existing `GET /api/capabilities` additively with `houseSnapshots: { formatVersions, viewerProtocols, producerVersion, limits }` and `viewerFrontend: { available, formatVersions, loaderProtocols, apiProtocols, limits }`; older sources omit it. Lists of supported positive integers are nonempty; limits name maximum manifest/house/asset/config/total bytes and file count. Compatibility is checked before import. Existing house cards remain working-copy metadata, so source house selection fetches `snapshot-source` before presenting the saved revision; cards are not evidence of a saved revision's name/date.

`snapshot-source` returns `{ houseId, sourceRevisionId, documentRevision, savedAt, producerVersion, relation }`. IDs are the house ID and a full Git object ID; `savedAt` is an ISO-8601 UTC instant. `relation` is `null` without a base, otherwise `same`, `newer` (base is an ancestor), or `different` (unrelated/unknown base, including a changed source). `documentRevision` is diagnostic, never an ordering key. No usable saved commit returns `422 invalidDocument`.

Export creation pins HEAD and its dependencies atomically with respect to source house operations. An optional expected commit mismatch returns `409 sourceRevisionChanged` without exporting another revision silently; query snapshot-source again for the current commit. Creation captures one preferences revision for migration. A repeated request may reuse the same immutable export; return its identity without mutating its contents. Expiration may be extended without changing identity. Bounded export preparation returns a controlled error on resource exhaustion; it must not materialize unbounded history in memory.

Manifest fields: `formatVersion`, `snapshotId`, `houseId`, `houseSchemaVersion`, `producerVersion`, `requiredViewerProtocol`, `sourceRevisionId`, `documentRevision`, `savedAt`, `createdAt`, `migration`, `files`, `resources`. `migration` is `{ preferencesRevision, viewer, dashboard }` using existing HA field shapes; `bindings.json` is `{ preferencesRevision, bindings }` for the selected house. It is a hashed migration seed, not a writable configuration endpoint. `resources` is `{ images: [{ id, path }], templates: [{ id, version, path, dependencies }] }`, where dependencies are manifest paths and entries are unique by resource key. Each file is `{ path, byteSize, sha256, mediaType }`. All required referenced resources must exist; `house.json` and `bindings.json` are required files, and `manifest.json` does not list itself.

`snapshotId` is lowercase 64-hex SHA-256 of the canonical manifest excluding `snapshotId` and `createdAt`; canonical JSON uses recursively sorted object keys and sorted file/resource/dependency arrays, UTF-8 encoding and no insignificant whitespace. It includes migration metadata and seed hashes. JSON numbers must be finite; no duplicate JSON keys are accepted at either boundary. Media types are restricted to JSON, glTF JSON/GLB, binary buffers, PNG/JPEG/WebP and any additional type explicitly supported by current import rules. File responses return declared media type and length; the integration also checks actual bytes/checksum. Unsupported formats/versions use `422 unsupportedVersion`; missing committed files use `422 invalidDocument` with a sanitized resource reference; expired/missing source exports use `404 notFound`; the client may explicitly create another export. Invalid IDs/paths use `400 validation`, unknown resources `404 notFound` (also every snapshot of a trashed or purged house: trashed exports stay on disk until purge but are not served), size violations `413 tooLarge`. Error bodies use the existing builder envelope.

The integration reads source houses from existing `GET /api/houses`. First-import configuration is captured inside the export; the browser never directly fetches builder preferences in production. The source exporter may use its existing preferences repository internally. Production export/download storage is bounded and isolated from tracked house files; expiry never deletes house history or active downloads.

### Frontend artifact contract

The source descriptor and manifest share the authoritative `FrontendManifest` shape: `{ formatVersion, bundleId, version, createdAt, entry, loaderProtocol, apiProtocol, minimumIntegrationVersion, files }`. Files are `{ path, byteSize, sha256, mediaType }`; counts/totals are derived. Version 1 supports one self-contained production `viewer.js`, with Lit/Three/shared dependencies bundled inline and no secondary runtime files. `bundleId` is a 64-hex SHA-256 over canonical manifest identity excluding `bundleId`/`createdAt`. The producer validates the complete bundled graph; HA validates schema, single entry inventory, protocol/minimum-version compatibility, paths/limits and all transferred hashes before activation. Frontend and house identities remain separate.

Source errors use the existing envelope; missing artifact `404 notFound`, no built production offer `404 notFound`, invalid/unsupported package `422`. Vite dev entry code is not a production upgrade artifact. Neither source endpoint executes code or installs Python. Full storage/activation semantics are in [panel upgrades](../home-assistant/production-integration.md#upgrading-the-panel-frontend-from-floor-builder).

### HA integration routes

These run on the **HA origin** through authenticated integration views. Every house/config/source route requires HA authentication; every mutation and source discovery/check requires existing HA admin. Native Configure is recovery access to the **same HA Store URL/DEV MODE and frontend pointers**, not another config-entry options authority. Public static/executable routes below contain code only. Domain errors use the existing envelope alongside HA's 401/403 handling.

| Method | Route | Access | Purpose/result |
| --- | --- | --- | --- |
| `GET` | `/api/homeplan/bootstrap` | Authenticated | Shell startup `{ revision, connection, viewer, frontend, protocols, recovery }`; contains the non-secret shared source base/policy needed for remote code, no credentials |
| `GET` | `/api/homeplan/config` | Authenticated | `{ revision, configuration }`; the validated configuration envelope including read-only copy/frontend/source-association metadata; PATCH cannot write internal pointers |
| `PATCH` | `/api/homeplan/config` | Admin | `{ expectedRevision, patch: { viewer?, dashboard?, bindings? } }`; return new envelope |
| `GET` | `/api/homeplan/client-address` | Admin | `{ address }`: the requesting browser's IP as HA sees it (HA's trusted-proxy rules apply), `null` for loopback/unparsable. House setup proposes `http://<address>:5173/` while the URL is empty (owner, 2026-11-17); read-only, nothing stored |
| `GET` | `/api/homeplan/connection` | Admin | `{ revision, connection: { builderUrl, devMode, generation, origin, servers } }`; `origin` is `manual`, `discovered` or null; `servers` lists the other floor planners (Phase 21), never the default ([discovery](../home-assistant/production-integration.md#discovered-homeplan-app)) |
| `PATCH` | `/api/homeplan/connection` | Admin | `{ expectedRevision, patch: { builderUrl?, devMode?, servers? } }`; save the default floor planner's URL/mode and the other floor planners (normalised like the URL, duplicates and the default dropped, at most 16; a new default moves the previous one first into `servers`) without a network prerequisite |
| `POST` | `/api/homeplan/source/connect` | Admin | `{ expectedRevision }`; probe saved source, return `{ generation, connectedAt, houses, frontendOffer }` for the settings list/Panel section |
| `POST` | `/api/homeplan/source/peek` | Admin | `{ url }` → `{ url, houses }`: another floor planner's house list, read only (Phase 21, Settings → Houses); nothing is stored |
| `POST` | `/api/homeplan/source/houses/:houseId/use` | Admin | `{ expectedRevision, generation }`; use a verified stored house/import if DEV MODE off, or validate/use current remote house if on; `200 { revision, configuration }` or `202 { job }` if first local import is needed |
| `GET` | `/api/homeplan/source/houses/:houseId` | Admin | `{ checkedAt, ...sourceMetadata }`, latest Save/ancestry without download |
| `GET` | `/api/homeplan/houses` | Authenticated | Stored local cards/copy status, available even offline; connected source rows are merged by the House setup service |
| `GET` | `/api/homeplan/houses/:houseId` | Authenticated | Active stored copy metadata; `404` if no local copy |
| `GET` | `/api/homeplan/houses/:houseId/snapshots/:snapshotId/manifest` | Authenticated | Pinned local house manifest |
| `GET` | `/api/homeplan/houses/:houseId/snapshots/:snapshotId/document` | Authenticated | Pinned `{ revision, document }` |
| `GET` | `/api/homeplan/houses/:houseId/snapshots/:snapshotId/files/*` | Authenticated | One manifest-allowlisted private file |
| `POST` | `/api/homeplan/houses/:houseId/upgrade` | Admin | `{ expectedSourceRevisionId?, generation }`; `202 { job }`; latest explicit Save into this house's stored copy, without selecting another house |
| `GET` | `/api/homeplan/remote/houses/:houseId/document` | Authenticated | Current `{ generation, revision, document }` from the same saved source |
| `GET` | `/api/homeplan/remote/houses/:houseId/templates/:templateId/v/:version` | Authenticated | Current built-in GLB/house glTF with authenticated safe dependency rewrites |
| `GET` | `/api/homeplan/remote/houses/:houseId/templates/:templateId/files/*` | Authenticated | Only validated remote template dependencies |
| `GET` | `/api/homeplan/remote/houses/:houseId/images/:imageId/file` | Authenticated | Current source house image |
| `GET` | `/api/homeplan/frontend` | Authenticated | Shipped/current/previous local descriptor, effective compatibility/status; source offer comes from explicit Connect/check |
| `POST` | `/api/homeplan/frontend/upgrade` | Admin | `{ expectedBundleId?, generation }`; `202 { job }`; fetch/verify/activate compatible source production bundle |
| `POST` | `/api/homeplan/frontend/restore-packaged` | Admin | `{ expectedRevision }`; clear downloaded-code preference, retain local houses/config/DEV MODE; return `{ revision, frontend, reloadRequired: true }` |
| `POST` | `/api/homeplan/frontend/use-previous` | Admin | `{ expectedRevision }`; the previous downloaded panel again after it is verified; it swaps places with the current one (`404` without a previous one) |
| `GET` | `/api/homeplan/houses/:houseId/archive` | Authenticated | The local copy as a house archive (`application/zip`: its `manifest.json` and files, Phase 21) |
| `POST` | `/api/homeplan/houses/import[?replace=1]` | Admin | Raw `application/zip` body (≤ 1 GiB): a house archive becomes a local copy after every file is verified; an existing copy of the same house is `409 conflict` unless `replace=1` (its bindings kept); returns `{ houseId, outcome: imported \| upgraded \| unchanged, revision }` |
| `GET` | `/api/homeplan/jobs` | Admin | Active and bounded recent job history |
| `GET` | `/api/homeplan/jobs/:jobId` | Admin | `{ job }` |
| `DELETE` | `/api/homeplan/jobs/:jobId` | Admin | Request cancellation; return truthful terminal/current state |
| `GET` | `/homeplan/frontend/:bundleId/files/*` | Public, code only | One verified downloaded frontend manifest file; no house/config/source data or arbitrary filesystem access |

Packaged loader/baseline files under `/homeplan-static/` are registered through HA's static path mechanism. The downloaded-code route intentionally has no `/api` house prefix and serves only the verified artifact inventory, with immutable bundle-keyed caching. Authenticated house/config/bootstrap/job responses are private/no-store. A browser module does not receive an HA token in its query string or expose source credentials. The loader uses the current HA transport for bootstrap, resolves a single effective remote/local/fallback mode and launches one implementation.

The connection record defaults to `{ builderUrl: null, devMode: false, generation: 0, origin: null, servers: [] }` (an envelope stored before Phase 21 gains `servers: []` on load). A PATCH that changes the URL records `origin: "manual"`; enabling DEV MODE is refused (`400 validation`) while `origin` is `discovered`. Source generation advances **only on normalized URL changes**. Toggle-only changes increment config revision, retain the connected house list/source identity and take effect after a full browser reload for the same selected house; no second Use click is required. Native recovery and settings use the same serialized mutation. Saving cannot be blocked by unreachable source, especially when disabling DEV MODE; validate URL syntax and require a URL before enabling it. Normal Connect checks house export capability; remote development additionally needs the compatible viewer entry from that same base. Save URL/Connect never select or import a house.

Connect returns the source generation so obsolete results cannot populate the list. Use checks that generation and its baseline config revision, then selects only on successful validation/import. Local mode uses a stored copy first, importing a saved source revision if absent; remote mode uses current working data without creating a fake snapshot. A failed use preserves selection. If another Use intent supersedes a pending import, the imported copy may finish but must not replace the newer selected house. Selection success publishes one viewer/sidebar session change; the sidebar immediately reads the selected house/HA config. No persisted `selection.sourceMode`, `panelFrontend` or duplicate developer URL is allowed: `viewer.houseId` plus the one connection policy and per-load outcome determine the mode.

House Upgrade works for a non-selected house too and never switches to it. Selected-local-house success updates scene/sidebar after resources are ready; remote-mode success updates the stored fallback copy only. Frontend Upgrade atomically updates the local code pointer after complete verification and asks for full browser reload. During DEV MODE it upgrades local fallback without replacing the live remote application. Both jobs merge against latest internal HA state so accepted binding saves survive. An identical artifact returns `outcome: unchanged` and does not reset the scene/settings.

Remote resource reads require saved DEV MODE on, the selected house and a generation/source association matching the configured URL. The read-only `houseSources` map is populated on successful explicit selection/import; changing URL cannot silently reinterpret a house ID. Construct destinations in the source client from current builder routes; reject client URLs, traversal and unlisted dependencies. Use fresh per-load caching/revalidation for dev document, code and assets. On unavailable/incompatible remote code/data, the shell visibly selects both local code and stored house; a post-evaluation failure uses one guarded page reload to avoid competing custom-element definitions. Keep saved DEV MODE unchanged and retry remote only on explicit refresh/Retry. Missing local data gives the Setup your home state. Existing loaded remote scenes may report stale data until the requested reload; no mid-frame transport/code replacement occurs.

`PATCH config` allows viewer/dashboard/bindings only: viewer fields merge; dashboard replaces whole; supplied binding kinds replace by house/kind and preserve other houses/kinds. Selection must identify a usable stored or validated remote house through Use; no client-writable snapshot/frontend/migration pointers. Connection updates are disjoint immediate fields; Settings drafts retain unrelated unsaved edits. Real mutations increment config revision once; no-op returns it unchanged. `409 staleRevision` retains the draft for explicit reconciliation, never automatic overwrite with a freshly fetched revision. Source generation mismatch returns `409 sourceChanged` and old list/use results are ignored.

Copy metadata remains `{ houseId, snapshotId, sourceRevisionId, documentRevision, savedAt, importedAt, producerVersion, fileCount, byteSize, sourceUrl, previousSnapshotId }`; local card names/floor counts come from the copied document. Frontend descriptors follow the frontend contract plus the shipped/active/previous manifests; jobs carry activation completion times. Stored house integer revision, Git commit, frontend bundle ID/version and HA config revision are distinct. Source/house lists include typed invalid/problem entries, never host filesystem paths.

Jobs use `IntegrationJob` from `shared/contracts/homeplanIntegration.ts`: `kind: houseUpgrade | panelUpgrade`, `id`, nullable `houseId`, discovered nullable `snapshotId`/`bundleId`, `status`, `stage`, file/byte progress, created/updated/finished times, sanitized nullable `{ code, message }` error and nullable flat `outcome: imported | upgraded | unchanged`. Active metadata is read from config/copy/frontend after completion, rather than duplicated in a job result. Status is pending/running/completed/failed/canceled; stages are checking/downloading/verifying/activating. Duplicate starts coalesce per target; at most four transfers run, and the last 20 terminal jobs plus active jobs are retained. Poll about once per second only while active. Startup reconciles persisted discovered artifact IDs with durable active pointers after an uncertain final acknowledgement. A cancellation after activation begins waits for truthful completion rather than undoing a committed pointer.

Domain errors include `409 sourceChanged`, `409 staleRevision`, `409 upgradeInProgress`, `410 snapshotExpired`, `413 tooLarge`, `422 checksumMismatch`, `422 missingAsset`, `422 incompatibleSnapshot`, `422 incompatibleFrontend`, `422 integrationUpdateRequired`, `422 invalidDocument`, `503 sourceUnavailable`, `503 integrationUnavailable`, `507 insufficientStorage`. All transfer failures leave prior durable copies/code/settings intact. Expired pinned resources never redirect to current. Frontend upgrade cannot modify Python/component files or run downloaded backend code.

## Not in the MVP API

- Floor, area, wall, or object routes: all model edits travel in the full document.
- Authentication, users, or sessions ([D12](../decisions.md#d12-user-identity-and-access)).
- Controllables manifests, scene packages, and dashboard URLs ([Home Assistant](../home-assistant/README.md)).
- Git remotes and import/export between installations. (Clone within one installation is `POST /api/houses/:houseId/clone`.)

## Verification

- Every route validates its parameters and body against shared schemas and returns the error envelope on failure.
- A `PUT` with a stale `expectedRevision` returns `409 staleRevision` and leaves the file unchanged.
- An image upload during unsaved edits does not change the document revision.
- `POST /revisions` after a working write produces exactly one commit; calling it again with no changes creates none.
- Restoring a revision returns the restored document and records a new commit.
- Deleting a referenced image or template returns `409 referenced`.
- Route IDs that are not valid IDs return `400`, never a filesystem lookup.
