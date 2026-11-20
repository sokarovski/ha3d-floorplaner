# Folder and JSON persistence

Updated: 2026-11-19.

Status: folder/JSON storage, one `house.json` per house containing its floors, house-owned `textures/`, full-JSON saves, Git-style revision history, and server-owned asset metadata are owner requirements. Naming, deletion, durability, and Git details are resolved in [D09](../decisions.md#d09-saving-cancellation-and-model-undo) and [D14](../decisions.md#d14-project-management-and-names). Schemas are implementation work.

## Storage ownership

The backend owns discovery, validation, reads/writes, asset serving, and export metadata. The browser communicates over HTTP; it does not have unrestricted filesystem access. Use a configured absolute data root, such as `DATA_DIR`, outside the frontend public directory.

```text
<storage-root>/
  config/
    application-preferences.json    # global preference document (D12)
    demo-seeded                     # first-start demo seeding is done (see Demo houses)
  trash/                            # deleted houses (D14); outside data/
  transfers/<house-id>/<snapshot>/  # frozen HA snapshot exports (api.md#phase-11-snapshot-transfer-and-integration-api)
  data/
    <house-id>/                     # folder name = stable house ID (D14); a Git repository (D09)
      .git/                        # revision history, managed by the backend
      .gitignore                   # ignores exports/ and temp files
      house.json                   # the whole house model: metadata, units, environment, cap material,
                                   # material presets (D19), floors → areas; references assets by ID
      textures/                    # required image location (JPEG/PNG/WebP, D19)
        images.json                # server-owned image index (D14); never written by the client
        <image-id>.png
        <image-id>.thumb.webp
      assets/
        templates/
          <template-id>/           # glTF template (D07, D17): source.glb|gltf|stl, base.gltf (normalized,
                                   # no metadata), geometry.bin, textures/, draft.json (Object Editor
                                   # draft), vN.gltf versions, thumbnail.svg
      exports/
        <export-id>/
          metadata.json
          preview.png
          final.png
        renders/
          <job-id>/job.json        # photorealistic render job state
```

The direct house/floor hierarchy and `textures/` placement are owner requirements; the other names are resolved conventions. Folders are created on first use: a new house has only `house.json`, `.gitignore`, `.git/`, and `textures/images.json`; `assets/templates/` appears with the first imported model and `exports/` with the first export. Built-in templates are not copied into houses; they ship in `server/builtin-templates/` ([API](api.md#templates)). Likewise built-in textures (`builtinimg_…`, Phase 17.1) ship in `server/builtin-materials/` and are never copied into a house's `textures/` ([API](api.md#images)). Other entries under the storage root, such as `debug/` (SVGs written by `npm run geometry:walls`), are not read by the server. Absolute deployment paths are configurable; this tree is relative to the application's configured storage locations. Runtime data is independent of application source/build output.

Keep global application preferences outside the house-listing root. Keep asset bytes in files. **Asset metadata is server-owned**: the image index is `textures/images.json`, and each template's metadata is its own folder. `house.json` holds model data only and references assets by stable ID. The [model specification](../builder/model.md) owns authoring entities; [application preferences](application-preferences.md) owns global settings.

## Demo houses

A new installation starts with three demo houses: **Demo: City apartment**, **Demo: Garden bungalow** and **Demo: Family house**. Their documents are generated, not copied from any data folder: `npm run demo:build` builds them from the fixtures in `scripts/fixtures/demoHouses/`, checks them (house schema and rules, RealAllWalls, roofs, the furniture layout) and writes `server/demo-houses/<slug>.json`, which ship with the server. The output is deterministic (IDs derived from the house's slug), and the documents reference only built-in templates and built-in materials, so a demo house has no images or house templates.

On startup, after the storage tree is prepared, the server seeds the demo houses when all of these hold (implementation conventions, `server/services/demoSeedService.ts`):

1. `HOMEPLAN_SEED_DEMOS` is not `0` or `false` ([deployment](../delivery/deployment.md#implemented-setup)); when it is, nothing is seeded and no marker is written.
2. `config/demo-seeded` does not exist.
3. `data/` and `trash/` contain no folders. An installation that already holds houses (or trashed ones) gets the marker without seeding, so it is never seeded later.

Each demo document is validated like a stored `house.json` (migration, schema, integrity) and becomes a new house exactly as Create house makes one: a new house ID, a new empty folder with `.gitignore`, an empty `textures/images.json` and `house.json` (revision 0), a fresh Git repository and **one** commit, "Create demo house". Then `config/demo-seeded` is written (JSON: `seededAt` and the created house IDs). Seeding therefore happens at most once: renaming, trashing or purging a demo house never brings it back. An invalid file or a failing house is logged and skipped; when no house could be created, no marker is written and the next start tries again. Seeding errors never stop the server.

`npm run seed:demo-houses` is the developer command for a running server: it creates the demo houses that are missing (by name) or, with `--replace`, rebuilds existing ones in place as a new Save revision, from the same fixtures.

## Discovery and naming

Enumerate the data root's direct child directories to discover houses. Ordinary files are not houses; nested asset, export, and `.git` directories are not additional houses. Missing or invalid house metadata needs an explicit visible status or fallback; do not silently hide a directory.

A house's floors live in its `house.json`. Report an invalid or unreadable `house.json` instead of treating the house as empty, and never replace it with defaults. Listing houses or opening Object Editor never creates data.

Floor names are properties inside `house.json`, so renaming a floor touches no folders. They are trimmed, NFC-normalized, 1–64 characters, and unique within the house case-insensitively ([D14](../decisions.md#d14-project-management-and-names)). House folders are named by stable ID, so path validation applies only to IDs and asset paths.

## Document contract

- Persist a schema version, stable document/entity IDs, and a document revision. Template versions identify reusable definitions; they are distinct from a document's save revision.
- House-level metadata owns project units and shared environment. Floors own areas and their authoring objects. Card bindings stay outside the authoring documents.
- Validate on read and before write, and supply explicit schema migrations. Unknown versions or corrupt documents must not be overwritten with empty defaults.
- Reference assets by stable IDs and server-resolved relative paths. Verify resolved paths stay within the configured root, including symlink handling.
- Persist the guides: source shapes/vertices, group-local transforms, walls with their source-edge anchors and spans, and semantic objects. Canonical lengths use 1 unit = 1 mm. RealFloor, RealWall, RealAllWalls, and meshes are derived; they may be cached with source revisions but are never persisted as editable data.

A snapshot is the house document revision plus the template and asset versions it references. Exports record these together with the rendered floor's ID.

## Save and concurrency contract

1. Accept the **complete validated document** against an expected document revision. Saves never send patches.
2. Serialize writes per house and reject stale revisions with a conflict response rather than silently overwriting newer data.
3. Write a temporary file in the same directory, fsync it, rename it over the target, and fsync the directory. Acknowledge only after this sequence completes. On startup, remove stale temporary files.
4. **Working writes** (automatic, about 1.5 s after the last edit) stop here. An explicit **Save** additionally creates one Git commit of the house folder once the pending `house.json` is written. The commit is the restorable revision.
5. All model data is one document, so every save is a single atomic file replacement. Uploads never touch `house.json` or its revision: they write the asset file first and then its entry in the server-owned index (`textures/images.json`) with the same atomic sequence. A file without an index entry, left by a crash, is removed on startup.
6. A saved document may reference an asset ID that is missing from the index. The save is accepted, and the asset renders with a placeholder material and a visible warning.

Implementation conventions (`server/repositories/`): temporary files are named `.<target>.<random>.homeplan-tmp` next to their target. One in-process promise queue per house serializes every write to that house (document, rename, image index, exports, template imports, render job state, commits, restore, trash moves); preferences have their own queue. Each queued write re-checks that the house is still in `data/` (an upload or render may have started before a trash), and the atomic write never recreates a missing house folder: it creates missing directories only below an existing house folder (or none at all). Trash runs the house-removal hooks inside the queue first: render jobs of the house are dropped from the render queue, a running Blender process is stopped and awaited, and unfinished jobs are recorded as `canceled` before the move. On startup the backend creates `config/`, `trash/`, and `data/`, removes every `*.homeplan-tmp` file under the storage root (skipping `.git/`), removes `textures/` image files and thumbnails without an index entry (skipped when the index itself is corrupt), removes export folders without a valid `metadata.json`, and removes `transfers/<houseId>/` snapshot exports of houses that are neither in `data/` nor in `trash/` (purge removes them too; a trashed house keeps them, unserved, until purge). Exports write their PNGs first and `metadata.json` last. Every path is resolved under the storage root and re-checked with `realpath` so symlinks cannot escape it.

### Revision history

Each house folder is a Git repository, created with the house. The backend manages it with a pure-JavaScript Git implementation, isomorphic-git (pinned in `package-lock.json`), so no Git installation is required. Line-level JSON diffs use jsdiff (the `diff` package).

- **Author:** one fixed installation identity, because there are no users ([D12](../decisions.md#d12-user-identity-and-access)).
- **Committed:** `house.json`, templates, image files, and `textures/images.json`, so any revision restores completely. Ignored: `exports/` and temporary files.
- **History panel:** lists revisions with time and changed documents, shows a JSON diff against the current state, and restores a revision. Restoring writes that revision's files and commits them as a new revision; it never rewrites history and is not Undo.
- **Commit messages** list the changed files; an optional user note can be added on Save.
- Git revisions are separate from the `house.json` `revision` counter, which stays the stale-write check.
- **Conventions (implemented):** the author is `Homeplan <homeplan@localhost>`; the branch is `main`. A commit message is a subject line (`Create house`, the Save note or `Save`, or `Restore to <short-id>: <original subject>`), a blank line, and `Changed files:` followed by one `- <path>` line per changed file. `.gitignore` contains `exports/` and `*.homeplan-tmp` and is itself committed.
- **Restore (implemented):** the restored `house.json` gets revision = current + 1, so the counter stays monotonic and the client's next `expectedRevision` is the returned one. The revision's image and template files are written back; the image index is the revision's index plus any working entries the revision does not know, so a restore never deletes an uploaded image (the library is additive, like Undo). The restore is always recorded as a new commit.
- An off-machine remote (for example pushing to GitHub) is post-MVP.

Initial recommendation: one backend writer process for a data directory. Multiple backend replicas require a separate coordination design before support is claimed. Expected-revision checks protect against unexpected stale/retried writes without making concurrent editing a supported feature.

MVP scope is one active house-editing session, without cross-tab collaborative editing, broadcasts, automatic merge, or shared history. Keep expected-revision checks and serialized writes only as basic integrity/retry safeguards. An unexpected stale writer is refused with a simple recovery path; it does not require a collaboration feature.

Do not copy user-preference field merging into geometry edits automatically. A stale wall/footprint edit can invalidate attachments and must follow a defined document conflict policy. See [editing lifecycle](../builder/editing-lifecycle.md) and [D09](../decisions.md#d09-saving-cancellation-and-model-undo).

## Model history and file layout

Undo/redo works on authored model transactions on the house document. The [history design](../builder/undo-redo.md) addresses entities by stable ID; saves write the whole `house.json`.

History stores reversible model changes in memory, not one extra persisted house file for every edit. Server revisions, asset indexes, exports, and filesystem side effects are excluded. Keep uploaded assets/template versions needed by current data or surviving history; removing a model reference does not automatically delete file bytes.

Because asset metadata never lives in `house.json`, the client's full document contains only model data it owns. A model Undo therefore cannot erase a later upload, and the server never merges fields into a saved document.

## Backup, assets, and deletion

The house's Git history is its revision backup. Copying the house folder, including `.git/`, backs up the whole house with its history. Document restore procedures. Renaming display labels must not break asset IDs or card bindings.

Image upload validation, browser serving, and texture mappings are specified in the [image library](../builder/features/house-images.md). Asset replacement/deletion needs reference checks; exporting a JSON asset reference without its required bytes is incomplete.

Deletion is recoverable: houses move to `<storage-root>/trash/`, with restore and explicit purge actions. Deleted floors are recovered with Undo or from Git history ([D14](../decisions.md#d14-project-management-and-names)). Images can be deleted only when unreferenced, including by history. Template versions are retained while referenced ([D07](../decisions.md#d07-template-library-and-updates)). Missing assets render with a placeholder material and a visible warning. A house is duplicated with **Clone** ([API](api.md#houses), [Houses](../builder/screens/houses.md)); the clone starts a fresh Git history.

## Verification

- Saved models and referenced assets survive reload, backend restart, and backup/restore.
- Each explicit Save creates exactly one Git commit; working writes create none. Restoring a revision brings back its documents and assets and is itself recorded as a new revision.
- Stale expected revisions are rejected as an integrity safeguard; unrelated global preference fields survive updates. Cross-tab collaboration is not an acceptance requirement.
- Uploading an image while edits are unsaved does not change the `house.json` revision or make the next save stale.
- A new house contains exactly one floor, `Etage1`; a corrupt `house.json` is never replaced with defaults.
- Floor renames preserve stable IDs.
- Interrupted writes leave a recoverable document; invalid data is not acknowledged as saved.
- Exports identify all inputs in their snapshot and do not change underneath an active render.
