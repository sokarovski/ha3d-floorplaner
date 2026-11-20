# Screen 1: Houses

Updated: 2026-11-19.

Status: MVP Phase 1, implemented; restyled in Phase 5.10. The card listing and folder data source are owner requirements; lifecycle behavior is resolved in [D14](../../decisions.md#d14-project-management-and-names).

## Purpose

Show every saved house in the installation (houses are global; [D12](../../decisions.md#d12-user-identity-and-access)).

## Requirements

- Present the houses in a basic card view.
- Include one card for each house.
- Selecting a house opens the [Floor Builder](floor-builder.md). Every house has at least one floor.
- Populate the list from the folders directly inside the application's `data/` directory: every house has its own folder.
- Expose houses as a simple backend API resource. The frontend obtains the house list through this API.
- Keep folders and their JSON files as the source of truth, without a database or a separate persistent house index.

## Storage mapping

Each direct child directory of the configured `data/` root represents a house. The backend enumerates these directories; nested assets/exports and ordinary files must not become house cards. Return card metadata rather than loading every scene or asset.

The [persistence specification](../../architecture/persistence.md) owns the canonical tree, metadata validation, fallback behavior, and naming rules. `house.json` holds the stable house ID and display name; the folder is named by the ID, so renaming changes only the label.

## API contract

The routes (list, create, rename, trash, restore, purge) are owned by the [API specification](../../architecture/api.md#houses).

Resolve resource identifiers on the backend and apply the path validation and save rules in the [persistence specification](../../architecture/persistence.md). The list response should contain card metadata rather than loading every house's complete 3D scene or assets.

A new house is created with its first floor, `Etage1`, already in `house.json`, so there is no separate ensure-floor operation ([D14](../../decisions.md#d14-project-management-and-names)).

## Lifecycle controls

Each card has a menu with Rename, **Clone**, and Delete (an invalid card offers only Move to trash). Clone is one click: it creates "<name> (copy)" from the house's last saved state with a fresh history of one revision and adds its card to the grid; the original is not changed (Phase 7.13, owner request 2026-11-16). A **New house** action creates a house from a display name, and its folder is named by the generated ID. Deleted houses can be restored from a **Trash** view on this screen, where each row has Restore and a permanent Delete behind a confirmation. Rename and New house are `FormPopup`s; the confirmations are plain `Popup`s ([forms](../../design-system/README.md#mvp-forms)). See [D14](../../decisions.md#d14-project-management-and-names).

The header holds the page title, pill navigation **Houses** / **Trash** (the Trash pill shows the count when the trash is not empty), a **Settings** button that opens the [Settings popup](../../design-system/README.md#mvp-forms), **Upload house** and **New house**. **Upload house** (Phase 21) is a `FormPopup` with a file field for a house archive (.zip, as Home Assistant's Settings → Houses downloads it); the archive becomes a new house and opens. When its house name is in use, a second `FormPopup`, **Name the uploaded house**, offers the name with the next free number (" (2)") to keep or change ([API](../../architecture/api.md)). The same quiet **AI agent instructions** link as the Floor Builder (to the [browser automation](../../architecture/browser-automation.md) guide) floats at the bottom right of the screen (owner, 2026-11-19).

## Agent tools

While this screen is mounted, `window.homeplan` exposes the [Houses-level bridge](../../architecture/browser-automation.md#houses-level-bridge) (`describe().level === "houses"`; owner request 2026-11-19): `list_houses`, `create_house`, `clone_house`, `rename_house`, `trash_house`, `list_trash`, `restore_house`, and `open_house`. The tools call the same house resource client as the controls above, and the visible lists refresh after each agent change. Permanent delete has no tool; it stays behind the Trash view's confirmation. Leaving the screen disposes the bridge, and the Floor Builder's editor bridge takes over when a house opens.

## Presentation

MVP defaults (review inference):

- **Cards:** borderless `surface` cards on the canvas with a soft hover lift; each shows the house name, floor count, and last-modified time; the card menu appears on hover (Phase 5.10). Thumbnails are post-MVP.
- **Order:** most recently modified first. There is no search or filter in MVP.
- **States:** loading skeleton cards; an empty state with a Create house action; an API error with Retry; a dismissible danger banner when an action fails; and a warning card for a house with invalid metadata (its ID and problem), which can still be moved to trash. The trash list shows rows, an empty message, and its own loading and error states.
