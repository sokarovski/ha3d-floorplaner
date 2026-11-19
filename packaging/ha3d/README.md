# Homeplan for Home Assistant

<p align="center">
  <img src="https://sokarovski.github.io/ha3d-floorplaner/screenshots/viewer-night-lights.gif" alt="The demo apartment in the Homeplan viewer at night, its lamps switching on and off and lighting their own rooms." width="720">
</p>

Homeplan shows your home as a 3D model in a Home Assistant sidebar panel, with live lights, devices and room cards. This repository holds only the **Homeplan integration** (domain `homeplan`). The floor builder app, the documentation and the source live in [ha3d-floorplaner](https://github.com/sokarovski/ha3d-floorplaner).

This repository is generated from `ha3d-floorplaner` for each release. Do not open pull requests here; report issues at [ha3d-floorplaner/issues](https://github.com/sokarovski/ha3d-floorplaner/issues).

## Requirements

- Home Assistant 2025.7 or newer. Installing through **Marketplace** needs Home Assistant 2026.11 or newer; older versions use the manual install below.
- A Homeplan floor builder to import a house from: the Homeplan app (**Settings → Apps → Install app**, add the `ha3d-floorplaner` repository) or a builder you run elsewhere. The panel keeps working from its local copy when the builder is stopped.

## Install through Marketplace

1. In Home Assistant open **Settings → Marketplace** and choose **Add from link**. Enter `https://github.com/sokarovski/ha3d` (Marketplace asks you to connect GitHub the first time).
2. Install **Homeplan**.
3. Open **Settings → Devices & services**. If the Homeplan app is running, Homeplan appears under **Discovered**: choose **Add** and confirm. Otherwise choose **Add integration → Homeplan**.

Updates appear in Marketplace. Your houses, bindings and settings are stored outside the integration folder and are kept across updates.

## Install manually

1. Download `homeplan.zip` from the [latest release](https://github.com/sokarovski/ha3d/releases/latest).
2. Create `/config/custom_components/homeplan/` and unzip the archive **into that folder**: the archive holds the integration's files at its top level, so `manifest.json` must end up at `/config/custom_components/homeplan/manifest.json`. To update, replace the folder's contents with the new archive's.
3. Restart Home Assistant, then add the integration as in step 3 above.

## First use

Open **Homeplan** in the sidebar and choose **Setup your home**. When the Homeplan app was discovered, its address is already filled in; otherwise enter your Floor Builder URL. Press **Connect**, then **Use this house**. The full guide is in the [Homeplan documentation](https://github.com/sokarovski/ha3d-floorplaner#readme).

## License

MIT; see [LICENSE](LICENSE). Bundled third-party licenses are listed in `custom_components/homeplan/THIRD_PARTY_NOTICES.md`.
