# Homeplan custom integration

Installable component for Home Assistant. It hosts the Homeplan viewer, stores private saved-house copies and HA bindings, and works without the builder after an import. No YAML is required.

## Install

1. Through Marketplace (HA 2026.11+): **Settings → Marketplace → Add from link** with `https://github.com/sokarovski/ha3d`, then install Homeplan. Or manually: create `/config/custom_components/homeplan/` and unzip the release ZIP (`homeplan.zip`, or `homeplan-<version>.zip` from `npm run ha:package`) **into that folder**. The archive holds the integration's files at its top level, so this produces `/config/custom_components/homeplan/manifest.json`. Do not put it under `www`. When updating manually, replace the folder's contents.
2. Remove the old Homeplan `panel_custom` YAML entry if it still exists; this integration will report a sidebar-path conflict rather than overwrite it.
3. Restart HA. If the Homeplan app runs on this HA, Settings → Devices & services shows Homeplan under **Discovered**: **Add** and confirm, and its address is saved for you. Otherwise use Add integration → **Homeplan**.
4. Open **Homeplan** in the sidebar. The gradient screen has **Setup your home**. It opens House setup without requiring a source to be running.
5. Unless the app's address was found automatically, paste your Floor Builder base URL. Press **Connect**. Use a URL reachable from HA; for DEV MODE it must also be reachable from your browser and serve the viewer entry. Typical development example: `http://<builder-machine>:5173/` with `npm run dev` running.
6. Press **Use this house**. Normal mode copies the latest explicit builder **Save**, its used GLBs/glTF files/images, and initial settings. The house and its settings populate the canvas/sidebar. A working autosave alone is not an explicit Save.

The builder must serve the snapshot source endpoints of this repository's version. Restart a builder process still running older code. A production viewer offer requires `npm run build:ha-viewer` on that machine (also included in `npm run ha:package`). Normal imports can use the backend URL when it is listening on an HA-reachable interface (`HOST=0.0.0.0`), for example `http://<builder-machine>:4310/`; DEV MODE needs the Vite/shared module-and-API URL.

## Operation

- **Upgrade** beside a house copies its latest explicit Save into HA. It preserves HA-owned bindings, bubbles, dashboards and viewer settings. Upgrading another house does not select it. Failed transfers preserve the previous complete copy.
- **DEV MODE** is one saved switch for both remote viewer code and the selected house's current server working data. Save, then **Reload page**. Each fresh page load fetches current remote code/data; no Git Save is needed for development working changes. Disabling it and reloading uses local code and the stored house.
- If the remote source fails, the packaged loader visibly falls back locally, retains DEV MODE, and tries remote again on manual refresh/Retry. A house first used only remotely has no stored fallback until imported/upgraded; the local setup/recovery screen explains this rather than showing a different house.
- **Upgrade panel** copies a compatible **production** UI bundle from the same source. It verifies the complete artifact before activation; reload to apply. It does not download Python or change installed component files. A frontend requiring new integration APIs must wait for a normal component update.
- In HTTPS HA, use an HTTPS dev server with a trusted certificate. An HTTP development module is blocked by the browser. Set `HOMEPLAN_HA_ORIGINS` on the builder/Vite server to the exact HA origin if it differs from the configured default.

Settings → Devices & services → Homeplan → **Configure** can edit the **same** URL/DEV MODE if the viewer cannot open. Disable DEV MODE to return to local data, or choose **Restore packaged frontend** to bypass downloaded UI code. Save and reload the browser. No second developer mode/URL exists in this recovery form.

## Storage, backup and removal

House copies live at `/config/homeplan/houses/<houseId>/<snapshotId>/`; downloaded frontends live at `/config/homeplan/frontend/<bundleId>/`. They are outside `www`. Private house/config routes require HA authentication; configuration/import/upgrade routes require HA admin. Only executable UI bundles are public.

HA Store files `.storage/homeplan.configuration` and `.storage/homeplan.jobs` hold the single installation-global configuration and bounded job history. Back up the **whole `/config/homeplan` directory plus those Store files and HA's config entries**. Verify your backup selection includes these files. This component does not install its own backup scheduler. Integration unload/removal retains local data; there is no automatic permanent-data purge. Upgrade component files by replacing `custom_components/homeplan` and restarting HA; preserve `/config/homeplan` and `.storage`.

## Compatibility and delivery status

Minimum target: HA 2025.7 / Python 3.13. Implementer checks run against actual HA 2025.7.4 APIs in an isolated temporary instance. This is a custom integration, not an HA Core-approved integration. Other HA versions, large-house performance, backup products and physical device behavior are not covered by these automated checks.

The project is MIT licensed; bundled dependency licenses are in THIRD_PARTY_NOTICES.md. Marketplace installs from the generated repository [sokarovski/ha3d](https://github.com/sokarovski/ha3d), whose content is `dist/ha3d/` from `npm run ha:package`; documentation and issues live in [ha3d-floorplaner](https://github.com/sokarovski/ha3d-floorplaner).

A manually entered Floor Builder URL is never replaced by a discovered app; Configure offers **Use the discovered Homeplan app** instead. DEV MODE is only for a builder on your own computer and is unavailable while the URL is the discovered app.

## Build and verification (source checkout)

```sh
npm ci
npm run lint
npm run typecheck
npm run build:ha-viewer
npm run ha:package
```

The archive (integration files at its root) and SHA-256 file are written to `dist/`, with `dist/ha3d-release/homeplan.zip` (release asset) and `dist/ha3d/` (the Marketplace repository tree). Generated `frontend/` and `schemas.json` are build outputs, ignored in Git and recreated during packaging; brand images come from `npm run brand:build` and are committed. No Node/Vite runtime is needed on HA. The package is built from an allowlist (tracked component files plus those named outputs) and fails on any other file; `package.json` `version` must match `manifest.json` and `const.py` (`npm run version:check`).

HA Python checks use a separate temporary environment; they do not install development tools on HA:

```sh
uv venv --python 3.13 /tmp/homeplan-ha-check
uv pip install --python /tmp/homeplan-ha-check/bin/python -r scripts/ha-check-requirements.txt
npm run build:ha-viewer
HOMEPLAN_HA_PYTHON=/tmp/homeplan-ha-check/bin/python npm run ha:check
MYPYPATH=typings /tmp/homeplan-ha-check/bin/mypy custom_components/homeplan --follow-imports=silent
/tmp/homeplan-ha-check/bin/ruff check custom_components/homeplan
```

Optional Chromium checks on the reference Mac (isolated browser profile, synthetic house, loopback servers only):

```sh
HOMEPLAN_HA_BROWSER=1 /tmp/homeplan-ha-check/bin/python scripts/check-ha-storage.py
```

HA's native custom-integration warning, deliberate 401/403 tests and one injected checksum failure are expected during these isolated checks. They never connect to a real HA installation or read/write installation houses.
